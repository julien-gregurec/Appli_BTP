-- ROADMAP-CLEANUP-V1 : reconciliation d'une derive de schema reelle decouverte entre
-- Preview et Production (jamais versionnee dans aucune migration, y compris sur aucune
-- branche feature). Les deux triggers ci-dessous existaient deja sur Preview, stables et
-- utilises depuis plusieurs lots (voir 20260824000229_workflow_devis_v1_revert_lien_reciproque.sql
-- pour verrouiller_devis_accepte) : ce fichier les rend simplement reproductibles et les
-- applique a Production, avec l'accord explicite de Julien pour ces deux points precis.
--
-- 1) Verrou d'integrite devis accepte (devis + lignes_devis) : absent de Production,
--    un devis accepte pouvait y etre modifie/supprime sans aucune protection base de
--    donnees, contrairement a Preview. Definition identique a celle deja live sur Preview.
--
-- 2) Initialisation de la periode d'essai (entreprises) : la colonne
--    abonnement_essai_debut n'existait meme pas sur Production, et rien ne renseignait
--    abonnement_essai_fin a la creation d'une entreprise. Consequence verifiee en base :
--    les entreprises en statut 'essai' sur Production ont abonnement_essai_fin = NULL,
--    et getContexteEntreprise() (src/lib/entreprise.ts) ne redirige vers
--    /abonnement-suspendu que si cette date est renseignee ET depassee -- un essai
--    gratuit sur Production ne s'arretait donc jamais tout seul. Corrige pour les
--    entreprises creees a partir de maintenant uniquement : les entreprises existantes en
--    essai (dont l'entreprise reelle ELSATIA elle-meme) ne sont volontairement PAS
--    retro-remplies par cette migration -- decision deliberee de ne pas modifier leur etat
--    sans une demande explicite distincte, conformement a la consigne de ne jamais toucher
--    l'entreprise reelle ELSATIA ni les residus permanents de recette existants.
--
-- Non inclus dans cette migration (perimetre explicitement plus large, non demande) : le
-- trigger proteger_facturation_entreprise() vu sur Preview, qui empecherait un membre
-- tenant de modifier directement les colonnes d'abonnement/facturation -- il depend de
-- plateforme_a_permission(), une fonction qui n'existe pas non plus sur Production.
-- Documente comme point de suivi distinct, pas traite ici.

-- ============================================================================
-- 1) Verrou devis accepte
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
       or new.chantier_id is distinct from old.chantier_id
       or new.remise_globale is distinct from old.remise_globale
       or new.conditions is distinct from old.conditions
       or new.notes_client is distinct from old.notes_client
       or new.date_emission is distinct from old.date_emission
       or new.date_validite is distinct from old.date_validite
       or new.numero is distinct from old.numero
       or new.entreprise_id is distinct from old.entreprise_id
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
-- 2) Initialisation de la periode d'essai
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
