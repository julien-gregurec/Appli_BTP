-- RGPD — dette technique résiduelle V1 (migration 20260927000507).
-- Rapport : docs/qualification/ELSATIA_RGPD_PURGE_RESIDUAL_DEBT_CLOSURE_V1.md
--
--   1. Structure : colonnes, contrainte, triggers, aucun droit applicatif sur les fonctions.
--   2. RD-2 capture : identité figée par la base à la sortie du brouillon, champs imprimés
--      seulement (ni contact, ni e-mail, ni téléphone, ni notes), brouillon sans identité.
--   3. RD-2 immutabilité : fiche fournisseur / entreprise modifiée → identité figée
--      inchangée ; toute écriture des colonnes refusée (tenant, SQL direct) ; valeur forgée
--      par la requête ignorée ; contrainte brouillon ⇔ pas d'identité.
--   4. RD-2 RGPD : identité dans le document complet (empreinte), absente de l'instantané
--      minimisé de purge ; restituée par l'export.
--   5. RD-1 : hors purge, PL-03 inchangé (modification et suppression historisées).
--   6. RD-1 : purge incomplète (politique contrats livrée) → 0 ligne d'historique en un seul
--      passage ; le second passage ne supprime plus rien ; tenant B intact.
--   7. RD-1 : purge complète (politique activée, durée de TEST) → 0 ligne, marquée, un
--      nouveau passage ne supprime rien ; historique du tenant B toujours alimenté.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc
\ir fixtures/rgpd_tenant_contrats_acceptes.inc
\ir fixtures/rgpd_tenant_commandes_fournisseurs.inc

