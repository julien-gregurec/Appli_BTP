# Matrice des e-mails — ELSATIA Gestion Pro

Inventaire de tous les e-mails que le produit peut envoyer, avant commercialisation.

Deux acheminements distincts, à ne pas confondre :

- **Supabase Auth** — e-mails d'authentification, gabarits dans `supabase/templates/`, expédition par le SMTP configuré au niveau du projet Supabase.
- **Brevo** — e-mails métier, via `envoyerEmailBrevo` (`src/lib/brevo.ts`). Actif seulement si `BREVO_API_KEY` **et** `EMAIL_FROM_ADDRESS` sont définis ; sinon chaque appelant dégrade proprement.

Et deux directions, elles aussi distinctes :

- **ELSATIA → entreprise cliente** (abonnement, authentification) ;
- **entreprise cliente → ses propres clients/fournisseurs** (devis, factures, relances) — ELSATIA n'est ici qu'un transporteur.

---

## Matrice

| Type | Existe | Testé | Déclencheur | Acheminement | Direction | Statut |
|---|---|---|---|---|---|---|
| **Bienvenue** | ⚠️ partiel | — | Inscription (`signUp`) | — | ELSATIA → client | **Pas d'e-mail de bienvenue dédié.** La confirmation d'adresse en tient lieu. Gap produit assumé. |
| **Vérification d'adresse** | ✅ | ⚠️ gabarit non testé automatiquement | `signUp` | Supabase Auth — `supabase/templates/confirm_signup.html` | ELSATIA → client | Sujet : « Confirmez votre adresse email ». Aux couleurs ELSATIA. |
| **Récupération de mot de passe** | ✅ | ✅ `plateforme-auth.test.ts`, `auth.test.ts` (déclenchement + URL de callback) | `/mot-de-passe-oublie`, ou action plateforme | Supabase Auth — `supabase/templates/reset_password.html` | ELSATIA → client | L'action plateforme exige un motif et est journalisée. |
| **Changement de mot de passe effectué** | ❌ | — | — | — | — | Gabarit Supabase disponible mais **non activé**. Gap sécurité mineur. |
| **Invitation d'un collaborateur** | ❌ | — | — | — | — | Gabarit `invite` **non activé** ; l'invitation est traitée en interne à l'application. |
| **Devis** | ✅ | ✅ `email.test.ts`, `documents-envoi.test.ts` | Envoi manuel depuis la fiche devis | Brevo | Client → son client | PDF joint (< 8 Mo) + lien de partage sécurisé. |
| **Facture / avoir** | ✅ | ✅ idem | Envoi manuel depuis la fiche facture | Brevo | Client → son client | Un avoir n'est jamais nommé « facture ». |
| **Bon de commande fournisseur** | ✅ | ✅ `email.test.ts` | Fiche commande | `mailto:` (contenu préparé) | Client → fournisseur | Pas d'envoi automatisé. |
| **Relance impayé (manuelle)** | ✅ | ❌ pas de test dédié | Action depuis `/crm` | Brevo | Client → son client | Statut de la relance mis à jour après envoi. Le contenu est saisi par l'utilisateur. |
| **Relance impayé (automatique)** | ✅ | ✅ `relances-moteur.test.ts` | Tâche planifiée, si `FEATURE_RELANCES_AUTO_ENABLED` | Brevo | Client → son client | Porte d'activation **indépendante** des autres tâches planifiées. |
| **Abonnement — souscription / changement** | ❌ | — | — | — | — | Aucune notification. Stripe envoie ses propres reçus si configuré. |
| **Paiement réussi** | ❌ | — | `invoice.paid` | — | — | Traité en base, **aucun e-mail ELSATIA**. Le reçu Stripe fait foi. |
| **Paiement échoué** | ✅ | ✅ `email-abonnement.test.ts`, `abonnement-notifications.test.ts`, `route.test.ts` | Webhook `invoice.payment_failed` | Brevo | ELSATIA → client | Voir §détail ci-dessous. |
| **Fin d'essai / échéance proche** | ❌ | — | — | — | — | Affiché dans l'application (bandeau), jamais par e-mail. |
| **Suspension pour impayé** | ❌ | — | Action plateforme *Signaler l'impayé* | — | — | Affiché dans l'application uniquement. |
| **Support — réponse de l'équipe** | ✅ | ✅ `email-support.test.ts`, `support-notifications.test.ts`, `support.test.ts`, `support_reply_notification_recipient_v1.test.sql` | Réponse d'un opérateur depuis `/plateforme/support` | Brevo | ELSATIA → client | Voir §détail ci-dessous. Le fil in-app reste le canal de conversation ; l'e-mail n'est qu'une notification. |
| **Alertes de délégation** | ❌ (in-app) | ✅ `alertes-delegation.test.ts` | Délégation d'une alerte | — | Interne au client | **Notification in-app uniquement** (`notifications_utilisateurs`), aucun envoi Brevo. |

