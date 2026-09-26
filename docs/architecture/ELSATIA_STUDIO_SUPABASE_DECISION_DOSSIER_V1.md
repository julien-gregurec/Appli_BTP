# ELSATIA Studio — Dossier de décision d'architecture Supabase V1

**Partagé (A) ou dédié (B) ?**

Date : 2026-09-26. Deux missions successives, **documentation et POC local uniquement** :

1. *Dossier initial* (branche `claude/focused-rubin-fboixg` @ `d7f5fb34`) : comparaison A/B,
   identité commune, POC d'échange d'identité (6/6 en mémoire, 9/9 contre un vrai GoTrue).
2. *Finalisation* (ce document, branche `claude/brave-pasteur-28vkel`) : comparatif complet sur
   15 axes, architecture formalisée, modèle de menaces ciblé, **révocation et modes de défaillance
   testés réellement contre deux GoTrue v2.192.0**, chemin de migration, page de décision.

**Aucun déploiement, aucun projet Supabase distant créé, lié, interrogé ou modifié.** Aucune
migration ni code applicatif modifié. **Ce dossier ne tranche pas** : il prépare la décision de
Julien.

Base de lecture : tronc `origin/integration/elsatia-canonical-train-v1` @ `1c1fed66` (328
migrations), plus les branches citées au §1. Les chemins de fichiers sans préfixe désignent ce
tronc. « BR » désigne `origin/fix/studio-signup-closed-v1` @ `634651a0`.

---

## Verdict

```
OWNER DECISION READY
```

**Page de décision (courte, sans score ni recommandation) :
[`ELSATIA_STUDIO_SUPABASE_OWNER_DECISION_V1.md`](ELSATIA_STUDIO_SUPABASE_OWNER_DECISION_V1.md).**

Tous les faits nécessaires à la décision sont établis. Les deux options sont décrites sur les
mêmes 15 axes (§2). L'architecture « Studio dédié + compte ELSATIA commun » est formalisée (§3)
et **prouvée localement : 32/32 tests contre deux vrais GoTrue v2.192.0** (§9), dont la
révocation (§5) et les pannes (§6).

### Résumé factuel

1. Studio est **techniquement séparable** : ses 9 migrations sur le tronc (16 avec le lot
   post-H) ne référencent que `auth.users` et `storage.*`. Aucune autre migration ne référence
   Studio (Qualification V3 §2.1).
2. Studio **n'utilise pas** le modèle d'accès ELSATIA : il est absent de `applications_elsatia`,
   ne fait aucun appel à `a_acces_application` et n'a **aucune facturation**. Le seul lien réel
   avec le reste d'ELSATIA est l'**identité** (`auth.users`), et aujourd'hui il ne sert qu'à
   réutiliser le même mot de passe : il n'existe **pas de SSO** entre les apps.
3. **A (partagé)** — ce qui le caractérise :
   - identité commune native (même UUID), zéro projet en plus, droits lisibles par jointure SQL ;
   - la clé `service_role` du web Studio **et** du worker vidéo ouvre **toute la base ELSATIA** ;
   - les réglages Auth (mot de passe, confirmation e-mail, gabarits, `site_url`, durée des JWT)
     sont **communs** à GP, Colors, Tools, Réserves et Studio ;
   - la suppression de compte Studio prévue (post-H) appelle `deleteUser`, qui **supprimerait
     le compte ELSATIA commun** (à corriger avant portage).
4. **B (dédié)** — ce qui le caractérise :
   - rayon d'impact d'une clé Studio borné à Studio (**prouvé** : une clé d'un projet est
     refusée par l'autre, `403 bad_jwt`) ; réglages Auth propres ; inscription fermée au niveau
     Auth (**prouvé** : `422 signup_disabled`) ;
   - 2 projets Supabase de plus, une seconde chaîne de migrations ;
   - l'identité commune demande un **pont** (I1 prouvé) et un **webhook de révocation** : sans
     lui, un compte désactivé centralement **garde sa session Studio indéfiniment** (prouvé, §5 R1).
5. Constats nouveaux, **valables dans les deux options** (même GoTrue) :
   - GoTrue répond **200 sur `GET /user` pour un utilisateur banni** : bannir ne coupe pas une
     session ouverte ; il faut **supprimer les sessions** (aucune route admin pour cela en
     v2.192.0 → RPC SQL) ;
   - un access token reste valide **jusqu'à son `exp`** pour PostgREST/RLS (vérification sans
     état) : fenêtre résiduelle = `jwt_expiry`, **3600 s** dans les deux `config.toml` ;
   - rejouer le refresh token **immédiatement précédent** renvoie le token actif (tolérance
     « fail-to-save ») ; la détection de vol ne se déclenche qu'à partir d'un retard de 2.
6. Studio n'a **aucune donnée de Production**. Choisir maintenant coûte de la configuration et
   du code ; changer d'option après commercialisation impose une migration de comptes, de
   fichiers vidéo et de lignes (§8).
7. **Contradiction historique à solder.** BR cite une « **décision Julien Q-004
   (2026-09-20)** : Studio dispose de son propre projet Supabase ». Le tronc a ensuite été
   construit en **partagé** (hardening V1, 2026-09-22), en s'appuyant sur
   `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md`, qui interdit un second système d'auth. Les deux ne
   peuvent pas rester vrais en même temps. La décision les réconcilie dans un sens ou dans l'autre.

---

## 1. Base : ce qui a été lu

| Document demandé | Emplacement réel | Ce qu'on en retient |
|---|---|---|
| **Studio Final Qualification V3** | `docs/qualification/ELSATIA_STUDIO_FINAL_LOCAL_QUALIFICATION_V3.md` (branche `claude/festive-knuth-z26hq9` @ `cf89b9ec`) | Verdict `STUDIO ARCHITECTURE DECISION REQUIRED`. §2 = premier comparatif A/B, repris et approfondi ici. Simulation « projet dédié » : 9/9 migrations Studio seules appliquées ; `studio_workspace_foundation.test.sql` **échoue** (dépend de `utilisateurs_entreprises`). |
| **Studio Auth** | `docs/qualification/ELSATIA_STUDIO_AUTH_CLOSED_SIGNUP_HARDENING_V1.md` (tronc) | Fermeture de l'inscription **à la frontière workspace** (`studio_signup_policy` + `studio_create_workspace`, migration `20260922000325`). Le hook `before_user_created` est **rejeté parce que le projet est partagé**. |
| Studio Auth (lignée dédiée) | BR : `docs/qualification/ELSATIA_STUDIO_SUPABASE_DEDICATED_RUNBOOK.md`, `ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md`, `apps/studio/supabase/config.toml` | Lignée « Q-004 » : projet dédié, hook Auth, contrat de jeton d'habilitation signé (JWS, JWKS, `aud=studio`). |
| **Canonical merge plan** | `docs/qualification/ELSATIA_CANONICAL_TRAIN_MERGE_PLAN_V1.md` (tronc) | §7 : lot Studio post-H (7 migrations, ~61 fichiers) classé `REQUIRES ARCHITECTURAL DECISION`. Le déplacement des migrations (racine ou `apps/studio/supabase`) **est** la décision. STEP 8 bloqué. |
| **Shared identity architecture** | `docs/architecture/ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md`, `ELSATIA_MULTI_APP_CONVERGENCE_V1.md`, `docs/securite/reset-password-multiapp.md` (tronc) | Une identité unique : `auth.users` du projet principal. « Ne créez pas un second système d'authentification ». **SSO : non implémenté**, reconnexion avec les mêmes identifiants. Gabarits e-mail uniques au projet, d'où le relais de jeton GP→Colors pour la réinitialisation de mot de passe. |
| Registre de décisions | `config/env-manifest.json` L547-553 | `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`, owner Julien, 2 options. |

Faits de code relevés sur le tronc (références exactes) :

**Client et session**

