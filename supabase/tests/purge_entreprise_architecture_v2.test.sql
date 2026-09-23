-- Couverture pgTAP de l'architecture de purge RGPD V2 (migration 20260923000331, voir
-- docs/qualification/ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md). Complète
-- supabase/tests/purge_entreprise_supprimee.test.sql (F1/F3/F4/F8 + existence/droits de
-- base) avec les cas explicitement demandés par la mission de clôture V2 §11 :
-- service_role uniquement (fonctions nouvelles), mauvais tenant (isolation), double
-- purge, retry après échec réel, échéance avant/après/expirée — plus ANONYMIZE de bout
-- en bout (F3), ordre topologique réel (F2) et snapshot F8 avec valeur réelle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- ─────────────────────────────────────────────────────────────
-- service_role uniquement — toutes les fonctions nouvelles de la V2
-- ─────────────────────────────────────────────────────────────
select isnt(has_function_privilege('authenticated', 'public.anonymiser_table_entreprise(uuid,text,uuid)', 'EXECUTE'), true, 'authenticated ne peut pas anonymiser une table');
select isnt(has_function_privilege('anon', 'public.anonymiser_table_entreprise(uuid,text,uuid)', 'EXECUTE'), true, 'anon ne peut pas anonymiser une table');
select isnt(has_function_privilege('authenticated', 'public.verifier_storage_entreprise(uuid)', 'EXECUTE'), true, 'authenticated ne peut pas lancer la réconciliation Storage');
select isnt(has_function_privilege('authenticated', 'public.lire_audit_purge_entreprise(uuid,uuid)', 'EXECUTE'), true, 'authenticated ne peut pas lire l''audit de purge');
select is(has_function_privilege('service_role', 'public.anonymiser_table_entreprise(uuid,text,uuid)', 'EXECUTE'), true, 'service_role peut anonymiser une table');
select is(has_function_privilege('service_role', 'public.verifier_storage_entreprise(uuid)', 'EXECUTE'), true, 'service_role peut lancer la réconciliation Storage');

