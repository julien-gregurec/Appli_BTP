-- ELSATIA-RESERVES-HOST-SUSPENSION-POLICY-V1 — HÔTE SUSPENDU : INTERVENANT EN LECTURE SEULE
--
-- Décision propriétaire D-01 (ouverte par ELSATIA_RESERVES_FULL_LOCAL_QUALIFICATION_V1 §3.8,
-- tranchée : MODE LECTURE SEULE). Rapport :
-- docs/qualification/ELSATIA_RESERVES_HOST_SUSPENSION_POLICY_V1.md.
--
-- Avant ce lot : quand l'organisation HÔTE d'un chantier était suspendue, ses propres
-- utilisateurs perdaient tout accès (`est_membre_actif`), mais l'entreprise intervenante
-- invitée — tenant à part entière, lui actif — continuait d'agir sur les réserves qui lui
-- étaient attribuées : accepter, refuser, commenter, déposer une photo, demander une
-- levée, rejouer sa file hors-ligne. `reserves_intervenant_courant` ne regarde pas l'état
-- du tenant hôte.
--
-- Après ce lot :
--
--   • LECTURE INCHANGÉE. `reserves_intervenant_courant` (le prédicat de toutes les
--     lectures : RLS, exports, PDF, repères, photos, plans, échanges, historique) n'est
--     PAS modifié. L'intervenant continue de voir exactement ce qu'il voyait.
--
--   • ÉCRITURE GELÉE, à deux niveaux indépendants :
--       1. `reserves_acteur_courant` — le pivot de TOUTES les écritures de l'intervenant
--          (transition, acceptation, refus, demande de levée, commentaire, photo,
--          confirmation, retrait de photo, file hors-ligne, policy d'écriture Storage) —
--          refuse avec un motif explicite quand l'hôte n'a plus son entitlement ;
--       2. un trigger de garde sur chaque table Réserves de l'hôte refuse toute écriture
--          d'un TIERS (utilisateur authentifié qui n'est pas membre de l'organisation
--          hôte) tant que l'hôte est fermé, quel que soit le chemin (RPC présente ou
--          future, invitation, pagination d'un plan…).
--
--   • AUCUN DROIT STOCKÉ N'EST TOUCHÉ. Ni l'intervenant, ni l'invitation, ni
--     l'habilitation ne sont modifiés : la décision est recalculée à chaque requête. Dès
--     que l'hôte retrouve son entitlement, l'écriture revient — sans reconnexion, sans
--     nouvelle invitation.
--
--   • UTILISATEURS DE L'HÔTE : inchangés. Ils suivent les règles commerciales existantes
--     (`est_membre_actif`, `a_acces_application`) ; le trigger ne les concerne pas, ce qui
--     préserve en particulier R-04 (la suppression d'un chantier Gestion Pro détache le
--     chantier Réserves, même quand l'hôte n'a plus le module Réserves).
--
--   • FACTURATION : non modifiée. Le prédicat LIT l'état commercial existant
--     (`entreprises.abonnement_statut`, `suspension_prevue_at`,
--     `acces_applications_entreprises`) sans rien y écrire.
--
--   • HISTORIQUE : un refus est une exception, donc un rollback complet — aucune ligne
--     d'historique, de message, de notification ou de registre d'idempotence n'est
--     créée par une tentative bloquée.

