# ELSATIA Social : dossier de pré-production sur le train canonique V9.2

_Mis à jour le 3 octobre 2026, après intégration au train (branche `integration/elsatia-social-v1`)._

> **Rien n'a été déployé ni appliqué à distance.** Les seules opérations distantes sont des **lectures** (GET) via les API Supabase et Vercel du projet Preview, le 3 octobre 2026 à 16:43 UTC : liste des migrations appliquées, noms des variables (jamais les valeurs), domaines. Aucun ancien document n'est considéré comme une preuve de l'état actuel de Preview ou de Production.

## 1. Ligne d'intégration

| Élément | Valeur |
|---|---|
| Train canonique de départ | `integration/elsatia-canonical-train-v9.2`, HEAD `dfb59cc61e45991165ef5dd8af04f1934ae28ab7` (408 migrations, dernière `20261003001504`) |
| Branche d'intégration Social | `integration/elsatia-social-v1`, créée depuis ce HEAD |
| Méthode | Report contrôlé des fichiers Social (commits `7c595ae5`, `b3b0f98a`, `22c270d7` de `claude/nice-shannon-2506yt`), sans fusion de l'ancien `main` |
| Migration Social | `20261003001601_elsatia_social.sql` (ex-`20261003000184`) |
| Train obtenu | **409 migrations**, dernière `20261003001601`, noms et horodatages uniques (`npm run verify:migrations`) |

Vérification de non-collision faite immédiatement avant le choix de l'horodatage : aucune migration `≥ 20261003001505` n'existe sur le train ni sur aucune des branches distantes.

## 2. Ledger réel de la base Preview (lecture du 03/10/2026, 16:43 UTC)

Projet Supabase Preview `pgvvpqyjziyapbbkydmc`. Export brut : `docs/qualification/elsatia-social/preview_ledger_pgvvpqyjziyapbbkydmc_2026-10-03.json`.

| Mesure | Valeur |
|---|---|
| Versions appliquées sur Preview | **372** |
| Dernière version appliquée | `20261002000813` |
| Versions de Preview absentes du train | **0** |
| Même version, nom différent | **0** |
| Migrations en attente (train V9.2 + Social) | **37** : 36 du train (`20261002000901` → `20261003001504`) + `20261003001601_elsatia_social` |
| En attente mais antérieures à la dernière version Preview | **0** (aucun `--include-all` nécessaire) |

Analyse par l'outil canonique du train : `node scripts/preview/v9/check-ledger-v9.mjs <export> --expect pre --attendu-courant 372` → `PREVIEW_LEDGER_PREFIX_OK`, `PENDING_MIGRATIONS=37`. Réserve de l'outil : « contenu de 813 non prouvé par ce fichier (version et nom seulement) » ; la preuve de contenu exige une lecture SQL (`--require-813-proof` avec `ELSATIA_PREVIEW_DB_URL`).

**Ce ledger doit être relu juste avant toute application** : il peut avoir changé depuis.

## 3. Variables Vercel Preview et Production (noms seulement, 03/10/2026)

| Variable | Preview (`elsatia-preview`) | Production (`elsatia-production`) |
|---|---|---|
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | absente | absente |
| `SOCIAL_DRY_RUN` | absente (donc simulation) | absente (donc simulation) |
| `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | absentes | absentes |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | absentes | absentes |
| `CRON_SECRET` | **absente** | présente |
| `SUPPORT_EMAIL` | **absente** (la page `/suppression-donnees` afficherait « — ») | présente |
| `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `FEATURE_CRONS_ENABLED` | présentes | — |

Domaines : Preview `elsatia-preview.vercel.app` ; Production Gestion Pro `app.elsatia.fr` (et `elsatia-production.vercel.app`).

## 4. Plan exact de déploiement Preview (à exécuter uniquement sur ton accord)

Pré-requis : accord explicite ; mot de passe base Preview (`SUPABASE_DB_PASSWORD`) et URL en lecture (`ELSATIA_PREVIEW_DB_URL`) fournis à l'opérateur, jamais dans Git.

