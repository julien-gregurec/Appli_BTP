-- RGPD — export des données, portabilité et droit d'accès V1 (migration 20260929000101).
-- Rapport : docs/qualification/ELSATIA_RGPD_DATA_EXPORT_PORTABILITY_V1.md
--
-- Inventaire (garde : toute table non classée fait échouer), droits d'exécution, séparation des
-- deux exports, IDOR, usurpation d'organisation et de personne, mésusage de la clé service,
-- session d'assistance, chemins Storage hors tenant et fichiers absents, complétude décidée en
-- base, bail / reprise après interruption / rejeu, téléchargement borné, expiration, journal.
begin;
create extension if not exists pgtap with schema extensions;
select plan(89);

\ir fixtures/isolation_multitenant.inc

-- Compléments : un fichier empoisonné (ligne de A pointant un objet de B), un fichier absent, un
-- justificatif de note de frais (OWN_DATA de l'ouvrier A), une photo de pointage (bucket exclu de
-- l'export entreprise par politique, inclus dans l'export individuel), un code d'accès (secret).
insert into public.documents_chantier (id, entreprise_id, chantier_id, nom, storage_path, mime_type, taille_octets, audience) values
  ('a7000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
   'Empoisonné', 'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/confidentiel.pdf', 'application/pdf', 10, 'gestionnaires'),
  ('a7000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
   'Absent', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/perdu.pdf', 'application/pdf', 10, 'gestionnaires'),
  ('a7000000-0000-0000-0000-0000000000f3', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
   'Traversée', 'a0000000-0000-0000-0000-000000000001/../b0000000-0000-0000-0000-000000000001/plan.pdf', 'application/pdf', 10, 'gestionnaires');
update public.pointages set photo_storage_path = 'a0000000-0000-0000-0000-000000000001/a5000000-0000-0000-0000-000000000001.jpg'
 where id = 'a5000000-0000-0000-0000-000000000001';
insert into storage.objects (bucket_id, name, metadata) values
  ('chantier-documents', 'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/confidentiel.pdf', '{"size": 10}'),
  ('pointage-preuves', 'a0000000-0000-0000-0000-000000000001/a5000000-0000-0000-0000-000000000001.jpg', '{"size": 42, "mimetype": "image/jpeg"}');
insert into public.codes_acces (entreprise_id, code, statut) values ('a0000000-0000-0000-0000-000000000001', 'TEST_SECRET_CODE_A', 'actif');
update public.employes set code_stock_hash = 'TEST_EMPREINTE_SECRETE' where id = 'a2000000-0000-0000-0000-000000000002';
-- L'ouvrier A a aussi une ancienne adhésion (révoquée) chez B : jamais couverte par son export.
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values ('10000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'desactive');

create temporary table _j (nom text primary key, id uuid, bail uuid, tentative integer) on commit drop;
grant all on _j to authenticated, service_role;

-- ── 1. Inventaire et droits ─────────────────────────────────────────────────────────────────
select is((select count(*)::integer from information_schema.tables t
            where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
              and not exists (select 1 from platform.rgpd_export_catalogue c where c.table_nom = t.table_name)),
  0, 'inventaire : toute table public est classée dans le catalogue d''export');
select is((select count(*)::integer from platform.rgpd_export_catalogue c
            where to_regclass('public.' || quote_ident(c.table_nom)) is null),
  0, 'inventaire : aucune entrée de catalogue orpheline');
select is((select count(*)::integer from platform.rgpd_export_catalogue_fichiers f
            where not exists (select 1 from information_schema.columns c where c.table_schema = 'public'
                              and c.table_name = f.table_nom and c.column_name = f.colonne_chemin)),
  0, 'inventaire : chaque colonne de chemin Storage cataloguée existe');
select is((select count(*)::integer from information_schema.columns c
            where c.table_schema = 'public' and c.column_name ~ 'storage_path$'
              and not exists (select 1 from platform.rgpd_export_catalogue_fichiers f
                               where f.table_nom = c.table_name and f.colonne_chemin = c.column_name)
              and (select k.categorie from platform.rgpd_export_catalogue k where k.table_nom = c.table_name) <> 'EXCLU'),
  0, 'inventaire : toute colonne *_storage_path exportée figure au manifeste');
select is((select count(*)::integer from platform.rgpd_export_catalogue
            where predicat_utilisateur is not null and categorie not in ('OWN_DATA', 'SHARED')),
  0, 'classification : aucun THIRD_PARTY ni BUSINESS_DATA dans l''export individuel');
select throws_ok(
  $$insert into platform.rgpd_export_catalogue (table_nom, application, domaine, categorie, predicat_entreprise, predicat_utilisateur, raison)
    values ('x_test', 'gestion_pro', 'test', 'THIRD_PARTY', 'x.entreprise_id = $1', 'x.u = $2', 'test')$$,
  '23514', null, 'classification : contrainte — une donnée de tiers ne peut pas entrer dans un export individuel');
select is((select count(*)::integer from platform.rgpd_export_catalogue where table_nom like 'studio\_%' and categorie <> 'EXCLU'),
  0, 'Studio : aucune table studio_* du projet partagé n''est lue (projet dédié, contrat inter-projets)');
select ok(not exists (select 1 from information_schema.role_table_grants g
            where g.table_schema = 'platform' and g.table_name like 'rgpd\_export\_%'
              and g.grantee in ('anon', 'authenticated', 'service_role', 'public')),
  'droits : aucune table platform.rgpd_export_* accessible par anon / authenticated / service_role');
select ok(not exists (select 1 from pg_proc p where p.proname like 'rgpd\_export\_%'
            and p.pronamespace in ('public'::regnamespace, 'platform'::regnamespace)
            and p.prosecdef and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  'droits : toute fonction SECURITY DEFINER d''export fixe son search_path');
select ok(not has_function_privilege('anon', p.oid, 'execute'), 'anon ne peut pas exécuter ' || p.proname)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('rgpd_export_demander', 'rgpd_export_autoriser_telechargement', 'rgpd_export_reclamer');
select ok(not has_function_privilege('authenticated', 'public.rgpd_export_materialiser(uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.rgpd_export_reclamer()', 'execute')
      and not has_function_privilege('authenticated', 'public.rgpd_export_page(uuid, uuid, text, bigint, integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.rgpd_export_terminer(uuid, uuid, text, text, bigint, boolean, jsonb)', 'execute'),
  'droits : un utilisateur ne peut pas piloter le worker (réclamer, matérialiser, lire, terminer)');
select ok(not has_function_privilege('service_role', 'public.rgpd_export_demander(text, uuid, text)', 'execute')
      and not has_function_privilege('service_role', 'public.rgpd_export_autoriser_telechargement(uuid)', 'execute'),
  'clé service : ne peut ni demander un export ni autoriser un téléchargement (aucune entreprise arbitraire)');
select ok((select not public from storage.buckets where id = 'rgpd-exports')
      and not exists (select 1 from pg_policies where schemaname = 'storage' and coalesce(qual, '') || coalesce(with_check, '') like '%rgpd-exports%'),
  'stockage : bucket rgpd-exports privé, aucune policy client');

-- ── 2. Demandes : refus ─────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.rgpd_export_demander('ENTREPRISE', 'a0000000-0000-0000-0000-000000000001', 'org-spoof-b-0001') ->> 'code',
  'NON_AUTORISE', 'org spoof : l''administrateur de B ne peut pas demander l''export de A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(public.rgpd_export_demander('ENTREPRISE', 'a0000000-0000-0000-0000-000000000001', 'ouvrier-a-ent-0001') ->> 'code',
  'NON_AUTORISE', 'droit : un membre sans gerer_parametres ne peut pas exporter l''entreprise');
select is(public.rgpd_export_demander('UTILISATEUR', 'b0000000-0000-0000-0000-000000000001', 'ouvrier-a-mix-0001') ->> 'code',
  'ENTREPRISE_INTERDITE_EXPORT_UTILISATEUR', 'droits non mélangés : un export individuel ne porte jamais d''entreprise');
select is(public.rgpd_export_demander('ENTREPRISE', null, 'ouvrier-a-null-0001') ->> 'code', 'ENTREPRISE_REQUISE', 'export entreprise sans entreprise refusé');
select is(public.rgpd_export_demander('TOUT', null, 'ouvrier-a-type-0001') ->> 'code', 'TYPE_INVALIDE', 'type inconnu refusé');
select is(public.rgpd_export_demander('UTILISATEUR', null, 'x') ->> 'code', 'CLE_INVALIDE', 'clé d''idempotence invalide refusée');
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
reset role;
insert into public.plateforme_acces_entreprises (plateforme_user_id, entreprise_id, motif, commence_at, expire_at)
values ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Test assistance export', now() - interval '1 minute', now() + interval '1 hour');
set local role authenticated;
select ok(public.est_acces_support_actif('a0000000-0000-0000-0000-000000000001'), 'témoin : la session d''assistance plateforme est active sur A');
select is(public.rgpd_export_demander('ENTREPRISE', 'a0000000-0000-0000-0000-000000000001', 'support-a-0001') ->> 'code',
  'SESSION_ASSISTANCE_INTERDITE', 'assistance : une session support ne peut pas exporter les données du client');
select throws_ok($$select public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001')$$, '42501', null,
  'assistance : l''export synchrone historique est aussi refusé à une session support (correctif)');
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"c0000000-0000-0000-0000-000000000001"}', true);
reset role;
insert into public.sessions_revoquees (session_id, utilisateur_id, entreprise_id) values
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
set local role authenticated;
select is(public.rgpd_export_demander('ENTREPRISE', 'a0000000-0000-0000-0000-000000000001', 'revoquee-a-0001') ->> 'code',
  'SESSION_REVOQUEE', 'session révoquée : demande refusée');
reset role;
select is((select count(*)::integer from platform.rgpd_export_jobs), 0, 'aucun refus n''a créé de job');
select is((select count(*)::integer from platform.rgpd_export_evenements where action = 'refused' and job_id is null), 8,
  'chaque refus est journalisé, sans rattachement à l''entreprise visée');
select ok(not exists (select 1 from platform.rgpd_export_evenements where detail::text like '%a0000000%'),
  'journal des refus : l''entreprise visée n''apparaît pas');

-- ── 3. Demandes valides, idempotence ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into _j (nom, id) select 'ent_a', (public.rgpd_export_demander('ENTREPRISE', 'a0000000-0000-0000-0000-000000000001', 'admin-a-ent-0001') ->> 'job_id')::uuid;
select is((public.rgpd_export_demander('ENTREPRISE', 'a0000000-0000-0000-0000-000000000001', 'admin-a-ent-0001') ->> 'job_id')::uuid,
  (select id from _j where nom = 'ent_a'), 'idempotence : même clé → même job');
select is((public.rgpd_export_demander('ENTREPRISE', 'a0000000-0000-0000-0000-000000000001', 'admin-a-ent-0002') ->> 'job_id')::uuid,
  (select id from _j where nom = 'ent_a'), 'idempotence : autre clé pendant un export en cours → même job (aucun doublon)');
select is(public.rgpd_export_demander('UTILISATEUR', null, 'admin-a-ent-0001') ->> 'code', 'CLE_DEJA_UTILISEE',
  'idempotence : une clé ne peut pas être réutilisée pour un autre périmètre');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into _j (nom, id) select 'usr_ouvrier', (public.rgpd_export_demander('UTILISATEUR', null, 'ouvrier-a-usr-0001') ->> 'job_id')::uuid;
select is((select count(*)::integer from public.rgpd_export_mes_demandes()), 1, 'mes demandes : l''ouvrier ne voit que son export');
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.rgpd_export_mes_demandes()), 0, 'mes demandes : B ne voit aucun export de A');
select throws_ok($$select * from platform.rgpd_export_jobs$$, '42501', null, 'lecture directe des jobs refusée à un utilisateur');
reset role;
select is((select demandeur_id from platform.rgpd_export_jobs where id = (select id from _j where nom = 'usr_ouvrier')),
  '10000000-0000-0000-0000-000000000002'::uuid, 'user spoof : le sujet d''un export individuel est toujours auth.uid() (aucun paramètre)');
