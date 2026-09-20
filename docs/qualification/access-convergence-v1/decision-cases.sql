\set ON_ERROR_STOP on
-- JEU D'ESSAI DU CONTRAT `decision_acces_application` v1 FIGÉ (D1-D3), réécrit pour la suspension par application.
-- Ce fichier est AUTONOME : il embarque, par concaténation, les deux propositions SQL non appliquées
--   (1) supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed
--   (2) packages/application-access/sql/decision_acces_application.sql.proposed
-- puis les fixtures et la matrice. Base jetable uniquement : aucune donnée réelle, comptes fictifs.
-- Rejeu : psql -v ON_ERROR_STOP=1 -f decision-cases.sql  sur une copie de la base modèle (279 migrations).
-- Écarts d'attendu par rapport à la première version (D3) : c7 et x1/x4 sur colors/tools/reserves passent
-- de `abonnement_suspendu` / `entreprise_inactive` à `autorise` ; `entreprise_inactive` n'existe plus.

-- ═══ (1) supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed ═══
-- PROPOSITION — NON NUMÉROTÉE, NON RÉSERVÉE. Ne pas placer dans supabase/migrations avant le train
-- de convergence (numéro : NEXT_MIGRATION_AFTER_CONVERGED_TRAIN).
--
-- Décision D3 (Julien) : une suspension commerciale de Gestion Pro ne coupe PAS les autres
-- applications ; chaque application porte son propre statut ; seule une suspension plateforme
-- explicite (sécurité) coupe tout un compte ou toute une organisation.
--
-- Cette proposition :
--   1. ajoute à `acces_applications_entreprises` un statut commercial PAR application ;
--   2. crée `est_membre_organisation()` = appartenance active SANS l'abonnement Gestion Pro
--      (`est_membre_actif()` reste intact : il protège les données Gestion Pro) ;
--   3. crée la suspension plateforme globale explicite (table + lecture + deux RPC d'écriture) ;
--   4. crée le RPC d'écriture du statut commercial d'UNE application d'UNE organisation ;
--   (la décision au contrat FIGÉ et la réécriture de `a_acces_application` sont dans
--   packages/application-access/sql/decision_acces_application.sql.proposed, à appliquer APRÈS
--   ce fichier : elles lisent les objets créés ici.)
--
-- Aucun prix, aucun plan, aucune donnée existante modifiée : les lignes existantes restent `actif`.
-- Aucune RLS Colors/Réserves/Tools n'est modifiée (voir annexe-d3-suspension-par-application.md).

-- ── 1. Statut commercial PAR application ─────────────────────────────────────────────────────
-- Pourquoi une colonne dédiée et pas `autorise` / `valide_jusqu_au` :
--   * `autorise=false` = « droit retiré » → la décision répond `application_non_incluse`, ce qui se
--     confond avec « jamais souscrit » (l'écran ne saurait pas proposer « régulariser ») ;
--   * `valide_*` est la fenêtre contractuelle/essai ; `plateforme_activer_application_entreprise`
--     la réécrit à chaque activation, elle ne doit pas porter un état d'impayé réversible.
-- Pour `gestion_pro` cette colonne n'est PAS lue : le statut Gestion Pro reste porté par
-- `entreprises.abonnement_statut` / `suspension_prevue_at` (Stripe, `plateforme_modifier_abonnement`).
alter table public.acces_applications_entreprises
  add column if not exists statut_commercial text not null default 'actif',
  add column if not exists suspendu_depuis timestamptz;

alter table public.acces_applications_entreprises
  drop constraint if exists acces_applications_statut_commercial_check,
  drop constraint if exists acces_applications_statut_commercial_coherent;
alter table public.acces_applications_entreprises
  add constraint acces_applications_statut_commercial_check
    check (statut_commercial in ('actif', 'suspendu', 'annule')),
  add constraint acces_applications_statut_commercial_coherent
    check (statut_commercial = 'actif' or suspendu_depuis is not null);

comment on column public.acces_applications_entreprises.statut_commercial is
  'Statut commercial de CETTE application pour cette organisation (D3). Ignoré pour gestion_pro (abonnement = entreprises.abonnement_statut).';

-- ── 2. Appartenance sans l'abonnement Gestion Pro ────────────────────────────────────────────
-- Mêmes règles que `est_membre_actif` (session d'assistance active OU appartenance `actif`) moins
-- la condition d'abonnement. Le seul écart volontaire est donc l'état de l'abonnement GP : le
-- remplacement d'un `est_membre_actif` par `est_membre_organisation` dans une RLS non-GP ne change
-- rien d'autre. Elle ne lit PAS la suspension plateforme (voir DECISION_REQUIRED n°4, annexe).
create or replace function public.est_membre_organisation(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.est_acces_support_actif(p_entreprise_id) or exists (
    select 1
    from public.utilisateurs_entreprises ue
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
  );
$$;
revoke all on function public.est_membre_organisation(uuid) from public, anon, service_role;
grant execute on function public.est_membre_organisation(uuid) to authenticated;

-- ── 3. Suspension plateforme globale explicite ───────────────────────────────────────────────
-- Un enregistrement = une décision de sécurité datée, motivée, attribuée, révocable. Jamais
-- supprimé (la révocation pose `revoque_at`). Périmètre : un COMPTE (toutes ses organisations,
-- toutes les applications) ou une ORGANISATION (tous ses membres, toutes les applications).
create table if not exists public.suspensions_plateforme (
  id uuid primary key default gen_random_uuid(),
  portee text not null check (portee in ('compte', 'organisation')),
  utilisateur_id uuid references auth.users(id) on delete cascade,
  entreprise_id uuid references public.entreprises(id) on delete cascade,
  motif text not null check (length(btrim(motif)) >= 5),
  debut_at timestamptz not null default now(),
  fin_at timestamptz,
  cree_par uuid references auth.users(id) on delete set null,
  cree_par_email text,
  revoque_at timestamptz,
  revoque_par uuid references auth.users(id) on delete set null,
  revoque_motif text,
  created_at timestamptz not null default now(),
  constraint suspensions_plateforme_cible_coherente check (
    (portee = 'compte' and utilisateur_id is not null and entreprise_id is null)
    or (portee = 'organisation' and entreprise_id is not null and utilisateur_id is null)
  ),
  constraint suspensions_plateforme_fin_apres_debut check (fin_at is null or fin_at > debut_at),
  constraint suspensions_plateforme_revocation_coherente check (
    (revoque_at is null and revoque_par is null and revoque_motif is null) or revoque_at is not null
  )
);
create index if not exists suspensions_plateforme_compte_idx
  on public.suspensions_plateforme(utilisateur_id) where revoque_at is null and portee = 'compte';
create index if not exists suspensions_plateforme_organisation_idx
  on public.suspensions_plateforme(entreprise_id) where revoque_at is null and portee = 'organisation';

alter table public.suspensions_plateforme enable row level security;
revoke all on table public.suspensions_plateforme from public, anon, authenticated, service_role;
grant select on table public.suspensions_plateforme to authenticated;
drop policy if exists suspensions_plateforme_lecture on public.suspensions_plateforme;
create policy suspensions_plateforme_lecture on public.suspensions_plateforme
  for select to authenticated using (public.est_plateforme_admin());

-- Lecture pour la décision : rend la suspension active applicable à (utilisateur, organisation),
-- ou NULL. Interne : aucun rôle applicatif ne l'appelle (le motif est réservé au diagnostic admin).
create or replace function public._suspension_plateforme_active(p_uid uuid, p_entreprise_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'portee', s.portee, 'motif', s.motif,
                            'debut_at', s.debut_at, 'fin_at', s.fin_at)
  from public.suspensions_plateforme s
  where s.revoque_at is null
    and s.debut_at <= now()
    and (s.fin_at is null or s.fin_at > now())
    and ((s.portee = 'compte' and s.utilisateur_id = p_uid)
      or (s.portee = 'organisation' and p_entreprise_id is not null and s.entreprise_id = p_entreprise_id))
  order by s.debut_at desc
  limit 1;
$$;
revoke all on function public._suspension_plateforme_active(uuid, uuid) from public, anon, authenticated, service_role;

-- Écriture : mêmes gardes que `plateforme_desactiver_application_entreprise` (rôle plateforme
-- `total` + session AAL2). La table est elle-même le journal (auteur, début, fin, révocation).
create or replace function public.plateforme_suspendre_globalement(
  p_portee text, p_cible_id uuid, p_motif text, p_fin_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if p_portee not in ('compte', 'organisation') then
    raise exception 'Portée de suspension invalide (compte ou organisation)' using errcode = '22023';
  end if;
  if p_motif is null or length(btrim(p_motif)) < 5 then
    raise exception 'Motif de suspension obligatoire (5 caractères minimum)' using errcode = '22023';
  end if;
  if p_fin_at is not null and p_fin_at <= now() then
    raise exception 'La fin de suspension doit être dans le futur' using errcode = '22023';
  end if;
  if p_portee = 'compte' and p_cible_id = auth.uid() then
    raise exception 'Un administrateur ne peut pas suspendre son propre compte' using errcode = '22023';
  end if;
  if p_portee = 'compte' and not exists (select 1 from auth.users where id = p_cible_id) then
    raise exception 'Compte introuvable' using errcode = '22023';
  end if;
  if p_portee = 'organisation' and not exists (select 1 from public.entreprises where id = p_cible_id) then
    raise exception 'Organisation introuvable' using errcode = '22023';
  end if;
  insert into public.suspensions_plateforme(portee, utilisateur_id, entreprise_id, motif, fin_at, cree_par, cree_par_email)
  values (p_portee,
          case when p_portee = 'compte' then p_cible_id end,
          case when p_portee = 'organisation' then p_cible_id end,
          btrim(p_motif), p_fin_at, auth.uid(), auth.email())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.plateforme_lever_suspension_globale(p_id uuid, p_motif text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ligne public.suspensions_plateforme%rowtype;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if p_motif is null or length(btrim(p_motif)) < 5 then
    raise exception 'Motif de levée obligatoire (5 caractères minimum)' using errcode = '22023';
  end if;
  select * into v_ligne from public.suspensions_plateforme where id = p_id for update;
  if not found or v_ligne.revoque_at is not null then return false; end if;
  update public.suspensions_plateforme
     set revoque_at = now(), revoque_par = auth.uid(), revoque_motif = btrim(p_motif)
   where id = p_id;
  return true;
end;
$$;
revoke all on function public.plateforme_suspendre_globalement(text, uuid, text, timestamptz) from public, anon, service_role;
revoke all on function public.plateforme_lever_suspension_globale(uuid, text) from public, anon, service_role;
grant execute on function public.plateforme_suspendre_globalement(text, uuid, text, timestamptz) to authenticated;
grant execute on function public.plateforme_lever_suspension_globale(uuid, text) to authenticated;

-- ── 4. Écriture du statut commercial d'UNE application d'UNE organisation ────────────────────
-- Gardes identiques à `plateforme_desactiver_application_entreprise` (migration …239) : rôle
-- plateforme `total`, session AAL2, ligne d'historique dans `historique_acces_applications`.
-- Choix : (a) `gestion_pro` refusé — son statut est l'abonnement (plateforme_modifier_abonnement,
-- Stripe) ; l'écrire ici créerait un second état trompeur, jamais lu ; (b) le droit d'usage doit
-- exister (créé par plateforme_activer_application_entreprise) : on n'invente pas un droit en
-- posant un statut ; (c) motif obligatoire quand on suspend/annule.
-- L'activation d'une application (plateforme_activer_application_entreprise) NE réinitialise PAS
-- ce statut : lever un impayé et réactiver un droit sont deux actes distincts et tracés.
create or replace function public.plateforme_definir_statut_application_entreprise(
  p_entreprise_id uuid, p_application_code text, p_statut text, p_motif text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ancien public.acces_applications_entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if p_statut not in ('actif', 'suspendu', 'annule') then
    raise exception 'Statut commercial invalide (actif, suspendu ou annule)' using errcode = '22023';
  end if;
  if p_application_code = 'gestion_pro' then
    raise exception 'Le statut de Gestion Pro est porté par l''abonnement de l''entreprise (plateforme_modifier_abonnement)'
      using errcode = '22023';
  end if;
  if p_statut <> 'actif' and (p_motif is null or length(btrim(p_motif)) < 5) then
    raise exception 'Motif obligatoire pour suspendre ou annuler (5 caractères minimum)' using errcode = '22023';
  end if;
  select * into v_ancien from public.acces_applications_entreprises
   where entreprise_id = p_entreprise_id and application_code = p_application_code for update;
  if not found then
    raise exception 'Aucun droit d''usage pour cette application dans cette organisation' using errcode = '22023';
  end if;
  if v_ancien.statut_commercial = p_statut then return false; end if;
  update public.acces_applications_entreprises
     set statut_commercial = p_statut,
         suspendu_depuis = case when p_statut = 'actif' then null else coalesce(v_ancien.suspendu_depuis, now()) end
   where id = v_ancien.id;
  insert into public.historique_acces_applications(
    cible_type, cible_id, application_code, action, auteur_email, auteur_utilisateur_id,
    ancien, nouveau, resultat
  ) values (
    'entreprise', p_entreprise_id, p_application_code, 'statut_commercial:' || p_statut,
    auth.email(), auth.uid(),
    jsonb_build_object('statut_commercial', v_ancien.statut_commercial, 'suspendu_depuis', v_ancien.suspendu_depuis),
    jsonb_build_object('statut_commercial', p_statut, 'motif', nullif(btrim(coalesce(p_motif, '')), '')),
    'modifie'
  );
  return true;
end;
$$;
revoke all on function public.plateforme_definir_statut_application_entreprise(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.plateforme_definir_statut_application_entreprise(uuid, text, text, text) to authenticated;

-- ═══ (2) packages/application-access/sql/decision_acces_application.sql.proposed ═══
-- PROPOSITION — NON NUMÉROTÉE, NON RÉSERVÉE. Ne pas placer dans supabase/migrations avant le train
-- de convergence (numéro : NEXT_MIGRATION_AFTER_CONVERGED_TRAIN).
--
-- decision_acces_application : décision d'accès AVEC MOTIF, au contrat v1 FIGÉ (D1-D3 de Julien).
-- PRÉREQUIS : supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed
-- (statut commercial par application, suspension plateforme, est_membre_organisation).
--
-- Ordre d'évaluation = priorité, la première étape qui s'applique gagne :
--   1 non_authentifie · 2 erreur_configuration · 3 suspension_plateforme (prime sur tout, bypass
--   administrateur compris) · 4 autorise (bypass administrateur plateforme actif) ·
--   5 sans_organisation · 6 invitation_en_attente · 7 validation_en_attente ·
--   8 utilisateur_desactive · 9 abonnement_suspendu (statut commercial de CETTE application) ·
--   10 essai_expire · 11 application_non_incluse · 12 sans_habilitation · 13 sans_role ·
--   14 autorise.
-- `entreprise_inactive` est RETIRÉ (couvert par `suspension_plateforme`, portée organisation).
--
-- `a_acces_application` est RÉÉCRITE en fin de fichier : « la décision est `autorise` pour
-- l'utilisateur courant ». Même signature, mêmes GRANT/REVOKE, même bypass administrateur.
-- Seule différence voulue : l'abonnement Gestion Pro ne coupe plus que Gestion Pro (D3).
-- Aucun prix, aucun plan, aucune donnée modifiée : lecture seule.

-- ── Noyau : évalue pour un utilisateur donné et rend décision + diagnostic complet ────────────
create or replace function public._decision_acces_noyau(
  p_uid uuid, p_entreprise_id uuid, p_application_code text
) returns jsonb
language plpgsql security definer stable set search_path = public
as $$
declare
  v_app public.applications_elsatia%rowtype;
  v_statut_membre text;
  v_membre boolean := false;
  v_susp jsonb;
  v_ent_statut text;
  v_ent_suspension_prevue timestamptz;
  v_abonnement_suspendu boolean;
  v_ae public.acces_applications_entreprises%rowtype;
  v_ae_trouve boolean;
  v_hu public.habilitations_applications_utilisateurs%rowtype;
  v_role_actif boolean;
  v_diag jsonb := '{}'::jsonb;
begin
  -- 1. non authentifié
  if p_uid is null then
    return jsonb_build_object('decision','non_authentifie','membre',false,'diagnostic','{}'::jsonb);
  end if;

  -- 2. application inconnue ou inactive : échec fermé (le nom d'entreprise n'est pas exposé)
  select * into v_app from public.applications_elsatia where code = p_application_code;
  if not found or not v_app.actif then
    return jsonb_build_object('decision','erreur_configuration','membre',false,
      'diagnostic', jsonb_build_object('cause','application_inconnue_ou_inactive'));
  end if;

  -- Appartenance de l'utilisateur à l'organisation demandée (sert au drapeau `membre` et aux étapes 5-8).
  if p_entreprise_id is not null then
    select ue.statut into v_statut_membre from public.utilisateurs_entreprises ue
     where ue.utilisateur_id = p_uid and ue.entreprise_id = p_entreprise_id;
    v_membre := found;
  end if;

  -- 3. suspension plateforme globale explicite : prime sur tout, y compris le bypass administrateur
  v_susp := public._suspension_plateforme_active(p_uid, p_entreprise_id);
  if v_susp is not null then
    return jsonb_build_object('decision','suspension_plateforme','membre',v_membre,
      'diagnostic', jsonb_build_object('suspension', v_susp));
  end if;

  -- 4. bypass administrateur plateforme actif (même condition que l'ancienne a_acces_application)
  if exists(select 1 from public.plateforme_admins
             where utilisateur_id = p_uid and actif and statut_identite = 'active') then
    return jsonb_build_object('decision','autorise','role_code','administrateur_plateforme_global','membre',v_membre,
      'diagnostic', jsonb_build_object('bypass','administrateur_plateforme'));
  end if;

  -- 5. sans organisation
  if p_entreprise_id is null then
    return jsonb_build_object('decision','sans_organisation','membre',false,
      'diagnostic', jsonb_build_object('cause','entreprise_active_nulle'));
  end if;
  if not v_membre then
    return jsonb_build_object('decision','sans_organisation','membre',false,
      'diagnostic', jsonb_build_object('cause','aucune_appartenance'));
  end if;
  v_diag := jsonb_build_object('membre_statut', v_statut_membre);

  -- 6-8. état de l'appartenance (avant tout état commercial : un membre désactivé d'une
  -- organisation suspendue reçoit `utilisateur_desactive`, pas `abonnement_suspendu`)
  if v_statut_membre = 'invite' then
    return jsonb_build_object('decision','invitation_en_attente','membre',true,'diagnostic',v_diag);
  elsif v_statut_membre = 'en_attente_validation' then
    return jsonb_build_object('decision','validation_en_attente','membre',true,'diagnostic',v_diag);
  elsif v_statut_membre = 'desactive' then
    return jsonb_build_object('decision','utilisateur_desactive','membre',true,'diagnostic',v_diag);
  elsif v_statut_membre <> 'actif' then
    -- inclut `pause` : ni actif ni désactivé, l'état n'est pas défini par le contrat
    return jsonb_build_object('decision','erreur_configuration','membre',true,
      'diagnostic', v_diag || jsonb_build_object('cause','statut_membre_inconnu'));
  end if;

  -- Droit d'usage de l'organisation pour CETTE application (lu une fois : étapes 9, 10, 11).
  select * into v_ae from public.acces_applications_entreprises
   where entreprise_id = p_entreprise_id and application_code = p_application_code;
  v_ae_trouve := found;

  -- 9. abonnement_suspendu : statut commercial de CETTE application (D3).
  --    gestion_pro : abonnement de l'entreprise ; toute autre application : statut porté par son
  --    propre droit d'usage. L'abonnement Gestion Pro n'est JAMAIS lu pour une autre application.
  if p_application_code = 'gestion_pro' then
    select e.abonnement_statut, e.suspension_prevue_at into v_ent_statut, v_ent_suspension_prevue
      from public.entreprises e where e.id = p_entreprise_id;
    if not found then
      return jsonb_build_object('decision','erreur_configuration','membre',true,
        'diagnostic', v_diag || jsonb_build_object('cause','entreprise_introuvable'));
    end if;
    v_abonnement_suspendu := v_ent_statut in ('suspendu','annule')
      or (v_ent_suspension_prevue is not null and v_ent_suspension_prevue <= now());
    v_diag := v_diag || jsonb_build_object('abonnement_statut', v_ent_statut,
                                           'suspension_prevue_at', v_ent_suspension_prevue);
  else
    v_abonnement_suspendu := v_ae_trouve and v_ae.statut_commercial in ('suspendu','annule');
    v_diag := v_diag || jsonb_build_object('statut_commercial', case when v_ae_trouve then v_ae.statut_commercial end,
                                           'suspendu_depuis', case when v_ae_trouve then v_ae.suspendu_depuis end);
  end if;
  if v_abonnement_suspendu then
    return jsonb_build_object('decision','abonnement_suspendu','membre',true,'diagnostic',v_diag);
  end if;

  -- 10-11. droit d'usage : absent/désactivé, ou hors fenêtre (essai expiré vs droit non inclus)
  if not v_ae_trouve or not v_ae.autorise then
    return jsonb_build_object('decision','application_non_incluse','membre',true,
      'diagnostic', v_diag || jsonb_build_object('droit_org', case when v_ae_trouve then 'desactive' else 'absent' end));
  end if;
  if (v_ae.valide_du is not null and v_ae.valide_du > now())
     or (v_ae.valide_jusqu_au is not null and v_ae.valide_jusqu_au <= now()) then
    return jsonb_build_object(
      'decision', case when v_ae.source = 'essai' then 'essai_expire' else 'application_non_incluse' end,
      'membre',true,
      'diagnostic', v_diag || jsonb_build_object('droit_org','hors_fenetre','source',v_ae.source,
                                                 'valide_du',v_ae.valide_du,'valide_jusqu_au',v_ae.valide_jusqu_au));
  end if;

  -- 12. habilitation de l'utilisateur
  select * into v_hu from public.habilitations_applications_utilisateurs
   where entreprise_id = p_entreprise_id and utilisateur_id = p_uid and application_code = p_application_code;
  if not found then
    return jsonb_build_object('decision','sans_habilitation','membre',true,'diagnostic',v_diag);
  end if;

  -- 13. rôle actif et fenêtre de validité de l'habilitation
  select r.actif into v_role_actif from public.roles_applications_elsatia r
   where r.application_code = v_hu.application_code and r.code = v_hu.role_code;
  if not v_hu.autorise or coalesce(v_role_actif, false) = false
     or (v_hu.valide_du is not null and v_hu.valide_du > now())
     or (v_hu.valide_jusqu_au is not null and v_hu.valide_jusqu_au <= now()) then
    return jsonb_build_object('decision','sans_role','membre',true,
      'diagnostic', v_diag || jsonb_build_object('role_code',v_hu.role_code,'role_actif',v_role_actif,
                                                 'habilitation_autorise',v_hu.autorise,
                                                 'valide_du',v_hu.valide_du,'valide_jusqu_au',v_hu.valide_jusqu_au));
  end if;

  -- 14. autorisé
  return jsonb_build_object('decision','autorise','role_code',v_hu.role_code,'membre',true,'diagnostic',v_diag);
end;
$$;
revoke all on function public._decision_acces_noyau(uuid,uuid,text) from public, anon, authenticated, service_role;

-- ── Vue CLIENT : décision + rôle propre + nom d'entreprise SI l'appelant en est membre ───────
-- Retour v1 : {version, decision, application_code, role_code (seulement si autorise),
-- entreprise:{id,nom} (seulement si l'appelant a une appartenance à cette organisation)}.
-- Aucun diagnostic, aucun motif de suspension, aucun statut commercial n'est renvoyé.
create or replace function public.decision_acces_application(
  p_application_code text, p_entreprise_id uuid default null
) returns jsonb
language plpgsql security definer stable set search_path = public
as $$
declare
  v jsonb := public._decision_acces_noyau(auth.uid(), p_entreprise_id, p_application_code);
  v_nom text;
begin
  if (v->>'membre')::boolean then
    select nom into v_nom from public.entreprises where id = p_entreprise_id;
  end if;
  return jsonb_build_object(
    'version', 1,
    'decision', v->>'decision',
    'application_code', p_application_code,
    'role_code', case when v->>'decision' = 'autorise' then v->>'role_code' end,
    'entreprise', case when v_nom is not null then jsonb_build_object('id', p_entreprise_id, 'nom', v_nom) end
  );
end;
$$;
revoke all on function public.decision_acces_application(text,uuid) from public, anon, service_role;
grant execute on function public.decision_acces_application(text,uuid) to authenticated;

-- ── Vue ADMIN/LOGS : diagnostic complet pour un tiers (administrateur plateforme uniquement) ─
-- DECISION_REQUIRED: exiger aussi rôle plateforme `total` + AAL2 comme les RPC d'habilitation
-- (00239) ? — défaut appliqué : administrateur plateforme actif seulement (lecture seule ; un
-- administrateur actif obtient déjà le bypass sur toutes les applications).
create or replace function public.diagnostic_acces_application(
  p_utilisateur_id uuid, p_entreprise_id uuid, p_application_code text
) returns jsonb
language plpgsql security definer stable set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme' using errcode = '42501';
  end if;
  return public._decision_acces_noyau(p_utilisateur_id, p_entreprise_id, p_application_code);
end;
$$;
revoke all on function public.diagnostic_acces_application(uuid,uuid,text) from public, anon, service_role;
grant execute on function public.diagnostic_acces_application(uuid,uuid,text) to authenticated;

-- ── Compatibilité : `a_acces_application` = la décision est `autorise` pour l'utilisateur courant ─
-- Signature, sécurité, GRANT/REVOKE inchangés (migrations 234 + 255). Elle alimente aujourd'hui
-- colors_role_courant, reserves_role_courant, les RPC/RLS Tools et applications_autorisees :
-- en une seule réécriture, ces chemins cessent de dépendre de l'abonnement Gestion Pro.
-- Appelle le noyau (et non la vue client) : même décision, sans reconstruire le JSON ni lire le
-- nom d'entreprise, car elle est évaluée ligne par ligne dans des politiques RLS.
create or replace function public.a_acces_application(
  p_entreprise_id uuid,
  p_application_code text
) returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select coalesce(
    public._decision_acces_noyau(auth.uid(), p_entreprise_id, p_application_code)->>'decision' = 'autorise',
    false);
$$;
revoke all on function public.a_acces_application(uuid,text) from public, anon, service_role;
grant execute on function public.a_acces_application(uuid,text) to authenticated;

-- Matrice « premier accès » : exécute les RPC réelles du Train V3 (ledger 278) pour chaque état de compte.
-- Base jetable, aucune donnée réelle. Les comptes sont fictifs.
drop table if exists public._dc_expect; drop table if exists public._dc_res;
delete from public.plateforme_admins where email like '%@audit.test';
delete from public.habilitations_applications_utilisateurs where utilisateur_id::text like 'a0000000-0000-4000-8000-%';
delete from public.utilisateurs_entreprises where utilisateur_id::text like 'a0000000-0000-4000-8000-%';
delete from auth.users where email like '%@audit.test';
delete from public.suspensions_plateforme where motif like 'AUDIT-D3%';
delete from public.acces_applications_entreprises where entreprise_id::text like 'e_000000-0000-4000-8000-%';
delete from public.entreprises where nom like 'ENTREPRISE-%';


-- ── Entreprises ────────────────────────────────────────────────────────────
insert into public.entreprises(id, nom) values
 ('e1000000-0000-4000-8000-000000000001','ENTREPRISE-A (active, droits org sur les 4 apps)'),
 ('e2000000-0000-4000-8000-000000000002','ENTREPRISE-B (active, AUCUN droit org)'),
 ('e4000000-0000-4000-8000-000000000004','ENTREPRISE-D (SUSPENDUE, droits org)');
update public.entreprises set abonnement_statut='suspendu' where id='e4000000-0000-4000-8000-000000000004';
update public.entreprises set abonnement_statut='actif' where id in ('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');

-- Droits d'usage de l'organisation (acces_applications_entreprises)
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source)
select e, a, true, 'audit'
from (values ('e1000000-0000-4000-8000-000000000001'::uuid),('e4000000-0000-4000-8000-000000000004'::uuid)) v(e),
     (values ('gestion_pro'),('colors'),('tools'),('reserves')) x(a);

-- ── Comptes Auth (le trigger handle_new_user crée public.utilisateurs) ─────
insert into auth.users(id, email) values
 ('a0000000-0000-4000-8000-000000000001','c1-auth-seul@audit.test'),
 ('a0000000-0000-4000-8000-000000000002','c1b-sans-profil-gp@audit.test'),
 ('a0000000-0000-4000-8000-000000000003','c3-membre-sans-droit-org@audit.test'),
 ('a0000000-0000-4000-8000-000000000004','c4-droit-org-sans-role@audit.test'),
 ('a0000000-0000-4000-8000-000000000005','c5-role-sans-droit-org@audit.test'),
 ('a0000000-0000-4000-8000-000000000006','c6-acces-complet@audit.test'),
 ('a0000000-0000-4000-8000-000000000007','c7-entreprise-suspendue@audit.test'),
 ('a0000000-0000-4000-8000-000000000008','c8-desactive@audit.test'),
 ('a0000000-0000-4000-8000-000000000009','c9-invite-en-attente@audit.test'),
 ('a0000000-0000-4000-8000-00000000000a','c10-habilitation-retiree@audit.test'),
 ('a0000000-0000-4000-8000-00000000000b','c11-droit-org-expire@audit.test'),
 ('a0000000-0000-4000-8000-00000000000c','c12-admin-plateforme-actif@audit.test'),
 ('a0000000-0000-4000-8000-00000000000d','c13-admin-plateforme-en-attente(julien)@audit.test');
-- cas 1b : compte Auth SANS ligne public.utilisateurs (trigger contourné)
delete from public.utilisateurs where id='a0000000-0000-4000-8000-000000000002';

-- Appartenances
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, statut) values
 ('a0000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002','actif'),
 ('a0000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001','actif'),
 ('a0000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000002','actif'),
 ('a0000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000001','actif'),
 ('a0000000-0000-4000-8000-000000000007','e4000000-0000-4000-8000-000000000004','actif'),
 ('a0000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000001','desactive'),
 ('a0000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000001','invite'),
 ('a0000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000001','actif'),
 ('a0000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-000000000001','actif');
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
from public.utilisateurs_entreprises ue where ue.utilisateur_id = u.id;

-- Habilitations (rôle applicatif)
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise)
select ent, usr, app, role, aut from (values
  ('e2000000-0000-4000-8000-000000000002'::uuid,'a0000000-0000-4000-8000-000000000005'::uuid),  -- c5 rôle sans droit org
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-000000000006'::uuid),  -- c6 complet
  ('e4000000-0000-4000-8000-000000000004'::uuid,'a0000000-0000-4000-8000-000000000007'::uuid),  -- c7 suspendu
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-000000000008'::uuid),  -- c8 désactivé
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-000000000009'::uuid),  -- c9 invité
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-00000000000a'::uuid),  -- c10 retirée
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-00000000000b'::uuid)   -- c11 droit org expiré
) u(ent, usr),
(values ('gestion_pro','gestion_pro_utilisateur'),('colors','colors_consultation'),('tools','tools_pro'),('reserves','reserves_consultation')) r(app, role),
lateral (select (u.usr <> 'a0000000-0000-4000-8000-00000000000a'::uuid) as aut) z;

-- c11 : droit d'usage de l'organisation expiré pour ce cas uniquement → on utilise une entreprise dédiée
insert into public.entreprises(id, nom) values ('e5000000-0000-4000-8000-000000000005','ENTREPRISE-E (droit org EXPIRÉ)');
update public.entreprises set abonnement_statut='actif' where id='e5000000-0000-4000-8000-000000000005';
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source, valide_du, valide_jusqu_au)
select 'e5000000-0000-4000-8000-000000000005', a, true, 'audit', now()-interval '60 days', now()-interval '1 day'
from (values ('gestion_pro'),('colors'),('tools'),('reserves')) x(a);
delete from public.habilitations_applications_utilisateurs where utilisateur_id='a0000000-0000-4000-8000-00000000000b';
delete from public.utilisateurs_entreprises where utilisateur_id='a0000000-0000-4000-8000-00000000000b';
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, statut) values ('a0000000-0000-4000-8000-00000000000b','e5000000-0000-4000-8000-000000000005','actif');
update public.utilisateurs set entreprise_active_id='e5000000-0000-4000-8000-000000000005' where id='a0000000-0000-4000-8000-00000000000b';
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code)
values ('e5000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000b','gestion_pro','gestion_pro_utilisateur'),
       ('e5000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000b','colors','colors_consultation'),
       ('e5000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000b','tools','tools_pro'),
       ('e5000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000b','reserves','reserves_consultation');

-- Admins plateforme : c12 actif ; c13 = Julien (en_attente / inactif)
insert into public.plateforme_admins(utilisateur_id, email, role, actif, statut_identite, activation_at)
values ('a0000000-0000-4000-8000-00000000000c','c12-admin-plateforme-actif@audit.test','total',true,'active', now());
-- Julien : ligne 'en_attente' non rattachée (utilisateur_id NULL), inactive → est_plateforme_admin() = false
insert into public.plateforme_admins(utilisateur_id, email, role, actif, statut_identite)
values (null,'c13-admin-plateforme-en-attente(julien)@audit.test','total',false,'en_attente');



-- ── Fixtures supplémentaires ───────────────────────────────────────────────
insert into public.entreprises(id, nom) values
 ('e6000000-0000-4000-8000-000000000006','ENTREPRISE-F (ANNULÉE)'),
 ('e7000000-0000-4000-8000-000000000007','ENTREPRISE-G (droit ESSAI expiré)'),
 ('e8000000-0000-4000-8000-000000000008','ENTREPRISE-H (suspension prévue échue)'),
 ('e9000000-0000-4000-8000-000000000009','ENTREPRISE-I (habilitation hors fenêtre)');
update public.entreprises set abonnement_statut='annule' where id='e6000000-0000-4000-8000-000000000006';
update public.entreprises set abonnement_statut='actif' where id in ('e7000000-0000-4000-8000-000000000007','e9000000-0000-4000-8000-000000000009');
update public.entreprises set abonnement_statut='actif', suspension_prevue_at=now()-interval '1 day' where id='e8000000-0000-4000-8000-000000000008';
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source, valide_du, valide_jusqu_au)
select e, 'colors', true, s, v1, v2 from (values
 ('e6000000-0000-4000-8000-000000000006'::uuid,'audit',null::timestamptz,null::timestamptz),
 ('e7000000-0000-4000-8000-000000000007','essai',now()-interval '60 days',now()-interval '1 day'),
 ('e8000000-0000-4000-8000-000000000008','audit',null,null),
 ('e9000000-0000-4000-8000-000000000009','audit',null,null)) t(e,s,v1,v2);
insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','x1-entreprise-annulee@audit.test'),
 ('a1000000-0000-4000-8000-000000000002','x2-droit-essai-expire@audit.test'),
 ('a1000000-0000-4000-8000-000000000003','x3-validation-en-attente@audit.test'),
 ('a1000000-0000-4000-8000-000000000004','x4-suspension-prevue-echue@audit.test'),
 ('a1000000-0000-4000-8000-000000000005','x5-habilitation-hors-fenetre@audit.test');
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, statut) values
 ('a1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000006','actif'),
 ('a1000000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000007','actif'),
 ('a1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','en_attente_validation'),
 ('a1000000-0000-4000-8000-000000000004','e8000000-0000-4000-8000-000000000008','actif'),
 ('a1000000-0000-4000-8000-000000000005','e9000000-0000-4000-8000-000000000009','actif');
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
 from public.utilisateurs_entreprises ue where ue.utilisateur_id=u.id and u.id::text like 'a1000000-%';
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, valide_du, valide_jusqu_au) values
 ('e6000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001','colors','colors_consultation',null,null),
 ('e7000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000002','colors','colors_consultation',null,null),
 ('e8000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000004','colors','colors_consultation',null,null),
 ('e9000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000005','colors','colors_consultation',now()-interval '30 days',now()-interval '1 day');