-- ── 1. L'hôte est-il ouvert à l'écriture ? ────────────────────────────────────
--
-- Prédicat de TENANT, indépendant de l'appelant. Reprend exactement les deux conditions
-- tenant de `est_membre_actif` et `a_acces_application` : organisation ni suspendue ni
-- annulée (suspension programmée comprise), et entitlement Réserves autorisé, en cours de
-- validité, application active.
--
-- Non exposé à `authenticated` : il renseignerait l'état commercial de n'importe quelle
-- organisation dont on connaît l'identifiant. L'application interroge
-- `reserves_lecture_seule_hote`, cantonné aux réserves que l'appelant lit déjà.
create or replace function public.reserves_hote_ecriture_ouverte(p_entreprise_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select p_entreprise_id is not null
    and exists (
      select 1 from public.entreprises e
      where e.id = p_entreprise_id
        and e.abonnement_statut not in ('suspendu', 'annule')
        and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
    )
    and exists (
      select 1 from public.acces_applications_entreprises ae
      join public.applications_elsatia a on a.code = ae.application_code and a.actif
      where ae.entreprise_id = p_entreprise_id
        and ae.application_code = 'reserves'
        and ae.autorise
        and (ae.valide_du is null or ae.valide_du <= now())
        and (ae.valide_jusqu_au is null or ae.valide_jusqu_au > now())
    );
$$;

comment on function public.reserves_hote_ecriture_ouverte(uuid) is
  'D-01 : vrai quand l''organisation hôte dispose de son entitlement Réserves (non suspendue, '
  'non annulée, accès applicatif valide). Faux : ses intervenants passent en lecture seule.';

revoke all on function public.reserves_hote_ecriture_ouverte(uuid) from public, anon, authenticated;

-- ── 2. Pivot des écritures : `reserves_acteur_courant` ────────────────────────
--
-- Corps identique à la V1, plus UNE condition sur la branche intervenant. La fonction
-- n'est appelée que par des chemins d'écriture (vérifié : aucune lecture ne l'utilise ;
-- les lectures passent par `reserves_lecture_autorisee` / `reserves_intervenant_courant`).
--
-- Refus par EXCEPTION plutôt que par NULL : le NULL produirait « Commentaire non
-- autorisé », indiscernable d'une révocation. Ici l'intervenant a toujours ses droits ;
-- ils sont seulement suspendus. Le code SQLSTATE 42501 est celui d'un refus de droit
-- (PostgREST → 403) ; l'indice porte un code stable pour l'application.
create or replace function public.reserves_acteur_courant(p_reserve_id uuid)
returns text language plpgsql security definer stable set search_path = public as $$
declare v_entreprise uuid; v_intervenant uuid;
begin
  select r.entreprise_id, r.intervenant_id into v_entreprise, v_intervenant
  from public.reserves r where r.id = p_reserve_id;
  if v_entreprise is null then return null; end if;
  if public.reserves_role_courant(v_entreprise) is not null
     and public.reserves_action_autorisee(v_entreprise, 'commenter') then
    return 'hote';
  end if;
  if public.reserves_intervenant_courant(v_intervenant) then
    if not public.reserves_hote_ecriture_ouverte(v_entreprise) then
      raise exception using
        errcode = '42501',
        message = 'Organisation hôte suspendue : cette réserve est en lecture seule.',
        detail  = 'Les réserves restent consultables ; aucune action n''est possible tant que '
               || 'l''organisation qui a créé le chantier n''a pas rétabli son accès.',
        hint    = 'RESERVES_HOTE_SUSPENDU';
    end if;
    return 'intervenant';
  end if;
  return null;
end;
$$;

-- ── 3. Garde centrale sur les tables de l'hôte ─────────────────────────────────
--
-- Défense en profondeur : si une RPC présente ou future écrit sur une table Réserves de
-- l'hôte sans passer par `reserves_acteur_courant` (invitation, pagination d'un plan…),
-- ou si une policy venait à s'ouvrir, la règle tient quand même.
--
-- Ne concerne que les TIERS : utilisateur authentifié (`auth.uid()` renseigné), qui n'est
-- pas administrateur plateforme, et qui n'est PAS membre de l'organisation hôte (statut
-- `actif` de l'appartenance, indépendamment de l'état commercial — le membre d'un hôte
-- suspendu est déjà refusé par les règles commerciales existantes, et le laisser passer
-- ici préserve R-04). Clé serveur, cron, purge RGPD : `auth.uid()` nul, non concernés.
create or replace function public.reserves_garde_hote_suspendu()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_ligne record;
begin
  if tg_op = 'DELETE' then v_ligne := old; else v_ligne := new; end if;
  v_entreprise := v_ligne.entreprise_id;

  if auth.uid() is null
     or v_entreprise is null
     or public.est_plateforme_admin()
     or public.reserves_hote_ecriture_ouverte(v_entreprise)
     or exists (
       select 1 from public.utilisateurs_entreprises ue
       where ue.entreprise_id = v_entreprise
         and ue.utilisateur_id = auth.uid()
         and ue.statut = 'actif'
     )
  then
    return v_ligne;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Organisation hôte suspendue : cette réserve est en lecture seule.',
    detail  = format('Écriture refusée sur %s (%s).', tg_table_name, lower(tg_op)),
    hint    = 'RESERVES_HOTE_SUSPENDU';
