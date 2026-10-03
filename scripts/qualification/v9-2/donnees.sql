-- Train canonique V9.2 — empreinte des données (toutes tables des schémas applicatifs).
-- Une ligne par table : donnees|<schéma.table>|n=<lignes> md5=<empreinte du contenu trié>.
-- Colonnes volatiles exclues : horodatages, défauts now()/aléatoires/uuid (identiques en sémantique
-- d'une construction à l'autre, différents en valeur) ; UUID et horodatages imbriqués
-- (jsonb d'historique) remplacés par <uuid> / <horodatage>.
do $$
declare r record; n bigint; h text; exclues text[]; tris text;
begin
  create temp table if not exists _empreintes(l text);
  for r in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where c.relkind in ('r','p') and n.nspname in ('public','private','platform','storage') order by 1,2 loop
    -- colonnes volatiles d'une construction à l'autre : horodatages et identifiants aléatoires
    select coalesce(array_agg(a.attname::text), '{}') into exclues
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = format('%I.%I', r.nspname, r.relname)::regclass and a.attnum > 0 and not a.attisdropped
      and (format_type(a.atttypid, a.atttypmod) like 'timestamp%'
           or pg_get_expr(d.adbin, d.adrelid) ~* '(now\(\)|random|uuid_generate|current_)');
    -- tableaux : ordre non garanti par certaines migrations (array_agg sans ORDER BY) → triés
    select coalesce(string_agg(format(' || jsonb_build_object(%L, (select to_jsonb(array_agg(e order by e)) from unnest(t.%I) e))', a.attname, a.attname), ''), '')
      into tris
    from pg_attribute a join pg_type ty on ty.oid = a.atttypid
    where a.attrelid = format('%I.%I', r.nspname, r.relname)::regclass and a.attnum > 0 and not a.attisdropped
      and ty.typcategory = 'A' and not (a.attname = any(exclues));
    -- identifiants aléatoires imbriqués (jsonb d'historique) : remplacés par un jeton
    execute format($q$select count(*), coalesce(md5(string_agg(x, %L order by x)), %L)
                     from (select regexp_replace(regexp_replace(((to_jsonb(t) - %L::text[])%s)::text,
                             '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<uuid>', 'g'),
                             '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}', '<horodatage>', 'g') x
                           from %I.%I t) s$q$,
                   E'\n', '-', exclues, tris, r.nspname, r.relname) into n, h;
    insert into _empreintes values ('donnees|'||r.nspname||'.'||r.relname||'|n='||n||' md5='||h);
  end loop;
end $$;
select l from _empreintes order by 1;
