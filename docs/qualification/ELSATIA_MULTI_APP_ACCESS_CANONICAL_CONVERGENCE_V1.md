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

**Mise à jour du 2026-09-22 (troisième passe, même session/branche)** : (1) vérifie intégralement
`8caef21` (durcissement de 22 fonctions `SECURITY DEFINER`, flagué à haute valeur mais non
vérifié en seconde passe) fonction par fonction contre le SQL actuel — 20 des 22 s'avèrent déjà
sans risque sur cette branche, mais l'audit révèle **un gap réel différent** sur les 2 restantes
(§13, commit `d357314`) ; (2) achève la classification des branches nommées dans le mandat
(`suspension_plateforme`, `ELSATIA_GP_ACCES_APP`, `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1`,
`decision_acces_application` : confirmés définitivement absents comme noms de branche ;
Colors/Tools/Studio/Reserves access : 5 branches supplémentaires classées, toutes hors-cible
monorepo — §15) ; (3) scanne une partie des 77 commits `fix(...)` restants
d'`integration/gp-external-pilot-closure-v1` et **porte 6 correctifs supplémentaires**, chacun
vérifié indépendamment contre le code actuel de cette branche avec le même niveau de rigueur que
`cacada0` (§14) : fuite de lecture de documents RH/fournisseurs/pointage sensibles, export
comptable sans contrôle d'autorisation, policy RLS storage-paie fragile, durcissement de
privilèges de socle, et un gap RGPD réel (fichiers Storage non supprimés par l'anonymisation
RGPD). **7 correctifs au total ont maintenant été portés dans cette mission** (`cacada0` en
seconde passe + 6 en troisième passe), tous additifs, tous revus par `npm run typecheck`/`lint`/
`test`/`build` quand ils touchent du code applicatif (node_modules a pu être installé cette
fois — voir §9bis) et par les scripts SQL du dépôt sinon.

**Mise à jour du 2026-09-22 (quatrième passe, session dédiée `npm audit`)** : ferme l'item
`DECISION_REQUIRED — durcissement des dépendances npm` ouvert en troisième passe (§14.7, §16).
Les 2 avisories **CRITIQUES** confirmées sur `next` (`GHSA-p293-qw3h-jr36`, RCE non authentifiée
hosts Windows ; `GHSA-2xp9-vwfh-vxw4`, RCE non authentifiée API image AVIF, sans restriction de
plateforme) sont corrigées par une montée de patch `next` `16.2.12` → `16.3.5`, toujours dans la
plage semver `^16.2.12` déclarée — pas de saut de version majeure, donc pas le risque de
régression que la troisième passe redoutait. 7 des 9 autres avisories (haute/modérée) du jour sont
aussi résolues (`sharp`, `browserslist`, `brace-expansion`, `fast-uri`, `js-yaml`,
`baseline-browser-mapping`, `nanoid`). `npm run typecheck`/`lint`/`test`/`build` tous vérifiés
verts après coup, ainsi que `npm ci` pour la reproductibilité du lockfile. 1 avisorie modérée
reste ouverte (Vitest/`@vitest/mocker`, outillage de test uniquement, jamais le code de
production) — détail en §16. Voir §16 pour le compte-rendu complet.

**Mise à jour du 2026-09-22 (cinquième passe, même session/branche)** : reprend l'audit du tronc
mono-app GP (§1.6) là où la troisième passe s'était arrêtée (§14, ~12 des 77 commits `fix(...)`
examinés). Examine 18 commits supplémentaires en détail contre le code actuel de
`claude/quirky-noether-n8aerc` (fetché au départ de cette passe : la branche était passée à
`22b32c0` via les passes précédentes + la session `npm audit`) et **porte 11 correctifs
supplémentaires** (§17.1), dont un bug critique confirmé — l'écriture (création/modification/
suppression) sur `public.chantiers`, la table cœur du produit, était bloquée par RLS pour toutes
les entreprises depuis la migration `20260715000081`, sans aucune policy PERMISSIVE pour la
couvrir — et trois correctifs d'isolation cross-tenant composite-FK (factures, devis, relances
impayées) accompagnés d'un quatrième correctif compagnon que cette session a dû identifier
elle-même (non signalé comme nécessaire par le message de commit source) pour ne pas casser
l'application PostgREST en posant les trois premiers seuls. 4 autres commits sont déclinés avec
raison documentée (§17.2, dont deux pour un risque de régression de déploiement réel et non
vérifiable dans ce bac à sable : une variable d'environnement obligatoire non confirmée sur les
environnements réels, qui ferait échouer fermé — 503 — toute la route concernée si elle est
absente au déploiement), et 2 sont non applicables car le code/les routes qu'ils corrigent
n'existent pas sur cette branche (§17.3). **18 correctifs au total ont maintenant été portés dans
cette mission.** Voir §17 pour le détail complet et §16 pour les décisions ouvertes mises à jour.

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
ciblé (repris en §16).

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
réapparaîtra à l'identique.* Ce point est repris en §16 (OPEN DECISIONS).

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

### 9bis. Mise à jour (troisième passe) : `npm ci` fonctionne dans cet environnement