select throws_ok($$insert into platform.rgpd_export_jobs (type_export, demandeur_id, entreprise_id, cle_idempotence)
    values ('ENTREPRISE', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'course-parallele-01')$$,
  '23505', null, 'concurrence : un second export en cours pour le même périmètre est impossible (index unique)');
select ok(exists (select 1 from public.journal_activite where action = 'export_rgpd_demande'
            and entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 'audit métier : la demande d''export entreprise figure au journal d''activité');

-- ── 4. Worker : bail, matérialisation, contenu ─────────────────────────────────────────────
set local role service_role;
select throws_ok($$select public.rgpd_export_demander('ENTREPRISE', 'a0000000-0000-0000-0000-000000000001', 'service-role-0001')$$,
  '42501', null, 'clé service : appel direct de la demande refusé');
update _j set bail = r.bail, tentative = r.tentative from public.rgpd_export_reclamer() r where _j.id = r.job_id;
update _j set bail = r.bail, tentative = r.tentative from public.rgpd_export_reclamer() r where _j.id = r.job_id;
select is((select count(*)::integer from _j where bail is not null), 2, 'réclamation : deux jobs pris, un bail chacun');
select is((select count(*)::integer from public.rgpd_export_reclamer()), 0, 'réclamation : un job sous bail n''est pas repris');
select throws_ok(format($$select public.rgpd_export_materialiser(%L, gen_random_uuid())$$, (select id from _j where nom = 'ent_a')),
  '55P03', null, 'bail : matérialisation refusée sans le bon jeton');
select is(public.rgpd_export_materialiser(id, bail) ->> 'statut', 'RUNNING', 'matérialisation de l''export de A') from _j where nom = 'ent_a';
reset role;
select ok(exists (select 1 from platform.rgpd_export_lignes l join _j on _j.id = l.job_id and _j.nom = 'ent_a'
                   where l.section = 'clients' and l.ligne ->> 'nom' = 'TEST_A_Client secret'), 'export A : clients de A présents');
select ok(not exists (select 1 from platform.rgpd_export_lignes l join _j on _j.id = l.job_id and _j.nom = 'ent_a'
                   where (l.ligne::text like '%TEST_B_%' or l.ligne::text like '%b0000000-0000-0000-0000-000000000001%')
                     and l.ligne ->> 'id' not in ('a7000000-0000-0000-0000-0000000000f1', 'a7000000-0000-0000-0000-0000000000f3')),
  'cross-tenant : aucune ligne ni identifiant de B dans l''export de A (hors les 2 chemins empoisonnés injectés)');
select ok(exists (select 1 from platform.rgpd_export_lignes l join _j on _j.id = l.job_id and _j.nom = 'ent_a' where l.section = 'contacts_clients')
          or not exists (select 1 from public.contacts_clients c join public.clients k on k.id = c.client_id where k.entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  'export A : tables enfants couvertes');
select ok(not exists (select 1 from platform.rgpd_export_lignes l join _j on _j.id = l.job_id and _j.nom = 'ent_a'
                   where l.ligne::text like '%TEST_SECRET_CODE_A%' or l.ligne::text like '%TEST_EMPREINTE_SECRETE%' or l.ligne ? 'encrypted_password'),
  'minimisation : codes d''accès, empreintes et secrets jamais exportés');
select ok(not exists (select 1 from platform.rgpd_export_sections s join _j on _j.id = s.job_id and _j.nom = 'ent_a'
                   where s.table_nom in ('abonnement_evenements', 'plateforme_admins', 'rate_limits_applicatifs', 'studio_projects', 'elsatia_identity_subjects')),
  'exclusions : tables techniques, plateforme et Studio partagé absentes');
select is((select count(*)::integer from platform.rgpd_export_sections s join _j on _j.id = s.job_id and _j.nom = 'ent_a'),
  (select count(*)::integer from platform.rgpd_export_catalogue where predicat_entreprise is not null),
  'export A : une section par table cataloguée (vide comprise)');
select ok(not exists (select 1 from platform.rgpd_export_lignes l join _j on _j.id = l.job_id and _j.nom = 'ent_a'
                   where l.section = 'utilisateurs' and l.ligne ? 'entreprise_active_id'),
  'minimisation : l''entreprise active d''un membre (autre organisation possible) n''est pas exportée');
select is((select statut from platform.rgpd_export_fichiers f join _j on _j.id = f.job_id and _j.nom = 'ent_a' where f.ligne_id = 'a7000000-0000-0000-0000-0000000000f1'),
  'HORS_TENANT', 'storage : une ligne de A pointant un fichier de B est HORS_TENANT (jamais téléchargée)');
select is((select statut from platform.rgpd_export_fichiers f join _j on _j.id = f.job_id and _j.nom = 'ent_a' where f.ligne_id = 'a7000000-0000-0000-0000-0000000000f3'),
  'HORS_TENANT', 'storage : chemin avec « .. » refusé');
select is((select statut from platform.rgpd_export_fichiers f join _j on _j.id = f.job_id and _j.nom = 'ent_a' where f.ligne_id = 'a7000000-0000-0000-0000-0000000000f2'),
  'ABSENT', 'storage : fichier référencé mais absent du stockage → ABSENT');
select is((select statut from platform.rgpd_export_fichiers f join _j on _j.id = f.job_id and _j.nom = 'ent_a' where f.ligne_id = 'a7000000-0000-0000-0000-000000000001'),
  'A_INCLURE', 'storage : fichier présent du tenant → A_INCLURE');
select is((select statut from platform.rgpd_export_fichiers f join _j on _j.id = f.job_id and _j.nom = 'ent_a' where f.bucket = 'pointage-preuves'),
  'EXCLU_POLITIQUE', 'politique : preuves de pointage exclues de l''export entreprise (décision antérieure conservée)');

-- Export individuel de l'ouvrier A.
set local role service_role;
select is(public.rgpd_export_materialiser(id, bail) ->> 'statut', 'RUNNING', 'matérialisation de l''export de l''ouvrier A') from _j where nom = 'usr_ouvrier';
reset role;
select is((select array_agg(l.ligne ->> 'id' order by l.ligne ->> 'id') from platform.rgpd_export_lignes l join _j on _j.id = l.job_id and _j.nom = 'usr_ouvrier'
            where l.section like '%/pointages'), array['a5000000-0000-0000-0000-000000000001'],
  'export individuel : uniquement SES pointages (pas ceux de l''administrateur)');
select ok(not exists (select 1 from platform.rgpd_export_sections s join _j on _j.id = s.job_id and _j.nom = 'usr_ouvrier'
                   where s.categorie in ('THIRD_PARTY', 'BUSINESS_DATA')),
  'export individuel : aucune section de tiers ni de données métier');
select ok(not exists (select 1 from platform.rgpd_export_lignes l join _j on _j.id = l.job_id and _j.nom = 'usr_ouvrier'
                   where l.ligne::text like '%TEST_A_Message%' or l.ligne::text like '%TEST_A_Client%'),
  'export individuel : ni les messages d''autrui ni les clients');
select ok(not exists (select 1 from platform.rgpd_export_sections s join _j on _j.id = s.job_id and _j.nom = 'usr_ouvrier'
                   where s.entreprise_id = 'b0000000-0000-0000-0000-000000000001'),
  'export individuel : ancienne adhésion révoquée (B) non couverte');
select ok((select resume -> 'perimetre_utilisateur' @> '[{"entreprise_id":"b0000000-0000-0000-0000-000000000001","couvert":false}]'
             from platform.rgpd_export_jobs where id = (select id from _j where nom = 'usr_ouvrier')),
  'export individuel : l''adhésion non couverte est signalée dans le résumé');
select ok((select l.ligne ? 'email' and not l.ligne ? 'encrypted_password' from platform.rgpd_export_lignes l
             join _j on _j.id = l.job_id and _j.nom = 'usr_ouvrier' where l.section = 'global/compte'),
  'export individuel : identité du compte sans secret d''authentification');
select is((select statut from platform.rgpd_export_fichiers f join _j on _j.id = f.job_id and _j.nom = 'usr_ouvrier' where f.bucket = 'pointage-preuves'),
  'A_INCLURE', 'export individuel : sa propre photo de pointage est incluse (OWN_DATA)');
set local role service_role;
select is((select count(*)::integer from public.rgpd_export_page((select id from _j where nom = 'ent_a'), (select bail from _j where nom = 'ent_a'), 'clients', 0, 2)),
  2, 'pagination : page bornée');
select is((select count(*)::integer from public.rgpd_export_page((select id from _j where nom = 'ent_a'), (select bail from _j where nom = 'ent_a'), 'clients', 2, 1000)),
  1, 'pagination : curseur sur seq, pas de doublon');

-- ── 5. Fin, complétude, rejeu ───────────────────────────────────────────────────────────────
reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'rgpd-exports', id || '/' || tentative || '.zip', '{"size": 1234}' from _j where nom = 'ent_a';
set local role service_role;
select throws_ok(format($$select public.rgpd_export_terminer(%L, %L, %L, repeat('a', 64), 1234, true)$$,
    (select id from _j where nom = 'ent_a'), (select bail from _j where nom = 'ent_a'), 'autre/chemin.zip'),
  '22023', null, 'fin : chemin d''archive imposé par le job');
select throws_ok(format($$select public.rgpd_export_terminer(%L, %L, %L, repeat('a', 64), 1234, true)$$,
    (select id from _j where nom = 'usr_ouvrier'), (select bail from _j where nom = 'usr_ouvrier'),
    (select id || '/' || tentative || '.zip' from _j where nom = 'usr_ouvrier')),
  '22023', null, 'fin : refusée si l''archive n''existe pas dans le stockage');
select is(public.rgpd_export_terminer(id, bail, id || '/' || tentative || '.zip', repeat('a', 64), 1234, true, '{"fichiers_inclus": 1}') ->> 'complet',
  'false', 'complétude : jamais « complète » avec un fichier ABSENT ou HORS_TENANT, même si le worker l''affirme') from _j where nom = 'ent_a';
select is(public.rgpd_export_terminer(id, bail, id || '/' || tentative || '.zip', repeat('a', 64), 1234, true) ->> 'rejoue',
  'true', 'rejeu de la fin : sans effet') from _j where nom = 'ent_a';
reset role;
select is((select count(*)::integer from platform.rgpd_export_lignes where job_id = (select id from _j where nom = 'ent_a')),
  0, 'fin : données préparées supprimées dès que l''archive existe');

-- ── 6. Téléchargement ───────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.rgpd_export_autoriser_telechargement((select id from _j where nom = 'ent_a')) ->> 'code', 'INTROUVABLE',
  'IDOR : B ne peut pas télécharger l''export de A (réponse identique à un job inexistant)');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is(public.rgpd_export_autoriser_telechargement((select id from _j where nom = 'ent_a')) ->> 'code', 'INTROUVABLE',
  'IDOR : un autre administrateur de A ne télécharge pas l''export demandé par un tiers');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((public.rgpd_export_autoriser_telechargement((select id from _j where nom = 'ent_a')) ->> 'chemin'),
  (select id || '/' || tentative || '.zip' from _j where nom = 'ent_a'), 'téléchargement autorisé au demandeur, objet unique');
select public.rgpd_export_autoriser_telechargement((select id from _j where nom = 'ent_a'));
select public.rgpd_export_autoriser_telechargement((select id from _j where nom = 'ent_a'));
select is(public.rgpd_export_autoriser_telechargement((select id from _j where nom = 'ent_a')) ->> 'code', 'QUOTA_TELECHARGEMENT',
  'usage contrôlé : nombre de téléchargements borné');
reset role;
update platform.rgpd_export_jobs set telechargements = 0 where id = (select id from _j where nom = 'ent_a');
delete from public.permissions_poste where poste_id = 'a1000000-0000-0000-0000-000000000001' and cle_permission = 'gerer_parametres';
set local role authenticated;
select is(public.rgpd_export_autoriser_telechargement((select id from _j where nom = 'ent_a')) ->> 'code', 'NON_AUTORISE',
  'droit relu au téléchargement : retrait de gerer_parametres → refus');
reset role;
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'gerer_parametres', true);

