# ELSATIA Studio — Dossier de décision d'architecture Supabase V1

**Partagé (A) ou dédié (B) ?**

Date : 2026-09-26. Mission : documentation et POC local uniquement. **Aucun déploiement, aucun
projet Supabase distant créé, lié, interrogé ou modifié.** Aucune migration ni code applicatif
modifié. **Ce dossier ne tranche pas** : il prépare la décision de Julien.

Base de lecture : tronc `origin/integration/elsatia-canonical-train-v1` @ `1c1fed66` (328
migrations), plus les branches citées au §1. Les chemins de fichiers sans préfixe désignent ce
tronc. « BR » désigne `origin/fix/studio-signup-closed-v1` @ `634651a0`.

---

## Verdict

```
OWNER DECISION READY
```

La question exacte à laquelle Julien doit répondre est au **§11**. Les faits sont établis, les
deux options sont chiffrées, et deux architectures d'identité commune compatibles avec un Studio
dédié sont décrites. L'une d'elles (I1) a été **prouvée localement contre un vrai GoTrue
v2.192.0** (POC, §8).

### Résumé

1. Studio est **techniquement séparable** : ses 9 migrations sur le tronc (16 avec le lot
   post-H) ne référencent que `auth.users` et `storage.*`. Aucune autre migration ne référence
   Studio (Qualification V3 §2.1).
2. Studio **n'utilise pas** le modèle d'accès ELSATIA : il est absent de `applications_elsatia`,
   ne fait aucun appel à `a_acces_application` et n'a **aucune facturation**.
3. Le seul lien réel entre Studio et le reste d'ELSATIA est donc l'**identité**, autrement dit
   `auth.users`. Aujourd'hui ce lien ne sert qu'à réutiliser le même mot de passe : il n'existe
   **pas de SSO** entre les apps, et chaque app a sa propre session par hôte.
4. **A (partagé)** : zéro projet en plus et identité commune immédiate. En contrepartie :
   - la clé `service_role` détenue par le web Studio **et** par le worker vidéo (processus long,
     hébergeur tiers non choisi) ouvre **toute la base ELSATIA** ;
   - les réglages Auth de Studio (mot de passe de 12 caractères, confirmation e-mail, gabarits,
     `site_url`) **ne peuvent pas coexister** avec ceux de Gestion Pro ;
   - la suppression de compte Studio prévue (post-H) appelle `auth.admin.deleteUser`, qui
     **supprimerait le compte ELSATIA commun**.
5. **B (dédié)** : rayon d'impact limité à Studio, réglages Auth propres, et inscription
   fermable au niveau Auth. C'est prouvé : `GOTRUE_DISABLE_SIGNUP=true` renvoie 422 sur
   `/signup`. En contrepartie :
   - 2 projets Supabase de plus (Preview et Production) ;
   - une seconde chaîne de migrations ;
   - l'identité commune est **perdue par défaut**, et il faut construire un pont d'identité (§4).
6. Studio n'a **aucune donnée de Production**. Décider maintenant coûte seulement de la
   configuration. Changer d'option après commercialisation impose une migration de comptes, de
   fichiers vidéo et de lignes de base (§7).
7. **Contradiction historique à solder.** BR cite une « **décision Julien Q-004
   (2026-09-20)** : Studio dispose de son propre projet Supabase ». Le tronc a ensuite été
   construit en **partagé** (hardening V1, 2026-09-22), en s'appuyant sur
   `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md`, qui interdit un second système d'auth. Les deux ne
   peuvent pas rester vrais en même temps. La question du §11 tranche aussi ce point.

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

## 2. Option A — Studio dans le projet Supabase partagé

C'est l'état actuel du tronc.

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

---

## 3. Option B — Projet Supabase dédié à Studio

C'est la lignée BR, prête dans `apps/studio/supabase/`, avec des migrations en liens
symboliques vers la racine.

