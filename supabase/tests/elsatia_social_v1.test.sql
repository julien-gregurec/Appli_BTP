-- ELSATIA Social V1 sur le train canonique V9.2 (migration 20261003001601).
--
--   1. Surface : 16 tables, RLS partout, privilèges anon / authenticated / service_role.
--   2. Identité canonique : auth.uid() -> plateforme_admins.utilisateur_id -> actif.
--   3. RLS : lecture réservée aux administrateurs plateforme actifs ; anonyme refusé.
--   4. AAL2 : rôles et validation exigent le claim aal2 ; le service_role ne valide jamais.
--   5. Workflow : création en brouillon, retour en brouillon après modification.
--   6. Verrou anti-doublon, quotas, journal en ajout seul, bucket privé.
begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

-- ─── Fixtures ─────────────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'social-total@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'social-support@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'social-revoque@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'client@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'social-lecture@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now());

insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at) values
  ('social-total@invalid.local', 'total', 'c0000000-0000-4000-8000-000000000001', true, 'active', now()),
  ('social-support@invalid.local', 'support', 'c0000000-0000-4000-8000-000000000002', true, 'active', now()),
  ('social-lecture@invalid.local', 'lecture', 'c0000000-0000-4000-8000-000000000005', true, 'active', now());
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite) values
  ('social-revoque@invalid.local', 'total', 'c0000000-0000-4000-8000-000000000003', false, 'rattachee_non_confirmee');

create or replace function pg_temp.agir_en(p_uid text, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create or replace function pg_temp.agir_service() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
$$;
grant execute on function pg_temp.agir_en(text, text) to authenticated, service_role, anon;
grant execute on function pg_temp.agir_service() to authenticated, service_role, anon;

-- Une publication soumise, une cible en attente, un compte connecté (données du serveur).
insert into public.social_publications (id, titre, contenu_principal, reseaux, statut, cree_par, cree_par_id)
values ('d0000000-0000-4000-8000-000000000001', 'Lancement ELSATIA Réserves', 'Texte', array['facebook','linkedin'], 'brouillon', 'social-support@invalid.local', 'c0000000-0000-4000-8000-000000000002');
update public.social_publications set statut = 'a_valider', soumis_at = now(), soumis_par = 'social-support@invalid.local' where id = 'd0000000-0000-4000-8000-000000000001';
insert into public.social_publication_cibles (id, publication_id, reseau, cle_idempotence)
values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'facebook', 'test:pub1:facebook');
insert into public.social_comptes (fournisseur, reseau, nom_compte, external_account_id, connecte_par_id)
values ('meta', 'facebook', 'ELSATIA', '123', 'c0000000-0000-4000-8000-000000000001');
insert into public.social_identifiants (compte_id, jeton_chiffre, cle_version)
select id, 'v1:chiffre', 'v1' from public.social_comptes where external_account_id = '123';