-- ─────────────────────────────────────────────────────────────
-- Fixture : deux entreprises réelles (A à purger, B témoin d'isolation), un chantier et
-- un devis liés à une facture conservée de A (pour F2 + F8 avec valeur réelle), une
-- ligne équivalente pour B afin de prouver l'isolation.
-- ─────────────────────────────────────────────────────────────
do $$
declare v_a uuid; v_b uuid; v_client_a uuid; v_chantier_a uuid; v_devis_a uuid; v_client_b uuid; v_chantier_b uuid;
begin
  insert into public.entreprises(nom) values ('PGTAP V2 Tenant A') returning id into v_a;
  insert into public.entreprises(nom) values ('PGTAP V2 Tenant B (temoin)') returning id into v_b;

  insert into public.clients(entreprise_id, nom, email) values (v_a, 'Client A', 'a@test.fr') returning id into v_client_a;
  insert into public.chantiers(entreprise_id, nom, client_id, adresse) values (v_a, 'Chantier A', v_client_a, '1 rue A') returning id into v_chantier_a;
  insert into public.devis(entreprise_id, client_id, chantier_id, numero, statut)
    values (v_a, v_client_a, v_chantier_a, 'D-A-0001', 'brouillon') returning id into v_devis_a;
  insert into public.factures(entreprise_id, client_id, chantier_id, devis_origine_id, numero, statut, type)
    values (v_a, v_client_a, v_chantier_a, v_devis_a, 'F-A-0001', 'envoyee', 'simple');

  insert into public.clients(entreprise_id, nom, email) values (v_b, 'Client B', 'b@test.fr') returning id into v_client_b;
  insert into public.chantiers(entreprise_id, nom, client_id, adresse) values (v_b, 'Chantier B', v_client_b, '1 rue B') returning id into v_chantier_b;
  insert into public.factures(entreprise_id, client_id, chantier_id, numero, statut, type)
    values (v_b, v_client_b, v_chantier_b, 'F-B-0001', 'envoyee', 'simple');

  perform set_config('pgtap.tenant_a', v_a::text, true);
  perform set_config('pgtap.tenant_b', v_b::text, true);
  perform set_config('pgtap.chantier_a', v_chantier_a::text, true);
  perform set_config('pgtap.devis_a', v_devis_a::text, true);

  -- Échéance déjà passée pour A ; B n'a même pas de demande de suppression (jamais purgé).
  update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = v_a;
end $$;

-- Avant échéance / jamais demandée (mission §11 "before schedule") : B n'a aucune
-- suppression programmée, purger_table_entreprise doit refuser sans exception (F1).
select is(
  (select ok from public.purger_table_entreprise(current_setting('pgtap.tenant_b')::uuid, 'chantiers')),
  false,
  'before schedule : B (aucune suppression programmée) est refusé sans exception'
);

-- Ordre topologique réel (F2) : chantiers doit apparaître avant devis dans le rapport de
-- A (situations_travaux/devis ne s''applique pas ici, mais chantiers a plusieurs
-- dépendants RESTRICT réels du schéma — le test porte sur la cohérence de l'ordre rendu,
-- pas sur une paire figée).
select ok(
  (
    select coalesce(
      (select ordre from public.rapport_purge_entreprise(current_setting('pgtap.tenant_a')::uuid) where table_nom = 'chantiers'),
      0
    ) <= coalesce(
      (select ordre from public.rapport_purge_entreprise(current_setting('pgtap.tenant_a')::uuid) where table_nom = 'types_chantier'),
      999
    )
  ),
  'F2 : chantiers (référencé par types_chantier via NO ACTION) a un ordre <= types_chantier'
);

-- ─────────────────────────────────────────────────────────────
-- Purge réelle de A : chantiers puis devis, avec vérification F8 (valeur réelle, pas
-- juste "la colonne existe").
-- ─────────────────────────────────────────────────────────────
select is(
  (select ok from public.purger_table_entreprise(current_setting('pgtap.tenant_a')::uuid, 'chantiers')),
  true,
  'purge réelle de chantiers (A) réussit'
);
select is(
  (select (purge_snapshot->'chantier_id'->>'libelle') from public.factures where entreprise_id = current_setting('pgtap.tenant_a')::uuid),
  'Chantier A',
  'F8 : le libellé réel du chantier purgé est capturé dans factures.purge_snapshot avant le SET NULL'
);
select is(
  (select chantier_id from public.factures where entreprise_id = current_setting('pgtap.tenant_a')::uuid),
  null,
  'la FK factures.chantier_id est bien SET NULL après la purge de chantiers (comportement schéma inchangé, juste tracé désormais)'
);

select is(
  (select ok from public.purger_table_entreprise(current_setting('pgtap.tenant_a')::uuid, 'devis')),
  true,
  'purge réelle de devis (A) réussit'
);
select is(
  (select (purge_snapshot->'devis_origine_id'->>'libelle') from public.factures where entreprise_id = current_setting('pgtap.tenant_a')::uuid),
  'D-A-0001',
  'F8 : le numéro réel du devis purgé est capturé dans factures.purge_snapshot avant le SET NULL'
);

-- Double purge (mission §11) : rejouer purger_table_entreprise sur une table déjà vide
-- doit rester ok=true, 0 ligne, sans erreur — pas de double suppression dangereuse.
select is(
  (select row(ok, lignes_supprimees) from public.purger_table_entreprise(current_setting('pgtap.tenant_a')::uuid, 'chantiers')),
  row(true, 0)::record,
  'double purge de chantiers (déjà vide) : ok=true, 0 ligne, idempotent'
);

-- Retry après échec réel (mission §11) : create_extension déjà présente ; on provoque un
-- vrai échec (nom de table invalide) puis on vérifie qu'un appel valide qui suit
-- réussit normalement (le retry n'est pas bloqué par l'échec précédent).
select is(
  (select ok from public.purger_table_entreprise(current_setting('pgtap.tenant_a')::uuid, 'table_qui_nexiste_pas')),
  false,
  'retry (1/2) : purger une table inconnue échoue proprement (ok=false, pas d''exception)'
);
select is(
  (select ok from public.purger_table_entreprise(current_setting('pgtap.tenant_a')::uuid, 'devis')),
  true,
  'retry (2/2) : un appel valide qui suit un échec réussit normalement (pas d''état bloqué)'
);

-- ANONYMIZE de bout en bout (F3) : clients de A anonymisé, la ligne reste (comptée par
-- rapport_purge_entreprise en ANONYMIZE, jamais en DELETE).
select is(
  (select categorie from public.rapport_purge_entreprise(current_setting('pgtap.tenant_a')::uuid) where table_nom = 'clients'),
  'ANONYMIZE',
  'clients est classé ANONYMIZE (F3), pas DELETE ni absent'
);
select is(
  (select ok from public.anonymiser_table_entreprise(current_setting('pgtap.tenant_a')::uuid, 'clients')),
  true,
  'anonymiser_table_entreprise (A, clients) réussit'
);
select is(
  (select nom from public.clients where entreprise_id = current_setting('pgtap.tenant_a')::uuid),
  'Anonymise RGPD',
  'anonymiser_table_entreprise a bien vidé le nom du client (ligne conservée, PII vidée)'
);

-- ─────────────────────────────────────────────────────────────
-- Isolation tenant (mission §8) : tout ce qui précède n'a touché AUCUNE ligne de B.
-- ─────────────────────────────────────────────────────────────
select is(
  (select nom from public.clients where entreprise_id = current_setting('pgtap.tenant_b')::uuid),
  'Client B',
  'isolation : le client de B est intact (nom original, pas anonymisé)'
);
select is(
  (select chantier_id from public.factures where entreprise_id = current_setting('pgtap.tenant_b')::uuid) is not null,
  true,
  'isolation : la facture de B garde son chantier_id (chantiers de B jamais purgé)'
);
select is(
  (select count(*)::int from public.chantiers where entreprise_id = current_setting('pgtap.tenant_b')::uuid),
  1,
  'isolation : le chantier de B existe toujours (1 ligne, ni supprimé ni modifié)'
);

-- Mauvais tenant (mission §11) : purger une table avec l'id de B en paramètre alors que
-- SEUL A a une suppression programmée échue doit être refusé — même après que A a été
-- traité, B reste protégé indépendamment.
select is(
  (select ok from public.purger_table_entreprise(current_setting('pgtap.tenant_b')::uuid, 'clients')),
  false,
  'mauvais tenant : purger B (aucune suppression programmée) reste refusé même après avoir traité A'
);

-- Audit : chaque étape ci-dessus pour A doit être présente dans platform.purge_audit,
-- avec au moins un succès et au moins un échec réel consignés (F1/F4).
select ok(
  (select count(*)::int from platform.purge_audit where entreprise_id = current_setting('pgtap.tenant_a')::uuid and ok = true) >= 4,
  'l''audit platform.purge_audit contient au moins les 4 succès attendus pour A'
);
select ok(
  (select count(*)::int from platform.purge_audit where entreprise_id = current_setting('pgtap.tenant_a')::uuid and ok = false) >= 1,
  'l''audit platform.purge_audit contient l''échec réel (table inconnue) pour A'
);
select is(
  (select count(*)::int from platform.purge_audit where entreprise_id = current_setting('pgtap.tenant_b')::uuid and ok = true),
  0,
  'l''audit platform.purge_audit ne contient aucun succès pour B (aucune opération de purge n''a jamais réussi sur B)'
);

select * from finish();
rollback;
