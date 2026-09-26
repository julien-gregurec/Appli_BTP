-- Déroulé SQL de scripts/purger-entreprise.mjs (mode execute), pour pgTAP et pour le
-- harnais de qualification : mêmes RPC, même ordre (rapport topologique, 5 passes de
-- rattrapage, anonymisation, Storage ORPHELIN uniquement, marquage).
--
-- Entrée : set_config('rgpd.entreprise_cible', <uuid>, true) et
--          set_config('rgpd.run_id', <uuid>, true).
-- Sortie : set_config('rgpd.resultat', 'complete' | 'incomplete:<tables>', true).
-- Rôle : exécuté sous `service_role`, comme le script (SUPABASE_SERVICE_ROLE_KEY).
-- La suppression Storage passe par l'API Storage dans le script ; ici elle est faite
-- directement sur storage.objects, qui est ce que l'API supprime côté base.
create temporary table if not exists _rgpd_orphelins (bucket_id text, chemin text) on commit drop;
delete from _rgpd_orphelins;
grant all on _rgpd_orphelins to service_role;
select set_config('rgpd.resultat', 'demarre', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);

do $rgpd_driver$
declare
  v_ent uuid := current_setting('rgpd.entreprise_cible')::uuid;
  v_run uuid := current_setting('rgpd.run_id')::uuid;
  v_t record;
  v_res record;
  v_echecs text[] := '{}';
  v_restants text[];
  v_passe integer := 1;
  v_progres boolean := true;
begin
  for v_t in select table_nom from public.rapport_purge_entreprise(v_ent) where categorie = 'DELETE' order by ordre, table_nom loop
    select * into v_res from public.purger_table_entreprise(v_ent, v_t.table_nom, v_run);
    if not v_res.ok then v_echecs := v_echecs || v_t.table_nom; end if;
  end loop;

  while cardinality(v_echecs) > 0 and v_progres and v_passe <= 5 loop
    v_progres := false; v_passe := v_passe + 1; v_restants := '{}';
    for v_t in select unnest(v_echecs) as table_nom loop
      select * into v_res from public.purger_table_entreprise(v_ent, v_t.table_nom, v_run);
      if v_res.ok then v_progres := true; else v_restants := v_restants || v_t.table_nom; end if;
    end loop;
    v_echecs := v_restants;
  end loop;

  if cardinality(v_echecs) > 0 then
    perform set_config('rgpd.resultat', 'incomplete:' || array_to_string(v_echecs, ','), true);
    return;
  end if;

  for v_t in select table_nom from public.rapport_purge_entreprise(v_ent) where categorie = 'ANONYMIZE' loop
    select * into v_res from public.anonymiser_table_entreprise(v_ent, v_t.table_nom, v_run);
    if not v_res.ok then
      perform set_config('rgpd.resultat', 'incomplete:anonymiser:' || v_t.table_nom || ':' || v_res.erreur, true);
      return;
    end if;
  end loop;

  -- Balayage final (comme le script) : une suppression tardive (devis, chantiers…) peut
  -- recréer par trigger une ligne dans une table DELETE déjà vidée
  -- (entreprises_dashboard_cache). On relit le rapport jusqu'à stabilité.
  for v_passe in 1..3 loop
    v_progres := false;
    for v_t in select table_nom from public.rapport_purge_entreprise(v_ent) where categorie = 'DELETE' order by ordre, table_nom loop
      select * into v_res from public.purger_table_entreprise(v_ent, v_t.table_nom, v_run);
      v_progres := true;
    end loop;
    exit when not v_progres;
  end loop;

  insert into _rgpd_orphelins
    select s.bucket_id, s.chemin from public.verifier_storage_entreprise(v_ent) s where s.categorie = 'ORPHELIN';
  perform set_config('rgpd.storage_orphelins', (select count(*)::text from _rgpd_orphelins), true);
  perform set_config('rgpd.resultat', 'storage', true);
end
$rgpd_driver$;

-- API Storage : suppression des seuls fichiers ORPHELIN.
reset role;
delete from storage.objects o using _rgpd_orphelins r where o.bucket_id = r.bucket_id and o.name = r.chemin
  and current_setting('rgpd.resultat') = 'storage';

set local role service_role;
do $rgpd_marquage$
begin
  if current_setting('rgpd.resultat') = 'storage' then
    perform public.marquer_entreprise_purgee(current_setting('rgpd.entreprise_cible')::uuid, current_setting('rgpd.run_id')::uuid);
    perform set_config('rgpd.resultat', 'complete', true);
  end if;
end
$rgpd_marquage$;
reset role;
