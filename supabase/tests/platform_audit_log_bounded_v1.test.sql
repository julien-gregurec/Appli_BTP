-- ELSATIA — LE JOURNAL D'AUDIT PLATEFORME N'EST PLUS ÉCRIVABLE À LA MAIN
--
-- Un journal dont le contenu peut être composé par celui qu'il surveille ne prouve
-- rien. Ce fichier démontre que, depuis la migration 00280 :
--
--   1. l'appel direct à `plateforme_journaliser` est refusé ;
--   2. l'export de l'annuaire ne passe que par sa RPC métier, et sous AAL2 ;
--   3. sans journalisation possible, l'export échoue — il ne produit rien en silence ;
--   4. quitter volontairement une session d'assistance reste possible SANS AAL2 ;
--   5. révoquer une session en urgence reste possible SANS AAL2 ;
--   6. ces deux fermetures écrivent bien leur trace ;
--   7. on ne peut pas fermer la session d'un autre acteur ;
--   8. on ne peut pas fabriquer un événement d'audit de son choix.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir fixtures/isolation_multitenant.inc

-- ── Décor : deux administrateurs plateforme, un accès de support ouvert ──────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-0000000000a1',
   'authenticated','authenticated','support-un@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-0000000000a2',
   'authenticated','authenticated','support-deux@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

-- L'assistance est cloisonnée par APPLICATION : on ne peut ouvrir un accès que
-- sur une application que l'entreprise utilise réellement. Le décor le déclare.
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a0000000-0000-0000-0000-000000000001', 'gestion_pro', true, 'test')
on conflict do nothing;

insert into public.plateforme_admins (email, role, nom, utilisateur_id, actif, statut_identite, activation_at)
values
  ('support-un@invalid.local','total','Support un','e1000000-0000-0000-0000-0000000000a1', true,'active', now()),
  ('support-deux@invalid.local','total','Support deux','e1000000-0000-0000-0000-0000000000a2', true,'active', now())
on conflict (email) do update
  set actif = true, utilisateur_id = excluded.utilisateur_id,
      statut_identite = 'active', activation_at = now();

-- ── 1. L'appel direct au journal est refusé ─────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"support-un@invalid.local","aal":"aal2"}', true);

select throws_ok(
  $$select public.plateforme_journaliser('action_inventee','cible','x','{}'::jsonb)$$,
  '42501', null,
  'un administrateur plateforme ne peut pas appeler le journal directement'
);

-- ── 8. …et ne peut donc pas fabriquer un faux événement ─────────────────────
select is(
  (select count(*) from public.plateforme_journal_actions where action = 'action_inventee'),
  0::bigint,
  'aucun événement d''audit fabriqué n''a pu être écrit'
);

-- ── 2. L'export ne passe que par sa RPC métier, et sous AAL2 ────────────────
select lives_ok(
  $$select public.plateforme_annuaire_journaliser_export('toutes', false, 12)$$,
  'sous AAL2, la RPC d''export journalise l''extraction'
);
select is(
  (select count(*) from public.plateforme_journal_actions where action = 'annuaire_export_csv'),
  1::bigint,
  'et l''action écrite est celle de la fonction, non celle de l''appelant'
);

-- ── 3. Sans AAL2, l'export est refusé : pas de trace, donc pas de fichier ───
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"support-un@invalid.local","aal":"aal1"}', true);
select throws_ok(
  $$select public.plateforme_annuaire_journaliser_export('toutes', false, 12)$$,
  null,
  'sans AAL2, l''extraction ne peut pas être journalisée — donc l''export échoue'
);
select is(
  (select count(*) from public.plateforme_journal_actions where action = 'annuaire_export_csv'),
  1::bigint,
  'et aucune trace supplémentaire n''a été écrite'
);

-- ── Décor : un accès de support ouvert, sous AAL2 ───────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"support-un@invalid.local","aal":"aal2"}', true);
select set_config('elsatia.session_un', (
  select public.assistance_ouvrir(
    'a0000000-0000-0000-0000-000000000001', array['gestion_pro'], 'incident_technique',
    'Incident de facturation signalé par le client, ticket en cours.',
    'lecture_seule', 60, 'T-1001', false, false, null
  )::text
), true);

-- ── 5. Révocation d'urgence SANS AAL2 ───────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-0000000000a2","role":"authenticated","email":"support-deux@invalid.local","aal":"aal1"}', true);
select lives_ok(
  format($$select public.assistance_revoquer(%L::uuid, 'Fuite suspectée, coupure immédiate')$$,
         current_setting('elsatia.session_un')),
  'un accès de support se révoque même après expiration de l''AAL2'
);

-- ── 6a. …et la révocation laisse une trace ──────────────────────────────────
select is(
  (select count(*) from public.plateforme_journal_actions where action = 'assistance_session_revoquee'),
  1::bigint,
  'la révocation a écrit sa trace, sans que personne ne la compose'
);

-- ── Décor : une seconde session, pour la sortie volontaire ──────────────────
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"support-un@invalid.local","aal":"aal2"}', true);
select set_config('elsatia.session_deux', (
  select public.assistance_ouvrir(
    'a0000000-0000-0000-0000-000000000001', array['gestion_pro'], 'incident_technique',
    'Second incident, vérification demandée par le client.',
    'lecture_seule', 60, 'T-1002', false, false, null
  )::text
), true);

-- ── 7. On ne ferme pas la session d'un autre ────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-0000000000a2","role":"authenticated","email":"support-deux@invalid.local","aal":"aal2"}', true);
select lives_ok(
  $$select public.assistance_quitter('sortie')$$,
  'quitter est sans effet quand on n''a pas de session ouverte : aucune erreur, aucun dégât'
);
select is(
  (select terminee_at from public.assistance_sessions where id = current_setting('elsatia.session_deux')::uuid),
  null,
  'et la session d''un AUTRE acteur reste ouverte : on ne ferme jamais celle d''autrui'
);

-- ── 4. Sortie volontaire SANS AAL2, par son propre acteur ───────────────────
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"support-un@invalid.local","aal":"aal1"}', true);
select lives_ok(
  $$select public.assistance_quitter('fin de diagnostic')$$,
  'on quitte sa propre session même après expiration de l''AAL2'
);

-- ── 6b. …et la sortie laisse une trace ──────────────────────────────────────
select is(
  (select count(*) from public.plateforme_journal_actions where action = 'assistance_session_quittee'),
  1::bigint,
  'la sortie volontaire a écrit sa trace'
);

reset role;
select finish();
rollback;