-- ─── 1. Surface ───────────────────────────────────────────────────────
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'social\_%'), 16, '16 tables ELSATIA Social');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'social\_%' and not c.relrowsecurity), 0, 'RLS active sur toutes les tables Social');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and table_name like 'social\_%' and grantee = 'anon'), 0, 'anon : aucun privilège sur les tables Social');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and table_name like 'social\_%' and grantee = 'authenticated' and privilege_type <> 'SELECT'), 0, 'authenticated : lecture seule');
select ok(not has_table_privilege('authenticated', 'public.social_identifiants', 'select'), 'authenticated ne lit pas les jetons chiffrés');
select ok(not has_table_privilege('authenticated', 'public.social_connexions_en_attente', 'select'), 'authenticated ne lit pas les connexions OAuth en attente');
select ok(not has_table_privilege('authenticated', 'public.social_quotas', 'select'), 'authenticated ne lit pas les quotas');
select ok(has_table_privilege('service_role', 'public.social_publications', 'select,insert,update,delete'), 'service_role écrit les publications');
select ok(has_table_privilege('service_role', 'public.social_identifiants', 'select,insert,update,delete'), 'service_role gère les jetons chiffrés');
select ok(has_table_privilege('service_role', 'public.social_audit', 'select,insert'), 'service_role ajoute au journal');
select ok(not has_table_privilege('service_role', 'public.social_audit', 'update') and not has_table_privilege('service_role', 'public.social_audit', 'delete') and not has_table_privilege('service_role', 'public.social_audit', 'truncate'), 'service_role ne modifie, ne supprime ni ne vide le journal');
select ok(has_function_privilege('service_role', 'public.social_verrouiller_cible(uuid)', 'execute') and has_function_privilege('service_role', 'public.social_consommer_quota(text,integer,integer)', 'execute'), 'service_role : verrou et quotas exécutables');
select ok(not has_function_privilege('authenticated', 'public.social_verrouiller_cible(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.social_consommer_quota(text,integer,integer)', 'execute'), 'authenticated : ni verrou ni quota');
select ok(not has_function_privilege('authenticated', 'public.social_role_de(uuid)', 'execute'), 'authenticated ne peut pas interroger le rôle d''un tiers');
select ok(has_function_privilege('authenticated', 'public.social_session_courante()', 'execute') and has_function_privilege('authenticated', 'public.social_definir_role(uuid,text)', 'execute') and has_function_privilege('authenticated', 'public.social_valider_publication(uuid,text,text)', 'execute'), 'authenticated : RPC de session, rôle et validation');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'social\_%' and has_function_privilege('anon', p.oid, 'execute')), 0, 'anon : aucune fonction Social exécutable');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'social\_%' and p.prosecdef and not coalesce(array_to_string(p.proconfig, ',') ilike '%search_path=%', false)), 0, 'toute fonction SECURITY DEFINER fixe son search_path');
select ok((select not public from storage.buckets where id = 'social-medias'), 'bucket social-medias privé');
select is((select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'social\_%' and t.tgname = 'incident_garde_ecriture'), 16, 'mode sûr incident : garde posée sur les 16 tables Social');
select is(public.incident_application_table('social_publications'), 'gestion_pro', 'mode sûr incident : Social relève de Gestion Pro');

-- ─── 2. Identité canonique ────────────────────────────────────────────
select is(public.social_role_de('c0000000-0000-4000-8000-000000000001'), 'administrateur', 'plateforme « total » actif -> Administrateur par défaut');
select is(public.social_role_de('c0000000-0000-4000-8000-000000000002'), 'lecture', 'plateforme « support » actif -> Lecture par défaut');
select is(public.social_role_de('c0000000-0000-4000-8000-000000000003'), null, 'identité « total » non active -> aucun rôle');
select is(public.social_role_de('c0000000-0000-4000-8000-000000000004'), null, 'utilisateur hors plateforme -> aucun rôle');
select is(public.social_role_de(null), null, 'UID nul -> aucun rôle');

-- ─── 3. RLS : utilisateur authentifié et anonyme ─────────────────────
select pg_temp.agir_en('c0000000-0000-4000-8000-000000000002', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.social_publications), 1, 'administrateur plateforme actif : lit les publications');
select is((select count(*)::int from public.social_comptes), 1, 'administrateur plateforme actif : lit les comptes');
select throws_ok($$ select * from public.social_identifiants $$, '42501', null, 'jetons chiffrés illisibles même authentifié');
select throws_ok($$ insert into public.social_publications (titre, cree_par) values ('x', 'x') $$, '42501', null, 'aucune écriture directe depuis le client');
select throws_ok($$ update public.social_publications set titre = 'piraté' $$, '42501', null, 'aucune mise à jour directe depuis le client');
select is((select role from public.social_session_courante()), 'lecture', 'session : rôle social résolu par UID');
select ok((select aal2 from public.social_session_courante()), 'session : AAL2 lu dans le claim du JWT');
select is((select count(*)::int from public.social_audit), 0, 'Lecture seule : journal non visible (droit voir_journal)');
select is((select count(*)::int from public.social_lister_equipe() where email like 'social-%@invalid.local'), 3, 'équipe : seules les identités plateforme actives sont listées');
reset role;

select pg_temp.agir_en('c0000000-0000-4000-8000-000000000002', 'aal1');
set local role authenticated;
select ok(not (select aal2 from public.social_session_courante()), 'session AAL1 signalée au serveur');
reset role;

select pg_temp.agir_en('c0000000-0000-4000-8000-000000000003', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.social_publications), 0, 'identité plateforme non active : aucune ligne');
select is((select count(*)::int from public.social_session_courante()), 0, 'identité plateforme non active : aucune session Social');
reset role;

select pg_temp.agir_en('c0000000-0000-4000-8000-000000000004', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.social_publications), 0, 'client authentifié hors plateforme : aucune ligne');
select throws_ok($$ select public.social_definir_role('c0000000-0000-4000-8000-000000000004', 'administrateur') $$, 'P0001', null, 'client hors plateforme : ne peut pas s''attribuer un rôle');
select throws_ok($$ select * from public.social_lister_equipe() $$, 'P0001', 'Accès ELSATIA Social refusé', 'client hors plateforme : équipe non listable');
reset role;

