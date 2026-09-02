-- Compatibilité append-only pour la signature historique de
-- plateforme_entreprises() observée sur Production 210.
--
-- Preview possède déjà la signature attendue par la migration 237 : cette
-- migration y est un no-op. Production conserve encore les colonnes option_ia
-- dans le type de retour ; PostgreSQL exige alors un DROP avant le remplacement.

do $$
declare
  v_result text;
begin
  select pg_get_function_result(p.oid)
    into v_result
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'plateforme_entreprises'
    and p.pronargs = 0;

  if v_result like '%option_ia_statut%' then
    drop function public.plateforme_entreprises();
  end if;
end $$;
