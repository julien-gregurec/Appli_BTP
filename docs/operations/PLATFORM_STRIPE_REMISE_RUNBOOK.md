# Remises Stripe plateforme — sécurité et réconciliation

## Ordre obligatoire

1. Créer le client Supabase serveur à partir de la session appelante.
2. Appeler `plateforme_preautoriser_effet_externe(entreprise_id, operation)`.
3. Arrêter si l'identité, le rôle `total`/`facturation`, AAL2, l'opération ou la cible est refusé.
4. Générer un identifiant de tentative serveur, puis appeler Stripe avec une clé d'idempotence
   stable pendant toute cette tentative et ses retries réseau.
5. Appeler la mutation SQL officielle, qui revalide rôle et AAL2 puis écrit l'audit exhaustif.

`estPlateformeAdmin()` est un garde d'interface, jamais une autorisation suffisante. Le mode
local sans comptes personnels n'autorise pas les remises Stripe.

## Limite transactionnelle

Une transaction PostgreSQL ne couvre jamais Stripe. Si Stripe réussit puis que la mutation SQL
échoue, l'action tente de restaurer le coupon antérieur, ou de retirer le nouveau coupon si
aucune remise n'existait. Elle enregistre ensuite `echec_synchronisation_remise` dans le domaine
`tarification`, avec seulement l'opération et le résultat de compensation. Aucun message Stripe,
jeton, secret ou clé n'est journalisé.

Une nouvelle action utilisateur reçoit une nouvelle tentative : elle ne réutilise pas une clé
ayant précédé une compensation. L'application d'un coupon remplace la remise active côté Stripe
et ne cumule donc pas deux remises sur la souscription. La clé reste identique pour tous les
retries HTTP effectués à l'intérieur de la même action serveur.

## Réconciliation manuelle

1. Exiger une session plateforme AAL2 au rôle `total` ou `facturation`.
2. Identifier l'entreprise et l'événement sans copier de secret.
3. Comparer l'identifiant de coupon local à l'état de la souscription Stripe depuis un outil
   administrateur autorisé.
4. Si `compensation_reussie=true`, confirmer que les deux états sont revenus à l'état antérieur.
5. Si elle vaut `false`, décider explicitement si Stripe ou la base doit être la référence, puis
   rejouer une unique action idempotente. Ne jamais corriger la table directement.
6. Conserver la trace initiale et documenter séparément la résolution.

## Historique et confidentialité

L'historique global exige AAL2. `total` voit tous les domaines ; `facturation` seulement
`facturation` et `tarification` ; `support` seulement `support` ; `lecture` n'y accède pas. Le
résumé client de `historique_tarification` ne contient jamais le motif interne.

## Inventaire des effets externes relu dans ce lot

- `appliquerRemiseAction` et `retirerRemiseAction` : corrigés ; préautorisation SQL avant Stripe,
  mutation locale officielle, compensation et trace de réconciliation.
- Réinitialisation de mot de passe plateforme : la RPC de vérification/journalisation AAL2 et
  session support précède déjà l'envoi Supabase Auth.
- Actions d'abonnement client, Stripe Connect, boutique et paiement de facture : autorisation
  tenant issue du contexte serveur/RLS avant l'effet ; hors périmètre de la matrice plateforme.
- Relances Brevo : contrôles métier et tenant avant envoi ; hors périmètre des remises.
- Webhooks, crons et synchronisations service-role : entrées techniques authentifiées selon leur
  contrat propre ; aucune n'est rendue appelable par la nouvelle RPC.

Cet inventaire n'autorise aucun élargissement service-role. Toute nouvelle action plateforme
avec effet externe doit réutiliser une préautorisation à opération fermée avant cet effet.
