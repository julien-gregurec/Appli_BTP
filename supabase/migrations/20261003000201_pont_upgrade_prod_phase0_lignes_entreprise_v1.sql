-- elsatia:upgrade-phase0
-- PONT D'UPGRADE PRODUCTION — PHASE 0 (UPG-P0-1, UPG-LOCK-1, UPG-P3-1)
-- docs/qualification/ELSATIA_PLATFORM_READINESS_V9_1.md §PRODUCTION_BRIDGES
--
-- Version POSTÉRIEURE à tout le train V9.1 : ce fichier ne s'insère avant aucune migration déjà
-- appliquée (Preview, V9.1). Sur toute base qui a déjà 20260921000300, il ne fait RIEN.
--
-- Constat (harnais Production → V9.x) : 20260921000300 backfille lignes_devis.entreprise_id et
-- lignes_factures.entreprise_id par UPDATE. Sur une Production historique (ledger 210) :
--   UPG-P0-1   le trigger lignes_factures_brouillon_only refuse la mise à jour des lignes d'une facture
--              émise → 300 échoue dès qu'une facture émise a des lignes (toute Production réelle) ;
--   UPG-LOCK-1 chaque ligne mise à jour relance le recalcul complet de son devis / sa facture
--              (coût quadratique, 21 min sous ACCESS EXCLUSIVE à 100 000 lignes) ;
--   UPG-P3-1   ces recalculs réécrivent devis/factures.updated_at de tout l'historique.
--
-- Principe : sur une Production historique, ce fichier est appliqué EN PREMIER (phase 0 du cutover,
-- avant `db push --include-all`, cf. runbook). Il prépare exactement la donnée que 300 posera :
-- colonne entreprise_id (nullable, sans contrainte) + valeur du parent. Quand 300 s'exécute ensuite,
-- son « add column if not exists » est sans effet et son UPDATE (« where entreprise_id is distinct from
-- parent ») ne touche plus aucune ligne : aucun trigger ne se déclenche, aucun total, aucune date
-- n'est réécrit. 300 pose ensuite NOT NULL, la FK composite, l'index, le trigger et les policies
-- comme sur un fresh : état final identique.
--
-- Pendant SA transaction seulement, les triggers utilisateur actifs des deux tables de lignes sont
-- désactivés (le backfill ne change QUE entreprise_id, valeur déjà portée par le parent : aucun total,
-- aucune tâche, aucun verrou métier n'en dépend), puis réactivés à l'identique avant COMMIT. Aucun
-- trigger ne reste désactivé au-delà de ce fichier. Aucune fonction, aucun droit, aucune policy créés.
--
-- No-op (sans écriture ni verrou fort) :
--   * 20260921000300 au ledger (Preview hébergée, V9.1 construite, fresh install : ce fichier y est
--     appliqué en dernier, après 300) ;
--   * ou colonnes déjà en place (entreprise_id NOT NULL sur les deux tables).
-- Idempotent : rejoué, il ne retouche que les lignes encore non préparées (aucune s'il n'y en a pas).
do $pont$
declare
  v_trigger record;
  v_desactives text[] := '{}';
  v_devis bigint := 0;
  v_factures bigint := 0;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null
     and exists (select 1 from supabase_migrations.schema_migrations where version = '20260921000300') then
    raise notice 'pont phase 0 : 20260921000300 déjà au ledger — aucune action';
    return;
  end if;
  if to_regclass('public.lignes_devis') is null or to_regclass('public.lignes_factures') is null then
    raise notice 'pont phase 0 : tables de lignes absentes — aucune action';
    return;
  end if;
  if (select count(*) from pg_attribute
       where attrelid in ('public.lignes_devis'::regclass, 'public.lignes_factures'::regclass)
         and attname = 'entreprise_id' and attnotnull and not attisdropped) = 2 then
    raise notice 'pont phase 0 : entreprise_id déjà posée et NOT NULL — aucune action';
    return;
  end if;

  alter table public.lignes_devis add column if not exists entreprise_id uuid;
  alter table public.lignes_factures add column if not exists entreprise_id uuid;

  for v_trigger in
    select c.relname, g.tgname
      from pg_trigger g join pg_class c on c.oid = g.tgrelid
     where c.oid in ('public.lignes_devis'::regclass, 'public.lignes_factures'::regclass)
       and not g.tgisinternal and g.tgenabled = 'O'
     order by 1, 2
  loop
    execute format('alter table public.%I disable trigger %I', v_trigger.relname, v_trigger.tgname);
    v_desactives := v_desactives || (v_trigger.relname || '.' || v_trigger.tgname);
  end loop;

  update public.lignes_devis ld
     set entreprise_id = d.entreprise_id
    from public.devis d
   where d.id = ld.devis_id and ld.entreprise_id is distinct from d.entreprise_id;
  get diagnostics v_devis = row_count;

  update public.lignes_factures lf
     set entreprise_id = f.entreprise_id
    from public.factures f
   where f.id = lf.facture_id and lf.entreprise_id is distinct from f.entreprise_id;
  get diagnostics v_factures = row_count;

  for v_trigger in
    select split_part(x, '.', 1) as relname, split_part(x, '.', 2) as tgname from unnest(v_desactives) x
  loop
    execute format('alter table public.%I enable trigger %I', v_trigger.relname, v_trigger.tgname);
  end loop;

  if exists (select 1 from pg_trigger g
              where g.tgrelid in ('public.lignes_devis'::regclass, 'public.lignes_factures'::regclass)
                and not g.tgisinternal and g.tgenabled <> 'O'
                and (g.tgrelid::regclass::text || '.' || g.tgname) = any (
                  select 'public.' || x from unnest(v_desactives) x)) then
    raise exception 'pont phase 0 : un trigger n''a pas été réactivé — transaction annulée';
  end if;

  raise notice 'pont phase 0 : % ligne(s) de devis et % ligne(s) de factures préparées ; triggers neutralisés le temps du backfill puis réactivés : %',
    v_devis, v_factures, array_to_string(v_desactives, ', ');
end
$pont$;