select set_config('t.a', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('t.b', 'b0000000-0000-0000-0000-000000000001', true);

-- ─── 1. Structure ──────────────────────────────────────────────────────
select has_column('public', 'commandes_fournisseurs', 'fournisseur_snapshot', 'colonne fournisseur_snapshot');
select has_column('public', 'commandes_fournisseurs', 'entreprise_snapshot', 'colonne entreprise_snapshot');
select has_trigger('public', 'commandes_fournisseurs', 'capturer_identite_commande_fournisseur', 'trigger de capture');
select ok(exists (select 1 from pg_constraint where conname = 'commandes_fournisseurs_identite_figee_check'), 'contrainte brouillon ⇔ pas d''identité figée');
select is(
  (select count(*)::integer from pg_proc p, unnest(array['anon', 'authenticated', 'service_role']) r(role)
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('_etape_purge_en_cours', 'construire_fournisseur_snapshot_commande', 'capturer_identite_commande_fournisseur')
      and has_function_privilege(r.role, p.oid, 'execute')),
  0, 'aucun rôle applicatif n''exécute les fonctions RD-1/RD-2');

-- ─── 2. RD-2 : capture ────────────────────────────────────────────────
select ok((select fournisseur_snapshot is null and entreprise_snapshot is null and identite_provenance is null
             from public.commandes_fournisseurs where id = current_setting('rgpd.cf_brouillon')::uuid),
  'brouillon : aucune identité figée');
select is(
  (select count(*)::integer from public.commandes_fournisseurs
    where entreprise_id = current_setting('t.a')::uuid and statut <> 'brouillon' and identite_provenance = 'envoi'),
  4, 'confirmée, reçue, partielle, annulée : identité figée à l''envoi (4/4)');
select is(
  (select fournisseur_snapshot - 'fournisseur_id' from public.commandes_fournisseurs where id = current_setting('rgpd.cf_recue')::uuid),
  '{"version":1,"nom":"Négoce Matériaux Rhin","adresse":"5 quai des Bateliers","code_postal":"67000","ville":"Strasbourg","siret":"98765432100017"}'::jsonb,
  'destinataire figé : exactement les champs imprimés');
select ok(
  not exists (select 1 from public.commandes_fournisseurs c, unnest(array['Sophie Keller', 'sophie.keller', '0388112233', '0612345678', 'contact_nom', 'email', 'telephone', 'notes']) v
               where c.entreprise_id = current_setting('t.a')::uuid and c.fournisseur_snapshot::text like '%' || v || '%'),
  'minimisation : ni contact, ni e-mail, ni téléphone, ni notes du fournisseur');
select is(
  (select entreprise_snapshot from public.commandes_fournisseurs where id = current_setting('rgpd.cf_recue')::uuid),
  public.construire_entreprise_snapshot(current_setting('t.a')::uuid),
  'émetteur figé : même en-tête que devis/factures (construire_entreprise_snapshot)');
select is(public.construire_fournisseur_snapshot_commande('d1000000-0000-0000-0000-000000000001', current_setting('t.b')::uuid), null,
  'jamais l''identité d''un fournisseur d''une autre entreprise');

-- ─── 3. RD-2 : immutabilité ────────────────────────────────────────────
create temporary table _identites_avant on commit drop as
select id, fournisseur_snapshot, entreprise_snapshot, identite_figee_le, identite_provenance
  from public.commandes_fournisseurs where entreprise_id = current_setting('t.a')::uuid and statut <> 'brouillon';
grant select on _identites_avant to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
-- Le fournisseur change de nom, d'adresse et de SIRET ; l'entreprise aussi.
update public.fournisseurs set nom = 'Nouveau Nom SAS', adresse = '99 rue Nouvelle', code_postal = '68000', ville = 'Autreville', siret = '99999999900099'
 where id = 'd1000000-0000-0000-0000-000000000001';
reset role;
update public.entreprises set adresse = '2 rue Déménagée', siret = '22222222200022' where id = current_setting('t.a')::uuid;
select is((select nom from public.fournisseurs where id = 'd1000000-0000-0000-0000-000000000001'), 'Nouveau Nom SAS', 'fiche fournisseur modifiée');
select is(
  (select count(*)::integer from _identites_avant a join public.commandes_fournisseurs c using (id)
    where (c.fournisseur_snapshot, c.entreprise_snapshot, c.identite_figee_le, c.identite_provenance)
          is not distinct from (a.fournisseur_snapshot, a.entreprise_snapshot, a.identite_figee_le, a.identite_provenance)),
  4, 'commandes envoyées/reçues : identité figée inchangée après modification des fiches (4/4)');
select is((select fournisseur_snapshot ->> 'nom' from public.commandes_fournisseurs where id = current_setting('rgpd.cf_recue')::uuid),
  'Négoce Matériaux Rhin', 'bon historique : toujours l''ancien nom');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(format($$update public.commandes_fournisseurs set fournisseur_snapshot = '{"nom":"Faux"}' where id = %L$$, current_setting('rgpd.cf_recue')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'administrateur du tenant : identité figée non modifiable (reçue)');
select throws_ok(format($$update public.commandes_fournisseurs set entreprise_snapshot = null where id = %L$$, current_setting('rgpd.cf_confirmee')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'administrateur du tenant : émetteur figé non modifiable (confirmée)');
select throws_ok(format($$update public.commandes_fournisseurs set identite_provenance = 'reconstituee' where id = %L$$, current_setting('rgpd.cf_annulee')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'administrateur du tenant : provenance non modifiable (annulée)');
-- Valeur forgée par la requête : ignorée (brouillon) puis recalculée par la base (envoi).
select set_config('rgpd.cf_forgee', public.creer_commande_fournisseur(current_setting('t.a')::uuid,
  '{"fournisseur_id":"d1000000-0000-0000-0000-000000000001"}'::jsonb,
  '[{"designation":"Colle","quantite":2,"unite":"u","prix_unitaire_ht":10,"taux_tva":20,"ordre":1}]'::jsonb)::text, true);
update public.commandes_fournisseurs set fournisseur_snapshot = '{"nom":"Forgé"}', identite_provenance = 'envoi'
 where id = current_setting('rgpd.cf_forgee')::uuid;
reset role;
select ok((select fournisseur_snapshot is null and identite_provenance is null from public.commandes_fournisseurs where id = current_setting('rgpd.cf_forgee')::uuid),
  'brouillon : identité forgée par la requête effacée');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.commandes_fournisseurs set statut = 'envoyee', fournisseur_snapshot = '{"nom":"Forgé"}', identite_provenance = 'reconstituee'
 where id = current_setting('rgpd.cf_forgee')::uuid;
reset role;
select is((select fournisseur_snapshot ->> 'nom' || '/' || identite_provenance from public.commandes_fournisseurs where id = current_setting('rgpd.cf_forgee')::uuid),
  'Nouveau Nom SAS/envoi', 'envoi : identité calculée par la base (fiche courante au moment de l''envoi), valeur forgée ignorée');

select throws_ok(format($$update public.commandes_fournisseurs set fournisseur_snapshot = '{}' where id = %L$$, current_setting('rgpd.cf_recue')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'SQL direct (propriétaire) : identité figée non modifiable');
set local session_replication_role = replica;
select throws_ok(format($$update public.commandes_fournisseurs set fournisseur_snapshot = null where id = %L$$, current_setting('rgpd.cf_recue')),
  '23514', null, 'triggers suspendus : la contrainte refuse encore une commande envoyée sans identité');
select throws_ok(format($$update public.commandes_fournisseurs set fournisseur_snapshot = '{}' where id = %L$$, current_setting('rgpd.cf_brouillon')),
  '23514', null, 'triggers suspendus : la contrainte refuse encore un brouillon avec identité');
set local session_replication_role = origin;

-- ─── 4. RD-2 : RGPD ────────────────────────────────────────────────────
select ok(public._document_commande_fournisseur(current_setting('rgpd.cf_recue')::uuid) ->> 'fournisseur_snapshot' like '%98765432100017%',
  'document complet (empreinte de purge) : contient l''identité imprimée');
select ok(public._commande_minimisee(public._document_commande_fournisseur(current_setting('rgpd.cf_recue')::uuid))::text
          !~ '(Négoce|Bateliers|98765432100017|fournisseur_snapshot|entreprise_snapshot)',
  'instantané minimisé de purge : ni identité fournisseur ni en-tête (liste blanche inchangée)');
select ok(public.exporter_donnees_entreprise(current_setting('t.a')::uuid)::text like '%fournisseur_snapshot%',
  'export RGPD : identité figée restituée');

-- ─── 5. RD-1 : PL-03 inchangé hors purge ──────────────────────────────
alter table public.affectations disable trigger notifications_affectations;
insert into public.affectations (id, entreprise_id, chantier_id, employe_id, date, heures, tache) values
  ('a3070000-0000-0000-0000-000000000001', current_setting('t.a')::uuid, 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', current_date + 1, 7, 'Coffrage'),
  ('a3070000-0000-0000-0000-000000000002', current_setting('t.a')::uuid, 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', current_date + 1, 7, 'Suivi'),
  ('a3070000-0000-0000-0000-000000000003', current_setting('t.a')::uuid, 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000004', current_date + 2, 7, 'Réception'),
  ('a3070000-0000-0000-0000-000000000004', current_setting('t.a')::uuid, 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', current_date + 3, 7, 'Dépôt'),
  ('b3070000-0000-0000-0000-000000000001', current_setting('t.b')::uuid, 'b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', current_date + 1, 7, 'B');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.affectations set heures = 4 where id = 'a3070000-0000-0000-0000-000000000001';
delete from public.affectations where id = 'a3070000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
update public.affectations set tache = 'B modifiée' where id = 'b3070000-0000-0000-0000-000000000001';
reset role;
select is((select string_agg(operation, ',' order by operation) from public.affectations_historique where entreprise_id = current_setting('t.a')::uuid),
  'modification,suppression', 'hors purge : modification et suppression directe historisées (PL-03)');
select is((select count(*)::integer from public.affectations_historique where entreprise_id = current_setting('t.b')::uuid), 1, 'tenant B : 1 ligne d''historique');

-- ─── 6. RD-1 : purge incomplète en un seul passage ────────────────────
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.a')::uuid;
select set_config('rgpd.entreprise_cible', current_setting('t.a'), true);
select set_config('rgpd.run_id', 'd9950000-0000-0000-0000-000000000001', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis',
  'politique contrats livrée : purge incomplète, seules les tables contrats restent (inchangé)');
select is((select count(*)::integer from public.affectations where entreprise_id = current_setting('t.a')::uuid), 0, 'affectations du tenant supprimées');
select is((select count(*)::integer from public.affectations_historique where entreprise_id = current_setting('t.a')::uuid), 0,
  'UN passage : aucune ligne d''historique restante (ni ancienne, ni recréée par la purge)');
select is(
  (select count(*)::integer from public.rapport_purge_entreprise(current_setting('t.a')::uuid) r
    where r.categorie = 'DELETE' and r.table_nom not in ('avenants', 'lignes_devis', 'pieces_jointes_devis', 'chantiers', 'devis')),
  0, 'rapport : plus aucune table DELETE non vide hors tables contrats');
select is((select count(*)::integer from platform.purge_audit
             where run_id = 'd9950000-0000-0000-0000-000000000001' and table_nom = 'affectations_historique' and ok and lignes_affectees > 0),
  1, 'l''historique existant (2 lignes) est purgé une seule fois, par son étape');
select is((select count(*)::integer from platform.purge_autorisations_facture), 0, 'aucune autorisation de purge résiduelle (contexte RD-1 borné à l''étape)');
select is((select count(*)::integer from public.affectations_historique where entreprise_id = current_setting('t.b')::uuid), 1, 'tenant B : historique intact');
select is((select count(*)::integer from public.affectations where entreprise_id = current_setting('t.b')::uuid), 1, 'tenant B : affectation intacte');

create temporary table _etat_apres_1 on commit drop as
select r.table_nom, r.categorie, r.nb_lignes from public.rapport_purge_entreprise(current_setting('t.a')::uuid) r;
grant select on _etat_apres_1 to service_role;
select set_config('rgpd.run_id', 'd9950000-0000-0000-0000-000000000002', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis', 'second passage : même résultat');
select is((select count(*)::integer from platform.purge_audit
             where run_id = 'd9950000-0000-0000-0000-000000000002' and etape = 'purge_table' and ok and lignes_affectees > 0),
  0, 'second passage : AUCUNE ligne supprimée (le rejeu n''est plus nécessaire)');
select is(
  (select count(*)::integer from (
     (select * from _etat_apres_1 except select r.table_nom, r.categorie, r.nb_lignes from public.rapport_purge_entreprise(current_setting('t.a')::uuid) r)
     union all
     (select r.table_nom, r.categorie, r.nb_lignes from public.rapport_purge_entreprise(current_setting('t.a')::uuid) r except select * from _etat_apres_1)) d),
  0, 'second passage : état identique au premier (idempotent)');

-- Historique des autres tables : une étape de purge qui échoue ne perd pas son rollback.
select ok((select count(*) from public.commandes_fournisseurs where entreprise_id = current_setting('t.a')::uuid) = 0
          and (select count(*) from platform.commandes_fournisseurs_purgees where entreprise_id = current_setting('t.a')::uuid) >= 3,
  'commandes supprimées après instantané (…506 inchangé)');

-- ─── 7. RD-1 : purge complète ─────────────────────────────────────────
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'QUALIF-RD-V1-DUREE-DE-TEST', interval '10 years', false);
select set_config('rgpd.run_id', 'd9950000-0000-0000-0000-000000000003', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'complete', 'politique activée (durée de TEST) : purge complète');
select ok((select purgee_at is not null from public.entreprises where id = current_setting('t.a')::uuid), 'entreprise marquée purgée');
select is((select count(*)::integer from public.rapport_purge_entreprise(current_setting('t.a')::uuid) where categorie = 'DELETE'), 0,
  'aucune table DELETE non vide');
select is((select count(*)::integer from public.affectations_historique where entreprise_id = current_setting('t.a')::uuid), 0, 'aucun historique d''affectation');
select is((select count(*)::integer from platform.purge_audit
             where run_id = 'd9950000-0000-0000-0000-000000000003' and table_nom = 'affectations_historique'),
  0, 'purge complète : l''historique n''a jamais eu à être rattrapé');

select set_config('rgpd.run_id', 'd9950000-0000-0000-0000-000000000004', true);
\ir fixtures/rgpd_purge_driver.inc
select is((select coalesce(string_agg(table_nom || '=' || lignes_affectees, ','), 'aucune') from platform.purge_audit
             where run_id = 'd9950000-0000-0000-0000-000000000004' and etape = 'purge_table' and ok and lignes_affectees > 0),
  'aucune', 'passage suivant sur une entreprise purgée : aucune ligne supprimée (l''anonymisation, idempotente, se rejoue à l''identique)');

-- PL-03 toujours actif pour les autres tenants après la purge.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
update public.affectations set heures = 5 where id = 'b3070000-0000-0000-0000-000000000001';
reset role;
select is((select count(*)::integer from public.affectations_historique where entreprise_id = current_setting('t.b')::uuid), 2,
  'tenant B : historique toujours alimenté hors purge');
select is((select count(*)::integer from public.commandes_fournisseurs where entreprise_id = current_setting('t.b')::uuid and identite_provenance = 'envoi'), 1,
  'tenant B : commande confirmée, identité figée intacte');
select ok((select fournisseur_snapshot ->> 'nom' = 'Fournisseur B' from public.commandes_fournisseurs where id = current_setting('rgpd.cf_b')::uuid),
  'tenant B : destinataire figé = son propre fournisseur');

select * from finish();
rollback;
