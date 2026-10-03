-- PONT D'UPGRADE PRODUCTION (PROPOSÉ, NON intégré au train) — réactivation du verrou des lignes de
-- factures émises après le backfill de 20260921000300. Voir 20260921000298_pont_upgrade_*_avant_backfill.sql.
-- Idempotent et inconditionnel : sur une base où le trigger n'a jamais été désactivé, ne change rien.
do $pont$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.lignes_factures'::regclass
              and tgname = 'lignes_factures_brouillon_only' and not tgisinternal and tgenabled <> 'O') then
    alter table public.lignes_factures enable trigger lignes_factures_brouillon_only;
  end if;
end
$pont$;
