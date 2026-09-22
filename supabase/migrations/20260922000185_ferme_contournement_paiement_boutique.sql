-- Ferme un contournement de paiement réel sur boutique_finaliser_commande_payee, et une
-- écriture cross-tenant sur obtenir_ou_creer_fournisseur_boutique.
--
-- VÉRIFIÉ SUR LE SQL ACTUEL DE CETTE BRANCHE (pas rapporté par un tiers) :
--
-- `boutique_finaliser_commande_payee(p_commande_id uuid, p_checkout_id text)` est
-- `security definer` (dernière définition : 20260724000176_correction_reglement_boutique_tresorerie.sql).
-- Elle ne vérifie que la correspondance `(id, stripe_checkout_id)` sur `boutique_commandes` —
-- jamais l'identité de l'appelant, ni un état de paiement Stripe réel — puis marque la commande
-- `'payee'`, décrémente le stock et crée une dépense fournisseur déjà réglée
-- (`depenses_fournisseurs`/`reglements_fournisseurs`). Dans tout le code applicatif, elle n'est
-- appelée que par `src/app/api/stripe/boutique/webhook/route.ts`, via le client
-- `service_role` (`createAdminClient()`, `src/lib/supabase/admin.ts`), après vérification de la
-- signature Stripe (`verifierSignatureStripe`) et du `payment_status` réel de l'événement — donc
-- jamais depuis un contexte utilisateur. Elle est pourtant accordée à `authenticated` depuis sa
-- création (`20260724000145_boutique_commandes.sql`, confirmée à chaque redéfinition ultérieure
-- jusqu'à `20260724000176`). Un utilisateur authentifié quelconque connaît déjà, pour SA PROPRE
-- commande, `p_commande_id` (la ligne qu'il vient de créer) et `p_checkout_id` (`session.id`,
-- renvoyé et stocké sur sa commande par `creerSessionCheckoutBoutique()` AVANT tout paiement réel
-- — `src/app/actions/boutique.ts`) : il peut donc appeler cette RPC lui-même, sans jamais payer
-- sur Stripe, pour obtenir sa commande gratuitement avec une trace comptable déjà « réglée ».
-- C'est une élévation de privilège / contournement de paiement réel, sur du code qui existe
-- aujourd'hui sur cette branche.
--
-- `obtenir_ou_creer_fournisseur_boutique(p_entreprise_id uuid)` est également `security
-- definer` (`20260724000175_liaison_boutique_tresorerie.sql`) et ne vérifie aucune appartenance
-- de l'appelant à l'entreprise passée en argument. Dans tout le code applicatif, elle n'est
-- appelée que depuis `boutique_finaliser_commande_payee` elle-même (appel SQL interne : une
-- fonction `security definer` appelée depuis une autre s'exécute avec les privilèges du
-- propriétaire de la fonction appelante, `postgres` — elle n'a besoin d'aucun `EXECUTE` propre
-- pour cet usage). Elle est pourtant elle aussi accordée à `authenticated`
-- (`20260724000175`) : un utilisateur authentifié quelconque peut l'appeler directement avec
-- l'`entreprise_id` de son choix pour créer une fiche fournisseur « Liria (boutique) » dans une
-- entreprise tierce (écriture cross-tenant, portée limitée mais réelle).
--
-- ORIGINE DU CANDIDAT : identifié en classifiant `integration/gp-external-pilot-closure-v1`
-- (commit `8caef21`, migration `20260914000298_gp_v1_rc_functions_privilege_hardening.sql`,
-- catégories C et D — 22 fonctions durcies au total sur cette branche). Ce commit décrit un
-- mécanisme différent (grant EXECUTE par défaut à `anon` via `pg_default_acl`, jamais fermé par
-- les migrations `20260902000255`/`20260911000297` propres à cette autre lignée, absentes de
-- `main`) : ce mécanisme-là NE S'APPLIQUE PAS ici, cette branche ferme déjà l'EXECUTE par défaut
-- à `anon` de façon rétroactive et pour l'avenir depuis `20260714000078_fermeture_acces_anonyme_production.sql`
-- (`revoke execute on all functions in schema public from anon` + balayage explicite de toutes
-- les fonctions `security definer` existantes + `alter default privileges ... revoke execute on
-- functions from anon`), et chacune des 22 fonctions listées par `8caef21` a été revérifiée
-- individuellement ici : 20 d'entre elles portent déjà, dans la migration même qui les crée (ou
-- une migration de correction ultérieure), un `revoke all ... from public, anon, authenticated`
-- explicite (ou étaient déjà couvertes par le balayage rétroactif de `20260714000078` pour
-- celles créées avant) — rien à porter pour ces 20-là. Sur les 2 restantes, l'audit contre le
-- SQL actuel de cette branche a trouvé un gap RÉEL mais DIFFÉRENT de celui décrit par `8caef21` :
-- non pas un défaut par omission, mais un `grant execute ... to authenticated` explicite et
-- délibéré, jamais retiré. C'est ce gap-là, vérifié indépendamment contre le code applicatif
-- (`src/app/api/stripe/boutique/webhook/route.ts`, `src/app/actions/boutique.ts`,
-- `src/lib/supabase/admin.ts` — aucun appel authentifié direct de ces deux RPC nulle part dans
-- `src/`), que corrige cette migration. Voir le rapport de qualification (§11bis) pour le détail
-- fonction-par-fonction des 22 fonctions de `8caef21` et pourquoi 20 d'entre elles n'ont pas été
-- portées.
--
-- Additif, minimal : ne touche ni le corps ni la signature des deux fonctions, uniquement leurs
-- privilèges EXECUTE.

begin;

revoke execute on function public.boutique_finaliser_commande_payee(uuid, text) from public, anon, authenticated;
grant execute on function public.boutique_finaliser_commande_payee(uuid, text) to service_role;

revoke execute on function public.obtenir_ou_creer_fournisseur_boutique(uuid) from public, anon, authenticated;

commit;