-- ── Fixtures D3 : statut commercial PAR application + suspension plateforme ───────────────
insert into public.entreprises(id, nom) values
 ('ea000000-0000-4000-8000-00000000000a','ENTREPRISE-J (Colors SUSPENDU, GP actif)'),
 ('eb000000-0000-4000-8000-00000000000b','ENTREPRISE-K (Colors ANNULÉ, GP actif)'),
 ('ec000000-0000-4000-8000-00000000000c','ENTREPRISE-L (SUSPENDUE PAR LA PLATEFORME, GP actif)'),
 ('ed000000-0000-4000-8000-00000000000d','ENTREPRISE-M (Tools SUSPENDU + GP suspendu)');
update public.entreprises set abonnement_statut='actif' where id in ('ea000000-0000-4000-8000-00000000000a','eb000000-0000-4000-8000-00000000000b','ec000000-0000-4000-8000-00000000000c');
update public.entreprises set abonnement_statut='suspendu' where id='ed000000-0000-4000-8000-00000000000d';
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source)
select e, a, true, 'audit' from (values ('ea000000-0000-4000-8000-00000000000a'::uuid),('eb000000-0000-4000-8000-00000000000b'),
  ('ec000000-0000-4000-8000-00000000000c'),('ed000000-0000-4000-8000-00000000000d')) v(e),
  (values ('gestion_pro'),('colors'),('tools'),('reserves')) x(a);
