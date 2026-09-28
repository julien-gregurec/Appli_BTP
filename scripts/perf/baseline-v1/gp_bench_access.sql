-- ELSATIA — Baseline performance V1 : rend les comptes de la fixture GP connectables par la
-- passerelle locale (tests/e2e/colors-pile-locale/passerelle.mjs : bcrypt contre
-- auth.users.encrypted_password) et aligne l'offre de l'entreprise, comme
-- scripts/e2e/prepare-local-recipe.sql le fait pour la recette navigateur.
-- Mot de passe local de banc (non secret) : Perf-Baseline-2026!
-- Base jetable uniquement.

alter table auth.users
  add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text,
  add column if not exists email_change_token_current text, add column if not exists phone_change text,
  add column if not exists phone_change_token text, add column if not exists reauthentication_token text;

-- Un seul hachage bcrypt (coût 6) partagé : la connexion n'est pas ce que l'on mesure.
update auth.users
set encrypted_password = (select extensions.crypt('Perf-Baseline-2026!', extensions.gen_salt('bf', 6))),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'))
where email like 'fixture.%@perf.invalid';

update public.entreprises
set abonnement_statut = 'actif', abonnement_offre = 'entreprise', abonnement_echeance = current_date + 365
where id in ('a0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-b000-000000000001');

-- Le mode dépôt est un verrouillage de terminal, pas un droit ordinaire (cf. prepare-local-recipe.sql).
update public.permissions_poste set autorise = false
where entreprise_id in ('a0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-b000-000000000001')
  and cle_permission = 'mode_compte_depot';

analyze;