1. **Relire le ledger réel** (lecture seule) et le comparer : `node scripts/preview/v9/check-ledger-v9.mjs <export> --expect pre --attendu-courant 372 --require-813-proof`. Si le nombre n'est plus 372 ou si le préfixe diverge : **arrêt**, nouvelle analyse.
2. **Sauvegarde déclarée** de la base Preview selon `docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md` (`npm run preview:v9:backup-manifest`, puis `preview:v9:backup-check`).
3. **Train V9.2 d'abord, seul** : depuis un worktree propre au HEAD `dfb59cc` du train, `scripts/preview/v9/v9-cutover.sh --out <dossier hors dépôt> --backup-manifest <manifeste>` en dry-run, puis avec `--apply-preview --confirm-ref pgvvpqyjziyapbbkydmc`. Attendu : 36 migrations, ledger 408, dernière `20261003001504`, DB verify et contrôles V9 au vert. Ainsi, un incident du train ne se mélange pas à Social.
4. **Contrôles avant Social** : `supabase/production/verifier_elsatia_social.sql` sections 1 et 2 → `train_v92_present = true`, `migration_social_enregistree = false`, `ancienne_migration_184_presente = false`, prérequis canoniques `true`, `aucune_collision_avant = true`.
5. **Social ensuite** : depuis la branche `integration/elsatia-social-v1`, même script en dry-run puis application. Attendu : `PENDING_MIGRATIONS=1` (`20261003001601`), ledger **409**.
6. **Contrôles après Social** : `verifier_elsatia_social.sql` sections 3 à 7 → 16 tables avec RLS ; `authenticated` = `SELECT` seul, jamais sur `social_identifiants`, `social_connexions_en_attente`, `social_quotas` ; `anon` = rien ; bucket `social-medias` privé ; rôle Administrateur pour les identités `total` actives.
7. **Variables Preview** (valeurs propres à Preview, jamais copiées de Production) : `SOCIAL_TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`), `SOCIAL_DRY_RUN=true` (exigé par le manifeste), `SUPPORT_EMAIL`, et `CRON_SECRET` si `/api/social/cron` doit être appelé. Meta/LinkedIn seulement quand les applications existent (§ 5 et § 6). Puis `npm run preflight:env` sur la cible Preview (mode `enforce`).
8. **Déploiement du code** de `integration/elsatia-social-v1` sur `elsatia-preview` (porte `npm run preview:v9:code-gate`).
9. **Requalification Preview** : connexion d'un administrateur plateforme, challenge MFA, accès `/plateforme/social`, bandeau MODE SIMULATION, page Configuration, parcours brouillon → validation → publication **simulée** ; `/suppression-donnees` accessible sans session ; non-régression Gestion Pro (connexion, tableau de bord, facturation) et satellites Colors, Tools, Réserves sur la même base.
10. **Retour arrière** si besoin, avant toute donnée réelle : `supabase/production/retour_arriere_elsatia_social.sql` (retire Social seul, laisse le train intact ; testé localement).

Production : uniquement après qualification Preview, sauvegarde vérifiée et ton accord. `SOCIAL_DRY_RUN` n'est **jamais** passé à `false` sans ton accord explicite.

## 5. Meta : dossier final

### Ce qu'il faut créer

| Étape | Où | Valeur |
|---|---|---|
| Application | developers.facebook.com › Mes apps › Créer une app | Cas d'usage « Autre », type **Entreprise (Business)**, nom « ELSATIA Social », e-mail de contact `support@elsatia.fr`, portefeuille Meta Business ELSATIA |
| Produit | Tableau de bord de l'app › Ajouter un produit | **Facebook Login for Business** ; **Webhooks** ; **Instagram** (« API Instagram avec Facebook Login ») |
| Page Facebook | Business Suite › Paramètres › Pages | Page ELSATIA dans le portefeuille ; la personne qui connecte a un rôle sur l'app (admin ou développeur) **et** le contrôle total de la Page |
| Instagram | Instagram › Paramètres › Type de compte | Compte **professionnel** ELSATIA, **lié à la Page** Facebook ELSATIA |

### Paramètres › Général (Basic)

| Champ | Valeur |
|---|---|
| Domaines de l'app | `app.elsatia.fr` |
| URL de la politique de confidentialité | `https://app.elsatia.fr/confidentialite` |
| URL des conditions d'utilisation | `https://app.elsatia.fr/cgu` |
| **URL des instructions de suppression des données** | `https://app.elsatia.fr/suppression-donnees` (nouvelle page, à publier en Production sur ton accord) |
| Catégorie | Entreprise et pages |
| Icône 1024 × 1024 | `public/elsatia/genere/avatar-1080.png` réduit, **dès que le logo officiel est déposé** |

### Facebook Login for Business

| Champ | Valeur |
|---|---|
| URI de redirection OAuth valides | `https://app.elsatia.fr/api/social/oauth/meta/callback` ; pour Preview `https://elsatia-preview.vercel.app/api/social/oauth/meta/callback` |
| Connexion OAuth client / web | activées ; **HTTPS imposé** ; **mode strict** des URI activé |
| Configuration | type de jeton « Jeton d'accès utilisateur » ; actifs : Page ELSATIA (+ Instagram lié) ; permissions ci-dessous. Reporter l'identifiant dans `META_LOGIN_CONFIG_ID` (facultatif) |
| Paramètres avancés | **« Exiger la clé secrète de l'app »** activé (le code envoie `appsecret_proof`) |

Permissions (scopes) : `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata`, `read_insights`, `business_management`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights` ; facultatives en V1 : `pages_messaging`, `instagram_manage_messages` (entreprise vérifiée). Accès standard suffisant pour les Pages ELSATIA elles-mêmes, sans App Review.

### Webhooks

| Champ | Valeur |
|---|---|
| URL de rappel | `https://app.elsatia.fr/api/social/webhooks/meta` |
| Jeton de vérification | valeur de `META_WEBHOOK_VERIFY_TOKEN` (aléatoire, saisie aux deux endroits) |
| Objet Page | champs `feed`, `messages` |
| Objet Instagram | champs `comments`, `messages` |
| Abonnement de la Page | bouton « Activer les webhooks » dans `/plateforme/social/comptes` (`POST /{page-id}/subscribed_apps`) |

