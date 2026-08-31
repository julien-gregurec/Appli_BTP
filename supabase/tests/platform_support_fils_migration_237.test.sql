-- Régression du défaut bloquant de la migration 237 (ADMIN-GLOBAL-V1-R7 / AAL2).
--
-- Contexte : la migration 202 crée public.plateforme_support_fils() avec
-- non_lus/total en `bigint`. La migration 237 redéfinit la fonction avec
-- non_lus/total en `integer`. Un CREATE OR REPLACE ne peut PAS changer le type
-- des colonnes OUT (ERROR 42P13 « cannot change return type of existing
-- function »). 237 doit donc DROP la fonction d'abord — jamais CASCADE, aucun
-- objet ne dépend d'elle — comme le fait déjà la migration 239 qui la
-- redéfinit ensuite en catalogue minimal (5 colonnes).
--
-- Ce test verrouille :
--   1. l'état final de plateforme_support_fils() après toute la chaîne
--      (signature 239 : 5 colonnes, non_lus/total en integer, aucun bigint) ;
--   2. ses privilèges (authenticated:EXECUTE ; jamais PUBLIC ni anon) ;
--   3. le mécanisme lui-même : bigint->integer par CREATE OR REPLACE échoue en
--      42P13, alors que DROP simple puis CREATE réussit (le correctif de 237).

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- 1. La chaîne complète des migrations s'est appliquée sur une base propre :
--    si 237 échouait (42P13), `supabase db reset` ne dépasserait pas 236 et ce
--    fichier ne serait jamais exécuté. On l'atteste explicitement via le ledger.
-- ---------------------------------------------------------------------------
select ok(
  (select max(version) from supabase_migrations.schema_migrations) >= '20260828000249',
  'chaine de migrations appliquee jusqu''a 20260828000249 depuis une base propre'
);
select ok(
  exists(select 1 from supabase_migrations.schema_migrations where version = '20260816000202')
  and exists(select 1 from supabase_migrations.schema_migrations where version = '20260826000237')
  and exists(select 1 from supabase_migrations.schema_migrations where version = '20260826000239'),
  '202 puis 237 puis 239 toutes trois presentes dans le ledger local'
);

-- ---------------------------------------------------------------------------
-- 2. plateforme_support_fils() existe une seule fois, signature finale (239).
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'plateforme_support_fils'),
  1,
  'plateforme_support_fils() definie exactement une fois (aucune surcharge)'
);

select is(
  pg_get_function_identity_arguments('public.plateforme_support_fils()'::regprocedure),
  '',
  'plateforme_support_fils() ne prend aucun argument'
);

select is(
  pg_get_function_result('public.plateforme_support_fils()'::regprocedure),
  'TABLE(entreprise_id uuid, entreprise_nom text, dernier_at timestamp with time zone, non_lus integer, total integer)',
  'signature de retour finale = catalogue minimal 239 (5 colonnes, non_lus/total integer)'
);

-- Le coeur du defaut 237 : plus aucune colonne OUT en bigint.
select ok(
  pg_get_function_result('public.plateforme_support_fils()'::regprocedure) !~* 'bigint',
  'aucune colonne OUT de plateforme_support_fils() n''est en bigint (regression 42P13)'
);

-- ---------------------------------------------------------------------------
-- 3. Privileges conformes : authenticated peut executer ; jamais PUBLIC ni anon.
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.plateforme_support_fils()'::regprocedure, 'EXECUTE'),
  'authenticated conserve EXECUTE sur plateforme_support_fils()'
);
select ok(
  not has_function_privilege('anon', 'public.plateforme_support_fils()'::regprocedure, 'EXECUTE'),
  'anon n''a pas EXECUTE sur plateforme_support_fils()'
);
select ok(
  not exists(
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.plateforme_support_fils()'::regprocedure
      and a.grantee = 0            -- 0 = pseudo-role PUBLIC
      and a.privilege_type = 'EXECUTE'
  ),
  'aucun EXECUTE accorde a PUBLIC sur plateforme_support_fils()'
);
select ok(
  (select p.prosecdef from pg_proc p where p.oid = 'public.plateforme_support_fils()'::regprocedure),
  'plateforme_support_fils() reste SECURITY DEFINER'
);

-- ---------------------------------------------------------------------------
-- 4. Mecanisme : reproduction isolee du defaut et de son correctif, sur une
--    fonction jetable, entierement dans la transaction annulee.
-- ---------------------------------------------------------------------------
create function public._regr_support_fils_237()
returns table(entreprise_id uuid, non_lus bigint, total bigint)
language sql stable as $regr$ select null::uuid, 0::bigint, 0::bigint $regr$;

-- 4a. bigint -> integer via CREATE OR REPLACE : doit echouer en 42P13 (le defaut).
select throws_ok(
  $regr$
    create or replace function public._regr_support_fils_237()
    returns table(entreprise_id uuid, non_lus integer, total integer)
    language sql stable as $b$ select null::uuid, 0, 0 $b$
  $regr$,
  '42P13',
  null,
  'CREATE OR REPLACE bigint->integer sur colonnes OUT echoue en 42P13 (defaut 237)'
);

-- 4b. aucun objet dependant : DROP simple (sans CASCADE) est possible.
select lives_ok(
  $regr$ drop function public._regr_support_fils_237() $regr$,
  'DROP FUNCTION sans CASCADE reussit (aucune dependance) : correctif applique par 237'
);

-- 4c. apres le DROP, la (re)creation avec integer reussit ; puis une seconde
--     redefinition qui change encore la forme (cas 239) reussit aussi apres DROP.
select lives_ok(
  $regr$
    create function public._regr_support_fils_237()
    returns table(entreprise_id uuid, non_lus integer, total integer)
    language sql stable as $b$ select null::uuid, 0, 0 $b$
  $regr$,
  'recreation en integer apres DROP reussit (etat vise par 237)'
);
select lives_ok(
  $regr$
    drop function if exists public._regr_support_fils_237();
    create function public._regr_support_fils_237()
    returns table(entreprise_id uuid, dernier_at timestamptz, non_lus integer, total integer)
    language sql stable as $b$ select null::uuid, null::timestamptz, 0, 0 $b$
  $regr$,
  'redefinition ulterieure (forme 239) reussit a son tour via drop-then-create'
);

select * from finish();
rollback;