| Axe | Analyse | Constat ou risque précis |
|---|---|---|
| **Identité** | GoTrue propre : `auth.users` Studio distinct. Un utilisateur GP et un utilisateur Studio sont **deux comptes** (UUID différents). | Sans pont d'identité : deux mots de passe, deux comptes, et le contrat `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` (« pas de second système d'auth ») est **contredit**. Il doit alors être amendé explicitement pour Studio. Avec un pont (§4) : un compte ELSATIA, deux sessions techniques. |
| **SSO** | Aujourd'hui aucune app n'a de SSO : même en A, on se reconnecte. | En B avec le pont I1 ou I2 : un clic « Continuer avec mon compte ELSATIA », **sans ressaisie** si la session GP est ouverte. C'est une expérience **meilleure qu'en A actuel**, mais à construire. |
| **Liaison de comptes** | Table `studio_identity_links(platform_subject → user_id)`. | Règle clé, prouvée par le POC : **jamais de liaison automatique par e-mail**. Si un compte Studio existe déjà avec la même adresse, il faut une double preuve : session Studio **et** jeton plateforme. Sinon, quiconque contrôle l'adresse côté plateforme prend le compte Studio. |
| **JWT** | Chaque projet a ses clés de signature. Les JWT Studio ne sont **jamais** valides sur le projet partagé, et inversement. | Isolation cryptographique par construction. Le jeton de passage (handoff) est un JWS **asymétrique** distinct des JWT Supabase : Studio ne détient que la clé publique du broker. **Ne pas** partager le secret JWT entre projets (§4.4). |
| **Synchronisation des droits** | La plateforme reste l'autorité (catalogue, Stripe). Studio reçoit une **décision** : claim `ent` du jeton à chaque connexion. S'y ajoute un canal de révocation : webhook signé plateforme→Studio, ou relecture périodique. | Délai de révocation = min(prochaine connexion, prochain push) : secondes avec push, TTL de session Studio sinon. **Fail-closed** : pas de droit, pas de nouveau compte. Droit retiré : lecture seule, jamais suppression (prouvé par le POC, test 6). Nouveau code des deux côtés : émetteur, endpoint de révocation, table de cache. |
| **Cycle de vie utilisateur** | Création : au premier échange (admin API Studio). Changement d'e-mail plateforme : lien par sujet, donc même compte Studio (POC test 2) ; mise à jour de l'e-mail Studio à prévoir. Suppression : la suppression Studio (post-H) devient **correcte telle quelle** (`deleteUser` ne touche que Studio). Suppression du compte ELSATIA : événement plateforme→Studio à propager. | Deux cycles de vie à réconcilier : un compte ELSATIA supprimé laisse un compte Studio orphelin, il faut un événement de suppression. |
| **Billing (produit)** | Stripe reste côté plateforme. Studio ne voit que `ent.plan` / `capabilities`. | Pas de jointure SQL : **contrat versionné** (claims) à maintenir. |
| **Billing (Supabase)** | Projets supplémentaires facturés (§6). | Coût Studio **isolé et mesurable** : utile pour le prix de revient d'un produit vidéo. |
| **Storage** | Isolation physique. Plafond global du projet fixé à 1 Gio **sans effet** sur les autres apps. Quotas et egress propres. | Les gardes restrictives restent (défense en profondeur). |
| **Worker** | Clé service **du projet Studio** uniquement. | Rayon d'impact d'une fuite = données Studio seules. Toujours sérieux (médias clients), mais **borné**. |
| **Backup** | PITR ou backup propre au projet Studio, dimensionné pour lui. Sauvegarde objets séparée (vidéos). | Politique de rétention propre à Studio, découplée de la paie GP (qui a ses contraintes légales). |
| **DR** | Restauration Studio sans toucher GP, et inversement (runbook BR §6). | Mais DR du **pont d'identité** : si le broker (projet partagé) est indisponible, les **nouvelles** connexions « via ELSATIA » échouent. Les sessions Studio en cours continuent (refresh token Studio). Option : login Studio local de secours, qui ajoute un mot de passe Studio. |
| **Migrations** | Deux chaînes : racine (GP+) et `apps/studio/supabase` (liens symboliques, contrôle `scripts/studio-supabase-check.mjs` sur BR). | La racine doit **retirer ou geler** les 9 migrations Studio (sinon tables Studio mortes sur le projet partagé). `studio_workspace_foundation.test.sql` doit être scindé (V3 §2.3). La CI doit exécuter deux `db reset`. |
| **Inscription** | `enable_signup=false` au niveau GoTrue Studio **plus** création uniquement par l'échange (admin API), **ou** hook `before_user_created` (BR). | **Prouvé** sur GoTrue réel : `POST /signup` → `422 signup_disabled`, alors que `admin/users` fonctionne (§8). Fermeture **à la frontière Auth**, ce qui est impossible en A. |

