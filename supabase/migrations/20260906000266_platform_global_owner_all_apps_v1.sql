-- ELSATIA-GLOBAL-OWNER-ALL-APPS-ACCESS-V1
--
-- Décision produit : `julien@elsatia.fr` est le PROPRIÉTAIRE GLOBAL ELSATIA. Il doit
-- accéder à toutes les applications actives du catalogue — Gestion Pro, Colors, Tools
-- aujourd'hui, Réserves et toute application future — sans habilitation manuelle par
-- application ni exception codée dans chaque interface.
--
-- Migration strictement ADDITIVE et POST-CUTOVER (ledger 263, cible 996be15 inchangée).
-- Les migrations historiques 00233 / 00234 / 00235 / 00236 / 00237 ne sont pas réécrites :
-- 00236 avait délibérément forcé `julien@elsatia.fr` à `actif=false / en_attente` en
-- attendant « son lot d'activation explicite ». Ce fichier EST ce lot.
--
-- Ce qui existait déjà et n'est donc pas réinventé ici :
--   * `a_acces_application()` accorde déjà toute application ACTIVE du catalogue à
--     `est_plateforme_admin()` — la règle est générique, pas une liste d'applications ;
--   * `applications_autorisees()` renvoie déjà tout le catalogue actif à un admin
--     plateforme, y compris une application ajoutée après coup ;
--   * `contexte_application_courant()` sait déjà répondre « Administration ELSATIA »
--     à un admin plateforme sans appartenance entreprise.
-- Les trois vrais manques traités ici sont : (1) aucune notion de propriétaire distincte
-- d'un admin délégué, (2) aucun chemin d'activation pour le propriétaire lui-même,
-- (3) Tools ne connaît que les entitlements commerciaux et laisse le propriétaire en Free.
--
-- Ce que cette migration ne fait PAS : ouvrir les DONNÉES métier d'une entreprise.
-- L'isolation multi-tenant reste entière — `colors_action_autorisee()` continue de
-- n'accorder au plateforme que la lecture sous session support explicite, et les RLS
-- métier Gestion Pro restent inchangées. « Accès total » désigne le catalogue
-- d'applications et l'administration de la plateforme, jamais un contournement de RLS.

-- ── 1. Registre du propriétaire ───────────────────────────────────────────────
-- Colonne déclarative : la poser n'accorde aucun droit. Le propriétaire reste soumis
-- au même cycle d'identité (`utilisateur_id` + `actif` + `statut_identite`) que tout
-- autre administrateur ; c'est ce cycle, jamais l'email, qui autorise.
alter table public.plateforme_admins
  add column if not exists proprietaire boolean not null default false;

-- Le propriétaire global est nécessairement « Accès total » : un propriétaire dégradé
-- en `support`/`facturation`/`lecture` serait une incohérence de contrat, pas un choix.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plateforme_admins_proprietaire_role_check'
  ) then
    alter table public.plateforme_admins
      add constraint plateforme_admins_proprietaire_role_check
      check (not proprietaire or role = 'total');
  end if;
end $$;

-- Un seul propriétaire global. Les autres administrateurs restent des délégués.
create unique index if not exists plateforme_admins_proprietaire_unique
  on public.plateforme_admins ((true)) where proprietaire;

-- Filet : la ligne vient de 00233, mais un environnement partiellement reconstruit
-- ne doit pas faire échouer la désignation. Aucune activation n'est déduite ici.
insert into public.plateforme_admins (
  email, role, ajoute_par, utilisateur_id, actif, statut_identite
)
values (
  'julien@elsatia.fr', 'total', 'elsatia:global_owner_v1', null, false, 'en_attente'
)
on conflict (email) do nothing;

-- Désignation pure : l'identité reste dans l'état où 00236 l'a laissée.
update public.plateforme_admins
set proprietaire = true,
    updated_at = now()
where lower(email) = 'julien@elsatia.fr'
  and not proprietaire;

-- ── 2. Prédicats canoniques ───────────────────────────────────────────────────
-- Résolus par auth.uid() uniquement. L'email n'est jamais consulté : une comparaison
-- d'email dans un prédicat d'autorisation serait exactement la faille que 00235/00236
-- ont fermée. L'état Auth (email vérifié, compte non banni, non supprimé) est revérifié
-- à chaque appel, pour qu'un JWT encore valide ne survive pas à une suspension.
create or replace function public.plateforme_identite_auth_saine(p_utilisateur_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_utilisateur_id
      and u.email_confirmed_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  );
$$;
revoke all on function public.plateforme_identite_auth_saine(uuid) from public, anon, authenticated;

