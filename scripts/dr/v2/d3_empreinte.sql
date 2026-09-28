-- DR V2 — Disaster 3 : empreinte d'état RGPD d'un tenant, indépendante de l'horloge et des
-- identifiants de run (reprise de scripts/qualification/rgpd-end-to-end-v3.sh).
-- Usage : psql -v e=<entreprise_id> -f d3_empreinte.sql
select md5(string_agg(x, '|' order by x)) from (
  select 'f:' || f.id || ':' || public.empreinte_comptable_facture(f.id)
         || ':' || coalesce(f.chantier_id::text, '-') || ':' || coalesce(f.devis_origine_id::text, '-')
         || ':' || coalesce((select string_agg(k || '=' || (v - 'purge_le')::text, ',' order by k)
                             from jsonb_each(f.purge_snapshot) as e(k, v)), '-') as x
    from public.factures f where f.entreprise_id = :'e'
  union all
  select 't:' || r.table_nom || ':' || r.categorie || ':' || r.nb_lignes from public.rapport_purge_entreprise(:'e') r
  union all
  select 'c:' || (to_jsonb(c) - 'updated_at' - 'created_at')::text from public.clients c where c.entreprise_id = :'e'
  union all
  select 'e:' || (to_jsonb(x) - 'updated_at' - 'purgee_at' - 'created_at' - 'suppression_prevue_at')::text || ':' || (x.purgee_at is not null)
    from public.entreprises x where x.id = :'e'
  union all
  select 's:' || o.bucket_id || '/' || o.name from storage.objects o where o.name like :'e' || '/%'
  union all
  select 'p:' || p.type_contrat || ':' || p.source_id || ':' || p.niveau || ':' || p.politique || ':' || p.decision_ref
         || ':' || p.empreinte_document || ':' || p.empreinte_contenu || ':' || coalesce(p.conserver_jusqu_au::text, '-')
    from platform.contrats_acceptes_purges p where p.entreprise_id = :'e'
) t;