Toujours aucun Docker/Postgres (`docker ps` non retenté, cette limite a déjà été confirmée deux
fois par les sessions précédentes et une troisième fois n'apporterait rien) — **aucun test SQL
pgTAP n'a été exécuté dans cette session, pour aucun des correctifs SQL portés en §13-§14**. En
revanche, `npm ci` (avec le proxy réseau de cet environnement) **a fonctionné** ici, ce qui n'avait
apparemment pas été tenté par les sessions précédentes (`node_modules/` était absent en début de
session). Cela a permis d'exécuter réellement, pour la première fois dans cette mission,
`npm run typecheck` (0 erreur), `npm run lint` (0 erreur, 3 warnings `@next/next/no-img-element`
préexistants sans rapport), `npm run test` (106/106 tests, 29 fichiers, y compris les nouveaux
tests ajoutés par cette session) et `npm run build` (succès) contre les deux correctifs de cette
passe qui touchent du code applicatif TypeScript (§14, `bede72e` et `fb819f7`). C'est un niveau de
preuve réel supérieur à celui disponible pour tout le reste de cette mission (qui reste limité aux
scripts `verify-migrations`/`verify-secrets` côté SQL, faute de base de données). `npm audit`
fonctionne aussi (lit `package-lock.json`, n'a pas besoin de `node_modules`) — voir §16 pour ce
qu'il révèle.

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

## 13. VÉRIFICATION COMPLÈTE DE `8caef21` (troisième passe, 2026-09-22)

Mandat de cette passe : vérifier `8caef21` (`fix(gp-v1-rc): durcit les privilèges EXECUTE anon
sur 22 fonctions SECURITY DEFINER`, `integration/gp-external-pilot-closure-v1`, migration
`20260914000298_gp_v1_rc_functions_privilege_hardening.sql`), flagué en seconde passe comme « à
haute valeur si confirmé, mais trop large pour être vérifié à la main ». Fait ici, fonction par
fonction, contre le SQL actuel de `claude/quirky-noether-n8aerc`.

**Le mécanisme décrit par `8caef21` ne s'applique pas à cette branche.** Le commit source
documente un défaut spécifique à sa propre lignée : les fonctions créées par le rôle `postgres`
reçoivent par défaut un `EXECUTE` pour `anon` (`pg_default_acl`), que les migrations
`20260902000255`/`20260911000297` (propres à cette autre lignée) ne révoquaient jamais pour
`anon` (seulement pour `authenticated`/`service_role`). **Ces deux migrations n'existent pas sur
`main`** (`ls supabase/migrations | grep -E '^202609(02|11)'` → vide). `main` ferme ce défaut par
défaut depuis beaucoup plus tôt et de façon plus complète :
`20260714000078_fermeture_acces_anonyme_production.sql` (2026-07-14, un ancêtre direct de la
branche source elle-même) fait un `revoke execute on all functions in schema public from anon`
**rétroactif** sur toutes les fonctions existantes à cette date, un balayage explicite de toutes
les fonctions `security definer` (`revoke ... from public,anon` fonction par fonction, via
`pg_proc`/`pg_namespace`), **et** un `alter default privileges ... revoke execute on functions
from anon` pour l'avenir.

**Vérification fonction par fonction (les 22 nommées par `8caef21`)** : pour chacune, recherche de
sa première définition (`create [or replace] function`), de tout `revoke`/`grant` la ciblant
explicitement (y compris en liste combinée, ex. `revoke ... on function a(),b(),c() from
public,anon`), et lecture du corps pour vérifier les colonnes/tables référencées existent bien.

| # | Fonction | État sur `claude/quirky-noether-n8aerc` |
| - | --- | --- |
| 1 | `recalc_totaux_devis(uuid)` | Créée avant migration 78 (`20260710000005`) → couverte par le balayage rétroactif. Sûre. |
| 2 | `recalc_totaux_commande(uuid)` | `revoke ... from public,anon,authenticated` explicite dans sa migration de création (`20260710000021`). Sûre. |
| 3 | `recalc_paiements_facture(uuid)` | Idem, `20260710000020`. Sûre. |
| 4 | `recalculer_dossier_paie(uuid)` | `revoke` combiné (avec 5 autres fonctions paie) dans `20260723000141` ligne 411. Sûre. |
| 5 | `recomputer_statut_commande(uuid)` | `revoke ... from public,anon` dans `20260717000098`. Sûre. |
| 6 | `synchroniser_taches_devis_accepte(uuid)` | `revoke ... from public,anon,authenticated` dans `20260715000081`. Sûre. |
| 7 | `controler_periode_paie_interne(uuid)` | `revoke` explicite, `20260724000148`. Sûre. |
| 8 | `synchroniser_periode_paie_interne(uuid)` | `revoke` explicite, `20260724000147`. Sûre. |
| 9 | `creer_commande_fournisseur_interne(uuid,jsonb,jsonb)` | `revoke` explicite, `20260713000043`. Sûre. |
| 10 | `enregistrer_reception_commande_interne(uuid,uuid,jsonb)` | `revoke` explicite, `20260713000043`. Sûre. |
| 11 | `appliquer_modele_role_predefini_interne(uuid,text,boolean)` | `revoke` explicite (×2), `20260718000104`/`000109`. Sûre. |
| 12 | `notifier_permission(...)` | `revoke` explicite, `20260715000081`. Sûre. |
| 13 | `notifier_utilisateur(...)` | `revoke` explicite, `20260723000135`. Sûre. |
| 14 | `snapshot_compte_facturable(uuid,text)` | `revoke` explicite (×2), `20260713000063`/`20260717000090`. Sûre. |
| 15 | `recalc_reglements_fournisseur(uuid)` | `revoke` explicite, `20260710000026`. Sûre. |
| 16 | `obtenir_ou_creer_fournisseur_boutique(uuid)` | `revoke` explicite depuis sa création (`20260724000175`), **MAIS re-`grant ... to authenticated` dans la même migration** — gap réel, voir ci-dessous. |
| 17 | `boutique_finaliser_commande_payee(uuid,text)` | `revoke ... from public,anon` **puis `grant ... to authenticated`** à chaque redéfinition (`20260724000145`/`000175`/`000176`) — gap réel, voir ci-dessous. |
| 18 | `appliquer_suspensions_impayes()` | `revoke ... from public,anon,authenticated` explicite, `20260714000075`, aucun re-grant. Sûre. |
| 19 | `creer_entreprise_bootstrap(...)` | `revoke ... from public` + `grant ... to authenticated` (×3, jamais `anon`) — design intentionnel (bootstrap self-service), conforme à la catégorie B de `8caef21` elle-même. Sûre. |
| 20 | `rejoindre_entreprise_par_code(text)` | `grant execute ... to anon, authenticated` **délibéré** (`20260710000035`) — mais la fonction vérifie `auth.uid() is not null` en premier lieu et lève `'Non authentifié'` sinon : l'octroi à `anon` est inerte (un vrai appel anonyme a `auth.uid()` nul). Conforme à la catégorie B de `8caef21` elle-même (« le risque n'est pas fonctionnel »). Sûre, non modifiée. |
| 21 | `plateforme_quitter_entreprise()` | `revoke ... from public,anon,authenticated` puis `grant ... to authenticated` seul, `20260714000075`. Sûre (conforme au traitement « authenticated uniquement » que `8caef21` applique lui-même à cette fonction). |
| 22 | `modifier_facture_brouillon(uuid,jsonb,jsonb)` | `SECURITY INVOKER` (pas `DEFINER`), `revoke ... from public` puis `grant ... to anon, authenticated` (`20260710000017`). L'EXECUTE à `anon` est inerte : `anon` n'a plus AUCUN privilège de table sur `factures`/`lignes_factures` depuis le balayage rétroactif de la migration 78 (`revoke all privileges on all tables in schema public from anon`, jamais re-accordé depuis — vérifié par recherche exhaustive de `grant ... to anon` sur ces deux tables). Toute écriture échouerait sur le contrôle de privilège de table, avant même RLS. Conforme à la catégorie B de `8caef21` elle-même. Sûre, non modifiée. |

**Conclusion : 20 des 22 fonctions sont déjà sûres sur cette branche, sans qu'aucun changement ne
soit nécessaire.** Sur les 2 restantes (16 et 17), l'audit a trouvé un **gap réel mais différent**
de celui que décrit `8caef21` : pas un défaut par omission (le mécanisme `pg_default_acl` ne
s'applique pas ici), mais un `grant execute ... to authenticated` **explicite et délibéré**, jamais
retiré, sur deux fonctions dont le seul appelant légitime, dans tout le code applicatif
(`src/`), est le webhook Stripe boutique (`service_role`) :

- `boutique_finaliser_commande_payee(p_commande_id, p_checkout_id)` ne vérifie que la
  correspondance `(id, stripe_checkout_id)` sur `boutique_commandes` — jamais l'identité de
  l'appelant ni un état de paiement Stripe réel — et marque la commande `'payee'` (stock
  décrémenté, dépense fournisseur déjà réglée créée). Un utilisateur authentifié connaît déjà, pour
  sa propre commande, les deux paramètres (le second lui est renvoyé par
  `creerSessionCheckoutBoutique()` **avant** tout paiement réel, `src/app/actions/boutique.ts`) :
  il peut donc l'appeler lui-même pour obtenir sa commande gratuitement, sans jamais payer sur
  Stripe. **Contournement de paiement réel.**
- `obtenir_ou_creer_fournisseur_boutique(p_entreprise_id)` ne vérifie aucune appartenance de
  l'appelant à l'entreprise passée en argument, et n'est appelée dans le code applicatif que
  depuis la fonction ci-dessus (appel SQL interne, qui ne nécessite pas son propre `EXECUTE`).
  Accordée à `authenticated`, elle permet une écriture cross-tenant (création d'une fiche
  fournisseur dans une entreprise tierce).

**Correctif porté**, commit `d357314` sur `claude/quirky-noether-n8aerc` :
`supabase/migrations/20260922000185_ferme_contournement_paiement_boutique.sql` +
`supabase/tests/ferme_contournement_paiement_boutique.test.sql` — ferme l'`EXECUTE` à
`authenticated` sur les deux fonctions, accorde `service_role` sur la première (seul appelant
légitime restant). Additif, minimal (privilèges seuls, corps/signatures inchangés). Validé par
`node scripts/verify-migrations.mjs` (180 migrations valides) et
`node scripts/verify-secrets.mjs` — non rejoué contre une base réelle.

---

## 14. AUTRES CORRECTIFS PORTÉS DEPUIS `integration/gp-external-pilot-closure-v1` (troisième passe)

Mandat : scanner les 77 commits `fix(...)` restants de cette branche (liste complète en §1.6) pour
d'autres correctifs sûrs, vérifiables, pertinents mono-app, dans le même esprit que `cacada0`.
**Non exhaustif** : sur 77 commits, une douzaine a été examinée en détail dans cette passe (les
plus prometteurs par intitulé, datés du tout début de la lignée — 2026-07-30/31 — où elle
correspond encore le plus étroitement à l'état de `main`), 6 ont été vérifiés avec suffisamment de
certitude pour être portés. Les autres commits examinés mais non portés, et le reste des 77 non
examinés du tout, sont documentés en §16 (OPEN DECISIONS) plutôt que devinés.

### 14.1 `7a2a4c0` → commit `b16db67` : durcissement de privilèges du socle

Migration source : `20260729000185_isolation_multitenant_grants_et_definer.sql` (~9 changements).
**Revérifiée ligne par ligne contre le SQL actuel**, seuls 2 des ~9 changements portés :
`revoke truncate, trigger, references ... from anon, authenticated` (rétroactif + par défaut —
sans risque, PostgREST ne traduit jamais une requête en TRUNCATE/DDL) et
`alter function entreprise_sans_membres(uuid) set search_path = public` (confirmée : seule
fonction `security definer` de la migration fondatrice `20260710000001` sans `search_path` fixé).

**Un des changements source (`alter table compteurs_reference enable row level security`) a été
sciemment NON porté** après avoir trouvé un vrai risque de régression : `compteurs_reference`
n'a en effet jamais eu la RLS activée sur cette branche (gap réel — `authenticated` n'a jamais eu
ses privilèges de table révoqués dessus, seul `anon` l'a été rétroactivement par la migration 78),
mais `public.trg_set_entreprise_reference()` (trigger `before insert on entreprises`, migration
`20260710000001`) **n'est pas `security definer`** — contrairement à tous les autres triggers de
numérotation du dépôt (confirmé sur 9 triggers homologues : tous `security definer`) — et
`entreprises` autorise l'INSERT direct côté client
(`create policy "un utilisateur crée une entreprise" on public.entreprises for insert with check
(auth.uid() is not null)`). Un nouvel utilisateur créant sa première entreprise sans passer par
`creer_entreprise_bootstrap` (le seul chemin `security definer`) déclencherait ce trigger avec son
propre rôle authentifié, qui appelle `next_reference()` (`security invoker` lui aussi) pour insérer
dans `compteurs_reference` : une RLS nue aurait bloqué cet INSERT et cassé la création
d'entreprise pour ce chemin. Concevoir et tester la policy correcte nécessite un accès base de
données réel, indisponible ici. **DECISION_REQUIRED**, reprise en §16.

Le reste (revoke sur `peut_voir_document_chantier`, `plateforme_creer_version_tarif`, 7 fonctions
trigger) vérifié déjà sans risque (protégé par construction ou déjà couvert par le
default-privileges de la migration 78).

### 14.2 `a67ceab` → commit `fd5bc65` : lecture des documents RH/fournisseurs/pointage sensibles

**Élévation de privilège intra-entreprise réelle, confirmée par recherche exhaustive.**
`20260713000043_permissions_rls_gestion.sql` borne correctement l'ÉCRITURE (INSERT/UPDATE/DELETE)
sur `documents-employes`/`factures-fournisseurs`/`pointage-preuves` à la permission métier
(`gerer_employes`/`gerer_achats`/`gerer_pointage`, policies RESTRICTIVE). **Aucune policy
équivalente n'existe pour SELECT** sur ces trois buckets (recherche de `as restrictive for select`
sur `storage.objects` dans tout `supabase/migrations/` : rien pour ces trois-là). La lecture ne
dépend donc que des policies PERMISSIVE d'origine (`est_membre_actif` seul) : **n'importe quel
membre actif de l'entreprise peut aujourd'hui lire/télécharger la carte BTP ou la signature d'un
autre salarié, une facture fournisseur, ou une preuve de pointage, sans détenir la permission
métier correspondante.** Colonnes `employes.{photo,carte_btp,signature}_storage_path` confirmées
présentes avec la forme exacte attendue par le correctif. Correctif porté à l'identique (fonction
`peut_lire_document_employe_sensible` + policy RESTRICTIVE `role_gestion_fichiers_select`), la
photo restant volontairement lisible par tout membre (annuaire).

