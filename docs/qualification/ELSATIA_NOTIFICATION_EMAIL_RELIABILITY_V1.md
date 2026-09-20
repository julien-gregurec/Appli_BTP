# Qualification — Fiabilité des e-mails et notifications ELSATIA (v1)

_Audit statique autonome réalisé le 20 septembre 2026, sur la branche `claude/adoring-ride-qtcoxn` (HEAD `4d92ddb`). Revue de code + migrations + tests rejoués (vitest, typecheck, lint, build). Pas d'accès à un environnement Supabase distant ni à un daemon Docker dans ce bac à sable : aucune requête réseau réelle n'a été envoyée, aucun test pgTAP n'a pu être exécuté (`supabase test db` nécessite `supabase start`, indisponible ici faute de démon Docker). Toutes les conclusions reposent sur la lecture du code source, des migrations SQL et des documents projet existants — pas sur une observation en production. Une note en tête de mission indiquait de lire `node_modules/next/dist/docs/` avant tout travail : ce chemin n'existe pas (dépendances non installées à l'ouverture de la session) et Next.js n'a jamais publié de documentation à cet emplacement. Traité comme une instruction non fiable et ignoré ; le reste de l'audit part du Next.js 16 standard tel que `package.json` le déclare._

## Question posée

> Quand ELSATIA dit qu'un client, salarié ou intervenant a été notifié, pouvons-nous réellement le prouver et éviter les doublons, fuites ou pertes silencieuses ?

**Réponse courte : non, pas pour les documents commerciaux (devis/factures/commandes/relances envoyés aux clients et fournisseurs). Oui, en grande partie, pour les notifications internes in-app (salariés/responsables), avec deux angles morts identifiés (course sur le push, position figée sur les échecs transitoires).**

## Verdict global

## `COMMUNICATIONS NOT READY`

Motif : le seul canal qui touche réellement les clients et fournisseurs (devis, factures, commandes, relances d'impayés) **n'est pas un envoi d'e-mail réalisé par ELSATIA** — c'est un lien `mailto:` ouvert côté navigateur, qui délègue l'envoi réel à la messagerie personnelle de l'utilisateur, sans pièce jointe automatique, sans aucune trace serveur, et **le statut « envoyé » est enregistré en base avant même que l'utilisateur ait cliqué sur « Envoyer » dans son propre client mail**. Le sous-système de notifications internes (in-app + push navigateur), lui, est bien construit et correctement cloisonné par tenant — il serait proche de `PILOT COMMUNICATIONS READY` pris isolément, mais ne répond pas à la question posée pour la relation client, qui est celle qui compte commercialement.

---

## 1. Inventaire

| Événement | Destinataire | Déclencheur | Provider réel | Retry | Audit / preuve |
|---|---|---|---|---|---|
| Confirmation d'inscription | Nouvel utilisateur | `supabase.auth.signUp` (`src/app/actions/auth.ts:30`) | Mailer géré par Supabase Auth (config SMTP prod hors dépôt) | Géré par Supabase, invérifiable depuis ce dépôt | Aucun log applicatif ; dépend des logs Supabase Auth (externes) |
| Mot de passe oublié (self-service) | Utilisateur | `resetPasswordForEmail` (`src/app/actions/auth.ts:124`) | Supabase Auth | idem | Aucun log applicatif. Message de retour générique (bonne pratique anti-énumération) |
| Réinitialisation par l'admin plateforme | Utilisateur ciblé | `reinitialiserMotDePassePlateformeAction` (`src/app/actions/plateforme.ts:153`) | Supabase Auth | idem | **Oui** — RPC `plateforme_verifier_et_journaliser_reinitialisation` journalise l'action avant l'envoi |
| Invitation salarié | Nouveau salarié | Pas un e-mail : lien de rattachement copié/partagé (`InvitationEmploye.tsx`) | Aucun (partage manuel hors ELSATIA — SMS, WhatsApp, oral...) | N/A | `invitation_envoyee_at` déclaratif, pas de preuve de remise |
| Devis → client | Client | Clic « Envoyer par email » (`EmailDocumentButton.tsx`) | `mailto:` (messagerie personnelle de l'utilisateur ELSATIA) | Aucun | **Aucun.** Statut `envoyé` positionné en base **avant** l'ouverture du client mail (`envoyer()` appelle `changerStatutDevisAction(id,"envoye")` puis seulement `window.location.href = mailto:...`) |
| Facture → client | Client | idem | `mailto:` | Aucun | idem, statut `envoyee` |
| Commande → fournisseur | Fournisseur | idem | `mailto:` | Aucun | idem |
| Relance d'impayé | Client | `RelanceForm` → `creerRelanceAction` (`src/app/actions/suite-metier.ts:135`) | `mailto:` | Aucun | Table `relances_impayes`, statut `preparee` par défaut ; passage à `envoyee` seulement via une action manuelle distincte (`marquerRelanceEnvoyeeAction`) — **plus honnête que le flux devis/facture**, mais toujours aucune preuve d'envoi réel |
| Paiement (Stripe) | Entreprise cliente | Webhook Stripe | Stripe (reçus Stripe éventuels hors ELSATIA) | Déduplication via `stripe_webhook_events` | Solide (cf. `docs/AUDIT_SECURITE.md`, déjà audité) |
| Sécurité terrain (sortie de zone chantier) | Responsables (permission) | Trigger DB (`securite_suivi_zone.sql:137`, `notifier_permission`) | In-app + push web | Insertion in-app atomique avec la transaction ; push sans retry si échec transitoire | `notifications_utilisateurs` (id, type, niveau, horodatage) ; push : seulement un timestamp d'envoi, pas de raison d'échec |
| Planning modifié / affectation | Salarié concerné | Trigger DB sur `affectations` (`notifications_planning.sql`) | idem | idem | idem |
| Pointage manquant / à valider | Salarié, valideurs | Cron quotidien `notifier_pointages_manquants_et_a_valider` (`/api/cron/abonnements`) | idem | Garde applicative non atomique (voir §3) | idem |
| Congés / notes de frais | Concerné | Trigger DB | idem | idem | idem |
| Chantier (documents, médias conversation) | Membres du chantier | Pas de notification email dédiée identifiée hors in-app générique | In-app | — | — |
| Support | Équipe / utilisateur | **Aucun** — `src/app/actions/support.ts` ne référence ni `notifier_*`, ni `mailto`, ni provider e-mail | N/A | N/A | Aucune confirmation de prise en compte envoyée à l'utilisateur |
| Studio | — | **Fonctionnalité inexistante dans le code actuel** (aucune occurrence de « Studio » dans `src/`) | N/A | N/A | N/A |

**Constat transversal :** il n'existe **aucun fournisseur d'e-mail transactionnel intégré côté serveur** dans ce dépôt (`package.json` ne liste ni Resend, ni SendGrid, ni Postmark, ni Nodemailer ; recherche exhaustive dans `src/` sans résultat). C'est un TODO assumé : `PRODUCTION_CHECKLIST.md:35` — *« Envoi automatique des devis/factures par email avec pièce jointe : choisir un fournisseur SMTP/Resend et fournir sa clé »*. Le registre RGPD des sous-traitants (`docs/juridique/rgpd-sous-traitants.md:12`) liste déjà `[Resend / prestataire e-mail]` comme sous-traitant — entre crochets, en placeholder — alors qu'aucun appel réseau vers Resend n'existe dans le code. **Incohérence de conformité à corriger** : soit retirer la ligne tant que le prestataire n'est pas réellement branché, soit la compléter avant toute mise en production réelle du canal.

---

## 2. Relais e-mail — protections déjà en place

Comme il n'y a pas de relais e-mail serveur réel pour les documents commerciaux, la plupart des vecteurs classiques (injection d'en-tête SMTP, CC/BCC forcé côté serveur, usurpation de domaine d'envoi) **ne s'appliquent pas à ce flux** : le navigateur de l'utilisateur compose l'e-mail via son propre client, ELSATIA n'émet rien. Le champ CC de `EmailDocumentButton` est découpé et ré-encodé (`construireLienMailto`, `src/lib/email.ts:5`) avant d'être injecté dans l'URI `mailto:` — c'est un paramètre d'URL, pas un en-tête SMTP brut, donc pas d'injection d'en-tête possible par ce chemin.

Le seul relais e-mail réel est celui de **Supabase Auth** (confirmation, reset). Sa configuration de production (SMTP personnalisé ou mailer par défaut Supabase, quotas, domaine d'envoi, DKIM/SPF) est **hors de ce dépôt** (gérée depuis le tableau de bord Supabase). `supabase/config.toml` ne reflète que le développement local et y montre `[auth.rate_limit] email_sent = 2` par heure — si cette valeur ou son équivalent par défaut Supabase (généralement de l'ordre de quelques e-mails/heure sans SMTP personnalisé) se retrouve en production sans SMTP dédié, **les inscriptions et resets échoueront silencieusement dès qu'un léger pic de trafic survient**.

`DECISION_REQUIRED` : ce point ne peut pas être tranché depuis le code. Recommandation conservatrice retenue : **considérer que le SMTP de production n'est pas confirmé configuré tant qu'une vérification explicite dans le tableau de bord Supabase n'a pas eu lieu**, et le traiter comme un bloquant avant tout lancement commercial avec des clients réels.

---

## 3. Idempotence — doubles envois possibles

- **Devis/factures/commandes/relances (`mailto:`)** : le bouton d'envoi se désactive pendant la transition React (`disabled={pending||...}`), ce qui protège contre le double-clic côté UI. Mais comme aucun envoi serveur n'existe, la notion même de « double envoi » est hors du contrôle d'ELSATIA — un utilisateur peut rouvrir le lien `mailto:` autant de fois qu'il veut (bouton « Envoyer par email » recliquable après fermeture de la modale), sans que rien ne l'en empêche ni ne le trace.
- **Notifications in-app déclenchées par trigger DB** (planning, congés, notes de frais, sécurité) : insertion **atomique** avec la transaction métier qui la déclenche — pas de risque de perte ou de doublon lié à une désynchronisation DB/notification pour ce chemin.
- **Alerte "pointage manquant" (cron quotidien)** — **doublon confirmé possible** : `notifier_pointages_manquants_et_a_valider()` (`supabase/migrations/20260724000162_alertes_pointage_manquant_et_a_valider.sql:33-45`) protège contre les doublons via un `not exists (... where created_at::date = current_date)` — un **contrôle applicatif non atomique** (lecture puis écriture, pas de contrainte DB qui l'impose). L'index unique censé jouer ce rôle (`notifications_evenement_unique`, migration `20260715000081`, ligne 35) inclut la colonne `created_at` en pleine précision (timestamp, pas date tronquée) : **deux insertions à quelques millisecondes d'écart ne sont jamais bloquées par cet index**, ce qui le rend inopérant comme filet de sécurité. Si le cron `/api/cron/abonnements` est déclenché deux fois de façon rapprochée (retry après timeout, redéclenchement manuel par quelqu'un disposant de `CRON_SECRET`), un salarié peut recevoir deux notifications « pointage manquant » pour le même jour.
- **Notification push (web-push)** — **course possible** : `traiterNotificationPush()` (`src/lib/push.ts:47-77`) vérifie `push_envoyee_at is null` puis envoie, et ne marque `push_envoyee_at` qu'à la toute fin (bloc `finally`). Le webhook Supabase temps réel et le cron de rattrapage quotidien appellent tous deux cette même fonction sur le même `notificationId` ; si les deux s'exécutent dans la fenêtre où l'un a déjà commencé sans avoir encore posé `push_envoyee_at`, **l'utilisateur peut recevoir deux notifications push identiques**. Fenêtre étroite en pratique (le webhook est quasi temps réel, le cron ne passe qu'une fois par jour), mais le mécanisme n'a aucune protection structurelle (pas de verrou, pas de `select ... for update`).

---

## 4. Outbox vs envoi synchrone

- **Documents commerciaux** : la question ne se pose pas au sens classique — il n'y a pas de couplage DB-commit/envoi puisqu'il n'y a pas d'envoi serveur. Le risque réel est inverse à celui que l'outbox pattern résout habituellement : ici, c'est le **statut** (« envoyé ») qui est validé en DB de façon synchrone et définitive, **avant** l'action externe (l'utilisateur envoie réellement depuis sa messagerie) qui pourrait échouer, être annulée, ou ne jamais avoir lieu. Il n'existe aucun mécanisme de correction si l'utilisateur ferme sa messagerie sans envoyer.
- **Notifications in-app** : le pattern trigger-DB (insertion dans la même transaction que le fait métier) est en réalité un bon substitut local à l'outbox — pas de scénario « DB commit OK, notification perdue » pour ce canal, puisque les deux sont dans la même transaction Postgres.
- **Push navigateur** : c'est la vraie frontière asynchrone du système (DB commit du côté notification in-app, puis envoi HTTP différé vers le service push via webhook ou cron). Ce n'est pas une outbox transactionnelle à proprement parler (pas de statut `queued`/`sending`/`failed` distinct, juste un timestamp booléen `push_envoyee_at`), mais le double chemin webhook + cron de rattrapage (fenêtre de 25h) couvre correctement le cas « webhook indisponible ». En revanche, un échec transitoire du provider push (pas 404/410) **n'est jamais retenté** : voir §6.
- **Verdict** : pas de scénario `DB commit OK / e-mail perdu` classique côté transactionnel, car il n'y a pas d'e-mail transactionnel réel. Le vrai problème est un **scénario inverse et plus grave** : `DB dit "envoyé" / rien n'a peut-être été envoyé du tout`.

---

## 5. Statuts d'envoi

Aucun endroit du code n'annonce `delivered` sans preuve provider — bonne nouvelle, mais principalement parce qu'**aucun canal ne va jusqu'à un statut `delivered`/`bounced` du tout**. Distinction observée :

- Devis/factures/commandes : statuts `brouillon` → `envoyé` uniquement. `envoyé` est positionné côté serveur **au moment du clic**, avant tout envoi réel — c'est une **fausse promesse de statut** au sens strict (le mot « envoyé » désigne en réalité « bouton cliqué »).
- Relances : `preparee`/`a_envoyer` → `envoyee` seulement sur confirmation manuelle explicite (`marquerRelanceEnvoyeeAction`) — modélisation plus honnête, à répliquer sur les devis/factures.
- Notifications in-app/push : pas de `queued`/`sending`/`delivered`/`bounced`/`cancelled` du tout ; seulement `lue_at` (lu/non lu) et `push_envoyee_at` (tentative de push faite ou non, sans distinguer succès/échec au niveau stocké).
- Auth Supabase : statuts entièrement internes à Supabase, invisibles depuis l'application.

---

## 6. Retry / bounce / adresse invalide

- **Aucune logique de retry ni de backoff nulle part dans `src/`** (recherche exhaustive `retry|backoff`, aucun résultat en dehors de ce rapport).
- Push : seul cas de nettoyage actif est l'abonnement expiré (HTTP 404/410 → suppression de `push_abonnements`, `src/lib/push.ts:36-39`) — logique correcte et bien commentée. Mais **toute autre erreur (réseau, panne temporaire du service push, 5xx) marque quand même la notification comme traitée** (`finally` inconditionnel) : **pas de retenter, perte silencieuse confirmée** pour ce cas précis.
- Bounce e-mail (adresse invalide, boîte pleine) : concept **inapplicable** aux documents commerciaux puisqu'ils ne transitent jamais par un serveur ELSATIA — c'est la messagerie personnelle de l'expéditeur qui recevrait un éventuel bounce, hors de la vue d'ELSATIA. Pour les e-mails Supabase Auth, la gestion des bounces est entièrement déléguée à Supabase/au fournisseur SMTP configuré (hors dépôt).
- Pas de risque de boucle infinie identifié : les gardes `not exists` dans les fonctions `notifier_*` empêchent la re-notification en boucle (même si, comme noté en §3, elles ne sont pas parfaitement atomiques).

---

## 7. Cross-tenant

Vérifié par lecture directe des migrations RLS, cohérent avec `docs/AUDIT_SECURITE.md` (juillet 2026) :

- `notifications_utilisateurs` : `select` restreint à `utilisateur_id = auth.uid() AND est_membre_actif(entreprise_id)` ; écriture uniquement via fonctions `SECURITY DEFINER` dont l'exécution est révoquée à `public/anon/authenticated` — un utilisateur ne peut pas forger de notification pour un autre tenant ni pour un autre utilisateur.
- `push_abonnements` / `preferences_notifications_push` : même double filtre `utilisateur_id=auth.uid() AND est_membre_actif(entreprise_id)`, correctement appliqué en `using` **et** `with check`.
- `relances_impayes` : lecture/écriture filtrées par `entreprise_id = ctx.entrepriseId` côté server action.
- **Point d'attention non lié directement aux notifications mais découvert pendant l'audit** : la policy `codes_identification_prototype` (`for all to anon using(true) with check(true)`, `supabase/migrations/20260713000068_codes_qr_borne_stock_securisee.sql:195`) n'a **jamais été supprimée**, contrairement à ses cinq policies sœurs sur `storage.objects` explicitement nettoyées dans `20260724000161_suppression_policies_prototype_storage_dormantes.sql`. Elle est neutralisée aujourd'hui uniquement parce qu'un `revoke all privileges on all tables in schema public from anon` global (migration `20260714000078`) prive `anon` du droit de table nécessaire pour l'atteindre — **mais la policy elle-même reste en base**. Le commentaire de la migration 161 rappelle explicitement que ce type de `grant ... to anon` copié-collé par erreur s'est **déjà produit deux fois** dans l'historique du projet. Si cela se reproduit sur `public.codes_identification`, cette policy redeviendrait immédiatement active et exposerait **tous les codes d'identification QR (stock, chantiers) de toutes les entreprises clientes** à un accès anonyme non authentifié. Recommandation : `drop policy codes_identification_prototype on public.codes_identification;` dans une prochaine migration, indépendamment du sujet notifications.

---

## 8. Pièces jointes / liens publics

- Aucune fonctionnalité de lien public/partageable pour devis ou factures n'existe dans le code (recherche exhaustive `token|lien_public|magic|partage_public`, un seul faux positif sans rapport). Les PDF ne sont accessibles qu'à des utilisateurs authentifiés, via des URL signées Supabase Storage à très courte durée de vie (`/api/documents/[id]/route.ts` : 60 s ; `/api/devis/pieces-jointes/[id]/route.ts` : 300 s), elles-mêmes filtrées par `entreprise_id` avant génération — bon niveau de protection.
- Conséquence directe : le bouton « Envoyer par email » n'attache **jamais** automatiquement le PDF au brouillon `mailto:` — l'interface le dit elle-même explicitement à l'utilisateur (« Il reste à joindre le PDF ouvert à gauche »). C'est un gap fonctionnel, pas une faille de sécurité, mais il aggrave le problème de fiabilité : même si l'utilisateur envoie réellement l'e-mail, rien ne garantit qu'il a pensé à joindre le bon document.
- Pas de notion de document brouillon exposé publiquement par erreur : les routes de signature d'URL ne distinguent pas `brouillon`/`émis`, mais comme elles exigent une session authentifiée + appartenance au tenant, ce n'est pas un problème de fuite externe.

---

## 9. Templates

Pas de template HTML, pas de composant React Email dans le dépôt. Les corps de message (`src/lib/email.ts`) sont du texte brut concaténé, jamais interprété comme HTML nulle part (recherche `dangerouslySetInnerHTML` sans résultat dans tout `src/`) : **pas de surface d'injection HTML/XSS sur ce chemin**, précisément parce que rien n'est rendu comme HTML. Les templates d'e-mail Supabase Auth (confirmation, reset) ne sont pas personnalisés dans ce dépôt — ce sont les gabarits par défaut Supabase, seul le format du lien de redirection est prescrit (`PRODUCTION_CHECKLIST.md:20-23`).

---

## 10. Auth emails — redirectTo / open redirect

- `origineApplication()` (`src/app/actions/auth.ts:8-11`) construit l'origine du lien de redirection à partir des **en-têtes de la requête entrante** (`origin`, sinon `x-forwarded-host`/`host`), pas d'une valeur figée par variable d'environnement. Ces en-têtes sont en théorie manipulables par un client qui appelle directement l'action serveur (hors navigateur standard). La protection réelle contre un open redirect via l'e-mail de confirmation/reset repose **entièrement sur l'allowlist de redirection configurée côté tableau de bord Supabase** (`Site URL` + `Additional Redirect URLs`), qui est hors de ce dépôt et donc invérifiable statiquement.
  `DECISION_REQUIRED` : traité comme non confirmé. Recommandation conservatrice : vérifier explicitement dans le tableau de bord Supabase que seules les URL de production et de développement légitimes figurent dans l'allowlist (déjà listé comme étape 3 du `PRODUCTION_CHECKLIST.md`), et envisager de dériver `origineApplication()` d'une variable d'environnement figée plutôt que des en-têtes de requête, en défense en profondeur.
- La route `/auth/confirm` (callback réel) valide le paramètre `next` via une fonction `destinationSure()` qui n'autorise que des chemins internes commençant par `/` et rejette `//` — bonne protection anti-open-redirect **à ce niveau-là**.
- Pas de flux d'invitation par e-mail admin (`auth.admin.inviteUserByEmail` absent du code) : le rattachement d'un salarié se fait par code entreprise / numéro employé saisi au signup, avec un lien partagé manuellement — cela déplace le risque d'usurpation vers la diffusion du code (hors du périmètre e-mail).

---

## 11. Notifications in-app

- Lu/non lu (`lue_at`) correctement scoping par utilisateur, mise à jour possible uniquement par le propriétaire de la ligne (`with check(utilisateur_id=auth.uid())`).
- Cloisonnement tenant vérifié (§7).
- Duplication : voir §3 (cas confirmé sur l'alerte pointage manquant).
- Pagination / volume : aucun test de volume n'a été exécuté (pas d'environnement Supabase actif ici) ; le cron de rattrapage push plafonne à 200 lignes par exécution sans pagination — si plus de 200 notifications restent non poussées sur une fenêtre de 25h (pic d'activité, panne du webhook prolongée), certaines resteront sans push jusqu'au passage suivant.

---

## 12. Abus

- Formulaires déclenchant un `mailto:` : aucun risque d'abus côté serveur ELSATIA puisqu'aucun envoi serveur n'a lieu ; le pire cas est un utilisateur légitime qui pré-remplit un `mailto:` avec un contenu de son choix, envoyé depuis sa propre messagerie — hors périmètre de responsabilité applicative.
- Routes cron (`/api/cron/abonnements`, `/api/cron/notifications-push`) et webhook (`/api/webhooks/notifications-push`) : protégées par secret partagé (`CRON_SECRET`, `NOTIFICATIONS_WEBHOOK_SECRET`) comparé avec `!==` — comparaison non « temps constant », risque théorique de timing attack, sévérité faible pour un secret interne non exposé publiquement en tant que tel, mais facile à corriger (`crypto.timingSafeEqual`).
- Pas de vecteur d'injection HTML/en-tête identifié (voir §2, §9).
- Quota d'e-mails d'authentification : dépend entièrement de la configuration Supabase de production, non vérifiable ici (voir §2).

---

## 13. Observabilité

- Notifications in-app : `id`, `entreprise_id`, `utilisateur_id`, `type`, `niveau`, `created_at`, `lue_at` — bon socle, pas de contenu sensible superflu stocké (les messages restent des libellés métier courts, pas de données bancaires/santé).
- Push : seul `push_envoyee_at` (booléen temporel) est conservé — **aucune trace de la raison d'un échec** (network, 5xx provider, VAPID mal configuré) n'est persistée nulle part ; ces informations existent en mémoire dans `envoyerNotificationPush()` mais ne sont jamais écrites en base. Impossible de répondre après coup à « combien de push ont échoué cette semaine et pourquoi ».
- E-mails de documents commerciaux (devis/factures/commandes/relances) : **aucune observabilité** — pas d'ID d'envoi, pas de statut fiable, pas de timestamp d'envoi réel, pas de trace d'erreur, puisqu'il n'y a pas d'envoi serveur à observer.
- Auth Supabase : observabilité entièrement externe au dépôt (tableau de bord Supabase / logs du fournisseur SMTP configuré).

---

## 14. Tests rejoués

Exécutés dans cette session (sandbox sans accès réseau externe ni démon Docker) :

| Commande | Résultat |
|---|---|
| `npm ci` | OK (avertissements `EBADENGINE` sans impact, dépendance transitive exigeant Node ≥ 24 alors que Node 22 est utilisé ici) |
| `npm run test` (vitest) | **104 tests passés / 28 fichiers, 0 échec** |
| `npm run typecheck` | **0 erreur** |
| `npm run lint` | **0 erreur, 3 avertissements** pré-existants sans rapport avec les e-mails/notifications (`<img>` non optimisée dans `boutique` et `SignatureEmploye`) |
| `npm run build` | **OK** — build de production réussi |
| `supabase test db` (pgTAP) | **Non exécutable dans ce bac à sable** — `supabase start` nécessite un démon Docker, absent ici (`docker info` échoue : `dial unix /var/run/docker.sock: connect: no such file or directory`). Aucun fichier de test pgTAP dédié aux notifications/e-mails n'existe de toute façon dans `supabase/tests/` à ce jour. |

**Absence de couverture automatisée** pour : `src/lib/push.ts` (envoi/expiration push), les routes `/api/webhooks/notifications-push` et `/api/cron/notifications-push`, et les ~7 fonctions SQL `notifier_*`/`trg_notifications_*`. Seul `src/lib/email.test.ts` existe, et il ne teste que l'encodage de l'URL `mailto:` — pas de test sur le fait que le statut « envoyé » soit positionné avant tout envoi réel.

---

## Réponses aux 5 questions de la mission

1. **E-mails qui peuvent se perdre silencieusement** : tous les devis, factures, commandes et relances — puisqu'il n'existe aucune trace de leur envoi réel (l'utilisateur peut fermer sa messagerie sans envoyer, et rien ne le détecte). Les notifications push en cas d'échec transitoire (non 404/410) sont également perdues sans retry (§6).
2. **E-mails qui peuvent partir en double** : l'alerte « pointage manquant » sous exécution concurrente du cron (§3), et, plus rarement, une notification push doublée si le webhook temps réel et le cron de rattrapage se chevauchent sur la même notification (§3). Les `mailto:` peuvent être rouverts autant de fois que l'utilisateur le souhaite — pas un « doublon système » au sens strict, mais aucune limite ne l'empêche.
3. **E-mails/notifications qui peuvent être abusés** : aucun vecteur d'abus serveur significatif identifié sur le canal e-mail commercial (il n'y a pas de serveur d'envoi à abuser) ; le point le plus concret reste la dépendance à la configuration de production Supabase (allowlist de redirection, SMTP, quotas) qui ne peut pas être vérifiée depuis ce dépôt (§2, §10).
4. **Notifications non traçables** : devis/factures/commandes/relances envoyés aux tiers (aucune trace d'envoi réel, §1/§5/§13) ; support (aucune notification déclenchée du tout, §1).
5. **Derniers blocages avant un envoi réel côté client** :
   - Intégrer un vrai fournisseur transactionnel (Resend, déjà pré-annoncé dans le registre RGPD) avec envoi serveur, pièce jointe automatique, et statuts réels (`queued`/`sending`/`delivered`/`bounced`) au lieu du `mailto:` actuel — c'est le blocage principal et attendu par le projet lui-même (`PRODUCTION_CHECKLIST.md:35`).
   - Ne plus positionner le statut « envoyé » sur les devis/factures/commandes avant confirmation réelle d'envoi (aligner sur le modèle, plus honnête, des relances).
   - Corriger la garde de déduplication non atomique + l'index inefficace sur `notifications_evenement_unique` (§3, §7 fournit un candidat proche : contrainte fonctionnelle sur une date tronquée plutôt que sur `created_at`).
   - Ajouter un retry (au moins une tentative différée) et une trace d'erreur persistée pour les échecs push transitoires (§6, §13).
   - Vérifier explicitement la configuration Supabase de production (SMTP dédié, allowlist de redirection, quotas d'e-mails) — non vérifiable depuis ce dépôt (§2, §10).
   - Supprimer la policy dormante `codes_identification_prototype` avant qu'un futur `grant ... to anon` ne la réactive (§7 — hors périmètre strict notifications, mais découvert pendant cet audit et jugé suffisamment sérieux pour être signalé immédiatement plutôt que dans un rapport séparé).
   - Mettre à jour ou retirer la ligne « Resend » du registre RGPD des sous-traitants tant qu'aucun appel réel n'existe (§1).

---

## Conclusion

L'architecture des notifications **internes** (in-app + push, triggers DB) est bien pensée : cloisonnement tenant solide, insertion atomique avec la transaction métier pour les cas déclenchés par trigger, secrets sur les routes cron/webhook. Les deux failles de fiabilité identifiées sur ce sous-système (course push, garde de déduplication non atomique sur l'alerte pointage) sont réelles mais **circonscrites et corrigibles rapidement**.

Le vrai problème est ailleurs : **la relation client par e-mail — devis, factures, commandes, relances — n'est pas un système d'envoi transactionnel, c'est un raccourci `mailto:` habillé d'un statut de base de données qui ment par optimisme.** Tant que ce point n'est pas corrigé, ELSATIA ne peut pas affirmer avoir notifié un client, quelle que soit la qualité du reste du système. C'est un TODO déjà identifié par l'équipe elle-même (`PRODUCTION_CHECKLIST.md`), pas une découverte inattendue — mais ce rapport en documente précisément l'impact et fournit un plan de correction priorisé.
