-- PE-07 (recette pilote) : « Révoquer l'appareil mobile d'un salarié parti →
-- session mobile invalidée ».
--
-- Reproduit par exécution réelle (fixture pilote, identité RLS réelle) :
--   1. revoquer_appareil_compte (20260716000085) ne fait que poser
--      appareils_comptes.revoque_at = now() — une ligne de comptage d'appareils
--      facturés. Rien ne relie cette ligne à une session d'authentification :
--      sous le même JWT, l'utilisateur de l'appareil « révoqué » continue de
--      lire ses données (est_membre_actif / a_permission inchangés) ;
--   2. pire : au prochain chargement de page, AppPresenceTracker rappelle
--      enregistrer_appareil_courant, dont l'ON CONFLICT remet
--      `revoque_at = null` — la révocation s'annule d'elle-même.
--
-- Correctif, au niveau DB (donc valable pour tout chemin : pages, server
-- actions, PostgREST direct) :
--   * chaque appareil mémorise la session GoTrue qui l'a enregistré en dernier
--     (claim `session_id` du JWT, présent dans tout jeton émis par GoTrue) ;
--   * révoquer l'appareil inscrit cette session dans public.sessions_revoquees
--     (et supprime, quand le rôle propriétaire en a le droit, la ligne
--     auth.sessions correspondante, ce qui invalide aussi son refresh token) ;
--   * est_membre_actif, est_membre_actif_reel et a_permission — sur lesquels
--     reposent les policies RLS des tables métier — renvoient false pour une
--     session révoquée : effet immédiat, sur le jeton déjà émis, sans attendre
--     son expiration ;
--   * contexte_acces_proxy expose `session_revoquee` pour que le proxy Next.js
--     déconnecte proprement l'appareil (signOut local + redirection /login) ;
--   * enregistrer_appareil_courant refuse une session révoquée et ne peut donc
--     plus annuler la révocation. Une NOUVELLE connexion (nouveau mot de passe
--     saisi = nouvelle session) sur le même appareil le réactive, comme avant :
--     couper définitivement un salarié parti reste la désactivation du compte.
-- Les autres appareils du même utilisateur ne sont pas touchés (révocation
-- ciblée, pas « déconnecter partout »).
--
-- Limite assumée, documentée : un appareil vu pour la dernière fois AVANT
-- cette migration n'a pas encore de session_id ; il est lié à sa session au
-- prochain passage d'AppPresenceTracker (au plus un par jour et par onglet).
-- La révocation d'un tel appareil reste enregistrée mais ne peut viser
-- aucune session tant qu'il n'est pas revenu.

-- 1. Sessions révoquées ------------------------------------------------------
create table if not exists public.sessions_revoquees (
  session_id uuid primary key,
  utilisateur_id uuid not null,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  appareil_id uuid references public.appareils_comptes(id) on delete set null,
  revoque_par uuid,
  revoque_at timestamptz not null default now()
);
create index if not exists sessions_revoquees_utilisateur_idx
  on public.sessions_revoquees (utilisateur_id, revoque_at desc);
alter table public.sessions_revoquees enable row level security;
revoke all on public.sessions_revoquees from anon, authenticated;
grant all on public.sessions_revoquees to service_role;

alter table public.appareils_comptes add column if not exists session_id uuid;
create index if not exists appareils_comptes_session_idx
  on public.appareils_comptes (session_id) where session_id is not null;

-- Session du JWT courant (claim GoTrue `session_id`), null si absent ou mal formé.
create or replace function public.session_jwt_courante()
returns uuid
language sql
stable
set search_path = public
as $$
  select case
    when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'session_id')::uuid
  end;
$$;

create or replace function public.session_courante_revoquee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions_revoquees s
     where s.session_id = public.session_jwt_courante()
  );
$$;
revoke all on function public.session_courante_revoquee() from public, anon;
grant execute on function public.session_courante_revoquee() to authenticated, service_role;

