-- Studio : inscription fermée par défaut, imposée par la base (et non par la seule server action).
-- Le contournement constaté : `POST /auth/v1/signup` avec la clé publique créait un compte sans passer par
-- l'action `signup`. Ce lot met UNE politique en base, lue par trois points d'application :
--   1. le hook Auth `before_user_created` (refuse la création du compte, quel que soit le chemin) ;
--   2. `studio_create_workspace` (défense en profondeur : un compte créé par un autre chemin n'ouvre pas d'espace) ;
--   3. la server action `signup` (message clair avant l'appel Auth) via `studio_signup_permitted`.
-- Fail-closed : ligne absente, mode inconnu, erreur => refus. Le défaut livré est `closed`.
begin;

create table public.studio_signup_policy (
 singleton boolean primary key default true check (singleton),
 mode text not null default 'closed' check (mode in ('open','allowlist','closed')),
 -- Adresses complètes ou `@domaine.tld`, en minuscules ; comparaison exacte (pas de sous-domaine).
 allowlist text[] not null default '{}' check (cardinality(allowlist) <= 500),
 updated_at timestamptz not null default now()
);
insert into public.studio_signup_policy(singleton,mode) values (true,'closed');
alter table public.studio_signup_policy enable row level security;
revoke all on public.studio_signup_policy from public,anon,authenticated,service_role;
-- Ni politique RLS ni GRANT : la politique se change en SQL (éditeur SQL / migration), jamais par l'API.

-- Source unique de la décision. `open` est le seul mode qui admet sans condition ; une invitation en attente
-- pour l'adresse est toujours admise (l'invité est autorisé par un administrateur d'espace).
create function public.studio_signup_permitted(p_email text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare p public.studio_signup_policy; mail text:=lower(btrim(coalesce(p_email,'')));
begin
 select * into p from public.studio_signup_policy where singleton;
 if not found then return false; end if;
 if p.mode='open' then return true; end if;
 if mail='' or mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return false; end if;
 if public.studio_pending_invitation_for(mail) then return true; end if;
 return p.mode='allowlist' and exists(
  select 1 from unnest(p.allowlist) e
  where lower(btrim(e))=mail or (lower(btrim(e)) like '@%' and lower(btrim(e))=substring(mail from '@[^@]*$')));
end $$;

-- Hook Auth `before_user_created` : payload `{"metadata":{…},"user":{"email":…,…}}` ; `{}` = accepter,
-- `{"error":{…}}` = refuser. Message volontairement identique pour tous les refus (aucun oracle sur la liste).
create function public.studio_hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if public.studio_signup_permitted(event->'user'->>'email') then return '{}'::jsonb; end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Les inscriptions à ELSATIA Studio sont fermées.'));
end $$;

-- Ouverture d'espace : la même décision, avec deux reconnaissances de compte déjà admis (un compte qui possède
-- ou appartient déjà à un espace a été admis avant la fermeture ou par invitation ; fermer ne l'expulse pas).
create or replace function public.studio_create_workspace(p_name text default 'Mon Studio', p_type text default 'personal')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_mail text;
begin
  if v_uid is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 or p_type is null or p_type not in ('personal','professional') then
    raise exception 'Workspace invalide' using errcode = '22023';
  end if;
  -- Serialize per identity: concurrent onboarding cannot create two personal workspaces.
  select lower(email) into v_mail from auth.users where id = v_uid for update;
  if not found then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not (public.studio_signup_permitted(v_mail)
    or exists(select 1 from public.studio_workspace_members where user_id = v_uid)) then
    raise exception 'Inscription fermée' using errcode = '42501';
  end if;
  if p_type = 'personal' then
    select id into v_id from public.studio_workspaces where owner_user_id = v_uid and workspace_type = 'personal' and deleted_at is null;
    if v_id is not null then return v_id; end if;
  end if;
  if (select count(*) from public.studio_workspaces where owner_user_id = v_uid and deleted_at is null) >= 20 then
    raise exception 'Limite de 20 workspaces atteinte' using errcode = '22023';
  end if;
  insert into public.studio_workspaces(name, workspace_type, owner_user_id) values (btrim(p_name), p_type, v_uid) returning id into v_id;
  insert into public.studio_workspace_members(workspace_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end $$;

revoke all on function public.studio_signup_permitted(text),public.studio_hook_before_user_created(jsonb) from public,anon,authenticated,service_role;
-- Le serveur Studio (clé de service) lit la décision ; jamais `authenticated` (oracle sur invitations et liste).
grant execute on function public.studio_signup_permitted(text) to service_role;
grant execute on function public.studio_hook_before_user_created(jsonb) to supabase_auth_admin;
commit;
