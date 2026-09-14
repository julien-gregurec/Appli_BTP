-- GP_V1_RC — durcissement des privilèges d'exécution sur les fonctions SECURITY DEFINER
-- exposées à `anon` sans garde d'autorisation interne.
--
-- ORIGINE DU CONSTAT : répétition générale sur une restauration réelle de Production (lecture
-- seule, 2026-09-14). L'inventaire empirique local (construit uniquement à partir des 210-215/
-- 257/265/272/274/275/282-296, sans les ~150 fonctions historiques de paie/virements/stock/etc.
-- de la 211-baseline complète) ne pouvait pas révéler ce défaut : il ne concerne AUCUNE fonction
-- introduite par GP V1 ni par cette RC, il préexiste dans `release/commercialisation-v1` — et
-- n'est pas non plus couvert par la migration `20260902000255_acl_reconciliation_v1` originale,
-- qui ne révoque jamais l'EXECUTE par défaut de `anon` sur les fonctions (seulement celui
-- d'`authenticated` et de `service_role` — voir § « DEFAULT PRIVILEGES » plus bas).
--
-- MÉCANISME : les fonctions créées par le rôle `postgres` reçoivent en Production un privilège
-- EXECUTE par défaut accordé à `anon` (`pg_default_acl`, `defaclrole = postgres`), en plus de
-- celui accordé à `authenticated`. Ni la 255 ni son extraction RC (`20260911000297`) ne
-- l'écartent. `PUBLIC` lui-même n'a jamais ce privilège par défaut (PostgreSQL ≥ 15) : le risque
-- est spécifique à `anon`/`authenticated`, pas à `PUBLIC`.
--
-- MÉTHODE : audit ciblé (pas un REVOKE géant) sur les fonctions `SECURITY DEFINER` exécutables
-- par `anon`, priorité devis/factures/paie/virements/administration/permissions/utilisateurs/
-- abonnements/planning/clients/entreprises (268 fonctions publiques auditées, 188 SECURITY
-- DEFINER exécutables par anon, 47 sans garde d'autorisation interne détectable). Les fonctions
-- de virements (`creer_lot_virements`, `valider_lot_virements`, `annuler_lot_virements`,
-- `reconcilier_lot_virements`) ont été vérifiées et disposent déjà toutes d'un contrôle
-- `a_permission(...)` ou `auth.role() = 'service_role'` interne — non concernées ici.
--
-- Chaque fonction ci-dessous a été relue intégralement et son appelant identifié avant toute
-- décision — jamais par supposition sur le nom seul.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- CATÉGORIE D — fonctions internes, aucun accès client direct prévu.
-- Chacune est appelée EXCLUSIVEMENT par : (a) un trigger SECURITY DEFINER, (b) une fonction
-- publique « enveloppe » qui vérifie déjà les permissions avant de déléguer (schéma vérifié pour
-- chacune — ex. `controler_periode_paie` → `peut_gerer_paie()` → `controler_periode_paie_interne`),
-- ou (c) une autre fonction interne elle-même de catégorie D. Un appel SECURITY DEFINER en chaîne
-- ne nécessite PAS que la fonction interne porte son propre EXECUTE : elle s'exécute avec les
-- privilèges de son propriétaire (`postgres`), pas ceux de l'appelant SQL d'origine.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

revoke execute on function public.recalc_totaux_devis(p_devis_id uuid) from public, anon, authenticated;
revoke execute on function public.recalc_totaux_commande(p_commande_id uuid) from public, anon, authenticated;
revoke execute on function public.recalc_paiements_facture(p_facture_id uuid) from public, anon, authenticated;
revoke execute on function public.recalculer_dossier_paie(p_dossier_id uuid) from public, anon, authenticated;
revoke execute on function public.recomputer_statut_commande(p_commande_id uuid) from public, anon, authenticated;
revoke execute on function public.synchroniser_taches_devis_accepte(p_devis_id uuid) from public, anon, authenticated;
revoke execute on function public.controler_periode_paie_interne(p_periode_id uuid) from public, anon, authenticated;
revoke execute on function public.synchroniser_periode_paie_interne(p_periode_id uuid) from public, anon, authenticated;
revoke execute on function public.creer_commande_fournisseur_interne(p_entreprise_id uuid, p_commande jsonb, p_lignes jsonb) from public, anon, authenticated;
revoke execute on function public.enregistrer_reception_commande_interne(p_entreprise_id uuid, p_commande_id uuid, p_receptions jsonb) from public, anon, authenticated;
revoke execute on function public.appliquer_modele_role_predefini_interne(p_entreprise_id uuid, p_modele_cle text, p_reinitialiser boolean) from public, anon, authenticated;
revoke execute on function public.notifier_permission(p_entreprise_id uuid, p_permission text, p_type text, p_titre text, p_message text, p_lien text, p_niveau text, p_ressource_type text, p_ressource_id uuid) from public, anon, authenticated;
revoke execute on function public.notifier_utilisateur(p_entreprise_id uuid, p_utilisateur_id uuid, p_type text, p_titre text, p_message text, p_lien text, p_niveau text, p_ressource_type text, p_ressource_id uuid) from public, anon, authenticated;
revoke execute on function public.snapshot_compte_facturable(p_employe_id uuid, p_motif text) from public, anon, authenticated;
revoke execute on function public.recalc_reglements_fournisseur(p_depense_id uuid) from public, anon, authenticated;
-- Appelée uniquement par boutique_finaliser_commande_payee (catégorie C ci-dessous).
revoke execute on function public.obtenir_ou_creer_fournisseur_boutique(p_entreprise_id uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- CATÉGORIE C — service_role uniquement.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Appelée uniquement par src/app/api/stripe/boutique/webhook/route.ts, via le client admin
-- (service_role) — jamais depuis un contexte utilisateur.
revoke execute on function public.boutique_finaliser_commande_payee(p_commande_id uuid, p_checkout_id text) from public, anon, authenticated;
grant execute on function public.boutique_finaliser_commande_payee(p_commande_id uuid, p_checkout_id text) to service_role;

-- Aucun appelant applicatif (ni src/, ni fonction SQL) : mute globalement TOUTES les entreprises
-- en une passe, sans paramètre de portée — signature d'une tâche planifiée (cron/scheduler),
-- jamais d'une action utilisateur. Restreinte au rôle serveur.
revoke execute on function public.appliquer_suspensions_impayes() from public, anon, authenticated;
grant execute on function public.appliquer_suspensions_impayes() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- CATÉGORIE B — authenticated uniquement.
-- Chacune contrôle déjà `auth.uid()` en interne (rejette proprement un appelant anonyme par une
-- exception explicite) : le risque n'est pas fonctionnel, il est de principe de moindre
-- privilège — `anon` n'a aucune raison de porter un EXECUTE qui échouera systématiquement.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

revoke execute on function public.creer_entreprise_bootstrap(p_nom text, p_siret text, p_adresse text, p_code_postal text, p_ville text) from public, anon;
revoke execute on function public.rejoindre_entreprise_par_code(p_code text) from public, anon;
revoke execute on function public.plateforme_quitter_entreprise() from public, anon;

-- SECURITY INVOKER (pas DEFINER) : les écritures qu'elle exécute (UPDATE sur factures/
-- lignes_factures) sont déjà bloquées pour `anon` par les policies RLS de ces deux tables
-- (`role_gestion_update`, portée à `{authenticated}` seulement — vérifié). Revoquée ici quand
-- même : le principe de moindre privilège ne se satisfait pas d'un filet RLS, l'EXECUTE lui-même
-- n'a aucune raison d'exister pour un appelant anonyme.
revoke execute on function public.modifier_facture_brouillon(p_facture_id uuid, p_facture jsonb, p_lignes jsonb) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- DEFAULT PRIVILEGES — referme la source du défaut pour toute future fonction créée par
-- `postgres` (rôle réel de migration Production, cli_login_postgres). La 20260911000297 avait
-- déjà fermé authenticated/service_role ; anon ne l'avait jamais été.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter default privileges for role postgres in schema public revoke execute on functions from anon;

commit;