### Passage en mode Live

- [ ] URL de confidentialité, conditions et **instructions de suppression** renseignées et publiques en Production ;
- [ ] icône 1024 × 1024 (logo officiel requis), catégorie, e-mail de contact ;
- [ ] vérification d'entreprise si la messagerie Instagram est voulue ;
- [ ] basculer en **Live** (en mode Développement, les webhooks réels ne sont pas livrés).

### Procédure de test (publication toujours simulée)

1. `/plateforme/social/configuration` › « Tester l'application Meta » (paire identifiant / secret).
2. Comptes › Connecter via Meta › choisir la Page ELSATIA ; l'Instagram lié est connecté avec elle.
3. Vérifier le diagnostic lecture seule : identité, ID, permissions par ressource, expiration de l'accès aux données (~90 jours).
4. « Activer les webhooks », puis commenter une publication existante depuis un compte personnel et vérifier sa réception dans Commentaires.
5. Créer un brouillon, le faire valider (AAL2), « Publier » : résultat attendu « Facebook : simulé · Instagram : simulé ».

## 6. LinkedIn : ce qu'il faut saisir dans le portail Developer

### Créer l'application (linkedin.com/developers › Create app)

| Champ | Valeur |
|---|---|
| App name | ELSATIA Social |
| LinkedIn Page | Page Entreprise ELSATIA (recherche par nom ou URL) |
| Privacy policy URL | `https://app.elsatia.fr/confidentialite` |
| App logo | symbole officiel ELSATIA (≥ 100 × 100), dès réception du logo |
| Legal agreement | accepter |

Application **dédiée** : la Community Management API doit être le **seul produit** de l'application.

### Rattacher la Page ELSATIA

Onglet *Settings* › *Verify* : générer l'URL de vérification et la faire approuver par un **super administrateur** de la Page ELSATIA.

### Demander la Community Management API

Onglet *Products* › **Community Management API** › *Request access*. Formulaire :

| Champ | Valeur |
|---|---|
| Raison sociale | Julien GREGUREC, entrepreneur individuel (nom commercial ELSATIA) |
| Adresse enregistrée, téléphone, e-mail pro | coordonnées officielles d'ELSATIA (`support@elsatia.fr`) |
| Site web | site ELSATIA public |
| Cas d'usage | « Outil interne de l'éditeur ELSATIA pour gérer sa propre Page Entreprise : rédaction, validation humaine, publication, statistiques et réponses aux commentaires. Aucun accès à des Pages tierces, aucune revente de données. » |

Palier **Development** d'abord ; palier **Standard** à demander dans les 12 mois, avec une vidéo de démonstration par cas d'usage.

### OAuth (onglet *Auth*)

| Champ | Valeur |
|---|---|
| Authorized redirect URLs | `https://app.elsatia.fr/api/social/oauth/linkedin/callback` ; Preview : `https://elsatia-preview.vercel.app/api/social/oauth/linkedin/callback` |
| Client ID / Client Secret | à poser dans Vercel : `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (secret) |
| Scopes (visibles après approbation) | `w_organization_social`, `r_organization_social`, `rw_organization_admin` |

Jetons : 60 jours ; sans jeton de renouvellement (réservé aux partenaires), reconnexion tous les 60 jours, alerte au journal 10 jours avant.

### Webhook (si l'onglet *Webhooks* est proposé à l'application)

| Champ | Valeur |
|---|---|
| Endpoint URL | `https://app.elsatia.fr/api/social/webhooks/linkedin` |
| Validation | défi `challengeCode` et signature `X-LI-Signature` gérés par le code (HMAC avec le Client Secret) |
| Événements | actions sociales de l'organisation (commentaires, réactions, mentions) |

L'intégration du code ne dépend pas de cette approbation : LinkedIn se branchera sans changement de code.

## 7. Suppression des données

Page publique : `/suppression-donnees` (Gestion Pro, sans session), contenu dans `docs/juridique/suppression-donnees-comptes-connectes.md`. Elle décrit factuellement ce qu'ELSATIA Social conserve (jetons chiffrés, comptes connectés, commentaires et messages reçus, notifications techniques) et la procédure (e-mail à `SUPPORT_EMAIL`, réponse sous un mois). L'exécution d'une demande : `supabase/production/supprimer_donnees_tiers_elsatia_social.sql` (testé localement).

Le site vitrine elsatia.fr est un dépôt distinct (`elsatia-site`) auquel cette session n'a pas eu accès : la page y sera reportée à partir du même texte. L'URL à déclarer chez Meta et LinkedIn peut être dès maintenant celle de Gestion Pro.