-- PROPRIÉTAIRE GLOBAL : l'unique identité marquée `proprietaire`, active et saine.
create or replace function public.est_plateforme_proprietaire()
returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.plateforme_admins pa
    where pa.utilisateur_id = auth.uid()
      and pa.proprietaire
      and pa.actif
      and pa.statut_identite = 'active'
      and pa.role = 'total'
      and public.plateforme_identite_auth_saine(pa.utilisateur_id)
  );
$$;

-- SUPERUSER APPLICATIF : rôle plateforme `total` actif. C'est le contrat générique
-- demandé pour ouvrir une application sans créer à la main un rôle applicatif
-- (`colors_admin_organisation`, `reserves_*`, …) dans chaque nouvelle application.
-- Volontairement plus large que le propriétaire : un `total` délégué est déjà habilité
-- à créer des entreprises, modifier des abonnements et activer des applications.
-- Volontairement plus étroit que `est_plateforme_admin()` : `support`, `facturation`
-- et `lecture` ne deviennent pas superusers applicatifs.
create or replace function public.plateforme_est_superuser()
returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.plateforme_admins pa
    where pa.utilisateur_id = auth.uid()
      and pa.actif
      and pa.statut_identite = 'active'
      and pa.role = 'total'
      and public.plateforme_identite_auth_saine(pa.utilisateur_id)
  );
$$;

revoke all on function public.est_plateforme_proprietaire() from public, anon;
revoke all on function public.plateforme_est_superuser() from public, anon;
grant execute on function public.est_plateforme_proprietaire() to authenticated;
grant execute on function public.plateforme_est_superuser() to authenticated;

-- ── 3. Revendication du compte propriétaire ───────────────────────────────────
-- Problème réel constaté à l'audit : sur une base neuve (et sur toute base où aucun
-- `auth.users` ne correspondait au moment de 00235), TOUTES les lignes admin sont
-- `en_attente` sans UID. `plateforme_rattacher_admin` et `plateforme_activer_admin`
-- exigent un appelant `total` déjà actif : il n'existe alors aucun chemin applicatif,
-- et la plateforme n'est administrable que par une intervention SQL de maintenance.
--
-- Cette RPC ouvre un chemin unique, borné et audité pour la SEULE identité propriétaire.
-- Elle ne remplace pas le cycle à deux personnes : celui-ci reste obligatoire pour tout
-- administrateur délégué (`plateforme_activer_admin` refuse toujours l'auto-activation).
--
-- Conditions cumulatives, toutes vérifiées côté serveur :
--   * session AAL2 (claim `aal` du JWT vérifié par Supabase, jamais un paramètre client) ;
--   * facteur MFA vérifié sur le compte appelant ;
--   * email Auth confirmé, compte ni banni ni supprimé ;
--   * l'email du compte appelant est exactement celui de la ligne `proprietaire` ;
--   * la ligne propriétaire n'est pas déjà rattachée à un AUTRE compte ;
--   * la ligne n'est pas révoquée (une révocation ne se contourne pas soi-même).
-- Le seul pouvoir résiduel est la maîtrise de la boîte `julien@elsatia.fr` avec MFA —
-- c'est le compte propriétaire lui-même. Après la première revendication, l'UID est figé.
create or replace function public.plateforme_proprietaire_revendiquer()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirme timestamptz;
  v_banni timestamptz;
  v_supprime timestamptz;
  v_ligne public.plateforme_admins;
begin
  if v_uid is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();

  select lower(u.email), u.email_confirmed_at, u.banned_until, u.deleted_at
  into v_email, v_confirme, v_banni, v_supprime
  from auth.users u where u.id = v_uid;

  if v_email is null or v_confirme is null then
    raise exception 'Compte propriétaire non vérifié' using errcode = '42501';
  end if;
  if v_supprime is not null or (v_banni is not null and v_banni > now()) then
    raise exception 'Compte propriétaire suspendu' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified'
  ) then
    raise exception 'Authentification forte requise' using errcode = '42501';
  end if;

  select * into v_ligne from public.plateforme_admins where proprietaire for update;
  if v_ligne.email is null then
    raise exception 'Aucun propriétaire ELSATIA déclaré' using errcode = '42501';
  end if;
  if lower(v_ligne.email) <> v_email then
    raise exception 'Ce compte n''est pas le propriétaire ELSATIA' using errcode = '42501';
  end if;
  if v_ligne.utilisateur_id is not null and v_ligne.utilisateur_id <> v_uid then
    raise exception 'Identité propriétaire déjà rattachée à un autre compte' using errcode = '42501';
  end if;

  -- Idempotent : une revendication répétée ne réécrit pas la trace d'activation.
  if v_ligne.statut_identite = 'active' then
    return;
  end if;
  if v_ligne.statut_identite not in ('en_attente', 'rattachee_non_confirmee') then
    raise exception 'Identité propriétaire révoquée : réactivation par un administrateur total requise'
      using errcode = '42501';
  end if;

  -- Deux temps, pour respecter la machine à états de 00237 (en_attente →
  -- rattachee_non_confirmee → active) plutôt que de la court-circuiter.
  if v_ligne.statut_identite = 'en_attente' then
    update public.plateforme_admins
    set utilisateur_id = v_uid,
        actif = false,
        statut_identite = 'rattachee_non_confirmee',
        updated_at = now()
    where email = v_ligne.email;
  end if;

  update public.plateforme_admins
  set actif = true,
      statut_identite = 'active',
      activation_at = now(),
      activation_par = v_uid,
      revocation_at = null,
      revocation_par = null,
      revocation_origine = null,
      updated_at = now()
  where email = v_ligne.email;

  -- `plateforme_journaliser` exige un rôle plateforme déjà résolu : elle n'est pas
  -- utilisable ici (la ligne vient seulement de devenir active dans la transaction).
  insert into public.plateforme_journal_actions (
    acteur_id, acteur_email, action, cible_type, cible_id, details
  ) values (
    v_uid, v_email, 'proprietaire_plateforme_revendique', 'administrateur', v_ligne.email,
    jsonb_build_object('methode', 'revendication_proprietaire_aal2_mfa')
  );
