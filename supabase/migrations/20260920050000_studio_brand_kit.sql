-- Studio Lot I: one Brand Kit per workspace (company identity + logo), applied to templates as defaults.
-- Additive: one table, one guard trigger, five RPCs. No change to existing objects.
begin;

create table public.studio_brand_kits (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null unique references public.studio_workspaces(id) on delete cascade,
 company_name text not null default '' check(char_length(company_name)<=100),
 tagline text not null default '' check(char_length(tagline)<=140),
 phone text not null default '' check(char_length(phone)<=40),
 website text not null default '' check(char_length(website)<=200),
 email text not null default '' check(char_length(email)<=254),
 logo_asset_id uuid,
 revision integer not null default 1 check(revision>=1),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,logo_asset_id) references public.studio_media_assets(workspace_id,id)
);
alter table public.studio_brand_kits enable row level security;
revoke all on public.studio_brand_kits from public,anon,authenticated,service_role;
grant select on public.studio_brand_kits to authenticated;
create policy studio_brand_kits_read on public.studio_brand_kits for select to authenticated
 using(public.studio_my_role(workspace_id) is not null);

-- A media used as the brand logo cannot be tombstoned until the kit stops using it.
create function public.studio_brand_logo_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null and old.deleted_at is null
 and exists(select 1 from public.studio_brand_kits where logo_asset_id=new.id) then
  raise exception 'Média utilisé comme logo de marque' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.studio_brand_logo_guard() from public,anon,authenticated,service_role;
create trigger studio_brand_logo_guard before update of deleted_at on public.studio_media_assets
 for each row execute function public.studio_brand_logo_guard();

-- Same character set the bundled fonts can draw (Latin, Cyrillic, punctuation, euro, trademark).
create function public.studio_brand_text(p_value text,p_max integer,p_pattern text default null) returns text
language plpgsql immutable set search_path='' as $$
declare v text:=btrim(regexp_replace(coalesce(p_value,''),'\s+',' ','g'));
begin
 if char_length(v)>p_max or v ~ '[\x01-\x08\x0b-\x1f\x7f]'
 or v !~ '^[\s\u0020-\u007e\u00a0-\u024f\u0400-\u04ff\u1e00-\u1eff\u2010-\u2027\u2030-\u205e\u20ac\u2122]*$'
 or (p_pattern is not null and v<>'' and v !~ p_pattern) then
  raise exception 'Identité de marque invalide' using errcode='22023';
 end if;
 return v;
end $$;
revoke all on function public.studio_brand_text(text,integer,text) from public,anon,authenticated,service_role;

create function public.studio_brand_kit_json(k public.studio_brand_kits) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when k.id is null then null else jsonb_build_object(
  'id',k.id,'workspace_id',k.workspace_id,'company_name',k.company_name,'tagline',k.tagline,'phone',k.phone,
  'website',k.website,'email',k.email,'revision',k.revision,'updated_at',k.updated_at,
  'logo',(select jsonb_build_object('id',a.id,'original_filename',a.original_filename)
          from public.studio_media_assets a
          where a.id=k.logo_asset_id and a.deleted_at is null and a.purged_at is null and a.upload_status='ready')) end;
$$;
revoke all on function public.studio_brand_kit_json(public.studio_brand_kits) from public,anon,authenticated,service_role;