end;
$$;

revoke all on function public.reserves_garde_hote_suspendu() from public, anon, authenticated;

-- Tables de l'HÔTE uniquement. Restent libres, à dessein :
--   • reserves_conversations_lectures, reserves_notifications_lectures — curseurs de
--     lecture personnels (« marquer comme lu » fait partie de la consultation) ;
--   • reserves_annuaire_publication, reserves_preferences_notifications — données du
--     propre tenant de l'intervenant ;
--   • reserves_evenements_notifications — file d'envoi alimentée par les actions (déjà
--     bloquées en amont) et dépilée par le cron sous clé serveur.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'reserves', 'reserves_historique', 'reserves_messages', 'reserves_conversations',
    'reserves_photos', 'reserves_mutations_appliquees', 'reserves_plans',
    'reserves_chantiers', 'reserves_intervenants', 'reserves_invitations'
  ] loop
    execute format('drop trigger if exists reserves_garde_hote_suspendu on public.%I', v_table);
    execute format(
      'create trigger reserves_garde_hote_suspendu before insert or update or delete '
      'on public.%I for each row execute function public.reserves_garde_hote_suspendu()',
      v_table);
  end loop;
end $$;

-- ── 4. Ce que l'application affiche ───────────────────────────────────────────
--
-- Vrai quand l'appelant lit cette réserve EN TANT QU'INTERVENANT et que l'hôte est
-- fermé : l'écran masque alors les actions et affiche le bandeau « lecture seule ».
-- NULL pour une réserve que l'appelant ne lit pas : la fonction n'est pas un oracle de
-- l'état commercial des autres organisations.
create or replace function public.reserves_lecture_seule_hote(p_reserve_id uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_entreprise uuid; v_intervenant uuid;
begin
  if auth.uid() is null or not public.reserves_lecture_autorisee(p_reserve_id) then
    return null;
  end if;
  select r.entreprise_id, r.intervenant_id into v_entreprise, v_intervenant
  from public.reserves r where r.id = p_reserve_id;
  if public.reserves_action_autorisee(v_entreprise, 'voir') then
    return false;  -- l'appelant lit en tant qu'hôte : ses règles sont celles de son abonnement
  end if;
  return public.reserves_intervenant_courant(v_intervenant)
     and not public.reserves_hote_ecriture_ouverte(v_entreprise);
end;
$$;

-- Même information au niveau du chantier (liste, fiche chantier) : NULL si l'appelant
-- n'y intervient pas.
create or replace function public.reserves_chantier_lecture_seule_hote(p_chantier_id uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_entreprise uuid;
begin
  if auth.uid() is null or not public.reserves_chantier_visible_intervenant(p_chantier_id) then
    return null;
  end if;
  select c.entreprise_id into v_entreprise from public.reserves_chantiers c where c.id = p_chantier_id;
  if public.reserves_action_autorisee(v_entreprise, 'voir') then return false; end if;
  return not public.reserves_hote_ecriture_ouverte(v_entreprise);
end;
$$;

revoke all on function public.reserves_lecture_seule_hote(uuid) from public, anon;
revoke all on function public.reserves_chantier_lecture_seule_hote(uuid) from public, anon;
grant execute on function public.reserves_lecture_seule_hote(uuid) to authenticated;
grant execute on function public.reserves_chantier_lecture_seule_hote(uuid) to authenticated;

notify pgrst, 'reload schema';
