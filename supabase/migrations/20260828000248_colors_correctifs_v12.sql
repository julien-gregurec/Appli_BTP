-- ELSATIA Colors V1.2 — levée des réserves de la revue indépendante V1.1.
-- Migration append-only, limitée au métier Colors.

alter table public.colors_seaux
  add column if not exists etat_avant_archivage text
  check (etat_avant_archivage is null or etat_avant_archivage in ('ferme','ouvert','vide'));

create table public.colors_nettoyages_photos (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  seau_id uuid not null references public.colors_seaux(id) on delete cascade,
  photo_path text not null check (btrim(photo_path) <> '' and length(photo_path) <= 500),
  statut text not null default 'a_nettoyer' check (statut in ('a_nettoyer','resolu')),
  tentatives integer not null default 0 check (tentatives >= 0),
  derniere_erreur text check (derniere_erreur is null or length(derniere_erreur) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (photo_path),
  check ((statut = 'resolu' and resolved_at is not null) or (statut = 'a_nettoyer' and resolved_at is null))
);

create index colors_nettoyages_photos_attente_idx
  on public.colors_nettoyages_photos(entreprise_id, created_at)
  where statut = 'a_nettoyer';

alter table public.colors_nettoyages_photos enable row level security;
revoke all on public.colors_nettoyages_photos from public, anon, authenticated, service_role;

-- La signature binaire ne peut pas être validée dans une policy Storage. Les écritures
-- directes sur le bucket Colors sont donc fermées aux JWT utilisateur : seule la route
-- serveur, après inspection des octets, utilise le client Storage privilégié.
drop policy if exists colors_photos_insert on storage.objects;
drop policy if exists colors_photos_delete on storage.objects;
drop policy if exists colors_photos_insert_signature_gate_v12 on storage.objects;
drop policy if exists colors_photos_delete_signature_gate_v12 on storage.objects;
create policy colors_photos_insert_signature_gate_v12 on storage.objects
  as restrictive for insert to authenticated with check(bucket_id <> 'colors-seaux');
create policy colors_photos_delete_signature_gate_v12 on storage.objects
  as restrictive for delete to authenticated using(bucket_id <> 'colors-seaux');

create or replace function public.colors_photo_stockage_valide(
  p_entreprise_id uuid,
  p_seau_id uuid,
  p_photo_path text
) returns boolean
language plpgsql security definer stable set search_path = public, storage as $$
declare
  objet storage.objects;
  parties text[];
begin
  if p_entreprise_id is null or p_seau_id is null or btrim(coalesce(p_photo_path,'')) = '' then
    return false;
  end if;
  parties := storage.foldername(p_photo_path);
  if array_length(parties,1) <> 2
    or parties[1] <> p_entreprise_id::text
    or parties[2] <> p_seau_id::text
    or p_photo_path like '%..%'
  then
    return false;
  end if;
  select * into objet
  from storage.objects
  where bucket_id = 'colors-seaux' and name = p_photo_path;
  return objet.id is not null
    and coalesce(objet.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
    and coalesce(objet.metadata->>'size','') ~ '^[0-9]+$'
    and (objet.metadata->>'size')::bigint between 1 and 10485760;
end;
$$;

revoke all on function public.colors_photo_stockage_valide(uuid,uuid,text) from public, anon, authenticated, service_role;

create or replace function public.colors_definir_photo(p_seau_id uuid,p_photo_path text)
returns public.colors_seaux language plpgsql security definer set search_path=public,storage as $$
declare v public.colors_seaux;
begin
  select * into v from public.colors_seaux where id=p_seau_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  if p_photo_path is not null and not public.colors_photo_stockage_valide(v.entreprise_id,v.id,p_photo_path) then
    raise exception 'Photo Colors invalide';
  end if;
  update public.colors_seaux set photo_principale_path=p_photo_path where id=v.id returning * into v;
  return v;
end;
$$;

create or replace function public.colors_creer_analyse_ocr(
  p_entreprise_id uuid,p_seau_id uuid,p_photo_path text,p_resultat jsonb default '{}'::jsonb,p_confiance numeric default null
) returns public.colors_analyses_ocr language plpgsql security definer set search_path=public,storage as $$
declare v public.colors_analyses_ocr; seau public.colors_seaux;
begin
  if not public.colors_action_autorisee(p_entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  select * into seau from public.colors_seaux where id=p_seau_id and entreprise_id=p_entreprise_id;
  if seau.id is null then raise exception 'Seau OCR Colors invalide'; end if;
  if not public.colors_photo_stockage_valide(p_entreprise_id,p_seau_id,p_photo_path) then raise exception 'Photo OCR Colors invalide'; end if;
  insert into public.colors_analyses_ocr(entreprise_id,seau_id,photo_path,statut,resultat,confiance,created_by)
  values(p_entreprise_id,p_seau_id,p_photo_path,'a_confirmer',coalesce(p_resultat,'{}'::jsonb),p_confiance,auth.uid()) returning * into v;
  return v;
end;
$$;

create or replace function public.colors_archiver_seau(p_seau_id uuid,p_archiver boolean default true,p_motif text default null)
returns public.colors_seaux language plpgsql security definer set search_path=public as $$
declare v public.colors_seaux; avant public.colors_seaux; v_action text; v_type text; v_etat_restaure text;
begin
  select * into avant from public.colors_seaux where id=p_seau_id for update;
  v_action:=case when p_archiver then 'archiver' else 'restaurer' end;
  if avant.id is null or not public.colors_action_autorisee(avant.entreprise_id,v_action) then raise exception 'Accès Colors refusé'; end if;
  if (p_archiver and avant.etat='archive') or (not p_archiver and avant.etat<>'archive') then
    return avant;
  end if;
  v_type:=case when p_archiver then 'archivage' else 'restauration' end;
  if p_archiver then
    update public.colors_seaux
      set etat_avant_archivage=avant.etat,etat='archive',archived_at=now()
      where id=avant.id returning * into v;
  else
    v_etat_restaure:=coalesce(avant.etat_avant_archivage,case when avant.pourcentage_restant=0 then 'vide' else 'ferme' end);
    update public.colors_seaux
      set etat=v_etat_restaure,etat_avant_archivage=null,archived_at=null
      where id=avant.id returning * into v;
  end if;
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif)
  values(v.entreprise_id,v.id,v_type,v.quantite_restante,v.quantite_restante,v.pourcentage_restant,v.pourcentage_restant,v.unite,v.emplacement_id,v.emplacement_id,avant.etat,v.etat,auth.uid(),nullif(btrim(p_motif),''));
  return v;
end;
$$;

create or replace function public.colors_signaler_nettoyage_photo(p_seau_id uuid,p_photo_path text,p_erreur text default null)
returns public.colors_nettoyages_photos language plpgsql security definer set search_path=public,storage as $$
declare seau public.colors_seaux; suivi public.colors_nettoyages_photos;
begin
  select * into seau from public.colors_seaux where id=p_seau_id;
  if seau.id is null or not public.colors_action_autorisee(seau.entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  if not public.colors_photo_stockage_valide(seau.entreprise_id,seau.id,p_photo_path)
    or seau.photo_principale_path is not distinct from p_photo_path
  then raise exception 'Photo à nettoyer invalide'; end if;
  insert into public.colors_nettoyages_photos(entreprise_id,seau_id,photo_path,statut,tentatives,derniere_erreur)
  values(seau.entreprise_id,seau.id,p_photo_path,'a_nettoyer',1,nullif(left(btrim(p_erreur),500),''))
  on conflict(photo_path) do update set statut='a_nettoyer',resolved_at=null,tentatives=public.colors_nettoyages_photos.tentatives+1,
    derniere_erreur=excluded.derniere_erreur,updated_at=now()
  returning * into suivi;
  return suivi;
end;
$$;

create or replace function public.colors_resoudre_nettoyage_photo(p_seau_id uuid,p_photo_path text)
returns boolean language plpgsql security definer set search_path=public,storage as $$
declare v_entreprise_id uuid; v_existe boolean;
begin
  select entreprise_id into v_entreprise_id from public.colors_seaux where id=p_seau_id;
  if v_entreprise_id is null or not public.colors_action_autorisee(v_entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  select exists(select 1 from public.colors_nettoyages_photos where entreprise_id=v_entreprise_id and seau_id=p_seau_id and photo_path=p_photo_path) into v_existe;
  if exists(select 1 from storage.objects where bucket_id='colors-seaux' and name=p_photo_path) then
    raise exception 'La photo est encore présente dans Storage';
  end if;
  update public.colors_nettoyages_photos set statut='resolu',resolved_at=now(),derniere_erreur=null,updated_at=now()
    where entreprise_id=v_entreprise_id and seau_id=p_seau_id and photo_path=p_photo_path and statut='a_nettoyer';
  return v_existe;
end;
$$;

revoke all on function public.colors_signaler_nettoyage_photo(uuid,text,text) from public,anon,service_role;
revoke all on function public.colors_resoudre_nettoyage_photo(uuid,text) from public,anon,service_role;
grant execute on function public.colors_signaler_nettoyage_photo(uuid,text,text) to authenticated;
grant execute on function public.colors_resoudre_nettoyage_photo(uuid,text) to authenticated;

notify pgrst,'reload schema';
