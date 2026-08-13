# Registre des sous-traitants

_Document interne — Article 28 du RGPD — Dernière mise à jour : [JJ/MM/AAAA]_

Liste des sous-traitants auxquels l'Éditeur recourt pour fournir le Service. Chacun présente des garanties suffisantes (mesures techniques et organisationnelles) et est lié par un accord de traitement (DPA).

| Sous-traitant | Prestation | Données concernées | Localisation hébergement | Transfert hors UE | Garanties | DPA |
|---|---|---|---|---|---|---|
| **Supabase, Inc.** | Base de données, stockage de fichiers (photos, documents), authentification | Toutes les données du Service | Union européenne — Paris (`eu-west-3`), confirmé en Production | Possible (société US) | Clauses contractuelles types | https://supabase.com/legal/dpa |
| **Vercel, Inc.** | Hébergement et exécution de l'application | Données transitant par l'application, journaux techniques | Fonctions serveur exécutées en région Francfort (`fra1`, UE) ; société US | Oui | CCT / Data Privacy Framework | https://vercel.com/legal/dpa |
| **Stripe Payments Europe, Ltd.** | Paiement et facturation des abonnements | Coordonnées de facturation, données de paiement | Irlande (UE) | Non (UE) | Conforme RGPD | https://stripe.com/legal/dpa |
| **Brevo (Sendinblue SAS)** | Envoi d'e-mails transactionnels (confirmation de compte, devis, factures, relances) | E-mail, nom, contenu des documents envoyés | France (UE) | Non (société française) | Conforme RGPD | https://www.brevo.com/fr/legal/termsofuse/ |
| **Sentry (Functional Software, Inc.)** | Surveillance des erreurs applicatives | Traces d'erreurs techniques ; `sendDefaultPii` désactivé dans le code, aucune donnée personnelle envoyée volontairement | À confirmer selon la région du projet Sentry configuré | Possible (société US) | Clauses contractuelles types | https://sentry.io/legal/dpa/ |

## À faire

- [ ] **Vérifier et signer/accepter le DPA** de chaque sous-traitant listé ci-dessus.
- [ ] **Confirmer la région du projet Sentry** (viser l'UE si disponible sur le plan utilisé).
- [ ] Réévaluer ce registre à chaque ajout d'un nouveau prestataire, et avant toute activation de l'IA (fournisseur non listé tant qu'elle reste désactivée), de la Boutique ou de Powens.

## Information des clients

Conformément à l'article 28 du RGPD, l'Éditeur informe ses clients de tout changement de sous-traitant afin de leur permettre, le cas échéant, de formuler des objections.
