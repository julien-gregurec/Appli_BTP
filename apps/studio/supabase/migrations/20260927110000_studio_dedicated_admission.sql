-- ELSATIA Studio — admission et lecture seule adossées au pont d'identité (projet DÉDIÉ Studio).
--
-- PROJET STUDIO DÉDIÉ UNIQUEMENT (apps/studio/supabase/migrations). Ne jamais copier dans
-- supabase/migrations : le schéma studio_identity n'existe pas sur le projet partagé
-- (garde : scripts/verify-migration-targets.mjs).
--
-- Pourquoi : sur le projet dédié, un utilisateur Auth Studio n'existe que parce que la plateforme
-- ELSATIA a accordé le droit Studio (claim `ent`, décision STUDIO_ACCESS_MODE côté GP) et que le
-- pont l'a provisionné. La politique d'inscription héritée du projet partagé
-- (20260922000325_studio_signup_policy.sql : table studio_signup_policy, défaut « closed »)
-- refuserait pourtant le PREMIER espace de cet utilisateur. Et, à l'inverse, un compte actif dont
-- le droit a été retiré (lecture seule) pouvait encore créer un espace par un appel RPC direct.
--
-- Règle, une seule source de vérité pour les comptes du pont (studio_identity) :
--   * compte lié par le pont, état central « active », droit accordé  → admis ;
--   * compte lié, droit retiré (granted = false/null)                 → refus (lecture seule) ;
--   * compte lié, état « disabled »/« deleted »                        → refus ;
--   * compte NON lié (instances de test jetables en mode `local`, seules à créer des comptes hors
--     pont) → politique héritée inchangée (studio_signup_policy, fail-closed, ou déjà membre).
-- Fail-closed : erreur de lecture ou état inconnu = refus.

begin;

-- Accès de l'appelant (auth.uid()) : 'full' | 'read_only' | 'blocked' | 'unlinked'.
-- Pas de GRANT : appelée uniquement depuis des fonctions SECURITY DEFINER du même propriétaire,
-- jamais exposée en RPC (pas d'oracle).
create function public.studio_identity_caller_access()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_link studio_identity.links;
  v_state studio_identity.subject_state;
begin
  if v_uid is null then
    return 'blocked';
  end if;
  select * into v_link from studio_identity.links l where l.user_id = v_uid;
  if v_link.subject is null then
    return 'unlinked';
  end if;
  select * into v_state from studio_identity.subject_state s where s.subject = v_link.subject;
  if v_state.account is distinct from 'active' then
    return 'blocked';
  end if;
  return case when v_state.granted then 'full' else 'read_only' end;
end;
$$;
revoke all on function public.studio_identity_caller_access() from public, anon, authenticated, service_role;

create or replace function public.studio_create_workspace(p_name text default 'Mon Studio', p_type text default 'personal')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_mail text; v_access text;
begin
  if v_uid is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 or p_type is null or p_type not in ('personal','professional') then
    raise exception 'Workspace invalide' using errcode = '22023';
  end if;
  -- Serialize per identity: concurrent onboarding cannot create two personal workspaces.
  select lower(email) into v_mail from auth.users where id = v_uid for update;
  if not found then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_type = 'personal' then
    select id into v_id from public.studio_workspaces where owner_user_id = v_uid and workspace_type = 'personal' and deleted_at is null;
    if v_id is not null then return v_id; end if;
  end if;
  v_access := public.studio_identity_caller_access();
  if v_access = 'unlinked' then
    -- Hors pont (tests jetables uniquement) : politique héritée, inchangée.
    if not (
      public.studio_signup_permitted(v_mail)
      or exists (select 1 from public.studio_workspace_members where user_id = v_uid)
    ) then
      raise exception 'Inscription fermée' using errcode = '42501';
    end if;
  elsif v_access is distinct from 'full' then
    raise exception 'Accès Studio en lecture seule' using errcode = '42501';
  end if;
  if (select count(*) from public.studio_workspaces where owner_user_id = v_uid and deleted_at is null) >= 20 then
    raise exception 'Limite de 20 workspaces atteinte' using errcode = '22023';
  end if;
  insert into public.studio_workspaces(name, workspace_type, owner_user_id) values (btrim(p_name), p_type, v_uid) returning id into v_id;
  insert into public.studio_workspace_members(workspace_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end $$;
revoke all on function public.studio_create_workspace(text,text) from public, anon, authenticated, service_role;
grant execute on function public.studio_create_workspace(text,text) to authenticated;

commit;