create function public.studio_get_brand_kit(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k public.studio_brand_kits;
begin
 if public.studio_my_role(p_workspace) is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into k from public.studio_brand_kits where workspace_id=p_workspace;
 return public.studio_brand_kit_json(k);
end $$;

create function public.studio_save_brand_kit(p_workspace uuid,p_data jsonb,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k public.studio_brand_kits; logo uuid; a public.studio_media_assets;
begin
 perform 1 from public.studio_workspaces where id=p_workspace and deleted_at is null for update;
 if not found or coalesce(public.studio_my_role(p_workspace),'') not in ('owner','admin') then
  raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object'
 or exists(select 1 from jsonb_object_keys(p_data) key where key not in ('company_name','tagline','phone','website','email','logo_asset_id')) then
  raise exception 'Identité de marque invalide' using errcode='22023'; end if;
 logo:=nullif(p_data->>'logo_asset_id','')::uuid;
 if logo is not null then
  select * into a from public.studio_media_assets where id=logo and workspace_id=p_workspace for share;
  if a.id is null or a.deleted_at is not null or a.upload_status<>'ready' or a.media_type<>'image' or a.mime_type not in ('image/png','image/jpeg') then
   raise exception 'Logo invalide : image PNG ou JPEG du workspace requise' using errcode='22023'; end if;
 end if;
 select * into k from public.studio_brand_kits where workspace_id=p_workspace for update;
 if k.id is null then
  if p_revision is not null then raise exception 'Le kit a changé' using errcode='40001'; end if;
  insert into public.studio_brand_kits(workspace_id,company_name,tagline,phone,website,email,logo_asset_id,updated_by)
  values(p_workspace,
   public.studio_brand_text(p_data->>'company_name',100),
   public.studio_brand_text(p_data->>'tagline',140),
   public.studio_brand_text(p_data->>'phone',40,'^[0-9+().\s-]+$'),
   public.studio_brand_text(p_data->>'website',200,'^[A-Za-z0-9.:/_~%?=&#+@-]+$'),
   public.studio_brand_text(p_data->>'email',254,'^[^\s@]+@[^\s@]+\.[^\s@]+$'),
   logo,auth.uid()) returning * into k;
 else
  if p_revision is distinct from k.revision then raise exception 'Le kit a changé' using errcode='40001'; end if;
  update public.studio_brand_kits set
   company_name=public.studio_brand_text(p_data->>'company_name',100),
   tagline=public.studio_brand_text(p_data->>'tagline',140),
   phone=public.studio_brand_text(p_data->>'phone',40,'^[0-9+().\s-]+$'),
   website=public.studio_brand_text(p_data->>'website',200,'^[A-Za-z0-9.:/_~%?=&#+@-]+$'),
   email=public.studio_brand_text(p_data->>'email',254,'^[^\s@]+@[^\s@]+\.[^\s@]+$'),
   logo_asset_id=logo,revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=k.id returning * into k;
 end if;
 return public.studio_brand_kit_json(k);
end $$;

-- PNG/JPEG images of the workspace that can become the logo (the renderer decodes only these two formats).
create function public.studio_list_brand_logo_candidates(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if public.studio_my_role(p_workspace) is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
  select jsonb_build_object('id',a.id,'original_filename',a.original_filename,'project_id',a.project_id,
   'project_name',p.name,'created_at',a.created_at) x
  from public.studio_media_assets a join public.studio_projects p on p.id=a.project_id and p.deleted_at is null
  where a.workspace_id=p_workspace and a.deleted_at is null and a.purged_at is null and a.upload_status='ready'
   and a.media_type='image' and a.mime_type in ('image/png','image/jpeg')
  order by a.created_at desc limit 50) s),'[]'::jsonb);
end $$;

-- Makes the brand logo usable by a project (a shared media reference, no copy). Idempotent.
create function public.studio_attach_brand_logo(p_project uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; k public.studio_brand_kits;
begin
 p:=public.studio_project_lock(p_project);
 select * into k from public.studio_brand_kits where workspace_id=p.workspace_id;
 if k.id is null or k.logo_asset_id is null or not exists(
  select 1 from public.studio_media_assets a where a.id=k.logo_asset_id and a.workspace_id=p.workspace_id
  and a.deleted_at is null and a.purged_at is null and a.upload_status='ready') then
  raise exception 'Aucun logo de marque disponible' using errcode='22023'; end if;
 if not exists(select 1 from public.studio_project_assets r where r.project_id=p.id and r.asset_id=k.logo_asset_id) then
  insert into public.studio_project_assets(workspace_id,project_id,asset_id,sort_order)
  select p.workspace_id,p.id,k.logo_asset_id,coalesce(max(sort_order)+1,0) from public.studio_project_assets where project_id=p.id;
  update public.studio_projects set updated_at=now(),revision=revision+1 where id=p.id;
 end if;
 return k.logo_asset_id;
end $$;

revoke all on function public.studio_get_brand_kit(uuid),public.studio_save_brand_kit(uuid,jsonb,integer),public.studio_list_brand_logo_candidates(uuid),public.studio_attach_brand_logo(uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_get_brand_kit(uuid),public.studio_save_brand_kit(uuid,jsonb,integer),public.studio_list_brand_logo_candidates(uuid),public.studio_attach_brand_logo(uuid) to authenticated;
commit;
