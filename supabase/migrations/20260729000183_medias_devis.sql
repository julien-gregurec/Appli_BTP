-- Photos et explications vocales jointes aux devis.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'devis-medias','devis-medias',false,20971520,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'audio/webm','audio/mp4','audio/mpeg','audio/wav']
)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table public.pieces_jointes_devis(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  devis_id uuid not null references public.devis(id) on delete cascade,
  storage_path text not null unique check(btrim(storage_path)<>''),
  nom_original text not null check(btrim(nom_original)<>''),
  mime_type text not null check(mime_type in(
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'audio/webm','audio/mp4','audio/mpeg','audio/wav'
  )),
  type_media text not null check(type_media in('image','audio')),
  taille_octets bigint not null check(taille_octets>0 and taille_octets<=20971520),
  legende text check(length(legende)<=1000),
  created_at timestamptz not null default now(),
  unique(id,entreprise_id,devis_id)
);
create index pieces_jointes_devis_liste_idx
  on public.pieces_jointes_devis(entreprise_id,devis_id,created_at);

-- Centralise la règle de lecture afin que les médias suivent exactement les
-- droits du devis. Un collaborateur terrain ne voit que les devis des
-- chantiers auxquels il est réellement affecté.
create or replace function public.peut_lire_devis(p_devis_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(
    select 1
    from public.devis d
    where d.id=p_devis_id
      and public.est_membre_actif(d.entreprise_id)
      and (
        public.a_permission(d.entreprise_id,'acces_devis')
        or (
          public.a_permission(d.entreprise_id,'voir_devis_chantier_sans_prix')
          and d.chantier_id is not null
          and exists(
            select 1
            from public.employes e
            where e.entreprise_id=d.entreprise_id
              and e.utilisateur_id=auth.uid()
              and e.statut not in ('sorti','suspendu')
              and (
                exists(
                  select 1 from public.equipes_chantiers ec
                  where ec.entreprise_id=d.entreprise_id
                    and ec.chantier_id=d.chantier_id
                    and ec.employe_id=e.id
                    and ec.date_debut<=current_date
                    and (ec.date_fin is null or ec.date_fin>=current_date)
                )
                or exists(
                  select 1 from public.affectations a
                  where a.entreprise_id=d.entreprise_id
                    and a.chantier_id=d.chantier_id
                    and a.employe_id=e.id
                )
              )
          )
        )
      )
  );
$$;
revoke all on function public.peut_lire_devis(uuid) from public,anon;
grant execute on function public.peut_lire_devis(uuid) to authenticated;

alter table public.pieces_jointes_devis enable row level security;
create policy pieces_jointes_devis_lecture on public.pieces_jointes_devis
  for select to authenticated using(
    public.peut_lire_devis(devis_id)
  );
grant select on public.pieces_jointes_devis to authenticated;

create or replace function public.enregistrer_pieces_jointes_devis(
  p_devis_id uuid,p_pieces jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare v_devis public.devis%rowtype;v_piece jsonb;v_path text;v_nom text;
  v_mime text;v_type text;v_taille bigint;v_legende text;
begin
  perform pg_advisory_xact_lock(hashtext(p_devis_id::text));
  select * into v_devis from public.devis where id=p_devis_id;
  if not found or not public.est_membre_actif(v_devis.entreprise_id)
    or not public.a_permission(v_devis.entreprise_id,'gerer_devis')
  then raise exception 'Devis inaccessible';end if;
  if jsonb_typeof(p_pieces)<>'array' or jsonb_array_length(p_pieces) not between 1 and 6
  then raise exception 'Ajoutez entre une et six pièces';end if;
  if (select count(*) from public.pieces_jointes_devis where devis_id=p_devis_id)
    + jsonb_array_length(p_pieces)>6
  then raise exception 'Un devis ne peut contenir que six pièces';end if;
  for v_piece in select value from jsonb_array_elements(p_pieces) loop
    v_path:=btrim(coalesce(v_piece->>'path',''));v_nom:=btrim(coalesce(v_piece->>'nom',''));
    v_mime:=coalesce(v_piece->>'mime','');v_type:=coalesce(v_piece->>'type','');
    v_taille:=coalesce((v_piece->>'taille')::bigint,0);v_legende:=nullif(btrim(v_piece->>'legende'),'');
    if v_path not like v_devis.entreprise_id::text||'/'||p_devis_id::text||'/%'
      or v_nom='' or length(coalesce(v_legende,''))>1000 then raise exception 'Métadonnées invalides';end if;
    if v_mime not in('image/jpeg','image/png','image/webp','image/heic','image/heif',
      'audio/webm','audio/mp4','audio/mpeg','audio/wav') then raise exception 'Format interdit';end if;
    if v_type not in('image','audio') or (v_type='image' and v_mime not like 'image/%')
      or (v_type='audio' and v_mime not like 'audio/%') or v_taille<=0 or v_taille>20971520
    then raise exception 'Pièce incohérente';end if;
    insert into public.pieces_jointes_devis(
      entreprise_id,devis_id,storage_path,nom_original,mime_type,type_media,taille_octets,legende
    ) values(v_devis.entreprise_id,p_devis_id,v_path,v_nom,v_mime,v_type,v_taille,v_legende);
  end loop;
end;$$;
revoke all on function public.enregistrer_pieces_jointes_devis(uuid,jsonb) from public,anon;
grant execute on function public.enregistrer_pieces_jointes_devis(uuid,jsonb) to authenticated;

create policy devis_medias_ajout on storage.objects for insert to authenticated with check(
  bucket_id='devis-medias'
  and public.est_membre_actif(((storage.foldername(name))[1])::uuid)
  and public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_devis')
);
create policy devis_medias_lecture on storage.objects for select to authenticated using(
  bucket_id='devis-medias'
  and exists(
    select 1 from public.pieces_jointes_devis p
    where p.storage_path=name
      and public.peut_lire_devis(p.devis_id)
  )
);
create policy devis_medias_nettoyage on storage.objects for delete to authenticated using(
  bucket_id='devis-medias'
  and public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_devis')
  and not exists(select 1 from public.pieces_jointes_devis p where p.storage_path=name)
);
notify pgrst,'reload schema';