set local role anon;
select throws_ok($$ select * from public.social_publications $$, '42501', null, 'anonyme : publications refusées');
select throws_ok($$ select public.social_session_courante() $$, '42501', null, 'anonyme : RPC de session refusée');
select throws_ok($$ select * from public.social_lister_equipe() $$, '42501', null, 'anonyme : RPC d''équipe refusée');
reset role;

-- ─── 4. AAL2 : rôles ──────────────────────────────────────────────────
select pg_temp.agir_en('c0000000-0000-4000-8000-000000000001', 'aal1');
set local role authenticated;
select throws_ok($$ select public.social_definir_role('c0000000-0000-4000-8000-000000000002', 'validateur') $$, 'P0001', 'Authentification forte AAL2 requise', 'rôle : refusé en AAL1, même pour un administrateur');
reset role;

select pg_temp.agir_en('c0000000-0000-4000-8000-000000000002', 'aal2');
set local role authenticated;
select throws_ok($$ select public.social_definir_role('c0000000-0000-4000-8000-000000000002', 'administrateur') $$, 'P0001', 'Seul un Administrateur ELSATIA Social peut modifier les rôles', 'rôle : un non-administrateur ne s''élève pas');
reset role;

select pg_temp.agir_en('c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select lives_ok($$ select public.social_definir_role('c0000000-0000-4000-8000-000000000002', 'validateur') $$, 'rôle : administrateur AAL2 nomme un Validateur');
select lives_ok($$ select public.social_definir_role('c0000000-0000-4000-8000-000000000005', 'editeur') $$, 'rôle : administrateur AAL2 nomme un Éditeur');
select throws_ok($$ select public.social_definir_role('c0000000-0000-4000-8000-000000000003', 'editeur') $$, 'P0001', null, 'rôle : impossible vers une identité non active');
select throws_ok($$ select public.social_definir_role('c0000000-0000-4000-8000-000000000001', 'lecture') $$, 'P0001', null, 'rôle : impossible de se retirer son propre rôle d''administrateur');
select throws_ok($$ select public.social_definir_role('c0000000-0000-4000-8000-000000000002', 'super') $$, 'P0001', 'Rôle ELSATIA Social inconnu', 'rôle : valeur inconnue refusée');
reset role;
select is(public.social_role_de('c0000000-0000-4000-8000-000000000002'), 'validateur', 'rôle explicite appliqué');
select is((select count(*)::int from public.social_audit where action = 'role_modifie' and acteur_id = 'c0000000-0000-4000-8000-000000000001'), 2, 'rôles : journalisés avec l''UID de l''acteur');

-- ─── 5. AAL2 : validation ─────────────────────────────────────────────
select pg_temp.agir_service();
set local role service_role;
select throws_ok($$ update public.social_publications set statut = 'valide', approuve_par_id = 'c0000000-0000-4000-8000-000000000001', approuve_at = now(), empreinte_validee = repeat('a', 64) where id = 'd0000000-0000-4000-8000-000000000001' $$,
  'P0001', 'Une validation ne peut être enregistrée que par la personne qui valide', 'service_role : ne peut jamais poser une validation');
select throws_ok($$ select public.social_valider_publication('d0000000-0000-4000-8000-000000000001', repeat('a', 64), null) $$, '42501', null, 'service_role : RPC de validation non exécutable');
reset role;

select pg_temp.agir_en('c0000000-0000-4000-8000-000000000002', 'aal1');
set local role authenticated;
select throws_ok($$ select public.social_valider_publication('d0000000-0000-4000-8000-000000000001', repeat('a', 64), null) $$, 'P0001', 'Authentification forte AAL2 requise', 'validation : refusée en AAL1');
reset role;

select pg_temp.agir_en('c0000000-0000-4000-8000-000000000005', 'aal2');
set local role authenticated;
select throws_ok($$ select public.social_valider_publication('d0000000-0000-4000-8000-000000000001', repeat('a', 64), null) $$, 'P0001', null, 'validation : refusée à un Éditeur');
reset role;

select pg_temp.agir_en('c0000000-0000-4000-8000-000000000002', 'aal2');
set local role authenticated;
select throws_ok($$ select public.social_valider_publication('d0000000-0000-4000-8000-000000000001', 'pas-une-empreinte', null) $$, 'P0001', 'Empreinte de validation invalide', 'validation : empreinte malformée refusée');
select lives_ok($$ select public.social_valider_publication('d0000000-0000-4000-8000-000000000001', repeat('b', 64), 'OK pour diffusion') $$, 'validation : Validateur AAL2 autorisé');
select throws_ok($$ select public.social_valider_publication('d0000000-0000-4000-8000-000000000001', repeat('b', 64), null) $$, 'P0001', null, 'validation : une seule fois (état « a_valider » requis)');
reset role;
select is((select approuve_par_id::text from public.social_publications where id = 'd0000000-0000-4000-8000-000000000001'), 'c0000000-0000-4000-8000-000000000002', 'validation : UID de la personne qui valide figé');
select is((select count(*)::int from public.social_audit where action = 'publication_validee' and acteur_id = 'c0000000-0000-4000-8000-000000000002' and details ->> 'aal' = 'aal2'), 1, 'validation : journalisée avec UID et AAL2');

-- ─── 6. Workflow ──────────────────────────────────────────────────────
select pg_temp.agir_service();
set local role service_role;
update public.social_publications set contenu_principal = 'Texte modifié' where id = 'd0000000-0000-4000-8000-000000000001';
select is((select statut || '/' || coalesce(approuve_par_id::text, 'aucun') from public.social_publications where id = 'd0000000-0000-4000-8000-000000000001'), 'brouillon/aucun', 'modification après validation : retour en brouillon, validation effacée');
select throws_ok($$ insert into public.social_publications (titre, statut, cree_par) values ('Direct', 'programme', 'x') $$, 'P0001', null, 'création directe en état programmé refusée');

-- ─── 7. Verrou anti-doublon et quotas ─────────────────────────────────
select ok(public.social_verrouiller_cible('e0000000-0000-4000-8000-000000000001'), 'verrou : pris une première fois');
select ok(not public.social_verrouiller_cible('e0000000-0000-4000-8000-000000000001'), 'verrou : jamais repris pendant l''envoi');
select results_eq($$ values (public.social_consommer_quota('test:quota', 2, 3600)), (public.social_consommer_quota('test:quota', 2, 3600)), (public.social_consommer_quota('test:quota', 2, 3600)) $$,
  $$ values (true), (true), (false) $$, 'quota : 2 autorisés, le 3e refusé');

-- ─── 8. Journal en ajout seul ─────────────────────────────────────────
select throws_ok($$ update public.social_audit set action = 'efface' $$, '42501', null, 'journal : mise à jour refusée au service_role');
select throws_ok($$ delete from public.social_audit $$, '42501', null, 'journal : suppression refusée au service_role');
reset role;
select throws_ok($$ update public.social_audit set action = 'efface' $$, 'P0001', 'Le journal ELSATIA Social est en ajout seul', 'journal : même le propriétaire ne peut pas réécrire');

-- ─── 9 bis. Stockage : bucket privé, aucune policy pour les rôles de l'API ───
insert into storage.objects (bucket_id, name) values ('social-medias', 'medias/2026-10/recette.jpg');
-- Objets visibles par le rôle courant ; un refus de privilège compte comme « aucun ».
create or replace function pg_temp.objets_social_visibles() returns integer language plpgsql as $$
begin
  return (select count(*)::int from storage.objects where bucket_id = 'social-medias');
exception when insufficient_privilege then
  return 0;
end;
$$;
grant execute on function pg_temp.objets_social_visibles() to authenticated, anon;
select pg_temp.agir_en('c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select is(pg_temp.objets_social_visibles(), 0, 'stockage : un administrateur aal2 ne liste pas les objets Social (URL signées serveur uniquement)');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('social-medias', 'televersements/pirate.jpg') $$, '42501', null, 'stockage : aucun dépôt direct authentifié dans social-medias');
reset role;
set local role anon;
select is(pg_temp.objets_social_visibles(), 0, 'stockage : anonyme ne voit aucun objet Social');
reset role;

-- ─── 9. Non-régression RGPD multi-entreprise ─────────────────────────
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name like 'social\_%' and column_name ilike '%storage_path%'), 0, 'aucune colonne *storage_path* Social (hors périmètre des purges entreprise)');
select lives_ok($$ select * from public.verifier_storage_entreprise('a0000000-0000-4000-8000-0000000000ff') $$, 'verifier_storage_entreprise fonctionne avec les tables Social présentes');

select * from finish();
rollback;
