-- PONT D'UPGRADE PRODUCTION (PROPOSÉ par le harnais ELSATIA production → V9.x, NON intégré au train).
-- docs/qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md, constat UPG-P0-1.
--
-- Constat : 20260921000300_correctif_perf_rls_lignes_devis_factures backfille lignes_factures.entreprise_id
-- par UPDATE. Sur toute base qui contient une facture ÉMISE avec des lignes (toute Production réelle),
-- le trigger historique lignes_factures_brouillon_only (présent depuis 20260710000007 / 20260822000222,
-- donc en Production 210) lève « Les lignes d'une facture émise ne peuvent plus être modifiées » :
-- la migration 300 échoue, l'upgrade s'arrête (transaction annulée, ledger cohérent, aucun dégât).
-- Les fresh et la Preview hébergée ne l'ont pas vu : 300 y a été appliquée sans facture émise.
--
-- Pont : désactive CE SEUL trigger, juste avant 300, UNIQUEMENT si 300 n'est pas encore au ledger
-- (Preview hébergée et toute base déjà au-delà : no-op). Réactivation inconditionnelle par
-- 20260921000399_pont_upgrade_lignes_factures_emises_apres_backfill.sql (idempotente). Aucune donnée,
-- aucune fonction, aucun droit modifié ; état final identique à un fresh.
do $pont$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null
     and exists (select 1 from supabase_migrations.schema_migrations where version = '20260921000300') then
    return;
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.lignes_factures'::regclass
              and tgname = 'lignes_factures_brouillon_only' and not tgisinternal) then
    alter table public.lignes_factures disable trigger lignes_factures_brouillon_only;
  end if;
end
$pont$;
