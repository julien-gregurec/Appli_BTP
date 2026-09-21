begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- ELSATIA-SECURITY-BLOCKERS-REMEDIATION-V1 — non-régression pour
-- 20260922000316 : les deux fonctions SECURITY DEFINER identifiées par
-- isolation_multitenant_surface.test.sql comme exécutables par `anon` sans
-- nécessité démontrée ne doivent plus l'être ; `authenticated` doit conserver
-- l'accès dont ses propres policies RLS ont réellement besoin.

select ok(
  not has_function_privilege('anon', 'public.construire_entreprise_snapshot(uuid)', 'EXECUTE'),
  'construire_entreprise_snapshot : anon ne peut plus exécuter'
);

select ok(
  not has_function_privilege('anon', 'public.est_membre_actif_reel(uuid)', 'EXECUTE'),
  'est_membre_actif_reel : anon ne peut plus exécuter'
);

select ok(
  has_function_privilege('authenticated', 'public.est_membre_actif_reel(uuid)', 'EXECUTE'),
  'est_membre_actif_reel : authenticated conserve l’accès (requis par ses propres policies RLS)'
);

-- Régression la plus large : plus aucune fonction SECURITY DEFINER "métier"
-- n'est exécutable par anon, hors les deux exceptions déjà documentées et
-- nommées par isolation_multitenant_surface.test.sql. Ce test échouerait de
-- nouveau si une future migration réintroduisait un grant PUBLIC/anon oublié.
select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.prorettype <> 'trigger'::regtype
      and p.proname not in ('document_commercial_par_token', 'reserves_invitation_consulter')
  ),
  0,
  'Aucune fonction SECURITY DEFINER métier supplémentaire exécutable par anon'
);

-- Le durcissement ne doit rien casser côté usage interne réel.
\ir fixtures/isolation_multitenant.inc

-- (a) trigger capturer_entreprise_snapshot_devis (SECURITY DEFINER,
-- propriétaire postgres) : doit continuer à figer entreprise_snapshot sans
-- grant anon/PUBLIC sur construire_entreprise_snapshot.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select lives_ok(
  $$insert into public.devis(entreprise_id, statut, numero, client_id)
    values('a0000000-0000-0000-0000-000000000001','envoye','SECDEF-REMEDIATION-1','a3000000-0000-0000-0000-000000000001')$$,
  'Un devis envoyé s’insère toujours normalement (trigger capturer_entreprise_snapshot_devis actif)'
);
select ok(
  (select entreprise_snapshot is not null from public.devis
    where entreprise_id='a0000000-0000-0000-0000-000000000001' and numero='SECDEF-REMEDIATION-1'),
  'entreprise_snapshot est bien figé par le trigger malgré la révocation anon/PUBLIC sur construire_entreprise_snapshot'
);

-- (b) policy RLS "membres gèrent les permissions" sur permissions_poste,
-- gatée par est_membre_actif_reel(entreprise_id) : authenticated doit
-- toujours pouvoir écrire, malgré la révocation anon/PUBLIC.
select lives_ok(
  $$update public.permissions_poste set autorise = true
    where entreprise_id='a0000000-0000-0000-0000-000000000001'
      and poste_id='a1000000-0000-0000-0000-000000000001'
      and cle_permission = (
        select cle_permission from public.permissions_poste
        where entreprise_id='a0000000-0000-0000-0000-000000000001'
          and poste_id='a1000000-0000-0000-0000-000000000001'
        limit 1
      )$$,
  'permissions_poste reste modifiable par un membre actif (policy gatée par est_membre_actif_reel, authenticated conserve l’EXECUTE)'
);

select * from finish();
rollback;