-- 2. Fonctions d'appartenance : corps inchangés, session révoquée => false ---
create or replace function public.est_membre_actif(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.session_courante_revoquee() and (
    public.est_acces_support_actif(p_entreprise_id) or exists (
      select 1
      from public.utilisateurs_entreprises ue
      join public.entreprises e on e.id = ue.entreprise_id
      where ue.entreprise_id = p_entreprise_id
        and ue.utilisateur_id = auth.uid()
        and ue.statut = 'actif'
        and e.abonnement_statut not in ('suspendu', 'annule')
        and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
    )
  );
$$;

create or replace function public.est_membre_actif_reel(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.session_courante_revoquee() and exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.entreprises e on e.id = ue.entreprise_id
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
      and e.abonnement_statut not in ('suspendu', 'annule')
      and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
  );
$$;

create or replace function public.a_permission(p_entreprise_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.session_courante_revoquee() and (
    public.est_acces_support_actif(p_entreprise_id) or exists (
      select 1
      from public.utilisateurs_entreprises ue
      where ue.utilisateur_id = auth.uid()
        and ue.entreprise_id = p_entreprise_id
        and ue.statut = 'actif'
        and public.est_membre_actif(p_entreprise_id)
        and (
          (p_permission = 'saisir_son_pointage' and ue.pointage_personnel_actif)
          or
          (p_permission <> 'saisir_son_pointage' and exists (
            select 1
            from public.permissions_poste pp
            where pp.entreprise_id = ue.entreprise_id
              and pp.poste_id = ue.poste_id
              and pp.cle_permission = p_permission
              and pp.autorise
          ))
        )
    )
  );
$$;

-- 3. Contexte du proxy : même contrat + `session_revoquee` -------------------
create or replace function public.contexte_acces_proxy(
  p_droits_acces text[] default '{}'::text[],
  p_droits_gestion text[] default '{}'::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entreprise uuid;
  v_depot boolean := false;
  v_support boolean := false;
  v_acces boolean := false;
  v_gestion boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('connecte', false);
  end if;

  -- PE-07 : une session dont l'appareil a été révoqué n'a plus aucun droit ;
  -- le proxy la déconnecte.
  if public.session_courante_revoquee() then
    return jsonb_build_object(
      'connecte', true,
      'session_revoquee', true,
      'compte_depot', false,
      'entreprise_id', null,
      'acces_support', false,
      'droit_acces', false,
      'droit_gestion', false
    );
  end if;

  -- Le compte partage du depot reste prioritaire sur tout le reste.
  v_depot := coalesce(public.est_compte_depot_courant(), false);

  select entreprise_active_id into v_entreprise
    from public.utilisateurs where id = v_uid;

  if v_entreprise is not null then
    -- Une session de support ouverte donne acces sans verifier les permissions.
    v_support := coalesce(public.est_acces_support_actif(v_entreprise), false);

    -- Appartenance active ET permission accordee, en une seule jointure.
    -- Les deux controles du proxy (acces au module, droit de modification)
    -- sont evalues ici afin de ne pas payer un second aller-retour.
    if array_length(p_droits_acces, 1) is not null then
      select exists (
        select 1
        from public.utilisateurs_entreprises ue
        join public.permissions_poste pp
          on pp.entreprise_id = ue.entreprise_id
         and pp.poste_id = ue.poste_id
        where ue.utilisateur_id = v_uid
          and ue.entreprise_id = v_entreprise
          and ue.statut = 'actif'
          and pp.cle_permission = any(p_droits_acces)
          and pp.autorise
      ) into v_acces;
    end if;

    if array_length(p_droits_gestion, 1) is not null then
      select exists (
        select 1
        from public.utilisateurs_entreprises ue
        join public.permissions_poste pp
          on pp.entreprise_id = ue.entreprise_id
         and pp.poste_id = ue.poste_id
        where ue.utilisateur_id = v_uid
          and ue.entreprise_id = v_entreprise
          and ue.statut = 'actif'
          and pp.cle_permission = any(p_droits_gestion)
          and pp.autorise
      ) into v_gestion;
    end if;
  end if;

  return jsonb_build_object(
    'connecte', true,
    'session_revoquee', false,
    'compte_depot', v_depot,
    'entreprise_id', v_entreprise,
    'acces_support', v_support,
    'droit_acces', v_acces,
    'droit_gestion', v_gestion
  );
end;
$$;

-- 4. Enregistrement d'appareil : lie la session, ne dé-révoque plus ---------
create or replace function public.enregistrer_appareil_courant(
  p_entreprise_id uuid,
  p_identifiant_appareil uuid,
  p_nom_appareil text,
  p_type_appareil text default 'ordinateur',
  p_application_installee boolean default false
) returns integer
language plpgsql security definer set search_path=public as $$
declare v_nombre integer; v_session uuid := public.session_jwt_courante();
begin
  if auth.uid() is null or public.session_courante_revoquee() or not exists(
    select 1 from public.utilisateurs_entreprises ue
    where ue.utilisateur_id=auth.uid() and ue.entreprise_id=p_entreprise_id and ue.statut='actif'
  ) then raise exception 'Accès refusé';end if;
  if p_type_appareil not in ('ordinateur','telephone','tablette','autre') then raise exception 'Type d’appareil invalide';end if;
  if length(btrim(coalesce(p_nom_appareil,''))) not between 2 and 80 then raise exception 'Nom d’appareil invalide';end if;

  insert into public.appareils_comptes(
    entreprise_id,utilisateur_id,identifiant_appareil,nom_appareil,type_appareil,application_installee,session_id
  ) values (
    p_entreprise_id,auth.uid(),p_identifiant_appareil,left(btrim(p_nom_appareil),80),p_type_appareil,p_application_installee,v_session
  ) on conflict(utilisateur_id,identifiant_appareil) do update set
    entreprise_id=excluded.entreprise_id,
    nom_appareil=excluded.nom_appareil,
    type_appareil=excluded.type_appareil,
    application_installee=appareils_comptes.application_installee or excluded.application_installee,
    derniere_activite_at=now(),
    session_id=coalesce(excluded.session_id,appareils_comptes.session_id),
    -- Une session révoquée est refusée plus haut : arriver ici avec un appareil
    -- révoqué signifie une nouvelle connexion, qui le réactive.
    revoque_at=null;

  update public.employes set
    premiere_connexion_at=coalesce(premiere_connexion_at,now()),
    derniere_connexion_at=now(),
    application_installee_at=case when p_application_installee then coalesce(application_installee_at,now()) else application_installee_at end,
    updated_at=now()
  where entreprise_id=p_entreprise_id and utilisateur_id=auth.uid() and statut not in ('sorti','suspendu');

  select count(*) into v_nombre from public.appareils_comptes
  where utilisateur_id=auth.uid() and revoque_at is null;
  return v_nombre;
end;$$;

-- 5. Révocation : invalide la session liée ---------------------------------
create or replace function public.revoquer_appareil_compte(
  p_entreprise_id uuid,p_appareil_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare v_utilisateur uuid; v_session uuid;
begin
  if auth.uid() is null then raise exception 'Non authentifié';end if;
  update public.appareils_comptes set revoque_at=now()
  where id=p_appareil_id and entreprise_id=p_entreprise_id and revoque_at is null
    and (utilisateur_id=auth.uid() or public.a_permission(p_entreprise_id,'gerer_employes') or public.a_permission(p_entreprise_id,'gerer_utilisateurs'))
  returning utilisateur_id, session_id into v_utilisateur, v_session;
  if not found then raise exception 'Appareil inaccessible';end if;

  if v_session is not null then
    insert into public.sessions_revoquees(session_id,utilisateur_id,entreprise_id,appareil_id,revoque_par)
    values (v_session,v_utilisateur,p_entreprise_id,p_appareil_id,auth.uid())
    on conflict (session_id) do nothing;
    -- Invalide aussi le refresh token de cette session quand le rôle
    -- propriétaire y a accès (Supabase : auth.sessions). Best effort : la
    -- barrière qui fait foi est sessions_revoquees, vérifiée par la RLS.
    begin
      execute 'delete from auth.sessions where id = $1' using v_session;
    exception when undefined_table or insufficient_privilege then
      null;
    end;
  end if;
end;$$;

notify pgrst, 'reload schema';
