-- ELSATIA — Per-App Commercial Suspension & Entitlement Enforcement V1
-- (docs/qualification/ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1.md)
--
-- Constat (Billing Lifecycle V1 §12, DECISION_REQUIRED:BILLING-SUSPENSION-PAR-APPLICATION,
-- tranchée par le propriétaire : « suspension commerciale = par application ; suspension
-- plateforme / sécurité = globale uniquement si explicitement déclenchée ») :
-- `a_acces_application` exigeait `est_membre_actif`, qui embarque l'état commercial de
-- Gestion Pro (statut d'abonnement, suspension programmée pour impayé, essai expiré). Un
-- impayé GP coupait donc Tools (organisation), Colors, Réserves et le rôle Relevé, alors
-- que ces droits sont matérialisés séparément dans `acces_applications_entreprises`.
--
-- Modèle appliqué :
--   compte (entreprise) : ACCOUNT_GLOBAL_ACTIVE / ACCOUNT_GLOBAL_SUSPENDED, porté par des
--     colonnes DÉDIÉES (`suspension_globale_*`), posées uniquement par une RPC plateforme
--     explicite (rôle total + AAL2), jamais par un impayé, un webhook ou un cron ;
--   application : entitled / trial / active / past_due / unpaid / cancelled / suspended.
--     Gestion Pro : dérivé de `entreprises` (inchangé : Stripe, essai, impayé manuel) ;
--     autres applications : `acces_applications_entreprises.statut_commercial`.
--     Ouvert = entitled, trial non échu, active. Fermé = past_due, unpaid, cancelled,
--     suspended (même règle que GP : suspension immédiate, sans délai de grâce).
--
--   est_membre_plateforme_actif(e) = session non révoquée ET (support actif OU (membre
--     actif ET compte non suspendu globalement)). Aucune condition commerciale.
--   est_membre_actif(e) (accès métier GP, ~150 policies, inchangées) =
--     est_membre_plateforme_actif(e) ET GP commercialement ouvert (support : comme avant).
--   a_acces_application(e, app) = est_membre_plateforme_actif(e) ET app commercialement
--     ouverte ET entitlement ET habilitation (inchangés).
--
-- Compatibilité : toutes les lignes existantes reçoivent `statut_commercial = 'entitled'`
-- (droit accordé tel quel), aucune suspension globale n'est posée. Personne ne perd un
-- droit (garde en fin de migration : exception si une seule perte est détectée). Les
-- comptes dont le comportement change (gain : application non GP rouverte alors que GP
-- est fermé) sont écrits dans `rapport_migration_suspension_par_app_v1`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Instantané « avant » (règle V6 : GP ouvert ET entitlement ouvert)
-- ─────────────────────────────────────────────────────────────────────────────
create temp table _avant_per_app as
select ae.entreprise_id, ae.application_code,
       (e.abonnement_statut not in ('suspendu', 'annule')
        and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
        and not (e.abonnement_statut = 'essai'
                 and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date)
        and ae.autorise and a.actif
        and (ae.valide_du is null or ae.valide_du <= now())
        and (ae.valide_jusqu_au is null or ae.valide_jusqu_au > now())) as ouvert
from public.acces_applications_entreprises ae
join public.entreprises e on e.id = ae.entreprise_id
join public.applications_elsatia a on a.code = ae.application_code;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Suspension globale (plateforme / sécurité) : colonnes dédiées
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.entreprises
  add column suspension_globale_at timestamptz,
  add column suspension_globale_motif text,
  add column suspension_globale_par uuid references auth.users(id) on delete set null,
  add constraint entreprises_suspension_globale_coherente
    check ((suspension_globale_at is null) = (suspension_globale_motif is null)),
  add constraint entreprises_suspension_globale_motif_non_vide
    check (suspension_globale_motif is null or btrim(suspension_globale_motif) <> '');

comment on column public.entreprises.suspension_globale_at is
  'Suspension plateforme / sécurité du compte entier (toutes applications). Posée UNIQUEMENT par plateforme_suspendre_compte_global ; jamais déduite d''un impayé.';

-- Personne ne pose ni ne lève la suspension globale en écrivant la ligne : seul le chemin
-- RPC (drapeau transactionnel) ou une session sans utilisateur (migration, exploitation
-- sous clé serveur) le peut. Couvre aussi les administrateurs tenant (gerer_parametres).
create or replace function public.proteger_suspension_globale_entreprise()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.suspension_globale_at is distinct from old.suspension_globale_at
      or new.suspension_globale_motif is distinct from old.suspension_globale_motif
      or new.suspension_globale_par is distinct from old.suspension_globale_par)
     and auth.uid() is not null
     and coalesce(current_setting('elsatia.suspension_globale_rpc', true), '') <> 'on' then
    raise exception 'La suspension globale d''un compte est réservée à la plateforme'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_suspension_globale_entreprise() from public, anon, authenticated;

