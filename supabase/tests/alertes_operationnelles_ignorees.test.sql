begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_table(
  'public',
  'alertes_operationnelles_ignorees',
  'Les alertes opérationnelles ignorées sont enregistrées'
);
select has_column(
  'public',
  'alertes_operationnelles_ignorees',
  'signature',
  'La signature permet de réactiver une alerte qui évolue'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.alertes_operationnelles_ignorees'::regclass),
  'RLS active sur les alertes ignorées'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'alertes_operationnelles_ignorees'
  ),
  4,
  'Les quatre opérations sont protégées par RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.alertes_operationnelles_ignorees', 'select'),
  'Un utilisateur authentifié peut lire ses propres masquages'
);
select ok(
  has_table_privilege('authenticated', 'public.alertes_operationnelles_ignorees', 'insert'),
  'Un utilisateur authentifié peut ignorer une alerte'
);
select ok(
  not has_table_privilege('anon', 'public.alertes_operationnelles_ignorees', 'select'),
  'Aucun accès anonyme aux alertes ignorées'
);

select * from finish();
rollback;
