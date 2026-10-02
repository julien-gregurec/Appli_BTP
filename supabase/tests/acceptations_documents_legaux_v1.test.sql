-- ELSATIA-LEGAL-CONSENT-COMMERCIALIZATION-PACK-V1 — preuve d'acceptation CGU / CGV / DPA
-- (migration 20261002000901, rapport
-- docs/qualification/ELSATIA_LEGAL_CONSENT_COMMERCIALIZATION_PACK_V1.md §3 et §6).
--
--   1. Cloisonnement : tables de preuve inatteignables par anon/authenticated ; RPC
--      réservées à authenticated.
--   2. Aucune création d'entreprise sans acceptation complète de la version en vigueur
--      (rien, liste vide, document manquant, version périmée, empreinte altérée) ;
--      création + preuve atomiques.
--   3. Preuve enregistrée : version, empreinte, horodatage serveur, utilisateur,
--      entreprise, contexte ; idempotence.
--   4. Portée : un poste sans `gerer_parametres` n'engage pas l'entreprise (CGV/DPA)
--      mais accepte pour lui-même (CGU).
--   5. Cross-tenant : aucune lecture ni écriture sur une autre entreprise.
--   6. Append-only : ni UPDATE, ni DELETE, ni TRUNCATE, même en superutilisateur.
--   7. Nouvelle version : ré-acceptation exigée si `reacceptation_requise`, sinon
--      l'acceptation antérieure reste valable ; l'ancienne version est refusée.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

\ir fixtures/isolation_multitenant.inc

