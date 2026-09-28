-- DR V2 — inventaire des MÉTADONNÉES Storage d'une base (JSON sur une ligne).
-- Les fichiers binaires ne sont pas dans PostgreSQL : cet inventaire décrit ce que la base
-- croit exister (buckets, objets, tailles déclarées) et les références métier vers Storage,
-- pour détecter après restauration une référence pendante (ligne métier → objet absent).
select jsonb_pretty(jsonb_build_object(
  'buckets', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public,
                'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types) order by b.id), '[]')
                from storage.buckets b),
  'objets_par_bucket', (select coalesce(jsonb_object_agg(bucket_id, jsonb_build_object('objets', n, 'octets_declares', o)), '{}')
                from (select bucket_id, count(*) n, coalesce(sum((metadata->>'size')::bigint), 0) o
                        from storage.objects group by bucket_id) x),
  'objets_empreinte', (select md5(coalesce(string_agg(bucket_id || '/' || name, E'\n' order by bucket_id, name), '')) from storage.objects),
  'references_metier', jsonb_build_object(
    'tools_releves_medias', (select jsonb_build_object('lignes', count(*),
        'objets_absents', count(*) filter (where not exists (select 1 from storage.objects o
                            where o.bucket_id = 'tools-releves' and o.name = m.storage_path)))
        from public.tools_releves_medias m),
    'reserves_photos', (select jsonb_build_object('lignes', count(*)) from public.reserves_photos),
    'reserves_plans', (select jsonb_build_object('lignes', count(*)) from public.reserves_plans),
    'documents_chantier', (select jsonb_build_object('lignes', count(*)) from public.documents_chantier),
    'pieces_jointes_devis', (select jsonb_build_object('lignes', count(*)) from public.pieces_jointes_devis),
    'pieces_jointes_messages', (select jsonb_build_object('lignes', count(*)) from public.pieces_jointes_messages)
  )
));