update public.acces_applications_entreprises set statut_commercial='suspendu', suspendu_depuis=now()-interval '3 days'
 where entreprise_id='ea000000-0000-4000-8000-00000000000a' and application_code='colors';
update public.acces_applications_entreprises set statut_commercial='annule', suspendu_depuis=now()-interval '3 days'
 where entreprise_id='eb000000-0000-4000-8000-00000000000b' and application_code='colors';
update public.acces_applications_entreprises set statut_commercial='suspendu', suspendu_depuis=now()-interval '3 days'
 where entreprise_id='ed000000-0000-4000-8000-00000000000d' and application_code='tools';
-- Piège : statut posé sur la ligne gestion_pro -> IGNORÉ (le statut GP est l'abonnement de l'entreprise)
update public.acces_applications_entreprises set statut_commercial='suspendu', suspendu_depuis=now()
 where entreprise_id='ea000000-0000-4000-8000-00000000000a' and application_code='gestion_pro';
update public.acces_applications_entreprises set statut_commercial='actif', suspendu_depuis=null
 where entreprise_id='ea000000-0000-4000-8000-00000000000a' and application_code='gestion_pro';

insert into auth.users(id,email) values
 ('a2000000-0000-4000-8000-000000000001','y1-colors-suspendu@audit.test'),
 ('a2000000-0000-4000-8000-000000000002','y2-colors-annule@audit.test'),
 ('a2000000-0000-4000-8000-000000000003','y3-suspension-organisation@audit.test'),
 ('a2000000-0000-4000-8000-000000000004','y4-suspension-compte@audit.test'),
 ('a2000000-0000-4000-8000-000000000005','y5-admin-suspendu-compte@audit.test'),
 ('a2000000-0000-4000-8000-000000000006','y6-suspension-expiree@audit.test'),
 ('a2000000-0000-4000-8000-000000000007','y7-suspension-revoquee@audit.test'),
 ('a2000000-0000-4000-8000-000000000008','y8-tools-suspendu-gp-suspendu@audit.test'),
 ('a2000000-0000-4000-8000-000000000009','y9-desactive-org-gp-suspendue@audit.test'),
 ('a2000000-0000-4000-8000-00000000000a','y10-invite-org-suspendue-plateforme@audit.test'),
 ('a2000000-0000-4000-8000-00000000000b','y11-suspension-non-active-encore@audit.test');
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, statut) values
 ('a2000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-00000000000a','actif'),
 ('a2000000-0000-4000-8000-000000000002','eb000000-0000-4000-8000-00000000000b','actif'),
 ('a2000000-0000-4000-8000-000000000003','ec000000-0000-4000-8000-00000000000c','actif'),
 ('a2000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001','actif'),
 ('a2000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000001','actif'),
 ('a2000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000001','actif'),
 ('a2000000-0000-4000-8000-000000000008','ed000000-0000-4000-8000-00000000000d','actif'),
 ('a2000000-0000-4000-8000-000000000009','e4000000-0000-4000-8000-000000000004','desactive'),
 ('a2000000-0000-4000-8000-00000000000a','ec000000-0000-4000-8000-00000000000c','invite'),
 ('a2000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-000000000001','actif');
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
 from public.utilisateurs_entreprises ue where ue.utilisateur_id=u.id and u.id::text like 'a2000000-%';
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code)
select ue.entreprise_id, ue.utilisateur_id, r.app, r.role
from public.utilisateurs_entreprises ue,
     (values ('gestion_pro','gestion_pro_utilisateur'),('colors','colors_consultation'),('tools','tools_pro'),('reserves','reserves_consultation')) r(app, role)