-- ── 7. Interruption, reprise, échecs ────────────────────────────────────────────────────────
-- Le job de l'ouvrier est « interrompu » : bail expiré en cours de génération.
update platform.rgpd_export_jobs set bail_expire_at = now() - interval '1 second' where id = (select id from _j where nom = 'usr_ouvrier');
set local role service_role;
create temporary table _r on commit drop as select * from public.rgpd_export_reclamer();
select ok((select reprise and tentative = 2 from _r), 'job interrompu : repris (tentative 2)');
select throws_ok(format($$select public.rgpd_export_materialiser(%L, %L)$$, (select id from _j where nom = 'usr_ouvrier'), (select bail from _j where nom = 'usr_ouvrier')),
  '55P03', null, 'reprise : l''ancien bail (worker interrompu) ne peut plus écrire');
select public.rgpd_export_materialiser(job_id, bail) from _r;
reset role;
create temporary table _n1 on commit drop as
  select count(*) as n from platform.rgpd_export_lignes where job_id = (select job_id from _r);
grant select on _n1 to service_role;
set local role service_role;
select public.rgpd_export_materialiser(job_id, bail) from _r;
reset role;
select is((select count(*) from platform.rgpd_export_lignes where job_id = (select job_id from _r)), (select n from _n1),
  'rejeu de la matérialisation : aucune ligne dupliquée');
