-- ELSATIA-EXTERNAL-PILOT-FULL-REHEARSAL-V2, incohérence : creer_facture_avancee
-- insère bien l'avoir (type='avoir') mais ne met jamais à jour le statut de la
-- facture créditée (p_facture_origine_id) vers 'avoir_emis' — valeur pourtant
-- présente dans la contrainte check de factures.statut
-- (20260710000006_factures.sql:14) et dans les filtres d'exclusion partout
-- ailleurs (rentabilite.ts, tresorerie/page.tsx, dashboard_indicateurs_bornes,
-- etc.), mais que rien n'écrit jamais. Confirmé par recherche exhaustive :
-- 'avoir_emis' n'apparaît dans aucun UPDATE, migration ou action serveur.
-- Correspond à l'attendu AV-01 de
-- docs/qualification/pilote/ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md
-- (« Créer un avoir sur une facture soldée → Avoir créé, statut facture
-- d'origine avoir_emis »).
--
-- Reprend À L'IDENTIQUE la dernière définition réelle de la fonction
-- (20260922000306_gp_pilot_paiement_avoir_idempotence.sql, elle-même une
-- reprise à l'identique de 20260818000215_avenants_v1_integration_facturation.sql
-- — voir son propre commentaire), en ajoutant uniquement la mise à jour du
-- statut de la facture d'origine, dans la même transaction que la création de
-- l'avoir (si l'insertion de l'avoir échoue plus loin, la mise à jour est
-- annulée avec elle).
create or replace function public.creer_facture_avancee(
 p_entreprise_id uuid,p_devis_id uuid,p_type text,p_pourcentage numeric default 100,p_est_dgd boolean default false,p_facture_origine_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_d public.devis;v_id uuid;v_facteur numeric;v_signe numeric:=1;v_deja_facture numeric;v_montant_nouveau numeric;v_montant_contractuel numeric;v_avoir_existant uuid;
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
   v_montant_contractuel := public.montant_contractuel_devis(p_entreprise_id, p_devis_id);
   v_deja_facture:=public.montant_facture_devis(p_entreprise_id,p_devis_id);
   v_montant_nouveau:=v_d.montant_ht*v_facteur;
   if v_deja_facture+v_montant_nouveau>v_montant_contractuel+0.01 then
     raise exception 'Ce document (%) dépasserait le montant contractuel du devis (avenants compris) : déjà facturé %, montant contractuel %',
       to_char(v_montant_nouveau,'FM999999990.00'),to_char(v_deja_facture,'FM999999990.00'),to_char(v_montant_contractuel,'FM999999990.00');
   end if;
 end if;
 insert into public.factures(entreprise_id,client_id,chantier_id,devis_origine_id,type,statut,avancement_pct,est_dgd,notes_client,facture_origine_id)
 values(p_entreprise_id,v_d.client_id,v_d.chantier_id,v_d.id,p_type,'brouillon',p_pourcentage,coalesce(p_est_dgd,false),v_d.notes_client,case when p_type='avoir' then p_facture_origine_id else null end) returning id into v_id;
 insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
 select v_id,designation,description,type,round(quantite*v_facteur*v_signe,3),unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre
 from public.lignes_devis where devis_id=v_d.id order by ordre;
 -- Correctif : la facture créditée passe en 'avoir_emis' dès la création de
 -- l'avoir (même si celui-ci reste lui-même en 'brouillon' jusqu'à son
 -- propre envoi) — cohérent avec l'index unique anti-doublon ci-dessus, qui
 -- traite déjà tout avoir non annulé (brouillon compris) comme "l'avoir" de
 -- cette facture.
 if p_type='avoir' and p_facture_origine_id is not null then
   update public.factures set statut='avoir_emis' where id=p_facture_origine_id and entreprise_id=p_entreprise_id;
 end if;
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
