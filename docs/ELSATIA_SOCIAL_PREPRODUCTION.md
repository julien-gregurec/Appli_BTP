# ELSATIA Social : dossier de pré-production (3 octobre 2026)

> Aucune action distante n'a été effectuée : aucune migration appliquée, aucun déploiement, aucune variable Vercel lue ni écrite. Les environnements distants n'étaient **pas accessibles** depuis la session (aucun jeton Vercel ni Supabase). Leur état est donc **inconnu**, et rien n'est déduit de la documentation historique.

## 1. Ledger des migrations : faits vérifiés dans Git

| Ligne | Fichiers | Dernière version | Remarque |
|---|---|---|---|
| `main` (`4f71317`) | 178 | `20260729000183_medias_devis` | Base de la branche ELSATIA Social |
| `claude/nice-shannon-2506yt` (cette branche) | **179** | `20261003000184_elsatia_social` | `main` + la migration Social |
| `integration/elsatia-canonical-train-v9.2` (`dfb59cc`) | **408** | `20261003001504_taches_chantier_created_idx_v1` | Ligne canonique préparée pour Preview |

Dans cette branche :
- `20261003000184_elsatia_social.sql` se trouve dans `supabase/migrations/` ;
- les 179 noms et horodatages sont uniques, aucun doublon ;
- les numéros de suffixe 28, 87, 88, 133 et 163 n'ont **jamais existé dans l'historique Git** : la numérotation a des trous, sans fichier perdu ni ignoré ;
- les 179 fichiers sont applicables à la suite : rejoués sur Supabase Postgres 17 local sans erreur.

