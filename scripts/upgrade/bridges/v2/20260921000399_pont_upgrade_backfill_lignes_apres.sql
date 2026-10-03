-- PONT D'UPGRADE PRODUCTION v2 (PROPOSÉ, NON intégré au train) — réactivation des quatre triggers neutralisés
-- par 20260921000298 pendant le backfill de 20260921000300. Idempotent et inconditionnel.
do $pont$
declare t record;
begin
  for t in select c.relname, g.tgname from pg_trigger g join pg_class c on c.oid = g.tgrelid
            where c.relnamespace = 'public'::regnamespace and not g.tgisinternal and g.tgenabled <> 'O'
              and (c.relname, g.tgname) in (('lignes_factures', 'lignes_factures_brouillon_only'),
                                            ('lignes_factures', 'recalc_facture_apres_ligne'),
                                            ('lignes_devis', 'recalc_devis_apres_ligne'),
                                            ('lignes_devis', 'synchroniser_taches_ligne_devis')) loop
    execute format('alter table public.%I enable trigger %I', t.relname, t.tgname);
  end loop;
end
$pont$;
