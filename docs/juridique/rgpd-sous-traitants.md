# Registre des sous-traitants

_Document interne — Article 28 du RGPD — Dernière mise à jour : 28/09/2026_

<!-- LEGAL_REVIEW_REQUIRED: document à faire relire par un professionnel du droit avant le 01/10/2026. -->


Liste des sous-traitants auxquels l'Éditeur recourt pour fournir le Service. Chacun présente des garanties suffisantes (mesures techniques et organisationnelles) et est lié par un accord de traitement (DPA).

| Sous-traitant | Prestation | Données concernées | Localisation hébergement | Transfert hors UE | Garanties | DPA |
|---|---|---|---|---|---|---|
| **Supabase, Inc.** | Base de données, stockage de fichiers (photos, documents), authentification | Toutes les données du Service | UE visée — **à confirmer** dans la console Supabase | Possible (société US) | Clauses contractuelles types | https://supabase.com/legal/dpa |
| **Vercel, Inc.** | Hébergement et exécution de l'application | Données transitant par l'application, journaux | UE / US | Oui | CCT / Data Privacy Framework | https://vercel.com/legal/dpa |
| **Stripe Payments Europe, Ltd.** | Paiement et facturation des abonnements | Coordonnées de facturation, données de paiement | Irlande (UE) | Non (UE) | Conforme RGPD | https://stripe.com/legal/dpa |
| Prestataire e-mail transactionnel — **non activé** | Envoi d'e-mails transactionnels | E-mail, nom, contenu des notifications | À déterminer | Selon prestataire | CCT | LEGAL_REVIEW_REQUIRED |
| Twilio — **uniquement si SMS activés** | Envoi de SMS | Téléphone, contenu du message | US | Oui | CCT | LEGAL_REVIEW_REQUIRED |
| Google — **uniquement si OCR Document AI activé** | Reconnaissance de texte sur justificatifs | Images de factures/justificatifs | UE (région configurable) | Selon région | CCT / DPF | LEGAL_REVIEW_REQUIRED |
| OpenAI — **si l'assistant IA est activé** | Assistant IA, analyse de documents | Contenu des requêtes, documents soumis à l'analyse | LEGAL_REVIEW_REQUIRED | Oui (société US) | LEGAL_REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| Sentry — **si le DSN est configuré** | Supervision des erreurs | Journaux d'erreur, données techniques | LEGAL_REVIEW_REQUIRED | Possible | LEGAL_REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |
| Powens — **si les paiements bancaires sont activés** | Initiation de virements | Coordonnées bancaires des bénéficiaires, montants | LEGAL_REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED | LEGAL_REVIEW_REQUIRED |

## À faire

- [ ] **Vérifier et signer/accepter le DPA** de chaque sous-traitant réellement activé.
- [ ] **Confirmer la région d'hébergement Supabase** (viser l'UE — Paris/Francfort/Irlande).
- [ ] Retirer de ce tableau les prestataires non utilisés (SMS, OCR) tant qu'ils ne sont pas activés.
- [ ] Réévaluer ce registre à chaque ajout d'un nouveau prestataire.

## Information des clients

Conformément à l'article 28 du RGPD, l'Éditeur informe ses clients de tout changement de sous-traitant afin de leur permettre, le cas échéant, de formuler des objections.