**Écart 179 / 180.** Il y a 179 fichiers. Le chiffre 180 était une erreur de ma part, dans un message d'avancement (« j'applique les 180 migrations »), avant comptage. Tous les comptages outillés (`npm run verify:migrations`, boucle d'application) ont toujours donné 179.

**Écart beaucoup plus important : `main` n'est pas la ligne canonique.**
- 391 branches distantes portent environ 395 migrations absentes de `main`.
- Le train canonique V9.2 contient 408 migrations. `main` n'est pas un de ses ancêtres.
- Ledgers observés **selon la documentation du train** (non vérifiés ici) : Preview à 372 versions (fixture `ledger-socle-v8-ok.json`), Production à 210 versions au 1er septembre 2026. Ce sont des indications, pas des faits.

## 2. Blocage : intégrer ELSATIA Social au train canonique

La migration 184 et le code Social sont construits sur `main`. En l'état, ils **ne peuvent pas** partir en Preview :

1. **Ordre.** `20261003000184` est antérieure à des versions déjà présentes dans le train (jusqu'à `20261003001504`). `supabase db push` la refuserait, ou exigerait `--include-all`, que le train interdit. Il faut la réhorodater **après** la dernière version du train, par exemple `20261003001601_elsatia_social.sql`.
2. **Modèle d'administration plateforme.** Dans le train (migrations 202, 235 à 238), l'autorisation passe par `plateforme_admins.utilisateur_id = auth.uid()` et `actif`, plus par l'email. `social_role_de` et `social_role_courant` doivent suivre ce modèle. La clé `email` et le rôle `total` existent toujours.
3. **AAL2.** Le train impose l'authentification forte (MFA) aux mutations plateforme sensibles. Il faut l'appliquer aussi à valider, publier, envoyer une réponse, connecter ou révoquer un compte et gérer l'équipe Social.
4. **Registre des variables.** Ajouter les variables Social à `config/env-manifest.json` (inventaire Preview généré).
5. **Re-qualification sur le train.** Rejouer les 408 + 1 migrations, puis les suites SQL/RLS du train, les 141 tests Social et le parcours navigateur.

Une fusion du train dans cette branche a été **refusée par le garde-fou de la session**. Le choix de la ligne d'intégration te revient (§ 8).

## 3. Procédure Preview, puis Production (à exécuter après le § 2)

### Preview

1. **Cible.** Dans le tableau de bord Supabase, noter le nom et la référence du projet Preview. Vérifier que `NEXT_PUBLIC_SUPABASE_URL` du déploiement Preview Vercel pointe sur cette référence et **pas** sur Production.
2. **Prérequis.** Exécuter `supabase/production/verifier_elsatia_social.sql` (sections 1 et 2). Résultats attendus :
   - `aucune_collision_avant = true` ;
   - `plateforme_admins` et `storage.buckets` présents.
3. **Ledger.** `select version from supabase_migrations.schema_migrations order by version desc limit 5;` La dernière version doit être celle du train qui précède la migration Social. Sinon, **stop** : appliquer d'abord le train avec sa propre procédure.
4. **Application.** `supabase db push` sur le projet Preview lié : uniquement les migrations en attente, jamais `--include-all`.
5. **Contrôles post-migration.** Relancer `verifier_elsatia_social.sql`. Résultats attendus :
   - 16 tables, toutes avec RLS ;
   - `authenticated` limité à `SELECT`, `anon` à rien ;
   - triggers présents ;
   - bucket `social-medias` privé.
6. **RLS par rôle** (requêtes PostgREST de la recette, `docs/ELSATIA_SOCIAL_RECETTE.md` § 3) :

   | Rôle | Attendu |
   |---|---|
   | `service_role` | Écrit. Verrou pris une seule fois. Journal non modifiable. |
   | Utilisateur authentifié | Lecture seule. Jetons inaccessibles. |
   | Anonyme | Tout refusé. |

7. **Application Social contre la vraie base.**
   - Bandeau MODE SIMULATION visible ; page Configuration sans contrôle bloquant ;
   - connexion OAuth des comptes ELSATIA, diagnostic lecture seule réussi ;
   - parcours brouillon → IA → aperçus → validation → simulation.
8. **Non-régression.** Suites du train (SQL/RLS, Vitest, Playwright Preview), connexion, tableau de bord, facturation, et applications satellites Tools, Colors et Réserves sur la même base.

### Production

Uniquement après qualification de Preview, une sauvegarde vérifiable et ton accord explicite. Mêmes étapes 1 à 8 sur le projet Production, en fenêtre annoncée. Retour arrière éventuel : `supabase/production/retour_arriere_elsatia_social.sql`, avant toute donnée réelle seulement. Ensuite, migration corrective.

## 4. Secrets : présence ou absence, jamais les valeurs

| Variable | Local (session) | Preview | Production |
|---|---|---|---|
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | absente | inconnu | inconnu |
| `META_APP_ID` | absente | inconnu | inconnu |
| `META_APP_SECRET` | absente | inconnu | inconnu |
| `META_WEBHOOK_VERIFY_TOKEN` | absente | inconnu | inconnu |
| `LINKEDIN_CLIENT_ID` | absente | inconnu | inconnu |
| `LINKEDIN_CLIENT_SECRET` | absente | inconnu | inconnu |
| `CRON_SECRET` | absente | inconnu | inconnu (absent lors d'un audit noté le 18/07/2026, à revérifier) |
| `SOCIAL_DRY_RUN` | absente (donc simulation) | inconnu | inconnu |

Le fichier `.env.local` de recette, qui contenait des valeurs factices, a été supprimé.

Pour vérifier Preview et Production sans afficher de valeur : `npx vercel env ls preview` puis `npx vercel env ls production`, qui listent les noms uniquement. La page `/plateforme/social/configuration` du déploiement fait le même contrôle côté serveur.

`SOCIAL_DRY_RUN=false` :
- n'a d'effet qu'avec `VERCEL_ENV=production` (vérifié par le code) ;
- ne doit être posé qu'en Production, après ton accord ;
- en Preview, ne jamais le définir.

## 5. Meta : prêt à configurer

| Élément | Valeur |
|---|---|
| Type d'application | Business, rattachée au portefeuille Meta Business ELSATIA. Produit **Facebook Login for Business**. |
| URI de redirection OAuth (Production) | `https://app.elsatia.fr/api/social/oauth/meta/callback` |
| URI de redirection OAuth (Preview) | `https://<domaine Preview>/api/social/oauth/meta/callback`. Le domaine Preview n'est pas établi : à confirmer. |
| URL de rappel Webhooks | `https://app.elsatia.fr/api/social/webhooks/meta`, avec le jeton `META_WEBHOOK_VERIFY_TOKEN` |
| Événements webhook | Objet **Page** : `feed`, `messages`. Objet **Instagram** : `comments`, `messages`. |
| Domaines de l'application | `app.elsatia.fr` |
| Paramètres de sécurité | « Exiger la clé secrète » **activé** (le code envoie `appsecret_proof`). Mode strict des URI de redirection activé. HTTPS imposé. |
| Version Graph API | `v26.0` (variable `META_GRAPH_API_VERSION`) |

**Permissions Facebook :**
- `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` ;
- `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata` ;
- `read_insights`, `business_management` ;
- `pages_messaging` (facultatif en V1).

**Permissions Instagram :**
- `instagram_basic`, `instagram_content_publish` ;
- `instagram_manage_comments`, `instagram_manage_insights` ;
- `instagram_manage_messages` (facultatif, exige une entreprise vérifiée).

**Configuration Facebook Login for Business :**
- type de jeton « User access token » ;
- actifs : la Page ELSATIA et son compte Instagram ;
- permissions : la liste ci-dessus ;
- reporter l'identifiant obtenu dans `META_LOGIN_CONFIG_ID` (facultatif : sans lui, le code envoie la liste de permissions).

**Procédure de test :**
1. « Tester l'application Meta » dans Configuration, qui vérifie la paire identifiant / secret ;
2. Comptes › Connecter via Meta, puis choisir la Page ELSATIA ;
3. vérifier le diagnostic automatique : identité, ID, permissions par ressource, expiration ;
4. « Activer les webhooks » ;
5. commenter une publication existante depuis un compte personnel, puis vérifier sa réception dans Commentaires.

Aucune écriture tant que la simulation est active.

**Passage en Live :**
- [ ] l'administrateur de l'application est un administrateur de la Page ELSATIA (Accès standard suffisant, sans App Review) ;
- [ ] URL de politique de confidentialité : `https://app.elsatia.fr/confidentialite` ;
- [ ] URL des conditions : `https://app.elsatia.fr/cgu` ;
- [ ] URL d'instructions de suppression des données (obligatoire) : à fournir, par exemple une section dédiée de la page de confidentialité ;
- [ ] icône de l'application 1024 × 1024 : **elle nécessite le logo officiel** ;
- [ ] catégorie de l'application et adresse e-mail de contact ;
- [ ] vérification d'entreprise, si la messagerie Instagram est voulue ;
- [ ] basculer l'application en **Live** : en mode Développement, les webhooks réels ne sont pas livrés.

## 6. LinkedIn : prêt à demander

| Élément | Valeur |
|---|---|
| Application | **Dédiée**, rattachée à la Page ELSATIA et vérifiée par un administrateur de la Page. La Community Management API doit être le seul produit de l'application. |
| URL de redirection (Production) | `https://app.elsatia.fr/api/social/oauth/linkedin/callback` |
| URL de redirection (Preview) | `https://<domaine Preview>/api/social/oauth/linkedin/callback` |
| Webhook | `https://app.elsatia.fr/api/social/webhooks/linkedin`. Le défi `challengeCode` et la signature `X-LI-Signature` sont gérés par le code. |
| Scopes | `w_organization_social`, `r_organization_social`, `rw_organization_admin` |
| Version d'API | `202609` (variable `LINKEDIN_API_VERSION`) |

**Éligibilité à vérifier :**
- entité juridique enregistrée (ELSATIA) ;
- Page Entreprise existante, avec un administrateur qui demande l'accès ;
- site et politique de confidentialité publics ;
- cas d'usage : gestion de la Page de l'entreprise elle-même.

**Demande d'accès :**
1. sur linkedin.com/developers, créer l'application, associer la Page ELSATIA, puis faire vérifier l'association par un administrateur de la Page ;
2. onglet *Products*, demander **Community Management API** : formulaire avec entité juridique, site, description du cas d'usage ;
3. palier Development d'abord. Le palier Standard se demande dans les 12 mois, avec une vidéo de démonstration par cas d'usage ;
4. après approbation, ajouter l'URL de redirection dans l'onglet *Auth* et vérifier que les trois scopes apparaissent ;
5. dans ELSATIA Social : Comptes › Connecter (LinkedIn), puis diagnostic. La page Configuration indique « accès confirmé » dès que `w_organization_social` est accordé.

En attendant l'approbation, tout le reste avance sans LinkedIn : Meta, migration, Preview. LinkedIn se branche ensuite sans changement de code.

## 7. Réception du logo officiel

Fichiers attendus, conformément à ta consigne : `public/elsatia/logo-officiel.svg`, `public/elsatia/symbole.svg`, `public/elsatia/logo-officiel-blanc.svg`.

À réception :
1. `npm run elsatia:logo` : contrôle, génération et couleurs dominantes ;
2. contrôle visuel des 9 déclinaisons ;
3. palette recalée dans `src/lib/elsatia/marque.ts` et `--elsatia-*` ;
4. vérification des favicons, du PWA, de l'Open Graph et des aperçus Social ;
5. retrait de toute identité provisoire.

Doublon à arbitrer : la branche non fusionnée `claude/adoring-volta-3jk98y` (« Branding ELSATIA V2 ») prévoit une autre convention, `public/branding/source/elsatia-logo-primary.svg` avec `npm run branding:icones`. Il faudra n'en garder qu'une.

## 8. Décision attendue

Sur quelle ligne intégrer ELSATIA Social ?
- **Option recommandée** : intégrer au train canonique (`integration/elsatia-canonical-train-v9.2` ou son successeur) avec les adaptations du § 2. C'est la seule ligne qui peut aller en Preview.
- Autre option : garder `main` comme cible. Ce n'est cohérent que si `main` redevient la ligne de déploiement, ce que l'état actuel des branches contredit.