---

## 4. Partage d'identité avec un Studio dédié

Contraintes retenues, toutes vérifiées dans le dépôt :

- stack : Next.js 16.3.5 et `@supabase/ssr` 0.12, `supabase-js` 2.110 ;
- GoTrue v2.192.0 (version du harnais) ;
- aucune librairie JWT : `node:crypto` suffit, comme le prouve le POC ;
- cookies par hôte, sans `domain` partagé (contrat existant) ;
- Gestion Pro héberge déjà le « compte ELSATIA » : Colors y renvoie via
  `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`.

### I1 — Broker d'identité central + échange de jeton signé (prouvé, §8)

```
Studio ──(nonce, redirect)──▶ app.elsatia.fr/compte/studio-handoff   [projet partagé]
                               session GP ? sinon login GP
                               décision d'accès Studio (catalogue / entitlements)
                               JWS ES256 60 s {iss, aud:"studio", sub opaque, email,
                                               email_verified, ent, nonce, jti}
Studio ◀──(POST auto-submit)── clé privée côté plateforme, JWKS publié
Studio : vérifie → lien sujet→user → admin.generate_link(magiclink) → verifyOtp(token_hash)
       → session Studio posée par GoTrue Studio (cookies elsatia-studio-auth)
```

- **Réaliste** : c'est le contrat déjà rédigé dans BR (`ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md`).
  Il se bâtit avec les briques existantes : routes Next côté GP, API admin de GoTrue côté Studio.
  Le JWS est vérifiable en ~40 lignes de `node:crypto`.
- **Session Studio émise par GoTrue lui-même.** Aucun JWT Supabase n'est forgé, et le secret JWT
  du projet Studio ne sort jamais de GoTrue. `generate_link` n'envoie pas d'e-mail, et le
  `token_hash` est à usage unique (prouvé : 2ᵉ `verify` → `403 otp_expired`).
- **Coût** : un endpoint émetteur plus un JWKS côté GP, une route d'échange plus 3 tables côté
  Studio, la clé service Studio dans la route d'échange (déjà présente dans le web Studio).
  Estimation : **4-6 j** avec tests, hors webhook de révocation (+1-2 j).
- **Limites** : le broker est un **SPOF pour les nouvelles connexions**. Le claim `ent` est un
  contrat à versionner. L'e-mail doit être vérifié côté plateforme, or la confirmation e-mail
  est aujourd'hui `false` dans la config du tronc. Il faut donc **un contrôle `email_verified`
  réel** : `email_confirmed_at` non nul, sinon refus. C'est le test du POC.

### I2 — Projet partagé en fournisseur OAuth 2.1 / OIDC, Studio client OIDC

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

### I3 — Liaison de comptes explicite, sans SSO (repli minimal)

- Studio garde ses propres comptes (e-mail et mot de passe Studio, 12 caractères, confirmation).
  Dans les réglages Studio, « Lier mon compte ELSATIA » exécute **une fois** l'échange I1 et
  stocke `platform_subject`. Les droits sont synchronisés par push plateforme→Studio sur le
  sujet lié.
- **UX** : deux mots de passe (comme deux produits distincts), mais facturation et droits
  ELSATIA communs.
- **Coût** : le plus faible (**2-3 j**) et le moins couplant : la plateforme n'est jamais sur
  le chemin de connexion.
- **Limite** : ne répond pas à « une seule connexion ELSATIA ».

