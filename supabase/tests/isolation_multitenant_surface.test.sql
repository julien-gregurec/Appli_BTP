begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.compteurs_reference'::regclass),
  'RLS est active sur la table technique des compteurs'
);

select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema = 'public'
      and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
  ),
  0,
  'Les rôles applicatifs ne possèdent aucun privilège DDL ou TRUNCATE'
);

select ok(
  has_table_privilege('authenticated', 'public.entreprises', 'SELECT,INSERT,UPDATE')
    and has_table_privilege('authenticated', 'public.utilisateurs', 'SELECT,INSERT,UPDATE')
    and has_table_privilege('authenticated', 'public.utilisateurs_entreprises', 'SELECT,INSERT,UPDATE'),
  'Le rôle authenticated peut utiliser le socle comptes sous contrôle RLS'
);

select ok(
  not has_table_privilege('anon', 'public.entreprises', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.utilisateurs', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.utilisateurs_entreprises', 'SELECT,INSERT,UPDATE,DELETE'),
  'Le rôle anonyme ne possède aucun privilège sur le socle comptes'
);

select ok(
  coalesce(
    (
      select array_to_string(proconfig, ',') ilike '%search_path=%'
      from pg_proc
      where oid = 'public.entreprise_sans_membres(uuid)'::regprocedure
    ),
    false
  ),
  'La fonction de bootstrap fixe explicitement son search_path'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.peut_voir_document_chantier(uuid)',
    'EXECUTE'
  ),
  'Le rôle anonyme ne peut pas appeler directement le contrôle documentaire'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.plateforme_creer_version_tarif(text,text,numeric,numeric,integer,integer,integer,numeric,date,text)',
    'EXECUTE'
  ),
  'Le rôle anonyme ne peut pas appeler la mutation tarifaire plateforme'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.prorettype <> 'trigger'::regtype
  ),
  0,
  'Aucune fonction SECURITY DEFINER métier n’est exécutable par anon'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not coalesce(
        array_to_string(p.proconfig, ',') ilike '%search_path=%',
        false
      )
  ),
  0,
  'Toutes les fonctions SECURITY DEFINER fixent leur search_path'
);

select is(
  (
    with expressions_politiques as (
      select
        lower(
          replace(
            coalesce(pg_get_expr(polqual, polrelid), '')
              || ' '
              || coalesce(pg_get_expr(polwithcheck, polrelid), ''),
            ' ',
            ''
          )
        ) as expression
      from pg_policy
    )
    select count(distinct p.oid)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join expressions_politiques ep
      on position(lower(p.proname) || '(' in ep.expression) > 0
    where n.nspname = 'public'
      and p.prorettype <> 'trigger'::regtype
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  0,
  'Toute fonction appelée par une politique RLS est exécutable par authenticated'
);

select * from finish();
rollback;
