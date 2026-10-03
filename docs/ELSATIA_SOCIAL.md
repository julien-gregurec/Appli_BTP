# ELSATIA Social : module interne réseaux sociaux

Module interne de l'espace plateforme (`/plateforme/social`, menu **Communication › Réseaux sociaux**). Il gère les comptes officiels ELSATIA : Page Facebook, Instagram professionnel et Page Entreprise LinkedIn.

Workflow V1 imposé : **Brouillon → Prévisualisation → Validation humaine → Publication**. Rien n'est publié ni répondu automatiquement.

**Mode simulation (dry-run), règle absolue.** Une écriture réelle n'est envoyée que si **les deux** conditions sont remplies :
1. le déploiement est la production Vercel (`VERCEL_ENV=production`) ;
2. `SOCIAL_DRY_RUN=false`, sur décision explicite de Julien.

Partout ailleurs (local, prévisualisation, variable absente), le bandeau « MODE SIMULATION — aucune publication réelle ne sera envoyée » s'affiche sur chaque page. Une publication réelle est aussi refusée tant que le logo officiel ELSATIA est absent.

Recette : `docs/ELSATIA_SOCIAL_RECETTE.md`. Identité visuelle : `docs/ELSATIA_IDENTITE.md`.

## 1. Architecture

Le module réutilise la pile existante : Next.js 16, Supabase, l'équipe plateforme (`plateforme_admins`), le fournisseur IA (`ProviderIA` de `src/lib/ai/provider.ts`), le cron Vercel, `sharp` et les liens de téléversement signés. Aucune architecture parallèle n'a été créée.

```
UI (src/app/(app)/plateforme/social/*)  ──►  actions serveur (src/app/actions/social.ts)
                                              │  exigerSocial(rôle) → service_role → audit
                                              ▼
                       src/lib/social/ : publication (verrou, reprise, dry-run)
                                         comptes (jetons chiffrés, renouvellement)
                                         synchronisation (stats, commentaires, messages, webhooks)
                                         ia (Assistant Social, propositions seulement)
                                              │
                         SocialProvider ◄─────┴─────► SocialProvider
                       MetaConnector (facebook, instagram)   LinkedInConnector (linkedin)
                              graph.facebook.com/v26.0        api.linkedin.com/rest (202609)
```

- **`SocialProvider`** (`src/lib/social/provider.ts`) expose `createDraft`, `publishPost`, `schedulePost`, `uploadImage`, `uploadVideo`, `getPosts`, `getAnalytics`, `getFollowers`, `getComments`, `replyToComment`, `getMessages`, `replyToMessage`. Il déclare aussi `capacites`, calculé à partir des permissions réellement accordées. Une fonction absente de l'API lève `ErreurSocial("non_supporte")` et l'interface affiche « Fonction non disponible via API ».
- **Programmation** : aucune des API Instagram ou LinkedIn n'en propose. ELSATIA Social programme donc lui-même les trois réseaux, ce qui garde l'annulation et la validation sous contrôle. Facebook en propose une, non utilisée par cohérence.
- **Anti-doublon** :
  - une cible par réseau et par publication, avec une clé d'idempotence unique ;
  - verrou atomique `social_verrouiller_cible` ;
  - une écriture sans réponse (délai, coupure, 5xx) est classée « incertain » et n'est **jamais** relancée automatiquement ;
  - un conteneur Instagram est réutilisé à la reprise.
- **Empreinte de validation** : SHA-256 des textes, réseaux, lien et médias validés. Toute différence bloque la publication. La base renvoie en brouillon toute publication modifiée après soumission ou validation.

## 2. Fichiers créés ou modifiés

