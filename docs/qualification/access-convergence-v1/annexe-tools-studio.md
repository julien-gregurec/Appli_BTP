# Tools (protections Pro) et Studio (signup fermé) — analyse lecture seule

Sources : exports `night/` et `studio2/` (05c775d5). Chemins relatifs à la racine ; migrations = `supabase/migrations/`. [LU] = lu ; [INFÉRÉ] = déduit, non exécuté. Aucun appel réseau.

## Synthèse

- **Tools** : le moteur Pro et les exports sont locaux et gardés par l'interface seule (inévitable en SPA offline-first). Côté serveur, l'écriture cloud `tools_projects` est contrôlée par un critère **différent** de l'UI (accès entreprise + rôle `tools_pro`, jamais entitlement ni `saved-projects`). Verdict partiel : 2 P1.
- **Studio** : le signup fermé est contournable en un appel à l'API Auth publique, et le mode par défaut est ouvert. 2 P1.

## PARTIE 1 — TOOLS

### 1.1 Fonctions purement locales

- `apps/tools/src/components/CalculatorWorkspace.tsx:16,19` importe statiquement `ProCalculatorWorkspace` : `pro-engine.ts`, jsPDF, exports et impression sont **livrés à tout visiteur**, même anonyme. `apps/tools/public/sw-tools.js:2-13` précache les pages Pro. [LU]
- Calcul, PDF, SVG, impression : aucun appel serveur (`exports/pdf.ts:35`, `svg.ts:31`, `print.ts:14`, `pro-engine.ts:80`). [LU]
- Seule porte : `hasCapability()` (`lib/access.ts:36`) dans `ProCalculatorWorkspace.tsx:30,70` et `ProjectsWorkspace.tsx:23`. Le cache d'entitlement est signé avec une clé stockée au même endroit (`lib/entitlements.ts:33-44`, `lib/auth/secure-storage.ts:71-86`) : contournable par l'utilisateur. [LU]
- **P2, à assumer** : la valeur protégée est le cloud et la facturation, pas le calcul. `project-duplicate`, `project-archive`, `advanced-geometry`, `construction-points` et `derived-quantities` n'ont aucune porte propre, seul le palier compte.

### 1.2 Fonctions touchant le serveur

| Fonction | Équivalent serveur ? | Preuve |
|---|---|---|
| Sync cloud `tools_sync_project_entreprise`, écriture `tools_projects` | **PARTIEL** | `20260831000238…sql:49-62` : RLS = `user_id=auth.uid()` + `a_acces_application(org,'tools')` ; `:73` idem dans la RPC (`security invoker`). Aucune lecture de `entitlements_utilisateurs_elsatia` ni de `saved-projects`. |
| Lecture `tools_projects` | Partiel | `:52-54`, même critère |
| Suppression `tools_projects` | Oui | `20260902000255…sql:1164` (DELETE révoqué, suppression logique) |
| `tools_resoudre_entitlements*` | Oui | `20260906000266…sql:372-437` ; entreprise `20260831000238…sql:28-39` |
| Écriture `entitlements_utilisateurs_elsatia` | Oui | `…236:357-372` (SELECT seul), `…255:677-679`, `20260901000240…sql:19-67` (rôle + AAL2), `…237:114` (`service_role`) |
| Checkout, portail, vérifs Apple/Google | Oui | `src/app/api/tools/monetization/*/route.ts`, Bearer vérifié (`src/lib/tools-monetization.ts:69-75`) |
| Webhooks Stripe/Apple/Google | Oui | signature 300 s (`stripe.ts:55-68`), `livemode` refusé (`stripe/webhook/route.ts:15,20`), journal idempotent (`tools-monetization.ts:206-232`), `appAccountToken` et `obfuscatedAccountId` liés à l'utilisateur (`tools-native-monetization.ts:38,113`) |
| Impression, exports, projets locaux (IndexedDB) | Non | locaux |

### 1.3 Constats

