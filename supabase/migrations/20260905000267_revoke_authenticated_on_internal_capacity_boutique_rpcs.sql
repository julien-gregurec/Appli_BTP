-- Ferme 7 fuites cross-tenant/écritures non autorisées trouvées par l'audit de
-- systémicité qui a suivi le correctif de module_gestion_pro_actif_entreprise
-- (20260905000266) : ces 7 fonctions SECURITY DEFINER prennent un
-- p_entreprise_id, avaient EXECUTE accordé à "authenticated", et ne
-- vérifiaient aucune appartenance de l'appelant à cette entreprise.
--
-- Contrairement à module_gestion_pro_actif_entreprise, AUCUNE de ces 7
-- fonctions n'a d'usage légitime d'appel direct par "authenticated" — vérifié
-- par grep exhaustif de l'application (src/, apps/) et de la suite pgTAP
-- (toutes les références existantes s'exécutent avant tout SET ROLE
-- authenticated dans leurs fichiers de test, donc en tant que superuser).
-- Le correctif minimal, conforme au modèle réel de chacune, est donc un
-- simple retrait du GRANT EXECUTE à "authenticated" — sans toucher au corps
-- des fonctions ni les rendre "JWT-aware" — laissant leur appelant interne
-- gardé (SECURITY DEFINER, s'exécute sous les privilèges du propriétaire,
-- donc jamais bloqué par ce retrait) les invoquer normalement.
--
-- Modèle 1 — "brique interne" d'un wrapper déjà gardé
-- (capacite_personnes_entreprise() vérifie est_membre_actif()/est_plateforme_admin()
-- avant d'appeler les 4 fonctions suivantes) :
revoke execute on function public.capacite_personnes_base(uuid) from authenticated;
revoke execute on function public.capacite_personnes_totale(uuid) from authenticated;
revoke execute on function public.compter_personnes_actives_entreprise(uuid) from authenticated;
revoke execute on function public.etat_capacite_personnes(uuid) from authenticated;

-- Modèle 2 — "service_role uniquement" : fonctions nommées "_service",
-- appelées en pratique exclusivement via le client service_role
-- (src/lib/stripe-capacite-reconcile.ts, deps.admin.rpc(...)/admin.rpc(...)) ;
-- le GRANT à "authenticated" était superflu/obsolète (justifié dans une
-- migration antérieure par un chemin d'appel serveur qui n'existe pas dans le
-- code actuel). service_role conserve son accès.
revoke execute on function public.appliquer_baisse_capacite_planifiee_service(uuid) from authenticated;
revoke execute on function public.capacite_stripe_avancer_marqueur_evenement(uuid, timestamptz) from authenticated;

-- Modèle 3 — "brique interne" d'un appelant gardé par un secret plutôt qu'une
-- appartenance : obtenir_ou_creer_fournisseur_boutique() n'est appelée en
-- application que par boutique_finaliser_commande_payee() (elle-même
-- accessible uniquement via service_role, gardée par un p_checkout_id Stripe
-- non devinable) ; aucun appel direct authenticated légitime.
revoke execute on function public.obtenir_ou_creer_fournisseur_boutique(uuid) from authenticated;