end;
$$;
revoke all on function public.plateforme_proprietaire_revendiquer() from public, anon;
grant execute on function public.plateforme_proprietaire_revendiquer() to authenticated;

-- ── 4. Équipe plateforme : distinguer propriétaire et délégué ─────────────────
-- Lecture seule. Le changement de type de retour impose un DROP préalable (42P13),
-- comme en 00251 ; aucun objet SQL ne dépend de cette fonction.
drop function if exists public.plateforme_lister_admins();
create function public.plateforme_lister_admins()
returns table(
  email text, role text, nom text, ajoute_par text,
  actif boolean, statut_identite text, proprietaire boolean, created_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
begin
  perform public.plateforme_exiger_permission('gerer_equipe');
  return query
  select pa.email, pa.role, pa.nom, pa.ajoute_par, pa.actif, pa.statut_identite,
         pa.proprietaire, pa.created_at
  from public.plateforme_admins pa
  order by pa.proprietaire desc, pa.actif desc, pa.created_at;
end;
$$;
revoke all on function public.plateforme_lister_admins() from public, anon, authenticated;
grant execute on function public.plateforme_lister_admins() to authenticated;

-- ── 5. Protection de l'identité propriétaire ──────────────────────────────────
-- Sans cela, un administrateur `total` délégué pourrait révoquer ou dégrader le
-- propriétaire dès qu'un second `total` actif existe (la garde « dernier total actif »
-- de 00237 ne s'y oppose plus). Les deux fonctions sont redéfinies à l'identique,
-- avec une seule garde supplémentaire chacune ; aucune autre règle n'est assouplie.
create or replace function public.plateforme_retirer_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
  v_role text;
  v_etat text;
  v_proprietaire boolean;
begin
  -- Un premier contrôle empêche un appelant non autorisé d'occuper le verrou. Le
  -- second, après l'attente, couvre une révocation concurrente de l'appelant.
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  select utilisateur_id, role, statut_identite, proprietaire
  into v_utilisateur_id, v_role, v_etat, v_proprietaire
  from public.plateforme_admins where email = v_email for update;
  if not found then raise exception 'Administrateur introuvable'; end if;
  if v_proprietaire then
    raise exception 'Le propriétaire global ELSATIA ne peut pas être révoqué depuis la plateforme';
  end if;
  if v_etat = 'revoquee' then raise exception 'Administrateur déjà révoqué'; end if;
  if v_utilisateur_id = auth.uid() then raise exception 'Vous ne pouvez pas révoquer votre propre compte'; end if;
  if v_role = 'total' and v_etat = 'active' and (
    select count(*) from public.plateforme_admins
    where role = 'total' and actif and statut_identite = 'active'
  ) <= 1 then
    raise exception 'Impossible de révoquer le dernier administrateur total actif';
  end if;

  update public.plateforme_admins
  set actif = false,
      statut_identite = 'revoquee',
      revocation_at = now(),
      revocation_par = auth.uid(),
      revocation_origine = 'utilisateur',
      updated_at = now()
  where email = v_email;

  update public.plateforme_acces_entreprises
  set termine_at = now(), termine_motif = 'Révocation administrateur'
  where plateforme_user_id = v_utilisateur_id and termine_at is null;
end;
$$;

create or replace function public.plateforme_modifier_role_admin(
  p_email text,
  p_role text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
  v_role_actuel text;
  v_etat text;
  v_proprietaire boolean;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  if p_role not in ('total','support','facturation','lecture') then raise exception 'Rôle invalide'; end if;
  select utilisateur_id, role, statut_identite, proprietaire
  into v_utilisateur_id, v_role_actuel, v_etat, v_proprietaire
  from public.plateforme_admins
  where email = v_email
  for update;
  if not found then raise exception 'Administrateur introuvable'; end if;
  if v_proprietaire and p_role <> 'total' then
    raise exception 'Le propriétaire global ELSATIA conserve le rôle « Accès total »';
  end if;
  if v_utilisateur_id = auth.uid() then raise exception 'Auto-modification de rôle interdite'; end if;

  if v_etat = 'active' and v_role_actuel = 'total' and p_role <> 'total'
     and (select count(*) from public.plateforme_admins
          where role = 'total' and actif and statut_identite = 'active') <= 1 then
    raise exception 'Impossible de retirer le rôle du dernier administrateur total actif';
  end if;

  update public.plateforme_admins
  set role = p_role,
      role_updated_at = now(),
      role_updated_by = auth.uid(),
      updated_at = now()
  where email = v_email;
end;
$$;
revoke all on function public.plateforme_retirer_admin(text) from public, anon;
revoke all on function public.plateforme_modifier_role_admin(text,text) from public, anon;
grant execute on function public.plateforme_retirer_admin(text) to authenticated;
grant execute on function public.plateforme_modifier_role_admin(text,text) to authenticated;

-- ── 6. Tools : contexte superuser applicatif ──────────────────────────────────
-- Corps identique à la version R9 (00237 Tools), avec une seule branche ajoutée en
-- tête. Aucun utilisateur normal n'est touché : sans droit serveur, Tools reste Free.
-- Le propriétaire (et tout `total` actif) obtient Pro sans abonnement commercial et
-- sans ligne dans `entitlements_utilisateurs_elsatia` — donc sans jamais fausser la
-- facturation ni l'historique de monétisation.
create or replace function public.tools_resoudre_entitlements()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source text;
  v_expire_le timestamptz;
  v_capabilities text[];
  v_sources jsonb;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;

  if public.plateforme_est_superuser() then
    return jsonb_build_object(
      'application', 'tools', 'tier', 'pro',
      'capabilities', to_jsonb(array[
        'basic-calculation','basic-tracing','site-instructions','advanced-layout','dimensioned-plan',
        'export-pdf','export-svg','saved-projects','advanced-tracing','promotion-free',
        'advanced-geometry','construction-points','design-shapes','derived-quantities',
        'print-plan','native-share','project-duplicate','project-archive'
      ]::text[]),
      'source', 'plateforme',
      'sources', jsonb_build_array(jsonb_build_object(
        'source', 'plateforme', 'status', 'active', 'expires_at', null, 'renews_at', null
      )),
      'expires_at', null, 'validated_at', now(), 'cache_version', 1, 'grace_seconds', 604800
    );
  end if;

  select e.source, e.expire_le into v_source, v_expire_le
  from public.entitlements_utilisateurs_elsatia e
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active', 'grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now())
  order by e.priorite desc,
    case e.source when 'internal' then 5 when 'elsatia' then 4 when 'apple' then 3 when 'google' then 2 when 'web' then 1 else 0 end desc,
    e.created_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('source', e.source, 'status', e.status,
    'expires_at', e.expire_le, 'renews_at', e.renews_at) order by e.priorite desc), '[]'::jsonb)
  into v_sources from public.entitlements_utilisateurs_elsatia e
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active', 'grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now());

  if v_source is null then
    return jsonb_build_object('application','tools','tier','free','capabilities',jsonb_build_array(
      'basic-calculation','basic-tracing','site-instructions'),'source','free-default','sources',v_sources,
      'expires_at',null,'validated_at',now(),'cache_version',1,'grace_seconds',604800);
  end if;

  select coalesce(array_agg(distinct capability order by capability), '{}'::text[]) into v_capabilities
  from public.entitlements_utilisateurs_elsatia e, unnest(e.capabilities) capability
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active','grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now());
  return jsonb_build_object('application','tools','tier','pro','capabilities',to_jsonb(v_capabilities),
    'source',v_source,'sources',v_sources,'expires_at',v_expire_le,'validated_at',now(),
    'cache_version',1,'grace_seconds',604800);
end;
$$;
revoke all on function public.tools_resoudre_entitlements() from public, anon, service_role;
grant execute on function public.tools_resoudre_entitlements() to authenticated;

notify pgrst, 'reload schema';
