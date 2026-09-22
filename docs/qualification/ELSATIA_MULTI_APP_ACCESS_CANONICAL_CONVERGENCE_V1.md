# ELSATIA — Convergence canonique de l'accès multi-application — V1

Date : 2026-09-22 · Branche d'intégration : `claude/quirky-noether-n8aerc` (poussée depuis un
commit identique à `main` @ `4d92ddb`, aucun autre commit dessus au moment du départ) · Session :
`session_016o4kJj26SaPhgLsAXcfZd5`.

**Portée de ce document** : reconstruction d'historique et comparaison de modèles à partir de
preuves git réelles (SHA cités, contenu lu avec `git show`/`git log -S`, pas de suppositions),
suivies d'une évaluation honnête de ce qui peut réellement être convergé sur
`claude/quirky-noether-n8aerc` dans cet environnement. **Aucune donnée ni preuve de ce document
n'est inventée** : chaque affirmation est tracée à une commande exécutée dans cette session, sauf
mention explicite « rapporté par la session antérieure, non revérifié ici ».

**Constat central, à lire avant tout le reste** : `main` (et donc `claude/quirky-noether-n8aerc`,
qui lui est identique) est un dépôt **mono-application** — `liria-gestion-pro` (Gestion Pro
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
réapparaîtra à l'identique.* Ce point est repris en §11 (OPEN DECISIONS).

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

`supabase/migrations/` reste donc à 178 fichiers, inchangé, sur `claude/quirky-noether-n8aerc`.

---

## 11. OPEN DECISIONS

- **DECISION_REQUIRED — portage obligatoire du correctif cross-tenant** : si/quand la
  modularisation de la facturation Gestion Pro (qui introduit
  `module_gestion_pro_actif_entreprise`) est fusionnée sur une branche qui deviendra `main`, les
  migrations `20260905000266` (garde de tenant) et `20260905000267` (révocation des 7 RPC sœurs)
  — ou leur équivalent revérifié à ce moment-là — **doivent** être portées dans le même train,
  sans quoi la fuite cross-tenant documentée en §4 réapparaît à l'identique. Défaut conservateur
  retenu : documenter l'obligation plutôt que fabriquer un correctif spéculatif contre un schéma
  absent.
- **DECISION_REQUIRED — au-delà de cette session** : la convergence du modèle d'entitlement
  multi-app (contrat `decision_acces_application`) ne peut être réellement intégrée et testée que
  dans un environnement qui (a) dispose déjà du monorepo multi-app (`apps/colors`, `apps/tools`,
  `apps/reserves`, `packages/application-access`) porté sur la lignée qui deviendra `main`, et (b)
  dispose d'un accès Docker/Postgres local pour rejouer les pgTAP. Aucun des deux n'est réuni ici.
  Défaut conservateur retenu : ne rien fusionner à l'aveugle, documenter précisément ce qui manque.
- **Ouvert, non résolu par cette session (hérité tel quel du rapport source, §7)** : la suspension
  plateforme ne coupe pas encore les données Gestion Pro (`est_membre_actif`) — nécessite un lot
  dédié avec mesure de charge sur 142 policies.
- **Ouvert, non résolu (hérité, §8)** : couplage support/communications d'un compte GP suspendu,
  même via une autre application.
- **Ouvert, non résolu (hérité, §3 rapport source)** : 12 décisions D-1…D-12 du backfill GP et 8
  décisions Tools listées dans les annexes `annexe-d1-gp-observation-backfill.md` /
  `annexe-d2-tools-serveur.md` de `fix/app-access-convergence-v1` — non retranscrites en détail ici
  (hors budget de cette session), consultables par SHA (§1.4).
- **Ouvert** : ~240 des 255 branches distantes non classifiées individuellement (§1.5) — la lignée
  principale est identifiée avec un niveau de confiance élevé, mais l'inventaire exhaustif demandé
  par le mandat n'est pas complet.
- **Ouvert** : le nom exact « `decision_acces_application` » comme identifiant de fonction/contrat
  est confirmé ; comme nom de branche, il n'a été trouvé nulle part (le mandat l'envisageait déjà
  comme possible).

---

## Pourquoi rien n'a été « intégré » au sens code sur cette branche

Le mandat demande de choisir, en cas d'ambiguïté, l'option la plus conservatrice compatible avec
D1/D2/D3, sans bloquer. L'option retenue ici est : **ne pas fusionner à l'aveugle un monorepo de
plusieurs centaines de fichiers et plusieurs centaines de commits sur une branche qui ne le
contient pas du tout**, sans schéma de base pour le qualifier et sans outillage pour le tester dans
cet environnement — un tel geste serait à la fois un « commit géant non revuable » (interdit
explicitement par le mandat) et une fabrication de confiance (« testé ») que cette session ne peut
pas obtenir. Le choix conservateur symétrique — copier uniquement la documentation déjà écrite par
la session source dans `docs/qualification/` de cette branche — a été envisagé puis écarté : cela
dupliquerait un contenu déjà accessible par SHA/branche git (source unique de vérité), sans ajouter
de valeur de convergence réelle, pour un risque de désynchronisation future. La valeur ajoutée de
cette session est donc entièrement dans ce document : reconstruction d'historique vérifiée,
clarification qu'il s'agit d'une lignée unique et non de deux modèles rivaux, confirmation/
infirmation précise de chaque fait du mandat, et consignation explicite de ce qui reste à faire et
par qui.

---

**CANONICAL MODEL NOT RESOLVED**