where ue.utilisateur_id::text like 'a2000000-%' and ue.statut in ('actif','desactive');
-- y5 : administrateur plateforme actif dont le COMPTE est suspendu (la suspension prime sur le bypass)
insert into public.plateforme_admins(utilisateur_id, email, role, actif, statut_identite, activation_at)
values ('a2000000-0000-4000-8000-000000000005','y5-admin-suspendu-compte@audit.test','support',true,'active', now());

insert into public.suspensions_plateforme(portee, utilisateur_id, entreprise_id, motif, debut_at, fin_at, revoque_at, revoque_motif) values
 ('organisation', null, 'ec000000-0000-4000-8000-00000000000c', 'AUDIT-D3 organisation suspendue', now()-interval '1 hour', null, null, null),
 ('compte', 'a2000000-0000-4000-8000-000000000004', null, 'AUDIT-D3 compte suspendu', now()-interval '1 hour', null, null, null),
 ('compte', 'a2000000-0000-4000-8000-000000000005', null, 'AUDIT-D3 admin suspendu', now()-interval '1 hour', null, null, null),
 ('compte', 'a2000000-0000-4000-8000-000000000006', null, 'AUDIT-D3 suspension expiree', now()-interval '2 days', now()-interval '1 day', null, null),
 ('compte', 'a2000000-0000-4000-8000-000000000007', null, 'AUDIT-D3 suspension revoquee', now()-interval '2 days', null, now()-interval '1 day', 'AUDIT-D3 levée'),
 ('compte', 'a2000000-0000-4000-8000-00000000000b', null, 'AUDIT-D3 suspension future', now()+interval '1 day', null, null, null);

