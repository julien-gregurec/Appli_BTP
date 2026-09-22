-- Le verrou for-update de enregistrer_paiement_facture (20260922000198) ne sert
-- à rien si `authenticated` peut toujours écrire directement dans `paiements`
-- par PostgREST : le socle de permissions (20260710000006_factures.sql) n'a
-- jamais explicitement restreint ce verbe, laissant en place le privilège de
-- table par défaut de la plateforme — la policy RLS "membres paiements" (for
-- all) autorise donc toujours l'INSERT direct pour tout membre actif,
-- contournant intégralement le verrou et la vérification du reste dû ajoutés
-- par la RPC.
--
-- Porté depuis integration/gp-external-pilot-closure-v1 (partie de e109954,
-- "apply independent-review findings" — un correctif que cette même lignée
-- source a apporté à sa propre migration d'idempotence après coup, en
-- repérant qu'elle laissait la porte de service ouverte).
--
-- On ferme uniquement INSERT — le seul verbe qui peut créer un encaissement
-- en double — en le réservant à la RPC enregistrer_paiement_facture (déjà
-- accordée à authenticated via son propre GRANT EXECUTE, SECURITY DEFINER
-- donc non affectée par ce REVOKE). SELECT/UPDATE/DELETE restent inchangés :
-- supprimerPaiementAction (src/app/actions/factures.ts) continue de
-- fonctionner tel quel, et le webhook Stripe (src/app/api/stripe/webhook/
-- route.ts) écrit via createAdminClient() (service_role), non affecté non
-- plus. Recherche exhaustive confirmée : seul enregistrerPaiementAction
-- écrivait dans cette table côté authenticated, déjà migré vers la RPC dans
-- le correctif précédent de cette session.
revoke insert on table public.paiements from authenticated;

notify pgrst, 'reload schema';
