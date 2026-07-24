-- Nettoyage global des séquences d'encodage historiques.
-- Les motifs et remplacements sont construits avec chr() afin de rester stables
-- même lorsque le SQL transite par un presse-papier qui n'est pas en UTF-8.

create or replace function public.corriger_mojibake(p_texte text) returns text
language sql immutable parallel safe as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(p_texte,
    chr(8730)||chr(169),chr(233)),
    chr(8730)||chr(174),chr(232)),
    chr(8730)||chr(8482),chr(234)),
    chr(8730)||chr(165),chr(244)),
    chr(8730)||chr(8224),chr(224)),
    chr(8730)||chr(223),chr(231)),
    chr(8730)||chr(162),chr(226)),
    chr(8730)||chr(186),chr(251)),
    chr(8730)||chr(180),chr(235)),
    chr(8730)||chr(198),chr(238)),
    chr(195)||chr(169),chr(233)),
    chr(195)||chr(168),chr(232)),
    chr(195)||chr(170),chr(234)),
    chr(195)||chr(180),chr(244)),
    chr(195)||chr(160),chr(224)),
    chr(195)||chr(167),chr(231)),
    chr(195)||chr(162),chr(226)),
    chr(195)||chr(187),chr(251)),
    chr(195)||chr(171),chr(235)),
    chr(226)||chr(8364)||chr(8482),chr(8217)),
    chr(194)||chr(183),chr(183)),
    chr(194)||chr(176),chr(176));
$$;

do $$
declare r record; v_sql text;
begin
  for r in
    select c.table_name,c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
    where c.table_schema='public'
      and t.table_type='BASE TABLE'
      and c.data_type in ('text','character varying','character')
  loop
    v_sql:=format(
      'update public.%I set %I=public.corriger_mojibake(%I) where %I is distinct from public.corriger_mojibake(%I)',
      r.table_name,r.column_name,r.column_name,r.column_name,r.column_name
    );
    begin execute v_sql; exception when others then null; end;
  end loop;
end$$;

notify pgrst,'reload schema';