## Détail — e-mail « paiement échoué »

- **Déclencheur** : `invoice.payment_failed` sur `/api/stripe/abonnement/webhook`, après la mise à jour du statut (`suspendu`) et l'enregistrement de la facture.
- **Destinataire** : `customer_email` de la facture Stripe, c'est-à-dire le contact de facturation que Stripe connaît déjà. **Aucune adresse n'est reconstruite côté ELSATIA** (la table `entreprises` ne porte pas d'adresse e-mail).
- **Contenu** : entreprise, offre et périodicité, numéro de facture, montant TTC, date, statut, lien de régularisation (`hosted_invoice_url` reçu de Stripe), contact support (`SUPPORT_EMAIL`).
- **Ce que l'e-mail ne contient jamais** : aucune donnée bancaire, aucun motif d'échec brut, **aucun délai de suspension** — la politique de relance n'est pas figée et Stripe pilote ses propres relances. Un test le vérifie explicitement.
- **Robustesse** : envoi **best-effort strict**. Une panne Brevo, une absence de configuration ou un destinataire manquant n'échouent jamais le webhook — sinon Stripe re-livrerait l'évènement et le client recevrait un doublon. L'idempotence du webhook garantit un seul envoi par évènement.
- **Journalisation** : en cas d'échec d'envoi, une catégorie est journalisée **sans l'adresse du destinataire**.

## Détail — e-mail « réponse du support »

- **Déclencheur** : réponse d'un opérateur dans le fil in-app (`plateforme_support_repondre`), après enregistrement de la réponse. Un appel = une réponse insérée = au plus un e-mail.
- **Destinataire** : résolu par la RPC `plateforme_support_destinataire_reponse` (migration `20260906000267`), sous les mêmes gardes que la réponse elle-même — rôle plateforme `total`/`support`, session AAL2, session support explicite sur cette entreprise. C'est **l'auteur du dernier message côté entreprise**, et lui seul. **Aucune adresse n'est reconstruite** : si l'auteur n'est plus membre actif de l'entreprise ou n'a pas d'adresse confirmée, la RPC ne renvoie aucune ligne et aucun e-mail ne part.
- **Contenu** : salutation nominative, référence de fil (`SUP-XXXXXXXX`, préfixe de l'`entreprise_id`), nom de l'entreprise, première ligne de la demande, **extrait de la réponse limité à 240 caractères**, bouton vers l'espace d'aide (`/aide`, origine publique officielle uniquement) et adresse `SUPPORT_EMAIL` en `replyTo`.
- **Ce que l'e-mail ne contient jamais** : ni la réponse complète, ni l'historique du fil, ni de note interne (le fil n'en comporte pas). Tout contenu opérateur ou client est échappé côté HTML — contrairement aux e-mails abonnement, ces valeurs sont saisies par des humains et ne sont pas de confiance.
- **Robustesse** : envoi **best-effort strict**. Brevo non configuré, destinataire absent, panne d'envoi ou préparation impossible ne remettent jamais en cause la réponse déjà enregistrée.
- **Journalisation** : catégories `destinataire_illisible`, `destinataire_absent`, `envoi_impossible`, `preparation_impossible` — **jamais l'adresse du destinataire ni le contenu du fil**.

## Gaps ouverts, par ordre d'importance

1. **Aucun e-mail de bienvenue / d'accompagnement à la souscription.**
2. **Aucune notification d'échéance ou de fin d'essai** par e-mail.
3. **Aucune notification de changement de mot de passe** (gabarit Supabase disponible, non activé).
4. **Gabarits Supabase Auth non couverts par un test automatique** — leur rendu n'est vérifié que manuellement.

Aucun de ces gaps n'est bloquant pour un premier client payant.

*Refermé depuis* : la réponse du support est désormais notifiée par e-mail (ELSATIA-GP-SUPPORT-REPLY-EMAIL-P1, migration `20260906000267`). C'était le gap le plus visible ; il ne figure plus dans cette liste.

## Prérequis d'exploitation

| Variable | Rôle | Sans elle |
|---|---|---|
| `BREVO_API_KEY` | Clé API Brevo | Tous les e-mails métier sont désactivés, proprement |
| `EMAIL_FROM_ADDRESS` | Expéditeur | Idem |
| `EMAIL_FROM_NAME` | Nom affiché | Défaut : `ELSATIA` |
| `SUPPORT_EMAIL` | Contact support et `replyTo` | Le paragraphe support est générique, sans adresse |
| SMTP du projet Supabase | E-mails d'authentification | Inscription et réinitialisation inopérantes |

**À vérifier avant la mise en service** : que l'adresse expéditrice soit authentifiée (SPF/DKIM) sur le domaine `elsatia.fr`, faute de quoi les e-mails partiront en indésirables.