create or replace function pg_temp.agir_en(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

create or replace function pg_temp.docs(p_cgu text default '1.0', p_cgv text default '1.0', p_avec_dpa boolean default true, p_alterer_cgv boolean default false)
returns jsonb language sql as $$
  select jsonb_agg(d) from (
    select jsonb_build_object('code', v.code, 'version', v.version,
             'empreinte', case when v.code = 'cgv' and p_alterer_cgv then repeat('0', 64) else v.empreinte_sha256 end) as d
      from platform.documents_legaux_versions v
     where (v.code = 'cgu' and v.version = p_cgu)
        or (v.code = 'cgv' and v.version = p_cgv)
        or (v.code = 'dpa' and p_avec_dpa)
  ) s;
$$;
grant execute on function pg_temp.agir_en(text) to authenticated;
grant execute on function pg_temp.docs(text, text, boolean, boolean) to authenticated;
-- La fabrique de charge utile lit le catalogue en superutilisateur, avant de changer de rôle.
create temporary table _charges (nom text primary key, charge jsonb) on commit drop;
insert into _charges values
  ('complet', pg_temp.docs()),
  ('sans_dpa', pg_temp.docs(p_avec_dpa => false)),
  ('cgv_alteree', pg_temp.docs(p_alterer_cgv => true)),
  ('cgu_seule', (select jsonb_agg(e) from jsonb_array_elements(pg_temp.docs()) e where e ->> 'code' = 'cgu')),
  ('cgv_inconnue', '[{"code":"cgv","version":"0.9","empreinte":"3c1a468c0a79148bcf618a508990e8421813bcaf8bb54b4c3376a7bb7980b7de"}]'),
  ('code_inconnu', '[{"code":"cookies","version":"1.0","empreinte":"x"}]');
grant select on _charges to authenticated;

-- ─── 1. Cloisonnement des objets ──────────────────────────────────────
select ok(not has_table_privilege('authenticated', 'platform.acceptations_documents_legaux', 'select'), 'authenticated ne lit pas le journal de preuves');
select ok(not has_table_privilege('authenticated', 'platform.acceptations_documents_legaux', 'insert'), 'authenticated n''écrit pas directement dans le journal');
select ok(not has_table_privilege('anon', 'platform.documents_legaux_versions', 'select'), 'anon ne lit pas le catalogue');
select ok(not has_function_privilege('anon', 'public.accepter_documents_legaux(uuid, text, jsonb)', 'execute'), 'anon ne peut pas accepter');
select ok(not has_function_privilege('anon', 'public.creer_entreprise_avec_acceptation(text, text, text, text, text, jsonb)', 'execute'), 'anon ne peut pas créer');
select ok(has_function_privilege('authenticated', 'public.creer_entreprise_avec_acceptation(text, text, text, text, text, jsonb)', 'execute'), 'authenticated peut créer avec acceptation');
select is((select count(*)::int from platform.documents_legaux_versions where en_vigueur_depuis <= now()), 3, 'catalogue : CGU, CGV et DPA en vigueur');

-- ─── 2. Aucune création sans acceptation complète ─────────────────────
select pg_temp.agir_en('30000000-0000-0000-0000-000000000001');
set local role authenticated;

select throws_ok($$ select public.creer_entreprise_avec_acceptation('Legal Test SARL', null, null, null, null, null) $$,
  '22023', null, 'création refusée sans acceptation');
select throws_ok($$ select public.creer_entreprise_avec_acceptation('Legal Test SARL', null, null, null, null, '[]'::jsonb) $$,
  '22023', null, 'création refusée avec une liste vide');
select throws_ok($$ select public.creer_entreprise_avec_acceptation('Legal Test SARL', null, null, null, null, (select charge from _charges where nom = 'sans_dpa')) $$,
  '22023', null, 'création refusée si le DPA manque');
select throws_ok($$ select public.creer_entreprise_avec_acceptation('Legal Test SARL', null, null, null, null, (select charge from _charges where nom = 'cgv_inconnue')) $$,
  '22023', null, 'création refusée pour une version de CGV qui n''est pas en vigueur');
select throws_ok($$ select public.creer_entreprise_avec_acceptation('Legal Test SARL', null, null, null, null, (select charge from _charges where nom = 'cgv_alteree')) $$,
  '22023', null, 'création refusée si l''empreinte du texte ne correspond pas');
select throws_ok($$ select public.creer_entreprise_avec_acceptation('Legal Test SARL', null, null, null, null, (select charge from _charges where nom = 'code_inconnu')) $$,
  '22023', null, 'création refusée pour un document inconnu');

reset role;
select is((select count(*)::int from public.entreprises where nom = 'Legal Test SARL'), 0, 'aucun refus ne laisse d''entreprise orpheline (atomicité)');
select is((select count(*)::int from platform.acceptations_documents_legaux), 0, 'aucun refus ne laisse de preuve partielle');

select pg_temp.agir_en('30000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select set_config('t.nouvelle', public.creer_entreprise_avec_acceptation('Legal Test SARL', null, null, null, null, (select charge from _charges where nom = 'complet'))::text, true) $$,
  'création acceptée avec CGU + CGV + DPA en vigueur');
select is((select count(*)::int from public.documents_legaux_a_accepter(current_setting('t.nouvelle')::uuid)), 0, 'plus rien à accepter après la création');
reset role;

-- ─── 3. Contenu de la preuve ──────────────────────────────────────────
select set_eq(
  $$ select document_code, document_version, document_empreinte_sha256, contexte, utilisateur_id::text
       from platform.acceptations_documents_legaux where entreprise_id = current_setting('t.nouvelle')::uuid $$,
  $$ select v.code, v.version, v.empreinte_sha256, 'creation_entreprise'::text as contexte, '30000000-0000-0000-0000-000000000001'::text as utilisateur_id
       from platform.documents_legaux_versions v $$,
  'preuve : document, version, empreinte, contexte, utilisateur et entreprise');
select ok((select bool_and(accepte_le between now() and clock_timestamp()) from platform.acceptations_documents_legaux), 'horodatage serveur de la transaction');

-- ─── 4. Portée et droits dans l'entreprise A ──────────────────────────
select pg_temp.agir_en('10000000-0000-0000-0000-000000000002'); -- ouvrier A
set local role authenticated;
select throws_ok($$ select public.accepter_documents_legaux('a0000000-0000-0000-0000-000000000001', 'souscription_abonnement', (select charge from _charges where nom = 'complet')) $$,
  '42501', null, 'un poste sans gerer_parametres n''engage pas l''entreprise (CGV/DPA)');
select is(public.accepter_documents_legaux('a0000000-0000-0000-0000-000000000001', 'souscription_abonnement', (select charge from _charges where nom = 'cgu_seule')), 1,
  'le même utilisateur accepte les CGU pour lui-même');
select throws_ok($$ select * from public.acceptations_documents_legaux_entreprise('a0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'un poste sans gerer_parametres ne lit pas l''historique de l''entreprise');

select pg_temp.agir_en('10000000-0000-0000-0000-000000000001'); -- admin A
select set_eq($$ select code from public.documents_legaux_a_accepter('a0000000-0000-0000-0000-000000000001') $$,
  array['cgu', 'cgv', 'dpa'], 'admin A : CGU (personnelle), CGV et DPA (entreprise) à accepter');
select throws_ok($$ select public.accepter_documents_legaux('a0000000-0000-0000-0000-000000000001', 'inscription', (select charge from _charges where nom = 'complet')) $$,
  '22023', null, 'contexte libre refusé');
select is(public.accepter_documents_legaux('a0000000-0000-0000-0000-000000000001', 'souscription_abonnement', (select charge from _charges where nom = 'complet')), 3,
  'admin A accepte les trois documents');
select is(public.accepter_documents_legaux('a0000000-0000-0000-0000-000000000001', 'souscription_abonnement', (select charge from _charges where nom = 'complet')), 0,
  'idempotence : aucune preuve en double');
select is((select count(*)::int from public.documents_legaux_a_accepter('a0000000-0000-0000-0000-000000000001')), 0, 'admin A : plus rien à accepter');

-- ─── 5. Cross-tenant ──────────────────────────────────────────────────
select throws_ok($$ select public.accepter_documents_legaux('b0000000-0000-0000-0000-000000000001', 'souscription_abonnement', (select charge from _charges where nom = 'complet')) $$,
  '42501', null, 'admin A ne peut pas accepter au nom de B');
select throws_ok($$ select * from public.documents_legaux_a_accepter('b0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin A ne sonde pas l''état de B');
select throws_ok($$ select * from public.acceptations_documents_legaux_entreprise('b0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin A ne lit pas les preuves de B');
select is((select count(*)::int from public.acceptations_documents_legaux_entreprise('a0000000-0000-0000-0000-000000000001')), 4,
  'admin A lit exactement les 4 preuves de A (3 admin + 1 CGU ouvrier), rien d''autre');

select pg_temp.agir_en('20000000-0000-0000-0000-000000000001'); -- admin B
select set_eq($$ select code from public.documents_legaux_a_accepter('b0000000-0000-0000-0000-000000000001') $$,
  array['cgu', 'cgv', 'dpa'], 'les acceptations de A ne valent pas pour B');
reset role;

-- ─── 6. Append-only ───────────────────────────────────────────────────
select throws_ok($$ update platform.acceptations_documents_legaux set contexte = 'reacceptation' $$, '55000', null, 'UPDATE interdit, même en superutilisateur');
select throws_ok($$ delete from platform.acceptations_documents_legaux $$, '55000', null, 'DELETE interdit');
select throws_ok($$ truncate platform.acceptations_documents_legaux $$, '55000', null, 'TRUNCATE interdit');
select throws_ok($$ update platform.documents_legaux_versions set empreinte_sha256 = repeat('0', 64) $$, '55000', null, 'une version publiée ne se réécrit pas');

-- ─── 7. Nouvelle version ──────────────────────────────────────────────
insert into platform.documents_legaux_versions (code, version, empreinte_sha256, fichier, portee, en_vigueur_depuis, reacceptation_requise) values
  ('cgv', '1.1', repeat('a', 64), 'cgv.md', 'entreprise', now() - interval '1 second', true),
  ('cgu', '1.1', repeat('b', 64), 'cgu.md', 'utilisateur', now() - interval '1 second', false);
update _charges set charge = (select jsonb_agg(jsonb_build_object('code', code, 'version', version, 'empreinte', empreinte_sha256))
                                from platform.documents_legaux_versions where code = 'cgv' and version = '1.1') where nom = 'cgv_inconnue';

select pg_temp.agir_en('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_eq($$ select code || '@' || version from public.documents_legaux_a_accepter('a0000000-0000-0000-0000-000000000001') $$,
  array['cgv@1.1'], 'CGV 1.1 (réacceptation requise) redemandée ; CGU 1.1 (non requise) non redemandée');
select throws_ok($$ select public.accepter_documents_legaux('a0000000-0000-0000-0000-000000000001', 'reacceptation', (select charge from _charges where nom = 'complet')) $$,
  '22023', null, 'l''ancienne version n''est plus acceptable');
select is(public.accepter_documents_legaux('a0000000-0000-0000-0000-000000000001', 'reacceptation', (select charge from _charges where nom = 'cgv_inconnue')), 1,
  'la nouvelle version est acceptée');
select is((select count(*)::int from public.documents_legaux_a_accepter('a0000000-0000-0000-0000-000000000001')), 0, 'plus rien à accepter après ré-acceptation');
reset role;

select is((select count(*)::int from platform.acceptations_documents_legaux where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and document_code = 'cgv'), 2,
  'les deux preuves CGV (1.0 puis 1.1) coexistent : l''historique n''est pas réécrit');

select * from finish();
rollback;
