# Registre des traitements RGPD — vue opérationnelle

Version simple, tabulaire, à usage interne (pilotage produit/technique). **Ce document n'a pas été validé par un juriste.** Le document juridique de référence, plus détaillé, est `docs/juridique/rgpd-registre-des-traitements.md` (article 30 RGPD) — en cas de divergence, celui-ci fait foi une fois relu par un avocat. Base légale marquée « à valider » partout : c'est une proposition technique, pas une qualification juridique définitive.

| # | Finalité | Données | Personnes concernées | Base juridique (à valider) | Durée de conservation | Destinataires | Sous-traitants | Mesures de sécurité |
|---|---|---|---|---|---|---|---|---|
| 1 | Compte et accès au Service | Identité, email, téléphone, identifiants de connexion, journaux de connexion | Représentants et utilisateurs des entreprises clientes | Exécution du contrat | Durée du contrat + 30 jours | Éditeur, hébergeurs | Supabase (Auth), Vercel | Mots de passe hachés, HTTPS, RLS par entreprise |
| 2 | Facturation de l'abonnement ELSATIA | Coordonnées de facturation, offre souscrite, historique de paiement, identifiant client Stripe | Clients (entreprises et représentants) | Exécution du contrat / obligation légale | 10 ans (obligation comptable) | Éditeur, Stripe | Stripe Payments Europe | Aucune donnée bancaire stockée par l'Éditeur (gérée par Stripe) |
| 3 | Emails transactionnels (confirmation, devis, factures, relances) | Email, nom, contenu du document envoyé | Utilisateurs et destinataires externes (clients des entreprises clientes) | Exécution du contrat | Durée du contrat / logs d'envoi selon Brevo | Éditeur, Brevo | Brevo (Sendinblue SAS) | Envoi via API authentifiée, pas de second client email |
| 4 | Données saisies par les entreprises clientes (leurs clients, chantiers, devis, factures, employés, documents, photos) | Toutes catégories saisies par le client dans l'app | Clients, salariés et prospects des entreprises clientes | Sous-traitance (l'Éditeur agit pour le compte du client) | Définie par l'entreprise cliente, responsable de traitement | Entreprise cliente elle-même, Éditeur en sous-traitant | Supabase (DB + Storage) | RLS par entreprise, isolation cross-tenant testée (P11) |
| 5 | Support client | Identité, email, contenu des échanges, pièces jointes | Utilisateurs sollicitant le support | Exécution du contrat / intérêt légitime | Durée du contrat + 1 an | Éditeur | — | Accès restreint |
| 6 | Sécurité et supervision technique (erreurs applicatives) | Traces d'erreurs techniques, adresses IP le cas échéant | Utilisateurs du Service | Intérêt légitime / obligation de sécurité | 6 à 12 mois | Éditeur | Sentry | `sendDefaultPii: false` (aucune donnée personnelle envoyée volontairement, confirmé dans le code) |
| 7 | Hébergement et exécution de l'application | Données transitant par l'application, journaux d'infrastructure | Tous utilisateurs | Exécution du contrat | Selon les politiques Supabase/Vercel | Éditeur | Supabase (`eu-west-3`, Paris), Vercel (fonctions en `fra1`, Francfort) | Chiffrement en transit, région UE confirmée en Production |
| 8 | Export et suppression des données (droits RGPD) | L'ensemble des données de l'entreprise cliente | Représentants des entreprises clientes exerçant leurs droits | Obligation légale (RGPD) | Export à la demande ; suppression différée 30 jours puis purge supervisée, sous réserve de la conservation comptable (~10 ans) | Éditeur | Supabase | Export : RPC `exporter_donnees_entreprise`, accès restreint aux utilisateurs authentifiés autorisés. Suppression : `demander_suppression_entreprise` / `annuler_suppression_entreprise`, anonymisation ciblée des employés (`anonymiser_employe`) sans effacer les données à conservation légale obligatoire (pointages, paie, comptabilité) |

## Ce que ce tableau ne remplace pas

- La qualification juridique précise de chaque base légale (« à valider » n'est pas une validation).
- La relecture par un avocat déjà budgétée dans `docs/juridique/README.md`.
- Le registre détaillé article 30, qui reste `docs/juridique/rgpd-registre-des-traitements.md`.

## Modules désactivés au lancement — non traités ici

IA, Boutique, Powens sont désactivés en Production (`FEATURE_*_ENABLED=false` ou équivalent) : aucun traitement de données ne leur est associé tant qu'ils restent inactifs. Ce registre devra être complété avant toute activation.
