-- Nettoyage COMPLET de l'entreprise pilote synthétique (et uniquement elle) créée par
-- seed_entreprise_pilote_btp.sql. Script destructif (DELETE), whitelisté avec confirmation
-- obligatoire dans scripts/garde-scripts-production.mjs — voir supabase/production/README.md.
-- Exécution : CONFIRM_DELETE_TEST_DATA=YES node scripts/executer-script-production.mjs cleanup_entreprise_pilote_btp.sql
--
-- Cible exclusivement l'entreprise reference_interne='PILOTE-BTP-V1' ('SARL Bati-Rhone
-- Construction'), ses salariés/comptes utilisateurs, et toutes les données synthétiques
-- rattachées, par reference_interne/numero/marqueur '[PILOTE]' — jamais une autre entreprise,
-- jamais un DELETE global sur une table entière.
--
-- POURQUOI CE SCRIPT N'EST PAS UN SIMPLE "DELETE FROM entreprises ... CASCADE" :
-- vérifié par dry-run local (voir ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md, §6/§14/§15) :
--   1. Un devis accepté (verrou_devis_accepte) et une facture émise (verrouiller_facture_emise,
--      lignes_factures_brouillon_only, verrou_lignes_devis_accepte) sont volontairement
--      IMMUABLES en écriture ET en suppression, y compris via une suppression en cascade
--      depuis l'entreprise parente — comportement produit réel, pas une limite du seed.
--      Sans désactivation ciblée de ces 4 triggers, la suppression échoue avec l'erreur
--      métier « Ce devis est accepté et ne peut plus être supprimé. » (ou l'équivalent pour
--      les lignes de facture émise).
--   2. `session_replication_role = replica` (la façon usuelle de contourner des triggers en
--      bloc) a été testée et REJETÉE : elle désactive aussi les triggers système qui
--      implémentent les suppressions en cascade des clés étrangères, laissant des lignes
--      orphelines. Ce script désactive donc individuellement, par nom, uniquement les 4
--      triggers métier concernés — jamais l'intégrité référentielle elle-même.
--   3. Un trigger de cache dashboard (trg_maj_cache_dashboard_devis) réécrit
--      entreprises_dashboard_cache à chaque suppression de devis/facture : il exige que la
--      ligne entreprises existe encore au moment de la suppression. D'où l'ORDRE STRICT
--      ci-dessous : toutes les tables filles sont supprimées explicitement AVANT
--      l'entreprise elle-même (jamais par cascade automatique).
--   4. utilisateurs.entreprise_active_id n'est pas en cascade depuis entreprises (référence
--      inverse) : il doit être mis à null avant de pouvoir supprimer l'entreprise.
--   5. Les comptes utilisateurs (auth.users/public.utilisateurs) créés par le seed sont
--      supprimés en DERNIER (après les tables qui les référencent en RESTRICT, notamment
--      demandes_conges.created_by) : la suppression de auth.users cascade automatiquement
--      vers public.utilisateurs et public.utilisateurs_entreprises.
--
-- Testé de bout en bout (seed → cleanup → re-seed propre) sur PostgreSQL 16 local avec les
-- 313 migrations réelles rejouées (environnement de revue indépendante, pas Preview).

set statement_timeout='5min';

do $cleanup_garde$
declare
  v_entreprise uuid;
  v_autres_entreprises_pilote integer;
begin
  select id into v_entreprise from public.entreprises where reference_interne='PILOTE-BTP-V1';
  if v_entreprise is null then
    raise notice 'Aucune entreprise PILOTE-BTP-V1 trouvée : rien à nettoyer.';
    return;
  end if;

  -- Garde-fou : refuse si le nom ne correspond pas exactement à celui attendu (sécurité
  -- par ID + nom, même principe que supprimer_entreprises_test.sql).
  if not exists(
    select 1 from public.entreprises
    where id=v_entreprise and btrim(nom)='SARL Bati-Rhone Construction'
  ) then
    raise exception 'Sécurité : entreprise PILOTE-BTP-V1 trouvée mais nom inattendu, arrêt sans suppression';
  end if;

  select count(*) into v_autres_entreprises_pilote
  from public.entreprises where reference_interne like 'PILOTE-%' and id<>v_entreprise;
  if v_autres_entreprises_pilote > 0 then
    raise exception 'Sécurité : % autre(s) entreprise(s) avec un reference_interne PILOTE-%% inattendu(es), arrêt sans suppression', v_autres_entreprises_pilote;
  end if;
end;
$cleanup_garde$;

-- Rien à supprimer : le bloc précédent a déjà tout vérifié ; s'il n'y avait pas
-- d'entreprise PILOTE-BTP-V1, les DELETE ci-dessous portent sur des ensembles vides
-- (idempotent, aucune erreur).