### 4.4 Mécanismes écartés (irréalistes ou dangereux avec ce stack)

| Mécanisme | Raison du rejet |
|---|---|
| Même secret JWT sur les deux projets | Les JWT d'un projet deviennent valides sur l'autre, ce qui **annule l'isolation**, seul bénéfice de B. Contraire au passage aux clés asymétriques. |
| « Third-party auth » Supabase (Studio accepte les JWT du projet partagé) | Supporte des fournisseurs listés (Firebase, Auth0, Cognito, Clerk… : `supabase/config.toml:353-371`), pas un autre projet Supabase. À revérifier à la date de décision, mais on ne peut pas construire dessus aujourd'hui. |
| Cookie de session sur `.elsatia.fr` | Interdit par le contrat existant (« SSO par cookie de domaine partagé sans lot de tests dédié »). Impossible entre deux projets de toute façon (JWT différents). |
| Liaison automatique par e-mail identique | Prise de compte triviale. Refusée par le POC (`ACCOUNT_LINK_REQUIRED`). |
| `signInWithIdToken` côté Studio | Limité aux fournisseurs natifs (Google, Apple…), pas à un émetteur arbitraire. |

---

## 5. Modèle de menaces

Actifs :

- **D1** données GP (paie, factures, clients, employés) ;
- **D2** médias et rendus Studio ;
- **D3** identités (`auth.users`, mots de passe) ;
- **D4** droits et facturation ;
- **D5** disponibilité de la plateforme.

### 5.1 Option A (partagé)

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

### 5.2 Option B (dédié, avec I1)

| # | Menace | Vecteur | Actifs | Probabilité / impact | Contrôle (prouvé = POC §8) | Résiduel |
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

**Lecture** : A concentre le risque en **un point critique** (A-T1, avec A-T5 à corriger). B le
répartit en **plusieurs risques moyens** qui relèvent tous de code à écrire et à tester (B-T6 à
B-T9). Le pire cas de B (B-T1) est borné à Studio.

---

## 6. Coût et exploitation

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
| **Travail initial restant** (estimation, avant Preview) | Corriger A-T5 (suppression Studio sans `deleteUser`) ≈ 1-2 j. Relais de récupération de mot de passe Studio ≈ 1-2 j. Arbitrer confirmation e-mail et mot de passe globaux (**décision**, pas du code). Mitigation de la clé worker (A §2, variante b) ≈ 3-5 j si retenue. | Bootstrap des 2 projets (checklist BR §4) ≈ 1 j. Retrait ou gel des migrations Studio de la racine + scission du test foundation ≈ 1 j. Pont d'identité I1 ≈ 4-6 j (I2 ≈ 3-6 j, I3 ≈ 2-3 j). Webhook de révocation et suppression ≈ 1-2 j. CI double ≈ 0,5 j. |

---

## 7. Décider maintenant vs après commercialisation