-- ── Attendus ────────────────────────────────────────────────────────────────
create table public._dc_expect(label text, app text, expected text, note text);
insert into public._dc_expect(label, app, expected, note)
select l, a, e, n from (values
 ('c1-auth-seul','sans_organisation','pas d''organisation'),
 ('c1b-sans-profil-gp','sans_organisation','compte Auth sans ligne utilisateurs'),
 ('c13-admin-plateforme-en-attente(julien)','sans_organisation','Julien tel que documenté : en_attente, non actif'),
 ('c3-membre-sans-droit-org','application_non_incluse','pas d''entitlement (aucun droit d''usage)'),
 ('c5-role-sans-droit-org','application_non_incluse','rôle sans entitlement'),
 ('c11-droit-org-expire','application_non_incluse','droit d''usage expiré (hors essai)'),
 ('c4-droit-org-sans-role','sans_habilitation','pas de rôle : aucune habilitation'),
 ('c10-habilitation-retiree','sans_role','habilitation retirée (autorise=false)'),
 ('c6-acces-complet','autorise','accès complet'),
 ('c12-admin-plateforme-actif','autorise','administrateur plateforme actif'),
 ('c8-desactive','utilisateur_desactive','désactivé'),
 ('c9-invite-en-attente','invitation_en_attente','invitation en attente')
) v(l,e,n), (values ('gestion_pro'),('colors'),('tools'),('reserves')) x(a);
insert into public._dc_expect(label, app, expected, note) values
 ('c7-entreprise-suspendue','gestion_pro','abonnement_suspendu','abonnement GP suspendu : GP refusé'),
 ('c7-entreprise-suspendue','colors','autorise','D3 : abonnement GP suspendu ne coupe pas Colors'),
 ('c7-entreprise-suspendue','tools','autorise','D3 : abonnement GP suspendu ne coupe pas Tools'),
 ('c7-entreprise-suspendue','reserves','autorise','D3 : abonnement GP suspendu ne coupe pas Réserves'),
 ('x1-entreprise-annulee','colors','autorise','D3 : abonnement GP annulé ne coupe pas Colors (ancien attendu : entreprise_inactive)'),
 ('x1-entreprise-annulee','gestion_pro','abonnement_suspendu','abonnement GP annulé : GP refusé (`entreprise_inactive` supprimé)'),
 ('x4-suspension-prevue-echue','gestion_pro','abonnement_suspendu','suspension GP prévue échue : GP refusé'),
 ('x2-droit-essai-expire','colors','essai_expire','droit d''usage issu d''un essai, expiré'),
 ('x3-validation-en-attente','colors','validation_en_attente','rejoint par code, validation admin en attente'),
 ('x4-suspension-prevue-echue','colors','autorise','D3 : suspension GP prévue échue ne coupe pas Colors (ancien attendu : abonnement_suspendu)'),
 ('x5-habilitation-hors-fenetre','colors','sans_role','habilitation hors fenêtre de validité');

