-- Deux garde-fous réels, absents de cette branche depuis toujours (recherche exhaustive :
-- aucune migration ne définit verrouiller_devis_accepte, verrouiller_lignes_devis_accepte,
-- initialiser_essai_entreprise, ni la colonne abonnement_essai_debut).
--
-- 1) Aucune protection base de données n'empêchait de modifier ou supprimer un devis déjà
--    accepté (ni ses lignes). La seule protection était applicative
--    (modifierDevisAction/modifier_devis_brouillon refusent déjà tout devis dont le statut
--    n'est pas 'brouillon', et changerStatutDevisAction n'autorise aucune transition sortante
--    depuis 'accepte', cf. TRANSITIONS_DEVIS dans src/lib/devis.ts) — contournable par un
--    appel direct à l'API REST ou SQL Supabase avec le même jeton de session, comme pour les
--    autres correctifs d'isolation portés dans cette même session.
--
-- 2) abonnement_statut vaut 'essai' par défaut pour toute nouvelle entreprise (contrainte
--    `default 'essai'`, 20260710000036), mais rien ne renseignait jamais
--    abonnement_essai_fin à la création. getContexteEntreprise() (src/lib/entreprise.ts) ne
--    redirige vers /abonnement-suspendu que si cette date est renseignée ET dépassée : un
--    essai gratuit ne s'arrêtait donc jamais tout seul, pour aucune entreprise créée par
--    aucun des chemins d'inscription existants (auto-service ou création plateforme).
--
-- Porté depuis integration/gp-external-pilot-closure-v1 (commit 5777abb, migration source
-- 20260824000231_roadmap_cleanup_v1_reconciliation_drift_production.sql).
--
-- Écart volontaire par rapport à la migration source, après vérification du code applicatif
-- actuel de cette branche : `chantier_id` est EXCLU des colonnes verrouillées par
-- verrouiller_devis_accepte(), contrairement à la source. associerDevisChantierAction
-- (src/app/actions/devis.ts) autorise explicitement de réassigner un devis DÉJÀ ACCEPTÉ à un
-- autre chantier du même client (seule la suppression du lien est bloquée si le devis est
-- accepté : `if (!chantierId && devis.statut === "accepte")`) — un flux métier légitime et
-- déjà en production sur cette branche, absent (ou non vérifié) côté source. Garder
-- chantier_id dans le verrou aurait cassé cette fonctionnalité existante dès ce correctif.
-- Toutes les autres colonnes (statut, montants, client_id, remise_globale, conditions,
-- notes_client, dates, numero, entreprise_id) restent verrouillées comme dans la source :
-- aucun chemin applicatif actuel ne les modifie sur un devis accepté (vérifié :
-- modifierDevisAction refuse tout devis non-brouillon, TRANSITIONS_DEVIS n'autorise aucune
-- sortie depuis 'accepte').
--
-- Les entreprises existantes en 'essai' avec abonnement_essai_fin déjà NULL ne sont pas
-- rétro-remplies (même décision que la source, pour la même raison : ne pas modifier l'état
-- d'un essai existant sans demande explicite séparée).

-- ============================================================================
-- 1) Verrou devis accepté
-- ============================================================================

create or replace function public.verrouiller_devis_accepte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'accepte' then
      raise exception 'Ce devis est accepté et ne peut plus être supprimé.';
    end if;
    return old;
  end if;

  if old.statut = 'accepte' then
    if new.statut is distinct from old.statut
       or new.montant_ht is distinct from old.montant_ht
       or new.montant_tva is distinct from old.montant_tva
       or new.montant_ttc is distinct from old.montant_ttc
       or new.client_id is distinct from old.client_id
       or new.remise_globale is distinct from old.remise_globale
       or new.conditions is distinct from old.conditions
       or new.notes_client is distinct from old.notes_client
       or new.date_emission is distinct from old.date_emission
       or new.date_validite is distinct from old.date_validite
       or new.numero is distinct from old.numero
       or new.entreprise_id is distinct from old.entreprise_id
       -- chantier_id volontairement exclu : voir la note de portage en tête de fichier
       -- (associerDevisChantierAction autorise la réassignation d'un devis accepté).
    then
      raise exception 'Ce devis est accepté et ne peut plus être modifié.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists verrou_devis_accepte on public.devis;
create trigger verrou_devis_accepte
  before delete or update on public.devis
  for each row execute function public.verrouiller_devis_accepte();

create or replace function public.verrouiller_lignes_devis_accepte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_entreprise_id uuid; v_statut text;
begin
  select entreprise_id, statut into v_entreprise_id, v_statut
  from public.devis where id = coalesce(new.devis_id, old.devis_id);

  if v_statut = 'accepte' and public.est_membre_actif(v_entreprise_id) then
    raise exception 'Ce devis est accepté : ses lignes ne peuvent plus être modifiées.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists verrou_lignes_devis_accepte on public.lignes_devis;
create trigger verrou_lignes_devis_accepte
  before insert or delete or update on public.lignes_devis
  for each row execute function public.verrouiller_lignes_devis_accepte();

-- ============================================================================
-- 2) Initialisation de la période d'essai
-- ============================================================================

alter table public.entreprises add column if not exists abonnement_essai_debut date;

create or replace function public.initialiser_essai_entreprise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.abonnement_essai_debut := coalesce(new.abonnement_essai_debut, new.created_at::date, current_date);
  new.abonnement_essai_fin := coalesce(new.abonnement_essai_fin, new.abonnement_essai_debut + 30);
  return new;
end;
$$;

drop trigger if exists initialiser_essai_entreprise on public.entreprises;
create trigger initialiser_essai_entreprise
  before insert on public.entreprises
  for each row execute function public.initialiser_essai_entreprise();

notify pgrst, 'reload schema';
