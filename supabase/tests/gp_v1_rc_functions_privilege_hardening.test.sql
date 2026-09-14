-- GP_V1_RC — suite de sécurité dédiée (20260914000298_gp_v1_rc_functions_privilege_hardening).
--
-- Garde de non-régression : échoue si l'une des 22 fonctions durcies redevient exécutable par
-- anon/PUBLIC, ou si une future migration ajoute une fonction SECURITY DEFINER sans search_path
-- explicite (condition nécessaire, pas suffisante, à un search_path sûr — voir § 15 de l'audit).

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- ───────── Catégorie D : aucun accès client (ni PUBLIC, ni anon, ni authenticated) ─────────
select ok(not has_function_privilege('anon', 'public.recalc_totaux_devis(uuid)', 'EXECUTE'), 'recalc_totaux_devis : anon sans EXECUTE');
select ok(not has_function_privilege('authenticated', 'public.recalc_totaux_devis(uuid)', 'EXECUTE'), 'recalc_totaux_devis : authenticated sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.recalc_totaux_commande(uuid)', 'EXECUTE'), 'recalc_totaux_commande : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.recalc_paiements_facture(uuid)', 'EXECUTE'), 'recalc_paiements_facture : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.recalculer_dossier_paie(uuid)', 'EXECUTE'), 'recalculer_dossier_paie : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.recomputer_statut_commande(uuid)', 'EXECUTE'), 'recomputer_statut_commande : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.synchroniser_taches_devis_accepte(uuid)', 'EXECUTE'), 'synchroniser_taches_devis_accepte : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.controler_periode_paie_interne(uuid)', 'EXECUTE'), 'controler_periode_paie_interne : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.synchroniser_periode_paie_interne(uuid)', 'EXECUTE'), 'synchroniser_periode_paie_interne : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.creer_commande_fournisseur_interne(uuid,jsonb,jsonb)', 'EXECUTE'), 'creer_commande_fournisseur_interne : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.enregistrer_reception_commande_interne(uuid,uuid,jsonb)', 'EXECUTE'), 'enregistrer_reception_commande_interne : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.appliquer_modele_role_predefini_interne(uuid,text,boolean)', 'EXECUTE'), 'appliquer_modele_role_predefini_interne : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.notifier_permission(uuid,text,text,text,text,text,text,text,uuid)', 'EXECUTE'), 'notifier_permission : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.notifier_utilisateur(uuid,uuid,text,text,text,text,text,text,uuid)', 'EXECUTE'), 'notifier_utilisateur : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.snapshot_compte_facturable(uuid,text)', 'EXECUTE'), 'snapshot_compte_facturable : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.recalc_reglements_fournisseur(uuid)', 'EXECUTE'), 'recalc_reglements_fournisseur : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.obtenir_ou_creer_fournisseur_boutique(uuid)', 'EXECUTE'), 'obtenir_ou_creer_fournisseur_boutique : anon sans EXECUTE');

-- ───────── Catégorie C : service_role uniquement ─────────
select ok(not has_function_privilege('anon', 'public.boutique_finaliser_commande_payee(uuid,text)', 'EXECUTE'), 'boutique_finaliser_commande_payee : anon sans EXECUTE');
select ok(not has_function_privilege('authenticated', 'public.boutique_finaliser_commande_payee(uuid,text)', 'EXECUTE'), 'boutique_finaliser_commande_payee : authenticated sans EXECUTE');
select ok(has_function_privilege('service_role', 'public.boutique_finaliser_commande_payee(uuid,text)', 'EXECUTE'), 'boutique_finaliser_commande_payee : service_role garde EXECUTE');
select ok(not has_function_privilege('anon', 'public.appliquer_suspensions_impayes()', 'EXECUTE'), 'appliquer_suspensions_impayes : anon sans EXECUTE');
select ok(has_function_privilege('service_role', 'public.appliquer_suspensions_impayes()', 'EXECUTE'), 'appliquer_suspensions_impayes : service_role garde EXECUTE');

-- ───────── Catégorie B : authenticated seulement (garde interne auth.uid() déjà vérifiée) ─────
select ok(not has_function_privilege('anon', 'public.creer_entreprise_bootstrap(text,text,text,text,text)', 'EXECUTE'), 'creer_entreprise_bootstrap : anon sans EXECUTE');
select ok(has_function_privilege('authenticated', 'public.creer_entreprise_bootstrap(text,text,text,text,text)', 'EXECUTE'), 'creer_entreprise_bootstrap : authenticated garde EXECUTE');
select ok(not has_function_privilege('anon', 'public.rejoindre_entreprise_par_code(text)', 'EXECUTE'), 'rejoindre_entreprise_par_code : anon sans EXECUTE');
select ok(not has_function_privilege('anon', 'public.plateforme_quitter_entreprise()', 'EXECUTE'), 'plateforme_quitter_entreprise : anon sans EXECUTE');

-- SECURITY INVOKER, protégée par RLS ET par le retrait direct d'EXECUTE (défense en profondeur).
select ok(not has_function_privilege('anon', 'public.modifier_facture_brouillon(uuid,jsonb,jsonb)', 'EXECUTE'), 'modifier_facture_brouillon : anon sans EXECUTE');
select ok(has_function_privilege('authenticated', 'public.modifier_facture_brouillon(uuid,jsonb,jsonb)', 'EXECUTE'), 'modifier_facture_brouillon : authenticated garde EXECUTE');

-- ───────── Garde générale : aucun search_path manquant sur les fonctions SECURITY DEFINER ─────
select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
      )
  ),
  0,
  'Aucune fonction SECURITY DEFINER (hors trigger) sans search_path explicite'
);

select * from finish();
rollback;
