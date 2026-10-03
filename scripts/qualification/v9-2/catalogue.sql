-- Train canonique V9.2 — empreinte de catalogue (schémas applicatifs) pour comparaison de bases.
-- Une ligne par objet : <catégorie>|<clé>|<définition>. Tri stable. Lecture seule.
-- Usage : psql -X -At -d <base> -f scripts/qualification/v9-2/catalogue.sql
with sch as (
  select oid, nspname from pg_namespace
  where nspname in ('public','private','auth','storage','extensions','platform','studio','supabase_functions')
     or nspname like 'elsatia%'
)
select regexp_replace(l, E'[\n\r]+', ' ', 'g') from (
  -- tables et colonnes
  select 'colonne|'||s.nspname||'.'||c.relname||'.'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)
         ||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(d.adbin,d.adrelid),'') as l
  from pg_class c join sch s on s.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
  where c.relkind in ('r','p','v','m','f')
  union all
  select 'table|'||s.nspname||'.'||c.relname||'|kind='||c.relkind::text||' rls='||c.relrowsecurity||' force='||c.relforcerowsecurity||' owner='||pg_get_userbyid(c.relowner)
  from pg_class c join sch s on s.oid=c.relnamespace where c.relkind in ('r','p','v','m','f','S')
  union all
  select 'contrainte|'||s.nspname||'.'||c.relname||'.'||k.conname||'|'||pg_get_constraintdef(k.oid)||' valid='||k.convalidated
  from pg_constraint k join pg_class c on c.oid=k.conrelid join sch s on s.oid=c.relnamespace
  union all
  select 'index|'||s.nspname||'.'||i.relname||'|'||pg_get_indexdef(i.oid)
  from pg_index x join pg_class i on i.oid=x.indexrelid join sch s on s.oid=i.relnamespace
  union all
  select 'trigger|'||s.nspname||'.'||c.relname||'.'||t.tgname||'|'||pg_get_triggerdef(t.oid)||' enabled='||t.tgenabled::text
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join sch s on s.oid=c.relnamespace where not t.tgisinternal
  union all
  select 'policy|'||schemaname||'.'||tablename||'.'||policyname||'|'||permissive||' '||cmd||' roles='||array_to_string(roles,',')
         ||' using='||coalesce(qual,'')||' check='||coalesce(with_check,'')
  from pg_policies where schemaname in (select nspname from sch)
  union all
  select 'fonction|'||s.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|md5='||md5(pg_get_functiondef(p.oid))
         ||' secdef='||p.prosecdef||' volat='||p.provolatile::text||' owner='||pg_get_userbyid(p.proowner)
  from pg_proc p join sch s on s.oid=p.pronamespace where p.prokind in ('f','p')
  union all
  select 'acl_fonction|'||s.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||coalesce(array_to_string(array(select unnest(p.proacl)::text order by 1),','),'<defaut>')
  from pg_proc p join sch s on s.oid=p.pronamespace
  union all
  select 'acl_table|'||s.nspname||'.'||c.relname||'|'||coalesce(array_to_string(array(select unnest(c.relacl)::text order by 1),','),'<defaut>')
  from pg_class c join sch s on s.oid=c.relnamespace where c.relkind in ('r','p','v','m','f','S')
  union all
  select 'acl_colonne|'||s.nspname||'.'||c.relname||'.'||a.attname||'|'||array_to_string(array(select unnest(a.attacl)::text order by 1),',')
  from pg_class c join sch s on s.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and a.attacl is not null
  union all
  select 'acl_schema|'||s.nspname||'|'||coalesce(array_to_string(array(select unnest(n.nspacl)::text order by 1),','),'<defaut>')
  from pg_namespace n join sch s on s.oid=n.oid
  union all
  select 'defacl|'||pg_get_userbyid(d.defaclrole)||'.'||coalesce(n.nspname,'*')||'.'||d.defaclobjtype::text||'|'||array_to_string(array(select unnest(d.defaclacl)::text order by 1),',')
  from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
  union all
  select 'extension|'||extname||'|'||extversion from pg_extension
) x order by 1;
