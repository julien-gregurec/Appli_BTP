-- ELSATIA Studio — garde d'écriture Storage en base (projet Supabase DÉDIÉ Studio uniquement).
--
-- PROJET STUDIO DÉDIÉ UNIQUEMENT (apps/studio/supabase/migrations).
--
-- Les buckets studio-originals / studio-renders sont déjà fermés aux clients (policies restrictives
-- *_server_only). Mais le téléversement réel passe par une URL signée (storage-api, identité
-- privilégiée) et les suppressions par la clé service : la politique RLS ne voit pas l'utilisateur.
-- Cette garde lie donc chaque écriture d'objet à un ÉTAT DE BASE lui-même gardé
-- (20260928100000_studio_db_write_guard.sql) :
--
--   INSERT/UPDATE studio-originals : une réservation vivante (studio_media_assets pending/uploading/
--       uploaded, non supprimée, non expirée) porte exactement cette clé ET son auteur a encore un
--       accès complet ET Studio est en read_write. → lecture seule = aucun téléversement.
--   INSERT/UPDATE studio-renders   : un rendu actif (bail en cours) porte exactement cette clé
--       (studio/<ws>/<projet>/renders/<job>/<bail>/output.mp4). Chemin render_worker.
--   UPDATE sans changement de contenu (même bucket/nom, mêmes métadonnées) : autorisé (horodatages).
--   DELETE : seulement un objet qu'AUCUNE ligne vivante ne référence (média supprimé, rendu non
--       publié, purge RGPD déjà faite en base). → un utilisateur en lecture seule ne peut rien faire
--       supprimer : la suppression logique (RPC) lui est refusée par la garde centrale.
--   Changement de bucket ou de nom touchant un bucket Studio : refusé.
--   Chemin déclaré storage_maintenance (opérateur, SQL explicite) : autorisé.
-- Aucun contournement par contexte « operator » ici : storage-api peut écrire sans claims.
--
-- Hébergé : la création d'un trigger sur storage.objects doit être vérifiée sur le plan souscrit
-- (checklist §H du rapport). Cette migration est DERNIÈRE de la chaîne : un refus n'empêche pas les
-- gardes base et la fondation RGPD de s'appliquer, et il est visible (échec de db push).

begin;

insert into studio_guard.system_paths (path, tables, allowed_in_read_only, description) values
  ('storage_maintenance', array['storage.objects'], true,
   'Maintenance Storage explicite par l''opérateur (set local studio.write_path).');

create function studio_guard.storage_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_path text := nullif(current_setting('studio.write_path', true), '');
  v_old_studio boolean := tg_op <> 'INSERT' and old.bucket_id in ('studio-originals', 'studio-renders');
  v_new_studio boolean := tg_op <> 'DELETE' and new.bucket_id in ('studio-originals', 'studio-renders');
  a public.studio_media_assets;
  m text[];
begin
  if not (v_old_studio or v_new_studio) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_path is not null and exists (select 1 from studio_guard.system_paths p
                                     where p.path = v_path and 'storage.objects' = any (p.tables)) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    if new.bucket_id is distinct from old.bucket_id or new.name is distinct from old.name then
      raise exception 'Déplacement Studio refusé' using errcode = '42501', hint = 'STUDIO_STORAGE_DENIED';
    end if;
    if new.metadata is not distinct from old.metadata then
      return new;
    end if;
  end if;

  if tg_op = 'DELETE' then
    if old.bucket_id = 'studio-originals' and exists (
         select 1 from public.studio_media_assets x where x.storage_key = old.name and x.deleted_at is null) then
      raise exception 'Objet Studio encore référencé' using errcode = '42501', hint = 'STUDIO_STORAGE_DENIED';
    end if;
    if old.bucket_id = 'studio-renders' and exists (
         select 1 from public.studio_render_outputs o where o.storage_key = old.name and o.deleted_at is null) then
      raise exception 'Rendu Studio encore publié' using errcode = '42501', hint = 'STUDIO_STORAGE_DENIED';
    end if;
    return old;
  end if;

  -- INSERT, ou UPDATE qui remplace le contenu.
  if new.bucket_id = 'studio-originals' then
    select * into a from public.studio_media_assets x
     where x.storage_key = new.name and x.deleted_at is null
       and x.upload_status in ('pending', 'uploading', 'uploaded') and x.upload_expires_at > now();
    if a.id is null then
      raise exception 'Aucune réservation d''import pour cet objet' using errcode = '42501', hint = 'STUDIO_STORAGE_DENIED';
    end if;
    if studio_guard.user_write_access(a.uploaded_by) <> 'full' then
      raise exception 'Accès Studio en lecture seule' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
    end if;
    return new;
  end if;

  m := regexp_match(new.name,
    '^studio/([0-9a-f-]{36})/([0-9a-f-]{36})/renders/([0-9a-f-]{36})/([0-9a-f-]{36})/output\.mp4$');
  if m is null or not exists (
       select 1 from public.studio_render_jobs j
        where j.id = m[3]::uuid and j.workspace_id = m[1]::uuid and j.project_id = m[2]::uuid
          and j.lease_token = m[4]::uuid and j.status in ('preparing', 'rendering', 'encoding', 'uploading')) then
    raise exception 'Aucun rendu actif pour cet objet' using errcode = '42501', hint = 'STUDIO_STORAGE_DENIED';
  end if;
  return new;
end;
$$;
revoke all on function studio_guard.storage_guard() from public, anon, authenticated, service_role;

create trigger studio_storage_write_guard before insert or update or delete on storage.objects
  for each row execute function studio_guard.storage_guard();

commit;
