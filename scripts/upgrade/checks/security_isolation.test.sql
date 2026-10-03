-- ELSATIA — harnais d'upgrade Production → V9.x — PHASE G : sécurité sur données HISTORIQUES upgradées.
-- RLS réelle (set local role + JWT simulé), transaction annulée. Profils issus du jeu 210 :
--   admin-a (A + membre actif de « Entreprise Test » : multi-entreprises), ouvrier-b (membre DÉSACTIVÉ de
--   « Petite SARL Histo », entreprise active pointée dessus), « sans-entreprise » (aucune appartenance,
--   entreprise active pointée sur l'entreprise SANS MEMBRE), gérant de la petite entreprise, anon.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(21);

create or replace function pg_temp.en(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;
grant execute on function pg_temp.en(uuid) to authenticated, anon;
-- Lignes ACCESSIBLES par la requête sous le rôle courant ; un refus de privilège (ACL plus stricte que la
-- RLS, ex. anon après 20260714000078 / 20260902000255) compte pour 0 ligne accessible.
create or replace function pg_temp.nb(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q into n; return n;
exception when insufficient_privilege then return 0;
end $$;
grant execute on function pg_temp.nb(text) to authenticated, anon;
create temp table ids as select
  (select id from public.entreprises where nom = 'Entreprise Test') as moyenne,
  (select id from public.entreprises where nom = 'Petite SARL Histo') as petite,
  'c2100000-0000-0000-0000-000000000001'::uuid as sans_membre,
  'a0000000-0000-0000-0000-000000000001'::uuid as a,
  'b0000000-0000-0000-0000-000000000001'::uuid as b;
grant select on ids to authenticated, anon;

-- anon : aucune ligne métier, aucune exécution des RPC sensibles.
set local role anon;
select is(pg_temp.nb($q$select count(*) from public.entreprises$q$), 0::bigint, 'anon : 0 entreprise visible');
select is(pg_temp.nb($q$select count(*) from public.factures$q$), 0::bigint, 'anon : 0 facture visible');
select is(pg_temp.nb($q$select count(*) from public.coordonnees_bancaires$q$), 0::bigint, 'anon : 0 IBAN visible');
reset role;
select ok(not has_function_privilege('anon', 'public.creer_entreprise_bootstrap(text,text,text,text,text)', 'execute'), 'anon : creer_entreprise_bootstrap non exécutable');

-- Multi-entreprises : admin-a voit A et Entreprise Test, jamais B ni la petite.
select pg_temp.en('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select ok(pg_temp.nb($q$select count(*) from public.clients where entreprise_id = (select moyenne from ids)$q$) > 0,
          'multi-entreprises : clients de sa seconde entreprise (active, abonnée) visibles');
-- A est en essai EXPIRÉ : désormais coupé en base (20260928000803), y compris pour ses membres multi-entreprises.
select is(pg_temp.nb($q$select count(*) from public.clients where entreprise_id = (select a from ids)$q$), 0::bigint, 'essai expiré : 0 client de A, même pour son administrateur');
select is(pg_temp.nb($q$select count(*) from public.clients where entreprise_id = (select b from ids)$q$), 0::bigint, 'multi-entreprises : 0 client de B');
select is(pg_temp.nb($q$select count(*) from public.factures where entreprise_id = (select petite from ids)$q$), 0::bigint, 'multi-entreprises : 0 facture de la petite');
reset role;

-- Membre DÉSACTIVÉ (ouvrier-b sur la petite) : plus aucun accès à l'entreprise, même active.
select pg_temp.en('20000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.nb($q$select count(*) from public.clients where entreprise_id = (select petite from ids)$q$), 0::bigint, 'membre désactivé : 0 client de l''entreprise quittée');
select is(pg_temp.nb($q$select count(*) from public.employes where entreprise_id = (select petite from ids)$q$), 0::bigint, 'membre désactivé : 0 employé de l''entreprise quittée');
select is(pg_temp.nb($q$select count(*) from public.abonnements_entreprises where entreprise_id = (select petite from ids)$q$), 0::bigint, 'membre désactivé : contrat invisible');
reset role;

-- Utilisateur sans appartenance, entreprise active pointée sur l'entreprise SANS MEMBRE.
select pg_temp.en('a2100000-0000-0000-0000-0000000000ff');
set local role authenticated;
select is(pg_temp.nb($q$select count(*) from public.entreprises$q$), 0::bigint, 'sans appartenance : 0 entreprise visible malgré entreprise_active_id');
select is(pg_temp.nb($q$select count(*) from public.clients where entreprise_id = (select sans_membre from ids)$q$), 0::bigint, 'sans appartenance : entreprise sans membre inaccessible');
select is(pg_temp.nb($q$select count(*) from public.devis$q$), 0::bigint, 'sans appartenance : 0 devis');
reset role;

-- SEC-4 (post-V9) : un utilisateur ne peut pas pointer son entreprise active vers un tenant étranger.
select pg_temp.en('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ update public.utilisateurs set entreprise_active_id = 'b0000000-0000-0000-0000-000000000001' where id = auth.uid() $$,
                 null, 'SEC-4 : bascule vers une entreprise étrangère refusée');
select lives_ok($$ update public.utilisateurs set entreprise_active_id = (select moyenne from ids) where id = auth.uid() $$,
                'SEC-4 : bascule vers sa propre seconde entreprise acceptée');
reset role;

-- Données bancaires historiques : jamais lisibles hors permission ; ouvrier A ne lit aucun IBAN.
select pg_temp.en('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.nb($q$select count(*) from public.coordonnees_bancaires$q$), 0::bigint, 'ouvrier : 0 IBAN lisible');
reset role;

-- Gérant de la petite entreprise : ses données seulement, IBAN chiffré v1 jamais déchiffré par la base.
select pg_temp.en('a2100000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.nb($q$select count(*) from public.entreprises where id <> (select petite from ids)$q$), 0::bigint, 'gérant petite : aucune autre entreprise visible');
select ok((select count(*) from public.employes where entreprise_id = (select petite from ids)) >= 2, 'gérant petite : ses employés visibles');
reset role;

-- Catalogue : aucune fonction SECURITY DEFINER sans search_path figé ; RLS active sur toutes les tables public.
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'platform') and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search_path=%')), 0::bigint,
          'SECURITY DEFINER : search_path figé partout');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0::bigint, 'RLS active sur toutes les tables public');

select * from finish();
rollback;