### 14.3 `87bf61c` → commit `00da9fc` : fiabilise la lecture des documents de paie

`documents_paie_select` (définition actuelle, `20260723000141_preparation_paie.sql`) fait un
`exists(select 1 from public.utilisateurs_entreprises ue where ...)` **directement** dans son
`using(...)` sur `storage.objects`, au lieu de passer par une fonction `security definer` bornée
comme le fait déjà le reste du module paie (`a_permission()`, `est_employe_paie_courant()`, déjà
utilisées plus loin dans la même policy). PostgreSQL évalue toutes les policies PERMISSIVE d'une
commande sur `storage.objects`, y compris pour des lectures visant un bucket différent — le
planificateur ne garantit pas d'évaluer `bucket_id='documents-paie'` avant la sous-requête.
Remplace la sous-requête directe par le même garde que le reste du module, périmètre
d'autorisation inchangé (même triplet de conditions). Plus une correction de fiabilité qu'une
faille de sécurité active à proprement parler, mais dans la même famille que le motif documenté en
§4 (dépendance RLS-sur-RLS fragile).

### 14.4 `bede72e` → commit `c1ef953` : protège l'export comptable

**Faille d'autorisation applicative réelle, confirmée sur le code actuel.**
`src/app/api/exports/comptabilite/route.ts` n'effectue **aucun contrôle de permission** avant de
générer un export CSV/XLSX (ventes, règlements, TVA, achats) — seul `getContexteEntreprise()`
(appartenance à l'entreprise) est vérifié. N'importe quel membre authentifié, quelle que soit sa
permission, peut télécharger l'intégralité des journaux comptables via cette route, en contournant
tout masquage fait côté UI. `acces_exports` est une permission déjà existante et utilisée ailleurs
dans le catalogue de permissions du dépôt (`src/lib/module-permissions.ts`, `src/lib/navigation.ts`,
rôles prédéfinis) — ce correctif l'applique enfin à cette route ; il n'invente rien. Ajoute
`src/lib/permissions-financieres.ts` + son test vitest, et le contrôle dans la route. **Premier
correctif applicatif TypeScript de cette mission validé par la suite complète du dépôt**
(`typecheck`/`lint`/`test`/`build`, tous verts — voir §9bis).

### 14.5 `27121d3` → commit `07d13e7` : privilèges explicites du socle comptes (reproductibilité, pas sécurité active)

Découvert en investiguant `7a2a4c0` : ce commit documente qu'une « reconstruction complète » de la
base (rejeu de migrations à partir de zéro) laissait `authenticated` sans aucun privilège SQL sur
`entreprises`/`utilisateurs`/`utilisateurs_entreprises` — tous les comptes renvoyés vers
l'onboarding, la RLS jamais atteinte faute de privilège de table. Vérifié : **aucune migration de
cette branche n'accorde explicitement SELECT/INSERT/UPDATE à `authenticated`** sur ces trois
tables, créées par la toute première migration (`20260710000001`) et jamais retouchées depuis sur
ce point. **Ce n'est pas une faille de sécurité active en production** (comme pour `anon` avant sa
fermeture du 2026-07-14, ces privilèges proviennent d'un défaut posé par la plateforme Supabase à
la création du projet, jamais capturé dans une migration — la RLS déjà en place reste le contrôle
réel, et l'app fonctionne bel et bien en production aujourd'hui), mais un gap de reproductibilité
réel : tout nouveau projet Supabase ou reconstruction hors gabarit standard perdrait
silencieusement l'accès applicatif de base. Correctif porté par prudence (additif, un `GRANT` ne
peut jamais retirer un accès existant) plutôt que laissé en `DECISION_REQUIRED`, car son risque de
régression est nul contrairement à 14.1.

### 14.6 `fb819f7` → commit `0edaa3a` : `anonymiser_employe` supprime réellement les fichiers Storage (RGPD)

**Gap RGPD réel, confirmé sur le code actuel.** `anonymiser_employe()` (RPC,
`20260719000114_rgpd_export_suppression.sql`) vide déjà dynamiquement les colonnes personnelles de
`employes` — y compris les CHEMINS de stockage `photo_storage_path`/`signature_storage_path`/
`carte_btp_storage_path` — mais c'est du SQL pur, sans accès à l'API Storage : les FICHIERS
eux-mêmes restaient orphelins dans le bucket `documents-employes`, toujours récupérables avec leur
chemin exact. L'UI (`src/app/(app)/employes/[id]/page.tsx`) affirme pourtant « effacées
définitivement » — une affirmation fausse au sens strict jusqu'à ce correctif, sur le droit à
l'effacement RGPD. `anonymiserEmployeAction` capture les 3 chemins avant l'appel RPC (qui les met à
null), puis supprime les fichiers correspondants une fois l'anonymisation en base confirmée (best
effort, ne fait jamais annuler l'effacement déjà acquis en cas d'échec Storage). Validé par la
suite complète du dépôt (§9bis).

### 14.7 Investigué et volontairement NON porté

- **`6b71808`/`9b0ba76`/`3f3de4e` (bumps de dépendances npm)** : vérifiés contre
  `package-lock.json` actuel — `fast-uri` (3.1.4), `brace-expansion` (1.1.16),
  `js-yaml` (4.3.0) sont bien aux versions vulnérables que ces commits corrigeaient en
  juillet/août 2026. **Mais `npm audit` exécuté dans cette session aujourd'hui (2026-09-22,
  base d'avisories courante) montre que la situation a matériellement évolué depuis** : 7
  vulnérabilités actuelles (1 modérée, 5 hautes, **1 critique — RCE non authentifiée sur
  Next.js**), dont `fast-uri` reste dans la plage vulnérable même à la version 3.1.5 que
  visait le correctif source (plage actuelle : 3.0.0-3.1.5), et `brace-expansion` a une
  résolution vulnérable différente (`glob/node_modules/brace-expansion`@5.0.7, plage
  4.0.0-5.0.8) que le correctif source (qui ne touchait que la résolution 1.1.x) ne couvre
  pas. Porter le correctif d'origine donnerait un faux sentiment de sécurité sans résoudre
  ce qu'`npm audit` signale aujourd'hui. Non porté ici — c'est un chantier de durcissement
  de dépendances à part entière (certains correctifs, comme Next.js, sont des montées de
  version majeure à risque réel, nécessitant des tests que cet environnement ne permet pas),
  **DECISION_REQUIRED** distinct, repris en §16.
