-- Export comptable privé, détection de doublon inter-salariés et journalisation des refus.

create or replace function public.existe_doublon_note_frais(
  p_entreprise_id uuid,p_empreinte text,p_note_id uuid default null
)
returns boolean language sql security definer stable set search_path=public as $$
  select case when public.est_membre_actif(p_entreprise_id) then exists(
    select 1 from public.documents_notes_frais d
    where d.entreprise_id=p_entreprise_id
      and d.empreinte_sha256_originale=p_empreinte
      and (p_note_id is null or d.note_frais_id<>p_note_id)
  ) else false end;
$$;

create or replace function public.journaliser_acces_refuse_note_frais(
  p_entreprise_id uuid,p_ressource_type text,p_ressource_id uuid,p_action text,
  p_motif text,p_adresse_ip text default null,p_user_agent text default null
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return;end if;
  if p_entreprise_id is not null and not public.est_membre_actif(p_entreprise_id) then
    p_entreprise_id:=null;
  end if;
  insert into public.tentatives_acces_notes_frais(
    entreprise_id,utilisateur_id,ressource_type,ressource_id,action,motif,adresse_ip,user_agent
  ) values(
    p_entreprise_id,auth.uid(),left(p_ressource_type,80),p_ressource_id,left(p_action,80),
    left(p_motif,500),nullif(p_adresse_ip,'')::inet,left(nullif(p_user_agent,''),500)
  );
exception when invalid_text_representation then
  insert into public.tentatives_acces_notes_frais(
    entreprise_id,utilisateur_id,ressource_type,ressource_id,action,motif,user_agent
  ) values(p_entreprise_id,auth.uid(),left(p_ressource_type,80),p_ressource_id,left(p_action,80),left(p_motif,500),left(nullif(p_user_agent,''),500));
end;$$;

create or replace function public.finaliser_export_notes_frais(
  p_export_id uuid,p_storage_path text,p_nom_fichier text,p_empreinte text,
  p_taille bigint,p_items jsonb
)
returns void language plpgsql security definer set search_path=public as $$
declare e public.exports_notes_frais;r jsonb;v_note uuid;v_version uuid;
begin
  select * into e from public.exports_notes_frais where id=p_export_id for update;
  if not found or not public.a_permission(e.entreprise_id,'exporter_notes_frais') then
    raise exception 'Export inaccessible';
  end if;
  if e.statut<>'en_cours' then raise exception 'Export déjà finalisé';end if;
  if p_empreinte !~ '^[0-9a-f]{64}$' or p_taille<=0 then raise exception 'Métadonnées d’intégrité invalides';end if;
  for r in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_note:=(r->>'note_id')::uuid;
    v_version:=nullif(r->>'version_id','')::uuid;
    if not exists(select 1 from public.notes_frais n where n.id=v_note and n.entreprise_id=e.entreprise_id) then
      raise exception 'Dépense hors entreprise';
    end if;
    insert into public.elements_export_notes_frais(
      export_id,entreprise_id,note_frais_id,document_version_id,chemin_dans_archive,empreinte_sha256
    ) values(e.id,e.entreprise_id,v_note,v_version,left(r->>'chemin',500),nullif(r->>'sha256',''));
    update public.notes_frais set statut_export='exporte',exporte_at=now(),updated_at=now() where id=v_note;
  end loop;
  update public.exports_notes_frais set statut='termine',storage_path=p_storage_path,
    nom_fichier=left(p_nom_fichier,200),empreinte_sha256=p_empreinte,
    taille_octets=p_taille,nombre_depenses=(select count(distinct note_frais_id) from public.elements_export_notes_frais where export_id=e.id),
    termine_at=now() where id=e.id;
end;$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('notes-frais-exports','notes-frais-exports',false,262144000,array['application/zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.entreprise_id_depuis_storage_export(p_name text)
returns uuid language plpgsql immutable set search_path=public as $$
declare p text[]:=storage.foldername(p_name);
begin
  if array_length(p,1)>=3 and p[1]='companies' and p[2] ~* '^[0-9a-f-]{36}$' and p[3]='exports' then return p[2]::uuid;end if;
  return null;
exception when others then return null;
end;$$;

drop policy if exists notes_frais_exports_select on storage.objects;
drop policy if exists notes_frais_exports_insert on storage.objects;
create policy notes_frais_exports_select on storage.objects for select to authenticated using(
  bucket_id='notes-frais-exports'
  and public.a_permission(public.entreprise_id_depuis_storage_export(name),'exporter_notes_frais')
);
create policy notes_frais_exports_insert on storage.objects for insert to authenticated with check(
  bucket_id='notes-frais-exports'
  and public.a_permission(public.entreprise_id_depuis_storage_export(name),'exporter_notes_frais')
);

revoke all on function public.existe_doublon_note_frais(uuid,text,uuid) from public,anon;
revoke all on function public.journaliser_acces_refuse_note_frais(uuid,text,uuid,text,text,text,text) from public,anon;
revoke all on function public.finaliser_export_notes_frais(uuid,text,text,text,bigint,jsonb) from public,anon;
grant execute on function public.existe_doublon_note_frais(uuid,text,uuid) to authenticated;
grant execute on function public.journaliser_acces_refuse_note_frais(uuid,text,uuid,text,text,text,text) to authenticated;
grant execute on function public.finaliser_export_notes_frais(uuid,text,text,text,bigint,jsonb) to authenticated;
grant execute on function public.entreprise_id_depuis_storage_export(text) to authenticated;

notify pgrst,'reload schema';