create trigger entreprises_proteger_suspension_globale
  before update on public.entreprises
  for each row execute function public.proteger_suspension_globale_entreprise();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. État commercial par application (hors Gestion Pro)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.acces_applications_entreprises
  add column statut_commercial text not null default 'entitled',
  add column statut_commercial_at timestamptz,
  add column essai_fin timestamptz,
  add column commercial_subscription_ref text,
  add column commercial_evenement_at timestamptz,
  add column commercial_motif text,
  add constraint acces_applications_statut_commercial_valide
    check (statut_commercial in ('entitled', 'trial', 'active', 'past_due', 'unpaid', 'cancelled', 'suspended')),
  -- L'état commercial de Gestion Pro vit sur `entreprises` (Stripe, essai, impayé) : une
  -- seconde source ici serait une ambiguïté.
  add constraint acces_applications_statut_gp_unique_source
    check (application_code <> 'gestion_pro' or statut_commercial = 'entitled'),
  add constraint acces_applications_essai_borne
    check (statut_commercial <> 'trial' or essai_fin is not null);

-- Journal idempotent des événements commerciaux par application (webhook local / mock).
create table public.evenements_commerciaux_applications (
  evenement_id text primary key check (btrim(evenement_id) <> ''),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  application_code text not null references public.applications_elsatia(code) on delete restrict,
  statut_stripe text not null,
  subscription_ref text,
  evenement_at timestamptz not null,
  decision text not null check (decision in ('applique', 'perime', 'sans_effet')),
  motif text,
  statut_avant text,
  statut_apres text,
  created_at timestamptz not null default now()
);
alter table public.evenements_commerciaux_applications enable row level security;
revoke all on public.evenements_commerciaux_applications from public, anon, authenticated;
create policy evenements_commerciaux_applications_plateforme on public.evenements_commerciaux_applications
  for select to authenticated using (public.est_plateforme_admin());
grant select on public.evenements_commerciaux_applications to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Prédicats
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.compte_suspendu_globalement(p_entreprise_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.entreprises e
    where e.id = p_entreprise_id
      and e.suspension_globale_at is not null
      and e.suspension_globale_at <= now()
  );
$$;

-- État commercial Gestion Pro, dérivé des colonnes existantes (aucune nouvelle source).
create or replace function public.etat_commercial_gestion_pro(p_entreprise_id uuid)
returns text
language sql
stable security definer
set search_path to 'public'
as $$
  select case
           when e.abonnement_statut = 'annule' then 'cancelled'
           when e.abonnement_statut = 'suspendu' then 'suspended'
           when e.suspension_prevue_at is not null and e.suspension_prevue_at <= now() then 'unpaid'
           when e.abonnement_statut = 'essai'
                and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date
             then 'suspended'
           when e.abonnement_statut = 'essai' then 'trial'
           else 'active'
         end
  from public.entreprises e
  where e.id = p_entreprise_id;
$$;

-- État commercial d'une application pour une organisation. NULL = aucun droit (pas de
-- ligne, droit retiré, hors fenêtre de validité, application inactive).
create or replace function public.statut_commercial_application(p_entreprise_id uuid, p_application_code text)
returns text
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when p_application_code = 'gestion_pro' then public.etat_commercial_gestion_pro(p_entreprise_id)
    else (
      select case
               when ae.statut_commercial = 'trial' and ae.essai_fin <= now() then 'suspended'
               else ae.statut_commercial
             end
      from public.acces_applications_entreprises ae
      join public.applications_elsatia a on a.code = ae.application_code and a.actif
      where ae.entreprise_id = p_entreprise_id
        and ae.application_code = p_application_code
        and ae.autorise
        and (ae.valide_du is null or ae.valide_du <= now())
        and (ae.valide_jusqu_au is null or ae.valide_jusqu_au > now())
    )
  end;
