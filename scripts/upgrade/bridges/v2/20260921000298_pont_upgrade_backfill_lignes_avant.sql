-- PONT D'UPGRADE PRODUCTION v2 (PROPOSÉ par le harnais ELSATIA production → V9.x, NON intégré au train).
-- docs/qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md, constats UPG-P0-1, UPG-LOCK-1, UPG-P3-1.
--
-- 20260921000300 backfille lignes_devis.entreprise_id et lignes_factures.entreprise_id par UPDATE :
--   UPG-P0-1   le trigger lignes_factures_brouillon_only REFUSE la mise à jour des lignes d'une facture émise
--              → la migration échoue sur toute Production réelle (transaction annulée, upgrade arrêté) ;
--   UPG-LOCK-1 chaque ligne mise à jour déclenche le recalcul COMPLET de son devis / sa facture
--              (trg_recalc_devis / trg_recalc_facture) et la resynchronisation des tâches : coût quadratique,
--              verrous ACCESS EXCLUSIVE tenus 7,4 s à 5 000 lignes (mesuré) ;
--   UPG-P3-1   ces recalculs réécrivent devis/factures.updated_at (montants identiques) : la « dernière
--              modification » de tout l'historique devient l'instant de l'upgrade.
-- Le backfill ne change QUE entreprise_id (valeur déjà portée par le parent) : aucun total, aucune tâche ne
-- peut en dépendre. Ce pont désactive, juste avant 300 et UNIQUEMENT si 300 n'est pas au ledger (no-op sur la
-- Preview hébergée et toute base déjà au-delà), les quatre triggers concernés ; 20260921000399 les réactive.
-- Aucune donnée, fonction ni droit modifié ; état final identique à un fresh.
do $pont$
declare t record;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null
     and exists (select 1 from supabase_migrations.schema_migrations where version = '20260921000300') then
    return;
  end if;
  for t in select c.relname, g.tgname from pg_trigger g join pg_class c on c.oid = g.tgrelid
            where c.relnamespace = 'public'::regnamespace and not g.tgisinternal and g.tgenabled = 'O'
              and (c.relname, g.tgname) in (('lignes_factures', 'lignes_factures_brouillon_only'),
                                            ('lignes_factures', 'recalc_facture_apres_ligne'),
                                            ('lignes_devis', 'recalc_devis_apres_ligne'),
                                            ('lignes_devis', 'synchroniser_taches_ligne_devis')) loop
    execute format('alter table public.%I disable trigger %I', t.relname, t.tgname);
  end loop;
end
$pont$;