insert into public._dc_expect(label, app, expected, note)
select l, a, e, n from (values
 ('y3-suspension-organisation','suspension_plateforme','suspension plateforme, portée organisation'),
 ('y4-suspension-compte','suspension_plateforme','suspension plateforme, portée compte (autre organisation saine)'),
 ('y5-admin-suspendu-compte','suspension_plateforme','la suspension du compte PRIME sur le bypass administrateur'),
 ('y6-suspension-expiree','autorise','suspension échue (fin_at passé) : rétablit'),
 ('y7-suspension-revoquee','autorise','suspension révoquée : rétablit'),
 ('y11-suspension-non-active-encore','autorise','suspension programmée dans le futur : pas encore active'),
 ('y10-invite-org-suspendue-plateforme','suspension_plateforme','suspension plateforme prime sur invitation_en_attente'),
 ('y9-desactive-org-gp-suspendue','utilisateur_desactive','priorité : membre désactivé d''une org GP suspendue = utilisateur_desactive')
) v(l,e,n), (values ('gestion_pro'),('colors'),('tools'),('reserves')) x(a);
insert into public._dc_expect(label, app, expected, note) values
 ('y1-colors-suspendu','colors','abonnement_suspendu','D3 : Colors suspendu (statut propre)'),
 ('y1-colors-suspendu','gestion_pro','autorise','D3 : Colors suspendu ne coupe pas GP'),
 ('y1-colors-suspendu','tools','autorise','D3 : Colors suspendu ne coupe pas Tools'),
 ('y1-colors-suspendu','reserves','autorise','D3 : Colors suspendu ne coupe pas Réserves'),
 ('y2-colors-annule','colors','abonnement_suspendu','D3 : Colors annulé'),
 ('y2-colors-annule','gestion_pro','autorise','D3 : Colors annulé ne coupe pas GP'),
 ('y8-tools-suspendu-gp-suspendu','gestion_pro','abonnement_suspendu','GP suspendu'),
 ('y8-tools-suspendu-gp-suspendu','tools','abonnement_suspendu','Tools suspendu (statut propre)'),
 ('y8-tools-suspendu-gp-suspendu','colors','autorise','ni GP ni Tools suspendus ne coupent Colors'),
 ('y8-tools-suspendu-gp-suspendu','reserves','autorise','ni GP ni Tools suspendus ne coupent Réserves');

