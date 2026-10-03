-- PONT D'UPGRADE PRODUCTION — CONTRÔLE FINAL (UPG-P0-1)
-- docs/qualification/ELSATIA_PLATFORM_READINESS_V9_1.md §PRODUCTION_BRIDGES
--
-- Appliqué en dernier sur toute base (fresh, Preview, V9.1, Production historique). Garantit que
-- l'état laissé par 20260921000300 et par la phase 0 (20261003000201) est l'état d'un fresh :
--   1. les triggers métier des lignes de devis / factures sont ACTIFS. Ils ne peuvent être désactivés
--      que par une intervention manuelle (ex. ponts « 298 / 399 » proposés par le harnais V1, jamais
--      intégrés) : ils sont alors réactivés ; sinon rien n'est modifié ;
--   2. entreprise_id est posée, NOT NULL et égale au parent sur les deux tables : sinon la migration
--      ÉCHOUE (transaction annulée, ledger inchangé) plutôt que de laisser une base incohérente.
-- Aucune donnée, fonction, policy ni droit modifié. Idempotent.
do $controle$
declare
  v_trigger record;
  v_ecarts bigint;
begin
  for v_trigger in
    select c.relname, g.tgname
      from pg_trigger g join pg_class c on c.oid = g.tgrelid
     where c.oid in ('public.lignes_devis'::regclass, 'public.lignes_factures'::regclass)
       and not g.tgisinternal and g.tgenabled <> 'O'
       and (c.relname, g.tgname) in (('lignes_factures', 'lignes_factures_brouillon_only'),
                                     ('lignes_factures', 'recalc_facture_apres_ligne'),
                                     ('lignes_factures', 'fixer_entreprise_ligne_facture'),
                                     ('lignes_devis', 'recalc_devis_apres_ligne'),
                                     ('lignes_devis', 'synchroniser_taches_ligne_devis'),
                                     ('lignes_devis', 'verrou_lignes_devis_accepte'),
                                     ('lignes_devis', 'fixer_entreprise_ligne_devis'))
  loop
    execute format('alter table public.%I enable trigger %I', v_trigger.relname, v_trigger.tgname);
    raise notice 'contrôle final : trigger %.% réactivé', v_trigger.relname, v_trigger.tgname;
  end loop;

  if (select count(*) from pg_attribute
       where attrelid in ('public.lignes_devis'::regclass, 'public.lignes_factures'::regclass)
         and attname = 'entreprise_id' and attnotnull and not attisdropped) <> 2 then
    raise exception 'contrôle final : entreprise_id absente ou nullable sur les lignes de devis / factures';
  end if;

  select count(*) into v_ecarts
    from public.lignes_devis ld join public.devis d on d.id = ld.devis_id
   where ld.entreprise_id is distinct from d.entreprise_id;
  if v_ecarts > 0 then
    raise exception 'contrôle final : % ligne(s) de devis avec un entreprise_id différent du devis', v_ecarts;
  end if;

  select count(*) into v_ecarts
    from public.lignes_factures lf join public.factures f on f.id = lf.facture_id
   where lf.entreprise_id is distinct from f.entreprise_id;
  if v_ecarts > 0 then
    raise exception 'contrôle final : % ligne(s) de factures avec un entreprise_id différent de la facture', v_ecarts;
  end if;
end
$controle$;
