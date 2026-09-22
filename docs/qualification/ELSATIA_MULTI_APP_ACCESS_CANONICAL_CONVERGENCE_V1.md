# ELSATIA — Convergence canonique de l'accès multi-application — V1

Date : 2026-09-22 · Branche d'intégration : `claude/quirky-noether-n8aerc` (poussée depuis un
commit identique à `main` @ `4d92ddb`, aucun autre commit dessus au moment du départ) · Session :
`session_016o4kJj26SaPhgLsAXcfZd5`.

**Mise à jour du 2026-09-22 (seconde passe, même session/branche)** : reprise là où la première
passe s'était arrêtée (§1.5 y notait ~240 des 255 branches non classifiées). Cette passe classe
~45 branches supplémentaires nommées dans le mandat (§1.5bis), documente une troisième lignée
jusque-là non identifiée — un tronc mono-app GP jamais fusionné, distinct de la lignée
d'entitlement multi-app (§1.6) — et **porte un correctif ciblé** sur
`claude/quirky-noether-n8aerc` : une vraie faille d'auto-promotion de rôle plateforme, présente
aujourd'hui sur cette branche, vérifiée par lecture directe du SQL actuel (§11, commit `cacada0`).
C'est le premier changement de code de cette mission ; il ne modifie ni ne résout la question du
modèle canonique multi-app, qui reste un sujet séparé et toujours ouvert.

**Portée de ce document** : reconstruction d'historique et comparaison de modèles à partir de
preuves git réelles (SHA cités, contenu lu avec `git show`/`git log -S`, pas de suppositions),
suivies d'une évaluation honnête de ce qui peut réellement être convergé sur
`claude/quirky-noether-n8aerc` dans cet environnement. **Aucune donnée ni preuve de ce document
n'est inventée** : chaque affirmation est tracée à une commande exécutée dans cette session, sauf
mention explicite « rapporté par la session antérieure, non revérifié ici ».

**Constat central, à lire avant tout le reste** : `main` (et donc `claude/quirky-noether-n8aerc`,
qui lui était identique au démarrage de cette mission — voir §11 pour le seul commit qui l'en
distingue désormais) est un dépôt **mono-application** — `liria-gestion-pro` (Gestion Pro
seul, `package.json` racine, pas de champ `workspaces`). Il n'y a **ni `apps/`, ni `packages/`**
sur `main` (`ls apps/` → *No such file or directory*). Tout l'écosystème multi-application
ELSATIA (Colors, Tools, Réserves, le paquet `packages/application-access`, le catalogue
`applications_elsatia`, le contrat `decision_acces_application`) **n'existe que sur des branches
jamais fusionnées**, divergentes de `main` de 250 à plus de 560 commits. Ce fait, vérifié par
lecture directe de l'arbre (§1.1), détermine tout le reste de ce rapport : il n'y a, sur la
branche d'intégration demandée, ni code ni schéma à qualifier ou à faire évoluer pour le modèle
d'accès multi-app — seulement un historique à reconstruire et une décision à documenter
honnêtement pour la suite.

---

## 1. HISTORY — reconstruction d'historique

### 1.1 Où en est réellement `main` / `claude/quirky-noether-n8aerc`

- `git branch --show-current` sur `main` → `4d92ddb` (« feat: enrichir devis suivi terrain et
  pilotage »). `packages.json.name = "liria-gestion-pro"`, version `3.0.0`.
- `ls apps/`, `ls packages/` → absents. `supabase/migrations/` : 178 fichiers, le plus récent
  `20260729000183_medias_devis.sql` (conforme aux faits de cadrage).
- Recherche exhaustive sur `main` (`git grep`) : **aucune** occurrence de `applications_elsatia`,
  `acces_applications_entreprises`, `habilitations_applications_utilisateurs`,
  `decision_acces_application`, `a_acces_application`, `module_gestion_pro_actif_entreprise`,
  `ELSATIA_GP_ACCES_APP`. En revanche `main` possède déjà le socle sur lequel tout ce travail
  s'appuie plus tard : `entreprises` (migration `20260710000001_comptes_entreprises.sql`),
  `plateforme_admins` / `est_plateforme_admin()` (migration
  `20260710000036_plateforme_abonnements.sql`) — 22 occurrences dans `supabase/migrations/`.
- **Confirmation branche d'intégration** : `origin` n'avait **pas** encore de
  `claude/quirky-noether-n8aerc` au démarrage de cette session (`git ls-remote origin
  refs/heads/claude/quirky-noether-n8aerc` → vide) ; seule une branche locale du même nom existait
  dans le worktree principal du dépôt (`+ claude/quirky-noether-n8aerc`, déjà extraite ailleurs,
  donc non réutilisable dans ce worktree isolé). Le travail de cette session a donc été fait sur
  la branche locale de ce worktree (`worktree-agent-a3de47998bc6852a4`, même commit `4d92ddb`) et
  **poussé sous le nom exact `claude/quirky-noether-n8aerc` sur `origin`** avec
  `git push origin HEAD:refs/heads/claude/quirky-noether-n8aerc`, ce qui crée cette réf distante
  pour la première fois. Aucun autre nom de branche n'a été créé ; `main` n'a pas été touché.

### 1.2 La ligne de travail réelle du modèle d'entitlement multi-app

Reconstruite par `git log --all -S`, `git grep` sur plusieurs branches et lecture des messages de
commit (dates, SHA vérifiés) :

