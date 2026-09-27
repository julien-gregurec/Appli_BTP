-- Harnais de compatibilité des seeds — prérequis communs (BASE JETABLE UNIQUEMENT).
--
-- Ce fichier n'est jamais exécuté sur Preview ni Production : il est chargé par
-- scripts/seeds/verify-seeds.mjs dans une base locale reconstruite depuis les migrations
-- (scripts/local-postgres-bootstrap/rebuild_db.sh), avant chaque seed qui suppose une
-- entreprise déjà « onboardée » (Entreprise Test, juju, entreprise Recette Preview…).
--
-- seed_harness.onboarder() reproduit public.creer_entreprise_bootstrap() — le parcours réel
-- d'inscription — à deux différences près, explicites :
--   1. l'UUID de l'entreprise est imposé (le seed Preview cible un UUID fixe) ;
--   2. le compte Auth est inséré directement dans auth.users (pas de GoTrue ici), ce qui
--      déclenche le vrai trigger on_auth_user_created → public.utilisateurs.
-- Les postes, permissions, Compte dépôt, compteurs et essais sont créés par les VRAIES
-- fonctions et triggers du train (appliquer_modele_role_predefini_interne,
-- trg_creer_poste_compte_depot, initialiser_essai_entreprise…), sans contournement.
--
-- La capacité de personnes est ouverte comme le fait un opérateur plateforme (mêmes colonnes
-- et même ligne d'historique que plateforme_definir_capacite_personnes_supplementaire, cf.
-- seed_entreprise_pilote_btp.sql §1) — jamais par elsatia.capacite_personnes_bypass.

create schema if not exists seed_harness;

create or replace function seed_harness.onboarder(
  p_entreprise_id uuid,
  p_nom text,
  p_utilisateur_id uuid,
  p_email text,
  p_capacite_supplementaire integer default 0
) returns uuid
language plpgsql
as $$
declare
  v_poste uuid;
  v_modele record;
begin
  if exists (select 1 from public.entreprises where id = p_entreprise_id) then
    return p_entreprise_id;
  end if;
  insert into auth.users (id, email, aud, role, email_confirmed_at, confirmed_at)
  values (p_utilisateur_id, p_email, 'authenticated', 'authenticated', now(), now())
  on conflict (id) do nothing;

  insert into public.entreprises (id, nom) values (p_entreprise_id, p_nom);
  for v_modele in select cle from public.modeles_roles_predefinis order by ordre loop
    v_poste := public.appliquer_modele_role_predefini_interne(p_entreprise_id, v_modele.cle, true);
    if v_modele.cle = 'gerant' then
      insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
      values (p_utilisateur_id, p_entreprise_id, v_poste, 'actif');
    end if;
  end loop;
  update public.utilisateurs set entreprise_active_id = p_entreprise_id where id = p_utilisateur_id;

  if p_capacite_supplementaire > 0 then
    update public.entreprises set
      capacite_personnes_supplementaire = p_capacite_supplementaire,
      capacite_personnes_source = 'systeme',
      capacite_personnes_reference_externe = 'HARNAIS-SEEDS - fixture locale',
      capacite_personnes_maj_at = now()
    where id = p_entreprise_id;
    insert into public.historique_capacite_personnes (entreprise_id, action, ancien, nouveau, source, reference_externe, motif)
    values (p_entreprise_id, 'capacite_supplementaire_definie',
            '{"capacite_personnes_supplementaire":0}'::jsonb,
            jsonb_build_object('capacite_personnes_supplementaire', p_capacite_supplementaire),
            'systeme', 'HARNAIS-SEEDS - fixture locale', 'Harnais de compatibilité des seeds (base jetable)');
  end if;
  return p_entreprise_id;
end;
$$;

-- Salariés actifs minimaux d'une entreprise onboardée (les seeds « Entreprise Test » et
-- « juju » exigent au moins un salarié actif, créé à la main en recette réelle).
create or replace function seed_harness.salaries(p_entreprise_id uuid, p_nombre integer, p_prefixe text)
returns void
language plpgsql
as $$
declare
  v_i integer;
  v_poste uuid;
begin
  select id into v_poste from public.postes where entreprise_id = p_entreprise_id and nom = 'Ouvrier';
  for v_i in 1..p_nombre loop
    insert into public.employes (entreprise_id, reference_interne, prenom, nom, email, poste, poste_id, type_contrat, date_entree, statut)
    values (p_entreprise_id, p_prefixe || '-EMP-' || lpad(v_i::text, 3, '0'), 'Salarie' || v_i, p_prefixe,
            lower(p_prefixe) || '.salarie' || v_i || '@example.test', 'Ouvrier', v_poste, 'cdi', current_date - 2000, 'actif')
    on conflict do nothing;
  end loop;
end;
$$;
