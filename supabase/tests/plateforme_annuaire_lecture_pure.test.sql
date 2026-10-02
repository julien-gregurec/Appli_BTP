begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ELSATIA — HOTFIX 813 : annuaire plateforme en lecture pure
-- (migration 20261002000813_plateforme_annuaire_lecture_pure.sql)
--
-- `plateforme_annuaire_entreprises` est STABLE : elle ne doit plus appeler
-- `appliquer_suspensions_impayes()` (UPDATE), sous peine de 25006 en transaction
-- lecture seule. Le statut effectif est calculé en lecture et alimente onglets,
-- filtre `statutAbonnement` et champ `abonnement_statut` renvoyé.

create function pg_temp.en_plateforme(p uuid) returns void language sql as $$
  select set_config('role','authenticated',true);
  select set_config('request.jwt.claim.sub',p::text,true);
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
create function pg_temp.en_service() returns void language sql as $$
  select set_config('role','postgres',true);
  select set_config('request.jwt.claim.sub','',true);
  select set_config('request.jwt.claims','',true);
$$;
-- Identifiants (triés) renvoyés par l'annuaire pour un onglet et des filtres donnés,
-- restreints aux entreprises de ce test par la recherche « HF813 ».
create function pg_temp.ids(p_onglet text, p_filtres jsonb default '{}'::jsonb) returns text language sql as $$
  select coalesce(string_agg(l->>'nom', ',' order by l->>'nom'), '')
  from jsonb_array_elements(
    (public.plateforme_annuaire_entreprises('HF813', p_onglet, 'nom', 'asc', 1, 100, p_filtres))->'lignes'
  ) l;
$$;
create function pg_temp.statut(p_nom text) returns text language sql as $$
  select l->>'abonnement_statut'
  from jsonb_array_elements(
    (public.plateforme_annuaire_entreprises('HF813', 'toutes', 'nom', 'asc', 1, 100, '{}'::jsonb))->'lignes'
  ) l
  where l->>'nom' = p_nom;
$$;

-- Fixtures : un admin plateforme en lecture, quatre entreprises.
--   HF813-A : actif, suspension échue          → effectif 'suspendu'
--   HF813-B : actif, suspension future         → effectif 'actif'
--   HF813-C : annule, suspension échue         → effectif 'annule'
--   HF813-D : actif, aucune suspension         → effectif 'actif'
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'f8130000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'hf813-lecture@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now());
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at)
values ('hf813-lecture@invalid.local', 'lecture', 'f8130000-0000-4000-8000-000000000001', true, 'active', now());

insert into public.entreprises (id, nom, abonnement_statut, suspension_prevue_at) values
  ('f8130000-0000-4000-8000-00000000000a', 'HF813-A', 'actif',  now() - interval '1 day'),
  ('f8130000-0000-4000-8000-00000000000b', 'HF813-B', 'actif',  now() + interval '7 days'),
  ('f8130000-0000-4000-8000-00000000000c', 'HF813-C', 'annule', now() - interval '1 day'),
  ('f8130000-0000-4000-8000-00000000000d', 'HF813-D', 'actif',  null);

-- Forme de la fonction
select is((select provolatile::text from pg_proc where oid = 'public.plateforme_annuaire_entreprises(text,text,text,text,integer,integer,jsonb)'::regprocedure),
  's', 'L''annuaire reste STABLE');
select ok((select prosecdef from pg_proc where oid = 'public.plateforme_annuaire_entreprises(text,text,text,text,integer,integer,jsonb)'::regprocedure),
  'L''annuaire reste SECURITY DEFINER');
select ok((select prosrc from pg_proc where oid = 'public.plateforme_annuaire_entreprises(text,text,text,text,integer,integer,jsonb)'::regprocedure)
  !~* 'perform\s+public\.appliquer_suspensions_impayes', 'L''annuaire n''appelle plus appliquer_suspensions_impayes()');

-- Toute la suite tourne en transaction LECTURE SEULE, comme une RPC PostgREST read-only.
-- (Les tables temporaires de pgTAP restent inscriptibles en lecture seule.)
set local transaction_read_only = on;

select pg_temp.en_plateforme('f8130000-0000-4000-8000-000000000001');
select lives_ok($$select public.plateforme_annuaire_entreprises('HF813')$$,
  'Transaction lecture seule : l''annuaire répond sans 25006');
select is(pg_temp.ids('toutes'), 'HF813-A,HF813-B,HF813-C,HF813-D', 'Onglet toutes : les quatre entreprises');
select is(pg_temp.statut('HF813-A'), 'suspendu', 'Suspension échue : abonnement_statut renvoyé = suspendu');
select is(pg_temp.statut('HF813-B'), 'actif', 'Suspension future : abonnement_statut renvoyé inchangé');
select is(pg_temp.statut('HF813-C'), 'annule', 'Compte annulé : jamais requalifié suspendu');
select is(pg_temp.ids('suspendues'), 'HF813-A', 'Onglet suspendues : statut effectif');
select is(pg_temp.ids('actives'), 'HF813-D', 'Onglet actives : exclut la suspension échue (et l''impayé signalé)');
select is(pg_temp.ids('toutes', '{"statutAbonnement":"suspendu"}'), 'HF813-A', 'Filtre statutAbonnement=suspendu : statut effectif');
select is(pg_temp.ids('toutes', '{"statutAbonnement":"actif"}'), 'HF813-B,HF813-D', 'Filtre statutAbonnement=actif : statut effectif');

-- Lecture pure : aucune écriture n'a eu lieu.
select pg_temp.en_service();
select is((select abonnement_statut from public.entreprises where id = 'f8130000-0000-4000-8000-00000000000a'),
  'actif', 'Lecture pure : la ligne stockée n''est pas modifiée par l''annuaire');

-- Contre-épreuve : l'écriture (ancien appel) échoue bien en lecture seule ; elle reste au cron.
select throws_ok($$select public.appliquer_suspensions_impayes()$$, '25006', null,
  'Contre-épreuve : appliquer_suspensions_impayes() lève 25006 en lecture seule');

select * from finish();
rollback;
