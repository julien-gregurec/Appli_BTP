-- GP-EXTERNAL-PILOT-CLOSURE-V1 — ferme les deux trous d'idempotence les plus
-- sérieux identifiés côté métier (hors Stripe) : encaissement facture et
-- création d'avoir.
--
-- ─────────────────────────────────────────────────────────────
-- 1. ENCAISSEMENT (paiements) — course TOCTOU non protégée
-- ─────────────────────────────────────────────────────────────
--
-- enregistrerPaiementAction (src/app/actions/factures.ts) faisait un simple
-- `select` (montant_ttc, montant_paye, statut), une vérification en mémoire
-- ("montant <= reste dû"), puis un `insert` direct — sans `for update`, sans
-- RPC, sans contrainte. Double clic, deux onglets, ou deux utilisateurs
-- réglant la même facture au même moment peuvent chacun lire le même
-- `montant_paye` périmé et passer la vérification indépendamment : le total
-- encaissé peut dépasser `montant_ttc` sans qu'aucune garde ne le bloque
-- avant l'écriture (le trigger `recalc_paiements_apres_paiement` ne fait
-- qu'un constat après coup, il n'empêche rien). C'est exactement le risque
-- déjà corrigé pour les factures/situations dans
-- 20260818000211_paiements_et_anti_surfacturation.sql (verrou `for update`
-- sur la ligne parente avant de comparer un cumul à un plafond) — jamais
-- appliqué ici. Correctif : même pattern, verrou sur `factures`.
create or replace function public.enregistrer_paiement_facture(
  p_entreprise_id uuid,
  p_facture_id uuid,
  p_montant numeric,
  p_date date default current_date,
  p_mode text default 'virement',
  p_reference text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facture public.factures;
  v_reste numeric;
  v_id uuid;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_factures') then
    raise exception 'Accès refusé';
  end if;
  if p_montant is null or p_montant <= 0 then
    raise exception 'Montant invalide';
  end if;

  -- Verrou sur la facture : un deuxième appel concurrent (double clic, deux
  -- onglets, deux utilisateurs) attend la fin de cette transaction avant de
  -- relire montant_paye, qui reflète alors déjà ce paiement-ci.
  select * into v_facture from public.factures
   where id = p_facture_id and entreprise_id = p_entreprise_id
   for update;
  if not found then
    raise exception 'Facture introuvable';
  end if;
  if v_facture.statut in ('brouillon', 'annulee', 'avoir_emis') then
    raise exception 'Un paiement ne peut pas être ajouté à cette facture';
  end if;

  v_reste := greatest(0, v_facture.montant_ttc - v_facture.montant_paye);
  if p_montant > v_reste + 0.005 then
    raise exception 'Le paiement dépasse le reste dû (%)', to_char(v_reste, 'FM999999990.00');
  end if;

  insert into public.paiements (facture_id, montant, date, mode, reference)
  values (p_facture_id, p_montant, coalesce(p_date, current_date), coalesce(nullif(btrim(p_mode), ''), 'virement'), nullif(btrim(p_reference), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enregistrer_paiement_facture(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.enregistrer_paiement_facture(uuid, uuid, numeric, date, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. AVOIR — verrou pris mais règle métier anti-doublon absente
-- ─────────────────────────────────────────────────────────────
--
-- creer_facture_avancee verrouille bien la ligne `devis` (for update) avant
-- toute écriture, mais saute explicitement la vérification de cumul pour
-- type='avoir' (`if p_type<>'avoir' then ... end if`) : rien ne compare un
-- nouvel avoir à ceux déjà émis pour la même facture d'origine. Un double
-- clic sur "Créer un avoir" insère donc deux avoirs intégraux identiques
-- contre la même facture, doublant le crédit accordé au client. Correctif :
-- même pattern que chantiers_devis_source_id_unique (index unique partiel +
-- pré-check applicatif + capture de unique_violation qui résout vers
-- l'existant, jamais une erreur brute).
create unique index if not exists factures_avoir_unique_par_origine
  on public.factures(facture_origine_id)
  where type = 'avoir' and facture_origine_id is not null and statut <> 'annulee';

create or replace function public.creer_facture_avancee(
 p_entreprise_id uuid,p_devis_id uuid,p_type text,p_pourcentage numeric default 100,p_est_dgd boolean default false,p_facture_origine_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_d public.devis;v_id uuid;v_facteur numeric;v_signe numeric:=1;v_deja_facture numeric;v_montant_nouveau numeric;v_avoir_existant uuid;
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
   -- Idempotence applicative (message clair), avant le filet de sécurité de
   -- l'index unique ci-dessus : un deuxième appel identique (double clic,
   -- requêtes concurrentes) résout vers l'avoir déjà créé au lieu d'en
   -- émettre un second.
   select id into v_avoir_existant from public.factures
    where facture_origine_id=p_facture_origine_id and type='avoir' and statut<>'annulee' and entreprise_id=p_entreprise_id;
   if found then
     raise exception 'avoir_existant:%', v_avoir_existant;
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
exception
  when unique_violation then
    select id into v_avoir_existant from public.factures
     where facture_origine_id=p_facture_origine_id and type='avoir' and statut<>'annulee' and entreprise_id=p_entreprise_id;
    raise exception 'avoir_existant:%', v_avoir_existant;
end;$$;

notify pgrst, 'reload schema';