**P1-a — L'écriture cloud ignore l'entitlement Pro et `saved-projects`** [LU]
- Preuves : `20260831000238…sql:49-62,73` ; `…236:374` (INSERT/UPDATE accordés à `authenticated`) ; gate UI seulement dans `AccountProvider.tsx:80` et `ProjectsWorkspace.tsx:23`.
- Scénario : un abonné résilie, son entitlement expire, l'UI repasse en Free. Son JWT reste valide et son entreprise garde l'accès `tools` avec le rôle `tools_pro` (seul rôle Tools, `…236:18-27`). Il appelle `POST /rest/v1/tools_projects` ou `rpc/tools_sync_project_entreprise` avec la clé publique et continue à écrire du cloud sans droit Pro.
- Aggravant : `project_payload` non borné en taille, aucun quota de lignes (`…236:251-273`).
- Précondition : l'entreprise a l'accès `tools` activé par la plateforme.
- Correctif à prévoir : lire `saved-projects` via `tools_resoudre_entitlements()` dans la RLS et la RPC, plus des plafonds.

**P1-b — Deux sources de vérité, acheteur « payé mais Free »** [LU]
- La base exige un accès entreprise ; l'UI exige accès entreprise **et** entitlement utilisateur. L'achat ne vérifie aucune entreprise (`checkout/route.ts:6-11`, `apple/verify`, `google/verify`).
- `AccountProvider.tsx:68-71` : sans entreprise autorisée, Free avec « Aucune entreprise autorisée ». Un particulier qui paie Tools Pro reste Free.
- `20260908000277…sql:41,51` déclare Tools en `portee_donnees='compte'`, alors que RLS et RPC restent par entreprise. Contradiction non tranchée.
- Contrat « entitlement adéquat → Pro » : non tenu pour ce cas.

**P2-a** — `AccountProvider.tsx:82` : toute exception de sync fait `setAccess(FREE_ACCESS)` avec « Accès entreprise retiré », même sur simple erreur réseau. Ne bloque jamais Free, dégrade un Pro sain. [LU]

**P2-b** — `tools-monetization.ts:165` accepte `metadata.product_sku` si le `price` est inconnu, et le webhook (`route.ts:42`) préfère `metadata.elsatia_user_id` au mapping client. Exploitable seulement par qui écrit dans le même compte Stripe Test. [LU]

**P2-c** — `catalog/route.ts:5-8` : GET public qui appelle Stripe à chaque requête (`tools-monetization.ts:142-159`, sans cache) ; aucune limite de débit sur `checkout`, `portal`, `catalog` (`src/proxy.ts`). [LU]

**P2-d** — Achat réel impossible : Stripe exige `sk_test_` (`tools-monetization.ts:47`), Apple figé sur SANDBOX (`tools-native-monetization.ts:23,36`), Google enregistré en `sandbox`. [LU]

**Tenu** : Tools Free n'est jamais bloqué. `CalculatorWorkspace.tsx:7,35` utilise `FREE_ACCESS` en dur et chaque échec de résolution retombe sur Free (`AccountProvider.tsx:60-72`). [LU]

## PARTIE 2 — STUDIO

**(a) `POST /auth/v1/signup` avec la clé publique en mode fermé : compte créé.** [LU]
- `apps/studio/supabase/config.toml:181,226` `enable_signup = true` ; hook `before_user_created` commenté (`:293-296`) ; captcha commenté (`:219`).
- Le gate n'existe que dans la server action `signup` (`apps/studio/src/app/actions.ts:69-70`, `lib/entitlement.ts:12-19`). L'API Auth ne l'appelle jamais.
- `enable_confirmations = true` (`:231`) : confirmation e-mail requise, mais l'attaquant contrôle sa boîte. Les E2E utilisent d'ailleurs `auth.signUp` en direct (`tests/foundation.spec.ts:47,241`, `account.spec.ts:49`, `auth-recovery.spec.ts:80`, `analysis.spec.ts:16`).
- Réserve : `config.toml` ne vaut qu'en local ; les réglages Auth du projet hébergé sont à vérifier. Aucun projet distant n'est provisionné selon la mémoire projet. [INFÉRÉ]

**(b) Workspace et rendu : oui.** [LU]
- `studio_create_workspace` est accordée à `authenticated` (`20260912120000_studio_workspace_foundation.sql:57-78,122`) sans test d'admission, seulement `auth.uid()` et 20 espaces max.
- `admission_open` (`20260920010000_studio_render_admission.sql:7,32`) est un interrupteur **global**, pas une porte par utilisateur. Plafonds : 30 rendus/h/utilisateur, 200/jour/espace, 6 actifs (`:8-11`).
- Un compte peut ouvrir 20 espaces à 20 Gio de médias chacun (`20260912140000_studio_media_upload.sql:7-8`). Comptes illimités = coût illimité.