| Date | SHA | Branche | Contenu |
| --- | --- | --- | --- |
| 2026-08-26 | `d770053` | `codex/multi-app-convergence-v1` | Socle initial : `applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, `a_acces_application()`, `applications_autorisees()`, `est_plateforme_admin()` confirmée seule fonction admin canonique. Migration `20260826000234_elsatia_multi_app_convergence_v1.sql`, doc `docs/architecture/ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` — reprend et adopte **le schéma déjà construit côté Colors**, porté à la main (pas de fusion git) dans le dépôt canonique `elsatia-main`. |
| 2026-08-27 | `a4c01ea` | `codex/elsatia-colors-canonical-integration-v1` | Colors aligné sur ce socle canonique. |
| 2026-08-27 | `7477014` | `feat/elsatia-gestion-pro-multi-app-ui-v1` | UI d'administration multi-app côté GP. |
| 2026-09-11 | `d41f835` | `fix/service-role-flux-acl-255-v1` | **Sujet différent** (voir §1.3) — porte un « D1 » homonyme mais sans rapport avec l'entitlement multi-app. |
| 2026-09-20/21 | `440915c`, `8eb7da2`, `417ed75`, `290f6bf` | `fix/app-access-convergence-v1` | 4 commits, au-dessus de la base `d7d59c9e` (`fix/colors-shared-auth-access-night-v1` = Train V3 `59e960a0` + 30 commits Colors/Réserves/Tools). C'est le lot qui **fige** le contrat `decision_acces_application` v1 (D1/D2/D3 de Julien, tranchées le 2026-09-21) — voir §3 et le rapport qualité complet cité en §1.4. |
| 2026-09-20 | `bb42e1d` | `claude/preview-rehearsal-security-fixes-v1` | Fuite cross-tenant `module_gestion_pro_actif_entreprise` trouvée et corrigée (voir §4). |
| 2026-09-20 | `71565ed` | `claude/preview-rehearsal-security-fixes-v1-rpc-sweep` | Fermeture des 7 RPC sœurs (voir §4). |
| 2026-09-21 | `22ce381` | `claude/elsatia-redteam-v3` | 3 RPC `SECURITY DEFINER` supplémentaires révoquées à `authenticated` (capacité Stripe, Boutique) — sujet capacité/facturation, pas l'entitlement multi-app, mais même famille de risque (grant `authenticated` oublié). 565 commits devant `main`, 313 migrations rejouées. |

**Lecture honnête** : il s'agit d'une **lignée unique qui converge dans le temps**, pas de deux
modèles rivaux. Le schéma d'Août (catalogue + droit d'usage + habilitation + `a_acces_application`)
est repris tel quel par le contrat de Septembre (`decision_acces_application`), qui le
**réécrit en conservant la signature et les GRANT/REVOKE** de `a_acces_application` pour n'ajouter
que la priorité de suspension plateforme et découpler le statut commercial par application (voir
§3). Vérifié directement : `packages/application-access/sql/decision_acces_application.sql.proposed`
sur `fix/app-access-convergence-v1` référence bien `applications_elsatia`,
`acces_applications_entreprises`, `habilitations_applications_utilisateurs`,
`utilisateurs_entreprises`, `plateforme_admins`, `entreprises` — les tables du socle d'Août. Voir
§2 pour la conclusion MODEL A / MODEL B.

### 1.3 Un piège de nommage réel : deux « D1/D2/D3 » sans rapport

`fix/service-role-flux-acl-255-v1` (2026-09-11, `docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md`)
porte lui aussi des décisions « D1 » (« validée le 2026-09-11 », EXECUTE de
`boutique_finaliser_commande_payee` retiré à `authenticated`/`anon`). **Ce D1 n'a rien à voir**
avec le D1 de Julien du 2026-09-21 (habilitation `gestion_pro` requise) : c'est un tout autre
sujet — les flux `service_role` (webhooks Stripe Connect, paie, Powens) cassés par la migration
`20260902000255_acl_reconciliation_v1.sql` (elle-même une purge de 1 220 révocations de grants
excédentaires, cf. `codex/elsatia-acl-reconciliation-v1`, §1.2 non listé ici par souci de portée).
Preuve supplémentaire de la casse en chaîne : le rapport de 2026-09-11 dit avoir *appliqué*
D1 (retrait du grant `authenticated` sur `boutique_finaliser_commande_payee`), et pourtant le
correctif red-team du 2026-09-21 (`22ce381`, §1.2) referme **le même grant** en expliquant qu'il
« a été laissé en place quand `20260902000255` l'a révoqué à `service_role` » — c'est-à-dire que
le correctif du 09-11 sur une branche n'a pas survécu à un ré-alignement ultérieur sur une autre
branche. C'est exactement la dérive décrite dans le mandat de cette mission (« ACL patches
concurrents ») : deux corrections légitimes du même point, sur deux lignées différentes, qui ne se
sont jamais rencontrées. Ceci **corrobore** — avec une preuve concrète — le diagnostic de
l'audit préalable, sans qu'il soit besoin de l'inventer.

### 1.4 Document déjà existant, non modifié par cette session

Le rapport de qualification cité dans le mandat existe réellement et a été lu en entier dans cette
session : `docs/qualification/ELSATIA_APPLICATION_ACCESS_CONVERGENCE_V1.md` sur
`origin/fix/app-access-convergence-v1` (commit `290f6bf`), 340 lignes, ainsi que ses 7 annexes sous
`docs/qualification/access-convergence-v1/`. Son contenu (résumé en §3-§7 ci-dessous) est fidèle à
ce que dit le mandat, avec une seule nuance : « base = Train V3 + 30 commits » désigne la
**branche de base** `d7d59c9e` (Colors/Réserves/Tools), pas le nombre de commits du lot D1/D2/D3
lui-même, qui tient en **4 commits** au-dessus de cette base (§1.2). **Ce document et ses annexes
n'ont pas été copiés sur `claude/quirky-noether-n8aerc`** (voir §8 « pourquoi ») ; ils restent
consultables par SHA/branche pour quiconque a accès au dépôt : `git show
origin/fix/app-access-convergence-v1:docs/qualification/ELSATIA_APPLICATION_ACCESS_CONVERGENCE_V1.md`.

### 1.5 Classification des branches (échantillon nommé dans le mandat + ce que cette session a trouvé)

Il existe **255 branches distantes** (`git branch -r | wc -l`). Les classifier une par une dépasse
le budget de cette session ; voici les branches nommées dans le mandat ou trouvées pertinentes,
avec leur tête réelle et une classification honnête :

| Branche | Tête (date, sujet) | Classification |
| --- | --- | --- |
| `fix/app-access-convergence-v1` | 2026-09-21 `290f6bf` | **CANONICAL_CANDIDATE** — contrat `decision_acces_application` v1 figé, D1/D2/D3 de Julien, le plus abouti trouvé. |
| `codex/multi-app-convergence-v1` | 2026-08-26 `d770053` | **SUPERSEDED** — socle d'origine, repris et réécrit par le candidat ci-dessus (même tables, `a_acces_application` réécrite en conservant sa signature). |
| `codex/elsatia-colors-canonical-integration-v1` | 2026-08-27 `a4c01ea` | **SUPERSEDED** — alignement Colors sur le socle du 26/08, antérieur au contrat figé. |
| `feat/elsatia-gestion-pro-multi-app-ui-v1` | 2026-08-27 `7477014` | **PARTIAL** — UI d'admin multi-app, non recroisée avec le contrat figé de septembre dans cette session (hors budget). |
| `feat/elsatia-canonical-integration-v1` / `-r73-v1` / `-preprod-v1` | 254/258/260 commits devant `main` | **REQUIRES_RECONCILIATION** — trois variantes d'un même effort d'intégration « canonique », non comparées entre elles dans cette session (budget) ; toutes à ~255-260 commits de `main`, aucune ne contient `apps/` (juste `packages/application-access`), donc probablement une convergence partielle antérieure au monorepo complet de `fix/app-access-convergence-v1`. |
| `codex/elsatia-acl-reconciliation-v1` | 2026-09-02 `d4dee2f` | **PARTIAL / orthogonal** — hygiène des GRANT Postgres (855 ACL excédentaires purgées), pas le modèle d'entitlement. Nécessaire mais insuffisant : a lui-même cassé des flux `service_role` (§1.3). |
| `fix/service-role-flux-acl-255-v1`, `fix/document-partage-service-role-acl-v1` | 2026-09-11 | **PARTIAL** — correctifs de la casse provoquée par la 255 ci-dessus ; sujet voisin (ACL) mais pas l'entitlement multi-app. |
| `fix/studio-signup-closed-v1` | 2026-09-20 `634651a` | **CANONICAL_CANDIDATE (isolé)** — signup Studio fermé par défaut, prouvé sur GoTrue réel (200→403), non fusionné, aucune collision détectée par le rapport source avec les autres branches Studio à la date du rapport. |
| `fix/reserves-offline-resilience-train-v2` | 2026-09-08 `86ed10a` | **DUPLICATE probable de tête** — dernier commit est un « consigne le SHA », signe d'une branche de checkpoint plutôt que de travail ; non creusée davantage. |
| `claude/preview-rehearsal-security-fixes-v1` + `-rpc-sweep` | 2026-09-20 | **CANONICAL_CANDIDATE (sécurité RPC)** — correctif ciblé et testé de `module_gestion_pro_actif_entreprise` + 7 RPC sœurs (voir §4). |
| `claude/elsatia-redteam-v3` | 2026-09-21 `22ce381`, 565 commits devant `main`, 313 migrations | **PARTIAL / orthogonal** — 3 RPC de capacité/Boutique, sujet facturation, pas entitlement multi-app ; la lignée la plus avancée trouvée dans cette session (313 migrations), preuve supplémentaire que `main` est très en retard sur l'ensemble de ces travaux. |
| `integration/elsatia-ecosystem-train-v2-*`, `-train-v3-*`, `-ledger-reconciliation-p0-v1`, `-train-v2-reserves-gp-isole-v1` | 2026-09-07 à 09-09 | **REQUIRES_RECONCILIATION** — têtes en « consigne le SHA » / « audit final » : ce sont des points de contrôle de trains d'intégration antérieurs, pas des candidats en soi ; non comparés en détail (budget). |
| `chore/elsatia-preflight-r73-v1` | 2026-08-28 `314fefd` | **PARTIAL** — alignement preflight sécurité, sujet F4/preflight, pas directement l'entitlement. |
| `fix/colors-shared-auth-access-night-v1` | absente d'`origin` aujourd'hui | **DUPLICATE/purgée** — son SHA `d7d59c9e` existe toujours (ancêtre de `fix/app-access-convergence-v1`), mais la branche elle-même n'apparaît plus dans `git branch -a` : vraisemblablement supprimée après fusion locale dans `fix/app-access-convergence-v1`, ou jamais poussée sous ce nom. Le commit reste accessible par SHA. |

**Les chaînes littérales citées dans le mandat comme potentiellement approximatives se sont
révélées exactes** : `module_gestion_pro_actif_entreprise` (§4) et `ELSATIA_GP_ACCES_APP`
(`git log --all -S` positif sur plusieurs commits) existent bien, mot pour mot, dans l'historique
réel. `decision_acces_application` existe comme nom de fonction/contrat, pas comme nom de
branche. `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1` existe comme **fichier**
(`docs/architecture/ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` sur `codex/multi-app-convergence-v1`),
pas comme nom de branche.

Le reste des ~240 branches distantes (préfixes `audit/`, `docs/`, `integration/gp-*`, et bien
d'autres non nommées dans le mandat) n'a **pas** été classifié individuellement dans cette
session : ce serait plusieurs centaines d'appels git supplémentaires pour un gain marginal, la
lignée d'entitlement principale étant déjà clairement identifiée en §1.2-§1.4. **Ouvert.**

### 1.5bis Classification étendue (seconde passe, 2026-09-22) — ~45 branches supplémentaires

Reprise du mandat, branche par branche, avec tête réelle (`git log -1`), nombre de commits
d'avance sur `main`@`4d92ddb` (`git rev-list --count 4d92ddb..<branche>`) et présence de `apps/`
et `packages/` (`git ls-tree -d`). Toutes les commandes ont été exécutées dans cette session ;
aucune valeur n'est reportée d'une source tierce sans le dire.

| Branche | Tête (SHA, date) | Avance/`main` | `apps/`·`packages/` | Classification |
| --- | --- | --- | --- | --- |
| `fix/service-role-flux-acl-255-v1` | `d41f835`, 2026-09-11 | 375 | oui·oui | **PARTIAL** (inchangé vs §1.5 — confirmé, même SHA) |
| `fix/document-partage-service-role-acl-v1` | `aa430ce`, 2026-09-11 | 373 | oui·oui | **PARTIAL** — bâtie sur `59e960a` (tête de `integration/elsatia-ecosystem-train-v3-commercial-platform-v1`, Train V3). Corrige la lecture publique par jeton des pages de partage de documents (`77676db`, `e9cb4af`) cassée par la migration 255 ; dépend du contexte Train V3 (réserves, journal d'audit plateforme), pas un correctif root isolable. |
| `fix/colors-auth-callback-csp-p1-v2` | `5b21590`, 2026-09-05 | 267 | oui·oui | **UNSAFE (hors-cible)** — corrige `apps/colors`, qui n'existe pas sur `main`. Le diff touche aussi la racine (`.env.example`, `.github/workflows/ci.yml`, `PRODUCTION_CHECKLIST.md`…) parce que toute cette lignée a un socle racine déjà réécrit pour le monorepo multi-app (workspaces, CI, conventions `.env`), différent de celui de `main` — même en ignorant `apps/`/`packages/`, la base racine a divergé. |
| `fix/colors-precommercial-noindex-robots-v1` | `e427f52`, 2026-09-06 | 272 | oui·oui | **UNSAFE (hors-cible)** — même constat (socle racine divergé, app absente de `main`). |
| `fix/colors-safe-next-redirect-v1` | `5ea1d03`, 2026-09-05 | 264 | oui·oui | **UNSAFE (hors-cible)** — idem ; durcit une redirection interne dans `apps/colors`, absent de `main`. |
| `fix/colors-security-p1-closure-v1` | `260523c`, 2026-09-05 | 265 | oui·oui | **UNSAFE (hors-cible)** — idem. |
| `fix/colors-supabase-public-key-predeploy-guard-v1` | `30fed99`, 2026-09-06 | 273 | oui·oui | **UNSAFE (hors-cible)** — idem. |
| `fix/studio-signup-closed-v1` | `634651a`, 2026-09-20 | 323 | oui·oui | **CANONICAL_CANDIDATE (isolé, hors-cible)** — inchangé vs §1.5 : correctif Studio réel et testé sur GoTrue, mais Studio n'existe pas sur `main` ; racine aussi divergée (`.github/workflows/studio-*.yml` propres à cette lignée). Rien à porter ici tant que Studio n'est pas sur la branche cible. |
| `fix/tools-mobile-header-overlap-v1` | `aabf15f`, 2026-09-06 | 350 | oui·oui | **UNSAFE (hors-cible)** — corrige `apps/tools`, absent de `main`. |
| `fix/tools-predeploy-env-guard-v1` | `051f317`, 2026-09-06 | 358 | oui·oui | **UNSAFE (hors-cible)** — idem. |
| `fix/tools-print-export-safe-flow-v1` | `c8260e1`, 2026-09-06 | 330 | oui·oui | **UNSAFE (hors-cible)** — idem. |
| `fix/tools-pwa-asset-precache-update-v1` | `4b60cf2`, 2026-09-06 | 328 | oui·oui | **UNSAFE (hors-cible)** — idem. |
| `fix/tools-supabase-public-key-convention-v1` | `094bd43`, 2026-09-06 | 359 | oui·oui | **UNSAFE (hors-cible)** — idem. |
| `fix/reserves-offline-resilience-train-v2` | `86ed10a`, 2026-09-08 | 328 | oui·oui | **DUPLICATE probable de tête** (inchangé vs §1.5) — tête « consigne le SHA », checkpoint de train plutôt que travail. |
| `feat/elsatia-canonical-integration-v1` | `95a1bbb`, 2026-08-27 | 254 | **non**·oui | **REQUIRES_RECONCILIATION** (inchangé vs §1.5 — confirmé : pas de `apps/`, juste `packages/application-access`). |
| `feat/elsatia-canonical-integration-r73-v1` | `24c944d`, 2026-08-28 | 258 | **non**·oui | **REQUIRES_RECONCILIATION** (idem). |
| `feat/elsatia-canonical-integration-preprod-v1` | `9ad2729`, 2026-09-02 | 260 | oui·oui | **REQUIRES_RECONCILIATION** — contrairement aux deux ci-dessus, celle-ci a déjà `apps/` (tête = « feat(auth): add Supabase TOTP MFA and AAL2 guards », même sujet que `codex/elsatia-mfa-aal2-v1` ci-dessous, à quelques jours près) : c'est une variante plus avancée, pas un simple synonyme des deux premières. |
| `codex/elsatia-colors-canonical-integration-v1` | `a4c01ea`, 2026-08-27 | 244 | oui·oui | **SUPERSEDED** (inchangé vs §1.5, confirmé même SHA). |
| `feat/elsatia-colors-canonical-integration-v1` | `00e383d`, 2026-08-29 | 260 | oui·oui | **DUPLICATE probable** de `codex/elsatia-colors-canonical-integration-v1` — même sujet (« integrate Colors v1.3 into canonical platform »), 2 jours plus tard, préfixe `feat/` au lieu de `codex/` ; non diffées l'une contre l'autre dans cette session (budget), mais le nommage quasi identique et l'écart de 2 jours suggèrent une reprise du même lot sous deux conventions de nommage différentes plutôt que deux travaux indépendants. |
| `feat/elsatia-gestion-pro-multi-app-ui-v1` | `7477014`, 2026-08-27 | 244 | **non**·oui | **PARTIAL** (inchangé vs §1.5, confirmé même SHA). |
| `codex/elsatia-acl-reconciliation-v1` | `d4dee2f`, 2026-09-02 | 256 | oui·oui | **PARTIAL/orthogonal** (inchangé vs §1.5, confirmé même SHA). |
| `codex/elsatia-capacity-stripe-r2-v1` | `fc3b313`, 2026-09-06 | 265 | oui·oui | **DUPLICATE probable de tête** — dernier commit « wip(storage): sauvegarde avant nettoyage disque », un checkpoint de sauvegarde, pas un livrable. |
| `codex/elsatia-mfa-aal2-v1` | `b4fe130`, 2026-09-02 | 256 | oui·oui | **PARTIAL** — MFA TOTP/AAL2 pour la plateforme multi-app ; sujet orthogonal à l'entitlement, dépend du socle `apps/`. |
| `codex/elsatia-preprod-db-e2e-rollback-v1` | `a354d13`, 2026-09-02 | 262 | oui·oui | **PARTIAL** — validation E2E DB et rollback préprod ; outillage de recette, pas un modèle d'accès. |
| `codex/elsatia-root-qa-closure-v1` | `01720b6`, 2026-09-02 | 256 | oui·oui | **PARTIAL** — clôture qualité (typecheck/lint/dépendances) à la racine du monorepo multi-app ; non applicable à `main` qui n'a pas ce monorepo. |
| `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` | `1fc1331`, 2026-09-08 | 324 | oui·oui | **REQUIRES_RECONCILIATION** — tête « consigne le SHA », point de contrôle du Train V2 (inchangé dans l'esprit vs §1.5). |
| `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` | `59e960a`, 2026-09-09 | 370 | oui·oui | **REQUIRES_RECONCILIATION** — tête du Train V3 (« audit final d'integration et de preparation au cutover ») ; base directe de `fix/document-partage-service-role-acl-v1` ci-dessus, donc bien un point d'ancrage réel pour d'autres branches, pas une impasse. |
| `integration/elsatia-ledger-reconciliation-p0-v1` | `4f1f170`, 2026-09-07 | 315 | oui·oui | **REQUIRES_RECONCILIATION** — intégration du lot « Client Contracts » (« aucune migration » selon le message), P0 ledger. |
| `integration/elsatia-train-v2-reserves-gp-isole-v1` | `50c50ff`, 2026-09-08 | 322 | oui·oui | **DUPLICATE probable** de `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` — même famille Train V2 Réserves/GP, tête « consigne le SHA final poussé » un jour plus tard ; non diffées entre elles (budget). |
| `integration/gp-client-contracts-snapshot-v1` | `0bfebd8`, 2026-09-07 | 307 | oui·oui | **REQUIRES_RECONCILIATION** — rapport ELSATIA-GP-CLIENT-CONTRACTS-SNAPSHOT-INTEGRATION ; dépend du monorepo multi-app malgré le nom « gp-». |
| `integration/gp-external-pilot-closure-v1` | `8f5fca1`, 2026-09-20 | 254 | **non**·**non** | **CANONICAL_CANDIDATE (mono-app, distinct de la lignée entitlement)** — voir §1.6, découverte majeure de cette passe. Contient le correctif porté en §11. |
| `integration/gp-postcutover-migration-train-v1` | `049a401`, 2026-09-06 | 299 | oui·oui | **PARTIAL** — réconciliation du train de migration post-cutover ; dépend du cutover multi-app malgré le nom « gp-». |
| `integration/gp-postcutover-pilot-hotfix-v1` | `7ba62c5`, 2026-09-06 | 297 | oui·oui | **PARTIAL** — idem, hotfixes post-cutover consolidés. |
| `integration/gp-postcutover-precommercial-ops-v1` | `4266ba6`, 2026-09-06 | 300 | oui·oui | **PARTIAL** — idem, ops précommerciales post-cutover. |
| `audit/elsatia-boutique-commerce-architecture-v1` | `65999e2`, 2026-09-08 | 330 | oui·oui | **REQUIRES_RECONCILIATION** — audit d'architecture Boutique/Commerce, R3 clos selon la tête ; non recroisé avec le contrat D1/D2/D3 (budget). |
| `audit/elsatia-contact-card-architecture-v1` | `0e644d5`, 2026-09-08 | 329 | oui·oui | **REQUIRES_RECONCILIATION** — idem, architecture Contact Card. |
| `audit/elsatia-drone-scan-architecture-master-v1` | `513968e`, 2026-09-08 | 296 | oui·oui | **REQUIRES_RECONCILIATION** — idem, architecture Scan/Drone. |
| `docs/elsatia-capacity-stripe-r2-preflight-v1` | `ba96544`, 2026-09-03 | 264 | oui·oui | **PARTIAL/documentaire** — préparation R2 capacité/Stripe ; dépend du module de facturation modulaire multi-app (celui qui introduit `module_gestion_pro_actif_entreprise`, §4). |
| `docs/elsatia-hardware-shop-labels-readiness-v1` | `d99f596`, 2026-09-03 | 268 | oui·oui | **PARTIAL/documentaire** — écosystème boutique matériel + Labels. |
| `docs/elsatia-integration-core-market-readiness-v1` | `947fcf1`, 2026-09-02 | 264 | oui·oui | **PARTIAL/documentaire** — readiness du cœur d'intégration Elsatia. |
| `docs/elsatia-modular-billing-capacity-readiness-v1` | `ac6045b`, 2026-09-03 | 265 | oui·oui | **PARTIAL/documentaire** — audit facturation modulaire + capacité personnes actives ; même famille que le module cité en §4. |
| `docs/elsatia-modules-commercial-pricing-v1` | `da9c8be`, 2026-09-03 | 266 | oui·oui | **PARTIAL/documentaire** — stratégie tarifaire modulaire. |
| `docs/elsatia-production-migration-cutover-preflight-v1` | `25e377b`, 2026-09-03 | 267 | oui·oui | **REQUIRES_RECONCILIATION** — preflight cutover production (GP + Colors + Tools), donc directement pertinent le jour où une fusion multi-app serait tentée. |
| `docs/elsatia-production-rollback-runbook-v1` | `a3aad60`, 2026-09-02 | 262 | oui·oui | **REQUIRES_RECONCILIATION** — runbook go-live/rollback production ; même remarque. |

**Aucune divergence trouvée avec les classifications déjà publiées en §1.5** : chaque SHA
recontrôlé (`fix/service-role-flux-acl-255-v1`, `fix/studio-signup-closed-v1`,
`fix/reserves-offline-resilience-train-v2`, `codex/elsatia-acl-reconciliation-v1`,
`feat/elsatia-canonical-integration-v1`/`-r73-v1`, `feat/elsatia-gestion-pro-multi-app-ui-v1`,
`claude/elsatia-redteam-v3`, `claude/preview-rehearsal-security-fixes-v1(-rpc-sweep)`) correspond
exactement à ce que §1.5 rapportait. Rien à corriger dans les classifications antérieures.

### 1.6 Découverte de cette passe : un tronc mono-app GP jamais fusionné, distinct de l'entitlement multi-app

`integration/gp-external-pilot-closure-v1` (`8f5fca1`, 2026-09-20) a un profil unique parmi les
branches examinées : **254 commits d'avance sur `main`, et ni `apps/` ni `packages/` à aucun
moment de cette avance** (`git diff --name-only 4d92ddb..8f5fca1 | grep -E '^(apps|packages)/'` →
vide, sur les 727 fichiers touchés). `git merge-base 4d92ddb 8f5fca1` retourne `4d92ddb`
lui-même : `main` est un ancêtre direct de cette branche, ce n'est pas une divergence ancienne
recollée.

Ce n'est **pas** une branche isolée : elle partage un tronc commun avec la lignée multi-app
elle-même — `git merge-base` entre `8f5fca1` et `codex/elsatia-root-qa-closure-v1` (une branche
multi-app confirmée, §1.5bis) retourne `ca2f2a2` (« fix(pricing): route commercial CTAs to
contact page », 2026-08-26, 240 commits après `main`), qui est un commit **linéaire** de
`integration/gp-external-pilot-closure-v1` lui-même (pas apporté par une fusion — un seul commit
de merge existe sur toute cette plage, `4b97b50`, et il ne concerne qu'un lot interne de remises
clients/IA, rien d'ELSATIA). Lecture correcte : il existe un unique tronc de ~240 commits
(fin juillet → 26 août 2026), entièrement mono-app, sur lequel toutes ces lignées (GP-pilot,
`codex/elsatia-root-qa-closure-v1`, et par transitivité la lignée d'entitlement multi-app
elle-même) sont construites — puis, **après** ce point, les branches divergent : certaines
ajoutent `apps/`/`packages/` (la lignée multi-app, §1.2), `integration/gp-external-pilot-closure-v1`
continue seule sur 254 commits supplémentaires strictement mono-app (durcissement GP : isolation
multitenant, isolation du stockage RH/paie, en-têtes de sécurité, rate limiting, RGPD,
notifications, correctifs P0/P1/P2 « gp-v1-rc » puis « gp-pilot »).

Concrètement, `package.json.name` reste `elsatia-gestion-pro` sur toute cette branche (jamais
renommé pour le monorepo), et elle compte **251 migrations** à sa tête contre 178 sur `main`
(+73, `20260729000184` à `20260916000309`) — soit la suite naturelle, non fusionnée, du même
produit mono-app que `main`, indépendante du travail multi-app malgré un tronc commun ancien.

**Implication pratique, vérifiée par cette session (§11)** : parce que cette branche ne dépend
d'aucun schéma multi-app, certains de ses correctifs peuvent en principe s'appliquer directement
à `claude/quirky-noether-n8aerc` — contrairement à tout ce qui vit sous `apps/`/`packages/`. Un
tel correctif a été identifié, vérifié et porté (§11). Les 77 autres commits `fix(...)` de cette
branche (liste complète : voir la sortie de
`git log --reverse --format='%h %ad %s' --date=short 4d92ddb..origin/integration/gp-external-pilot-closure-v1`,
non retranscrite ici) **n'ont pas** été individuellement vérifiés contre le code actuel de
`main` — ce serait un audit de 77 diffs, hors budget de cette session. Les plus prometteurs par
seul intitulé (jamais vérifiés contre le SQL actuel, à recroiser avant tout portage) :
`7a2a4c0 fix(db): renforcer isolation multitenant et fonctions`,
`87bf61c fix(storage): isoler les documents de paie`,
`bede72e fix(authz): proteger export comptable`,
`a67ceab fix(storage): restreindre la lecture des documents RH/fournisseurs/pointage sensibles`,
`2647d4e`/`9608f70 fix(security): migrer vers la Publishable key / supprimer le repli legacy anon`,
`4211014 fix(securite): retirer le motif de contournement anon vestigial`,
`8caef21 fix(gp-v1-rc): durcit les privilèges EXECUTE anon sur 22 fonctions SECURITY DEFINER`
(ce dernier surtout : 22 fonctions d'un coup, à haute valeur si confirmé, mais trop large pour
être vérifié à la main sans DB dans cette session). **DECISION_REQUIRED** pour un futur audit
ciblé (repris en §12).

---

## 2. MODEL A / MODEL B — comparaison de modèles

**Conclusion honnête : il n'existe pas deux modèles d'entitlement rivaux.** C'est une **lignée
unique** qui se raffine dans le temps (§1.2) :

- **Génération 1 (26-27 août 2026, `codex/multi-app-convergence-v1` + alignement Colors)** :
  catalogue `applications_elsatia`, droit d'usage `acces_applications_entreprises`, habilitation
  `habilitations_applications_utilisateurs`, fonction `a_acces_application(entreprise_id, code)`
  évaluée pour `auth.uid()` avec bypass `est_plateforme_admin()`. Pas de distinction entre
  suspension de compte/plateforme et suspension commerciale d'une application : une entreprise
  inactive coupait tout, y compris via l'abonnement Gestion Pro.
- **Génération 2 (20-21 septembre 2026, `fix/app-access-convergence-v1`, D1/D2/D3 de Julien)** :
  même schéma, **réécriture** de `a_acces_application` en `decision_acces_application` (même
  signature, mêmes GRANT/REVOKE) pour ajouter une priorité `suspension_plateforme` explicite
  (prime sur tout, y compris le bypass admin), retirer `entreprise_inactive`, et scoper
  `abonnement_suspendu` **par application** (D3) ; ajoute l'observation GP non bloquante (D1) et
  le durcissement serveur des projets Tools (D2). Le différentiel `a_acces_application`
  ancienne/nouvelle est rapporté (par la session source, non rejoué ici) comme **0 refus nouveau,
  0 autorisation nouvelle** pour `gestion_pro` sur 14×3×6×6 états — c'est-à-dire une réécriture à
  iso-comportement plus une capacité ajoutée (le découplage par application), pas un changement de
  politique implicite.

Les deux workstreams voisins trouvés (§1.3, §4) — hygiène des GRANT Postgres
(`codex/elsatia-acl-reconciliation-v1`) et fermeture de RPC `SECURITY DEFINER` mal gardées
(`claude/preview-rehearsal-security-fixes-v1*`, `claude/elsatia-redteam-v3`) — **ne sont pas des
modèles d'entitlement concurrents** : ce sont des correctifs de périmètre (GRANT, gardes
d'appartenance) sur des fonctions qui n'appartiennent pas au contrat `decision_acces_application`.
Ils partagent la même préoccupation (fuite cross-tenant, grant `authenticated` oublié) mais portent
sur des fonctions différentes (capacité, Boutique, paie) et n'ont jamais divergé du modèle
d'entitlement lui-même.

**MODEL B n'existe donc pas** au sens où le mandat l'envisageait (une architecture concurrente
avec ses propres tables/contrat). Le risque réel documenté dans le mandat — « au moins 2 modèles
d'entitlement concurrents » — se lit, à l'examen des preuves, plutôt comme : **une lignée unique
mais de nombreuses branches parallèles qui l'appliquent partiellement, à des dates différentes, à
des sous-ensembles différents de l'écosystème** (Colors seul, puis Réserves, puis Tools, puis GP en
observation), sans jamais toutes se rejoindre sur un même tronc. C'est un problème d'intégration
(fusion), pas un problème de désaccord de modèle.

---

## 3. CANONICAL CONTRACT

Le contrat candidat canonique est `decision_acces_application(p_application_code text,
p_entreprise_id uuid default null) returns jsonb`, `security definer stable`, accordé à
`authenticated` seul (`service_role` retiré), avec 14 étapes de priorité (la première qui
s'applique gagne) : `non_authentifie` → `erreur_configuration` → **`suspension_plateforme`**
(prime sur tout, bypass admin compris) → `autorise` (bypass admin) → `sans_organisation` →
`invitation_en_attente` → `validation_en_attente` → `utilisateur_desactive` →
**`abonnement_suspendu`** (statut commercial de **cette** application uniquement — jamais
l'abonnement Gestion Pro pour une autre application) → `essai_expire` →
`application_non_incluse` → `sans_habilitation` → `sans_role` → `autorise`. Invariant vérifié par
la session source (non rejoué ici, voir §8) : `decision = 'autorise' ⇔ a_acces_application`, 0
violation sur 103 cas + 66/66 et 103/103 pgTAP.

Ce contrat vit entièrement en dehors de `supabase/migrations/` (fichiers `.sql.proposed`
non numérotés, cf. `packages/application-access/sql/decision_acces_application.sql.proposed` et
`supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed` sur
`fix/app-access-convergence-v1`) et dépend d'un schéma (§1.1) totalement absent de
`claude/quirky-noether-n8aerc`. Il est donc **identifié et documenté comme candidat canonique**,
mais **non intégré** dans cette session (voir §8).

---

## 4. CROSS-TENANT — la fuite RPC

**RPC réelle, nom confirmé mot pour mot** : `module_gestion_pro_actif_entreprise(p_entreprise_id,
p_module_code)`. Trouvée par `git log --all -S"module_gestion_pro_actif_entreprise"` puis lue en
entier (`git show bb42e1d`) sur `origin/claude/preview-rehearsal-security-fixes-v1`, commit
`bb42e1d` (2026-09-20) :

> La fonction (`SECURITY DEFINER`, `EXECUTE` accordé à `authenticated`) ne vérifiait aucune
> appartenance de l'appelant à l'entreprise passée en argument, contrairement à ses sœurs
> `a_acces_application()`/`applications_autorisees()`. Un utilisateur authentifié quelconque
> pouvait apprendre l'état d'activation d'un module payant d'une entreprise tierce via un appel
> RPC direct.

Correctif appliqué sur cette branche (migration
`supabase/migrations/20260905000266_fix_module_gestion_pro_actif_entreprise_tenant_guard.sql`) :
garde conditionnelle à `auth.uid()` non nul exigeant `est_plateforme_admin()` ou
`est_membre_actif(p_entreprise_id)`. Preuves rapportées par cette branche (non rejouées par cette
session, §8) : témoin négatif (cross-tenant → false), témoin positif (même-tenant → true
inchangé), 5/5 pgTAP de non-régression, 1130/1130 assertions sur 54/55 fichiers.

**Audit de systémicité qui a suivi** (même branche, commit `71565ed`, 2026-09-20) : 20 RPC
candidates au même défaut passées en revue, **7 génuinement vulnérables** trouvées et fermées par
retrait du `GRANT EXECUTE authenticated` (migration `20260905000267`) :
`capacite_personnes_base`, `capacite_personnes_totale`, `compter_personnes_actives_entreprise`,
`etat_capacite_personnes` (brique interne d'un wrapper déjà gardé, mais aussi accordées
indépendamment), `appliquer_baisse_capacite_planifiee_service`,
`capacite_stripe_avancer_marqueur_evenement` (service_role uniquement, grant `authenticated`
obsolète), `obtenir_ou_creer_fournisseur_boutique` (brique interne gardée par un secret côté
appelant).

**Est-ce que `claude/quirky-noether-n8aerc` est vulnérable aujourd'hui ?** Non, au sens strict :
`git grep` sur `main`/`claude/quirky-noether-n8aerc` pour `module_gestion_pro_actif_entreprise` et
pour les 7 fonctions sœurs ne renvoie **aucun résultat** — ces fonctions n'existent tout simplement
pas sur cette branche (le module « modularisation de la facturation Gestion Pro » qui les
introduit, `feat(billing): add modular Gestion Pro entitlements` / `feat(commercial): consolidate
active-person billing and modules`, appartient à la même lignée très-divergente que le reste de
l'écosystème multi-app, jamais fusionnée). **Il n'y a donc rien à corriger sur la branche
d'intégration aujourd'hui** — mais c'est un **résultat de l'absence du code concerné, pas une
preuve de robustesse du modèle**. Consigné comme obligation de portage : *quiconque fusionnera un
jour la modularisation de la facturation GP (qui introduit
`module_gestion_pro_actif_entreprise`) **doit** porter en même temps la garde de tenant de
`20260905000266` et les 7 révocations de `20260905000267`, faute de quoi la même fuite
réapparaîtra à l'identique.* Ce point est repris en §12 (OPEN DECISIONS).

**Limite de cette revalidation** : cette session n'a pas rejoué les pgTAP de preuve elle-même (pas
d'accès Docker/Postgres local, §8) ; elle s'appuie sur la lecture du code du correctif et sur le
message de commit détaillé, qui décrit une méthode crédible (témoins positif/négatif, non-
régression complète) mais reste un rapport de tiers non re-exécuté.

---

## 5. GP OBSERVE

Décrit par `fix/app-access-convergence-v1` (§6 de `ELSATIA_APPLICATION_ACCESS_CONVERGENCE_V1.md`,
lu en entier) : flag `ELSATIA_GP_ACCES_APP`, défaut `off`, `enforce` reconnu mais **rétrogradé de
force en `observe`** (le code refuse explicitement d'appliquer un enforcement qui n'existe pas).
En `observe`, le proxy GP appelle `decision_acces_application('gestion_pro', entreprise)`
**après** la réponse (`after()`), échantillon 1 %, journalise les écarts sans PII (identifiants
hachés), **ne bloque jamais** — 68 tests affirmés prouver que la réponse du proxy (statut,
destination, en-têtes, cookies) est identique avec et sans observation. L'étape 3 (enforcement)
n'a **aucun code actif** : uniquement une checklist documentaire de sortie (0 écart pendant 14 j
Préproduction / 7 j Production, revue humaine à 100 % des cas ambigus, retour arrière ≤ 5 min).

**Conforme à la contrainte dure de ce mandat** : l'enforcement D1 étape 3 reste désactivé par
défaut. Cette session **n'a rien activé** — d'ailleurs elle ne pouvait rien activer, le code
n'existant pas sur `claude/quirky-noether-n8aerc` (§1.1). Rien à faire ici au-delà de la
consignation : si ce pipeline est un jour porté sur cette branche, l'étape 3 doit rester non codée
tant que le backfill (§6) n'a pas de preuve de couverture — exigence déjà explicite dans le rapport
source, reprise ici sans modification.

---

## 6. BACKFILL

Rapporté (non rejoué) : fonctions SQL seules (`gp_backfill_rapport()`, `gp_backfill_couverture()`,
`gp_backfill_appliquer(p_appliquer default false, ...)` — simulation par défaut,
`on conflict do nothing`, idempotent —, `gp_backfill_retour_arriere()`), exécutables par
`postgres` seul. Sur le jeu d'essai de la session source : **5 `certain` / 12 `ambigu` / 6
`exclu`** sur 17 cas, couverture avant 0/5 non couvert → après 5 couverts / 0 non couvert / 12
encore ambigus (revue humaine obligatoire pour ces 12). Règles de prudence citées : tout doute →
`ambigu` ; postes « Admin » sans `gerer_utilisateurs`, employés sortis, statut `pause`, entreprise
suspendue/annulée, comptes dépôt → **jamais backfillés automatiquement**. **Aucun accès n'est
jamais coupé silencieusement** par ce pipeline tel que décrit (c'est une lecture/proposition, pas
une écriture appliquée par défaut). N'existe pas sur `claude/quirky-noether-n8aerc` (§1.1) ; rien
appliqué par cette session.

---

## 7. SUSPENSION

Contrat D3 rapporté comme « figé » : `suspension_plateforme` (nouvelle, prime sur tout, y compris
le bypass admin), `entreprise_inactive` retiré, `abonnement_suspendu` scopé par application
(`gestion_pro` lit `entreprises.abonnement_statut` ; toute autre application lit son propre
`acces_applications_entreprises.statut_commercial`, jamais l'inverse). Matrice de non-régression
rapportée : 14 utilisateurs × 3 organisations × 6 applications × 6 états, **0 régression**. Limite
explicitement documentée par la source elle-même (pas cachée) : **la suspension plateforme ne coupe
pas encore les données Gestion Pro** (`est_membre_actif` ne lit pas encore la table de suspension
plateforme) — un compte suspendu au niveau plateforme reste `suspension_plateforme` en décision
mais continue de voir des lignes GP existantes dans le jeu d'essai cité (5 lignes de
`types_chantier` lisibles). Le rapport source classe ceci `DECISION_REQUIRED`, lot dédié avec
mesure de charge, **non résolu, volontairement**. Rien de tout cela n'existe sur
`claude/quirky-noether-n8aerc` (§1.1) ; cette session ne modifie ni ne referme ce point, elle le
reporte tel quel.

---

## 8. SUPPORT — frontière support/plateforme

Table d'exposition rapportée (§7.4 du rapport source) : le client ne voit jamais que son propre
code de décision, son propre rôle, le nom de son entreprise **s'il en est membre**, et jamais de
nom d'entreprise pour `suspension_plateforme`/`sans_organisation`/`non_authentifie`. Tout le reste
(statut d'abonnement brut, fenêtres de validité, `source`, identifiants de lignes,
`attribue_par`, motif de suspension plateforme, autres appartenances, bypass utilisé, message
d'erreur SQL) est réservé aux logs serveur et à une vue `diagnostic_acces_application` strictement
réservée à `est_plateforme_admin()` (42501 sinon). Ce découpage, tel que décrit, respecte
directement la contrainte du mandat (« support/plateforme ne peut pas altérer silencieusement les
entitlements commerciaux ») : aucune fonction d'administration/diagnostic du contrat cité n'écrit,
elle ne fait que lire avec un contrôle d'accès plus large que le client normal. Point non couvert
par le contrat lui-même et signalé comme tel par la source : un client Gestion Pro suspendu reste
**couplé** aux communications du support (`support_msg_select`), même s'il utilise Colors —
`DECISION_REQUIRED`, non modifié par la source, non modifié ici.

---

## 9. TEST MATRIX

**Ce que cette session a réellement pu exécuter : rien contre une base de données.**
`docker ps` → *daemon injoignable* (`/var/run/docker.sock` absent) ; pas de serveur Postgres local
en écoute ; `psql` est installé mais rien à quoi se connecter. `RELAIS_CLAUDE.md` (lu, 841 lignes)
confirme que cette limite n'est pas propre à cette session : plusieurs relais antérieurs notent
« tests SQL pgTAP préparés... mais non exécutés faute de base liée ». La commande `npm run test`
(`vitest run`) n'a pas non plus été exécutée dans cette session, faute de code applicatif modifié
sur cette branche à tester (§1.1 — il n'y a pas de code multi-app sur `main` à faire tourner).

Les chiffres de test cités en §3-§7 (66/66, 103/103, 70/70, 73/73, 30/30, 258+435+216+108 vitest,
etc.) proviennent **exclusivement** du rapport `ELSATIA_APPLICATION_ACCESS_CONVERGENCE_V1.md` d'une
session antérieure, sur une autre branche, dans un environnement disposant apparemment de Docker.
Ils sont rapportés ici **comme citation attribuée**, jamais comme un résultat obtenu par cette
session. Aucun chiffre de test n'a été inventé ou étendu par cette session.

---

## 10. MIGRATIONS

**Aucune migration créée ni modifiée dans cette session.** Deux raisons cumulatives et
suffisantes chacune :
1. Le schéma cible (`applications_elsatia`, `acces_applications_entreprises`,
   `habilitations_applications_utilisateurs`, `plateforme_admins` déjà présent seul) n'existe pas
   sur `claude/quirky-noether-n8aerc` — appliquer les `.sql.proposed` de `fix/app-access-convergence-v1`
   tels quels échouerait immédiatement (tables/fonctions référencées absentes), donc ce ne serait
   ni « additive-only » ni « testé », seulement une migration cassée numérotée après 183.
2. Aucun outillage de test de base de données n'est disponible dans cet environnement (§9) : même
   si le schéma existait, cette session ne pourrait pas produire une preuve `pgTAP` réelle — et le
   mandat interdit explicitement de fabriquer des résultats de test.

`supabase/migrations/` reste donc à 178 fichiers, inchangé, sur `claude/quirky-noether-n8aerc`
**au moment de la première passe**. La seconde passe (§11) y ajoute une 179ᵉ migration, hors du
modèle d'entitlement multi-app — voir la nuance ci-dessous.

---

## 11. PORTAGE RÉALISÉ (seconde passe, 2026-09-22)

**Un correctif a été porté sur `claude/quirky-noether-n8aerc`, commit `cacada0`** :
`supabase/migrations/20260922000184_plateforme_admin_role_total_ferme_autopromotion.sql` +
`supabase/tests/plateforme_admin_role_total_ferme_autopromotion.test.sql`.

**La faille, vérifiée sur le SQL actuel de cette branche (pas rapportée par un tiers)** :
`plateforme_ajouter_admin`/`plateforme_retirer_admin`
(`supabase/migrations/20260714000072_plateforme_equipe.sql`, ligne 24 et 41) ne vérifient que
`est_plateforme_admin()` — vrai pour n'importe quel membre de l'équipe plateforme, y compris un
rôle `'lecture'`. Une migration plus tardive,
`20260719000115_roles_plateforme_appliques.sql`, introduit pourtant un contrôle de rôle
réellement appliqué (`plateforme_exiger_role('total','facturation')` etc.) pour les fonctions
sensibles (abonnements, tarifs, impayés, création d'entreprise) — mais **n'a jamais mis à jour**
`plateforme_ajouter_admin` pour l'utiliser. Conséquence directe, lue dans le code de cette
branche : un membre plateforme en `'lecture'` peut s'appeler
`plateforme_ajouter_admin(son_propre_email, null, 'total')` et obtenir ainsi, sans aucune
vérification de son rôle actuel, tous les droits `'total'` — y compris
`plateforme_creer_entreprise` et `plateforme_modifier_abonnement`. C'est une élévation de
privilège réelle, sur du code qui existe aujourd'hui sur `claude/quirky-noether-n8aerc`, pas une
faille hypothétique sur un schéma absent (contrairement à §4).

**Origine du correctif** : trouvé en classifiant `integration/gp-external-pilot-closure-v1`
(§1.6) — commit `8f5fca1` (2026-09-20, message de commit ci-dessous), migration
`20260916000309_gp_pilot_plateforme_admin_role_total.sql` sur cette branche jamais fusionnée.
Le message de commit source documente lui-même comment la faille a été repérée (relecture d'un
rapport de clôture, pas un audit automatisé) :

> Caught while double-checking my own earlier conclusion for the closure report: 20260719000115
> introduced real, enforced role differentiation for platform admins […] but
> plateforme_ajouter_admin (which decides who gets which role) was never updated to use it […]
> A 'lecture' (or 'support'/'facturation') platform admin could call it on their own email with
> p_role='total' and gain real access to the functions that role differentiation was supposed to
> gate elsewhere.

**Ce qui a été porté, et pourquoi c'est sûr** :
- Le corps SQL des deux fonctions est repris **à l'identique** (mêmes signatures exactes,
  vérifiées contre `20260714000072` sur `main` : `plateforme_ajouter_admin(text, text, text)`,
  `plateforme_retirer_admin(text)` ; mêmes `GRANT`/`REVOKE` déjà en place, non retouchés) ; seule
  ligne ajoutée : `perform public.plateforme_exiger_role('total');` en tête de chaque fonction.
- `plateforme_exiger_role` existe déjà, inchangée, sur `main`/`claude/quirky-noether-n8aerc`
  (`20260719000115`, confirmé par `git grep`). Aucune dépendance à `apps/`, `packages/`, ou à
  quoi que ce soit de la lignée multi-app.
- Migration purement additive (`create or replace function`), numérotée `20260922000184` (suite
  directe de la dernière migration de `main`, `20260729000183`) ; validée par
  `node scripts/verify-migrations.mjs` (« 179 migrations valides ») et
  `node scripts/verify-secrets.mjs` (« 681 fichiers … aucun secret reconnu ») exécutés dans
  cette session.
- Ne touche aucun fichier `apps/`/`packages/` (inexistants ici) ni aucune autre fonction.

**Le test n'a pas été copié tel quel** : le test source (`gp_pilot_plateforme_admin_role_total.test.sql`
sur `integration/gp-external-pilot-closure-v1`) utilise un fixture
(`supabase/tests/fixtures/isolation_multitenant.inc`) qui lui-même dépend d'un GUC
(`elsatia.capacite_personnes_bypass`) propre à la lignée multi-app de facturation modulaire —
absent de cette branche. Le test porté ici (`plateforme_admin_role_total_ferme_autopromotion.test.sql`)
crée ses propres comptes `plateforme_admins` directement, sans fixture, dans le style des 6 tests
déjà présents sur `main`/cette branche (`supabase/tests/*.test.sql`) — à ceci près que c'est le
premier test de cette branche à utiliser `set_config('request.jwt.claim.email', …)` +
`set local role authenticated` pour rejouer un appel authentifié plutôt qu'une simple
introspection de schéma (`has_table`/`function_returns`) ; c'est le motif standard documenté par
Supabase pour les tests pgTAP de fonctions `security definer`, et cette branche utilise déjà
`auth.email()` de façon standard ailleurs (`20260710000036`, `20260714000072`), donc rien
n'indique une redéfinition locale qui romprait ce motif — mais ce n'est, comme le reste, **pas
rejoué** dans cette session (§9, pas de Docker/Postgres). **Correction trouvée en portant ce
test** : le test source utilisait le motif `%réservée%` (féminin) pour le cas « appelant hors
équipe plateforme », qui produit en réalité l'exception « Accès réservé à la plateforme »
(masculin, sans « e » final) — un motif qui n'aurait très probablement **pas** matché s'il avait
été rejoué. Le test porté utilise `%réservé%` (sans « e » final), qui matche les deux messages
d'exception réels de `plateforme_exiger_role()`. Signalé ici pour que quiconque revisite le test
source original en soit informé.

**Ce qui n'a pas été fait, et pourquoi** : `integration/gp-external-pilot-closure-v1` compte 77
autres commits `fix(...)` (§1.6), certains potentiellement pertinents pour `main` (candidats
listés en §1.6) — aucun n'a été vérifié avec le même niveau de certitude que celui-ci, donc aucun
n'a été porté. Le mandat demande explicitement de documenter plutôt que deviner en cas de doute ;
c'est le choix fait ici pour ces 77 commits.

---

## 12. OPEN DECISIONS

- **DECISION_REQUIRED — portage obligatoire du correctif cross-tenant** : si/quand la
  modularisation de la facturation Gestion Pro (qui introduit
  `module_gestion_pro_actif_entreprise`) est fusionnée sur une branche qui deviendra `main`, les
  migrations `20260905000266` (garde de tenant) et `20260905000267` (révocation des 7 RPC sœurs)
  — ou leur équivalent revérifié à ce moment-là — **doivent** être portées dans le même train,
  sans quoi la fuite cross-tenant documentée en §4 réapparaît à l'identique. Défaut conservateur
  retenu : documenter l'obligation plutôt que fabriquer un correctif spéculatif contre un schéma
  absent.
- **DECISION_REQUIRED — au-delà de cette session — plan concret pour la convergence multi-app,
  non exécuté ici** : ce qu'impliquerait réellement de faire converger `main` vers le monorepo
  multi-app (`fix/app-access-convergence-v1` comme candidat, §3), pour qu'un futur humain ou une
  future session autorisée ait un point de départ, sans que cette session ne tranche la question
  elle-même (c'est une décision d'architecture du propriétaire du dépôt, explicitement hors
  mandat) :
  1. **Taille réelle** : `fix/app-access-convergence-v1` (`290f6bf`) est à **404 commits**
     d'avance sur `main`@`4d92ddb` (`git rev-list --count 4d92ddb..origin/fix/app-access-convergence-v1`,
     mesuré dans cette session), pas les ~250-560 commits de divers points d'entrée cités en §1.2
     pour d'autres branches — ce chiffre spécifique n'avait pas été mesuré dans la première passe.
     `git diff --shortstat 4d92ddb origin/fix/app-access-convergence-v1` (mesuré dans cette
     session) : **1453 fichiers changés, +196107/-1841 lignes**. Ce n'est pas un renommage ou un
     module additif isolé : c'est
     l'ajout de trois applications entières (`apps/colors`, `apps/tools`, `apps/reserves`) plus
     `packages/application-access`, plus la réécriture du socle racine (workspaces npm, CI,
     conventions `.env`, voir §1.5bis) — donc bien un changement d'identité du dépôt (mono-app
     → monorepo), pas une fusion de fonctionnalité ordinaire.
  2. **Schéma/RLS à ajouter** : au minimum les 3 tables du socle d'août
     (`applications_elsatia`, `acces_applications_entreprises`,
     `habilitations_applications_utilisateurs`, §1.2) + la fonction `decision_acces_application`
     (§3) + ses migrations `.sql.proposed` non numérotées (à numéroter dans la séquence de la
     branche cible, pas celle de la branche source) + toute table propre à Colors/Tools/Réserves
     que ces apps requièrent pour fonctionner (non inventoriée dans cette session — nécessite de
     lire `apps/colors/supabase` etc. sur la branche source, hors budget ici). Risque principal
     documenté par la source elle-même (§7) : `est_membre_actif` ne lit pas encore
     `suspension_plateforme`, donc la garde de suspension plateforme resterait incomplète pour
     les données Gestion Pro existantes tant que ce lot dédié (mesure de charge sur 142 policies,
     hérité ci-dessous) n'est pas fait.
  3. **D1/D2/D3 — de « proposé » à « appliqué »** : au sens strict, D1/D2/D3 sont déjà **tranchés**
     (« validée le 2026-09-21 », §1.2) sur la branche source — ce qui manque n'est pas une
     décision produit mais l'exécution technique : (a) numéroter et rejouer les migrations
     `.proposed` dans l'ordre de la séquence cible, (b) faire tourner la suite pgTAP citée en §3
     (66/66, 103/103) **dans un environnement qui la rejoue réellement** (voir point 5), (c)
     activer le pipeline GP OBSERVE (§5) en mode `observe` sur un environnement de préproduction
     réel pendant les 14 jours documentés par la source avant d'envisager `enforce`, (d) ne
     jamais sauter cette fenêtre d'observation même si la pression business pousse à activer plus
     vite — c'est explicitement la garde-fou D1 étape 3 du mandat.
  4. **Ordre d'opérations qui minimise le risque** (proposé, non exécuté) : (i) d'abord porter les
     3 tables + `decision_acces_application` seules, en mode `observe` forcé, SANS `apps/colors`
     /`apps/tools`/`apps/reserves` ; (ii) valider 14 jours d'observation sans écart sur `main`
     réel (pas seulement sur la branche source) ; (iii) seulement alors porter les apps
     elles-mêmes une par une (Colors d'abord — c'est la plus avancée et testée, §1.5bis — puis
     Tools, puis Réserves), chacune comme un commit revuable séparé, jamais en un seul lot de
     2136 fichiers ; (iv) porter en même temps que **la première application qui introduit
     `module_gestion_pro_actif_entreprise`** (la modularisation de la facturation GP) les
     migrations `20260905000266`/`267` du correctif cross-tenant (§4, obligation déjà consignée
     ci-dessous) — sans quoi la fuite réapparaît dès ce moment précis, pas avant.
  5. **Ce qui manque structurellement, indépendamment du choix ci-dessus** : aucun environnement
     disponible dans une session comme celle-ci (ce worktree compris) n'a Docker, de serveur
     Postgres local, ni de identifiants Supabase réels dans `.env.local` — vérifié à nouveau dans
     cette session (`docker ps` → socket absent), et déjà noté par la session précédente. « Testé »
     n'est donc atteignable dans **aucune session de ce type**, quelle que soit la branche choisie ;
     toute tentative de convergence réelle nécessite un environnement doté d'un accès DB réel
     (Docker+Postgres local, ou un projet Supabase de préproduction dédié), condition préalable
     et non négociable avant tout portage de schéma, pas seulement pour le multi-app.
- **Ouvert, non résolu par cette session (hérité tel quel du rapport source, §7)** : la suspension
  plateforme ne coupe pas encore les données Gestion Pro (`est_membre_actif`) — nécessite un lot
  dédié avec mesure de charge sur 142 policies.
- **Ouvert, non résolu (hérité, §8)** : couplage support/communications d'un compte GP suspendu,
  même via une autre application.
- **Ouvert, non résolu (hérité, §3 rapport source)** : 12 décisions D-1…D-12 du backfill GP et 8
  décisions Tools listées dans les annexes `annexe-d1-gp-observation-backfill.md` /
  `annexe-d2-tools-serveur.md` de `fix/app-access-convergence-v1` — non retranscrites en détail ici
  (hors budget de cette session), consultables par SHA (§1.4).
- **Ouvert** : malgré les ~45 branches classées en plus lors de cette passe (§1.5bis), ~195 des
  255 branches distantes restent non classifiées individuellement — la lignée principale
  d'entitlement (§1.2) et le tronc mono-app GP jamais fusionné (§1.6) sont désormais tous deux
  identifiés avec un niveau de confiance élevé, mais l'inventaire exhaustif demandé par le mandat
  n'est toujours pas complet.
- **DECISION_REQUIRED — audit ciblé du tronc GP mono-app (§1.6)** : `integration/gp-external-pilot-closure-v1`
  contient 77 commits `fix(...)` supplémentaires non vérifiés contre le SQL actuel de `main`
  (liste en §1.6), dont au moins un (`8caef21`, durcissement de 22 fonctions `SECURITY DEFINER`)
  potentiellement à haute valeur s'il s'applique tel quel. Une future session avec un budget dédié
  devrait relire ces 77 diffs un par un contre `main` actuel, dans le même esprit que le portage
  du §11 — c'est un travail de vérification manuelle, pas de fusion de branche.
- **Ouvert** : le nom exact « `decision_acces_application` » comme identifiant de fonction/contrat
  est confirmé ; comme nom de branche, il n'a été trouvé nulle part (le mandat l'envisageait déjà
  comme possible).

---

## Pourquoi le monorepo multi-app n'a pas été « intégré » au sens code sur cette branche

Le mandat demande de choisir, en cas d'ambiguïté, l'option la plus conservatrice compatible avec
D1/D2/D3, sans bloquer. L'option retenue ici est : **ne pas fusionner à l'aveugle un monorepo de
plusieurs centaines de fichiers et plusieurs centaines de commits sur une branche qui ne le
contient pas du tout**, sans schéma de base pour le qualifier et sans outillage pour le tester dans
cet environnement — un tel geste serait à la fois un « commit géant non revuable » (interdit
explicitement par le mandat) et une fabrication de confiance (« testé ») que cette session ne peut
pas obtenir. Le choix conservateur symétrique — copier uniquement la documentation déjà écrite par
la session source dans `docs/qualification/` de cette branche — a été envisagé puis écarté : cela
dupliquerait un contenu déjà accessible par SHA/branche git (source unique de vérité), sans ajouter
de valeur de convergence réelle, pour un risque de désynchronisation future. Ce raisonnement,
posé lors de la première passe, tient toujours après la seconde : rien de la lignée multi-app n'a
été fusionné ici, et la taille désormais mesurée avec précision (§12, 404 commits/1453 fichiers
pour le seul candidat canonique) confirme que ç'aurait été prématuré.

**Ce qui a changé entre les deux passes** : la première passe n'avait rien touché au code parce
qu'elle n'avait trouvé, sur le périmètre qu'elle avait examiné, aucun correctif à la fois
mono-app, autonome et vérifiable sans DB. La seconde passe, en classifiant davantage de branches
(§1.5bis), en a trouvé un — une élévation de privilège réelle sur du code qui existe aujourd'hui
sur cette branche (§11) — et l'a porté, seul, comme un commit séparé et minimal (`cacada0`),
distinct de toute décision sur le monorepo multi-app. C'est exactement le type de geste que le
mandat autorise sans requérir l'arbitrage du propriétaire du dépôt : un correctif ciblé, compris
dans son intégralité, qui ne touche à aucun schéma absent de cette branche. La valeur ajoutée de
cette session est donc double : ce correctif, et ce document — reconstruction d'historique
vérifiée, clarification qu'il s'agit d'une lignée d'entitlement unique et non de deux modèles
rivaux, identification d'un second tronc mono-app jamais fusionné (§1.6), classification
d'environ 60 branches au total sur les 255 (première et seconde passe cumulées), et un plan
d'action concret et non exécuté pour la convergence multi-app (§12) à l'attention du propriétaire
du dépôt.

---

**CANONICAL MODEL NOT RESOLVED** — le correctif porté en §11 est indépendant de cette question et
ne la referme pas : le modèle d'entitlement multi-app reste un candidat documenté, non fusionné,
en attente d'une décision du propriétaire du dépôt.
