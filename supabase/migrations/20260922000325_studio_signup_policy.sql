-- Studio : la fermeture de l'inscription (STUDIO_SIGNUP_MODE=closed/allowlist,
-- apps/studio/src/app/actions.ts) n'était appliquée que par la Server Action. Un appel direct à
-- Supabase Auth (POST /auth/v1/signup, SDK client, REST) avec la clé publique crée un compte ELSATIA
-- sans jamais passer par ce garde-fou.
--
-- Pourquoi PAS un hook Auth `before_user_created` : ce projet Supabase est partagé par Gestion Pro,
-- Colors, Tools et Réserves — NEXT_PUBLIC_SUPABASE_URL est « identique dans toutes les applications
-- d'un même environnement (SSO multi-application) » (config/env-manifest.json) et l'identité est « Supabase
-- Auth du projet elsatia-main » commune à toute la suite (docs/architecture/ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md).
-- Un hook before_user_created s'applique à TOUT le projet : il refuserait aussi les inscriptions Gestion
-- Pro/Colors/Tools/Réserves, qui sont déjà ouvertes par design et sans condition (src/app/actions/auth.ts,
-- signupAction). Créer un compte Auth n'est donc pas la ressource à protéger : Gestion Pro l'autorise déjà
-- sans condition, un attaquant obtiendrait la même identité ELSATIA en s'inscrivant là. La ressource
-- réellement protégée par « inscription Studio fermée » est l'accès à un espace Studio
-- (studio_workspaces / studio_workspace_members), dont le seul point d'entrée est studio_create_workspace
-- (aucune policy RLS d'INSERT sur ces deux tables, aucun autre chemin dans ce train). C'est donc là, et
-- uniquement là, que la politique doit être imposée — un contrôle applicatif Studio, jamais un blocage
-- global de l'identité ELSATIA partagée.
--
-- Deux couches, une seule source de vérité (cette table, jamais les variables d'environnement) :
--  1. studio_signup_permitted(email), lue par studio_create_workspace : refuse la création d'un PREMIER
--     espace si l'e-mail n'est pas admis. Un compte déjà membre d'un espace n'est jamais expulsé : fermer
--     l'inscription ne révoque rien de ce qui existe déjà.
--  2. Les variables d'environnement (STUDIO_SIGNUP_MODE/STUDIO_SIGNUP_ALLOWLIST/STUDIO_LEGAL_PUBLISHED)
--     restent la première ligne côté Server Action pour un message rapide avant tout appel réseau ; elles
--     ne sont plus le seul rempart et doivent rester alignées avec cette table en exploitation (voir le
--     runbook Studio).
-- Fail-closed : ligne absente, mode inconnu, e-mail invalide ou erreur => refus. Défaut livré : 'closed'.
begin;

create table public.studio_signup_policy (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'closed' check (mode in ('open', 'allowlist', 'closed')),
  -- Adresses complètes ou `@domaine.tld`, en minuscules ; comparaison exacte (pas de sous-domaine).
  allowlist text[] not null default '{}' check (cardinality(allowlist) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.studio_signup_policy (singleton, mode) values (true, 'closed');
alter table public.studio_signup_policy enable row level security;
revoke all on public.studio_signup_policy from public, anon, authenticated, service_role;
-- Ni policy RLS ni GRANT : la politique se change en SQL (éditeur SQL / migration) uniquement, jamais
-- par l'API REST/SDK — aucun rôle applicatif, y compris service_role, ne peut la lire ou l'écrire.

-- Source unique de la décision. `open` admet sans condition ; sinon un e-mail syntaxiquement valide est
-- requis, et seul `allowlist` peut encore admettre (comparaison stricte adresse ou `@domaine`).
create function public.studio_signup_permitted(p_email text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.studio_signup_policy;
  mail text := lower(btrim(coalesce(p_email, '')));
begin
  select * into p from public.studio_signup_policy where singleton;
  if not found then return false; end if;
  if mail = '' or mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return false; end if;
  if p.mode = 'open' then return true; end if;
  if p.mode <> 'allowlist' then return false; end if;
  return exists (
    select 1 from unnest(p.allowlist) e
    where lower(btrim(e)) = mail
       or (lower(btrim(e)) like '@%' and lower(btrim(e)) = substring(mail from '@[^@]*$'))
  );
end $$;
-- Aucun GRANT : appelable uniquement depuis une autre fonction SECURITY DEFINER du même propriétaire
-- (studio_create_workspace ci-dessous). `authenticated` ne peut jamais l'invoquer directement en RPC —
-- pas de surface d'oracle sur le mode ou le contenu de l'allowlist.
revoke all on function public.studio_signup_permitted(text) from public, anon, authenticated, service_role;

-- studio_create_workspace : défense en profondeur. Le contournement possible de la Server Action
-- (signUp direct) ne fait qu'ouvrir un compte Auth ; il ne doit jamais, par lui-même, ouvrir un espace.
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
  if p_type = 'personal' then
    select id into v_id from public.studio_workspaces where owner_user_id = v_uid and workspace_type = 'personal' and deleted_at is null;
    if v_id is not null then return v_id; end if;
  end if;
  -- Politique de fermeture : un compte créé en contournant la Server Action (signUp direct) n'obtient
  -- pas de premier espace si son e-mail n'est pas admis. Un compte déjà membre d'un espace (admis avant
  -- la fermeture) n'est pas expulsé — le même message que la limite de 20 espaces, aucun oracle.
  if not (
    public.studio_signup_permitted(v_mail)
    or exists (select 1 from public.studio_workspace_members where user_id = v_uid)
  ) then
    raise exception 'Inscription fermée' using errcode = '42501';
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