| Zone | Fichiers |
|---|---|
| Migration | `supabase/migrations/20261003000184_elsatia_social.sql` |
| Domaine | `src/lib/social/{types,roles,config,crypto,http,provider,contenu,empreinte,meta,linkedin,securite,acces,audit,comptes,publication,workflow,identite,ia,synchronisation,taches,medias,temps,webhook-reception}.ts` |
| Actions serveur | `src/app/actions/social.ts` |
| API | `src/app/api/social/oauth/[fournisseur]/route.ts`, `.../callback/route.ts`, `src/app/api/social/webhooks/{meta,linkedin}/route.ts`, `src/app/api/social/cron/route.ts`, `src/app/api/social/medias/preparer/route.ts` |
| Pages | `src/app/(app)/plateforme/social/` : `page.tsx` (publications), `publication`, `calendrier`, `statistiques`, `commentaires`, `messages`, `assistant`, `comptes`, `equipe`, `journal` |
| Composants | `src/components/social/*` (éditeur, aperçus, validation, calendrier, réponses, connexion, rôles) |
| Modifiés | `src/components/Sidebar.tsx` (menu), `src/app/(app)/plateforme/page.tsx` (lien), `src/lib/supabase/proxy.ts` (webhooks et cron sans session), `src/app/api/cron/abonnements/route.ts` (rattrapage quotidien), `.env.local.example` |
| Tests | `src/lib/social.test.ts` (30 tests) |

## 3. Base de données (migration 184)

| Table | Rôle |
|---|---|
| `social_membres` | Rôle social par membre plateforme. Par défaut, « Accès total » donne Administrateur et les autres membres sont en Lecture seule. |
| `social_parametres` | `automatisation_active`, `false` par défaut et sans effet en V1. |
| `social_comptes` | Un compte actif par réseau : statut, permissions, expiration du jeton, de l'accès aux données et du renouvellement. |
| `social_identifiants` | Jetons chiffrés AES-256-GCM. **Aucune policy** : seul `service_role` y accède. |
| `social_connexions_en_attente` | Résultat OAuth chiffré, conservé 15 minutes le temps de choisir la Page ou l'organisation. |
| `social_publications` | Textes maître et par réseau, produit ELSATIA, réseaux, statut, programmation, validation et empreinte. |
| `social_publication_medias`, `social_medias` | Médias dans le bucket privé `social-medias`. Images converties en JPEG avec leurs dimensions. |
| `social_publication_cibles` | Envoi par réseau : identifiant externe, tentatives, reprise, erreurs. |
| `social_statistiques`, `social_abonnes` | Mesures normalisées. `null` signifie que la plateforme ne fournit pas la métrique, jamais 0. |
| `social_commentaires`, `social_messages` | Boîte de réception avec brouillons de réponse (IA ou humain) et trace de l'envoi validé. |
| `social_webhook_evenements` | Idempotence (empreinte du corps), reprise, puis statut `abandonne` (file des échecs) après 5 essais. |
| `social_quotas` | Limitation de débit : OAuth, IA, publications, réponses, synchronisations, téléversements. |
| `social_audit` | Journal **en ajout seul** (trigger) : utilisateur, action, date, réseau, publication, avant et après. |

Garde-fous en base, testés sur PostgreSQL 16 :
- une publication est toujours créée en idée ou en brouillon ;
- une validation ne peut venir que d'un Administrateur ou d'un Validateur (trigger) ;
- un statut validé, programmé ou publié exige une approbation (contrainte CHECK) ;
- une modification après soumission ou validation renvoie en brouillon ;
- le contenu d'une publication envoyée est verrouillé ;
- un seul compte actif par réseau ;
- RLS active partout, lecture réservée aux membres sociaux, aucune écriture possible depuis le client.

## 4. Rôles

