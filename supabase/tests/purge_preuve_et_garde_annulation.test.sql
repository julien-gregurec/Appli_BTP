-- Couverture pgTAP de la migration 20260923000400_purge_preuve_et_garde_annulation.sql
-- (voir docs/qualification/ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md) :
-- audit append-only (A1), preuve de purge exportable et stable (A2), refus de
-- demander/annuler une suppression dont la purge a commencé (A3), droits service_role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ─────────────────────────────────────────────────────────────
-- Droits : service_role uniquement
-- ─────────────────────────────────────────────────────────────
select isnt(has_function_privilege('authenticated', 'public.preuve_purge_entreprise(uuid)', 'EXECUTE'), true, 'authenticated ne peut pas lire une preuve de purge');
select isnt(has_function_privilege('anon', 'public.preuve_purge_entreprise(uuid)', 'EXECUTE'), true, 'anon ne peut pas lire une preuve de purge');
select isnt(has_function_privilege('authenticated', 'public.purge_entreprise_commencee(uuid)', 'EXECUTE'), true, 'authenticated ne peut pas sonder l''état de purge');
select isnt(has_function_privilege('authenticated', 'public.consigner_planificateur_purge(uuid,uuid,boolean,jsonb)', 'EXECUTE'), true, 'authenticated ne peut pas écrire dans l''audit du planificateur');
select is(has_function_privilege('service_role', 'public.preuve_purge_entreprise(uuid)', 'EXECUTE'), true, 'service_role peut lire une preuve de purge');
select is(has_function_privilege('service_role', 'public.consigner_planificateur_purge(uuid,uuid,boolean,jsonb)', 'EXECUTE'), true, 'service_role peut consigner une décision du planificateur');
select isnt(has_function_privilege('authenticated', 'public.lister_purges_echues(integer)', 'EXECUTE'), true, 'authenticated ne peut pas lister les purges échues');
select is(has_function_privilege('service_role', 'public.lister_purges_echues(integer)', 'EXECUTE'), true, 'service_role peut lister les purges échues');
select is(has_function_privilege('authenticated', 'public.annuler_suppression_entreprise(uuid)', 'EXECUTE'), true, 'annuler_suppression_entreprise reste exécutable par authenticated (droit conservé par CREATE OR REPLACE)');

-- ─────────────────────────────────────────────────────────────
-- Fixture : A (échéance passée), B (aucune suppression)
-- ─────────────────────────────────────────────────────────────
do $$
declare v_a uuid; v_b uuid; v_client_a uuid;
begin
  insert into public.entreprises(nom) values ('PGTAP Preuve Tenant A') returning id into v_a;
  insert into public.entreprises(nom) values ('PGTAP Preuve Tenant B') returning id into v_b;
  insert into public.clients(entreprise_id, nom, email) values (v_a, 'Client A', 'a@test.fr') returning id into v_client_a;
  insert into public.chantiers(entreprise_id, nom, client_id, adresse) values (v_a, 'Chantier A', v_client_a, '1 rue A');
  update public.entreprises set suppression_demandee_at = now() - interval '31 days',
                                suppression_prevue_at = now() - interval '1 second' where id = v_a;
  perform set_config('pgtap.a', v_a::text, true);
  perform set_config('pgtap.b', v_b::text, true);
end $$;

-- Sélection par l'horloge de la base : A (échue) oui, B (aucune échéance) non.
select ok(current_setting('pgtap.a')::uuid in (select id from public.lister_purges_echues(100)), 'lister_purges_echues : A (échue) est listée');
select ok(current_setting('pgtap.b')::uuid not in (select id from public.lister_purges_echues(100)), 'lister_purges_echues : B (aucune échéance) n''est pas listée');

-- Les demandes/annulations exigent a_permission(…, 'gerer_parametres') : on la neutralise
-- pour ce test uniquement (rollback final) afin d'isoler la garde A3 de la mécanique
-- d'appartenance, testée ailleurs.
create or replace function public.a_permission(p_entreprise_id uuid, p_permission text)
returns boolean language sql stable as $$ select true $$;