$$;

create or replace function public.application_commercialement_ouverte(p_entreprise_id uuid, p_application_code text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(public.statut_commercial_application(p_entreprise_id, p_application_code)
                  in ('entitled', 'trial', 'active'), false);
$$;

-- Appartenance plateforme : identité, session, statut de membre, suspension globale.
-- AUCUNE condition commerciale.
create or replace function public.est_membre_plateforme_actif(p_entreprise_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select not public.session_courante_revoquee() and (
    public.est_acces_support_actif(p_entreprise_id) or (
      exists (
        select 1 from public.utilisateurs_entreprises ue
        where ue.entreprise_id = p_entreprise_id
          and ue.utilisateur_id = auth.uid()
          and ue.statut = 'actif'
      )
      and not public.compte_suspendu_globalement(p_entreprise_id)
    )
  );
$$;

-- Accès métier Gestion Pro : même périmètre que `…703` (support compris), plus la
-- suspension globale. Les conditions commerciales GP sont strictement celles d'avant.
create or replace function public.est_membre_actif(p_entreprise_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
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
        and not (
          e.abonnement_statut = 'essai'
          and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date
        )
        and not (e.suspension_globale_at is not null and e.suspension_globale_at <= now())
    )
  );
$$;

create or replace function public.est_membre_actif_reel(p_entreprise_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
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
      and not (
        e.abonnement_statut = 'essai'
        and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date
      )
      and not (e.suspension_globale_at is not null and e.suspension_globale_at <= now())
  );
$$;

-- Décision centrale multi-application : l'état commercial est celui DE L'APPLICATION.
create or replace function public.a_acces_application(
  p_entreprise_id uuid,
  p_application_code text
) returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select auth.uid() is not null
    and (
      (
        public.est_plateforme_admin()
        and exists(select 1 from public.applications_elsatia a where a.code=p_application_code and a.actif)
      )
      or (
        p_entreprise_id is not null
        and public.est_membre_plateforme_actif(p_entreprise_id)
        and public.application_commercialement_ouverte(p_entreprise_id, p_application_code)
        and exists(
          select 1 from public.acces_applications_entreprises ae
          join public.applications_elsatia a on a.code=ae.application_code and a.actif
          where ae.entreprise_id=p_entreprise_id
            and ae.application_code=p_application_code
            and ae.autorise
            and (ae.valide_du is null or ae.valide_du<=now())
            and (ae.valide_jusqu_au is null or ae.valide_jusqu_au>now())
        )
        and exists(
          select 1 from public.habilitations_applications_utilisateurs hu
          join public.roles_applications_elsatia r
            on r.application_code=hu.application_code and r.code=hu.role_code and r.actif
          where hu.entreprise_id=p_entreprise_id
            and hu.utilisateur_id=auth.uid()
            and hu.application_code=p_application_code
            and hu.autorise
            and (hu.valide_du is null or hu.valide_du<=now())
            and (hu.valide_jusqu_au is null or hu.valide_jusqu_au>now())
        )
      )
    );
$$;

-- D-01 conservée : « hôte fermé » = l'hôte a perdu RÉSERVES (état commercial Réserves,
-- entitlement) ou son compte est suspendu globalement. Un impayé GP seul n'en fait plus
-- partie. Signature, exposition (aucune) et appelants inchangés.
create or replace function public.reserves_hote_ecriture_ouverte(p_entreprise_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select p_entreprise_id is not null
    and exists (select 1 from public.entreprises e where e.id = p_entreprise_id)
    and not public.compte_suspendu_globalement(p_entreprise_id)
    and public.application_commercialement_ouverte(p_entreprise_id, 'reserves');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Fonctions des applications non GP : appartenance plateforme, plus GP commercial
-- ─────────────────────────────────────────────────────────────────────────────
-- Corps identiques ; seule la référence `public.est_membre_actif(` devient
-- `public.est_membre_plateforme_actif(`. Liste fermée, chaque fonction DOIT contenir la
-- référence (sinon la migration échoue plutôt que de laisser un chemin non converti).
do $$
declare
  v_sig text;
  v_def text;
begin
  foreach v_sig in array array[
    'public.reserves_intervenant_courant(uuid)',
    'public.reserves_invitation_accepter(text,uuid)',
    'public.reserves_invitations_en_attente()',
    'public.reserves_notifications_compteur()',
    'public.reserves_notifications_in_app(integer,boolean)',
    'public.reserves_notifications_marquer_lues(uuid[])',
    'public.reserves_preferences_definir(uuid,text,boolean)',
    'public.reserves_preferences_lire(uuid)',
    'public.reserves_rejoindre_intervention(uuid)',
    'public.tools_releve_contexte(uuid)',
    'public.tools_releve_role_courant(uuid)'
  ] loop
    v_def := pg_get_functiondef(v_sig::regprocedure);
    if position('public.est_membre_actif(' in v_def) = 0 then
      raise exception 'per-app suspension : % ne référence plus est_membre_actif', v_sig;
    end if;
    execute replace(v_def, 'public.est_membre_actif(', 'public.est_membre_plateforme_actif(');
  end loop;
end;
$$;

drop policy reserves_annuaire_select on public.reserves_annuaire_publication;
create policy reserves_annuaire_select on public.reserves_annuaire_publication
  for select to authenticated using (public.est_membre_plateforme_actif(entreprise_id));

drop policy reserves_notifications_select on public.reserves_evenements_notifications;
create policy reserves_notifications_select on public.reserves_evenements_notifications
  for select to authenticated using (
    destinataire_entreprise_id is not null
    and public.est_membre_plateforme_actif(destinataire_entreprise_id)
    and public.a_acces_application(destinataire_entreprise_id, 'reserves')
  );

-- Les applications lisent leur propre ligne pour expliquer un refus (« abonnement requis »
-- contre « habilitation requise ») : lisible même quand GP est fermé.
drop policy acces_applications_entreprises_lecture on public.acces_applications_entreprises;
create policy acces_applications_entreprises_lecture on public.acces_applications_entreprises
  for select to authenticated using (
    public.est_membre_plateforme_actif(entreprise_id) or public.est_plateforme_admin()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Chemin facturation minimal : état par application (aucun accès métier)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ouvert à tout membre actif (même application fermée, même compte suspendu
-- globalement) ; `peut_gerer` = administrateur (gerer_parametres) ou support, comme
-- `etat_reabonnement_entreprise`. Aucun identifiant Stripe, aucun motif de sécurité.
create or replace function public.etat_commercial_applications(p_entreprise_id uuid)
returns table(
  application_code text, nom text, statut_commercial text, acces_ouvert boolean,
  compte_global text, essai_fin timestamptz, peut_gerer boolean
)
language sql
stable security definer
set search_path to 'public'
as $$
  with appelant as (
    select e.id,
           public.compte_suspendu_globalement(e.id) as global_suspendu,
           public.est_acces_support_actif(e.id) or exists (
             select 1 from public.permissions_poste pp
             where pp.entreprise_id = e.id and pp.poste_id = ue.poste_id
               and pp.cle_permission = 'gerer_parametres' and pp.autorise = true) as gere
    from public.entreprises e
    left join public.utilisateurs_entreprises ue
      on ue.entreprise_id = e.id and ue.utilisateur_id = auth.uid() and ue.statut = 'actif'
    where e.id = p_entreprise_id
      and auth.uid() is not null
      and not public.session_courante_revoquee()
      and (ue.utilisateur_id is not null or public.est_acces_support_actif(e.id))
  )
  select a.code, a.nom, s.statut,
         not c.global_suspendu and coalesce(s.statut in ('entitled', 'trial', 'active'), false),
         case when c.global_suspendu then 'ACCOUNT_GLOBAL_SUSPENDED' else 'ACCOUNT_GLOBAL_ACTIVE' end,
         case when a.code = 'gestion_pro'
              then (select coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30)::timestamptz
                    from public.entreprises e where e.id = c.id and e.abonnement_statut = 'essai')
              else (select ae.essai_fin from public.acces_applications_entreprises ae
                    where ae.entreprise_id = c.id and ae.application_code = a.code) end,
         c.gere
  from appelant c
  cross join public.applications_elsatia a
  cross join lateral (select public.statut_commercial_application(c.id, a.code) as statut) s
  where a.actif and (a.code = 'gestion_pro' or s.statut is not null)
  order by a.ordre, a.code;
$$;

-- Contexte de session GP : + `suspension_globale` (booléen, jamais le motif) pour que
-- Gestion Pro route un compte suspendu par la plateforme vers son écran dédié. Le type de
-- retour change : drop + create, droits d'origine rétablis à l'identique.
drop function public.contexte_abonnement_courant();
create function public.contexte_abonnement_courant()
returns table(
  entreprise_id uuid, nom text, reference_interne text, logo_url text, abonnement_statut text,
  abonnement_echeance date, abonnement_essai_debut date, abonnement_essai_fin date,
  suspension_prevue_at timestamptz, impaye_message text, acces_support boolean,
  suspension_globale boolean
)
language sql
stable security definer
set search_path to 'public'
as $$
  select e.id,e.nom,e.reference_interne,e.logo_url,e.abonnement_statut,
         e.abonnement_echeance,e.abonnement_essai_debut,e.abonnement_essai_fin,
         e.suspension_prevue_at,e.impaye_message,public.est_acces_support_actif(e.id),
         e.suspension_globale_at is not null and e.suspension_globale_at <= now()
  from public.utilisateurs u
  join public.entreprises e on e.id=u.entreprise_active_id
  where u.id=auth.uid();
$$;
revoke all on function public.contexte_abonnement_courant() from public, anon;
grant execute on function public.contexte_abonnement_courant() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Webhook commercial par application (Stripe local / mock) — service uniquement
-- ─────────────────────────────────────────────────────────────────────────────
-- Ne touche QUE la ligne (entreprise, application) visée. Gestion Pro est refusée : son
-- flux (synchroniser_abonnement_stripe_*_service) reste l'unique autorité et n'écrit
-- jamais dans acces_applications_entreprises.
create or replace function public.synchroniser_statut_commercial_application_service(
  p_entreprise_id uuid,
  p_application_code text,
  p_statut_stripe text,
  p_subscription_ref text,
  p_evenement_id text,
  p_evenement_at timestamptz,
  p_essai_fin timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nouveau text;
  v_ligne public.acces_applications_entreprises;
  v_decision text;
  v_motif text;
  v_avant text;
begin
  if p_application_code = 'gestion_pro' then
    raise exception 'Gestion Pro a son propre flux d''abonnement' using errcode = '22023';
  end if;
  if not exists (select 1 from public.applications_elsatia where code = p_application_code) then
    raise exception 'Application inconnue : %', p_application_code using errcode = '22023';
  end if;
  if p_evenement_id is null or btrim(p_evenement_id) = '' or p_evenement_at is null then
    raise exception 'Événement incomplet' using errcode = '22023';
  end if;
  v_nouveau := case p_statut_stripe
    when 'trialing' then 'trial'
    when 'active' then 'active'
    when 'past_due' then 'past_due'
    when 'unpaid' then 'unpaid'
    when 'canceled' then 'cancelled'
    when 'incomplete_expired' then 'cancelled'
    when 'incomplete' then 'suspended'
    when 'paused' then 'suspended'
  end;
  if v_nouveau is null then
    raise exception 'Statut Stripe non reconnu : %', p_statut_stripe using errcode = '22023';
  end if;
  if v_nouveau = 'trial' and p_essai_fin is null then
    raise exception 'Essai sans date de fin' using errcode = '22023';
  end if;

  -- Réservation idempotente : un même événement n'a qu'une décision.
  insert into public.evenements_commerciaux_applications (
    evenement_id, entreprise_id, application_code, statut_stripe, subscription_ref, evenement_at, decision
  ) values (
    p_evenement_id, p_entreprise_id, p_application_code, p_statut_stripe, p_subscription_ref, p_evenement_at, 'sans_effet'
  ) on conflict (evenement_id) do nothing;
  if not found then
    return jsonb_build_object('decision', 'deja_traite');
  end if;

  select * into v_ligne from public.acces_applications_entreprises
  where entreprise_id = p_entreprise_id and application_code = p_application_code
  for update;
  v_avant := v_ligne.statut_commercial;

  if not found then
    if v_nouveau in ('trial', 'active') then
      insert into public.acces_applications_entreprises (
        entreprise_id, application_code, autorise, source, reference_externe, statut_commercial,
        statut_commercial_at, essai_fin, commercial_subscription_ref, commercial_evenement_at
      ) values (
        p_entreprise_id, p_application_code, true, 'stripe', p_subscription_ref, v_nouveau,
        now(), case when v_nouveau = 'trial' then p_essai_fin end, p_subscription_ref, p_evenement_at
      );
      v_decision := 'applique'; v_motif := 'entitlement_cree';
    else
      v_decision := 'sans_effet'; v_motif := 'entitlement_absent';
    end if;
  elsif v_ligne.statut_commercial = 'cancelled'
        and v_ligne.commercial_subscription_ref is not distinct from p_subscription_ref
        and v_nouveau <> 'cancelled' then
    -- Même règle que B-1 : une subscription terminée n'est jamais rouverte.
    v_decision := 'sans_effet'; v_motif := 'abonnement_termine';
  elsif v_ligne.commercial_subscription_ref is not null
        and v_ligne.commercial_subscription_ref is distinct from p_subscription_ref
        and v_ligne.statut_commercial <> 'cancelled' then
    -- Une autre subscription vivante est rattachée : celle-ci n'a pas autorité.
    v_decision := 'sans_effet'; v_motif := 'subscription_non_rattachee';
  elsif v_ligne.commercial_evenement_at is not null
        and p_evenement_at < v_ligne.commercial_evenement_at
        and v_ligne.commercial_subscription_ref is not distinct from p_subscription_ref
        and v_nouveau <> 'cancelled' then
    -- Filigrane : un événement plus ancien que le dernier appliqué est périmé, sauf la
    -- terminaison (irréversible chez Stripe), appliquée même livrée en retard.
    v_decision := 'perime'; v_motif := 'evenement_anterieur';
  else
    update public.acces_applications_entreprises
    set statut_commercial = v_nouveau,
        statut_commercial_at = now(),
        essai_fin = case when v_nouveau = 'trial' then p_essai_fin else essai_fin end,
        commercial_subscription_ref = p_subscription_ref,
        commercial_evenement_at = greatest(coalesce(commercial_evenement_at, p_evenement_at), p_evenement_at),
        commercial_motif = 'stripe:' || p_statut_stripe
    where id = v_ligne.id;
    -- Rattacher une subscription à un droit déjà ouvert (accord manuel → Stripe) est une
    -- décision appliquée, même à statut égal : la subscription devient l'autorité.
    v_decision := case when v_avant is distinct from v_nouveau
                         or v_ligne.commercial_subscription_ref is distinct from p_subscription_ref
                       then 'applique' else 'sans_effet' end;
    v_motif := case when v_decision = 'sans_effet' then 'etat_identique' end;
  end if;

  update public.evenements_commerciaux_applications
  set decision = v_decision, motif = v_motif, statut_avant = v_avant,
      statut_apres = case when v_decision = 'applique' then v_nouveau else v_avant end
  where evenement_id = p_evenement_id;

  if v_decision = 'applique' then
    insert into public.historique_acces_applications (
      cible_type, cible_id, application_code, action, auteur_email, ancien, nouveau, resultat
    ) values ('entreprise', p_entreprise_id, p_application_code,
            'statut_commercial:' || coalesce(v_avant, 'aucun') || '->' || v_nouveau, null,
            case when v_avant is null then null else jsonb_build_object('statut_commercial', v_avant) end,
            jsonb_build_object('statut_commercial', v_nouveau, 'evenement', p_evenement_id, 'statut_stripe', p_statut_stripe),
            case when v_avant is null then 'cree' else 'modifie' end);
  end if;

  return jsonb_build_object('decision', v_decision, 'motif', v_motif,
                            'avant', v_avant, 'apres', case when v_decision = 'applique' then v_nouveau else v_avant end);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC plateforme explicites
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.plateforme_definir_statut_commercial_application(
  p_entreprise_id uuid,
  p_application_code text,
  p_statut text,
  p_motif text,
  p_essai_fin timestamptz default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ligne public.acces_applications_entreprises;
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_application_code = 'gestion_pro' then
    raise exception 'L''état commercial de Gestion Pro se gère par son abonnement' using errcode = '22023';
  end if;
  if p_statut not in ('entitled', 'trial', 'active', 'past_due', 'unpaid', 'cancelled', 'suspended') then
    raise exception 'Statut commercial inconnu : %', p_statut using errcode = '22023';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Motif obligatoire' using errcode = '22023';
  end if;
  select * into v_ligne from public.acces_applications_entreprises
  where entreprise_id = p_entreprise_id and application_code = p_application_code for update;
  if not found then
    raise exception 'Aucun droit % pour cette entreprise', p_application_code using errcode = 'P0002';
  end if;
  update public.acces_applications_entreprises
  set statut_commercial = p_statut, statut_commercial_at = now(),
      essai_fin = case when p_statut = 'trial' then p_essai_fin else essai_fin end,
      commercial_motif = 'plateforme:' || btrim(p_motif)
  where id = v_ligne.id;
  insert into public.historique_acces_applications (
    cible_type, cible_id, application_code, action, auteur_email, auteur_utilisateur_id, ancien, nouveau
  ) values ('entreprise', p_entreprise_id, p_application_code,
          'statut_commercial:' || v_ligne.statut_commercial || '->' || p_statut, auth.email(), auth.uid(),
          jsonb_build_object('statut_commercial', v_ligne.statut_commercial),
          jsonb_build_object('statut_commercial', p_statut, 'motif', btrim(p_motif)));
  insert into public.historique_mutations_plateforme (
    domaine, action, entreprise_id, objet_type, objet_id, auteur_utilisateur_id, ancien, nouveau
  ) values ('multi_app', 'statut_commercial_application', p_entreprise_id, 'acces_application', v_ligne.id, auth.uid(),
    jsonb_build_object('application', p_application_code, 'statut', v_ligne.statut_commercial),
    jsonb_build_object('application', p_application_code, 'statut', p_statut, 'motif', btrim(p_motif)));
end;
$$;

create or replace function public.plateforme_suspendre_compte_global(p_entreprise_id uuid, p_motif text)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ancien public.entreprises%rowtype; v_at timestamptz := now();
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Motif obligatoire' using errcode = '22023';
  end if;
  select * into v_ancien from public.entreprises where id = p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable' using errcode = 'P0002'; end if;
  if v_ancien.suspension_globale_at is not null then
    return v_ancien.suspension_globale_at;  -- idempotent : la première suspension fait foi
  end if;
  perform set_config('elsatia.suspension_globale_rpc', 'on', true);
  update public.entreprises
  set suspension_globale_at = v_at, suspension_globale_motif = btrim(p_motif), suspension_globale_par = auth.uid()
  where id = p_entreprise_id;
  perform set_config('elsatia.suspension_globale_rpc', 'off', true);
  insert into public.historique_mutations_plateforme (
    domaine, action, entreprise_id, objet_type, objet_id, auteur_utilisateur_id, ancien, nouveau
  ) values ('entreprise', 'suspension_globale', p_entreprise_id, 'entreprise', p_entreprise_id, auth.uid(),
    jsonb_build_object('suspension_globale_at', null),
    jsonb_build_object('suspension_globale_at', v_at, 'motif', btrim(p_motif)));
  return v_at;
end;
$$;

create or replace function public.plateforme_lever_suspension_globale(p_entreprise_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ancien public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Motif obligatoire' using errcode = '22023';
  end if;
  select * into v_ancien from public.entreprises where id = p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable' using errcode = 'P0002'; end if;
  if v_ancien.suspension_globale_at is null then return; end if;
  perform set_config('elsatia.suspension_globale_rpc', 'on', true);
  update public.entreprises
  set suspension_globale_at = null, suspension_globale_motif = null, suspension_globale_par = null
  where id = p_entreprise_id;
  perform set_config('elsatia.suspension_globale_rpc', 'off', true);
  insert into public.historique_mutations_plateforme (
    domaine, action, entreprise_id, objet_type, objet_id, auteur_utilisateur_id, ancien, nouveau
  ) values ('entreprise', 'suspension_globale_levee', p_entreprise_id, 'entreprise', p_entreprise_id, auth.uid(),
    jsonb_build_object('suspension_globale_at', v_ancien.suspension_globale_at, 'motif', v_ancien.suspension_globale_motif),
    jsonb_build_object('suspension_globale_at', null, 'motif', btrim(p_motif)));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Droits d'exécution
-- ─────────────────────────────────────────────────────────────────────────────
-- Prédicats internes : pas d'oracle de l'état commercial ou de sécurité d'une autre
-- organisation. Seuls l'appartenance (propre à l'appelant) et l'état de SA facturation
-- (etat_commercial_applications, filtré sur l'appelant) sont exposés.
revoke all on function public.compte_suspendu_globalement(uuid) from public, anon, authenticated;
revoke all on function public.etat_commercial_gestion_pro(uuid) from public, anon, authenticated;
revoke all on function public.statut_commercial_application(uuid, text) from public, anon, authenticated;
revoke all on function public.application_commercialement_ouverte(uuid, text) from public, anon, authenticated;
revoke all on function public.est_membre_plateforme_actif(uuid) from public, anon;
grant execute on function public.est_membre_plateforme_actif(uuid) to authenticated;
revoke all on function public.etat_commercial_applications(uuid) from public, anon;
grant execute on function public.etat_commercial_applications(uuid) to authenticated;
revoke all on function public.synchroniser_statut_commercial_application_service(uuid, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.synchroniser_statut_commercial_application_service(uuid, text, text, text, text, timestamptz, timestamptz) to service_role;
revoke all on function public.plateforme_definir_statut_commercial_application(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.plateforme_definir_statut_commercial_application(uuid, text, text, text, timestamptz) to authenticated;
revoke all on function public.plateforme_suspendre_compte_global(uuid, text) from public, anon;
grant execute on function public.plateforme_suspendre_compte_global(uuid, text) to authenticated;
revoke all on function public.plateforme_lever_suspension_globale(uuid, text) from public, anon;
grant execute on function public.plateforme_lever_suspension_globale(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Rapport de migration + garde « aucune perte silencieuse »
-- ─────────────────────────────────────────────────────────────────────────────
create table public.rapport_migration_suspension_par_app_v1 (
  entreprise_id uuid not null,
  entreprise_nom text,
  application_code text not null,
  gp_statut_commercial text,
  acces_avant boolean not null,
  acces_apres boolean not null,
  changement text not null check (changement in ('gain_acces', 'perte_acces')),
  intervenants_reserves_actifs integer not null default 0,
  calcule_at timestamptz not null default now(),
  primary key (entreprise_id, application_code)
);
alter table public.rapport_migration_suspension_par_app_v1 enable row level security;
revoke all on public.rapport_migration_suspension_par_app_v1 from public, anon, authenticated;
create policy rapport_migration_suspension_par_app_v1_plateforme on public.rapport_migration_suspension_par_app_v1
  for select to authenticated using (public.est_plateforme_admin());
grant select on public.rapport_migration_suspension_par_app_v1 to authenticated;

insert into public.rapport_migration_suspension_par_app_v1 (
  entreprise_id, entreprise_nom, application_code, gp_statut_commercial, acces_avant, acces_apres,
  changement, intervenants_reserves_actifs
)
select av.entreprise_id, e.nom, av.application_code, public.etat_commercial_gestion_pro(av.entreprise_id),
       av.ouvert, ap.ouvert,
       case when ap.ouvert then 'gain_acces' else 'perte_acces' end,
       case when av.application_code = 'reserves' then (
         select count(*)::integer from public.reserves_intervenants i
         where i.entreprise_id = av.entreprise_id and i.statut = 'active'
           and i.entreprise_intervenante_id is not null) else 0 end
from _avant_per_app av
join public.entreprises e on e.id = av.entreprise_id
cross join lateral (
  select not public.compte_suspendu_globalement(av.entreprise_id)
         and public.application_commercialement_ouverte(av.entreprise_id, av.application_code) as ouvert
) ap
where av.ouvert is distinct from ap.ouvert;

do $$
declare v_pertes integer;
begin
  select count(*) into v_pertes from public.rapport_migration_suspension_par_app_v1 where changement = 'perte_acces';
  if v_pertes > 0 then
    raise exception 'per-app suspension : % droit(s) seraient perdus — migration refusée', v_pertes;
  end if;
end;
$$;

drop table _avant_per_app;

notify pgrst, 'reload schema';
