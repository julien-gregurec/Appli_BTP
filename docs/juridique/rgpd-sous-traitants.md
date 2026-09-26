# Registre des sous-traitants

_Document interne — Article 28 du RGPD — Dernière mise à jour : 24/08/2026_

Liste des sous-traitants auxquels l'Éditeur recourt pour fournir le Service. Chacun présente des garanties suffisantes (mesures techniques et organisationnelles) et est lié par un accord de traitement (DPA).

| Sous-traitant | Prestation | Données concernées | Localisation hébergement | Transfert hors UE | Garanties | DPA |
|---|---|---|---|---|---|---|
| **Supabase, Inc.** | Base de données, stockage de fichiers (photos, documents), authentification | Toutes les données du Service | Union européenne — Paris (`eu-west-3`), confirmé en Production | Possible (société US) | Clauses contractuelles types | https://supabase.com/legal/dpa |
| **Vercel, Inc.** | Hébergement et exécution de l'application | Données transitant par l'application, journaux techniques | Fonctions serveur exécutées en région Francfort (`fra1`, UE) ; société US | Oui | CCT / Data Privacy Framework | https://vercel.com/legal/dpa |
| **Stripe Payments Europe, Ltd.** | Paiement et facturation des abonnements | Coordonnées de facturation, données de paiement | Irlande (UE) | Non (UE) | Conforme RGPD | https://stripe.com/legal/dpa |
| **Brevo (Sendinblue SAS)** | Envoi d'e-mails transactionnels (confirmation de compte, devis, factures, relances) | E-mail, nom, contenu des documents envoyés | France (UE) | Non (société française) | Conforme RGPD | https://www.brevo.com/fr/legal/termsofuse/ |
| **Sentry (Functional Software, Inc.)** | Surveillance des erreurs applicatives | Traces d'erreurs techniques ; `sendDefaultPii` désactivé dans le code, aucune donnée personnelle envoyée volontairement | À confirmer selon la région du projet Sentry configuré | Possible (société US) | Clauses contractuelles types | https://sentry.io/legal/dpa/ |
| **OpenAI, L.L.C.** | Assistant IA et préparation assistée de devis (API standard, aucune configuration de résidence UE constatée dans le code) | Données métier strictement nécessaires pour répondre à la demande de l'utilisateur (ex. contenu d'un devis, données de planning) — aucun historique de conversation n'est persisté côté serveur ELSATIA : l'historique affiché à l'écran vit uniquement en mémoire du navigateur (état React), perdu au rechargement ; `journal_ia` ne conserve que des métriques d'usage (jetons, coût, statut), jamais le contenu échangé. Côté OpenAI, les appels Responses API sont configurés avec `store: false` (`src/lib/ai/providers/openai.ts`) : l'objet Response n'est pas conservé pour récupération ultérieure — une désactivation applicative du stockage, **distincte** du programme Zero Data Retention (ZDR) d'OpenAI, auquel ELSATIA n'est pas inscrit. Indépendamment de `store`, OpenAI conserve par ailleurs des journaux de modération/abus jusqu'à 30 jours par défaut (mécanisme propre à OpenAI, non désactivable par ce paramètre). | États-Unis (traitement API standard, pas de résidence de données UE configurée) | Possible (société US) | Conditions d'utilisation API OpenAI — DPA intégré automatiquement au OpenAI Services Agreement (OpenAI Ireland Ltd. pour un client EEE), aucune signature séparée requise pour un usage API standard | https://openai.com/policies/data-processing-addendum/ |

## À faire

- [x] **Vérifier le DPA de chaque sous-traitant listé ci-dessus.** Supabase, Vercel, Stripe et Brevo : DPA intégré automatiquement à leurs conditions respectives, aucune action requise. Sentry : DPA v5.1.0 accepté manuellement le 05/09/2026 (Org Settings → Legal & Compliance). OpenAI : DPA intégré automatiquement au Services Agreement, aucune signature séparée requise pour l'usage API standard (confirmé par lecture directe du DPA officiel, `ELSATIA-OPENAI-CONTRACT-DPA-READINESS-V1`) ; persistance applicative désactivée côté ELSATIA via `store: false` (`ELSATIA-OPENAI-DATA-RETENTION-CLOSURE-V1`).
- [ ] **Confirmer la région du projet Sentry** (viser l'UE si disponible sur le plan utilisé).
- [ ] Réévaluer ce registre à chaque ajout d'un nouveau prestataire, et avant toute activation de la Boutique ou de Powens (non actifs à ce jour).

## Information des clients

Conformément à l'article 28 du RGPD, l'Éditeur informe ses clients de tout changement de sous-traitant afin de leur permettre, le cas échéant, de formuler des objections.