**(c) Invitation : rejeu impossible, une réserve.** [LU]
- Jeton 32 octets, seul le SHA-256 est stocké (`lib/invitations.ts:9-12`) ; usage unique avec `for update`, expiration ≤ 14 j, ré-invitation qui révoque la précédente, adresse du compte = adresse invitée (`20260921030000_studio_invitations.sql:39,77-95`, l.86).
- Cela tient parce que l'e-mail est confirmé avant toute session. Si les confirmations étaient coupées sur l'hébergé, s'inscrire avec l'adresse de la victime donnerait une session immédiate et un détournement. [INFÉRÉ]
- **P2** : en mode fermé, `studio_pending_invitation_for` (`:99-103`) ouvre le signup à toute adresse ayant une invitation en attente, sans jeton. Un compte admis peut donc inviter n'importe qui (50 en attente par espace × 20 espaces, `:36`, foundation `:72`). Le squat d'une adresse invitée est possible. [INFÉRÉ]
- **P2** : sur échec d'envoi, l'URL d'invitation part en query string d'une redirection (`actions.ts:145`).

**(d) Défaut fail-open : P1.** [LU]
- `lib/signup-gate.ts:4-5` : variable absente ou valeur inconnue (« close », « fermé », vide) → `"open"`. Rien dans le dépôt ne définit la variable (mentionnée seulement dans `docs/qualification/ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md` §4), dont le §5 interdit l'accès par défaut en cas d'indisponibilité.
- Bon point : `hasPendingInvitation` échoue en fermé (`entitlement.ts:16`, `invitations.ts:98`).

**(e) Correctif minimal recommandé** (rien n'est modifié)

1. **Source unique en base** : table singleton `studio_signup_policy` (mode, liste), défaut **`closed`**, et fonction `studio_signup_permitted(email)` combinant mode, liste et `studio_pending_invitation_for`. Migration additive au prochain horodatage Studio.
2. **Hook `before_user_created`** qui appelle cette fonction, fail-closed. Grants réservés à `supabase_auth_admin`. Il ferme l'API directe et tout futur fournisseur externe. Local via `config.toml:293-296` ; hébergé via tableau de bord ou poussée de config, non déployé ici. [INFÉRÉ]
3. **Défense en profondeur** : le même prédicat dans `studio_create_workspace` (`foundation.sql:57-78`), et la server action `signup` qui appelle la même fonction au lieu de l'environnement.
4. Fixtures E2E à adapter (création par `auth.admin.createUser`), et à confirmer en recette que le hook couvre ce chemin. [INFÉRÉ]

Alternative écartée : `enable_signup=false` puis création par action serveur avec clé service. Elle casse tous les tests directs et place le secret le plus puissant dans le chemin d'inscription. Optionnel (P2) : plafonner les invitations en attente par inviteur.

**Identité et contrat multi-app**
- **Identité dédiée** : projet Supabase et `auth.users` propres à Studio, sans lien avec Gestion Pro (`foundation.sql:1-2,9,21`). Aucune référence à `applications_elsatia`, `a_acces_application` ni `entitlements_utilisateurs_elsatia` dans `apps/studio` ou ses migrations. [LU]
- **Membership** : `studio_workspace_members` (`owner`/`admin`/`editor`/`viewer`, un seul owner, écritures par RPC uniquement, `foundation.sql:18-29,55`), pivot `studio_my_role` (`:42-49`).
- **Contrat multi-app final : absent.** `EntitlementProvider.canSignUp(email)` (`lib/entitlement.ts:9-19`) est un interrupteur provisoire. Le jeton d'habilitation signé (JWS, `aud:"studio"`, `jti`, `platform_subject`) du contrat d'accès n'a ni émetteur ni vérificateur. Toute l'admission repose sur le gate local, contournable et ouvert par défaut. Pas de raccord plateforme proposé (lot séparé).

## Classement

| Réf. | Sév. | Objet |
|---|---|---|
| P1-a | P1 | Écriture `tools_projects` sans entitlement ni `saved-projects` |
| P1-b | P1 | Critères base/UI divergents, acheteur sans entreprise reste Free |
| Studio (a)+(b) | P1 | Signup fermé contournable par l'API Auth, compte utilisable jusqu'au rendu |
| Studio (d) | P1 | Mode par défaut ouvert |
| Studio (c) | P2 | Invitation transitive en fermé, squat d'adresse, lien en URL |
| Tools 1.1, a-d | P2 | Voir plus haut |