alter table public.devis disable trigger verrou_devis_accepte;
alter table public.factures disable trigger verrou_facture_emise;
alter table public.lignes_factures disable trigger lignes_factures_brouillon_only;
alter table public.lignes_devis disable trigger verrou_lignes_devis_accepte;

do $cleanup$
declare
  v_entreprise uuid;
begin
  select id into v_entreprise from public.entreprises where reference_interne='PILOTE-BTP-V1';
  if v_entreprise is null then
    return;
  end if;

  update public.utilisateurs set entreprise_active_id=null where entreprise_active_id=v_entreprise;

  delete from public.paiements where facture_id in (select id from public.factures where entreprise_id=v_entreprise and numero like 'FAC-PILOTE-%');
  delete from public.lignes_factures where facture_id in (select id from public.factures where entreprise_id=v_entreprise and numero like 'FAC-PILOTE-%');
  delete from public.factures where entreprise_id=v_entreprise and numero like 'FAC-PILOTE-%';
  delete from public.lignes_devis where devis_id in (select id from public.devis where entreprise_id=v_entreprise and numero like 'DEV-PILOTE-%');
  delete from public.devis where entreprise_id=v_entreprise and numero like 'DEV-PILOTE-%';

  delete from public.reglements_fournisseurs where depense_id in (select id from public.depenses_fournisseurs where entreprise_id=v_entreprise and numero_piece like 'ACH-PILOTE-%');
  delete from public.depenses_fournisseurs where entreprise_id=v_entreprise and numero_piece like 'ACH-PILOTE-%';
  delete from public.lignes_commande where commande_id in (select id from public.commandes_fournisseurs where entreprise_id=v_entreprise and numero like 'CMD-PILOTE-%');
  delete from public.commandes_fournisseurs where entreprise_id=v_entreprise and numero like 'CMD-PILOTE-%';

  delete from public.mouvements_stock where entreprise_id=v_entreprise and motif like '[PILOTE]%';
  delete from public.articles_stock where entreprise_id=v_entreprise and reference like 'PILOTE-STK-%';
  delete from public.fournisseurs where entreprise_id=v_entreprise and reference like 'PILOTE-FRN-%';

  delete from public.pointages where entreprise_id=v_entreprise and tache like '[PILOTE]%';
  delete from public.affectations where entreprise_id=v_entreprise and tache like '[PILOTE]%';

  delete from public.notes_frais where entreprise_id=v_entreprise and commentaire_salarie like '[PILOTE]%';
  delete from public.demandes_conges where entreprise_id=v_entreprise and commentaire like '[PILOTE]%';

  delete from public.equipes_chantiers where entreprise_id=v_entreprise and note like '[PILOTE]%';
  delete from public.habilitations_employe where entreprise_id=v_entreprise and libelle like '[PILOTE]%';
  delete from public.employes_cout_horaire where entreprise_id=v_entreprise;

  delete from public.chantiers where entreprise_id=v_entreprise and reference_interne like 'PILOTE-CHA-%';
  delete from public.clients where entreprise_id=v_entreprise and reference_interne like 'PILOTE-CLI-%';

  delete from public.utilisateurs_entreprises where entreprise_id=v_entreprise;
  delete from public.employes where entreprise_id=v_entreprise and reference_interne like 'PILOTE-EMP-%';

  delete from public.permissions_poste where entreprise_id=v_entreprise;
  delete from public.postes where entreprise_id=v_entreprise;
  delete from public.historique_capacite_personnes where entreprise_id=v_entreprise;

  delete from public.entreprises where id=v_entreprise;

  -- Comptes utilisateurs créés par le seed (même UUID que la fiche employé, domaine
  -- @example.test exclusivement) : supprimés en dernier, cascade vers
  -- public.utilisateurs/utilisateurs_entreprises.
  delete from auth.users where email like 'pilote.%@example.test';
end;
$cleanup$;

alter table public.devis enable trigger verrou_devis_accepte;
alter table public.factures enable trigger verrou_facture_emise;
alter table public.lignes_factures enable trigger lignes_factures_brouillon_only;
alter table public.lignes_devis enable trigger verrou_lignes_devis_accepte;

-- Vérification finale : aucune trace ne doit subsister.
do $verif$
declare v_reste integer;
begin
  select count(*) into v_reste from public.entreprises where reference_interne='PILOTE-BTP-V1';
  if v_reste <> 0 then
    raise exception 'Nettoyage incomplet : entreprise PILOTE-BTP-V1 toujours présente';
  end if;
  select count(*) into v_reste from auth.users where email like 'pilote.%@example.test';
  if v_reste <> 0 then
    raise exception 'Nettoyage incomplet : % compte(s) utilisateur pilote encore présent(s)', v_reste;
  end if;
end;
$verif$;

select 'PILOTE-BTP-V1 nettoyée' as resultat;