set local role service_role;
select is(public.rgpd_export_echouer(job_id, bail, 'EXPORT_STUDIO_INDISPONIBLE', true) ->> 'statut', 'PENDING',
  'échec transitoire (Studio indisponible) : replanifié, jamais READY') from _r;
reset role;
update platform.rgpd_export_jobs set prochaine_tentative_at = now() where id = (select job_id from _r);
set local role service_role;
create temporary table _r3 on commit drop as select * from public.rgpd_export_reclamer();
select is(public.rgpd_export_echouer(job_id, bail, 'EXPORT_STUDIO_INDISPONIBLE', true) ->> 'statut', 'FAILED',
  'tentatives épuisées : FAILED') from _r3;
reset role;
select is((select count(*)::integer from platform.rgpd_export_lignes where job_id = (select job_id from _r3))
        + (select count(*)::integer from platform.rgpd_export_fichiers where job_id = (select job_id from _r3)),
  0, 'échec : préparation purgée');

-- Droit retiré entre la demande et la génération.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into _j (nom, id) select 'ent_b', (public.rgpd_export_demander('ENTREPRISE', 'b0000000-0000-0000-0000-000000000001', 'admin-b-ent-0001') ->> 'job_id')::uuid;
reset role;
update public.utilisateurs_entreprises set statut = 'desactive'
 where utilisateur_id = '20000000-0000-0000-0000-000000000001' and entreprise_id = 'b0000000-0000-0000-0000-000000000001';