-- ─────────────────────────────────────────────────────────────
-- Purge commencée : les refus et les tables vides ne comptent pas
-- ─────────────────────────────────────────────────────────────
select is(public.purge_entreprise_commencee(current_setting('pgtap.a')::uuid), false, 'A : purge non commencée au départ');
select is((select ok from public.purger_table_entreprise(current_setting('pgtap.b')::uuid, 'chantiers')), false, 'B : purge refusée (aucune échéance)');
select is(public.purge_entreprise_commencee(current_setting('pgtap.b')::uuid), false, 'B : un refus consigné ne compte pas comme une purge commencée');
select is((select row(ok, lignes_supprimees) from public.purger_table_entreprise(current_setting('pgtap.a')::uuid, 'articles_stock')), row(true, 0)::record, 'A : purge d''une table vide = ok, 0 ligne');
select is(public.purge_entreprise_commencee(current_setting('pgtap.a')::uuid), false, 'A : une table vide purgée (0 ligne) ne compte pas comme une purge commencée');
select lives_ok($$ select public.consigner_planificateur_purge(current_setting('pgtap.a')::uuid, gen_random_uuid(), true, '{"mode":"dry-run"}'::jsonb) $$, 'le planificateur peut consigner une décision');
select is(public.purge_entreprise_commencee(current_setting('pgtap.a')::uuid), false, 'A : une entrée planificateur ne compte pas comme une purge commencée');

-- Tant que rien n'est commencé, l'annulation reste possible (comportement existant).
select lives_ok($$ select public.annuler_suppression_entreprise(current_setting('pgtap.a')::uuid) $$, 'A : annulation possible tant que la purge n''a pas commencé');
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('pgtap.a')::uuid;

-- ─────────────────────────────────────────────────────────────
-- A3 : dès qu'une ligne est réellement supprimée, demander/annuler sont refusés
-- ─────────────────────────────────────────────────────────────
select is((select row(ok, lignes_supprimees) from public.purger_table_entreprise(current_setting('pgtap.a')::uuid, 'chantiers')), row(true, 1)::record, 'A : purge réelle de chantiers (1 ligne)');
select is(public.purge_entreprise_commencee(current_setting('pgtap.a')::uuid), true, 'A : purge commencée après une suppression réelle');
select throws_ok($$ select public.annuler_suppression_entreprise(current_setting('pgtap.a')::uuid) $$,
  'P0001', 'La suppression a déjà commencé : elle ne peut plus être annulée.', 'A3 : annulation refusée en cours de purge');
select isnt((select suppression_prevue_at from public.entreprises where id = current_setting('pgtap.a')::uuid), null, 'A3 : l''échéance est intacte après le refus (la purge peut être terminée)');
select throws_ok($$ select public.demander_suppression_entreprise(current_setting('pgtap.a')::uuid) $$,
  'P0001', 'La suppression de cette entreprise est déjà en cours d''exécution.', 'A3 : nouvelle demande refusée en cours de purge (l''échéance ne peut pas être repoussée)');

-- ─────────────────────────────────────────────────────────────
-- A1 : audit append-only, y compris pour le superutilisateur
-- ─────────────────────────────────────────────────────────────
select throws_ok($$ update platform.purge_audit set ok = true where entreprise_id = current_setting('pgtap.a')::uuid $$, '42501', null, 'A1 : UPDATE de l''audit refusé');
select throws_ok($$ delete from platform.purge_audit where entreprise_id = current_setting('pgtap.a')::uuid $$, '42501', null, 'A1 : DELETE de l''audit refusé');
select throws_ok($$ truncate platform.purge_audit $$, '42501', null, 'A1 : TRUNCATE de l''audit refusé');

-- ─────────────────────────────────────────────────────────────
-- A2 : preuve stable, complète, sensible à toute nouvelle entrée
-- ─────────────────────────────────────────────────────────────
select is(public.preuve_purge_entreprise(current_setting('pgtap.a')::uuid)->>'statut', 'PURGE_COMMENCEE', 'A2 : statut PURGE_COMMENCEE');
select is(public.preuve_purge_entreprise(current_setting('pgtap.a')::uuid)->'tables_purgees'->>'chantiers', '1', 'A2 : la preuve récapitule les lignes réellement supprimées par table');
select matches(public.preuve_purge_entreprise(current_setting('pgtap.a')::uuid)->>'empreinte_audit_sha256', '^[0-9a-f]{64}$', 'A2 : empreinte SHA-256 hexadécimale');
select is(
  (public.preuve_purge_entreprise(current_setting('pgtap.a')::uuid) - 'genere_at'),
  (public.preuve_purge_entreprise(current_setting('pgtap.a')::uuid) - 'genere_at'),
  'A2 : deux lectures successives donnent la même preuve (déterministe hors genere_at)'
);
do $$ begin perform set_config('pgtap.empreinte', public.preuve_purge_entreprise(current_setting('pgtap.a')::uuid)->>'empreinte_audit_sha256', true); end $$;
do $$ begin perform public.consigner_planificateur_purge(current_setting('pgtap.a')::uuid, gen_random_uuid(), false, '{"raison":"test"}'::jsonb); end $$;
select isnt(public.preuve_purge_entreprise(current_setting('pgtap.a')::uuid)->>'empreinte_audit_sha256', current_setting('pgtap.empreinte'), 'A2 : toute nouvelle entrée d''audit change l''empreinte (preuve archivée = état daté)');
select is(public.preuve_purge_entreprise(current_setting('pgtap.b')::uuid)->>'statut', 'AUCUNE_SUPPRESSION', 'A2 : B sans suppression programmée');
select is(public.preuve_purge_entreprise('00000000-0000-0000-0000-000000000000'::uuid)->>'statut', 'ENTREPRISE_INCONNUE', 'A2 : entreprise inconnue signalée, pas d''exception');