| Droit | Admin | Resp. comm. | Éditeur | Validateur | Lecture |
|---|:-:|:-:|:-:|:-:|:-:|
| Consulter | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rédiger, soumettre, IA, téléverser | ✓ | ✓ | ✓ | | |
| Calendrier (idées et brouillons) | ✓ | ✓ | ✓ | ✓ (contenus validés) | |
| **Autoriser une publication** | ✓ | | | ✓ | |
| Publier ou programmer un contenu validé | ✓ | | | ✓ | |
| Préparer une réponse | ✓ | ✓ | ✓ | ✓ | |
| Valider et envoyer une réponse | ✓ | | | ✓ | |
| Synchroniser | ✓ | ✓ | | ✓ | |
| Comptes, jetons, équipe | ✓ | | | | |

Le mode prototype sans connexion (`DISABLE_EMAIL_LOGIN=true`) n'a **pas** accès au module.

## 5. Variables d'environnement (Vercel, jamais dans Git)

| Variable | Obligatoire | Usage |
|---|---|---|
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | oui | 32 octets hexadécimaux (`openssl rand -hex 32`). Chiffre les jetons et dérive la signature anti-CSRF. |
| `SOCIAL_TOKEN_ENCRYPTION_KEY_PREVIOUS` | rotation | Ancienne clé, à garder jusqu'à « Rechiffrer les jetons ». |
| `SOCIAL_DRY_RUN` | non | Simulation tant que la valeur n'est pas exactement `false`. |
| `META_APP_ID`, `META_APP_SECRET` | Meta | Application Meta. |
| `META_GRAPH_API_VERSION` | non | `v26.0` par défaut. |
| `META_LOGIN_CONFIG_ID` | non | Facebook Login for Business. |
| `META_WEBHOOK_VERIFY_TOKEN` | webhooks Meta | Chaîne aléatoire, aussi saisie chez Meta. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn | Application LinkedIn dédiée. |
| `LINKEDIN_API_VERSION` | non | `202609` par défaut. À mettre à jour chaque année. |
| `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` | déjà utilisées | URL de retour OAuth, planificateur, accès serveur, Assistant Social. |

## 6. Configuration Meta

1. Sur developers.facebook.com, créer une application de type **Business**, rattachée au portefeuille Meta Business d'ELSATIA. Ajouter le produit **Facebook Login for Business**.
2. Ajouter l'URL de retour OAuth valide : `https://<domaine>/api/social/oauth/meta/callback`.
3. Permissions à demander :
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata`, `read_insights`, `pages_messaging`, `business_management` ;
   - `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `instagram_manage_messages`.
4. Un **Accès standard** suffit pour les comptes ELSATIA, à condition que la personne qui se connecte ait un rôle sur l'application (administrateur ou développeur). Aucun App Review n'est nécessaire pour ses propres Pages. La **vérification d'entreprise** reste exigée pour la messagerie Instagram.
5. Pour recevoir les webhooks réels, passer l'application en **mode Live** (en développement, seuls les tests du tableau de bord arrivent).
6. Configurer les webhooks :
   - URL de rappel : `https://<domaine>/api/social/webhooks/meta`, avec le jeton de vérification `META_WEBHOOK_VERIFY_TOKEN` ;
   - objet **Page** : champs `feed` et `messages` ;
   - objet **Instagram** : champs `comments` et `messages` ;
   - puis cliquer sur **Activer les webhooks** dans `/plateforme/social/comptes`. Cela appelle `POST /{page-id}/subscribed_apps`.
7. Dans ELSATIA Social, aller dans **Comptes › Connecter via Meta** et choisir la Page ELSATIA. Le compte Instagram lié est connecté automatiquement.
   - Le jeton de Page n'a pas d'expiration fixe.
   - L'**accès aux données** expire en revanche (`data_access_expires_at`, environ 90 jours) : se reconnecter avant cette date, affichée dans l'écran Comptes.

Chaque appel serveur porte un `appsecret_proof`. Activer **« Exiger la clé secrète de l'application »** dans les paramètres avancés Meta.

## 7. Configuration LinkedIn