set local role service_role;
create temporary table _rb on commit drop as select * from public.rgpd_export_reclamer();
select is(public.rgpd_export_materialiser(job_id, bail) ->> 'code', 'DEMANDEUR_NON_AUTORISE',
  'droit relu à la génération : demandeur retiré → FAILED') from _rb;
reset role;

-- Entreprise suspendue : la restitution reste possible.
update public.utilisateurs_entreprises set statut = 'actif'
 where utilisateur_id = '20000000-0000-0000-0000-000000000001' and entreprise_id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '', true);
update public.entreprises set abonnement_statut = 'suspendu' where id = 'b0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.rgpd_export_demander('ENTREPRISE', 'b0000000-0000-0000-0000-000000000001', 'admin-b-ent-0002') ->> 'statut', 'PENDING',
  'entreprise suspendue : export de restitution toujours possible (DECISION_REQUIRED documentée)');
reset role;

-- ── 8. Expiration ───────────────────────────────────────────────────────────────────────────
update platform.rgpd_export_jobs set expire_at = now() - interval '1 second' where id = (select id from _j where nom = 'ent_a');
set local role service_role;
select is((select array_agg(objet) from public.rgpd_export_expirer(10) where job_id = (select id from _j where nom = 'ent_a')),
  array[(select id || '/' || tentative || '.zip' from _j where nom = 'ent_a')], 'expiration : l''archive échue est à supprimer');