- Le client Studio lit `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Cookie `elsatia-studio-auth`, sans attribut `domain` (`apps/studio/src/lib/config.ts:1-19`).
- Les autres apps utilisent le cookie `@supabase/ssr` par défaut, lui aussi par hôte. **Aucune
  session n'est partagée aujourd'hui.**
- Aucun code d'échange de jeton, de `setSession`, de JWKS ni de `jose`/`jsonwebtoken` dans le
  dépôt. Les seuls helpers HMAC sont ceux de `src/lib/stripe.ts` et `src/lib/banking.ts`.

**Clé `service_role` (`STUDIO_STORAGE_SERVICE_KEY`)**

- Côté web Studio, elle est lue dans `apps/studio/src/lib/storage-admin.ts` et utilisée par :
  - `media-service.ts` : URLs signées, `update` direct de `studio_media_assets` hors RLS,
    `studio_finish_media` ;
  - `renders.ts`.
- Côté worker, elle est lue dans `workers/studio-video/src/worker.ts:20-36`,
  `analysis-worker.ts:28-34` et `reconcile.ts`. Elle y sert à appeler :
  - les RPC `studio_render_dispatch`, `studio_claim_render`, `studio_render_progress`,
    `studio_complete_render` et `studio_*analysis*` ;
  - l'API REST Storage, avec `Authorization: Bearer <clé>`.
- Le manifeste la qualifie de « privilège maximal » (L894-917).

**Réglages Auth**

| Réglage | Tronc `supabase/config.toml` | BR `apps/studio/supabase/config.toml` |
|---|---|---|
| `minimum_password_length` | 6 | 12 |
| `enable_confirmations` | false | true |
| `secure_password_change` | false | true |
| `site_url` | GP | Studio |
| Gabarits | `confirm_signup.html` / `reset_password.html` | propres à Studio |
| Hook `before_user_created` | commenté | actif |

**Clés étrangères vers `auth.users`**

- `studio_workspaces.owner_user_id` et `studio_workspace_members.user_id` sont en
  `on delete restrict`.
- 6 autres références sont sans clause (`NO ACTION`).
- Au total : 8 références dans les 9 migrations du tronc, et 4 de plus dans le lot post-H.

**Storage**

- Buckets `studio-originals` et `studio-renders` : 1 GiB par fichier, privés, gardes
  **restrictives** pour `anon`/`authenticated`.
- Le projet partagé a `file_size_limit = "50MiB"` (`supabase/config.toml:118`). Les 11 buckets
  non-Studio relevés ont tous une limite explicite, de 2 Mio à 250 Mio.


---

## 2. Shared vs Dedicated

### 2.1 Comparatif sur les 15 axes

Chaque cellule décrit **ce qui se passe**. Aucune pondération. Référence : P = prouvé dans ce
dossier (test cité), C = constaté dans le code du dépôt, E = estimation.

| Axe | A — Shared (projet partagé) | B — Dedicated (projet Studio) |
|---|---|---|
| **Identity** | Un seul `auth.users` ; même UUID dans toutes les apps. Pas de SSO : Studio a son cookie (`elsatia-studio-auth`), l'utilisateur ressaisit le même mot de passe (C). | Deux `auth.users`. Compte ELSATIA commun via le pont I1 : un clic « Continuer avec mon compte ELSATIA », sans ressaisie si la session GP est ouverte (P : tests 10-15). Deux sessions techniques. |
| **Auth config** | Un seul jeu : `site_url`, redirections, SMTP, gabarits, rate limits, hooks, `jwt_expiry`, MFA (C). Tout changement pour Studio change GP. | Jeu propre à Studio ; aucun effet sur GP (P : les deux GoTrue de test ont des réglages différents). Deux jeux à maintenir. |
| **Password policy** | Globale : 6 caractères dans le tronc. Studio vérifie 12 dans sa Server Action, mais un compte GP à 6 caractères entre dans Studio (C). | Via I1 : **pas de mot de passe Studio** ; c'est la politique de la plateforme qui s'applique à la connexion. Si login Studio local (I3 ou secours) : 12 caractères appliqués par GoTrue Studio. |
| **Email confirmation** | Globale, `false` dans le tronc. L'activer pour Studio l'active pour GP (C). | Studio peut l'exiger. Via I1, le broker refuse si `email_confirmed_at` est nul côté plateforme (P : test 16 `EMAIL_NOT_VERIFIED`) : la preuve de possession de l'e-mail dépend alors du réglage **plateforme**. |
| **service_role blast radius** | Clé du projet partagé dans le web Studio + 3 processus worker → lecture/écriture de **toutes** les données ELSATIA en cas de fuite (C). | Clé Studio → **données Studio seulement** ; refusée par le projet partagé (P : S5, `403 bad_jwt`). La clé privée du broker (côté GP) permet, si elle fuit, de se connecter à Studio comme un utilisateur lié (pas d'accès GP). |
| **Storage** | Buckets cohabitants ; plafond global d'upload à relever à ≥ 1 Gio **pour tout le projet** ; quotas et egress mutualisés (C). | Isolé ; plafond 1 Gio sans effet ailleurs ; quotas et egress propres (C). |
| **RLS** | Isolation logique ; gardes restrictives prouvées par la V3 §6. Chaque migration de toute app peut toucher un objet partagé (C). | Même RLS Studio, plus l'isolation physique. Pas de migration d'une autre app sur la base Studio. |
| **Worker** | Charge RPC/Storage sur la base GP (pool, compute) ; clé de toute la plateforme chez un hébergeur non encore choisi (C). | Charge sur la base Studio ; clé Studio seulement. |
| **Billing** (produit) | Droits par jointure SQL (précédent Tools : `entitlements_utilisateurs_elsatia`, `portee_donnees='compte'`) (C). | Stripe reste côté plateforme ; Studio reçoit une **décision** (claim `ent` + webhook `entitlement_*`) (P : R7). Contrat versionné à maintenir. |
| **Backup** | Un PITR/backup pour tout ; objets Storage à sauvegarder à part ; les vidéos gonflent le périmètre objets de la plateforme (C). | Backup et rétention propres à Studio ; objets à part (C). Add-ons ×2 s'ils sont pris. |
| **DR** | Restauration tout-ou-rien : un incident Studio ne se restaure pas par PITR sans ramener GP en arrière (C). | Restauration Studio isolée. Broker = dépendance pour les **nouvelles** connexions ; sessions en cours intactes si la plateforme tombe (P : F1). |
| **Monitoring** | Un tableau de bord ; métriques Studio à isoler manuellement. | Deux tableaux de bord ; métriques Studio nettes ; en plus : broker, file de webhooks, table anti-rejeu. |
| **Cost** | 0 projet en plus ; compute partagé peut-être à monter d'une taille ; coût vidéo non attribuable (E). | +2 projets (Preview, Production) ; coût vidéo attribuable ; total variable quasi identique (E, §7 — **tarifs à revérifier**). |
| **Operations** | 1 chaîne de migrations, 1 config Auth, 1 rotation de clé (qui touche toutes les apps). | 2 chaînes, 2 configs, rotations indépendantes, + clé du broker (rotation par `kid`, P : test 17) et webhook de révocation à exploiter. |
| **Support** | Un compte, un mot de passe ; mais « supprimer mon compte Studio » doit être réécrit pour ne pas tuer le compte commun (C). | Un compte ELSATIA ; diagnostics sur deux systèmes (« je n'arrive pas à entrer dans Studio » : broker, lien, droit, ban). Codes d'erreur stables (P : §6). |

### 2.2 Option A — détail (état actuel du tronc)

| Axe | Analyse | Constat ou risque précis |
|---|---|---|
| **Auth** | Un seul GoTrue pour GP, Colors, Tools, Réserves et Studio. Même `auth.users.id` partout. Studio garde un cookie distinct : un utilisateur GP connecté **n'est pas** connecté à Studio, il se reconnecte avec le même mot de passe. | Tout réglage Auth est **global** : `site_url`, redirections, SMTP, gabarits, politique de mot de passe, confirmation, rate limits, MFA, hooks. Studio ne peut pas avoir de réglage propre. |
| **Rayon d'impact `service_role`** | `STUDIO_STORAGE_SERVICE_KEY` = clé `service_role` (ou secrète) **du projet partagé**. Elle est détenue par le web Studio (Vercel), le worker de rendu, le worker d'analyse et le script de réconciliation, soit **4 processus**. Le worker est long, exécute FFmpeg sur des médias fournis par les utilisateurs et tournera chez un hébergeur tiers non encore choisi (`DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER`). | Une fuite de cette clé côté worker (RCE via un média malveillant traité par FFmpeg, variable d'environnement exposée, image compromise) donne **lecture et écriture sur toutes les tables et tous les buckets ELSATIA** : paie, factures, documents employés, données clients GP, Colors, Tools et Réserves. La RLS ne protège pas contre `service_role`. **C'est le risque dominant de l'option A.** Mitigation partielle possible (voir la ligne suivante), mais aucune ne ramène le rayon à « Studio seul » tant qu'une clé de niveau projet est utilisée. |
| Mitigation de la clé en A | (a) Remplacer la clé service du worker par un **rôle Postgres dédié** (`studio_worker`) qui n'a que `EXECUTE` sur les RPC `studio_*` et un accès Storage limité à 2 buckets. Il faut alors un JWT signé portant `role=studio_worker`, ce qui exige de détenir le secret JWT du projet (pire) ou un émetteur maison. (b) Faire passer le worker par une **API interne Studio** (Edge Function ou route serveur) qui seule détient la clé : le worker ne reçoit que des URLs signées à durée courte. | (a) Les clés d'API Supabase ne permettent pas de fabriquer un rôle personnalisé sans maîtriser la signature JWT du projet. Non trivial, et à revérifier sur la plateforme au moment de la décision. (b) Réaliste, mais c'est du **nouveau code** (≈ 3-5 j, estimation) et la clé reste dans le web Studio (Vercel). |
| **RLS** | Isolation logique par RLS et policies restrictives. Prouvé par la V3 §6 : une policy permissive `using(true)` ajoutée par une autre app ne perce pas la garde Studio. Contre-épreuve : 8 échecs si la garde est retirée. | Correct aujourd'hui. **Couplage futur** : chaque migration de n'importe quelle app peut toucher un objet partagé (`storage.objects`, `auth.users`, extensions, rôles). La non-régression Studio dépend de la discipline de toutes les équipes. Les 7 suites pgTAP Studio sont d'ailleurs **cassées** sur le tronc (V3 §5.3) sans que personne ne l'ait vu. |
| **Storage** | Buckets cohabitants, gardes restrictives. **Plafond global du projet** : 50 Mio en local, alors que Studio exige 1 Gio par fichier. | Pour Studio, le plafond global d'upload du projet doit monter à ≥ 1 Gio, ce qui vaut **pour tout le projet**. Les buckets existants ont des limites explicites, donc l'impact direct est faible, mais tout nouveau bucket sans limite héritera de 1 Gio. **Quotas mutualisés** : stockage, egress, bande passante Storage. Un pic vidéo Studio consomme le quota et la facture de GP. |
| **Confirmation e-mail** | Globale au projet. Aujourd'hui `false` dans la config du tronc (valeur hébergée non versionnée : `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`). | Studio la veut `true` (sinon l'invitation est « squattable » : quelqu'un crée un compte sur l'adresse d'un invité avant lui, voir la convergence d'accès V1.1 §10). L'activer change aussi le parcours d'inscription GP. **Arbitrage commun obligatoire.** |
| **Politique de mot de passe** | Globale : 6 caractères dans la config du tronc, 12 voulus par Studio. | Studio applique 12 dans sa Server Action (`actions.ts:47-56`), mais un compte créé via GP avec 6 caractères se connecte à Studio avec ces 6 caractères. **La politique Studio est de fait celle de GP.** |
| **Inscription Studio** | Fermée à la **frontière workspace** (`studio_create_workspace`, défaut `closed`) : tout compte ELSATIA peut exister, mais n'obtient pas d'espace Studio. Le hook Auth est exclu parce qu'il fermerait GP. | Suffisant pour protéger la ressource (V3 §5.2, 34/34). Reste un vrai `POST /auth/v1/signup` qui crée un compte ELSATIA sans consentement Studio. C'est déjà possible via GP (ouvert par design), donc **pas une régression, mais pas une fermeture Auth**. Les gabarits d'e-mail de confirmation et de récupération sont ceux de GP (`site_url` GP) : Studio n'a **aucune route de récupération** (`/auth/confirm` n'accepte que `type=email`). Il faudrait un relais comme celui de Colors (`reset-password-multiapp.md`). |
| **Worker** | Même projet : mêmes RPC `service_role`, Storage REST. | Voir la ligne rayon d'impact. De plus, la charge du worker (requêtes RPC, Storage) partage le **pool de connexions et le compute** de la base GP. |
| **Billing (produit)** | Rien côté Studio. En A, la voie naturelle est le **précédent Tools** : droits par compte dans `entitlements_utilisateurs_elsatia` (`portee_donnees='compte'`), alimentés par webhook Stripe via `tools_server_appliquer_abonnement` (service_role). Studio pourrait lire ses droits par jointure SQL. | **Avantage réel de A** : entitlement par simple jointure, sans API ni jeton. Travail : ajouter `studio` au catalogue, des SKU Studio et un résolveur `studio_resoudre_entitlements()`. |
| **Billing (Supabase)** | Une facture, un plan. | Coût Studio (vidéo, stockage, egress) **non isolable**. Un compute sous-dimensionné pour la vidéo pénalise GP. |
| **Entitlements** | Catalogue commun accessible. Studio est **compte-centré**, alors que le modèle `a_acces_application` est **entreprise-centré**. Le précédent Tools montre qu'on peut combiner les deux. | Faisable sans nouveau mécanisme d'échange. |
| **Suppression de compte / RGPD** | Le lot post-H (BR) finit par `admin.auth.admin.deleteUser(userId)` (`apps/studio/src/lib/account-deletion.ts:38`). | **P0 en A** : « supprimer mon compte Studio » **supprimerait le compte ELSATIA commun**, donc l'accès GP, Colors, Tools et Réserves. Il faudrait réécrire la suppression pour purger seulement les données Studio. À l'inverse, les FK Studio `restrict`/`NO ACTION` sur `auth.users` **bloqueraient** une future suppression de compte ELSATIA tant que des données Studio existent. |
| **Backup** | Un seul PITR ou backup quotidien pour tout. | Les objets Storage ne sont **pas** inclus dans les backups base Supabase : il faut une sauvegarde objets séparée dans les deux options. En A, les vidéos Studio (volumineuses) gonflent le périmètre de sauvegarde objets de la plateforme entière. |
| **DR** | Restaurer = restaurer **toutes** les apps au même point. | Un incident de données Studio (bug de purge, corruption) ne peut pas se restaurer par PITR sans ramener GP en arrière (factures, pointages). Une restauration partielle demande une restauration dans un projet temporaire puis une copie sélective des lignes `studio_*` : procédure manuelle, non outillée. |

### 2.3 Option B — détail (lignée BR, prête dans `apps/studio/supabase/`)

| Axe | Analyse | Constat ou risque précis |
|---|---|---|
| **Identité** | GoTrue propre : `auth.users` Studio distinct. Un utilisateur GP et un utilisateur Studio sont **deux comptes** (UUID différents). | Sans pont d'identité : deux mots de passe, deux comptes, et le contrat `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` (« pas de second système d'auth ») est **contredit**. Il doit alors être amendé explicitement pour Studio. Avec un pont (§3) : un compte ELSATIA, deux sessions techniques. |
| **SSO** | Aujourd'hui aucune app n'a de SSO : même en A, on se reconnecte. | En B avec le pont I1 ou I2 : un clic « Continuer avec mon compte ELSATIA », **sans ressaisie** si la session GP est ouverte. C'est une expérience **meilleure qu'en A actuel**, mais à construire. |
| **Liaison de comptes** | Table `studio_identity_links(platform_subject → user_id)`. | Règle clé, prouvée par le POC : **jamais de liaison automatique par e-mail**. Si un compte Studio existe déjà avec la même adresse, il faut une double preuve : session Studio **et** jeton plateforme. Sinon, quiconque contrôle l'adresse côté plateforme prend le compte Studio. |
| **JWT** | Chaque projet a ses clés de signature. Les JWT Studio ne sont **jamais** valides sur le projet partagé, et inversement. | Isolation cryptographique par construction. Le jeton de passage (handoff) est un JWS **asymétrique** distinct des JWT Supabase : Studio ne détient que la clé publique du broker. **Ne pas** partager le secret JWT entre projets (§3.9). |
| **Synchronisation des droits** | La plateforme reste l'autorité (catalogue, Stripe). Studio reçoit une **décision** : claim `ent` du jeton à chaque connexion. S'y ajoute un canal de révocation : webhook signé plateforme→Studio, ou relecture périodique. | Délai de révocation = min(prochaine connexion, prochain push) : secondes avec push, TTL de session Studio sinon. **Fail-closed** : pas de droit, pas de nouveau compte. Droit retiré : lecture seule, jamais suppression (prouvé par le POC, test 6). Nouveau code des deux côtés : émetteur, endpoint de révocation, table de cache. |
| **Cycle de vie utilisateur** | Création : au premier échange (admin API Studio). Changement d'e-mail plateforme : lien par sujet, donc même compte Studio (POC test 2) ; mise à jour de l'e-mail Studio à prévoir. Suppression : la suppression Studio (post-H) devient **correcte telle quelle** (`deleteUser` ne touche que Studio). Suppression du compte ELSATIA : événement plateforme→Studio à propager. | Deux cycles de vie à réconcilier : un compte ELSATIA supprimé laisse un compte Studio orphelin, il faut un événement de suppression. |
| **Billing (produit)** | Stripe reste côté plateforme. Studio ne voit que `ent.plan` / `capabilities`. | Pas de jointure SQL : **contrat versionné** (claims) à maintenir. |
| **Billing (Supabase)** | Projets supplémentaires facturés (§7). | Coût Studio **isolé et mesurable** : utile pour le prix de revient d'un produit vidéo. |
| **Storage** | Isolation physique. Plafond global du projet fixé à 1 Gio **sans effet** sur les autres apps. Quotas et egress propres. | Les gardes restrictives restent (défense en profondeur). |
| **Worker** | Clé service **du projet Studio** uniquement. | Rayon d'impact d'une fuite = données Studio seules. Toujours sérieux (médias clients), mais **borné**. |
| **Backup** | PITR ou backup propre au projet Studio, dimensionné pour lui. Sauvegarde objets séparée (vidéos). | Politique de rétention propre à Studio, découplée de la paie GP (qui a ses contraintes légales). |
| **DR** | Restauration Studio sans toucher GP, et inversement (runbook BR §6). | Mais DR du **pont d'identité** : si le broker (projet partagé) est indisponible, les **nouvelles** connexions « via ELSATIA » échouent. Les sessions Studio en cours continuent (refresh token Studio). Option : login Studio local de secours, qui ajoute un mot de passe Studio. |
| **Migrations** | Deux chaînes : racine (GP+) et `apps/studio/supabase` (liens symboliques, contrôle `scripts/studio-supabase-check.mjs` sur BR). | La racine doit **retirer ou geler** les 9 migrations Studio (sinon tables Studio mortes sur le projet partagé). `studio_workspace_foundation.test.sql` doit être scindé (V3 §2.3). La CI doit exécuter deux `db reset`. |
| **Inscription** | `enable_signup=false` au niveau GoTrue Studio **plus** création uniquement par l'échange (admin API), **ou** hook `before_user_created` (BR). | **Prouvé** sur GoTrue réel : `POST /signup` → `422 signup_disabled`, alors que `admin/users` fonctionne (§9). Fermeture **à la frontière Auth**, ce qui est impossible en A. |

---

## 3. Dedicated + compte ELSATIA commun : architecture formalisée (I1)

Contraintes vérifiées dans le dépôt : Next.js 16.3.5, `@supabase/ssr` 0.12, `supabase-js` 2.110,
GoTrue v2.192.0 (version du harnais) ; aucune librairie JWT nécessaire (`node:crypto`) ; cookies
par hôte sans `domain` partagé (contrat existant) ; Gestion Pro héberge déjà le « compte
ELSATIA » (Colors y renvoie via `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`) ; Studio vérifie l'identité
par `auth.getUser()` à chaque requête (`apps/studio/src/proxy.ts:45`, `workspaces.ts:14`,
`media-service.ts:27`).

### 3.1 Composants et frontières de confiance

```
┌──────────── Projet PARTAGÉ (identité centrale) ───────────┐     ┌──────────── Projet DÉDIÉ Studio ─────────────┐
│ GoTrue plateforme : auth.users ELSATIA (source de vérité)  │     │ GoTrue Studio : auth.users Studio (dérivés)  │
│ Route GP /compte/studio-handoff  ── clé PRIVÉE ES256 ──┐   │     │ Route Studio /auth/elsatia/exchange          │
│ JWKS public /.well-known/elsatia-handoff-jwks.json     │   │     │   ├ JWKS mis en cache (clé PUBLIQUE seule)   │
│ Émetteur de webhooks de cycle de vie (même clé, typ ≠) │   │     │   ├ studio_handoff_jti (anti-rejeu)          │
│ Catalogue / Stripe → décision d'accès `ent`            │   │     │   ├ studio_identity_links (sujet → user)     │
└────────────────────────────────────────────────────────┼───┘     │   └ studio_account_entitlements (cache)      │
                                                         │         │ Route Studio /api/elsatia/lifecycle (webhook)│
                        navigateur (POST auto-submit) ───┴────────▶│ clé service Studio (jamais vue de GP)        │
                                                                   └──────────────────────────────────────────────┘