- **`4211014`/`53d24a2` (retrait de branches `auth.role()='anon'` vestigiales)** : le
  message de commit source lui-même les qualifie de « nettoyage de défense en profondeur »,
  « confirmé inerte avant retrait » et « pas un correctif de faille active ». Vérifier
  individuellement si les ~20 fonctions concernées existent avec le même motif sur cette
  branche (elles n'ont pas la même histoire que le lot GP-pilot) demanderait un audit
  fonction par fonction comparable à celui du §13, pour un gain que la branche source
  elle-même qualifie de purement préventif. Non prioritaire, non fait dans cette passe.
- **`2647d4e`/`9608f70` (migration vers la clé publique Supabase "Publishable key")** :
  dépend de la configuration réelle des variables d'environnement de déploiement
  (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) sur les environnements Production/Preview réels
  de ce dépôt — invérifiable depuis ce bac à sable (aucun accès aux secrets de déploiement).
  Porter cette migration à l'aveugle risquerait de casser la connexion Supabase si la
  variable n'est pas déjà positionnée sur les environnements réels. Non porté, à vérifier
  par quelqu'un ayant accès à la configuration Vercel/Supabase réelle.
- Les ~65 autres commits `fix(...)` de la branche (liste en §1.6) n'ont pas été examinés du
  tout dans cette passe (budget) — voir §16.

---

## 15. Classification complémentaire des branches nommées dans le mandat (troisième passe)

- **`suspension_plateforme`, `ELSATIA_GP_ACCES_APP`, `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1`,
  `decision_acces_application`** comme noms de branche littéraux : recherche exhaustive
  (`git branch -a --list`, insensible à la casse, séparateurs `_`/`-` variables) —
  **confirmé définitivement absents des 255 branches distantes**, dans les deux passes
  (première recherche en §1.5, revérifiée ici). Ce sont des identifiants de fichiers/docs/
  contrats (§1.5, §3), jamais des noms de branche. Résolu.
- **Colors access / Reserves access** : 5 branches supplémentaires correspondant aux mots-clés
  du mandat, non encore classées en §1.5bis, examinées ici :
  `audit/colors-account-access-predeploy-v1` (273 commits d'avance, `apps/`+`packages/`),
  `feat/colors-multiapp-password-reset-v1` (269, idem), `feat/colors-commercial-readiness-v1`
  (378, idem), `feat/reserves-v6-security-offline-pilot-gate-v1` (309, idem),
  `fix/preview-blockers-reserves-notif-v1` (545, idem) — **toutes UNSAFE (hors-cible)** :
  chacune contient `apps/` et `packages/`, confirmant le même diagnostic que les branches
  Colors/Reserves déjà classées en §1.5bis (socle racine du monorepo multi-app, absent de
  `main`). Rien de nouveau à porter.
- **Tools entitlement** : recherche de branches combinant `tools` avec `access`/`entitle`/
  `auth`/`acl` dans leur nom → aucune trouvée. Le thème « Tools entitlement » du mandat se
  résout donc entièrement dans la lignée d'entitlement multi-app déjà identifiée (§1.2,
  `feat/elsatia-gestion-pro-multi-app-ui-v1` et les branches `fix/tools-*` déjà classées
  UNSAFE en §1.5bis) — aucune branche dédiée séparée n'existe sous ce nom.
- **Studio access/signup** : `fix/studio-signup-closed-v1` reste le seul candidat pertinent
  (déjà classé CANONICAL_CANDIDATE isolé/hors-cible en §1.5bis). La branche fondatrice
  `feat/elsatia-studio-v1` (280 commits d'avance, `apps/`+`packages/`) a été vérifiée ici :
  également hors-cible (monorepo multi-app), sans lien spécifique avec l'accès/signup au-delà
  de ce que `fix/studio-signup-closed-v1` couvre déjà.

---

## 16. OPEN DECISIONS

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
- **Ouvert** : malgré les ~50 branches classées en plus lors de cette mission (§1.5bis + §15),
  ~190 des 255 branches distantes restent non classifiées individuellement — la lignée principale
  d'entitlement (§1.2) et le tronc mono-app GP jamais fusionné (§1.6) sont désormais tous deux
  identifiés avec un niveau de confiance élevé, mais l'inventaire exhaustif demandé par le mandat
  n'est toujours pas complet.
- **RÉSOLU (troisième passe, §13)** : `8caef21` (durcissement de 22 fonctions `SECURITY DEFINER`)
  a été intégralement vérifié fonction par fonction. 20 des 22 sont déjà sûres sur cette branche ;
  les 2 restantes portaient un gap réel mais différent de celui décrit par le commit source
  (`grant ... to authenticated` explicite plutôt qu'un défaut par omission), corrigé par le
  correctif porté en §13 (commit `d357314`). Plus de portage supplémentaire requis pour ce commit
  précis.
- **RÉSOLU (sixième passe, §18)** : sur les ~80 commits `fix(...)` de
  `integration/gp-external-pilot-closure-v1`, la totalité a désormais été examinée au moins par un
  titre et une décision documentée (troisième passe : §14.1-14.6 portés, §14.7 examinés-non-portés ;
  quatrième passe, §17 : 11 portés, 4 déclinés, 2 non applicables ; sixième passe, §18 : 10 portés
  — 3 partiellement —, 27 déclinés). **28 correctifs portés au total sur l'ensemble de la mission.**
  Il ne reste ouvert que le cluster `338401b`/`503a14f`/`98ea6f2`/`cf13843`/`8ca1609` (§18.3),
  documenté comme candidat sûr mais volumineux pour une session dédiée future — plus un travail de
  vérification exhaustive, l'inventaire lui-même est clos.
- **DECISION_REQUIRED — cloisonnement des webhooks Stripe par environnement (§17.2, `fcdd4e7`)** :
  correctif identifié comme réel et bien conçu (empêche un webhook Stripe test d'être traité comme
  un événement live ou inversement), mais qui introduit une variable d'environnement obligatoire
  (`STRIPE_WEBHOOK_EXPECTED_MODE`) et échoue fermé (503 sur tout webhook Stripe) si elle est
  absente. Avant tout portage : positionner cette variable sur les environnements Vercel
  Production ET Preview réels de ce dépôt, sinon le déploiement du correctif interromprait la
  synchronisation des abonnements Stripe en production dès sa mise en ligne. Non vérifiable ni
  actionnable depuis un bac à sable sans accès à cette configuration.
- **Candidat pour une session dédiée à l'outillage opérationnel (§17.2, `cc4e1a0`)** : garde-fou
  programmatique contre l'exécution accidentelle des scripts destructifs de
  `supabase/production/` (existence des scripts confirmée : `supprimer_entreprises_test.sql`
  notamment) contre le mauvais projet Supabase. Diagnostiqué mais pas porté — protège des
  opérations manuelles d'un opérateur, hors du périmètre sécurité applicative de cette mission.
- **RÉSOLU (2026-09-22, session dédiée `npm audit`)** — durcissement des dépendances npm
  (précédemment `DECISION_REQUIRED`, §14.7) : les **2 avisories CRITIQUES confirmées** par la
  session précédente sur `next` (`GHSA-p293-qw3h-jr36` — RCE non authentifiée sur hosts Windows ;
  `GHSA-2xp9-vwfh-vxw4` — RCE non authentifiée dans l'API d'optimisation d'image AVIF, sans
  restriction de plateforme) sont **corrigées** : `next` `16.2.12` → `16.3.5` (montée de patch au
  sein de la même plage semver `^16.2.12`, pas de saut de version majeure). `npm audit`
  post-correctif ne rapporte plus aucune vulnérabilité `next`, ni aucune critique/haute confondue
  sur `next`. Dans la foulée, 7 des 9 autres avisories (haute/modérée) signalées ce même jour ont
  aussi été résolues sans rupture : `sharp` `0.35.3` → `^0.35.4`, et par `npm update` ciblé
  (contournant un crash reproductible d'arborist sur `npm audit fix`/`npm update` global — erreur
  `Cannot read properties of null (reading 'edgesOut')`, propre à la résolution des pairs
  optionnels de `vitest` sur cette version de npm) : `browserslist`, `brace-expansion`, `fast-uri`,
  `js-yaml`, `baseline-browser-mapping`. Le dernier, `nanoid` (< 3.3.18), venait d'un override
  `postcss@8.5.24` figé sous `next` dans `overrides` — bump ciblé de cet override à `8.5.28`
  (patch, même ligne 8.5.x) sans toucher au reste. **Validation complète effectuée et vue
  réellement passer** (pas seulement lancée) : `npm run typecheck` (0 erreur), `npm run lint`
  (0 erreur, 3 warnings `@next/next/no-img-element` préexistants, non liés), `npm run test`
  (106/106 tests, 29/29 fichiers), `npm run build` (`next build` réussi sur Next.js 16.3.5,
  115 routes générées). `npm ci` re-testé après coup pour confirmer que le `package-lock.json`
  résultant reste installable de façon reproductible (obligatoire, car une tentative initiale de
  corriger la dernière avisorie via `--legacy-peer-deps` avait produit un lockfile qui faisait
  échouer `npm ci` — cette tentative a été annulée avant commit).
  **Encore ouvert, volontairement non forcé** : 1 avisorie modérée residuelle —
  `GHSA-82fw-gwwq-j7x9` (Vitest, path traversal/lecture de fichier arbitraire via
  `@vitest/mocker`, plage `2.1.0-4.1.10`). Le correctif (`vitest` `4.1.10` → `4.1.11`, dans la
  plage `^4.1.10` déclarée) ne s'installe pas proprement sous npm dans cet environnement : même
  crash arborist que ci-dessus en résolution stricte des pairs, et la seule façon testée de le
  contourner (`--legacy-peer-deps`) a supprimé 49 paquets optionnels de mode navigateur de Vitest
  du lockfile et cassé `npm ci` — signe d'un lockfile incohérent, pas d'un correctif propre. Non
  porté ici plutôt que de committer un lockfile potentiellement cassé pour une CVE modérée
  touchant uniquement l'outillage de test (jamais le code de production). À reprendre par une
  session future, idéalement avec une version de npm sans ce bug arborist, ou en régénérant le
  lockfile depuis zéro (`rm -rf node_modules package-lock.json && npm install`) plutôt qu'un
  `npm update` incrémental.
- **DECISION_REQUIRED — RLS sur `compteurs_reference`** (nouveau, §14.1) : gap réel confirmé (la
  table n'a jamais eu la RLS activée, `authenticated` n'a jamais eu ses privilèges de table
  révoqués dessus), mais activer une RLS nue casserait la création d'entreprise directe côté
  client (`trg_set_entreprise_reference()` n'est pas `security definer`, contrairement à tous les
  autres triggers de numérotation du dépôt). Nécessite de concevoir une policy correcte (portée
  par `entreprise_id`, y compris le sentinel uuid nul des compteurs globaux à la plateforme) et de
  la tester contre une vraie base — non disponible dans cet environnement.
- **Ouvert** : le nom exact « `decision_acces_application` » comme identifiant de fonction/contrat
  est confirmé ; comme nom de branche, il n'a été trouvé nulle part — **confirmé définitivement
  absent** après une seconde recherche exhaustive en troisième passe (§15), avec
  `suspension_plateforme`, `ELSATIA_GP_ACCES_APP` et `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1` (mêmes
  résultats : identifiants de fichiers/docs/contrats, jamais des noms de branche).

---

## 17. CINQUIÈME PASSE (2026-09-22, suite) — 11 correctifs supplémentaires portés

Reprise du tronc mono-app GP (§1.6) là où la troisième passe s'était arrêtée : sur les ~65
commits `fix(...)` restants d'`integration/gp-external-pilot-closure-v1` (liste en §1.6), cette
passe en a examiné 18 en détail, contre le SQL/code actuel de `claude/quirky-noether-n8aerc`
(fetché et rebasé au départ de cette passe : la branche était passée de `4d92ddb` à `22b32c0`
entre-temps, via les trois passes précédentes plus une session dédiée `npm audit`). **11 portés,
4 déclinés avec raison, 2 non applicables (le code/les routes qu'ils corrigent n'existent pas sur
cette branche), 1 différé** (tooling opérationnel, hors du périmètre sécurité applicative de cet
audit). Chaque correctif ci-dessous a été vérifié par lecture directe du code actuel avant
portage, pas par confiance dans le message de commit source.

### 17.1 Portés

| # | SHA source | SHA porté | Sujet |
| - | --- | --- | --- |
| 1 | `25ae08e` | `a45f7b5` | Aucun en-tête de sécurité HTTP n'existait (CSP à nonce, HSTS, X-Frame-Options, COOP/CORP, Permissions-Policy) — vérifié : `src/lib/security/headers.ts` n'existait pas. Delta : `bodySizeLimit` de `experimental.serverActions` **non** réduit de 15 Mo à 2 Mo comme le fait la source — de nombreuses server actions de ce dépôt (documents.ts, employes.ts…) acceptent des fichiers jusqu'à 15 Mo directement via `FormData`/`File.arrayBuffer()`, un plafond à 2 Mo aurait cassé les téléversements réels. |
| 2 | `2d91b19` | `6dbc97c` | Ouverture de redirection réelle sur `/auth/callback` et `/auth/confirm` (le contrôle local ne décodait pas le pourcent-encodage ni ne filtrait `\`) ; cookies de session Supabase sans `secure` explicite (`DEFAULT_COOKIE_OPTIONS` de `@supabase/ssr` ne le positionne pas) ; UUID/validation d'entrée sur plusieurs routes ; masquage des messages d'erreur SQL bruts renvoyés au client sur une dizaine de routes. Delta : le plafond générique de 64 Ko sur `POST /api/assistant/chat` **non** porté — vérifié sur l'historique de la branche source elle-même que ce plafond casse les pièces jointes réelles de l'assistant IA (jusqu'à 6 Mo), régression corrigée par un commit distinct et plus large (`78f2a9a`, non porté non plus, voir §17.2). |
| 3 | `fee8afa` | `12e9104` | **Bug critique confirmé** : aucune policy RLS PERMISSIVE ne couvrait plus INSERT/UPDATE/DELETE sur `public.chantiers` depuis la migration `20260715000081` (recherche exhaustive des 190 migrations) — la création/modification/suppression de chantier était bloquée par RLS pour toutes les entreprises, sans exception, `src/app/actions/chantiers.ts` faisant des `insert`/`update` directs (pas de client admin). Delta : ajoute aussi 3 policies RESTRICTIVE `gerer_chantiers` absentes sur cette branche (présentes côté source), pour ne pas rouvrir un accès en écriture à tout membre actif sans la permission métier. |
| 4 | `379fd7b` | `1aa1ade` | `factures.{client_id,devis_origine_id,facture_origine_id,facture_parente_id}` sans clé étrangère composite `(colonne, entreprise_id)`, contrairement à `chantier_id` — un appel direct API pouvait créer une facture d'une entreprise pointant vers une ressource d'une autre. Migration additive (FK composites + index uniques), aucune RLS modifiée. |
| 5 | `2b4af99` | `e3211e0` | Même gap sur `devis.client_id` (atteignable depuis le formulaire normal de devis, pas seulement l'API directe : `creer_devis_brouillon`/`modifier_devis_brouillon` en héritent silencieusement). |
| 6 | `0747237` | `9c24e87` | Même gap sur `relances_impayes.facture_id` (la seule protection réelle était applicative, `creerRelanceAction`, contournable par API directe). |
| 7 | `f990240` | `97e3aff` | **Découvert nécessaire par cette session, pas depuis le message source seul** : les 3 correctifs composite-FK ci-dessus (#4-6), une fois posés ensemble, rendent ambigus (PGRST201) une douzaine d'embeds PostgREST non qualifiés dans 12 fichiers applicatifs (dashboard, fiches devis/factures, CRM, exports comptables, impressions, copilote IA) — sans ce correctif compagnon, les 3 précédents auraient cassé ces pages en silence (la plupart des requêtes concernées ne vérifient pas `error`). Qualifie chaque embed avec le nom de FK simple préexistant. Recherche exhaustive complémentaire : les autres embeds `clients()`/`factures()`/`devis()` du dépôt n'ont qu'un seul chemin de jointure, donc non ambigus, volontairement non qualifiés. |
| 8 | `3b25041` | `e29d702` | `ajouter_audit_note_frais` (security definer, `search_path=public`) appelait `digest()` non qualifié alors que `pgcrypto` est dans `extensions` — toute création de note de frais échouait avec une erreur 500 avant même la création du brouillon, cassé depuis sa création. |
| 9 | `4f9bc00` | `98bc3bb` | Le token de confirmation à usage unique (`/auth/confirm`) était consommé par un simple GET — préchargement de lien par un client mail ou un scanner de sécurité invalidait le vrai clic de l'utilisateur, cassant systématiquement les liens de confirmation d'inscription et de récupération de mot de passe. Transformé en page à bouton de confirmation explicite ; `verifyOtp` ne s'exécute plus que sur soumission du formulaire. Adapté au branding "Liria Gestion Pro" de cette branche (la source utilise `@/lib/brand`/`BrandWordmark`, absents ici). Tests portés et **réellement exécutés** (`npx vitest run`, 6/6). |
| 10 | `27a8ea4` | `0d33ffd` | `getContexteEntreprise()` renvoyait tout compte sans `entreprise_active_id` vers `/onboarding`, y compris un admin plateforme (qui n'est par nature rattaché à aucune entreprise cliente) — invite de création d'entreprise absurde à chaque connexion. Contexte neutre + routage direct vers `/plateforme`. Tests adaptés (sans `@/lib/brand`) et réellement exécutés, 6/6. |
| 11 | `5777abb` | `f630956` | Deux gaps génériques (reformulés depuis le cadrage "dérive Preview/Production" de la source, qui ne s'applique pas tel quel à cette branche, mais vérifiés indépendamment ici comme réels sur le SQL actuel) : (a) aucun verrou DB n'empêchait de modifier/supprimer un devis déjà accepté (protection uniquement applicative, contournable par API directe) ; (b) `abonnement_essai_fin` n'était jamais renseigné à la création d'une entreprise malgré `abonnement_statut` par défaut `'essai'` — un essai gratuit ne s'arrêtait donc jamais tout seul, pour aucune entreprise créée sur cette branche. **Écart volontaire documenté dans la migration** : `chantier_id` exclu du verrou de devis accepté, après avoir trouvé que `associerDevisChantierAction` réassigne légitimement un devis accepté à un autre chantier du même client — un flux existant que le verrou de la source aurait cassé. |

Chaque correctif SQL a été validé par `node scripts/verify-migrations.mjs` et
`node scripts/verify-secrets.mjs` (aucune base réelle disponible pour rejouer les pgTAP, comme
pour tout le reste de cette mission). Chaque correctif TypeScript/JS a été validé par la suite
complète (`npm run typecheck && npm run lint && npm run test && npm run build`), avec `npm ci`
exécuté en début de passe. Les nouveaux tests vitest (#9, #10) ont en plus été **réellement
exécutés et vus passer**, contrairement aux tests pgTAP jamais rejouables dans cet environnement.

### 17.2 Déclinés (raison documentée)

- **`4e80156`/`9df5f40` — limitation de débit centralisée (rate limiting)** : conception saine
  (RPC dédiée, HMAC des identifiants, fenêtres glissantes), mais **risque de régression réel et
  non vérifiable ici** : le code échoue **fermé** (503 sur toute route protégée, y compris
  `/login`/`/signup`/toutes les routes `/api/` authentifiées) si `RATE_LIMIT_HMAC_KEY` n'est pas
  positionnée en production — variable absente de `.env.example` et dont la présence réelle sur
  Vercel Production/Preview ne peut pas être vérifiée depuis ce bac à sable. Même classe de risque
  que les correctifs "Publishable key" déjà déclinés en troisième passe (§14.7). Non porté ; le
  schéma SQL seul (tables + RPC, sans le câblage dans `src/lib/supabase/proxy.ts`) aurait pu être
  porté mais n'aurait aucune valeur de protection tant qu'il n'est pas activé — écarté pour ne pas
  laisser un faux sentiment de couverture. `9df5f40` en dépend directement (tests/complément de
  `4e80156`), décliné pour la même raison.
- **`fcdd4e7` — cloisonnement des webhooks Stripe par environnement (test/live)** : même classe de
  risque, en pire : le code introduit une variable d'environnement **obligatoire**
  (`STRIPE_WEBHOOK_EXPECTED_MODE`) et retourne 503 sur **tout** webhook Stripe entrant si elle est
  absente — vérifié dans le diff (`if (!configurationMode.valide) { ... return
  NextResponse.json(..., { status: 503 }); }`). Déployer ce correctif sans avoir d'abord positionné
  cette variable sur l'environnement réel couperait net la synchronisation des abonnements Stripe
  en production. Non vérifiable depuis ce bac à sable (pas d'accès à la configuration Vercel
  réelle). Non porté ; repris en §16 comme action à coordonner avec le propriétaire du dépôt avant
  tout portage futur.
- **`d8fa090` — masquage CSS du mode consultation (lecture seule)** : le message de commit source
  le dit lui-même explicitement : « la sécurité réelle (RLS + permissions) était déjà indépendante
  de ce masquage… il s'agit d'un correctif d'UX/cohérence, pas d'un correctif de faille ». Conforme
  au mandat (« skip pure refactors or feature work »), non prioritaire pour cet audit de sécurité,
  non examiné plus avant.
- **`cc4e1a0` — verrouillage programmatique des scripts de recette Supabase**
  (`supabase/production/`) : garde-fou opérationnel réel et plausible (le dépôt a bien des scripts
  destructifs sous `supabase/production/`, ex. `supprimer_entreprises_test.sql`), mais protège des
  opérations manuelles d'un opérateur humain, pas une faille exposée à un utilisateur de
  l'application — hors du périmètre « bugs de sécurité/correction applicative » de ce mandat.
  Diagnostic (existence des scripts, structure du garde-fou source) fait, portage lui-même non
  fait faute de temps dans cette passe ; candidat raisonnable pour une session dédiée à l'outillage
  opérationnel plutôt qu'à l'audit applicatif.

### 17.3 Non applicables (code/routes absents de cette branche)

- **`78f2a9a`** : corrige une régression introduite par un plafond de 64 Ko sur le corps HTTP de
  `/api/assistant/chat` — plafond que cette session n'a justement pas porté (voir #2 en §17.1,
  delta documenté). Rien à corriger ici : main n'a jamais eu la régression que `78f2a9a` répare.
- **`749d6af`** : rend publiques les routes `/document/[token]`, `/imprimer/partage/[token]` et
  `/api/documents/partage/[token]/pdf` dans le proxy — vérifié qu'**aucune des trois routes
  n'existe sur cette branche** (`ls` négatif sur les trois chemins) : la fonctionnalité de partage
  externe de documents (P9) elle-même n'a pas été portée sur `main`. Rien à rendre public tant que
  cette fonctionnalité n'existe pas ici.

### 17.4 Bilan de cette passe

18 commits examinés en détail sur cette passe (11 portés, 4 déclinés, 2 non applicables, 1
différé), auxquels s'ajoutent les ~15 déjà examinés lors des passes précédentes (§11, §13, §14) —
soit environ **33 des ~80 commits `fix(...)` d'`integration/gp-external-pilot-closure-v1`
examinés au total sur l'ensemble de la mission**. **Il reste environ 47 commits `fix(...)` non
examinés** (liste complète toujours disponible via `git log --reverse --format='%h %ad %s'
--date=short 4d92ddb..origin/integration/gp-external-pilot-closure-v1`, filtrée sur les messages
commençant par `fix`). Cette passe s'arrête ici par budget de session, pas parce que le fond de la
liste est atteint — repris en §16 (OPEN DECISIONS, mis à jour ci-dessus).

---

## 18. SIXIÈME PASSE (2026-09-22, suite) — 10 correctifs supplémentaires portés

Reprise du tronc mono-app GP (§1.6) là où la cinquième passe (§17) s'était arrêtée : sur les
**47 commits `fix(...)` restants** d'`integration/gp-external-pilot-closure-v1` (liste complète en
§17.4), cette passe en a examiné 37 en détail, contre le code actuel de
`claude/quirky-noether-n8aerc` (fetché depuis `e340f68` en début de passe — la branche avait bougé
depuis la cinquième passe via une session `npm audit` dédiée et cette cinquième passe elle-même).
**10 correctifs portés (certains partiels — seule la sous-partie applicable d'un commit large a été
reprise), 27 déclinés avec raison, 2 documentés comme candidats de grande ampleur pour une session
dédiée future plutôt que portés à la hâte.** Chaque correctif a été vérifié par lecture directe du
code actuel avant portage, jamais par confiance dans le message de commit source.

### 18.1 Portés

| # | SHA source | SHA porté | Sujet |
| - | --- | --- | --- |
| 1 | `8d419ec` | `e50af46` | **Faille réelle confirmée** : `origineApplication()` (src/app/actions/auth.ts) construisait les liens d'e-mail sensibles (confirmation d'inscription, réinitialisation de mot de passe, y compris la réinitialisation lancée par un admin plateforme pour un compte client) à partir des en-têtes HTTP `Origin`/`X-Forwarded-Host`/`Host` — fournis par l'appelant. Un Host header falsifié accepté par la plateforme d'hébergement aurait pu faire pointer le lien envoyé à la victime vers un domaine contrôlé par l'attaquant (password-reset-link poisoning). Remplacé par une URL canonique fixe (`process.env.NEXT_PUBLIC_APP_URL`, déjà la convention de ce dépôt pour Stripe/Powens) sur les 3 points d'appel (signup, reset self-service, reset admin plateforme). Adapté : la source dépend de `@/lib/brand` (`BRAND.urlPublique`), absent ici. |
| 2 | `69187a1` | `bbb55f7` | **Contournement en langage naturel des droits de menu, confirmé.** Les outils de lecture rentabilité/flotte/stock/factures/devis/heures d'équipe du copilote IA n'étaient filtrés que par `entreprise_id`, jamais par le droit de menu réel (`acces_rentabilite`, `acces_flotte`...) — un poste Terrain sans ce droit pouvait l'obtenir via une simple question à l'assistant. `permissions` était déjà calculée dans la route mais jamais transmise à `demanderAssistantIAStream`. Adapté : `heures_supplementaires_semaine` gardé par `gerer_pointage` seul (`voir_pointages_equipe` de la source n'existe pas sur cette branche). |
| 3 | `76d5855` | `14694ed` | Bug produit réel, pas une faille : l'offre Mini facture des comptes supplémentaires (`comptesInclus`/`parCompteSup`) mais n'incluait pas `acces_employes` dans son catalogue de fonctionnalités — impossible pour un client Mini de créer les comptes qu'il paie. |
| 4 | `86549ac` | `d46f7f1` | **Gap RLS réel confirmé** : la policy `"membres factures"` (`for all`) autorise toute écriture sur `public.factures` à n'importe quel membre actif, sans vérifier le statut — seule la couche applicative protégeait une facture déjà émise. Un appel API direct pouvait modifier son montant, la faire redevenir brouillon, ou la supprimer. Verrou d'immutabilité (`verrouiller_facture_emise`) reconstruit à l'identique contre le schéma actuel (`entreprise_snapshot`/P9 absent ici, testé comme inerte). |
| 5 | `9d55fd7` (partiel) | `845eb4c` | **Élévation de privilège réelle confirmée** : `est_membre_actif` fait OU avec `est_acces_support_actif` — un opérateur support avec une session ouverte sur une entreprise cliente était donc traité comme membre actif partout, y compris sur 2 policies qui créent un état PERMANENT (`utilisateurs_entreprises` INSERT, `permissions_poste` ALL). Un accès de dépannage temporaire pouvait devenir un accès permanent non tracé comme tel. Nouvelle fonction `est_membre_actif_reel` (sans le OU support), utilisée uniquement pour ces deux policies. Seule cette sous-partie du commit source est applicable ; le reste (`relance_finaliser`, `relances_documents`) dépend d'une fonctionnalité de relances automatiques absente de cette branche. |
| 6 | `fce2c55` | `3bc6a5c` | Masque les messages d'erreur SQL bruts (nom de contrainte, colonne, policy RLS) sur les 14 sites identiques trouvés dans clients/chantiers/devis/factures (nouveau `src/lib/erreurs-utilisateur.ts`), au lieu de renvoyer `error.message` directement à l'utilisateur. Écart volontaire : `enregistrerPaiementAction` non enveloppée (la RPC portée au même moment renvoie déjà des messages métier sûrs et spécifiques — les enrober du repli générique aurait été une régression UX sans gain). |
| 7 | `a3cf2b7` | `3bc642b` | Bug produit réel : le nom du coupon Stripe (`${entreprise.nom} — ${description}`) était construit sans troncature, dépassant la limite de 40 caractères de l'API Stripe dès qu'un nom d'entreprise est un peu long — Stripe rejetait alors toute la création du coupon, bloquant la remise. |
| 8 | `9d55fd7` (partiel, 2/3) | `ef49ef5` | **TOCTOU réel confirmé** : `enregistrerPaiementAction` lisait `montant_paye`, vérifiait en mémoire, puis insérait directement — sans verrou. Un double clic/deux onglets pouvait dépasser `montant_ttc`. Nouvelle RPC `enregistrer_paiement_facture` (verrou `for update`). **Doublon réel confirmé** : `creer_facture_avancee` ne vérifiait aucun avoir déjà émis pour la même facture d'origine — un double clic doublait le crédit client. Index unique partiel + résolution vers l'existant. Gèle aussi `date_echeance` post-émission (champ légalement significatif, laissé libre par erreur dans le verrou du #4). |
| 9 | `e109954` (partiel, 1/3) | `af9374e` | **Suite directe du #8, trouvée par la source elle-même** : le verrou `for update` de `enregistrer_paiement_facture` ne servait à rien tant que `authenticated` gardait l'INSERT direct sur `paiements` via PostgREST (la RLS `"membres paiements"` l'autorise toujours). `revoke insert ... from authenticated`, réservant l'écriture à la RPC. Les 2 autres sous-parties de ce commit ne sont pas applicables (régression `avenants`/`montant_contractuel_devis`, absent ici ; déduplication d'une vérification qui n'est pas dupliquée sur cette branche — `/abonnement-suspendu` n'a pas de logique de visibilité côté page). |
| 10 | `5e9014a` | `9b2e5df` | Étend `erreurs-utilisateur.ts` (porté au #6) avec 3 catégories supplémentaires (dépendance FK, conflit métier/trigger P0001, service externe indisponible) — purement additif, n'affecte aucun appel existant (tous fournissent déjà un message de repli explicite). |

Chaque correctif SQL validé par `node scripts/verify-migrations.mjs` et `node scripts/verify-secrets.mjs`
(195 migrations valides en fin de passe) ; pgTAP en style introspection, non exécuté faute de
Docker/Postgres. Chaque correctif TypeScript/JS validé par `npm run typecheck && npm run lint &&
npm run test && npm run build`, avec `npm ci` en début de passe ; tous les nouveaux tests vitest
(31 au total sur cette passe) ont été **réellement exécutés et vus passer** (157/157 sur la suite
complète en fin de passe), contrairement aux tests pgTAP jamais rejouables dans cet environnement.

### 18.2 Déclinés (raison documentée)

- **`4e188ec`, `f8a9236`, `8fe737e`** — lignée de rebranding ELSATIA (migration des QR codes du
  préfixe `LGP-` vers `ELS-`, préférences locales, déclaration `julien@elsatia.fr` administrateur
  plateforme) : cette branche garde le préfixe `LGP-`/le nom `Liria Gestion Pro` sur toute sa
  longueur (vérifié par recherche exhaustive, `git grep` négatif sur `ELS-`/`elsatia.fr` dans le
  code applicatif) — aucun de ces correctifs n'a de code cible ici.
- **`255ba1c`** — améliore les messages d'erreur du flux de récupération de mot de passe
  (`/auth/confirm`), mais dépend de `@/lib/auth-erreurs` (`traduireErreurAuth`), un module distinct
  de `erreurs-utilisateur.ts` (porté ici) qui n'existe pas sur cette branche. UX, pas une faille de
  sécurité active — non porté, l'infrastructure manquante rendrait le portage non trivial pour un
  gain mineur.
- **`6741dd7`** — commit majoritairement une clôture de couverture de tests (47 fichiers) et un
  nettoyage de code mort (PWA/offline) propres à l'état très avancé de la branche source à cette
  date (devis v2, catalogue, etc., aucun équivalent ici). Son seul fragment de sécurité isolable
  (cloisonnement Live/Test du webhook Stripe boutique) est un doublon exact du mécanisme déjà décliné
  en §17.2 pour `fcdd4e7` (même variable d'environnement obligatoire `STRIPE_WEBHOOK_EXPECTED_MODE`,
  même échec fermé 503, même risque non vérifiable depuis ce bac à sable) — décliné pour la même
  raison, non dupliqué en obligation séparée.
- **`cb3d34c`** — corrige un bug introduit par la migration 218 de la branche source elle-même
  (référence à `employes_cout_horaire`/`pointages.cout_horaire_applique`, absents du schéma) : un
  correctif d'un bug propre à cette autre lignée, sans équivalent ici (ces colonnes n'existent pas
  sur `claude/quirky-noether-n8aerc`).
- **`2f1a61d`** — revert d'une migration 228 de la branche source (tentative de liaison réciproque
  `devis.chantier_id` à la création d'un chantier, cassée par un trigger non documenté côté source) ;
  cette tentative n'a jamais été portée ici, donc rien à revert.
- **`78c0115`** — découple les relances automatiques des crons historiques via
  `FEATURE_RELANCES_AUTO_ENABLED`/`FEATURE_CRONS_ENABLED` : fonctionnalité de relances automatiques
  absente de cette branche (seules les relances manuelles, `relances_impayes`, existent, déjà
  sécurisées en `9c24e87`).
- **`e77f102`** — ajoute un droit `ajoute_documents_chantier` distinct de `gerer_chantiers` pour un
  profil Terrain : travail de granularité de permissions (feature produit), pas un correctif de
  faille — un poste sans `gerer_chantiers` était *trop* restreint, pas trop permissif. Non
  prioritaire pour cet audit de sécurité.
- **`9ffeb28`** — notification d'acceptation de devis (fonctionnalité manquante, pas un bug) + vue
  `employes_annuaire` à colonnes réduites : la source elle-même la documente comme une mitigation
  **incomplète** (« ne change pas la RLS de la table de base... flagué comme point ouvert restant »)
  — une vue additionnelle sans usage applicatif n'aurait aucune valeur de protection réelle avant un
  refactor plus large des appelants, hors budget de cette passe.
- **`4f313e4`** — sert les photos/signatures de devis sur les pages de partage public (§9) : ces
  routes de partage externe de documents n'existent pas sur cette branche (déjà noté N/A en §17.3
  pour `749d6af`, même fonctionnalité absente).
- **`d1cf8d5`** — résout une collision de numérotation de migration avec la branche Colors : propre
  à la lignée multi-app, sans objet ici (numérotation de migrations indépendante).
- **`ca2f2a2`** — route les CTA commerciaux vers une page de contact (marketing), pas un correctif de
  sécurité/correction applicative.
- **Style/UX/accessibilité/produit, sans lien avec la sécurité ou une régression fonctionnelle
  réelle, non examinés en détail au-delà du titre** (conforme au mandat : « a one-line skip note is
  enough ») : `95a5092` (renommage route de test), `8154fb6` (persistance d'offre onboarding),
  `6004678`/`da1999b` (UX : liens morts, états vides, masquage de module désactivé), `ed3889b`
  (contraste dark mode), `9a21c0c` (seed démo), `cee9f5e`/`90e1620`/`cfe933d` (qualité de
  reconnaissance IA sur les propositions de devis), `d53e5e0`/`a721851` (CSS/layout mobile),
  `af5082d` (noindex SEO pages légales), `7f3b406` (annonce lecteur d'écran), `7771840` (aperçu
  avant envoi de relance manuelle), `6dde06a` (affichage comptes inclus), `2daa37b` (clôture P2
  pointage/comptes-rendus, titre vague, non recroisé faute de temps), `456afe3` (journalisation
  coût IA).

### 18.3 Non portés à la hâte — candidats documentés pour une session dédiée

- **`338401b` + `503a14f` + `98ea6f2` + `cf13843` + `8ca1609` — extension de
  `messageErreurUtilisateur` à ~50-80 fichiers d'actions supplémentaires** (onboarding, documents,
  paiement, pointage, employés, planning, congés, stock, notes de frais, achats, flotte, RGPD,
  messagerie, import, notifications push, support...). Le premier de ces 5 commits (`338401b`,
  17 fichiers) a été vérifié en détail : le motif est confirmé identique à celui déjà porté en
  §18.1 #6 (`error?.message` renvoyé brut, à remplacer par `messageErreurUtilisateur(...)`) et
  s'appuie sur l'infrastructure déjà portée dans cette même passe — donc un candidat sûr, mécanique,
  et de faible risque. **Non porté ici** : les 4 commits suivants portent sur un volume de fichiers
  bien plus large (catégories P0/P1/RGPD complètes), et vérifier chaque site un par un contre l'état
  actuel de cette branche (certains fichiers ont pu diverger depuis, comme observé pour
  `enregistrerPaiementAction` en #6) dépasse le budget restant de cette passe. Le risque par site est
  faible et l'infrastructure est prête ; c'est un volume de vérification, pas une difficulté
  technique — candidat idéal et bien scoping pour une session dédiée future, en commençant par
  `338401b` (déjà vérifié applicable).
- **`4271906`, `fba2d93` (renommage boutique/préférences locales ELSATIA)** — non examinés en détail
  au-delà du titre (lignée de rebranding déjà classée N/A en §18.2 pour les 3 autres commits du même
  lot) ; à confirmer N/A par un futur passage si un doute subsiste, mais aucun indice contraire
  trouvé.

### 18.4 Bilan de cette passe

37 commits examinés en détail sur cette passe (10 portés — dont 3 partiellement —, 27 déclinés avec
raison documentée), auxquels s'ajoutent les ~33 déjà examinés lors des passes précédentes (§11, §13,
§14, §17) — soit **la totalité des ~80 commits `fix(...)` d'`integration/gp-external-pilot-closure-v1`
désormais couverte au moins par un titre + une décision documentée** ; parmi eux, 5 (`338401b` et
la suite « p12 ») restent volontairement non portés faute de budget malgré une applicabilité
confirmée pour le premier — candidats explicites pour la prochaine session (§18.3). **28 correctifs
au total portés sur l'ensemble de la mission** (18 des passes précédentes + 10 de cette passe),
tous des commits séparés et minimaux, aucun ne touchant à un schéma absent de cette branche ni à la
question du monorepo multi-app.

Sanity-check demandé par le mandat sur l'ensemble de la branche (`git diff origin/main...HEAD`) :
**100 fichiers changés, +4804/-526 lignes, 35 commits d'avance sur `main`** ; aucune occurrence de
`apps/`/`packages/` dans le diff ; `ls supabase/migrations | sort | uniq -c` ne montre aucun nom de
fichier dupliqué ; aucune paire d'horodatages de migration en collision (195 migrations, tous
horodatages uniques, `node scripts/verify-migrations.mjs` vert) ; `git status --short` propre en fin
de session (aucun fichier orphelin ni non commité) ; `package.json.name` reste `liria-gestion-pro`
sur toute la branche. Rien de trivial à corriger trouvé, rien de non-trivial à signaler.

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
été fusionné ici, et la taille désormais mesurée avec précision (§16, 404 commits/1453 fichiers
pour le seul candidat canonique) confirme que ç'aurait été prématuré.

**Ce qui a changé entre les passes** : la première passe n'avait rien touché au code parce
qu'elle n'avait trouvé, sur le périmètre qu'elle avait examiné, aucun correctif à la fois
mono-app, autonome et vérifiable sans DB. La seconde passe, en classifiant davantage de branches
(§1.5bis), en a trouvé un — une élévation de privilège réelle sur du code qui existe aujourd'hui
sur cette branche (§11) — et l'a porté, seul, comme un commit séparé et minimal (`cacada0`). La
troisième passe a repris ce même geste à plus grande échelle sur le tronc mono-app GP identifié en
§1.6 : vérification complète et fonction-par-fonction de `8caef21` (§13, 20 fonctions déjà sûres
sur cette branche, 2 avec un gap réel différent du diagnostic source, corrigé), puis scan d'une
douzaine des 77 commits `fix(...)` restants avec le même niveau de rigueur, aboutissant à 6
correctifs supplémentaires portés (§14). La cinquième passe (§17) a repris ce même travail sur 18
commits supplémentaires, portant 11 correctifs de plus — dont un bug critique confirmé (§17.1 #3 :
toute écriture sur `public.chantiers`, la table cœur du produit, était bloquée par RLS depuis des
mois, pour toutes les entreprises), trois correctifs d'isolation cross-tenant composite-FK
accompagnés d'un correctif compagnon découvert nécessaire par cette session elle-même (pas
signalé par la source) pour ne pas casser l'application en les posant seuls, et un gap métier
générique (essais gratuits qui ne s'arrêtaient jamais). **18 correctifs au total sur l'ensemble de
la mission**, tous des commits séparés et minimaux, aucun ne touchant à un schéma absent de cette
branche ni à la question du monorepo multi-app — exactement le type de geste que le mandat
autorise sans requérir l'arbitrage du propriétaire du dépôt. La valeur ajoutée de cette mission
est donc triple : ces 18 correctifs, une revérification complète d'un audit de 22 fonctions
initialement jugé trop volumineux pour être vérifié à la main, et ce document — reconstruction
d'historique vérifiée, clarification qu'il s'agit d'une lignée d'entitlement unique et non de deux
modèles rivaux, identification d'un second tronc mono-app jamais fusionné (§1.6), classification
d'environ 65 branches au total sur les 255 (trois passes cumulées), et un plan d'action concret et
non exécuté pour la convergence multi-app (§16) à l'attention du propriétaire du dépôt.

**Mise à jour (sixième passe, §18)** : sur le tronc mono-app GP (§1.6), la totalité des ~80 commits
`fix(...)` a désormais été examinée au moins par un titre et une décision documentée (37 de plus
dans cette passe, 10 portés). **28 correctifs au total ont été portés sur l'ensemble de la
mission.** Il ne reste ouvert que le cluster `338401b`/`503a14f`/`98ea6f2`/`cf13843`/`8ca1609`
(extension mécanique de `messageErreurUtilisateur` à ~50-80 fichiers supplémentaires), documenté en
§18.3 comme candidat bien scopé — sûr et de faible risque, mais trop volumineux en vérification
site-par-site pour le budget restant de cette passe — pour une session dédiée future.

---

**CANONICAL MODEL NOT RESOLVED** — les 28 correctifs portés en §11/§13/§14/§17/§18 sont tous
indépendants de cette question et ne la referment pas : le modèle d'entitlement multi-app reste un
candidat documenté, non fusionné, en attente d'une décision du propriétaire du dépôt.