1. Sur linkedin.com/developers, créer une application **dédiée**, rattachée à la Page ELSATIA et vérifiée par un administrateur de la Page. La Community Management API doit être le seul produit de cette application.
2. Demander l'accès à la **Community Management API** (palier Development, puis Standard dans les 12 mois, avec une vidéo de démonstration par cas d'usage).
3. Ajouter l'URL de redirection : `https://<domaine>/api/social/oauth/linkedin/callback`.
4. Scopes : `w_organization_social` (publier et commenter au nom de l'organisation), `r_organization_social` (lire publications et commentaires), `rw_organization_admin` (statistiques, abonnés, liste des organisations administrées, webhooks).
5. Webhooks : enregistrer `https://<domaine>/api/social/webhooks/linkedin` dans le portail développeur. Le défi `challengeCode` et la signature `X-LI-Signature` sont gérés par le module.
6. Dans ELSATIA Social, aller dans **Comptes › Connecter** et choisir l'organisation ELSATIA.
   - Le jeton dure 60 jours.
   - Les jetons de renouvellement (365 jours) ne sont accordés qu'aux partenaires approuvés. Sans eux, il faut **se reconnecter tous les 60 jours**. Une alerte apparaît dans le journal 10 jours avant l'échéance.

## 8. Déploiement de la migration 184

1. **Vérifier la cible**. Ouvrir l'éditeur SQL du projet Supabase et contrôler son nom (production ou test). Exécuter `supabase/production/verifier_elsatia_social.sql` : la section 2 (prérequis) doit valoir `true` partout, avec `aucune_collision_avant = true`.
2. **Ledger**. La section 1 indique la dernière migration enregistrée, qui doit être `20260729000183`. La 184 est la suivante dans l'ordre.
   - Si les migrations passent par `supabase db push`, le ledger est mis à jour automatiquement.
   - Si elles passent par l'éditeur SQL, ajouter ensuite `insert into supabase_migrations.schema_migrations(version, name) values ('20261003000184', 'elsatia_social');`
3. **Appliquer** `supabase/migrations/20261003000184_elsatia_social.sql`, puis relancer `verifier_elsatia_social.sql`. Résultats attendus :
   - 16 tables avec RLS ;
   - côté `authenticated`, uniquement des `SELECT` ;
   - côté `anon`, rien ;
   - le bucket `social-medias` privé ;
   - les membres « total » en Administrateur.
4. **En cas d'échec à mi-parcours**, ou pour retirer le module avant toute donnée réelle, exécuter `supabase/production/retour_arriere_elsatia_social.sql`. Le bucket est conservé (Supabase interdit sa suppression en SQL). Le cycle retour arrière + réapplication a été testé.

## 8 bis. Assistant de configuration et diagnostic

- `/plateforme/social/configuration` (Administrateur) :
  - contrôle chaque variable (présence et format, **jamais la valeur**), la migration, le bucket et le logo ;
  - donne les URL à déclarer chez Meta et LinkedIn, et les permissions accordées ;
  - indique l'état d'accès à la Community Management API ;
  - bouton « Tester l'application Meta », qui vérifie la paire identifiant / secret sans aucune donnée de compte.
- **Diagnostic en lecture seule**, lancé automatiquement après chaque connexion OAuth et disponible dans Comptes. Il vérifie :
  - l'identité, l'ID externe, les permissions (par ressource chez Meta) et l'expiration du jeton et de l'accès aux données ;
  - le quota de publication Instagram ;
  - la lecture de 3 publications et du nombre d'abonnés.

  Aucune écriture n'est faite chez les plateformes.

## 9. Planificateur

- `GET /api/social/cron` avec l'en-tête `Authorization: Bearer CRON_SECRET`. Il traite les publications programmées échues, les reprises, les verrous abandonnés (passés en « incertain ») et la file des webhooks. Le paramètre `?synchroniser=1` ajoute la lecture des statistiques, commentaires et messages.
- **À appeler toutes les 5 minutes** pour respecter l'heure de programmation. Avec le plan Vercel Hobby (crons quotidiens), utiliser Supabase `pg_cron` + `pg_net` ou un planificateur externe.
- En rattrapage, le cron quotidien existant `/api/cron/abonnements` exécute aussi ces tâches, avec la synchronisation.

## 10. Capacités vérifiées dans les API officielles (octobre 2026)

| Fonction | Facebook Page | Instagram pro | LinkedIn Page |
|---|---|---|---|
| Texte seul | ✓ `/{page}/feed` | ✕ média obligatoire | ✓ `/rest/posts` |
| Lien | ✓ (aperçu Facebook) | ✕ non cliquable | ✓ (article) |
| Image | ✓ `/{page}/photos` | ✓ JPEG, rapport 4:5 à 1,91:1 | ✓ Images API |
| Vidéo / Reel | ✓ `/{page}/videos` (Reels : API disponible, V2) | ✓ Reels (3 s à 15 min, 300 Mo) | ✓ Videos API (3 s à 30 min, 500 Mo) |
| Programmation native | ✓ (non utilisée) | ✕ | ✕ |
| Statistiques | vues, spectateurs uniques, clics, réactions, commentaires, partages | vues, portée, j'aime, commentaires, partages, enregistrements | impressions, impressions uniques, clics, réactions, commentaires, partages |
| Commentaires et réponse | ✓ | ✓ | ✓ |
| Messages | Messenger, fenêtre de 24 h | ✓ (entreprise vérifiée), fenêtre de 24 h | ✕ Fonction non disponible via API |
| Webhooks | ✓ feed, messages | ✓ comments, messages | ✓ actions sociales de l'organisation |

Retraits de métriques pris en compte :
- Meta a retiré les « impressions » des Pages et publications le 15/11/2025, au profit des « vues » (`post_media_view`) ;
- Meta a remplacé la portée Facebook par `post_total_media_view_unique` en juin 2026 ;
- Meta a retiré les `impressions` Instagram le 21/04/2025.

L'écran Statistiques n'additionne entre réseaux que les réactions, commentaires et partages. Les autres métriques sont affichées par réseau, avec leur définition exacte.

Sources :
- Meta : `developers.facebook.com/docs/pages-api`, `/docs/instagram-platform/content-publishing`, `/docs/instagram-platform/insights`, `/blog/post/2025/08/15/page-insights-api-updates`, `/docs/messenger-platform`, `/docs/graph-api/webhooks`.
- LinkedIn : `learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api`, `.../images-api`, `.../videos-api`, `.../comments-api`, `.../organizations/share-statistics`, `/linkedin/shared/api-guide/webhook-validation`, `/linkedin/marketing/versioning`.

## 11. Limitations connues de la V1

- Une seule image ou une seule vidéo par publication. Carrousel et multi-images prévus en V2.
- Les vidéos Facebook sont publiées comme vidéos de Page. L'API Reels de Facebook n'est pas encore utilisée.
- Vidéos limitées à 200 Mo par le bucket. Le plafond de taille d'envoi du projet Supabase s'applique aussi (50 Mo sur l'offre gratuite).
- Une vidéo LinkedIn est téléversée par la fonction serveur, avec une limite de durée d'exécution. Préférer des vidéos de moins de 100 Mo.
- Le nom des membres LinkedIn qui commentent n'est pas exposé à une Page : affiché « Membre LinkedIn ».
- Messagerie : lecture et réponse uniquement dans la fenêtre de 24 h. Pas d'étiquette `HUMAN_AGENT` (elle exige un App Review).
- Logo officiel ELSATIA : à déposer dans `public/elsatia/` (voir `docs/ELSATIA_IDENTITE.md`). En attendant, les aperçus affichent « logo manquant » et la publication réelle est bloquée.
- Palette ELSATIA bleu / cyan / blanc (`src/lib/elsatia/marque.ts`) : valeurs provisoires, à recaler sur le fichier du logo avec `npm run elsatia:logo`.
