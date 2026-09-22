-- authenticated dispose désormais, de façon explicite dans les migrations, des
-- privilèges de table nécessaires sur le socle comptes (RLS déjà en place et
-- inchangée). Voir 20260922000189_grants_explicites_socle_comptes.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(
  has_table_privilege('authenticated', 'public.entreprises', 'SELECT,INSERT,UPDATE')
    and has_table_privilege('authenticated', 'public.utilisateurs', 'SELECT,INSERT,UPDATE')
    and has_table_privilege('authenticated', 'public.utilisateurs_entreprises', 'SELECT,INSERT,UPDATE'),
  'authenticated peut utiliser le socle comptes (sous contrôle RLS)'
);
select ok(
  not has_table_privilege('anon', 'public.entreprises', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.utilisateurs', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.utilisateurs_entreprises', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon ne possède aucun privilège sur le socle comptes'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.entreprises'::regclass),
  'la RLS reste le contrôle réel sur entreprises (le GRANT ne la remplace pas)'
);

select * from finish();
rollback;
