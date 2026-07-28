-- Photos et vidéos courtes dans la messagerie interne.
-- Un média de fil chantier est référencé par chantier sans dupliquer l'objet Storage.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'messagerie-medias','messagerie-medias',false,20971520,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

alter table public.messages_internes
  add constraint messages_internes_id_entreprise_conversation_unique
  unique(id,entreprise_id,conversation_id);

create table public.pieces_jointes_messages(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  chantier_id uuid,
  storage_path text not null unique check(btrim(storage_path)<>''),
  nom_original text not null check(btrim(nom_original)<>''),
  mime_type text not null check(mime_type in(
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'video/mp4','video/quicktime','video/webm'
  )),
  type_media text not null check(type_media in('image','video')),
  taille_octets bigint not null check(taille_octets>0 and taille_octets<=20971520),
  created_at timestamptz not null default now(),
  foreign key(message_id,entreprise_id,conversation_id)
    references public.messages_internes(id,entreprise_id,conversation_id) on delete cascade,
  foreign key(conversation_id,entreprise_id)
    references public.conversations_internes(id,entreprise_id) on delete cascade,
  foreign key(chantier_id,entreprise_id)
    references public.chantiers(id,entreprise_id) on delete cascade,
  check(
    (type_media='image' and mime_type like 'image/%')
    or (type_media='video' and mime_type like 'video/%')
  )
);
create index pieces_jointes_messages_fil_idx
  on public.pieces_jointes_messages(conversation_id,created_at);
create index pieces_jointes_messages_chantier_idx
  on public.pieces_jointes_messages(entreprise_id,chantier_id,created_at desc)
  where chantier_id is not null;

alter table public.pieces_jointes_messages enable row level security;
create policy pieces_jointes_messages_lecture
  on public.pieces_jointes_messages for select to authenticated
  using(public.peut_acceder_conversation(conversation_id));
grant select on public.pieces_jointes_messages to authenticated;

create or replace function public.publier_message_avec_pieces(
  p_conversation_id uuid,
  p_contenu text,
  p_pieces jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_conversation public.conversations_internes%rowtype;
  v_employe_id uuid;
  v_message_id uuid;
  v_piece jsonb;
  v_nom text;
  v_path text;
  v_mime text;
  v_type text;
  v_taille bigint;
begin
  select * into v_conversation
  from public.conversations_internes
  where id=p_conversation_id;
  if not found or not public.peut_acceder_conversation(p_conversation_id) then
    raise exception 'Conversation inaccessible';
  end if;
  v_employe_id:=public.employe_courant(v_conversation.entreprise_id);
  if v_employe_id is null then raise exception 'Compte employé introuvable'; end if;
  if p_pieces is null or jsonb_typeof(p_pieces)<>'array' then
    raise exception 'Ajoutez entre une et cinq pièces jointes';
  end if;
  if jsonb_array_length(p_pieces) not between 1 and 5 then
    raise exception 'Ajoutez entre une et cinq pièces jointes';
  end if;
  if length(coalesce(p_contenu,''))>5000 then raise exception 'Message trop long'; end if;

  insert into public.messages_internes(entreprise_id,conversation_id,auteur_employe_id,contenu)
  values(
    v_conversation.entreprise_id,
    p_conversation_id,
    v_employe_id,
    coalesce(nullif(btrim(p_contenu),''),'[Pièce jointe]')
  )
  returning id into v_message_id;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    v_nom:=btrim(coalesce(v_piece->>'nom',''));
    v_path:=btrim(coalesce(v_piece->>'path',''));
    v_mime:=coalesce(v_piece->>'mime','');
    v_type:=coalesce(v_piece->>'type','');
    v_taille:=coalesce((v_piece->>'taille')::bigint,0);
    if v_nom='' or v_path='' then raise exception 'Métadonnées de fichier incomplètes'; end if;
    if v_path not like v_conversation.entreprise_id::text||'/'||p_conversation_id::text||'/%' then
      raise exception 'Chemin de stockage invalide';
    end if;
    if v_mime not in(
      'image/jpeg','image/png','image/webp','image/heic','image/heif',
      'video/mp4','video/quicktime','video/webm'
    ) then raise exception 'Format de fichier non autorisé'; end if;
    if v_type not in('image','video')
      or (v_type='image' and v_mime not like 'image/%')
      or (v_type='video' and v_mime not like 'video/%')
    then raise exception 'Type de média incohérent'; end if;
    if v_taille<=0 or v_taille>20971520 then raise exception 'Taille de fichier invalide'; end if;

    insert into public.pieces_jointes_messages(
      entreprise_id,conversation_id,message_id,chantier_id,storage_path,
      nom_original,mime_type,type_media,taille_octets
    ) values(
      v_conversation.entreprise_id,p_conversation_id,v_message_id,
      case when v_conversation.type='chantier' then v_conversation.chantier_id else null end,
      v_path,v_nom,v_mime,v_type,v_taille
    );
  end loop;
  return v_message_id;
end;
$$;
revoke all on function public.publier_message_avec_pieces(uuid,text,jsonb) from public,anon;
grant execute on function public.publier_message_avec_pieces(uuid,text,jsonb) to authenticated;

create policy messagerie_medias_ajout
  on storage.objects for insert to authenticated
  with check(
    bucket_id='messagerie-medias'
    and public.est_membre_actif(((storage.foldername(name))[1])::uuid)
    and public.peut_acceder_conversation(((storage.foldername(name))[2])::uuid)
  );
create policy messagerie_medias_lecture
  on storage.objects for select to authenticated
  using(
    bucket_id='messagerie-medias'
    and public.est_membre_actif(((storage.foldername(name))[1])::uuid)
    and public.peut_acceder_conversation(((storage.foldername(name))[2])::uuid)
  );
create policy messagerie_medias_nettoyage
  on storage.objects for delete to authenticated
  using(
    bucket_id='messagerie-medias'
    and public.peut_acceder_conversation(((storage.foldername(name))[2])::uuid)
    and not exists(select 1 from public.pieces_jointes_messages p where p.storage_path=name)
  );

notify pgrst,'reload schema';