select throws_ok(format($$select public.rgpd_export_constater_suppression(%L)$$, (select id from _j where nom = 'ent_a')),
  '22023', null, 'expiration : suppression constatée en base, jamais sur parole');
reset role;
delete from storage.objects where bucket_id = 'rgpd-exports';
set local role service_role;
select ok(public.rgpd_export_constater_suppression((select id from _j where nom = 'ent_a')), 'expiration : suppression constatée');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.rgpd_export_autoriser_telechargement((select id from _j where nom = 'ent_a')) ->> 'code', 'EXPIRE',
  'expiration : plus aucun téléchargement');
reset role;

-- ── 9. Journal ──────────────────────────────────────────────────────────────────────────────
select ok((select array_agg(distinct action) from platform.rgpd_export_evenements where job_id = (select id from _j where nom = 'ent_a'))
          @> array['requested', 'deduplicated', 'started', 'materialized', 'ready', 'download_authorized', 'download_refused', 'expired', 'archive_deleted'],
  'journal : demande, génération, téléchargement, expiration audités');
select ok(not exists (select 1 from platform.rgpd_export_evenements
                       where detail::text like '%TEST_A_%' or detail::text like '%TEST_B_%' or detail::text like '%@invalid.local%'),
  'journal : aucun contenu d''export (ni données, ni e-mail)');
select throws_ok($$update platform.rgpd_export_evenements set action = 'x'$$, '42501', null, 'journal : immuable');

select * from finish();
rollback;
