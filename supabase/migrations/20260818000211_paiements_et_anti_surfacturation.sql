-- FACTURATION-BTP-V1B — P0 n°1 (paiements) et P0 n°2+3 (anti-surfacturation).
--
-- P0 n°1 : la table paiements n'avait aucun GRANT pour authenticated (ni pour
-- service_role au-dela de REFERENCES/TRIGGER/TRUNCATE) — oubli de la migration
-- 20260729000189_restaurer_privileges_modules_metier.sql, qui ne restaure que
-- devis/factures. enregistrerPaiementAction echouait donc systematiquement
-- (42501 permission denied), quel que soit l'utilisateur ou l'environnement.
grant select, insert, update, delete on table public.paiements to authenticated;
revoke all on table public.paiements from anon;

-- P0 n°2+3 : source canonique unique du montant deja facture sur un devis,
-- utilisee par les trois RPC de creation de facture pour eviter toute
-- sur-facturation, quelle que soit la combinaison de mecanismes utilisee
-- (classique, acompte, situation, finale). Un avoir a un montant_ht deja
-- negatif (ses lignes portent une quantite negative, voir creer_facture_avancee
-- et recalc_totaux_facture) : l'inclure dans une simple somme le soustrait donc
-- deja correctement, sans traitement de signe supplementaire. Les brouillons
-- sont volontairement inclus (statut<>'annulee') : c'etait deja le comportement
-- de creer_facture_avancee avant ce lot, et l'exclure rouvrirait exactement le
-- P0 n°3 (plusieurs brouillons crees en parallele, jamais additionnes entre eux
-- avant leur envoi). Fonction interne uniquement (jamais appelee directement
-- par un client, seulement par d'autres RPC security definer) : revoquee de
-- authenticated/anon pour ne pas devenir un oracle de chiffre d'affaires
-- cross-tenant (elle ne verifie pas elle-meme la permission de l'appelant).
create or replace function public.montant_facture_devis(p_entreprise_id uuid, p_devis_id uuid)
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(montant_ht), 0)
  from public.factures
  where devis_origine_id = p_devis_id
    and entreprise_id = p_entreprise_id
    and statut <> 'annulee';
$$;
revoke all on function public.montant_facture_devis(uuid, uuid) from public, anon, authenticated;

-- creer_situation_travaux : ajoute le garde-fou manquant identifie par
-- l'audit — la RPC ne verifiait que le cumul des situations precedentes,
-- jamais les acomptes/finales/factures classiques deja emis sur le meme
-- devis. Verrouille la ligne devis (for update) pour serialiser les appels
-- concurrents sur le meme devis avec les deux autres RPC ci-dessous, qui
-- verrouillent la meme ligne : un deuxieme appel simultane attend que le
-- premier valide (ou annule) avant de relire le montant deja facture.
create or replace function public.creer_situation_travaux(
 p_entreprise_id uuid,p_devis_id uuid,p_avancement_pct numeric,
 p_retenue_garantie_pct numeric default 0,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_devis public.devis;v_id uuid;v_numero integer;v_precedent numeric:=0;v_cumule numeric;v_periode numeric;v_deja_facture numeric;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 if p_avancement_pct<=0 or p_avancement_pct>100 then raise exception 'Avancement invalide';end if;
 if coalesce(p_retenue_garantie_pct,0)<0 or coalesce(p_retenue_garantie_pct,0)>20 then raise exception 'Retenue de garantie invalide';end if;
 select * into v_devis from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='accepte' for update;
 if not found then raise exception 'Le devis doit être accepté';end if;
 if v_devis.chantier_id is null then raise exception 'Un chantier doit être associé au devis';end if;
 select coalesce(max(ls.avancement_cumule_pct),0) into v_precedent
 from public.situations_travaux s join public.lignes_situations ls on ls.situation_id=s.id
 where s.entreprise_id=p_entreprise_id and s.devis_id=p_devis_id and s.statut<>'annulee';
 if p_avancement_pct<=v_precedent then raise exception 'L''avancement doit être supérieur au cumul précédent (%)',v_precedent;end if;
 v_cumule:=round(v_devis.montant_ht*p_avancement_pct/100,2);v_periode:=round(v_devis.montant_ht*(p_avancement_pct-v_precedent)/100,2);
 v_deja_facture:=public.montant_facture_devis(p_entreprise_id,p_devis_id);
 if v_deja_facture+v_periode>v_devis.montant_ht+0.01 then
   raise exception 'Cette situation dépasserait le montant total autorisé pour ce devis : déjà facturé %, devis %',
     to_char(v_deja_facture,'FM999999990.00'),to_char(v_devis.montant_ht,'FM999999990.00');
 end if;
 select coalesce(max(numero),0)+1 into v_numero from public.situations_travaux where entreprise_id=p_entreprise_id and devis_id=p_devis_id;
 insert into public.situations_travaux(entreprise_id,devis_id,chantier_id,numero,retenue_garantie_pct,montant_marche_ht,montant_cumule_ht,montant_periode_ht,montant_retenue,notes)
 values(p_entreprise_id,p_devis_id,v_devis.chantier_id,v_numero,coalesce(p_retenue_garantie_pct,0),v_devis.montant_ht,v_cumule,v_periode,round(v_periode*coalesce(p_retenue_garantie_pct,0)/100,2),nullif(btrim(p_notes),'')) returning id into v_id;
 insert into public.lignes_situations(entreprise_id,situation_id,ligne_devis_id,avancement_precedent_pct,avancement_cumule_pct,montant_periode_ht)
 select p_entreprise_id,v_id,l.id,v_precedent,p_avancement_pct,
  round(((l.quantite*l.prix_unitaire_ht)*(1-l.remise_ligne/100))*(p_avancement_pct-v_precedent)/100,2)
 from public.lignes_devis l where l.devis_id=p_devis_id;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'creation','situation_travaux',v_id,'Situation d''avancement créée',jsonb_build_object('devis_id',p_devis_id,'avancement_pct',p_avancement_pct));
 return v_id;
end;$$;

-- creer_facture_avancee : remplace le calcul inline de "deja facture" par la
-- source canonique, pour ne plus dupliquer la logique entre les deux RPC.
-- Comportement inchange pour acompte/finale/avoir (memes verifications, meme
-- message d'erreur) ; verrouille desormais aussi la ligne devis (for update).
create or replace function public.creer_facture_avancee(
 p_entreprise_id uuid,p_devis_id uuid,p_type text,p_pourcentage numeric default 100,p_est_dgd boolean default false,p_facture_origine_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_d public.devis;v_id uuid;v_facteur numeric;v_signe numeric:=1;v_deja_facture numeric;v_montant_nouveau numeric;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 if p_type not in('acompte','avoir','finale') then raise exception 'Type de facture invalide';end if;
 if p_pourcentage<=0 or p_pourcentage>100 then raise exception 'Pourcentage invalide';end if;
 select * into v_d from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='accepte' for update;
 if not found then raise exception 'Le devis doit être accepté';end if;
 v_facteur:=p_pourcentage/100;if p_type='avoir' then v_signe:=-1;end if;
 if p_type='avoir' and p_facture_origine_id is not null then
   if not exists(select 1 from public.factures where id=p_facture_origine_id and entreprise_id=p_entreprise_id and devis_origine_id=p_devis_id and type<>'avoir') then
     raise exception 'La facture créditée doit appartenir au même devis et ne peut pas être elle-même un avoir';
   end if;
 end if;
 if p_type<>'avoir' then
   v_deja_facture:=public.montant_facture_devis(p_entreprise_id,p_devis_id);
   v_montant_nouveau:=v_d.montant_ht*v_facteur;
   if v_deja_facture+v_montant_nouveau>v_d.montant_ht+0.01 then
     raise exception 'Ce document (%) dépasserait le montant du devis : déjà facturé %, devis %',
       to_char(v_montant_nouveau,'FM999999990.00'),to_char(v_deja_facture,'FM999999990.00'),to_char(v_d.montant_ht,'FM999999990.00');
   end if;
 end if;
 insert into public.factures(entreprise_id,client_id,chantier_id,devis_origine_id,type,statut,avancement_pct,est_dgd,notes_client,facture_origine_id)
 values(p_entreprise_id,v_d.client_id,v_d.chantier_id,v_d.id,p_type,'brouillon',p_pourcentage,coalesce(p_est_dgd,false),v_d.notes_client,case when p_type='avoir' then p_facture_origine_id else null end) returning id into v_id;
 insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
 select v_id,designation,description,type,round(quantite*v_facteur*v_signe,3),unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre
 from public.lignes_devis where devis_id=v_d.id order by ordre;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'creation','facture',v_id,'Document de facturation avancée créé',jsonb_build_object('type',p_type,'pourcentage',p_pourcentage,'dgd',p_est_dgd,'facture_origine_id',p_facture_origine_id));
 return v_id;
end;$$;

-- creer_facture_depuis_devis (facture classique) : ajoute le garde-fou qui
-- manquait entierement, et restaure security definer + la verification
-- explicite de tenance (perdue dans une version anterieure de cette RPC,
-- signale comme fragile par l'audit — elle etait grant a anon sans defense
-- en profondeur, en pratique protegee uniquement par l'absence de GRANT de
-- base sur devis/factures pour anon). Verrouille la ligne devis (for update)
-- pour la meme raison de concurrence que les deux RPC ci-dessus. Si le devis
-- porte deja un montant facture (par n'importe quel mecanisme : acompte,
-- situation, finale, ou une autre facture classique), une nouvelle facture
-- complete est refusee — l'utilisateur doit alors utiliser un acompte, une
-- situation ou une facture finale/solde selon le cas.
create or replace function public.creer_facture_depuis_devis(p_devis_id uuid, p_type text default 'simple')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devis public.devis;
  v_facture_id uuid;
  v_delai integer := 30;
  v_deja_facture numeric;
begin
  select * into v_devis from public.devis where id = p_devis_id for update;
  if not found then raise exception 'Devis introuvable'; end if;
  if not public.est_membre_actif(v_devis.entreprise_id) then raise exception 'Accès refusé'; end if;
  if v_devis.statut <> 'accepte' then raise exception 'Le devis doit etre accepte avant facturation'; end if;
  if v_devis.client_id is null then raise exception 'Le devis doit etre rattache a un client'; end if;

  v_deja_facture := public.montant_facture_devis(v_devis.entreprise_id, p_devis_id);
  if v_deja_facture > 0.01 then
    raise exception 'Ce devis est déjà facturé, au moins en partie (déjà % €) : utilisez une facture de solde/finale ou une situation plutôt qu''une nouvelle facture complète.', to_char(v_deja_facture,'FM999999990.00');
  end if;

  select delai_paiement_jours into v_delai
  from public.clients
  where id = v_devis.client_id and entreprise_id = v_devis.entreprise_id;
  if not found then raise exception 'Client du devis introuvable'; end if;

  insert into public.factures (
    entreprise_id, client_id, chantier_id, devis_origine_id, type,
    date_echeance, notes_client
  ) values (
    v_devis.entreprise_id, v_devis.client_id, v_devis.chantier_id,
    p_devis_id, p_type, current_date + coalesce(v_delai, 30), v_devis.notes_client
  ) returning id into v_facture_id;

  insert into public.lignes_factures (
    facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select v_facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  from public.lignes_devis where devis_id = p_devis_id order by ordre;

  return v_facture_id;
end;
$$;

revoke all on function public.creer_facture_depuis_devis(uuid, text) from public, anon;
grant execute on function public.creer_facture_depuis_devis(uuid, text) to authenticated;

notify pgrst, 'reload schema';