-- ─────────────────────────────────────────────────────────────
-- A4 : ré-application de l'échéance depuis une preuve archivée
-- ─────────────────────────────────────────────────────────────
select isnt(has_function_privilege('authenticated', 'public.restaurer_echeance_depuis_preuve(jsonb)', 'EXECUTE'), true, 'A4 : authenticated ne peut pas ré-appliquer une échéance');
-- Simule une base restaurée depuis une sauvegarde antérieure à la demande : B sans échéance.
select throws_ok($$ select public.restaurer_echeance_depuis_preuve(jsonb_build_object('format','elsatia.preuve_purge.v1','statut','PURGE_COMMENCEE','entreprise_id',current_setting('pgtap.b'),'suppression_prevue_at',now() - interval '1 day')) $$,
  'P0001', null, 'A4 : une preuve non PURGEE est refusée');
select throws_ok($$ select public.restaurer_echeance_depuis_preuve(jsonb_build_object('format','elsatia.preuve_purge.v1','statut','PURGEE','entreprise_id',current_setting('pgtap.b'),'suppression_prevue_at','pas-une-date')) $$,
  'P0001', 'Preuve refusee : identifiant ou dates illisibles', 'A4 : mauvaise date dans la preuve refusée');
select throws_ok($$ select public.restaurer_echeance_depuis_preuve(jsonb_build_object('format','elsatia.preuve_purge.v1','statut','PURGEE','entreprise_id',current_setting('pgtap.b'),'suppression_prevue_at',now() + interval '1 day')) $$,
  'P0001', null, 'A4 : échéance future dans la preuve refusée');
select lives_ok($$ select public.restaurer_echeance_depuis_preuve(jsonb_build_object('format','elsatia.preuve_purge.v1','statut','PURGEE','entreprise_id',current_setting('pgtap.b'),'suppression_demandee_at',now() - interval '31 days','suppression_prevue_at',now() - interval '1 day','empreinte_audit_sha256','abc')) $$,
  'A4 : une preuve PURGEE cohérente ré-applique l''échéance');
select throws_ok($$ select public.restaurer_echeance_depuis_preuve(jsonb_build_object('format','elsatia.preuve_purge.v1','statut','PURGEE','entreprise_id',current_setting('pgtap.b'),'suppression_prevue_at',now() - interval '1 day')) $$,
  'P0001', null, 'A4 : idempotence — une seconde application sur une entreprise qui porte déjà une échéance est refusée');

-- ─────────────────────────────────────────────────────────────
-- F9 : archives immuables des notes de frais classées RETAIN (plus jamais bloquantes)
-- ─────────────────────────────────────────────────────────────
insert into public.journal_audit_notes_frais(entreprise_id, action, ressource_type, empreinte_evenement)
values (current_setting('pgtap.a')::uuid, 'creation', 'note_frais', repeat('a', 64));
select is((select categorie from public.rapport_purge_entreprise(current_setting('pgtap.a')::uuid) where table_nom = 'journal_audit_notes_frais'), 'RETAIN', 'F9 : journal_audit_notes_frais (immuable) est RETAIN');
select ok('validations_notes_frais' = any(public.tables_conservees_purge()), 'F9 : validations_notes_frais (immuable) est RETAIN');
select is((select count(*)::int from public.rapport_purge_entreprise(current_setting('pgtap.a')::uuid) r
            join pg_trigger t on t.tgrelid = ('public.' || r.table_nom)::regclass
           where r.categorie = 'DELETE' and not t.tgisinternal and t.tgfoid = 'public.trg_refuser_mutation_archive'::regproc), 0,
  'F9 : aucune table DELETE de A ne porte un trigger d''archive immuable');

select * from finish();
rollback;
