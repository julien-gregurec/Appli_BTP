-- Décor de recette du lot ELSATIA-GP-MOBILE-AUTHENTICATED-PILOT-CLOSURE-V1.
--
-- STRICTEMENT ADDITIF ET REJOUABLE. Ce script n'écrit que des lignes NOUVELLES, portant des
-- identifiants réservés (préfixe `40000000…` / `a1000000…0007+`) et des libellés suffixés
-- « (recette mobile) ». Il ne modifie ni ne supprime aucune ligne du décor existant, qui
-- appartient à la recette du Train V3.
--
-- Il complète `supabase/tests/fixtures/isolation_multitenant.inc` avec les deux profils qui
-- manquaient au décor et que la recette mobile exige :
--
--   1. UN EXPERT-COMPTABLE. Le poste « Comptable A » du décor existant ne convient pas : il
--      porte acces_achats / acces_exports / acces_factures / acces_rentabilite / gerer_achats
--      / gerer_factures / voir_rentabilite, c'est-à-dire AUCUNE permission de notes de frais
--      et, à l'inverse, `gerer_factures` — qui autorise à modifier une facture. L'expert-
--      comptable décrit au cahier des charges ne doit précisément PAS pouvoir modifier une
--      facture définitive.
--
--   2. UN TÉMOIN SANS HABILITATION. Aucun compte du décor n'a zéro permission ; sans lui, on
--      ne peut pas démontrer qu'un refus est bien un refus et non un écran vide.

set local elsatia.capacite_personnes_bypass = 'on';

-- ── Comptes ─────────────────────────────────────────────────────────────────

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'expert-comptable-a@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'sans-droit-a@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

-- GoTrue échoue à lire un compte dont les colonnes de jetons sont NULL
-- (« converting NULL to string is unsupported ») et répond 500 à la connexion.
-- La normalisation est rejouable et ne touche que les deux comptes ajoutés ici.
update auth.users set
  confirmation_token     = coalesce(confirmation_token, ''),
  recovery_token         = coalesce(recovery_token, ''),
  email_change           = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  phone_change           = coalesce(phone_change, ''),
  phone_change_token     = coalesce(phone_change_token, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where id in ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002');

insert into public.utilisateurs (id, prenom, nom) values
  ('40000000-0000-0000-0000-000000000001', 'Expert-comptable', 'A'),
  ('40000000-0000-0000-0000-000000000002', 'Témoin sans droit', 'A')
on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;

-- ── Postes ──────────────────────────────────────────────────────────────────

insert into public.postes (id, entreprise_id, nom) values
  ('a1000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Expert-comptable A (recette mobile)'),
  ('a1000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Témoin sans habilitation A (recette mobile)')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('40000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'actif'),
  ('40000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008', 'actif')
on conflict do nothing;

-- ── Périmètre de l'expert-comptable ─────────────────────────────────────────
--
-- Ce qui est accordé, et rien d'autre. Chaque ligne correspond à une famille du cahier
-- des charges ; ce qui n'y figure pas est refusé PAR ABSENCE, pas par une règle négative —
-- c'est la seule façon de garantir qu'une permission ajoutée demain ne lui échoit pas
-- silencieusement.
--
-- Volontairement ABSENTS, et il faut savoir pourquoi :
--   gerer_factures            → il ne doit ni modifier ni supprimer une facture définitive
--   preparer/valider/executer_virements → il consulte les paiements, il n'en déclenche aucun
--   gerer_utilisateurs, acces_parametres, gerer_parametres → administration et secrets Stripe
--   acces_chantiers, gerer_chantiers, …  → opérations de chantier
--   acces_planning            → planning individuel détaillé
--   acces_messagerie          → conversations internes
--   acces_stock, acces_outillage, acces_flotte → matériels sans nécessité comptable
--   gerer_notes_frais         → il comptabilise et exporte ; il ne récrit pas la saisie du salarié
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true
from public.postes p
join public.permissions_disponibles d on d.cle in (
  'acces_factures',              -- factures et avoirs, en lecture
  'acces_achats',                -- factures fournisseurs
  'acces_paiements_bancaires',   -- paiements, en consultation
  'acces_exports',               -- exports comptables et TVA
  'comptabiliser_notes_frais',   -- notes de frais de l'entreprise mandatée
  'exporter_notes_frais',
  'consulter_audit_notes_frais'
)
where p.id = 'a1000000-0000-0000-0000-000000000007'
on conflict do nothing;

-- Le témoin ne reçoit AUCUNE permission : c'est tout l'objet du compte.

-- ── Décor métier minimal pour la recette mobile ─────────────────────────────
--
-- Une note de frais déjà déposée par l'ouvrier A, que l'expert-comptable doit voir et que
-- l'entreprise B ne doit jamais voir.
insert into public.notes_frais (
  id, entreprise_id, employe_id, cree_par_utilisateur_id, date_frais,
  montant_ttc, categorie, description, fournisseur, statut, lieu_hors_chantier
)
select
  '4f000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  e.id,
  '10000000-0000-0000-0000-000000000002',
  current_date,
  42.50, 'carburant', 'RECETTE_MOBILE_note_ouvrier_A', 'Station RECETTE_A', 'soumis', 'sans_chantier'
from public.employes e
where e.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
  and e.utilisateur_id = '10000000-0000-0000-0000-000000000002'
limit 1
on conflict (id) do nothing;