```

Invariants : Studio ne détient **aucune** clé de la plateforme (seulement le JWKS public) ; la
plateforme ne détient **aucune** clé Studio ; aucune donnée métier ne traverse, seulement
identité + décision d'accès ; aucun JWT Supabase n'est forgé (chaque GoTrue signe ses propres
sessions).

### 3.2 Identité centrale

- **Source de vérité** : `auth.users` du projet partagé. Le compte ELSATIA y est créé, confirmé,
  désactivé, supprimé.
- **Vérification de session en ligne** : la route handoff appelle `GET /user` avec la session GP
  (équivalent `auth.getUser()`), jamais une simple lecture de cookie.
- **Relecture de l'état du compte** (admin) avant toute émission : `banned_until`, `deleted_at`,
  `email_confirmed_at`. **Nécessaire** car GoTrue v2.192.0 répond `200` à `GET /user` pour un
  utilisateur banni (constaté, §5 R1). Refus : `ACCOUNT_DISABLED`.
- **Sujet par audience** : `sub = base64url(SHA-256(iss | aud | auth.users.id))`. Stable, opaque,
  différent pour chaque app cliente ; l'UUID brut ne sort jamais (P : S3).

### 3.3 Échange signé (jeton de passage)

| Élément | Valeur | Contrôle côté Studio (code d'erreur) |
|---|---|---|
| En-tête `alg` | `ES256` uniquement | `ALG_REJECTED` (`none`, `HS256` refusés — P : test 16) |
| En-tête `typ` | `elsatia-handoff+jwt` | `TYP_REJECTED` (un événement de révocation n'est pas un jeton de passage — P : R8) |
| En-tête `kid` | clé active du JWKS | `UNKNOWN_KID` après **une** relecture du JWKS (P : test 17) |
| `iss` | URL de l'émetteur **par environnement** | `BAD_ISSUER` (P : S2) |
| `aud` | `studio` | `BAD_AUDIENCE` (P : test 16, S3) |
| `iat`/`nbf`/`exp` | TTL 60 s | tolérance d'horloge ±30 s : `EXPIRED`, `NOT_YET_VALID` (P : F3) ; TTL > 300 s → `TTL_TOO_LONG` (P : S4) |
| `nonce` | valeur du cookie httpOnly posé par Studio au départ | `NONCE_MISMATCH` (P : S1) |
| `email`, `email_verified` | depuis la relecture admin | `EMAIL_NOT_VERIFIED` si faux |
| `ent` | `{granted, plan, valid_until}` | pas de droit → pas de nouveau compte (`NOT_ENTITLED`) ; compte existant → `read_only` |
| `jti` | UUID aléatoire | consommé une fois : `REPLAY` (P : test 16, F4) |

Transport : **POST auto-submit** du navigateur vers Studio (jamais en query string : pas de fuite
dans les journaux, `Referer` ou historique).

### 3.4 Jeton à usage unique

Deux usages uniques s'enchaînent :

1. **Jeton de passage** : `jti` inséré dans `studio_handoff_jti` (clé primaire) **avant** tout
   effet de bord. En concurrence réelle sur PostgreSQL, 3 soumissions simultanées du même jeton
   donnent **1 succès et 2 `REPLAY`** (P : F4). Conséquence assumée : après une panne en aval, le
   jeton est perdu et l'utilisateur relance un passage (redirection automatique) (P : F2).
2. **Lien magique interne** : `admin/generate_link(magiclink)` produit un `token_hash` consommé
   aussitôt par `verify` côté serveur Studio ; aucun e-mail n'est envoyé ; un second `verify`
   renvoie `403 otp_expired` (P : dossier initial).

### 3.5 Création de session

- **Premier passage** : aucun lien → droit exigé → recherche d'un utilisateur Studio portant
  `app_metadata.elsatia_subject = sub` (reprise d'un provisioning interrompu) → sinon, si un
  utilisateur Studio existe avec le même e-mail : **refus `ACCOUNT_LINK_REQUIRED`** (jamais de
  liaison automatique par e-mail) → sinon `admin.createUser(email_confirm, app_metadata)` → lien.
- **Création concurrente** (deux onglets) : GoTrue renvoie **`500` avec le code Postgres `23505`**
  (`users_email_partial_key`), pas `422 email_exists` (constaté). Le code d'échange le traite
  comme une course et relit par sujet : un seul utilisateur Studio (P : F4b).
- **Session** : `generate_link` + `verifyOtp(token_hash)` via le client SSR Studio → cookies
  `elsatia-studio-auth` posés par GoTrue Studio. JWT de session : `role=authenticated`, `aal1`,
  `amr=[otp]`, `session_id` propre à l'appareil (P : R5).
- **Passages suivants** : lien par **sujet**, pas par e-mail : un changement d'e-mail côté
  plateforme retrouve le même utilisateur Studio (P : tests 11/14).

### 3.6 Révocation

Contrat d'événement plateforme → Studio (webhook `POST`, corps = JWS) :

| Champ | Valeur |
|---|---|
| En-tête | `alg=ES256`, `typ=elsatia-revocation+jwt`, `kid` (même JWKS que le passage) |
| `iss`, `aud`, `sub` | identiques au passage (sujet par audience) |
| `reason` | `account_disabled` · `account_enabled` · `account_deleted` · `entitlement_revoked` · `entitlement_granted` |
| `ent` | nouvelle décision d'accès (facultatif) |
| `jti`, `iat`, `nbf`, `exp` | anti-rejeu et TTL comme le passage |

Effets côté Studio (P : R2, R3, R7, R8) :

| `reason` | Cache de droit | GoTrue Studio | Sessions |
|---|---|---|---|
| `account_disabled` / `account_deleted` | `account=disabled/deleted`, `granted=false` | ban (`ban_duration=876000h`) | **toutes supprimées** (RPC SQL) |
| `account_enabled` | `account=active` | ban levé | anciennes non ressuscitées : reconnexion |
| `entitlement_revoked` | `granted=false` → `read_only` | inchangé | conservées (consultation/export) |
| `entitlement_granted` | `granted=true` → `full` | inchangé | conservées |

Garanties : idempotent par sujet ; sujet inconnu → `applied=false` (aucun effet) ; événement
rejoué → `REPLAY` ; audience d'une autre app → `BAD_AUDIENCE` ; un jeton de passage émis
**avant** la désactivation et présenté **après** est refusé (`ACCOUNT_DISABLED`, P : R2).
Transport (à construire, non prouvé) : file sortante côté plateforme avec réessais exponentiels,
plus une **réconciliation périodique** (Studio relit l'état des sujets liés) pour couvrir un
webhook perdu.

### 3.7 Cycle de vie du compte

| Événement | Côté plateforme | Côté Studio | Preuve |
|---|---|---|---|
| Création compte ELSATIA | inscription GP (ouverte) | rien tant que l'utilisateur ne vient pas | — |
| Premier accès Studio | handoff (droit requis) | utilisateur Studio + lien créés | tests 10/13 |
| Compte Studio préexistant (même e-mail) | handoff | refus, puis liaison explicite avec **session Studio + jeton** | tests 12/15 |
| Changement d'e-mail | e-mail modifié | même utilisateur (lien par sujet) ; e-mail Studio à resynchroniser | tests 11/14 |
| Nouvel appareil | handoff | nouvelle session, même utilisateur | R5 |
| Appareil perdu | — | suppression de **cette** session (`session_id`) ; les autres restent | R5 |
| « Déconnecter mes autres appareils » | — | `logout?scope=others` | R6 |
| Droit retiré / rétabli | Stripe → `entitlement_*` | `read_only` ↔ `full`, session conservée | R7 |
| Compte désactivé | ban plateforme + `account_disabled` | ban + suppression des sessions | R1, R2 |
| Compte réactivé | unban + `account_enabled` | ban levé, reconnexion | R3 |
| Compte ELSATIA supprimé | `account_deleted` | ban + sessions supprimées ; purge des données Studio par le flux de suppression post-H (`deleteUser` Studio, correct en B) | contrat (non testé) |
| « Supprimer mon compte Studio » | rien | flux post-H inchangé ; le compte ELSATIA survit | — |

### 3.8 Alternatives au pont I1

#### I2 — Projet partagé en fournisseur OAuth 2.1 / OIDC, Studio client OIDC

- Le projet partagé agit comme **serveur d'autorisation**. La config Supabase expose
  `[auth.oauth_server]`, désactivé dans BR. Studio fait un flux *authorization code + PKCE*
  depuis son serveur Next, vérifie l'`id_token` via le JWKS du projet partagé, puis crée sa
  session exactement comme en I1 (`generate_link` + `verifyOtp`).
- **Avantage** : protocole standard. Plus de format de jeton maison, consentement et révocation
  des clients gérés par Supabase, réutilisable plus tard pour d'autres apps ou partenaires.
- **Conditions à vérifier avant de retenir I2**, non vérifiables ici (`supabase.com` est bloqué
  par la politique réseau de cet environnement) :
  1. statut de disponibilité du serveur OAuth Supabase sur le plan souscrit ;
  2. clés de signature **asymétriques** activées sur le projet partagé (le contrat Colors indique
     que les clés JWT legacy ont été désactivées : `apps/colors/src/lib/supabase/cles.ts:10-15`,
     ce qui est favorable) ;
  3. possibilité d'y injecter la **décision d'entitlement** : hook `custom_access_token`, ou
     appel séparé à une API de droits.
- **Coût** : proche de I1 côté Studio, moindre côté GP si le serveur OAuth est disponible, mais
  dépendant d'une fonctionnalité plateforme. Estimation : **3-6 j**, avec incertitude plus élevée.

#### I3 — Liaison de comptes explicite, sans SSO (repli minimal)

- Studio garde ses propres comptes (e-mail et mot de passe Studio, 12 caractères, confirmation).
  Dans les réglages Studio, « Lier mon compte ELSATIA » exécute **une fois** l'échange I1 et
  stocke `platform_subject`. Les droits sont synchronisés par push plateforme→Studio sur le
  sujet lié.
- **UX** : deux mots de passe (comme deux produits distincts), mais facturation et droits
  ELSATIA communs.
- **Coût** : le plus faible (**2-3 j**) et le moins couplant : la plateforme n'est jamais sur
  le chemin de connexion.
- **Limite** : ne répond pas à « une seule connexion ELSATIA ».

### 3.9 Mécanismes écartés (irréalistes ou dangereux avec ce stack)

| Mécanisme | Raison du rejet |
|---|---|
| Même secret JWT sur les deux projets | Les JWT d'un projet deviennent valides sur l'autre, ce qui **annule l'isolation**, seul bénéfice de B. Contraire au passage aux clés asymétriques. |
| « Third-party auth » Supabase (Studio accepte les JWT du projet partagé) | Supporte des fournisseurs listés (Firebase, Auth0, Cognito, Clerk… : `supabase/config.toml:353-371`), pas un autre projet Supabase. À revérifier à la date de décision, mais on ne peut pas construire dessus aujourd'hui. |
| Cookie de session sur `.elsatia.fr` | Interdit par le contrat existant (« SSO par cookie de domaine partagé sans lot de tests dédié »). Impossible entre deux projets de toute façon (JWT différents). |
| Liaison automatique par e-mail identique | Prise de compte triviale. Refusée par le POC (`ACCOUNT_LINK_REQUIRED`). |
| `signInWithIdToken` côté Studio | Limité aux fournisseurs natifs (Google, Apple…), pas à un émetteur arbitraire. |

---

## 4. Sécurité — modèle de menaces

Actifs : **D1** données GP (paie, factures, clients, employés) ; **D2** médias et rendus Studio ;
**D3** identités (`auth.users`, mots de passe) ; **D4** droits et facturation ; **D5**
disponibilité.

### 4.1 Les huit menaces ciblées

| Menace | A — Shared | B — Dedicated + I1 | Preuve |
|---|---|---|---|
| **Token theft** | Vol d'une session Supabase (cookie) : valable sur tout le projet partagé, jusqu'à `exp` pour l'access token, jusqu'à révocation pour le refresh token. | Vol du jeton de passage **seul** : inutilisable sans le cookie `nonce` httpOnly de la victime. Vol **complet** (jeton + cookie, poste compromis) : un seul usage, la victime voit alors un échec `REPLAY`. Vol d'une session Studio : limité au projet Studio. | S1, R4 |
| **Replay** | Refresh token : rejouer le **parent** du token actif renvoie le token actif (tolérance GoTrue) ; retard ≥ 2 → famille révoquée. | Identique pour les sessions Studio. Jeton de passage et événement : `jti` à usage unique, sûr en concurrence (PostgreSQL). | R4, F4, R8 |
| **Issuer forgery** | Sans objet (un seul émetteur). | Clé d'un autre émetteur → `UNKNOWN_KID` ; charge utile modifiée → `BAD_SIGNATURE` ; `alg=none` / confusion `HS256` → `ALG_REJECTED`. Résiduel : fuite de la **clé privée** du broker (connexion à Studio comme tout utilisateur lié ; rotation par `kid`). | test 16, 17 |
| **Audience confusion** | Une session Supabase vaut pour **toutes** les apps du projet (la séparation repose sur la RLS et les gardes applicatives). | `aud` vérifié ; sujet différent par audience ; `typ` distinct passage/révocation. | S3, R8 |
| **Expired token** | Access token : `exp` = `jwt_expiry` (3600 s dans le tronc). | Passage : 60 s ± 30 s ; TTL > 300 s refusé. Sessions Studio : `jwt_expiry` **propre** (réglable sans toucher GP). | F3, S4 |
| **Tenant confusion** | Workspaces Studio isolés par RLS dans la base commune (prouvé V3 §6). | Environnements : `iss` et clés **par environnement** (Preview ≠ Production) ; le jeton ne porte **aucun** workspace, l'appartenance reste décidée par la RLS Studio. | S2, S3 |
| **Revoked account** | Ban + suppression des sessions dans **un** projet ; fenêtre résiduelle ≤ `jwt_expiry` pour PostgREST. | Il faut en plus le **webhook** : sans lui, la session Studio survit indéfiniment (refresh accepté). Avec : requête suivante refusée (`403 session_not_found`), refresh refusé, fenêtre ≤ `jwt_expiry` Studio. | R1, R2 |
| **service_role leak** | Fuite (worker FFmpeg, env, dépendance) = **D1+D2+D3+D4** : la RLS ne s'applique pas à `service_role`. | Fuite = **D2** seulement : la clé Studio est refusée par le projet partagé, et inversement. | S5 |

### 4.2 STRIDE — option A

| # | Menace (STRIDE) | Vecteur | Actifs | Probabilité / impact | Contrôle existant | Résiduel |
|---|---|---|---|---|---|---|
| A-T1 | **Élévation / divulgation** : fuite de la clé service | RCE FFmpeg sur média malveillant, fuite d'env chez l'hébergeur worker, dépendance compromise (bullmq, ioredis, ffmpeg) | **D1+D2+D3+D4** | Probabilité moyenne (surface d'entrée = fichiers vidéo arbitraires). Impact **critique** | Worker non-root, garde de préfixe Storage | **Critique** : la RLS ne s'applique pas à `service_role` |
| A-T2 | Contournement de l'inscription | `POST /auth/v1/signup` | D3 | Élevée (déjà ouvert via GP). Impact faible | `studio_create_workspace` fail-closed (34/34) | Faible |
| A-T3 | Prise de compte par invitation | Création d'un compte sur l'adresse de l'invité (confirmation désactivée) | D2 | Moyenne | Aucun tant que `enable_confirmations=false` global | **Moyen**, dépend d'un réglage GP |
| A-T4 | Mot de passe faible | Compte créé via GP (6 caractères) utilisé sur Studio | D2 | Moyenne | Aucun (réglage global) | Moyen |
| A-T5 | Suppression d'identité commune | « Supprimer mon compte Studio » → `deleteUser` | D3, D5 | Certaine si le post-H est porté tel quel | Aucun | **P0 à corriger avant portage** |
| A-T6 | Déni de service croisé | Pic vidéo : egress, stockage, connexions, compute | D5 (GP) | Moyenne | Quotas Studio (`studio_render_limits`, post-H) | Moyen |
| A-T7 | Régression RLS croisée | Migration d'une autre app touchant `storage.objects` ou des rôles | D2 | Faible à moyenne | Policies restrictives + contre-épreuve V3 | Faible, mais dépend de la CI (pgTAP Studio **actuellement rouge**) |
| A-T8 | Restauration destructrice | PITR pour un incident Studio | D1 | Faible | Aucun outillage de restauration sélective | Moyen |

### 4.3 STRIDE — option B (avec I1)

| # | Menace | Vecteur | Actifs | Probabilité / impact | Contrôle (prouvé = POC §9) | Résiduel |
|---|---|---|---|---|---|---|
| B-T1 | Fuite de la clé service Studio | Mêmes vecteurs que A-T1 | **D2 seul** | Moyenne / élevée | Isolation par projet | **Élevé mais borné** |
| B-T2 | Falsification du jeton de passage | Modifier `ent`/`sub`, `alg=none`, confusion HS256, clé d'un autre émetteur | D2, D4 | Faible | Alg épinglé ES256, `kid`∈JWKS, `iss`/`aud` (**prouvé**) | Faible |
| B-T3 | Rejeu / injection de jeton | Jeton intercepté rejoué, ou jeton d'une session A injecté dans le navigateur B | D2 | Faible | `jti` unique, TTL 60 s, `nonce` lié au cookie Studio (**prouvé**) | Faible |
| B-T4 | Prise de compte par liaison | Compte Studio existant même e-mail | D2 | Moyenne si auto-liaison | Refus + double preuve (**prouvé**) | Faible |
| B-T5 | E-mail non vérifié côté plateforme | Création GP sans confirmation, puis passage vers Studio | D2 | **Élevée tant que la confirmation GP est désactivée** | Refus si `email_verified≠true` (**prouvé**) | Faible si le broker lit `email_confirmed_at` |
| B-T6 | Compromission de la clé privée du broker | Fuite côté plateforme | D2 (comptes Studio liés) | Faible | Rotation par `kid` (**prouvé**), TTL court | Moyen : quiconque la détient se connecte à Studio comme n'importe quel utilisateur lié. **Moins grave qu'A-T1** (pas d'accès GP) |
| B-T7 | Indisponibilité du broker | Panne ou déploiement GP | D5 (Studio, nouvelles connexions) | Moyenne | Sessions Studio en cours intactes | Moyen, accepté ou mitigé par un login Studio de secours |
| B-T8 | Désynchronisation des droits | Révocation non propagée | D4 | Moyenne | `ent` à chaque connexion ; lecture seule si retiré (**prouvé**) | Faible avec webhook de révocation |
| B-T9 | Compte orphelin | Compte ELSATIA supprimé, compte Studio restant | D3 (RGPD) | Certaine sans événement | À construire | Moyen, obligation RGPD |
| B-T10 | Fuite du jeton dans les journaux | Jeton en query string | D2 | Faible | POST auto-submit, TTL 60 s, usage unique | Faible |
| B-T11 | Révocation non propagée | Webhook perdu ou non implémenté | D2, D3 | **Certaine sans webhook** | Événement signé + réconciliation périodique (**prouvé** pour l'effet, pas pour le transport) | Moyen tant que le transport n'est pas construit |
| B-T12 | Fenêtre sans état après révocation | Access token présenté à PostgREST avant `exp` | D2 | Faible | `jwt_expiry` Studio réglable (ex. 300-600 s) sans effet sur GP | Faible |

**Lecture** : A concentre le risque sur **un point critique** (fuite de la clé service, A-T1),
avec A-T5 à corriger. B le répartit sur **plusieurs risques moyens**, tous liés à du code à
écrire et à tester (B-T6 à B-T11). Le pire cas de B (B-T1) est borné à Studio.

---

## 5. Révocation — tests réels

Montage : deux GoTrue **v2.192.0 compilés depuis les sources**, deux bases PostgreSQL 16
(`elsatia_central` = projet partagé simulé ; `studio_dedie` = projet Studio simulé),
`GOTRUE_JWT_EXP=60` pour mesurer la fenêtre, rotation des refresh tokens active, intervalle de
réutilisation 0. Fichier : `poc/…/revocation.test.mjs`. **8/8 PASS.**

| # | Scénario | Résultat mesuré |
|---|---|---|
| R1 | **Utilisateur désactivé centralement** (ban plateforme), **sans** propagation | Plateforme : `GET /user` → **200** (!), refresh → `400 user_banned`, login → `400 user_banned`, handoff → `ACCOUNT_DISABLED`. **Studio : `GET /user` → 200, refresh → 200.** La session Studio active survit, sans limite de durée (pas de `timebox` configuré). |
| R2 | Désactivation **propagée** (événement signé → ban Studio + suppression des sessions) | Propagation : **~140-160 ms** en local. **Requête suivante** (`GET /user`, ce que fait `proxy.ts`) → `403 session_not_found`. **Refresh** → `400`. Access token encore valide **sans état** (signature + `exp`) : **fenêtre ≤ `jwt_expiry`** (59 s restantes sur 60 s ici ; jusqu'à 3600 s avec la config actuelle). Jeton de passage émis avant la désactivation → `ACCOUNT_DISABLED`. `accessOf` → `none`. |
| R3 | Réactivation (unban + `account_enabled`) | Ancien refresh → `400` (sessions non ressuscitées). Nouvelle connexion → `full`. |
| R4 | **Token refresh** volé (algorithme v1 par défaut, tokens opaques de 12 caractères) | Rejeu du parent immédiat → **200 et renvoie le token actif** (tolérance GoTrue « fail-to-save », même avec `reuse_interval=0`). Rejeu d'un token en retard de 2 → `400 refresh_token_already_used`, **famille révoquée** (le token légitime courant échoue aussi). La ligne `auth.sessions` subsiste : l'access token courant reste accepté par `GET /user` jusqu'à `exp`. |
| R5 | **Device revocation** (suppression d'une session par `session_id`) | Appareil A : `GET /user` → 403, refresh → 400. Appareil B : 200 / 200. |
| R6 | Déconnexion utilisateur `scope=others` | Autres appareils coupés (refresh 400), appareil courant intact (204 puis 200). |
| R7 | Droit retiré puis rétabli (compte actif) | `full` → `read_only` → `full` ; session jamais coupée. |
| R8 | Robustesse de l'événement | Rejeu → `REPLAY` ; `aud=colors` → `BAD_AUDIENCE` ; jeton de passage présenté comme événement (et inversement) → `TYP_REJECTED` ; sujet inconnu → sans effet. |

**Conséquences pour la conception** (valables en A comme en B, sauf mention) :

1. **Bannir ne suffit pas** : il faut supprimer les lignes `auth.sessions`. GoTrue v2.192.0 n'a
   **pas** de route admin pour cela → RPC `SECURITY DEFINER` exécutable par `service_role` seul.
2. **Fenêtre résiduelle = `jwt_expiry`** pour tout accès direct PostgREST. En B, Studio peut la
   réduire (ex. 300-600 s) sans toucher GP ; en A, c'est un réglage commun à toutes les apps.
3. **B seulement** : sans webhook, la révocation centrale n'atteint jamais Studio (R1). Le
   webhook, sa file de réessais et une réconciliation périodique sont **obligatoires** en B.
   Filet complémentaire côté Studio : `[auth.sessions] timebox` / `inactivity_timeout`
   (commentés dans les deux `config.toml` ; disponibilité selon le plan **à vérifier**).
4. La tolérance de rejeu du refresh token (R4) est un comportement GoTrue, identique en A et B.

---

## 6. Modes de défaillance — tests réels

Fichier : `poc/…/failure-modes.test.mjs`. **9/9 PASS** (6 réels, 3 en mémoire).

| # | Panne | Comportement mesuré | Effet utilisateur |
|---|---|---|---|
| F1 | **Identity broker down** (plateforme injoignable) | Handoff → `PLATFORM_UNAVAILABLE`. Sessions Studio existantes : `GET /user` 200, refresh 200. | Personne n'entre **nouvellement** dans Studio ; les sessions ouvertes continuent. |
| F1b | JWKS injoignable (sans cache) | `JWKS_UNAVAILABLE`, aucun compte créé. | Idem ; un cache JWKS (TTL) rend Studio indépendant de cette panne. |
| F2 | **Studio Supabase down** (GoTrue Studio injoignable) | `STUDIO_AUTH_UNAVAILABLE`, **aucun lien partiel** ; le jeton est consommé (même jeton rejoué après retour → `REPLAY`) ; nouveau passage → succès. | Message d'erreur puis « réessayer » (nouveau passage automatique). |
| F2b | Base Studio injoignable (anti-rejeu) | `STUDIO_DB_UNAVAILABLE`, rien créé. | Idem. |
| F3 | **Clock skew** | ±20 s acceptés ; +85 s accepté (60 s + 30 s) ; +95 s → `EXPIRED` ; −45 s → `NOT_YET_VALID`. | Au-delà de 30 s d'écart entre serveurs, les connexions échouent : NTP requis des deux côtés. |
| F4 | **Duplicate exchange** (double soumission, 3 requêtes simultanées) | 1 succès, 2 `REPLAY` (unicité PostgreSQL). | Aucun ; le premier onglet gagne. |
| F4b | Premier login concurrent (deux onglets, deux jetons valides) | GoTrue : `500` + `23505` sur la 2ᵉ création ; traité comme course → **un seul utilisateur Studio**, même `studioUserId`. | Aucun. |
| F5 | **Partial account provisioning** (crash entre `createUser` et l'écriture du lien) | 1ʳᵉ tentative → `STUDIO_DB_UNAVAILABLE`, utilisateur GoTrue orphelin avec `elsatia_subject`. 2ᵉ tentative → **orphelin repris** (même id), pas de doublon, pas de blocage `ACCOUNT_LINK_REQUIRED`. | Aucun après réessai. |
| F5b | Orphelin d'un **autre** sujet avec le même e-mail | `ACCOUNT_LINK_REQUIRED` : jamais adopté. | Liaison explicite requise. |

Correctifs apportés au POC par ces tests : reprise idempotente par `app_metadata.elsatia_subject`
(F5), traitement du `500/23505` concurrent (F4b), consommation du `jti` avant tout effet de bord
(F2), codes d'erreur stables pour toute panne d'infrastructure.

En **A**, F1, F2, F4, F5 et F3 n'existent pas sous cette forme (pas de pont). En contrepartie, une
panne du projet partagé arrête **toutes** les apps, Studio compris ; en B, une panne du projet
Studio n'arrête que Studio, et une panne du projet partagé n'arrête que les **nouvelles**
connexions Studio.

---

## 7. Coût et exploitation

> Tarifs Supabase **non revérifiés dans ce lot** : `supabase.com` est refusé par la politique
> réseau de cet environnement. Les ordres de grandeur ci-dessous viennent de la grille publique
> connue (plan Pro par organisation, compute par projet, add-ons) et **doivent être relus sur la
> page de tarification le jour de la décision**. La structure du calcul, elle, ne change pas.

| Poste | A — partagé | B — dédié |
|---|---|---|
| **Projets Supabase** | 0 de plus. 1 Preview + 1 Production existants (inventaire réel non versionné : `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`). | **+2** (Studio Preview, Studio Production) dans la même organisation. |
| **Coût fixe Supabase** | 0 de plus. Mais le compute du projet partagé devra peut-être **monter d'une taille** pour absorber le worker (connexions, CPU RPC). | Compute d'un petit projet par environnement (ordre de grandeur : ~10 $/mois en Micro chacun, partiellement couvert par les crédits compute du plan Pro). Add-ons éventuels par projet : PITR (ordre de 100 $/mois par projet s'il est pris), domaine personnalisé. |
| **Coût variable** | Stockage et egress vidéo **mélangés** à GP : non attribuables, et ils peuvent faire franchir un palier au projet GP. | Mêmes volumes, mais **attribuables** à Studio. Le coût variable total est quasi identique : la vidéo coûte ce qu'elle coûte. |
| **Maintenance** | 1 chaîne de migrations, 1 `db reset`, 1 config Auth. | 2 chaînes, 2 configs Auth à maintenir (SMTP, gabarits, URLs), mises à jour Supabase ×2. |
| **Migrations** | Discipline de préfixe et d'horodatage partagée (V3 : 321 migrations, `--include-all` nécessaire). | Chaîne Studio courte (9 → 16) et rapide. Contrôle d'intégrité des liens (`studio-supabase-check.mjs`, BR). |
| **Monitoring** | 1 tableau de bord et 1 jeu d'alertes. Mais il faut **segmenter** Studio vs le reste à la main. | 2 tableaux de bord, alertes dupliquées. Métriques Studio nettes. Surveillance du broker à ajouter. |
| **Secrets** | Clé service partagée, présente dans 5 contextes (GP, scripts RGPD, web Studio, worker ×3 processus). Une rotation touche **toutes** les apps. | Clé service Studio (web et worker), clé privée broker (GP), JWKS public. **Rotations indépendantes.** Un secret de plus à gérer (clé broker). |
| **Support** | Un compte, un mot de passe, un reset (via relais). Support « compte » centralisé. | Avec I1/I2 : un compte ELSATIA, mais deux sessions et un point de défaillance de plus à diagnostiquer (« je n'arrive pas à entrer dans Studio »). Avec I3 : deux mots de passe, donc plus de tickets. |
| **Travail initial restant** (estimation, avant Preview) | Corriger A-T5 (suppression Studio sans `deleteUser`) ≈ 1-2 j. Relais de récupération de mot de passe Studio ≈ 1-2 j. Arbitrer confirmation e-mail et mot de passe globaux (**décision**, pas du code). Mitigation de la clé worker (§2.2, variante b) ≈ 3-5 j si retenue. | Bootstrap des 2 projets (checklist BR §4) ≈ 1 j. Retrait ou gel des migrations Studio de la racine + scission du test foundation ≈ 1 j. Pont d'identité I1 ≈ 4-6 j (I2 ≈ 3-6 j, I3 ≈ 2-3 j). Webhook de révocation et suppression ≈ 1-2 j. CI double ≈ 0,5 j. |
| **Révocation / exploitation** (ajout finalisation) | Ban + RPC de suppression des sessions : ≈ 0,5 j. | RPC de suppression des sessions + webhook signé + file de réessais + réconciliation périodique : ≈ 2-3 j (inclut les 1-2 j « webhook » ci-dessus). Surveillance : taux d'échec du handoff par code, âge du plus vieux webhook en file, purge `studio_handoff_jti`. |

---

## 8. Chemin de migration

### 8.1 Ce qui est plus facile aujourd'hui qu'après commercialisation

État : **zéro donnée Studio de Production** ; Studio n'est pas en Preview (V3 §2.3).

| Élément | Aujourd'hui | Après commercialisation |
|---|---|---|
| Comptes | Aucun compte Studio à déplacer. | Export/import `auth.users` : hash bcrypt portables en SQL, mais **toutes les sessions invalidées**, facteurs MFA et identités OAuth à reprendre ; comptes mixtes GP+Studio → deux comptes (B) ou collisions d'e-mail (retour à A). |
| Identifiants | Aucun UUID à remapper. | 12 colonnes référencent `auth.users` (8 tronc + 4 post-H) : remappage si retour de B vers A, plus le `subject_hash` de suppression. |
| Lignes `studio_*` | Rien à copier. | 13 tables tronc + 7 post-H à copier en conservant les UUID, en cohérence avec les objets. |
| Objets Storage (vidéos) | Rien à copier. | V Go à copier : egress + ingress, heures de transfert, **gel des uploads** pendant la bascule. |
| Place des migrations | Les 9 (16) migrations Studio se déplacent entre la racine et `apps/studio/supabase` **sans** migration de retrait, **sous réserve** de l'inventaire hébergé (`DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`) : si elles ont déjà été appliquées au projet partagé hébergé, il faut une migration de retrait de tables vides. | Migration de retrait de tables **pleines**, ordonnée avec la copie des données. |
| Contrat d'identité (claims, sujet par audience, `typ`) | Modifiable librement : aucun consommateur. | Toute évolution doit rester compatible (Studio en production lit les jetons). |
| Réglages Auth Studio (B) | `site_url`, redirections, gabarits, SMTP, `jwt_expiry`, confirmation : aucun utilisateur impacté. | Chaque changement touche des utilisateurs actifs. |
| Hébergeur et secrets du worker | Le modèle de secret (clé partagée en A, clé Studio en B) se choisit avant l'hébergeur. | Rotation de clé en production, sur un worker en service. |
| Clients, contrat, RGPD | Pas de communication client, pas de registre de traitement à modifier pour des données existantes. | Information des clients sur le changement de compte, mise à jour du registre et des sous-traitants. |
| Lot post-H | Bloqué hors du tronc (merge plan STEP 8) ; sa dérive croît chaque jour. | — |

Ce qui ne devient **pas** plus facile en attendant, mais peut **changer les options** : la
disponibilité du serveur OAuth Supabase (I2) et du « third-party auth » entre projets Supabase
peut évoluer. Attendre peut donc ouvrir des variantes de B, au prix du blocage ci-dessus.

### 8.2 Scénarios de changement d'avis

État : **zéro donnée Studio de Production** (Studio n'est même pas en Preview : V3 §2.3).

| Scénario | Maintenant (0 utilisateur) | Après commercialisation (N comptes, V Go de vidéos) |
|---|---|---|
| **Choisir A maintenant, passer à B plus tard** | — | 1. Créer le projet Studio. 2. Exporter les `auth.users` concernés (Studio et ceux qui sont aussi GP) : les hash bcrypt sont portables en SQL direct, mais les **sessions sont invalidées** pour tous, et facteurs MFA, identités OAuth et tokens de refresh ne suivent pas proprement. 3. Copier les lignes des tables `studio_*` (13 sur le tronc + 7 post-H) en conservant les UUID. 4. **Copier V Go d'objets Storage** (egress + ingress, heures de transfert, fenêtre de gel des uploads). 5. Construire le pont d'identité **sous contrainte** (utilisateurs existants à lier sans rupture). 6. Basculer web et worker, puis purger l'ancien projet. **Risque** : les comptes mixtes GP+Studio deviennent deux comptes, ce qui oblige à communiquer avec les clients. **Ordre de grandeur** : 2-3 semaines de travail plus une fenêtre de maintenance, contre 0 aujourd'hui. |
| **Choisir B maintenant, revenir à A plus tard** | — | 1. Fusionner les utilisateurs Studio dans le projet partagé : **collisions d'e-mail** (même personne, deux UUID), ce qui impose de **remapper les UUID** dans toutes les colonnes qui référencent `auth.users` (12 références identifiées) et le hash `subject_hash` de suppression. 2. Réintégrer les migrations Studio dans la chaîne racine (horodatages antérieurs : `--include-all`, V3 §4.4). 3. Copier les objets. **Ordre de grandeur** : comparable. Le remappage d'UUID est plus délicat, mais le pont I1 fournit déjà la table `platform_subject → user`, donc la correspondance des comptes est **connue d'avance**. |
| **Décider maintenant** | A : **0 migration de données**. Travail = correctifs A-T5, relais de mot de passe, arbitrages de réglages globaux. B : **0 migration de données**. Travail = bootstrap plus pont d'identité (≈ 1,5-2 semaines au total, §7). | — |
| **Coût de l'attente** | Chaque jour sans décision laisse le lot post-H (7 migrations, ~61 fichiers) **bloqué hors du tronc** (merge plan STEP 8) et accroît sa dérive. Il bloque aussi `run-1-sql` (V3 §5.4), la Preview Studio et le choix d'hébergeur du worker (dont le modèle de secret dépend). | — |

**Lecture chiffrée** : décider maintenant évite, dans les deux sens, une migration de
production estimée à plusieurs semaines, avec coupure de sessions et communication client.
Changer d'avis plus tard coûte donc dans les deux sens. **L'irréversibilité croît avec le
premier client payant et avec le volume vidéo.**

### 8.3 Étapes restantes selon le choix (aujourd'hui, sans données)

**Si A** : (1) retirer `20260921070000_studio_signup_policy.sql` du lot post-H ; (2) réécrire la
suppression de compte Studio sans `deleteUser` ; (3) relais de récupération de mot de passe
Studio (précédent Colors) ; (4) arbitrer globalement confirmation e-mail, longueur de mot de
passe, `jwt_expiry` ; (5) RPC de suppression des sessions pour la révocation ; (6) décider ou non
de la mitigation de la clé worker (API interne) ; (7) porter le lot post-H à la racine ;
(8) amender la décision Q-004.

**Si B** : (1) créer les 2 projets (checklist BR §4) ; (2) retirer ou geler les 9 migrations
Studio de la racine, scinder `studio_workspace_foundation.test.sql` ; (3) CI double `db reset` ;
(4) choisir le pont (I1/I2/I3) ; si I1 : route handoff + JWKS côté GP, route d'échange + 3 tables
+ RPC de sessions côté Studio, webhook + file + réconciliation ; (5) amender
`ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` (exception Studio) ; (6) porter le lot post-H dans
`apps/studio/supabase`.

---

## 9. Proof of concept (local, sans cloud)

Emplacement : `docs/architecture/poc/studio-dedicated-identity-exchange/`. Fichiers `.mjs` sans
dépendance, **non importés par aucune application** ; le README précise « POC jetable, pas de
code de production ».

**Environnement réel** (2026-09-26, finalisation) :

- `github.com/supabase/auth` tag **v2.192.0**, compilé depuis les sources (`go build`) : le démon
  Docker n'est pas disponible dans cet environnement. Mission initiale : image Docker
  `supabase/gotrue:v2.192.0`, même version ;
- deux instances : « plateforme » (`:59998`, inscription ouverte, 6 caractères) et « Studio
  dédié » (`:59999`, `DISABLE_SIGNUP=true`, 12 caractères), secrets JWT distincts ;
- PostgreSQL 16 natif, deux bases, migrations GoTrue réelles (`gotrue migrate`) ;
- puits SMTP local (aucun e-mail ne sort).

**Résultat : `node --test docs/architecture/poc/studio-dedicated-identity-exchange/*.test.mjs`,
32/32 PASS, stable sur 3 exécutions consécutives.** Sans GoTrue : 14 PASS, 15 ignorés.

```
ok 1 - F1 identité centrale (broker) injoignable : aucun passage ; sessions Studio en cours intactes
ok 2 - F1b JWKS du broker injoignable (mémoire) : refus fail-closed, aucun compte créé
ok 3 - F2 GoTrue Studio injoignable : erreur stable, aucun lien, jeton consommé ; nouveau passage OK au retour
ok 4 - F2b base Studio injoignable (anti-rejeu indisponible) : refus, rien créé (mémoire)
ok 5 - F3 dérive d'horloge : ±20 s acceptée ; au-delà de la tolérance (30 s) refusée
ok 6 - F4 double soumission du même jeton en parallèle (anti-rejeu PostgreSQL) : un seul succès
ok 7 - F4b premier login concurrent (deux onglets, deux jetons) : un seul utilisateur Studio
ok 8 - F5 provisioning partiel (utilisateur GoTrue créé, lien non écrit) : reprise idempotente
ok 9 - F5b orphelin d'un AUTRE sujet avec le même e-mail : jamais adopté (mémoire)
ok 10 - [memoire] 1ère connexion : compte Studio créé, rattaché, session émise par GoTrue
ok 11 - [memoire] 2e connexion : même utilisateur Studio (clé = sujet, pas e-mail)
ok 12 - [memoire] compte Studio préexistant même e-mail : jamais rattaché automatiquement
ok 13 - [gotrue-reel] 1ère connexion : compte Studio créé, rattaché, session émise par GoTrue
ok 14 - [gotrue-reel] 2e connexion : même utilisateur Studio (clé = sujet, pas e-mail)
ok 15 - [gotrue-reel] compte Studio préexistant même e-mail : jamais rattaché automatiquement
ok 16 - rejets : signature, iss, aud, exp, nonce, e-mail non vérifié, alg none/HS256, rejeu, droit absent
ok 17 - rotation de clé : nouveau kid accepté après relecture JWKS ; kid retiré refusé
ok 18 - droit retiré : compte existant conservé en lecture seule, jamais supprimé
ok 19 - R1 compte désactivé centralement SANS propagation : la session Studio survit (constat)
# R2 propagation=156ms fenetre_stateless_restante=59s (JWT_EXP=60s)
ok 20 - R2 désactivation propagée (webhook signé) : requête suivante, refresh, nouvel échange
ok 21 - R3 réactivation : ban levé, anciennes sessions perdues, nouvelle connexion OK
ok 22 - R4 refresh token volé (algorithme v1 par défaut) : retard 1 → reçoit le token actif ; retard ≥ 2 → famille révoquée
ok 23 - R5 révocation d'un appareil : session A coupée, session B intacte
ok 24 - R6 déconnexion par l'utilisateur : scope=others coupe les autres appareils, pas celui-ci
ok 25 - R7 droit retiré (compte actif) : session conservée, accès lecture seule, puis rétabli
ok 26 - R8 événement de révocation : rejeu, audience, type de jeton et sujet inconnu
ok 27 - S1 vol du jeton de passage : sans le cookie nonce de la victime → refus ; vol complet → usage unique
ok 28 - S2 confusion d'environnement : jeton Preview refusé par Studio Production
ok 29 - S3 confusion d'audience / de tenant applicatif : sujet différent par audience, jeton Colors refusé
ok 30 - S4 jeton à durée de vie excessive (broker mal configuré) : refusé
ok 31 - S5 rayon d'impact des clés service : aucune clé ni session d'un projet n'ouvre l'autre (GoTrue réels)
ok 32 - S6 inscription publique fermée côté Studio, ouverte côté plateforme (GoTrue réels)
# tests 32  # pass 32  # fail 0  # skipped 0
```

**Sondes de la mission initiale** (même GoTrue, toujours valables) :

```
POST /signup public (anon)            -> 422 {"error_code":"signup_disabled"}
POST /admin/users (clé service)       -> 200
POST /verify (token_hash magiclink)   -> 200 access_token + refresh_token
POST /verify (même token_hash)        -> 403 {"error_code":"otp_expired"}   # usage unique
GET  /admin/users avec JWT utilisateur -> 403                               # pas d'escalade
```

**Sondes de la finalisation** :

```
clé service Studio  -> GET /admin/users plateforme  -> 403 {"error_code":"bad_jwt"}
clé service plateforme -> GET /admin/users Studio   -> 403 {"error_code":"bad_jwt"}
utilisateur banni   -> GET /user                     -> 200   (le ban ne coupe pas la session)
utilisateur banni   -> refresh / login               -> 400 {"error_code":"user_banned"}
utilisateur banni   -> generate_link puis verify     -> 200 puis 403 {"error_code":"user_banned"}
session supprimée   -> GET /user                     -> 403 {"error_code":"session_not_found"}
createUser concurrent (même e-mail) -> 500 {"code":"23505", "users_email_partial_key"}
```

**Ce que le POC ne prouve pas** : plomberie Next.js (routes, cookies, POST auto-submit) ; Kong
et PostgREST (la vérification sans état est simulée par vérification HMAC + `exp`) ; transport
du webhook (file, réessais, ordre) ; comportement du projet **hébergé** (serveur OAuth pour I2,
`timebox` des sessions, tarifs) ; charge.

---

## 10. Tableau de décision

Sans score : chaque cellule dit **ce qui se passe**, et les quatre dernières colonnes qualifient
l'écart entre A et B pour ce critère.

| CRITÈRE | SHARED (A) | DEDICATED (B) | RISK | COST | COMPLEXITY | REVERSIBILITY |
|---|---|---|---|---|---|---|
| Rayon d'impact de la clé service (web + worker) | Toute la plateforme (D1–D4) | Studio seul | **A critique**, B élevé mais borné | A : mitigation 3-5 j (partielle) ; B : inclus | A : mitigation non triviale ; B : aucune | Changer après coup = migration (§8) |
| Identité ELSATIA commune | Native (même UUID) ; pas de SSO aujourd'hui | Par pont I1/I2/I3 | A : faible ; B : nouveaux risques B-T2…T7, contrôlés par le POC | A : 0 ; B : 2-6 j | B : nouveau composant critique (broker) | Pont retirable si retour à A ; comptes à fusionner |
| Expérience de connexion | Même mot de passe, reconnexion par app | I1/I2 : un clic si session GP ; I3 : deux mots de passe | — | — | — | — |
| Réglages Auth propres (12 caractères, confirmation, gabarits, `site_url`, SMTP) | **Impossibles** : globaux, arbitrage avec GP | Libres | A : invitation squattable (A-T3), mot de passe GP (A-T4) | A : relais de reset 1-2 j | A : couplage de réglages entre produits | Réglable à tout moment dans les deux cas |
| Fermeture de l'inscription | Frontière workspace uniquement (prouvé) | Frontière Auth + workspace (prouvé) | A : compte Auth créable (faible) | 0 / 0 | 0 / 0 | — |
| Suppression de compte (RGPD) | P0 : `deleteUser` tue le compte commun ; FK Studio bloquent la suppression ELSATIA | Correcte telle quelle ; propagation plateforme→Studio à écrire | A : **P0** tant que non corrigé ; B : orphelins (B-T9) | A : 1-2 j ; B : 1-2 j | Équivalente | — |
| Entitlements et facturation | Jointure SQL (précédent Tools, `portee_donnees='compte'`) | Claim `ent` + webhook de révocation | B : désynchronisation (B-T8) | A : faible ; B : +1-2 j | B : contrat versionné inter-projets | — |
| Storage (plafond 1 Gio, quotas, egress) | Plafond global relevé pour tous ; quotas mutualisés | Isolé | A : DoS croisé (A-T6) | Même volume total ; A non attribuable | A : faible | Copie d'objets si changement |
| Worker (connexions, charge) | Charge sur la base GP | Base dédiée | A : contention | A : compute partagé à surdimensionner peut-être | — | — |
| Migrations et CI | 1 chaîne (321+), `--include-all` | 2 chaînes, liens symboliques contrôlés | B : dérive entre chaînes (contrôlée par script) | B : +0,5 j CI | B : double `db reset` | Changer = réécrire la place des migrations |
| Backup | Global ; objets à part | Par projet ; objets à part | — | B : add-ons ×2 si PITR | B : ×2 procédures | — |
| DR | Restauration tout-ou-rien | Restauration Studio isolée ; broker = SPOF de connexion | A : restauration destructrice (A-T8) ; B : B-T7 | — | A : restauration sélective manuelle | — |
| Coût Supabase fixe | 0 de plus | +2 projets (ordre de grandeur : dizaines de $/mois hors PITR, **à revérifier**) | — | **B plus cher** | — | Supprimer des projets est immédiat |
| Exploitation (secrets, monitoring, support) | 1 de chaque ; rotation globale | ×2 ; rotations indépendantes ; broker à surveiller | — | B : plus de charge récurrente | B plus élevée | — |
| Conformité au contrat `COMMON_ACCOUNT_CONTRACT_V1` | Conforme | **Exige un amendement explicite** (exception Studio) | — | — | Gouvernance | — |
| Cohérence avec les décisions passées | Conforme au tronc actuel (hardening V1) | Conforme à Q-004 (BR) et au runbook dédié | Contradiction à solder dans les deux cas | — | — | — |
| Coût de changer d'avis | — | — | — | Maintenant ≈ 0 donnée ; plus tard ≈ 2-3 semaines + coupure | — | **Décroît avec le temps dans les deux sens** |
| Révocation d'un compte désactivé | Ban + suppression des sessions dans un seul projet | Idem **plus** webhook signé, file et réconciliation ; sans eux, session Studio illimitée (R1) | B : B-T11 tant que le transport n'existe pas | A : ≈ 0,5 j ; B : ≈ 2-3 j | B : un canal de plus à exploiter | — |
| Pannes | Panne du projet partagé = toutes les apps | Panne plateforme = nouvelles connexions Studio seulement ; panne Studio = Studio seul (F1, F2) | — | — | B : codes d'erreur et réessais à gérer | — |

---

## 11. Ce qui ne dépend pas du choix

À faire dans les deux cas :

- **Corriger les 7 suites pgTAP Studio rouges** (V3 §5.3) et la contradiction du gate (V3 §5.4).
  Ce sont des décisions de test déjà instruites.
- Le lot post-H est additif (V3 §2.4). Seul son **emplacement** dépend du choix, ainsi que le
  sort de `20260921070000_studio_signup_policy.sql` : écarté en A, gardé en B.
- La sauvegarde des objets Storage est séparée de la sauvegarde de la base.
- `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` (`closed`/`open`) et
  `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` restent ouvertes. Le choix d'hébergeur du
  worker pèse **plus lourd en A** (il y détient la clé de toute la plateforme).
- **Révocation** : dans les deux options, bannir ne coupe pas une session ouverte ; il faut une
  RPC de suppression des sessions et accepter (ou réduire) la fenêtre `jwt_expiry`.
- **Refresh token** : la tolérance de rejeu du parent immédiat (R4) est un comportement GoTrue
  commun aux deux options.

---

## 12. Décision du propriétaire

La page de décision est volontairement séparée et courte :
**[`ELSATIA_STUDIO_SUPABASE_OWNER_DECISION_V1.md`](ELSATIA_STUDIO_SUPABASE_OWNER_DECISION_V1.md)**.

Réponse attendue, en une ligne : « **A** », ou « **B + I1** », « **B + I2** », « **B + I3** ».

Dès la réponse, sans nouvelle instruction :

- `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` (`config/env-manifest.json`)
  pourra être fermée, et la décision Q-004 confirmée ou annulée en conséquence ;
- le STEP 8 du merge plan (lot post-H) deviendra exécutable, à l'emplacement choisi ;
- `apps/studio/.env.preview.example` et le manifeste pourront être réalignés (V3 §8) ;
- la liste d'étapes du §8.3 correspondant au choix devient le plan de travail.