État : **zéro donnée Studio de Production** (Studio n'est même pas en Preview : V3 §2.3).

| Scénario | Maintenant (0 utilisateur) | Après commercialisation (N comptes, V Go de vidéos) |
|---|---|---|
| **Choisir A maintenant, passer à B plus tard** | — | 1. Créer le projet Studio. 2. Exporter les `auth.users` concernés (Studio et ceux qui sont aussi GP) : les hash bcrypt sont portables en SQL direct, mais les **sessions sont invalidées** pour tous, et facteurs MFA, identités OAuth et tokens de refresh ne suivent pas proprement. 3. Copier les lignes des tables `studio_*` (13 sur le tronc + 7 post-H) en conservant les UUID. 4. **Copier V Go d'objets Storage** (egress + ingress, heures de transfert, fenêtre de gel des uploads). 5. Construire le pont d'identité **sous contrainte** (utilisateurs existants à lier sans rupture). 6. Basculer web et worker, puis purger l'ancien projet. **Risque** : les comptes mixtes GP+Studio deviennent deux comptes, ce qui oblige à communiquer avec les clients. **Ordre de grandeur** : 2-3 semaines de travail plus une fenêtre de maintenance, contre 0 aujourd'hui. |
| **Choisir B maintenant, revenir à A plus tard** | — | 1. Fusionner les utilisateurs Studio dans le projet partagé : **collisions d'e-mail** (même personne, deux UUID), ce qui impose de **remapper les UUID** dans toutes les colonnes qui référencent `auth.users` (12 références identifiées) et le hash `subject_hash` de suppression. 2. Réintégrer les migrations Studio dans la chaîne racine (horodatages antérieurs : `--include-all`, V3 §4.4). 3. Copier les objets. **Ordre de grandeur** : comparable. Le remappage d'UUID est plus délicat, mais le pont I1 fournit déjà la table `platform_subject → user`, donc la correspondance des comptes est **connue d'avance**. |
| **Décider maintenant** | A : **0 migration de données**. Travail = correctifs A-T5, relais de mot de passe, arbitrages de réglages globaux. B : **0 migration de données**. Travail = bootstrap plus pont d'identité (≈ 1,5-2 semaines au total, §6). | — |
| **Coût de l'attente** | Chaque jour sans décision laisse le lot post-H (7 migrations, ~61 fichiers) **bloqué hors du tronc** (merge plan STEP 8) et accroît sa dérive. Il bloque aussi `run-1-sql` (V3 §5.4), la Preview Studio et le choix d'hébergeur du worker (dont le modèle de secret dépend). | — |

**Lecture chiffrée** : décider maintenant évite, dans les deux sens, une migration de
production estimée à plusieurs semaines, avec coupure de sessions et communication client.
Changer d'avis plus tard coûte donc dans les deux sens. **L'irréversibilité croît avec le
premier client payant et avec le volume vidéo.**

---

## 8. Proof of concept (local, sans cloud)

Emplacement : `docs/architecture/poc/studio-dedicated-identity-exchange/`. Il s'agit de fichiers
`.mjs` sans dépendance, **non importés par aucune application**, avec un README qui précise
« POC jetable, pas de code de production ».

**Environnement réel utilisé** (2026-09-26) :

- PostgreSQL 16 natif, base `studio_dedie`, qui simule le projet Supabase Studio dédié ;
- **GoTrue réel** `supabase/gotrue:v2.192.0` (version épinglée par le harnais Studio), tiré de
  Docker Hub après des 429 levés par réessai ;
- réglages GoTrue : `GOTRUE_DISABLE_SIGNUP=true`, `GOTRUE_PASSWORD_MIN_LENGTH=12`,
  `GOTRUE_MAILER_AUTOCONFIRM=false`.

**Résultat de `node --test poc.test.mjs`, contre le vrai GoTrue : 9/9 PASS**

```
ok 1 - [memoire] 1ère connexion : compte Studio créé, rattaché, session émise par GoTrue
ok 2 - [memoire] 2e connexion : même utilisateur Studio (clé = sujet, pas e-mail)
ok 3 - [memoire] compte Studio préexistant même e-mail : jamais rattaché automatiquement
ok 4 - [gotrue-reel] 1ère connexion : compte Studio créé, rattaché, session émise par GoTrue
ok 5 - [gotrue-reel] 2e connexion : même utilisateur Studio (clé = sujet, pas e-mail)
ok 6 - [gotrue-reel] compte Studio préexistant même e-mail : jamais rattaché automatiquement
ok 7 - rejets : signature, iss, aud, exp, nonce, e-mail non vérifié, alg none/HS256, rejeu, droit absent
ok 8 - rotation de clé : nouveau kid accepté après relecture JWKS ; kid retiré refusé
ok 9 - droit retiré : compte existant conservé en lecture seule, jamais supprimé
# pass 9   # fail 0
```

**Sondes complémentaires sur le même GoTrue** :

```
POST /signup public (anon)            -> 422 {"error_code":"signup_disabled"}      # inscription fermée au niveau Auth
POST /admin/users (clé service)       -> 200                                        # création par l'échange uniquement
POST /verify (token_hash magiclink)   -> 200 access_token + refresh_token
JWT de session : alg HS256, signé par le secret du projet Studio, sub = user Studio,
                 role=authenticated, aal1, amr=[otp], app_metadata.elsatia_subject présent
POST /verify (même token_hash)        -> 403 {"error_code":"otp_expired"}           # usage unique
GET  /admin/users avec JWT utilisateur -> 403                                        # pas d'escalade
```

**Ce que le POC prouve** :

- l'architecture I1 fonctionne avec le GoTrue de la version utilisée par le dépôt, **sans forger
  de JWT Supabase** ;
- la fermeture de l'inscription au niveau Auth est **compatible** avec la création pilotée par
  le pont ;
- les défenses cryptographiques et de liaison se comportent comme attendu.

**Ce qu'il ne prouve pas** :

- plomberie Next.js (routes, cookies, POST auto-submit) ;
- Kong et PostgREST ;
- webhook de révocation ;
- comportement du projet **hébergé**, dont le serveur OAuth pour I2 ;
- charge.

---

## 9. Tableau de décision

Sans score : chaque cellule dit **ce qui se passe**, et les quatre dernières colonnes qualifient
l'écart entre A et B pour ce critère.

| CRITÈRE | SHARED (A) | DEDICATED (B) | RISK | COST | COMPLEXITY | REVERSIBILITY |
|---|---|---|---|---|---|---|
| Rayon d'impact de la clé service (web + worker) | Toute la plateforme (D1–D4) | Studio seul | **A critique**, B élevé mais borné | A : mitigation 3-5 j (partielle) ; B : inclus | A : mitigation non triviale ; B : aucune | Changer après coup = migration (§7) |
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

---

## 10. Ce qui ne dépend pas du choix

À faire dans les deux cas :

- **Corriger les 7 suites pgTAP Studio rouges** (V3 §5.3) et la contradiction du gate (V3 §5.4).
  Ce sont des décisions de test déjà instruites.
- Le lot post-H est additif (V3 §2.4). Seul son **emplacement** dépend du choix, ainsi que le
  sort de `20260921070000_studio_signup_policy.sql` : écarté en A, gardé en B.
- La sauvegarde des objets Storage est séparée de la sauvegarde de la base.
- `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` (`closed`/`open`) et
  `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` restent ouvertes. Le choix d'hébergeur du
  worker pèse **plus lourd en A** (il y détient la clé de toute la plateforme).

---

## 11. La question pour Julien

> **Q-STUDIO-SUPABASE — La clé `service_role` qu'utilisent le web Studio et le worker vidéo
> doit-elle pouvoir, en cas de fuite, lire et modifier toutes les données ELSATIA (Gestion
> Pro, Colors, Tools, Réserves) ?**
>
> - **Non** → **Option B, projet dédié.** Vous confirmez la décision Q-004 du 2026-09-20. Vous
>   acceptez en échange :
>   - 2 projets Supabase de plus ;
>   - un amendement explicite de `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` pour Studio ;
>   - la construction d'un pont d'identité.
>
>   Précisez lequel : **I1** (jeton signé, prouvé), **I2** (OIDC Supabase, sous réserve de
>   disponibilité) ou **I3** (liaison sans SSO).
> - **Oui, risque accepté** → **Option A, projet partagé.** Vous annulez Q-004. Vous acceptez en
>   échange des réglages Auth communs à tous les produits : mot de passe, confirmation e-mail,
>   gabarits. Vous imposez alors deux correctifs avant toute Preview publique de Studio :
>   - la suppression de compte Studio sans `deleteUser` (A-T5) ;
>   - l'arbitrage global de la confirmation e-mail (A-T3).

Réponse attendue, en une ligne. Par exemple : « **B + I1** », « **B + I3** » ou « **A** ».

Dès la réponse, sans nouvelle instruction :

- `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` pourra être fermée ;
- le STEP 8 du merge plan (lot post-H) deviendra exécutable ;
- `apps/studio/.env.preview.example` et le manifeste pourront être réalignés (V3 §8).