create table public._dc_res(label text, app text, expected text, obtenu text, a_acces boolean, ok boolean, note text, exposition text);

do $$
declare c record; u uuid; ent uuid; d jsonb; b boolean; membre boolean; nom_expose boolean;
begin
  for c in select e.*, (select id from auth.users where email like e.label||'@%') as uid from public._dc_expect e order by label, app loop
    select entreprise_active_id into ent from public.utilisateurs where id = c.uid;
    perform set_config('request.jwt.claims', json_build_object('sub', c.uid, 'role','authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', c.uid::text, true);
    set local role authenticated;
    d := public.decision_acces_application(c.app, ent);
    b := public.a_acces_application(ent, c.app);
    reset role;
    select exists(select 1 from public.utilisateurs_entreprises where utilisateur_id = c.uid and entreprise_id = ent) into membre;
    nom_expose := jsonb_typeof(d->'entreprise') = 'object';
    insert into public._dc_res values (c.label, c.app, c.expected, d->>'decision', b,
      (d->>'decision') = c.expected and ((d->>'decision')='autorise') = b and nom_expose = membre, c.note,
      case when nom_expose then 'nom exposé' else 'aucun nom' end || case when membre then ' (membre)' else ' (non-membre)' end);
  end loop;
  -- Non authentifié (aucun JWT) et application inconnue
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  d := public.decision_acces_application('colors', null);
  reset role;
  insert into public._dc_res values ('(aucun jeton)','colors','non_authentifie', d->>'decision', false, (d->>'decision')='non_authentifie' and jsonb_typeof(d->'entreprise')<>'object', 'non connecté','aucun nom (non-membre)');
  select id into u from auth.users where email like 'c6-acces-complet@%';
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;
  d := public.decision_acces_application('application_qui_nexiste_pas', 'e1000000-0000-4000-8000-000000000001');
  reset role;
  insert into public._dc_res values ('c6-acces-complet','application_qui_nexiste_pas','erreur_configuration', d->>'decision', false, (d->>'decision')='erreur_configuration' and jsonb_typeof(d->'entreprise')<>'object', 'application inconnue (échec fermé, aucun nom)','aucun nom (membre)');
end $$;

\echo == Cas ==
select label, app, expected as attendu, obtenu, a_acces as "a_acces_application", case when ok then 'PASS' else 'FAIL' end as verdict, exposition, note
from public._dc_res order by label, app;
\echo == Synthèse ==
select count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail, count(*) as total from public._dc_res;
\echo == Invariant : decision = autorise <=> a_acces_application ==
select count(*) as violations from public._dc_res where (obtenu='autorise') is distinct from a_acces and label <> '(aucun jeton)' and app <> 'application_qui_nexiste_pas';

\echo == Contrat : décisions rendues hors des 13 codes du contrat figé (attendu 0) ==
select count(*) as hors_contrat from public._dc_res
 where obtenu not in ('non_authentifie','erreur_configuration','suspension_plateforme','autorise','sans_organisation',
   'invitation_en_attente','validation_en_attente','utilisateur_desactive','abonnement_suspendu','essai_expire',
   'application_non_incluse','sans_habilitation','sans_role');
\echo == Découplage D3 : lignes GP suspendu -> autorise sur une autre application ==
select label, app, obtenu from public._dc_res where label in ('c7-entreprise-suspendue','x1-entreprise-annulee','x4-suspension-prevue-echue') order by label, app;

-- Contrôles de confidentialité de la vue CLIENT et du diagnostic ADMIN
\echo == Confidentialité ==
begin;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select 'auth seul, entreprise D suspendue tierce -> vue client' as sonde, public.decision_acces_application('colors','e4000000-0000-4000-8000-000000000004')::text as resultat;
do $$ begin
  begin perform public.diagnostic_acces_application('a0000000-0000-4000-8000-000000000007','e4000000-0000-4000-8000-000000000004','colors'); raise notice 'diagnostic par un non-admin : AUTORISE (BUG)';
  exception when others then raise notice 'diagnostic par un non-admin : REFUSE (%)', sqlstate; end;
  begin perform public._decision_acces_noyau(null,null,'colors'); raise notice 'noyau appelable par authenticated : OUI (BUG)';
  exception when others then raise notice 'noyau appelable par authenticated : NON (%)', sqlstate; end;
end $$;
rollback;
begin;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select 'membre d''une org suspendue par la plateforme -> vue client (ni motif ni diagnostic)' as sonde, public.decision_acces_application('colors','ec000000-0000-4000-8000-00000000000c')::text as resultat;
rollback;
begin;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000c',true);
set local role authenticated;
select 'diagnostic admin, c7 (GP suspendu) sur gestion_pro' as sonde, public.diagnostic_acces_application('a0000000-0000-4000-8000-000000000007','e4000000-0000-4000-8000-000000000004','gestion_pro')::text as resultat
union all select 'diagnostic admin, c7 (GP suspendu) sur colors', public.diagnostic_acces_application('a0000000-0000-4000-8000-000000000007','e4000000-0000-4000-8000-000000000004','colors')::text
union all select 'diagnostic admin, y1 (Colors suspendu) sur colors', public.diagnostic_acces_application('a2000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-00000000000a','colors')::text
union all select 'diagnostic admin, y3 (org suspendue plateforme) : motif visible ici seulement', public.diagnostic_acces_application('a2000000-0000-4000-8000-000000000003','ec000000-0000-4000-8000-00000000000c','colors')::text;
rollback;
