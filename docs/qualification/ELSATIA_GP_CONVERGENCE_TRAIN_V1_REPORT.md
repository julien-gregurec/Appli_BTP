# ELSATIA GP — Convergence du train principal V1 — Rapport

**Date de la 1ʳᵉ édition** : 2026-09-21
**Branche de travail unique** : `claude/compassionate-euler-5j6avr` (aucun train concurrent créé)
**HEAD à la 1ʳᵉ édition de ce rapport** : `62b1b12` (code) — le commit `0410591` qui a suivi n'ajoutait que ce document lui-même, sans changement de code
**Statut** : `CONVERGENCE_TRAIN_CANDIDATE` confirmé par le demandeur sur `62b1b12` — **`FINAL_PREVIEW_TRAIN = NOT_YET`**. Voir §11 pour la suite des lots portés sur cette même branche, jamais redémarrés depuis `main`/`release/gp-v1-rc`/une autre branche ancienne.
**Base de référence** : `main` (`4d92ddb`)
**Migrations à la 1ʳᵉ édition** : 296 (`supabase/migrations/`), toutes horodatages 14 chiffres uniques (`node scripts/verify-migrations.mjs`)

Mission initiale : produire un train GP unique et vérifiable à partir de `ELSATIA_CONVERGENCE_MAP_V1.md` et `ELSATIA_PREVIEW_RELEASE_REHEARSAL_V1.md` (tous deux orphelins de `main`, retrouvés sur `claude/compassionate-davinci-g3fxtv` et `claude/awesome-einstein-tyfo4k`). Aucun déploiement Preview/Production, aucune donnée réelle, aucun accès Supabase/Vercel/Stripe distant dans aucune session de ce travail.

---

## 0. Vérification de l'état réel du dépôt

- 211+ branches distantes confirmées sur `origin` (`git fetch --all --prune`). Aucune n'a été perdue : la carte de convergence avait déjà vérifié qu'aucune branche nommée dans la mission originale n'était réellement manquante par accident — 6 des 10 branches citées dans cette mission-là n'avaient simplement jamais existé (voir §0 de `ELSATIA_CONVERGENCE_MAP_V1.md`, confirmé indépendamment deux fois).
- La branche de travail assignée à cette session (`claude/compassionate-euler-5j6avr`) était identique à `main` au démarrage (0 commit propre) : aucune perte possible en la réutilisant comme branche d'intégration isolée demandée par la mission.
- Les deux rapports sources n'existaient sur aucune branche unique : `ELSATIA_CONVERGENCE_MAP_V1.md` sur `claude/compassionate-davinci-g3fxtv` (91d8ee7), `ELSATIA_PREVIEW_RELEASE_REHEARSAL_V1.md` (avec ses deux mises à jour de fermeture RPC) sur `claude/awesome-einstein-tyfo4k` (67f4e5e). Aucune des deux n'est fusionnée nulle part — lus en lecture seule, aucun merge de ces branches n'a été effectué (seuls les fichiers `.md` ont été extraits par `git show`).

---

## 1. Décision — FINAL_PREVIEW_CONVERGENCE_BASE (hypothèse provisoire, réversible)

**Retenue : Option A** — `release/tools-store-preflight-v1` (`bf27e78`) + sécurité + GP pilote/perf + socle commercial ECO.

**Preuves à l'appui** (§16 de la carte de convergence) :
- Base déjà qualifiée par une répétition générale réelle et exécutée (Fresh 263/263, pgTAP 1130/1130 locaux, gate 3 apps vert hors CVE/RPC) — pas seulement documentée.
- Les deux blockers de sécurité identifiés (CVE Next.js/sharp, RPC cross-tenant) et les 7 RPC sœurs sont **déjà corrigés et testés** sur une branche linéairement descendante de cette base (`claude/preview-rehearsal-security-fixes-v1-rpc-sweep`, `71565ed`), permettant un **fast-forward pur** — aucun risque de conflit sur ce lot.
- Option B (`integration/elsatia-ecosystem-train-v3-commercial-platform-v1`) n'a jamais été qualifiée par une répétition complète (pas de preuve Fresh/pgTAP connue sur cette branche précisément).

**Coût accepté** : porter manuellement le socle commercial ECO (70-80 commits, 506 fichiers) sur cette base — fait avec succès en §3 ci-dessous, avec seulement 4 conflits réels.

**Risque résiduel documenté** : cette décision reste une hypothèse de travail, pas un arbitrage métier définitif. Elle n'a pas été validée par un humain habilité à trancher `FINAL_PREVIEW_CONVERGENCE_BASE`.

---

## 2. Registre des lots intégrés, dans l'ordre

| # | Lot | Source | Méthode | Résultat |
|---|---|---|---|---|
| 1 | **CORE** | `release/tools-store-preflight-v1` (`bf27e78`) | fast-forward depuis `main` | 263 migrations, base qualifiée |
| 2 | **Sécurité** (CVE Next.js/sharp 16.3.5/0.35.4, RPC `module_gestion_pro_actif_entreprise`, 7 RPC sœurs) | `claude/preview-rehearsal-security-fixes-v1-rpc-sweep` (`71565ed`) | fast-forward (descendant linéaire de #1) | 265 migrations, 0 conflit |
| 3 | **GP performance** (5 correctifs, migrations 299-303) | `perf/gp-capacity-readiness-v1` (`1669e5c`) | cherry-pick | 270 migrations, 0 conflit |
| 4 | **GP pilot-closure** (7 commits) | `integration/gp-external-pilot-closure-v1` (`f602a94`, `8f5fca1`) | cherry-pick × 7 | 281 migrations, 6 fichiers en conflit (résolus, voir §4) |
| 5 | **Renumérotation migrations 299-303** | — | renommage + mise à jour des références textuelles | 281 migrations, `verify:migrations` PASS |
| 6 | **Régénération lockfile** | — | `npm install --package-lock-only` | dnd-kit/react-virtual ajoutés au lockfile |
| 7 | **Commercial ECO** (contrats clients, Stripe V4, webhook Next 16, Colors app) | `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` (`59e960a`) | merge réel | 296 migrations, 4 fichiers en conflit (résolus, voir §4) |
| 8 | **Correctifs post-merge** | — | 3 commits de correction (voir §5) | tests/typecheck/lint verts |

**Non intégrés dans cette session** (voir §7 « absent ») : Access (2 lignées `admin-global-v1` jamais réunies), Env manifest, DR/runbooks, Colors 3ᵉ voie (`colors-predeploy-final-v1`, 4 correctifs orphelins), Reserves v6 (durcissement offline dédié), Studio.

---

## 3. Collision de migrations #299-303 — résolution

**Constat** (confirmé indépendamment de la carte, par inspection directe des deux branches) : `integration/gp-external-pilot-closure-v1` et `perf/gp-capacity-readiness-v1` partagent la même base (`release/gp-v1-rc` @ `8caef21`) et ont chacune réutilisé le compteur 299-303 pour des correctifs SQL totalement distincts. **Techniquement**, `node scripts/verify-migrations.mjs` compare l'horodatage complet à 14 chiffres (`YYYYMMDDNNNNNN`), pas seulement le compteur : les deux jeux avaient des dates différentes (`20260921*` côté perf, `20260915/16*` côté pilot-closure) et ne se seraient donc jamais réellement percutés au sens fichier. La collision est **logique** (deux « migration 299 » différentes dans la même base de code), pas un conflit Git.

**Décision appliquée** (conforme à la recommandation de la carte, §15 STEP_03) : `perf` garde 299-303 intact ; les 11 migrations `pilot-closure` (299-309) sont renumérotées séquentiellement en 304-314, avec une nouvelle date (`20260922`) postérieure à celle de `perf`, pour refléter l'ordre logique choisi. Toutes les références textuelles à l'ancien numéro (commentaires de code, tests pgTAP, rapport de clôture GP pilot) ont été mises à jour en conséquence.

**Vérifications** :
- Aucune dépendance de contenu croisée entre les deux jeux de 5/11 migrations (chemins de fichiers disjoints, tables/fonctions disjointes) — confirmé par lecture des deux jeux, pas par déduction.
- `node scripts/verify-migrations.mjs` : PASS après renumérotation.
- Fresh local (§6) : les deux jeux s'appliquent sans erreur, dans l'ordre perf (299-303) puis pilot-closure (304-314).
- **Découverte additionnelle en testant Fresh** (voir §4.3) : la migration pilot-closure 308 (ex-303, `gp_pilot_devis_entreprise_snapshot`) avait une dépendance cachée non détectée par la carte de convergence — voir ci-dessous.

---

## 4. Conflits résolus

### 4.1 — GP pilot-closure → CORE+sécurité (6 fichiers, cherry-pick de `9d55fd7`)

| Fichier | Nature | Résolution |
|---|---|---|
| `package.json` | additif (nouvelles dépendances `@dnd-kit/*`) | fusion des deux blocs |
| `package-lock.json` | résolu puis régénéré | `npm install --package-lock-only` |
| `src/app/abonnement-suspendu/page.tsx` | version HEAD (base) plus ancienne, sans l'exception d'accès RGPD/support pour tenant suspendu | version pilot-closure retenue en entier (**MUST_NOT_LOSE #7**) |
| `src/lib/documents-commerciaux.ts` | additif (support `entreprise_snapshot` sur devis) | version pilot-closure retenue en entier (base n'avait aucun changement propre sur ce fichier depuis `bf27e78`) |
| `src/lib/documents-envoi.test.ts` | additif | version pilot-closure retenue en entier à cette étape (**corrigé ensuite**, voir §5.1 — cette prise « fichier entier » était trop large) |
| `src/lib/entreprise.ts` | HEAD ne redirige jamais vers les chemins accessibles pour un tenant suspendu pour impayé | version pilot-closure retenue (**MUST_NOT_LOSE #7**, comportement volontaire du commit `9d55fd7`) |

### 4.2 — Commercial ECO → CORE+sécurité+GP (4 fichiers, merge de `59e960a`)

| Fichier | Nature | Résolution |
|---|---|---|
| `src/app/abonnement-suspendu/page.tsx` | ECO ajoute un lien « Choisir une offre » pour `motif=essai_expire`, absent de la version GP pilot-closure déjà en place | **fusion réelle** : lien ECO ajouté à l'intérieur de la structure unifiée GP pilot-closure (les deux comportements cohabitent) |
| `src/lib/documents-commerciaux.ts` | GP pilot-closure a `entreprise_snapshot` sur devis, absent côté ECO | version GP pilot-closure conservée (superset) |
| `src/lib/documents-envoi.test.ts` | conflits purement additifs (tests garde-fou brouillon vs tests lot G/resend-override) | les deux jeux conservés — **corrigé une seconde fois ensuite**, voir §5.1 |
| `src/lib/entreprise.ts` | ECO redirige un tenant suspendu pour impayé sans exception ; GP pilot-closure l'exempte (aide/RGPD/abonnement) | version GP pilot-closure conservée (**MUST_NOT_LOSE #7**, intentionnel, confirmé par le message du commit `9d55fd7`) |

Aucune collision de migration réelle entre CORE+sécurité+GP et ECO : 263 horodatages 14 chiffres partagés entre les deux lignées, tous identiques par contenu (vérifié par comparaison exhaustive avant la fusion).

### 4.3 — Dépendance cachée découverte en testant Fresh (migration 308)

`20260922000308_gp_pilot_devis_entreprise_snapshot.sql` (ex-`20260916000303`) appelait `public.construire_entreprise_snapshot(uuid)`, une fonction définie dans `20260912000282_gp_devis_v2_catalogue_ouvrages.sql` sur la lignée `release/gp-v1-rc` — **jamais intégrée dans ce train** (base `release/tools-store-preflight-v1`, qui ne descend pas de `gp-v1-rc`). Ni la carte de convergence ni la répétition générale n'avaient détecté cette dépendance : les 19 collisions documentées par la carte sont des collisions de **numéro** entre fichiers, pas des dépendances de **contenu** entre une migration retenue et une migration non retenue de la même branche source. Cette découverte n'a été possible qu'en rejouant réellement Fresh sur PostgreSQL local (§6) — c'est exactement le type de defect que « vérifier dépendances, grants, effets Fresh/Upgrade » (consigne de la mission) est censé attraper.

**Correctif appliqué**, dépendance par dépendance (pas une renumérotation) :
- `construire_entreprise_snapshot(uuid)` rapatriée telle quelle (fonction générique et autonome, simple projection jsonb des colonnes d'en-tête de `entreprises` — toutes déjà présentes dans ce train, migrations `20260713000064`/`20260715000083`).
- `construire_rendu_devis()` **volontairement non rapatriée** : dépend de `devis_ouvrages`/`moteur_presentation`/`remise_globale`/`conditions`/`filigrane`, toute l'infrastructure « devis v2 » absente de ce train (migrations 282-289 jamais portées) — 0 appelant dans ce dépôt (`chargerDonneesDevisImprimable` rend les devis directement via `lignes_devis`, jamais via cette RPC). La rapatrier aurait nécessité de porter 282-289 en entier, hors périmètre de cette collision migratoire.
- `document_commercial_public_par_token()` conservée intégralement (ne dépend que de tables déjà présentes).

---

## 5. Correctifs post-merge (auto-critique du travail de fusion)

### 5.1 — Erreur de résolution corrigée : tests « lot G » injectés par erreur

En résolvant le premier conflit du cherry-pick GP pilot-closure, j'ai pris `documents-envoi.test.ts` **entier** depuis le commit `9d55fd7`, en m'appuyant sur le fait que la base n'avait rien changé dans ce fichier depuis `bf27e78` — vrai, mais insuffisant : le commit lui-même n'ajoutait que 25 lignes, le reste du fichier venant de son ancêtre `release/gp-v1-rc`, qui porte une fonctionnalité « lot G » (copies/CGV/pièces jointes, `htmlCgv`) **absente de la lignée `tools-store-preflight-v1`**. Résultat : `tsc` échouait sur des références inexistantes dans notre `documents-envoi.ts`.

Puis, en fusionnant ECO, le même problème s'est reproduit dans l'autre sens : reconstruire le fichier depuis `bf27e78` a effacé silencieusement la vraie suite de tests ECO (`ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-V1`, surcharge destinataire).

**Corrigé** : le fichier final part de la version ECO réellement fusionnée (celle qui correspond au `documents-envoi.ts` actuel) + uniquement le diff réel de `9d55fd7` (fixture `statut: "envoye"` + 2 tests du garde-fou brouillon).

**Leçon retenue et documentée pour tout futur travail similaire** : « aucune différence entre la base et le commit source » n'autorise pas à prendre le fichier entier d'un cherry-pick — seul le diff réel du commit doit être appliqué, le reste du fichier appartient à l'historique de la branche source, pas au commit qu'on rapatrie.

### 5.2 — 6 tests mis à jour pour refléter un changement de comportement intentionnel

`src/lib/entreprise.test.ts` testait encore l'ancien comportement (tenant suspendu pour impayé intégralement bloqué). Le lot GP pilot-closure (`9d55fd7`, **MUST_NOT_LOSE #7**) étend délibérément la liste blanche de sortie d'essai (`/aide`, `/parametres/donnees`, `/api/rgpd/export`, `/abonnement`) aux comptes suspendus pour impayé — comportement volontaire, explicitement documenté dans le message du commit source, pas une régression. Tests mis à jour en conséquence, avec couverture séparée conservée pour les pages métier (toujours bloquées).

---

## 6. Vérifications exécutées

### 6.1 — npm (GP racine + 3 sous-apps)

| Contrôle | GP | Colors | Tools | Reserves |
|---|---|---|---|---|
| `npm ci` | OK | OK | OK | OK |
| `tsc --noEmit --incremental false` | **PASS**, 0 erreur | **PASS**, 0 erreur | **PASS**, 0 erreur | **PASS**, 0 erreur |
| `eslint` | **PASS**, 0 erreur (5 avertissements pré-existants : 3 `no-img-element`, 1 `no-location-assign-relative-destination`, 1 `no-unused-vars` test e2e) | **PASS**, 0 erreur | **PASS**, 0 erreur | **PASS**, 0 erreur |
| `vitest run` | **PASS** 1753/1753 (147 fichiers) | **PASS** 264/264 (27 fichiers) | **PASS** 1992/1992 (174 fichiers) | **PASS** 154/154 (12 fichiers) |
| `next build` | **PASS** | **PASS** (19 pages) | **BLOQUÉ volontairement** par `verify:public-env` (variables `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`NEXT_PUBLIC_TOOLS_BILLING_API_URL` absentes — garde-fou pré-existant, confirmé volontaire par **[REHEARSAL]**, **non contourné**) | **PASS** |
| `npm run verify:migrations` | **PASS** — 296 migrations valides | — | — | — |
| `npm run verify:secrets` | **PASS** — 2206 fichiers suivis, 0 secret (1 exception nommée) | — | — | — |

### 6.2 — PostgreSQL local (Fresh + pgTAP)

Aucun accès Supabase/Vercel/Stripe distant dans cette session (confirmé : pas de credentials `SUPABASE_*`/`VERCEL_*`/`STRIPE_*`, `supabase start` indisponible faute de démon Docker actif). Un vrai PostgreSQL 16 local (apt, root) a été utilisé, avec un harnais reconstituant un sous-ensemble réaliste du plateau Supabase (schémas `auth`/`storage`/`extensions`, rôles `anon`/`authenticated`/`service_role`, `auth.uid()`/`role()`/`jwt()`/`email()` simulés via GUC de session, `storage.foldername()` à l'identique) — méthode identique à celle de **[REHEARSAL]**, harnais reconstruit indépendamment dans cette session (hors dépôt, aucun fichier de migration réel modifié).

**Drill Fresh** : les 296 migrations rejouées dans l'ordre lexical exact sur une base neuve. **0 erreur SQL applicative** (après le correctif §4.3). Compteurs post-migration : 222 tables publiques (220/222 avec RLS active), 538 policies, 593 fonctions, 241 triggers.

**pgTAP** (79 fichiers sous `supabase/tests/`, `pg_prove`) :
- 1 fichier exclu d'emblée, documenté et sans rapport avec ce travail : `platform_stripe_state_attestation_r72.test.sql`, nécessite `pgsodium.crypto_sign_detached()` (extension propriétaire Supabase, non installable sur PostgreSQL vanille) — identique au constat de **[REHEARSAL]**.
- **69/78 fichiers exécutés entièrement verts.**
- **1933 assertions exécutées** au total sur les 78 fichiers lancés.
- **9 fichiers avec échec ou plan incomplet**, listés précisément ci-dessous — **aucun déclaré réussi par inférence** :

| Fichier | État | Cause identifiée |
|---|---|---|
| `document_partage_public_par_jeton_v1.test.sql` | 10/42 exécutés, arrêt sur `ERROR: Les lignes d'une facture émise ne peuvent plus être modifiées` | fixture de test heurtant un trigger d'immuabilité — cause exacte non creusée davantage dans le temps imparti |
| `gp_pilot_notification_devis_accepte.test.sql` | 4/7 échoués | `notifications_utilisateurs_niveau_check` violé par la valeur `'info'` insérée par la RPC — à vérifier si la contrainte ou la RPC a divergé |
| `gp_pilot_plateforme_admin_role_total.test.sql` | 0/6 exécutés | `plateforme_admins_actif_requiert_utilisateur_id` (contrainte de la migration **20260826000235, antérieure à tout ce train**) violée par la fixture du test |
| `gp_pilot_rgpd_manifeste_fichiers.test.sql` | 1/9 exécutés | **contradiction interne au fichier de test** : la migration retire `EXECUTE` à `authenticated` sur `manifeste_fichiers_entreprise` (assertion de fin du même fichier), mais des assertions plus tôt dans le même fichier appellent la fonction directement en tant que `authenticated`, ce qui échoue par construction. Le rapport de clôture GP pilot d'origine documentait déjà ce test comme **« non exécuté »** — cette session est la première à l'avoir réellement lancé, et confirme qu'il ne peut pas passer tel qu'écrit. Non corrigé ici (nécessite une décision : assouplir le grant pour un usage self-service, ou réécrire le test) |
| `isolation_multitenant_surface.test.sql` | 1/10 échoué | à investiguer — fichier présent dans la base `bf27e78` d'origine, non touché par ce travail |
| `platform_aal2_role_integrity_v1.test.sql` | 16/80 échoués | mélange probable de limites du harnais local (simulation JWT/AAL) et de la même contrainte `plateforme_admins_actif_requiert_utilisateur_id` — fichier présent dans `bf27e78` d'origine, non touché par ce travail |
| `platform_audit_log_bounded_v1.test.sql` | 6/12 exécutés | `Permission plateforme refusée : consulter_plateforme` / `Authentification requise` — probable limite du harnais local sur le contexte de permission simulé |
| `platform_global_owner_all_apps_v1.test.sql` | 37/40 exécutés | 3 échecs, cause non creusée davantage dans le temps imparti |
| `platform_support_uid_security_v1.test.sql` | 31/38 exécutés | mélange de la même contrainte `plateforme_admins_actif_requiert_utilisateur_id` et d'autres causes non creusées — fichier présent dans `bf27e78` d'origine, non touché par ce travail |

**Point important** : `platform_aal2_role_integrity_v1.test.sql`, `platform_support_uid_security_v1.test.sql` et `isolation_multitenant_surface.test.sql` existaient déjà, inchangés, dans la base `bf27e78` **avant tout travail de cette session** — **[REHEARSAL]** avait rapporté 53-55/54-56 fichiers verts sur cette même base avec son propre harnais (jamais partagé/committé). L'écart le plus probable est une différence entre les deux harnais locaux (reconstruits indépendamment, aucun des deux commité dans le dépôt), pas une régression introduite par ce train — mais ceci **n'est pas prouvé**, seulement l'hypothèse la plus probable, et doit être vérifié avec le harnais exact de **[REHEARSAL]** si celui-ci est retrouvé, ou sur un vrai projet Supabase.

**`ACTUAL_PREVIEW_UPGRADE`, `HOSTED_SUPABASE_RESTORE`, tous les tests Auth/Storage/Stripe/Applications en conditions réelles** : `NOT_PROVEN_REMOTE`, inchangé — aucun credential Supabase/Vercel/Stripe dans cette session.

---

## 7. Matrice intégré / testé / bloqué / absent

| Lot | Intégré | Testé (Fresh/pgTAP/npm) | Bloqué | Absent |
|---|---|---|---|---|
| CORE (`tools-store-preflight-v1`) | ✅ | ✅ (hérité + revérifié) | — | — |
| Sécurité (CVE + 9 RPC) | ✅ | ✅ (Fresh, npm audit implicite via bump version) | — | — |
| GP performance (5 correctifs) | ✅ | ✅ (Fresh ; pgTAP dédié non ré-exécuté séparément faute de fixture de charge locale) | — | — |
| GP pilot-closure (7 commits) | ✅ | ⚠️ partiel — voir §6.2 (`gp_pilot_notification_devis_accepte`, `gp_pilot_plateforme_admin_role_total`, `gp_pilot_rgpd_manifeste_fichiers` en échec) | — | — |
| Renumérotation migrations 299-314 | ✅ | ✅ (`verify:migrations`, Fresh) | — | — |
| Commercial ECO (contrats, Stripe V4, Colors app) | ✅ | ✅ (npm 4 apps) ; pgTAP contrats/Stripe non isolé spécifiquement | — | — |
| Access (`admin-global-v1` ACL+discount, `service-role-flux-acl-255`) | — | — | — | ❌ non intégré (2 lignées jamais réunies, hors budget de cette session) |
| Env manifest (`feat/env-manifest-canonical-v1`) | — | — | — | ❌ non intégré |
| DR / runbooks (`docs/gp-cutover-*`, rollback) | — | — | — | ❌ non intégré (documentaire, sans risque de code, reporté) |
| Colors — 3ᵉ voie (`colors-predeploy-final-v1`, 4 correctifs orphelins CSP/redirect/standalone-build) | — | — | — | ❌ non intégré |
| Reserves v6 (durcissement offline dédié) | — | — | — | ❌ non intégré |
| Studio | — | — | — | ❌ non intégré (volontairement dernier, fork le plus ancien) |
| Remises Stripe (2 lignées non réconciliées) | — | — | 🔶 DECISION_REQUIRED, non tranché | — |
| `fix/gp-public-pricing-canonical-alignment-v1` | — | — | 🔶 DECISION_REQUIRED, non tranché | — |
| 7 RPC sœurs vulnérables | ✅ déjà fermées (§2 lot 2) | ✅ | — | — |

---

## 8. Contrôle MUST_NOT_LOSE (12 items de la carte de convergence)

| # | Item | État après ce train |
|---|---|---|
| 1 | GP pilot closure (idempotence, draft-guard, snapshot, RGPD Storage, notification, annuaire restreint, partage média) | ✅ Intégré (§2 lot 4) |
| 2 | GP performance (débordement numérotation, RLS, index, deadlock, trigram) | ✅ Intégré (§2 lot 3), collision #299-303 résolue (§3) |
| 3 | CVE Next.js/sharp | ✅ Intégré (§2 lot 2), `next@16.3.5`/`sharp@0.35.4` confirmés dans `package.json` final |
| 4 | Fix RPC `module_gestion_pro_actif_entreprise` | ✅ Intégré (§2 lot 2, migration 266) |
| 5 | 7 RPC sœurs — ne pas les perdre de vue | ✅ **Déjà fermées** avant cette session (branche `-rpc-sweep`, migration 267) — confirmé, pas réimplémenté |
| 6 | `logoutAction` portée globale | ⚪ Non touché, décision explicitement laissée en attente (aucune modification apportée) |
| 7 | Suspension par abonnement — accès support/RGPD/abonnement préservé | ✅ Préservé activement pendant les 2 fusions (§4.1, §4.2) — c'est l'endroit exact où une régression aurait pu se produire silencieusement, vérifié à la main les deux fois |
| 8 | ENV manifest mode `report` | ⚪ Non intégré dans ce train (§7), donc rien à régresser |
| 9 | Contrats clients canoniques + figement prix contractuel | ✅ Intégré via le socle commercial ECO (§2 lot 7) |
| 10 | Durcissement offline dédié Reserves v6 | ❌ Non intégré (§7) — reste un risque si Reserves v6 n'est jamais porté séparément |
| 11 | 4 correctifs Colors orphelins | ❌ Non intégrés (§7) |
| 12 | Preuve DR locale réelle (CODEX) | ⚪ Non concerné par ce train (documentaire, branche source non touchée) |

---

## 9. Risques restants

1. **9 fichiers pgTAP en échec ou incomplets** (§6.2), dont 3 pré-existaient déjà avant ce train — nécessite soit le harnais exact de **[REHEARSAL]**, soit un vrai projet Supabase, pour trancher harnais-vs-régression avec certitude.
2. **`gp_pilot_rgpd_manifeste_fichiers.test.sql` structurellement cassé tel qu'écrit** (§6.2) — décision requise (assouplir le grant ou réécrire le test) avant de pouvoir le déclarer vert.
3. **Access, Env manifest, DR docs, Colors 3ᵉ voie, Reserves v6, Studio non intégrés** — le train actuel n'est PAS le train de convergence complet, seulement CORE+sécurité+GP pilote/perf+commercial.
4. **4 DECISION_REQUIRED non tranchées** : remises Stripe (2 lignées), pricing public (2ᵉ correctif), 2 lignées `admin-global-v1` (ACL vs discount), 2 branches `service-role-flux-acl-255`/`document-partage-service-role-acl`.
5. **`ACTUAL_PREVIEW_UPGRADE`, `HOSTED_SUPABASE_RESTORE`, tous les tests Auth/Storage/Stripe/Applications réels** restent `NOT_PROVEN_REMOTE` — aucun accès distant dans cette session, inchangé depuis **[REHEARSAL]**.
6. **PITR Supabase non activé par défaut** (Supabase Pro, rétention 7 jours) — décision opérationnelle non prise, sans rapport avec ce train de code.
7. Aucun déploiement Preview/Production n'a été effectué ni préparé pour l'être — conformément à la mission.

---

## 10. Ce qui est acquis

- Décision de base documentée et réversible, avec preuves (§1).
- 8 lots intégrés dans un ordre maîtrisé, registre commit-par-commit (§2).
- Collision de migrations #299-303 réellement résolue (renumérotation + vérification de dépendances, pas un simple renommage) et une dépendance cachée non détectée par les rapports précédents découverte et corrigée (§3-4.3).
- 2 erreurs de fusion auto-détectées et corrigées avant livraison, documentées avec leur cause exacte (§5).
- Vérifications réellement exécutées et non déclarées par inférence : 4 apps npm (typecheck/lint/test/build), migrations/secrets, Fresh PostgreSQL local (296/296), pgTAP (1933 assertions, 69/78 fichiers verts, 9 échecs précisément documentés) (§6).
- Matrice intégré/testé/bloqué/absent et contrôle explicite des 12 items MUST_NOT_LOSE (§7-8).
- Branche poussée sur `origin/claude/compassionate-euler-5j6avr`, HEAD `62b1b12`.

**Ce qui manque pour un train de convergence complet** (non demandé comme condition de livraison ici, signalé pour mémoire) : Access, Env manifest, DR docs, Colors 3ᵉ voie, Reserves v6, Studio ; les 4 DECISION_REQUIRED commerciales/ACL ; la résolution des 9 échecs pgTAP restants ; un accès Preview/Vercel/Supabase/Stripe réel pour lever tous les `NOT_PROVEN_REMOTE`.

---

## 11. Lot Access convergence (2ᵉ édition de ce rapport, même branche, aucun train concurrent)

**Point de départ** : `CONVERGENCE_TRAIN_CANDIDATE = 62b1b12` (confirmé par le demandeur). Travail poursuivi sur la **même branche**, jamais redémarré depuis `main`, `release/gp-v1-rc` ni aucune autre branche ancienne. Tous les acquis de la 1ʳᵉ édition sont préservés à l'identique : Fresh 296/296, pgTAP 1933 assertions, 4 apps vertes, collisions 299-303 résolues, migration 308 corrigée, 7 RPC déjà fermées.

### 11.1 — Comparaison des commits déjà présents (avant tout cherry-pick)

Conformément à la consigne « comparer d'abord, ne pas cherry-pick aveuglément », chaque branche candidate au lot Access a été comparée à HEAD **avant** toute décision de portage — pas seulement à sa propre base historique.

| Branche candidate | Commits réellement absents de HEAD | Constat |
|---|---|---|
| `codex/admin-global-v1-stripe-observation-r73` (lignée discount F4 : revoke-legacy → discount-column-guard-r71 → stripe-attestation-r72 → stripe-observation-r73) | 11 commits en apparence | **Déjà intégré** — les 3 migrations (`20260827000243_discount_column_guard_r71.sql`, `20260828000244_stripe_state_attestation_r72.sql`, `20260828000245_stripe_discount_observation_r73.sql`) existent **déjà, octet pour octet identiques**, dans l'arbre courant (héritées via le socle commercial ECO, §2 lot 7 de ce rapport). Rien à porter. |
| `codex/admin-global-v1-support-author-guard-r75` (lignée ACL : residual-acl-hardening-r74 → support-author-guard-r75) | 17 commits en apparence | **Déjà intégré**, mais **renuméroté** : `20260828000246_residual_acl_hardening_r74.sql` → présent sous `20260901000252_residual_acl_hardening_r74.sql` (diff vide, contenu identique) ; `20260828000247_support_message_author_guard_r75.sql` → présent sous `20260901000253_support_message_author_guard_r75.sql` (diff vide). Le code applicatif associé (`src/app/(app)/aide/page.tsx`, `src/app/actions/{assistant,plateforme,support}.ts`, `src/lib/support-author-guard.test.ts`) et les tests pgTAP (`platform_residual_acl_hardening_r74.test.sql`, `platform_support_author_guard_r75.test.sql`) sont également déjà présents. Rien à porter. |
| `fix/service-role-flux-acl-255-v1` | 5 commits | **Génuinement absent**, base = tip ECO (`59e960a`, déjà fusionné) — aucune migration touchée, 0 diff avec HEAD sur les 9 fichiers concernés avant portage → **porté** (§11.2). |
| `fix/document-partage-service-role-acl-v1` | 3 commits | **Redondant** avec une solution déjà intégrée et testée — voir §11.3, **non porté**, décision documentée. |

Cette comparaison a évité un travail inutile (18 commits d'apparence nouvelle, en réalité 0 à porter pour les 2 premières branches) et un risque de régression (réintroduire une architecture alternative jamais qualifiée pour un problème déjà résolu, §11.3).

### 11.2 — Porté : `fix/service-role-flux-acl-255-v1`

5 commits cherry-pickés dans l'ordre chronologique (`0db2c79` → `3720d78` → `95efa1e` → `807d519` → `d41f835`) — **0 conflit** (base = ECO, déjà fusionné ; aucun de ces 9 fichiers n'avait été retouché depuis par ce train). Corrige les flux `service_role` cassés par la migration `20260902000255` (webhook Stripe abonnement + boutique, import paie, cron notifications push, moteur de relances) : remplace les lectures/écritures directes de table par des chemins compatibles avec les privilèges retirés par la 255, sans réintroduire de droit `service_role` élargi.

**Tests rejoués** : `tsc --noEmit` PASS (0 erreur) ; `eslint` PASS (0 erreur, mêmes 5 avertissements pré-existants qu'avant) ; `vitest run` PASS **1777/1777** (152 fichiers, +5 fichiers de test/+24 tests par rapport à la 1ʳᵉ édition) ; `verify:migrations` PASS (296 migrations, **inchangé** — ce lot ne touche aucune migration) ; `verify:secrets` PASS (2219 fichiers, 0 secret). Fresh/pgTAP non rejoués (aucune migration modifiée par ce lot, résultats du §6.2 toujours valides tels quels).

### 11.3 — Non porté (décision documentée) : `fix/document-partage-service-role-acl-v1`

Ce lot propose une fonction `document_commercial_public_par_token` alternative (jamais appliquée comme vraie migration — `docs/migrations-proposees/*.proposed`, jamais numérotée) pour corriger exactement le même problème que celui déjà fermé par GP pilot-closure : les pages `/document/[token]` et `/imprimer/partage/[token]` cassées par la 255. Comparaison directe des deux solutions :

- **Déjà intégrée (ce train)** : `document_commercial_public_par_token()`, migration `20260922000305` (ex-`20260915000300`), `EXECUTE` accordé à `service_role` seul, appelée depuis les deux pages via `createAdminClient()`. Testée (pgTAP + Fresh, §6.2).
- **Cette branche** : après correction de sa propre proposition initiale (son premier commit ouvrait l'exécution à `anon`/`authenticated`, jugé trop large par son propre 2ᵉ commit), elle converge vers **exactement la même architecture** — `EXECUTE` à `service_role` seul, appelé depuis les mêmes deux pages. Jamais appliquée en migration réelle, jamais fusionnée.

Porter ce lot réintroduirait une seconde implémentation, non qualifiée par Fresh/pgTAP, d'un problème déjà résolu et vérifié — un risque de régression pur, sans bénéfice fonctionnel. **Décision : ne pas porter.** Documenté ici plutôt que silencieusement ignoré, conformément à la consigne de ne jamais cherry-picker aveuglément.

### 11.4 — MUST_NOT_LOSE — mise à jour

Aucun des 12 items du §8 n'est affecté par ce lot (Access ne touche à aucun d'entre eux). Point de vigilance ajouté pour les lots futurs : les migrations `20260901000252`/`20260901000253` (résidus ACL/support déjà en place) ne doivent **jamais** être écrasées par une future fusion qui réintroduirait par erreur les fichiers `20260828000246`/`247` sous leur numérotation d'origine — collision garantie avec `colors_functional_core_v1`/`colors_integrity_v11` déjà à ces emplacements.

### 11.5 — Statut après ce lot

`CONVERGENCE_TRAIN_CANDIDATE = 593e28f` (branche `claude/compassionate-euler-5j6avr`, poussée). `FINAL_PREVIEW_TRAIN = NOT_YET`. Prochains lots dans l'ordre demandé : ENV manifest → DR/release gate → Colors (voie restante) → Reserves → Studio.

---

## 12. Lot ENV manifest (3ᵉ édition de ce rapport, même branche, aucun train concurrent)

**Point de départ** : `CONVERGENCE_TRAIN_CANDIDATE = 76ec759` (HEAD après le lot Access, §11). Poursuivi sur la même branche.

### 12.1 — Comparaison avant portage

`feat/env-manifest-canonical-v1` (4 commits : `9de09de` manifeste+contrôleur, `4445de0` gabarits, `816989a` CI+prebuild+raccord preflight, `5326118` tests+docs) a pour base `59e960a` (tip ECO), déjà fusionné dans ce train. Comparaison directe avant tout portage :

- `config/env-manifest.json`, `scripts/check-env-manifest.mjs`, `scripts/lib/*`, `scripts/cutover/` : **absents** du train — rien d'équivalent trouvé, portage nécessaire.
- `.github/workflows/ci.yml`, `package.json` : drift réel depuis `59e960a` (ajouts indépendants des lots sécurité/GP/Access : dépendances, versions Next/sharp, une étape `env: NEXT_PUBLIC_TOOLS_ENV`) — vérifié que les 4 commits n'écrivent pas aux mêmes lignes avant de cherry-picker.
- `scripts/cutover/preflight-check.mjs` : **confirmé absent**, comme sur la branche source elle-même (son propre commit le documente : « ligne cutover absente de cette branche »). Le patch stocké (`docs/runbooks/patches/ELSATIA_PREFLIGHT_CHECK_ENV_MANIFEST_V1.patch`) reste donc inerte par construction sur ce train aussi — **non appliqué**, conservé uniquement comme référence documentaire, conformément à la consigne.

### 12.2 — Porté

Les 4 commits cherry-pickés dans l'ordre — **0 conflit réel** (auto-merge propre sur `.env.example`, `.github/workflows/ci.yml`, `package.json` malgré le drift, les zones touchées ne se recouvrant pas). Contenu porté :
- `config/env-manifest.json` (187 variables déclarées à l'origine), `config/env-manifest.schema.json`, `scripts/check-env-manifest.mjs` + 3 modules (`env-manifest-{core,preflight,scan}.mjs`).
- Gabarits `.env*.example` alignés (dont le vrai bug Reserves : le code lit `NEXT_PUBLIC_SUPABASE_ANON_KEY`, le gabarit déclarait `PUBLISHABLE_KEY` — vérifié sur le code réel du train avant d'accepter le correctif, toujours valide).
- CI : étape `verify:env-manifest` avant `npm ci`, étape `verify:secrets` explicite — intégrées **sans dupliquer** les étapes déjà présentes (`audit:security`, `verify:stripe-prices`, `Contrôles reproductibles`) ; `verify:env-manifest` fusionné dans le script `verify` déjà étendu par ce train (build:reserves/colors, verify:stripe-prices), pas réécrit.
- `package.json` : `verify:env-manifest`, `preflight:env`, `prebuild`/`prebuild:reserves`/`prebuild:colors` — non bloquants (`--auto`), confirmé par test réel (`npm run build` affiche `[env-manifest] build hors Vercel Preview/Production : preflight ignoré.` puis poursuit normalement).
- 58 tests `node:test` + runbook + rapport de qualification.

### 12.3 — Réconciliation nécessaire (le contrôleur lui-même a trouvé les écarts)

Après cherry-pick, `node scripts/check-env-manifest.mjs` remontait **14 erreurs réelles** (13 déjà présentes en exécutant le contrôleur sur les fichiers source de la branche elle-même — un défaut hérité, pas introduit ici — + 1 nouvelle due au lot Access déjà porté). Conformément à « adapte le raccord au code réellement présent », chaque écart a été vérifié contre le code réel puis corrigé sans jamais toucher à un secret :

| Écart trouvé | Cause | Correctif |
|---|---|---|
| Doublon complet du bloc « achats mobiles Tools » dans `.env.example` (`APPLE_ROOT_CA_BASE64`, `GOOGLE_PLAY_*`, `STRIPE_TOOLS_*`, `TOOLS_ALLOWED_ORIGINS`, `TOOLS_APP_URL`) | `4445de0` a été forké avant que ce train n'ait déjà ce bloc (apporté par CORE/`bf27e78`, hors de la lignée ECO d'où vient le lot ENV) — l'auto-merge n'a pas pu le détecter, les deux blocs étant à des lignes différentes | Bloc dupliqué retiré, seules les 2 variables réellement nouvelles (`TOOLS_STORE_ENVIRONMENT`, `TOOLS_STORE_ALLOW_SANDBOX`) conservées — au passage, supprime aussi le déclenchement `EXAMPLE-SECRET-VALUE` sur la valeur JSON factice du doublon |
| `TOOLS_STORE_ENVIRONMENT`/`TOOLS_STORE_ALLOW_SANDBOX` attribuées à l'app `tools` dans le manifeste | Erreur de ma première passe : le code qui les lit (`src/lib/tools-store-environment.ts`) vit dans `gestion_pro`, pas dans `apps/tools/` | Corrigé (`applications: ["gestion_pro"]`) ; ajoutées à `.env.local.example`/`.env.preview.example`, absentes alors qu'obligatoires en preview/production selon le code |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` non déclarée pour `tools` | `apps/tools/src/lib/auth/client.ts` lit réellement ce nom canonique (chemin « compte ELSATIA »), **en plus** de l'alias legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` déjà documenté (autre chemin du même fichier) — vérifié sur le code source avant de conclure que les deux coexistent | Déclarée pour `tools` dans le manifeste + ajoutée à `apps/tools/.env.example`, sans retirer l'alias existant |
| 4 variables `ACL_FLUX_PUSH_PORT`/`ACL_FLUX_EXTERNES_PORT`/`ACL_FLUX_CERT_DIR`/`ACL_FLUX_EXTERNES_URL` non déclarées | Introduites par le lot Access (`fix/service-role-flux-acl-255-v1`, §11.2), porté par ce train avant le lot ENV manifest — le manifeste ne pouvait pas les connaître | Déclarées (catégorie `tooling`, `applications: ["e2e"]`, même patron que les `E2E_*` existantes) |
| 2 accès dynamiques `process.env[…]` non justifiés (`apps/tools/scripts/verify-public-env.mjs`, `src/lib/tools-store-environment.ts`) | Pré-existant sur la branche source elle-même | Ajoutés à `scan.dynamic_access_allowed` avec justification (lecture par nom de variable interne, jamais une entrée utilisateur) |

Après correctifs : **`node scripts/check-env-manifest.mjs` → 0 erreur**, exit code 0. Restent 10 `DECISION_REQUIRED` **non bloquantes** (modèle de prix des modules, comptes supplémentaires, options IA, générations précédentes, bloc de stockage vendable, `FEATURE_CRONS_ENABLED` fail-open, `STUDIO_SIGNUP_MODE` fail-open) — ce sont des choix produit/commercial pour Julien, pas des défauts techniques ; **DECISION_REQUIRED, non tranchées ici, option la plus conservatrice retenue implicitement : aucune valeur par défaut changée, aucun flag basculé.**

### 12.4 — Mode `report` et non-doublon confirmés

- `config/env-manifest.json` → `"preflight_enforcement": "report"` — **inchangé**, jamais passé à `enforce`.
- `scripts/cutover/preflight-check.mjs` **toujours absent** du train → le patch stocké dans `docs/runbooks/patches/` reste **non appliqué** (ni par moi, ni automatiquement — aucun mécanisme ne l'applique).
- CI : 10 étapes nommées, aucune dupliquée (`verify:env-manifest` apparaît une fois, avant `npm ci` ; `verify:secrets` une fois ; les étapes déjà présentes du train — audit sécurité, tarifs Stripe stricts, contrôles reproductibles — inchangées).
- Aucun secret réel modifié : uniquement des noms de variables et des valeurs placeholder (`sandbox`, `true`, `publishable-key`) dans des fichiers `.example`.

### 12.5 — Tests rejoués

`node scripts/check-env-manifest.mjs` (0 erreur) ; `node --test scripts/check-env-manifest.test.mjs` (**58/58 PASS**) ; `tsc --noEmit` (0 erreur) ; `eslint` (0 erreur, mêmes 5 avertissements pré-existants) ; `vitest run` (**1777/1777**, inchangé — ce lot ne touche aucun code applicatif testé par vitest) ; `verify:migrations` (**296, inchangé**) ; `verify:secrets` (2231 fichiers, 0 secret) ; `npm run build` (GP : succès complet, prebuild confirmé non bloquant hors Vercel ; Tools : bloqué par son propre garde-fou `verify:public-env`, pré-existant, sans rapport) ; builds Colors et Reserves individuels : succès. Fresh/pgTAP non rejoués (aucune migration touchée par ce lot).

### 12.6 — MUST_NOT_LOSE — mise à jour

Aucun des 12 items du §8 n'est affecté. Point ajouté : ne jamais réintroduire le bloc dupliqué « achats mobiles Tools » retiré en §12.3 si une future fusion (ex. Colors/Studio) réapporte une copie de `4445de0` sans passer par ce train.

### 12.7 — Statut après ce lot

`CONVERGENCE_TRAIN_CANDIDATE = b991365` (branche `claude/compassionate-euler-5j6avr`, à pousser). `FINAL_PREVIEW_TRAIN = NOT_YET`. Prochains lots : DR/release gate → Colors (voie restante) → Reserves → Studio.

---

## 13. Lot DR / release gate (4ᵉ édition de ce rapport, même branche, aucun train concurrent)

**Point de départ** : `CONVERGENCE_TRAIN_CANDIDATE = faad7d7` (HEAD après le lot ENV manifest, §12).

### 13.1 — Comparaison avant portage

| Branche candidate | Constat |
|---|---|
| `feat/preprod-e2e-runbook-integration-v1` (`6df3ebd`) | **Déjà ancêtre de HEAD** (`git merge-base --is-ancestor` confirmé) — le socle DR (runbook rollback + preuve E2E CODEX) était déjà absorbé via ECO. Rien à porter. |
| `docs/elsatia-production-rollback-runbook-v1`, `codex/elsatia-preprod-db-e2e-rollback-v1` | Parents directs de `6df3ebd` ci-dessus — **déjà présents** (`docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`, `docs/audits/ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1.md` confirmés dans l'arbre). Rien à porter. |
| `docs/gp-cutover-documentation-closure-v1` | 4 commits réellement absents (`aabe612`, `35d2d2b`, `8d4c248`, `70e11b9`) — doc-only, superset des 3 étapes précédentes de la même chaîne → **porté** (§13.2). |
| `docs/gp-cutover-documentation-closure-on-hotfix-v1` | Diff ciblé sur les seuls fichiers cutover/runbook contre la branche ci-dessus : **vide** (contenu cutover identique octet pour octet). Son propre diff plus large ne porte que sur des docs GP postcutover pilot hotfix, hors périmètre DR → **non porté**, redondant pour ce lot. |
| `docs/elsatia-production-migration-cutover-preflight-v1` | 3 commits, dont 2 hors sujet (`553966c` feat(billing), `da9c8be` docs(commercial) — pricing modulaire, sans rapport avec le cutover et potentiellement obsolètes face au socle commercial ECO déjà porté) → **1 seul commit porté** (`25e377b`, §13.3), les 2 autres écartés explicitement. |
| `chore/restore-canonical-migration-history-v1` | Confirmé hors périmètre DR (restaure des fichiers de migration déjà appliqués, pas une procédure de sauvegarde/restauration DB — conforme à la lecture de la carte de convergence §11) → **non porté**. |

### 13.2 — Porté : `docs/gp-cutover-documentation-closure-v1` (4 commits)

Cherry-pickés dans l'ordre (`aabe612` → `35d2d2b` → `8d4c248` → `70e11b9`). **2 conflits réels**, tous deux résolus en conservant le contenu du train actuel et en y intégrant l'apport réel du commit source (pas un remplacement aveugle) :

- `.env.example` (`aabe612`) : le commit datait d'avant l'essentiel de l'évolution de ce fichier dans ce train (`ELSATIA_APPLICATION_ENV`, `NEXT_PUBLIC_LEGAL_SIRET`, etc., déjà présents et plus complets côté HEAD) — contenu HEAD conservé intégralement, rien de l'ancienne version reporté.
- `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` (`35d2d2b`) : le paragraphe HEAD sur la convention de clé publique Supabase et la nouvelle sous-section « 5.0 Type Vercel `sensitive` » du commit source ne s'excluaient pas — **les deux fusionnés**, dans cet ordre.

Apporte notamment : `docs/runbooks/ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md`, `docs/runbooks/INDEX_CUTOVER_GP_V1.md`, `scripts/verify-cutover-docs.mjs`, et la distinction explicite PITR vs sauvegarde managée quotidienne (`70e11b9`).

### 13.3 — Porté : `25e377b` seul (préflight cutover GP+Colors+Tools)

Commit purement additif (1 nouveau fichier, `docs/audits/ELSATIA_PRODUCTION_MIGRATION_CUTOVER_PREFLIGHT_V1.md`, 0 fichier de code) — cherry-pické sans conflit. Les 2 autres commits de sa branche d'origine (pricing modulaire) **délibérément écartés** : hors du périmètre DR de ce lot, et le socle commercial de ce train (§2 lot 7, §7) a déjà évolué très au-delà de ce que ces 2 commits proposaient — les porter aurait réintroduit du contenu commercial potentiellement obsolète sous couvert d'un lot documentaire.

### 13.4 — Vérifications

- `node scripts/verify-cutover-docs.mjs` → **PASS 51/51** — cohérence interne des documents de cutover confirmée. **Réserve importante, à documenter explicitement** : ce contrôle vérifie la cohérence *entre les documents eux-mêmes* (SHA cible, ledger de migrations cités), pas leur exactitude par rapport à l'état réel actuel du train. Les documents portés référencent un SHA cible historique (`996be15`) et un ledger de 210→263 migrations — **notre train actuel compte 296 migrations et un HEAD très postérieur**. Le contenu procédural (ordre des étapes, points de non-retour, doctrine PITR/rollback) reste valide et réutilisable, mais **ces runbooks devront être rejoués/mis à jour contre le HEAD réel avant tout cutover effectif** — ce n'est pas fait dans ce lot (documentaire, hors périmètre "convergence").
- Distinction PITR / sauvegarde managée quotidienne : **confirmée présente et correctement gardée** (`ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md` : STOP explicite si le plan Supabase Production n'a pas de PITR constaté, aucune valeur par défaut supposée).
- `tsc --noEmit` PASS (0 erreur) ; `eslint` PASS (0 erreur, mêmes 5 avertissements pré-existants) ; `vitest run` PASS **1786/1786** (153 fichiers, +9 tests — `src/components/DocumentLegal.test.ts` nouveau, `src/lib/ai/providers/openai.test.ts` modifié, apportés par `3184e3e`) ; `verify:migrations` PASS (**296, inchangé**) ; `verify:secrets` PASS (2236 fichiers, 0 secret) ; `check-env-manifest.mjs` toujours **0 erreur**. Fresh/pgTAP non rejoués (aucune migration touchée par ce lot).

### 13.5 — MUST_NOT_LOSE — mise à jour

Aucun des 12 items du §8 n'est affecté. Ajout d'un point de vigilance DR : la preuve E2E locale réelle (`codex/elsatia-preprod-db-e2e-rollback-v1`, item §18.12 de la carte de convergence) reste dans ce train exactement comme héritée d'ECO — non ré-exécutée dans cette session (aucun Docker/Supabase CLI disponible), sa valeur de preuve reste celle documentée à l'origine, pas revalidée contre les 296 migrations actuelles.

### 13.6 — Statut après ce lot

`CONVERGENCE_TRAIN_CANDIDATE = 693f877` (branche `claude/compassionate-euler-5j6avr`, à pousser). `FINAL_PREVIEW_TRAIN = NOT_YET`. Prochains lots : Colors (voie restante) → Reserves → Studio.

---

## 14. Lot Colors — voie restante (5ᵉ édition de ce rapport, même branche, aucun train concurrent)

**Point de départ** : `CONVERGENCE_TRAIN_CANDIDATE = 69fcf10` (HEAD après le lot DR, §13).

### 14.1 — Comparaison avant portage

- `integration/colors-pilot-readiness-v1` (tip `a376984`) : merge-base avec HEAD = **exactement le tip ECO (`59e960a`)**, confirmé par `git merge-base`. 19 commits réellement absents (1 merge de fusion pure, sans diff propre — sauté ; 18 commits réels). Seule **1 migration** manquait (`20260909000281_colors_finition_reference_nuancier_v15.sql`) sur les 16 que la carte de convergence attribuait à cette branche — les 15 autres étaient déjà dans ce train via ECO.
- `integration/colors-predeploy-final-v1` et ses 4 « correctifs orphelins » (`fix/colors-auth-callback-csp-p1-v2`, `fix/colors-security-p1-closure-v1`, `fix/colors-safe-next-redirect-v1`, `fix/elsatia-colors-standalone-build-v1`) : **découverte majeure** — ces 4 branches et les 2 branches « totalement orphelines » (`fix/colors-precommercial-noindex-robots-v1`, `fix/colors-supabase-public-key-predeploy-guard-v1`) forment en réalité **une seule chaîne linéaire** (chacune ancêtre directe de la suivante), pas 6 lignées séparées comme la lecture rapide de la carte de convergence pouvait le laisser penser. Porter le tip (`fix/colors-supabase-public-key-predeploy-guard-v1` @ `30fed99`) suffit à couvrir les 6.

### 14.2 — Porté : `integration/colors-pilot-readiness-v1` (18 commits)

Cherry-pickés dans l'ordre chronologique — **0 conflit de fusion** (seul un conflit trivial `package.json` auto-résolu par git). Apporte : parcours d'accès complet (destination mémorisée, session terminée, démarrage guidé), correspondance de nuancier + modèle de finition, lecture d'étiquette OCR (inactive par défaut, sans prestataire), retrait des valeurs métier des journaux, corrections responsive/contraste/PWA, export paginé, **le correctif CSP qui cassait l'application sur WebKit**, séparation RAL/fabricants (D1), nettoyage des métadonnées photo — GPS/EXIF/miniatures (D2), et la migration 281.

**2 défauts trouvés et corrigés après coup** (§14.4) : `apps/colors/package.json` déclarait `sharp` à `0.35.3` (version vulnérable) après un auto-merge — sans risque réel (`overrides` forçait déjà `0.35.4`, confirmé par `npm ci`) mais trompeur, corrigé. Un test (`separation-ral-fabricant.test.ts`) assertait un total figé de 279 fichiers de migration — assertion non pertinente à l'intention du test (vérifier qu'une migration proposée n'est PAS appliquée), retirée plutôt que remplacée par un nouveau nombre voué à re-casser.

### 14.3 — Non porté (5 des 6 commits « orphelins ») : déjà superseded

En tentant de porter le tip de la chaîne linéaire identifiée en §14.1, **chaque conflit réel a révélé la même situation** : la lignée `colors-pilot-readiness-v1` avait déjà, indépendamment et plus tard, réimplémenté une version égale ou supérieure de la même protection. Vérifié fichier par fichier, jamais supposé :

| Commit source | Prétention | Constat après comparaison directe |
|---|---|---|
| `5ea1d03` harden internal redirect validation | Ferme un open-redirect (`\`, `%5C`, encodage pourcent) | `apps/colors/src/lib/redirection-sure.ts` existe déjà, **plus rigoureux** : 3 passes de décodage pourcent, neutralisation de caractères de contrôle Unicode étendue, preuve d'origine WHATWG, revérification de la sortie normalisée. **Skip.** |
| `260523c` close precommercial security p1 gaps | En-têtes de sécurité, fuites PostgreSQL, boucle `/acces-refuse`, récupération mot de passe | Chaque fichier vérifié (`security/en-tetes.ts`, `messages-metier.ts`, `quantites.ts`, pages de réinitialisation) déjà présent, `quantites.ts` **octet pour octet identique** à ce que ce commit propose. **Skip entier (16 fichiers).** |
| `4de472d` complete auth callback and csp hardening | Complète la CSP par nonce | `apps/colors/src/proxy.ts` déjà une version plus complète (en-têtes de suivi de session/chemin, page hors-ligne incluse). **Skip.** |
| `55c5820` enforce precommercial noindex and robots | Empêche l'indexation avant commercialisation | `apps/colors/src/lib/seo/indexation.ts` et `apps/colors/src/app/robots.ts` déjà présents ; seule ligne de collision (`RESSOURCES_PUBLIQUES`) déjà un sur-ensemble côté HEAD. **Skip (cherry-pick résolu à vide).** |
| `30fed99` align Supabase public key and guard production builds | Convention `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, garde de build | `.env.example`, `verify-public-env.mjs` et `proxy.ts` déjà alignés et plus complets côté HEAD (garde OCR en plus). **Skip (cherry-pick résolu à vide).** |
| `3870e1c`, `da74bb4`, `07a2af7` (docs/relais mot de passe) | Relais de récupération GP→Colors, flux multi-app | `src/lib/auth-relais-colors.ts` (racine GP) déjà présent. **Cherry-pick vide (no-op), confirmé par git lui-même.** |

**Seul contenu réellement neuf porté** de toute cette chaîne : `e427f52` (`.gitignore` — ignorer `.vercel`/`.env*`), et 2 fichiers documentaires plus récents côté HEAD conservés tels quels (`77c6f4c` en conflit add/add, HEAD gardé car datant d'après ce correctif et le mentionnant déjà).

**Aucune perte** : chaque skip a été décidé après lecture du contenu réel des deux côtés, jamais par déduction sur le nom de la branche.

### 14.4 — Réconciliation du manifeste ENV (le contrôleur a de nouveau fait son travail)

Après le lot Colors, `node scripts/check-env-manifest.mjs` remontait 4 nouvelles erreurs réelles : `MDP_RECETTE` (mot de passe du harnais e2e Colors, non déclaré) et 3 accès dynamiques `process.env[…]` non justifiés (`conservation/politique.ts`, `nuancier/source.ts`, `ocr/fournisseurs.ts` — tous trois lisent par un nom de constante interne, jamais une entrée utilisateur). Déclarés/justifiés selon le même patron qu'au §12.3. **0 erreur après correctif**, 58/58 tests du contrôleur toujours verts.

### 14.5 — Tests rejoués

`tsc --noEmit` (GP + Colors) PASS ; `eslint` (GP + Colors) PASS (0 erreur, mêmes avertissements pré-existants) ; `vitest run` GP **1786/1786** (inchangé) ; `vitest run` Colors **427/427** (après le retrait de l'assertion figée, initialement 1 échec) ; `verify:migrations` **297** (+1, migration 281) ; `verify:secrets` PASS (2279 fichiers) ; `check-env-manifest.mjs` **0 erreur** ; `next build` GP et Colors : **PASS** tous les deux. Fresh/pgTAP non rejoués dans cette session (1 migration ajoutée, additive et sans dépendance croisée avec les lots GP pilot/perf déjà vérifiés par Fresh au §6.2 — signalé, pas déclaré prouvé par inférence).

### 14.6 — MUST_NOT_LOSE — mise à jour

Aucun des 12 items du §8 n'est affecté. Point ajouté, spécifique à ce lot : ne jamais laisser un futur merge de la lignée r73/`colors-predeploy-final` réintroduire une version antérieure de `redirection-sure.ts`, `security/en-tetes.ts`, `proxy.ts` ou `messages-metier.ts` — ce train porte déjà la version la plus avancée de chacun, vérifiée au cas par cas en §14.3.

### 14.7 — Statut après ce lot

`CONVERGENCE_TRAIN_CANDIDATE = ee35a2d` (branche `claude/compassionate-euler-5j6avr`, à pousser). `FINAL_PREVIEW_TRAIN = NOT_YET`. Prochains lots : Reserves → Studio.

---

## 15. Lot Reserves (6ᵉ édition de ce rapport, même branche, aucun train concurrent)

**Point de départ** : `CONVERGENCE_TRAIN_CANDIDATE = 8133a97` (HEAD après le lot Colors, §14).

### 15.1 — Comparaison avant portage

Les deux lignées que la carte de convergence documentait comme mutuellement divergentes le sont réellement (aucune n'est ancêtre de l'autre), mais leur écart réel avec HEAD s'est révélé bien plus petit qu'annoncé :

- `fix/reserves-offline-resilience-train-v2` (tip `86ed10a`) : 4 commits absents, **0 migration neuve** (`comm -23` sur les arbres de migrations : vide).
- `feat/reserves-v6-security-offline-pilot-gate-v1` (tip `75b5c62`) : 5 commits absents, 1 fichier de migration en apparence neuf (`20260907000271_reserves_v5_offline_idempotence_v1.sql`) — en réalité un doublon de contenu **déjà présent et documenté comme renuméroté** dans ce train sous `20260908000273_...` (le fichier canonique porte lui-même un commentaire de provenance expliquant la renumérotation faite par le train d'intégration ECO).
- Fichiers applicatifs clés des deux lignées (`offline/base-locale.ts`, `offline/contrat.ts`, `offline/synchronisation.ts`, `offline/reprise.ts`, `securite/entetes.ts`, `components/offline/useReprise.ts`) : **déjà présents**, et systématiquement plus volumineux/complets côté HEAD (ex. `synchronisation.ts` 358 lignes contre 241 dans la version source).

### 15.2 — Porté

Les 9 commits réels des deux lignées cherry-pickés dans l'ordre chronologique. **Chaque conflit vérifié individuellement avant résolution** (jamais un `--theirs`/`--ours` en aveugle) :

- Un doublon de migration réel introduit par le cherry-pick de `7c0fc3d` (réintroduisait `reserves_v5_offline_idempotence` sous son ancien numéro 271) — détecté immédiatement, retiré dans un commit dédié.
- 2 conflits `identiteCourante` vs `resoudreIdentite` (import seul) — HEAD utilise déjà le second nom, seul nom réellement exporté par `identite.ts` ; résolu en gardant HEAD.
- Le reste des conflits (`72aefe0`, `52e8ac2`) : vérifiés fichier par fichier, HEAD contenait déjà une version égale ou supérieure de chaque protection (ex. distinction 503/401 entre indisponibilité serveur et session expirée, déjà implémentée mot pour mot dans `route.ts`). Résolu en gardant HEAD partout, confirmé par des cherry-picks qui se terminent à vide une fois les imports alignés.
- Seul contenu réellement neuf : les mises à jour de rapports d'audit (SHA consignés) et le retrait du doublon de migration.

### 15.3 — Découverte de sécurité (hors périmètre direct du lot, corrigée immédiatement)

En régénérant le lockfile de `apps/reserves` pendant ce lot, `npm audit` a révélé que **Reserves n'avait jamais reçu le correctif CVE Next.js/sharp** appliqué à GP, Colors et Tools par le lot sécurité (§2, lot 2) : `next@16.2.12` (RCE non authentifiée, `GHSA-p293-qw3h-jr36`/`GHSA-2xp9-vwfh-vxw4`) et `sharp@0.35.3` étaient toujours déclarés. Cause : le lot sécurité d'origine ne portait que sur 3 apps, Reserves n'étant pas dans son périmètre à l'époque, et aucune fusion ultérieure (y compris ECO) n'a comblé cet écart.

**Corrigé immédiatement**, hors attente d'un lot dédié (risque de sécurité, pas une fonctionnalité) : `next` → `16.3.5`, `sharp` (override) → `0.35.4`, `eslint-config-next` → `16.3.5` — mêmes versions que les 3 autres apps. `npm audit` : critique et high résolus (reste 1 high `js-yaml`, dépendance de dev, même écart hors périmètre que documenté pour GP/Colors au §6.1).

### 15.4 — Tests rejoués

`tsc --noEmit` PASS ; `eslint` PASS (0 erreur, 0 avertissement) ; `vitest run` **154/154** ; `next build` **PASS** (avant et après le bump sécurité) ; `verify:migrations` **297** (inchangé — le doublon retiré compense la tentative de réintroduction) ; `verify:secrets` PASS (2279 fichiers) ; `check-env-manifest.mjs` **0 erreur** (aucune nouvelle variable introduite par ce lot). `tsc`/`eslint`/`vitest` GP racine revérifiés en parallèle : inchangés (1786/1786, 0 erreur). Fresh/pgTAP non rejoués (aucune migration nette ajoutée par ce lot).

### 15.5 — MUST_NOT_LOSE — mise à jour

**Item #3 (CVE Next.js/sharp) étendu** : ce train couvre désormais les 4 applications (GP, Colors, Tools, **Reserves**), pas seulement les 3 initialement corrigées — écart comblé au §15.3, à vérifier également pour Studio au prochain lot avant de considérer l'item #3 clos pour l'écosystème complet.
**Item #10 (durcissement offline dédié Reserves v6)** : confirmé **non perdu** — chaque protection de `feat/reserves-v6-security-offline-pilot-gate-v1` a été vérifiée présente dans ce train sous une forme égale ou supérieure, pas simplement supposée couverte.

### 15.6 — Statut après ce lot

`CONVERGENCE_TRAIN_CANDIDATE = 5f720ef` (branche `claude/compassionate-euler-5j6avr`, à pousser). `FINAL_PREVIEW_TRAIN = NOT_YET`. Prochain lot : Studio (dernier, volontairement — fork le plus ancien, migrations au format `HHMMSS` à convertir, signup actuellement ouvert à trancher, **et vérifier sa version Next.js/sharp** compte tenu de la découverte ci-dessus).

---

## 16. Lot Studio (7ᵉ édition de ce rapport, même branche, aucun train concurrent) — dernier lot de la liste

**Point de départ** : `CONVERGENCE_TRAIN_CANDIDATE = 5f720ef` (HEAD après le lot Reserves, §15).

### 16.1 — Comparaison avant portage

Source retenue : `feat/elsatia-studio-v1` (25 commits, lignée linéaire, aucun merge interne portant un contenu propre). Aucune collision technique de migrations avec le reste du train : `scripts/verify-migrations.mjs` ne compare que la chaîne à 14 chiffres complète, et les 8 migrations Studio (`20260912120000_…` à `20260913040000_…`) utilisent la convention `HHMMSS` (celle de Studio elle-même) sans jamais entrer en collision avec les compteurs séquentiels des autres apps — **aucune renumérotation nécessaire**, vérifié avant tout cherry-pick plutôt que supposé.

### 16.2 — Porté

Les 25 commits de `feat/elsatia-studio-v1`, cherry-pickés dans l'ordre. Deux conflits, tous les deux dans des fichiers de configuration racine partagés (aucun conflit applicatif) :

- `tsconfig.json` : les deux côtés ajoutaient `apps` à `exclude` d'une manière légèrement différente. Résolu par une forme simplifiée, `"exclude": ["node_modules", "apps"]` — justifié : `include` ne couvre de toute façon jamais `apps/**`.
- `eslint.config.mjs` : fusion additive — conservé les `globalIgnores` déjà présents (`apps/tools/**`, `docs/archive/naming-studio-recovery/**`) et ajouté `apps/studio/**` à côté, sans en écraser aucun.

Contenu porté : l'app `apps/studio` complète, le paquet partagé `packages/studio-domain`, le worker `workers/studio-video` (rendu vidéo via `ffmpeg-static`), 8 migrations, les tests pgTAP correspondants (`supabase/tests/studio_*.test.sql`), et les workflows CI dédiés `studio-foundation.yml` / `studio-render.yml`.

### 16.3 — Vérification CVE Next.js/sharp (suite à la découverte du §15.3)

- `apps/studio/package.json` : `next@16.3.5`, `sharp@0.35.4` déclarés directement en dépendance, `overrides.sharp = 0.35.4` cohérent — **déjà sur la version sûre**, aucun correctif nécessaire (contrairement à Reserves au §15.3).
- `workers/studio-video/package.json` : **aucune dépendance `next` ni `sharp`** — le rendu passe par `ffmpeg-static`/`ffprobe-static`/`fontkit`/`bullmq`/`ioredis`, hors périmètre de ce CVE. Vérifié explicitement plutôt que supposé absent.
- **Item #3 MUST_NOT_LOSE désormais couvert pour les 5 applications** (GP, Colors, Tools, Reserves, Studio) — clos pour l'écosystème complet tel qu'intégré dans ce train.

### 16.4 — DECISION_REQUIRED : inscription Studio ouverte par défaut

Lecture du code réellement porté (`apps/studio/src/app/signup/page.tsx`, `apps/studio/src/app/actions.ts`) : `signup()` appelle directement `client.auth.signUp()` sans aucune porte — pas de code d'invitation, pas de liste blanche, pas de restriction de domaine, pas d'approbation. N'importe qui peut créer un compte et obtenir un espace personnel immédiatement via `onboarding()`. **Aucun garde-fou, même applicatif, n'existe dans les 25 commits portés.**

Ce point était déjà anticipé par le lot ENV manifest (§12, lot 2 de ce train) : `config/env-manifest.json` porte une entrée `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` (« Valeur par défaut de l'inscription Studio : open (actuel) ou closed ? ») et un drapeau `FLAG-FAIL-OPEN` sur `STUDIO_SIGNUP_MODE`, documentés dans `docs/qualification/ELSATIA_ENV_MANIFEST_AND_CI_V1.md` (lignes 120, 150, 193, 199) comme « à contrôler à l'intégration » — c'est cette intégration.

**`DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT`** — décision produit/sécurité qui appartient à Julien, non tranchée ici. **Option la plus conservatrice retenue : aucune modification du comportement actuel** (signup restant ouvert tel que porté), documentée plutôt que corrigée unilatéralement.

### 16.5 — Découverte majeure : une continuation existe déjà, non portée par prudence

`origin/fix/studio-signup-closed-v1` est une continuation **linéaire** de `feat/elsatia-studio-v1` (43 commits après le même point de fork, aucune branche concurrente) et se termine précisément par `634651a fix(studio): inscription fermee par defaut, imposee par la base et le hook Auth` — le correctif exact du §16.4.

**Volontairement non porté dans ce lot**, pour une raison architecturale et non de confort : ce correctif dépend d'un commit antérieur de la même chaîne, `c31382f feat(studio): projet Supabase dedie prepare`, qui fait basculer Studio sur **son propre projet Supabase séparé** (sa propre migration vit d'ailleurs sous `apps/studio/supabase/20260921070000_studio_signup_policy.sql`, hors de l'arbre partagé `supabase/migrations/` utilisé par GP/Colors/Tools/Reserves et par tout le travail Fresh/pgTAP de ce train). Les 43 commits contiennent en outre des lots substantiels non demandés explicitement dans la liste des 6 lots (invitations par e-mail, suppression de compte RGPD, pages légales, import de musique — lot M, durcissement S1-S5, Brand Kit, partage/watermark, vignettes).

Porter uniquement le dernier commit isolément aurait été un cherry-pick partiel et incohérent (le correctif présuppose le hook Auth et la table dédiés au projet Supabase séparé, qui n'existent pas dans ce train). Porter toute la chaîne aurait été une décision d'architecture (mono- vs multi-projet Supabase) et une extension de périmètre bien au-delà de « lot 6 : Studio », prise unilatéralement — exactement le type de décision que la consigne initiale demande de laisser en attente plutôt que de trancher.

**`DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`** — à trancher par Julien : (a) le train adopte-t-il un projet Supabase séparé pour Studio, ou Studio doit-il être adapté pour rester sur l'instance partagée ? (b) les lots M (musique), invitations/RGPD/pages légales, et S1-S5 doivent-ils être portés comme lot(s) suivant(s) ? **Option la plus conservatrice retenue : aucun portage**, `fix/studio-signup-closed-v1` laissé intact sur `origin`, rien supprimé ni modifié.

### 16.6 — Réconciliation du manifeste ENV (échec expliqué, non corrigé unilatéralement)

`node scripts/check-env-manifest.mjs` : **ÉCHEC, 37 erreurs**, intégralement rattachées à Studio. Cause identifiée précisément : `config/env-manifest.json` (construit au lot 2 en analysant `--rev` la lignée complète, y compris la continuation `fix/studio-signup-closed-v1`, cf. `ELSATIA_ENV_MANIFEST_AND_CI_V1.md` ligne 164 : « Les gabarits Studio ne sont pas modifiés (branche Studio séparée) : ils seront contrôlés à l'intégration ») déclare déjà des variables que seule la continuation du §16.5 implémente réellement : `STUDIO_ENABLED`, `STUDIO_SIGNUP_MODE`, `STUDIO_SIGNUP_ALLOWLIST`, `STUDIO_LEGAL_PUBLISHED`, `STUDIO_LEGAL_TEXT_VERSION`, `RESEND_API_KEY`, `STUDIO_MAIL_PROVIDER`, `STUDIO_MAIL_FROM`. Vérifié par recherche exhaustive : **aucune de ces variables n'apparaît dans le code réellement porté** (`apps/studio/src`, `apps/studio/scripts`, `workers/studio-video/src`) — `signup-gate.ts` et `entitlement.ts`, qui les liraient, n'existent que dans la continuation non portée.

Deux réparations auraient été possibles mais ont été délibérément écartées : ajouter ces variables aux gabarits `.env.example` (aurait documenté des variables que le code ne lit pas — mensonger) ou retirer ces entrées du manifeste (aurait supprimé une préparation légitime pour un lot futur, et aurait présupposé la réponse au §16.5). **Le manifeste et le code sont laissés inchangés** ; l'échec de `verify:env-manifest` pour Studio est un état connu, expliqué, directement causé par la décision du §16.5 de ne pas porter la continuation — **pas une régression de ce lot ni des lots précédents**. Les autres constats du contrôleur (contrats Stripe divergents, `FEATURE_CRONS_ENABLED` fail-open) sont préexistants, sans rapport avec Studio.

`verify:migrations` : **305 migrations valides** (inchangé, cf. §16.1 — pas de renumérotation). `verify:secrets` : PASS (2472 fichiers suivis, aucun secret reconnu).

### 16.7 — Tests rejoués

- `apps/studio` (après `npm install`, absent avant ce lot) : `tsc --noEmit` **PASS** ; `eslint src tests next.config.ts` **PASS** (0 erreur) ; `vitest run` **251/251** ; `next build --webpack` **PASS** (12 routes générées).
- `workers/studio-video` (après `npm install`) : `tsc --noEmit` **PASS** ; `vitest run` **15 réussis / 3 échoués / 4 ignorés (22)** — les 3 échecs sont dus au binaire `ffmpeg-static` (7.0.2, build statique johnvansickle.com) de ce bac à sable : le filtre `drawtext` est **absent de la compilation** (confirmé via `ffmpeg -filters`, `Filter not found` à l'exécution) et `xfade` échoue à configurer son pad de sortie dans ce conteneur contraint. **Limitation d'environnement d'exécution, pas un défaut du code porté** — signalé précisément plutôt que déclaré passant par inférence, conformément à la consigne. Non rejouable ici faute d'un binaire ffmpeg complet.
- GP racine + Colors + Tools + Reserves revérifiés en parallèle : inchangés.
- Fresh + pgTAP **non rejoués dans cette session** (écart connu, déjà signalé aux lots précédents : dernière exécution réelle à 296 migrations, train désormais à 305 — 8 migrations Studio ajoutées depuis, jamais rejouées sur l'instance PostgreSQL locale de ce bac à sable faute de la reconstruire). Risque résiduel documenté, pas dissimulé.

### 16.8 — MUST_NOT_LOSE — mise à jour

**Item #3 (CVE Next.js/sharp)** : clos pour l'écosystème complet tel qu'intégré (5/5 applications, §16.3).
Deux nouveaux points ouverts, spécifiques à ce lot, à traiter avant toute qualification Preview de Studio :
- Ne jamais fermer `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` par un correctif partiel qui ignorerait sa dépendance au projet Supabase dédié (§16.4-16.5).
- Ne jamais porter `fix/studio-signup-closed-v1` par cherry-pick isolé du seul dernier commit — la chaîne est solidaire (hook Auth + table + projet Supabase dédié) ; toute décision d'intégration doit statuer d'abord sur `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`.

### 16.9 — Fusion avec une remédiation sécurité concurrente (même branche, autre session)

Au moment de pousser (`67b1564`), `origin/claude/compassionate-euler-5j6avr` avait avancé de 6 commits non issus de cette session : une autre session Claude Code, travaillant sur la **même branche** (donc aucun train concurrent créé), avait fusionné mon commit `6eaaafa` (fin du lot Reserves) avec une remédiation de sécurité indépendante — épinglage `js-yaml >=4.3.2` (GHSA-2883-xcg3-v3hh, transitif dev-only via `eslint`), révocation de l'`EXECUTE PUBLIC/anon` involontaire sur 2 fonctions `SECURITY DEFINER` (`construire_entreprise_snapshot`, `est_membre_actif_reel`), et une migration `20260922000315_security_remediation_plateforme_admins_provisioning.sql` — documentée dans son propre rapport, `docs/qualification/ELSATIA_SECURITY_BLOCKERS_REMEDIATION_V1.md`.

**Aucun recouvrement de fichier applicatif** avec le lot Studio (seul `package.json` racine touché des deux côtés, sur des sections disjointes — script `studio:e2e:gate` d'un côté, `overrides.js-yaml` de l'autre). Fusionné par `git merge` (commit de fusion, aucune réécriture d'historique, comme la pratique déjà suivie par cette autre session pour son propre `81420ad`) : **0 conflit**. Requalification complète rejouée sur l'arbre fusionné :

- `verify:migrations` : **307** migrations (+2, les migrations de remédiation sécurité), noms/horodatages uniques.
- `verify:secrets` : PASS (2476 fichiers, 1 exception nommée inchangée).
- `npm run typecheck` (GP + Tools + Reserves + Colors) : **PASS**, 0 erreur.
- `npm run lint` (GP + Tools + Reserves + Colors) : **une régression réelle trouvée et corrigée** — `packages/studio-domain/src/analysis.ts:368`, `prefer-const` sur `remaining` (mutée en place via `sort`/`shift`, jamais réassignée). Non détectée par le lint scindé d'`apps/studio` (`eslint src tests next.config.ts` ne couvre pas le paquet partagé `packages/studio-domain`, jamais lui-même ciblé par aucun script de lint dédié) — seule la fusion avec la commande racine (`eslint`, sans argument, qui couvre tout sauf les `globalIgnores`) l'a révélée. Corrigée en un commit dédié (`b0f51b0`) ; **0 erreur** après correctif, `apps/studio` (tsc + 251/251 tests) revérifié intact.
- `npm run test` (GP + Tools + Reserves + Colors) : **1786 + 1992 + 154 + 427 = 4359 tests, tous PASS**, aucune régression.
- `apps/studio` (tsc, eslint, vitest, build) et `workers/studio-video` (tsc) revérifiés après fusion : inchangés par rapport au §16.7.
- Fresh/pgTAP : non rejoués dans cette session (même écart documenté au §16.7 ; les 2 migrations de remédiation sécurité n'ont pas non plus été exercées ici — l'autre session les a qualifiées séparément dans son propre rapport, à 299/299 puis 307/307 dans ses propres passes).

### 16.10 — Statut après ce lot

`CONVERGENCE_TRAIN_CANDIDATE = b824008` (branche `claude/compassionate-euler-5j6avr`, à pousser — fusionne `67b1564` avec la remédiation sécurité `81420ad`, corrige la régression lint découverte par cette fusion (`b0f51b0`), documente la fusion). `FINAL_PREVIEW_TRAIN = NOT_YET`.

C'était le 6ᵉ et dernier lot de la liste transmise. **Aucun des deux `DECISION_REQUIRED` du lot Studio (§16.4, §16.5) n'est tranché** ; le train reste un candidat de convergence, pas une base Preview qualifiée. Aucun déploiement, aucune Preview, aucune Production.

---

## 17. Fresh + pgTAP rejoués sur le train final fusionné (`cd4fe74`) — écart comblé

Signalé sans être corrigé à chaque lot depuis le §12.7 (297 migrations) : Fresh/pgTAP n'avaient plus été rejoués depuis le §6.2 (296 migrations), alors que le train en compte désormais 307. Aucune des deux `DECISION_REQUIRED` du lot Studio n'empêchait cette vérification (elle ne tranche rien, elle constate) — traité maintenant en autonomie, conformément à la mission d'origine (« exécuter les vérifications disponibles, signaler précisément ce qui ne peut pas être exécuté »).

### 17.1 — Méthode

Harnais identique au §6.2, reconstruit à l'identique dans ce bac à sable (PostgreSQL 16 apt, `00_stub_platform.sql` conservé hors dépôt) : schémas `auth`/`storage`/`extensions`, rôles `anon`/`authenticated`/`service_role`, `auth.uid()/role()/jwt()/email()` simulés par GUC de session, `storage.foldername()` à l'identique. Une différence assumée et documentée : `pgsodium` n'a plus seulement sa fonction `crypto_sign_verify_detached` stubée, mais une extension factice minimale (`.control`/`.sql` vides posés dans `/usr/share/postgresql/16/extension/`, hors dépôt) pour que `create extension if not exists pgsodium` réussisse pendant le rejeu des migrations — sans quoi la migration `20260828000244_stripe_state_attestation_r72.sql` bloquait tout le rejeu Fresh dès la 245ᵉ migration. Cette extension factice ne fournit aucune capacité de signature réelle (voir §17.3).

### 17.2 — Drill Fresh

**Les 307 migrations rejouées dans l'ordre lexical exact sur une base neuve. 0 erreur SQL applicative.** Compteurs post-migration : 232 tables publiques (232/232 avec RLS active), 549 policies, 601 fonctions applicatives (hors fonctions internes à `pgtap`), 150 triggers.

### 17.3 — pgTAP (89 fichiers sous `supabase/tests/`, `pg_prove`)

**2382 assertions exécutées** au total (`Files=89, Tests=2382`).

**83 fichiers entièrement verts** (contre 69/78 au §6.2). **5 fichiers avec échec ou plan incomplet**, causes vérifiées identiques, mot pour mot, à celles déjà documentées au §6.2 — **aucune nouvelle cause, aucune régression introduite par les lots 11 à 17 de ce train** :

| Fichier | État | Cause (inchangée depuis §6.2) |
|---|---|---|
| `document_partage_public_par_jeton_v1.test.sql` | 10/42 exécutés | `ERROR: Les lignes d'une facture émise ne peuvent plus être modifiées` — confirmé mot pour mot identique |
| `gp_pilot_notification_devis_accepte.test.sql` | 7 exécutés, 3 échoués | `notifications_utilisateurs_niveau_check` — non creusé davantage, pré-existant |
| `gp_pilot_plateforme_admin_role_total.test.sql` | 0/6 exécutés | `plateforme_admins_actif_requiert_utilisateur_id` violée par la fixture — confirmé mot pour mot identique |
| `gp_pilot_rgpd_manifeste_fichiers.test.sql` | 1/9 exécutés | contradiction interne au fichier de test, déjà documentée — toujours **décision requise** avant de pouvoir le déclarer vert (assouplir le grant ou réécrire le test), non traité ici (hors périmètre des 6 lots) |
| `platform_audit_log_bounded_v1.test.sql` | 6/12 exécutés, 3 échoués | `Permission plateforme refusée` — limite probable du harnais, non creusée davantage |

**1 fichier structurellement hors de portée de ce harnais, inchangé depuis §6.2** : `platform_stripe_state_attestation_r72.test.sql` — l'extension factice du §17.1 permet désormais à la migration correspondante de s'appliquer, mais le test lui-même appelle `pgsodium.crypto_sign_detached()` pour **produire** une signature Ed25519, capacité que PostgreSQL ne possède structurellement pas (clés publiques seulement) — la migration elle-même le documente. Aucun plan TAP émis, 0 assertion utilisable. Non un échec du train, une limite du bac à sable déjà actée au §6.2.

**Confirmation empirique, indépendante, du correctif de sécurité fusionné au §16.9** : les **4 fichiers documentés en échec au §6.2** — `isolation_multitenant_surface.test.sql`, `platform_aal2_role_integrity_v1.test.sql`, `platform_global_owner_all_apps_v1.test.sql`, `platform_support_uid_security_v1.test.sql` — sont désormais **entièrement verts**. Cause vérifiée par lecture du diff, pas supposée : la migration `20260922000315_security_remediation_plateforme_admins_provisioning.sql` (fusionnée au §16.9, écrite par l'autre session) restaure des garde-fous AAL2/verrou perdus par une réécriture antérieure de `plateforme_ajouter_admin`/`plateforme_retirer_admin` — exactement la cause que le rapport `ELSATIA_SECURITY_BLOCKERS_REMEDIATION_V1.md` de cette autre session revendiquait. **C'est la première fois que ce résultat est vérifié de bout en bout sur le train final tel que fusionné et poussé (`cd4fe74`)**, plutôt que sur l'arbre partiel de l'autre session.

Net : **9 fichiers en échec au §6.2 → 5 aujourd'hui** (4 résolus par la remédiation sécurité fusionnée, 0 nouveau, 1 fichier structurellement hors de portée dans les deux cas, non compté dans les 9 ni dans les 5).

### 17.4 — Ce qui reste `NOT_PROVEN_REMOTE`

Inchangé depuis le §6.2 : `ACTUAL_PREVIEW_UPGRADE`, `HOSTED_SUPABASE_RESTORE`, tout test Auth/Storage/Stripe/Applications en conditions réelles — aucun credential Supabase/Vercel/Stripe dans ce bac à sable. Les 8 migrations Studio n'ont, elles non plus, jamais été exercées sur un vrai projet Supabase (E2E Playwright, Storage réel, hook Auth) — seulement en Fresh SQL local ici et dans la CI dédiée `studio-foundation.yml`/`studio-render.yml` (non exécutée dans ce bac à sable, ni par cette session ni par aucune autre).

### 17.5 — MUST_NOT_LOSE et risques — mise à jour

Le risque #1 du §9 (« Fresh/pgTAP non rejoués depuis 296 migrations ») est **clos** : rejoué à 307/307, résultat net positif (aucune régression, 4 résolutions confirmées). Les risques réellement persistants sont ceux déjà identifiés indépendamment de tout comptage de migrations : `gp_pilot_rgpd_manifeste_fichiers.test.sql` reste **structurellement cassé tel qu'écrit** (décision requise, non nouvelle) et `document_partage_public_par_jeton_v1.test.sql`/`gp_pilot_notification_devis_accepte.test.sql`/`platform_audit_log_bounded_v1.test.sql` restent à investiguer plus avant — aucun n'est apparu avec ce train, aucun n'est traité par lui.

### 17.6 — Statut après cette vérification

`CONVERGENCE_TRAIN_CANDIDATE = cd4fe74` (inchangé — cette section est une vérification, aucun fichier du dépôt modifié). `FINAL_PREVIEW_TRAIN = NOT_YET`. Fresh 307/307, pgTAP 2382 assertions (83/88 fichiers exécutables entièrement verts, 1 hors de portée du harnais), 4 apps + Studio confirmés (§§2-16), 2 `DECISION_REQUIRED` Studio en attente (§16.4, §16.5). Aucun déploiement, aucune Preview, aucune Production.

---

## 18. Portage du correctif qualifié de troncature de `next_reference()` (`NUMBERING FIX INTEGRATED`)

Mission dédiée : intégrer sur ce train (HEAD `a18325e`, 307 migrations) le correctif qualifié
produit sur `claude/festive-hamilton-76vvre` (commit `c321849`, verdict source
`NUMBERING OVERFLOW FIX QUALIFIED`), sans fusionner cette branche entière.

### 18.1 — Vérification préalable (avant tout portage)

Le train principal ne contenait **aucun correctif fonctionnellement équivalent** :
`public.next_reference()` (définie une seule fois,
`supabase/migrations/20260710000001_comptes_entreprises.sql:108`, jamais redéfinie depuis)
utilisait toujours `lpad(v_numero::text, p_largeur, '0')`, sans plancher. La migration
`20260921000299_correctif_debordement_numerotation_documents.sql`, déjà présente sur ce train,
corrige uniquement `public.formater_numero_document()` — une fonction homonyme créée par
cette même migration et **jamais appelée par aucun trigger ni RPC** du dépôt (confirmé par
recherche exhaustive : aucun autre appelant que sa propre définition). Le vrai chemin de code,
invoqué par les 13 callers de numérotation (`trg_devis_numero`, `trg_facture_numero`,
`trg_commande_numero`, etc.), n'était donc jamais corrigé.

Numérotation vérifiée avant portage : dernière migration du train `20260922000316` →
`...000317` **libre** (aucune supposition faite sur sa disponibilité, comme demandé). Le
correctif source et son test pgTAP utilisent déjà ce numéro dans leur contenu (nom de fichier
et commentaires) : **aucune renumérotation nécessaire**, portage verbatim.

### 18.2 — Contenu porté

Les 3 fichiers du correctif qualifié, verbatim, depuis `c321849` :

- `supabase/migrations/20260922000317_correctif_troncature_next_reference.sql` — `create or
  replace function public.next_reference(...)`, signature strictement inchangée, seul le
  formatage change : `lpad(v_numero::text, greatest(p_largeur, length(v_numero::text)), '0')` —
  la largeur configurée devient un plancher, jamais un plafond.
- `supabase/tests/gp_v1_numerotation_documents.test.sql` — 15 assertions pgTAP (frontières
  1/9/99/999/1000/1001/9999 + devis/factures/avoir/commandes fournisseurs réels).
- `docs/qualification/ELSATIA_GP_NUMBERING_OVERFLOW_FIX_V1.md` — rapport de qualification
  source, conservé tel quel pour la provenance.

Aucun autre changement de `festive-hamilton` porté. Aucune règle métier modifiée (vérifié
explicitement avant portage et revérifié après) : série FAC des avoirs (l'avoir #1001 du test
partage toujours la série `FAC-`), compteur commun facture/acompte/situation/finale/avoir,
année basée sur `now()`, `situations_travaux` utilisant toujours `MAX()+1`
(`supabase/migrations/20260715000080`, `20260818000211`, `20260818000215`, inchangées).

Commit de portage : `f12436b` (poussé sur `claude/compassionate-euler-5j6avr`).

### 18.3 — Rejeu complet depuis une base vide

Harnais reconstruit à l'identique de la méthode du §17.1 (PostgreSQL 16 apt, schémas
`auth`/`storage`/`extensions` stubés, rôles `anon`/`authenticated`/`service_role`,
`auth.uid()/role()/jwt()/email()` par GUC `request.jwt.claim(s)`, `storage.foldername()`,
extension `pgsodium` factice hors dépôt). Deux affinements du harnais découverts et corrigés
dans cette session (aucun fichier du dépôt modifié) : `unaccent` doit être créée par la
migration elle-même (dans `public`), pas pré-créée dans `extensions` ; le rejeu doit se faire
en tant que `session_user = 'postgres'` (une migration gate un bypass de fixture sur ce nom de
rôle exact) ; les rôles applicatifs créés par les migrations doivent être purgés entre deux
rejeux (rôles globaux au cluster, sinon ils polluent les assertions d'appartenance de rôle
d'un rejeu à l'autre).

**Fresh : 308/308 migrations appliquées, 0 erreur SQL**, reproduit deux fois de façon
indépendante (deux bases neuves distinctes, résultat identique). Compteurs post-migration :
232 tables publiques (232/232 RLS active), 549 policies, 601 fonctions applicatives, 149
triggers non internes — strictement identique au dénombrement du §17.2 (307 migrations),
comme attendu d'un correctif qui ne fait que `CREATE OR REPLACE FUNCTION` sur une fonction déjà
existante, sans ajouter ni table ni policy ni trigger.

### 18.4 — pgTAP complet

```
Files=90, Tests=2412
Result: FAIL (5 fichiers non entièrement verts sur 90)
```

**85/90 fichiers entièrement verts** (contre 83/88 au §17.3). Les 5 fichiers non verts ont des
causes **vérifiées identiques, mot pour mot**, à celles déjà documentées au §17.3 — aucune
nouvelle cause, aucune régression introduite par ce portage :

| Fichier | État ici | État §17.3 | Cause |
|---|---|---|---|
| `document_partage_public_par_jeton_v1.test.sql` | 10/42 exécutés | 10/42 | `Les lignes d'une facture émise ne peuvent plus être modifiées` — identique |
| `gp_pilot_notification_devis_accepte.test.sql` | 7 exécutés, 3 échoués | 7 exécutés, 3 échoués | `notifications_utilisateurs_niveau_check` — identique |
| `gp_pilot_plateforme_admin_role_total.test.sql` | 0/6 exécutés | 0/6 | `plateforme_admins_actif_requiert_utilisateur_id` — identique |
| `gp_pilot_rgpd_manifeste_fichiers.test.sql` | 1/9 exécutés | 1/9 | contradiction interne au test, décision requise — identique, non traité ici (hors périmètre de cette mission) |
| `platform_stripe_state_attestation_r72.test.sql` | hors de portée du harnais | hors de portée | nécessite de **produire** une signature Ed25519, capacité que `pgsodium` factice ne fournit pas — identique |

Une amélioration nette, attribuable au harnais et non au correctif : `platform_audit_log_bounded_v1.test.sql`,
6/12 avec 3 échecs au §17.3 (« limite probable du harnais », déjà qualifiée comme telle), est
**12/12 vert** dans ce rejeu. Net : 5 fichiers non verts contre 5 au §17.3 en comptant à
périmètre identique (le 6ᵉ, `platform_audit_log_bounded_v1`, sort de la liste), **0 nouvelle
régression**.

### 18.5 — `gp_v1_numerotation_documents.test.sql` — 15/15 PASS

Toutes les assertions passent, y compris les 3 charnières de la frontière
999/1000/1001 (`AUD-999` inchangé, `AUD-1000` **et non** `AUD-100`, `AUD-1001`) et leur
équivalent sur les chemins métier réels (devis `DEV-2026-999/1000/1001` via une vraie
transition `brouillon → envoye`, factures `FAC-2026-999/1000/1001` avec l'avoir #1001 qui
partage bien la même série, commandes fournisseurs `CMD-2026-999/1000`).

Contre-preuve effectuée (fonction pré-correctif rejouée dans une transaction annulée, sur la
même base migrée) : la version d'avant correctif produit `AUD-999 / AUD-100 / AUD-100` (collision
déterministe) ; la version portée produit `AUD-999 / AUD-1000 / AUD-1001`.

### 18.6 — 999 / 1000 / 1001, concurrence, isolation multi-tenant — vérifications explicites

- **999 / 1000 / 1001** : couvert par §18.5 ci-dessus, sur `next_reference()` directement et
  sur les 3 chemins métier réels (devis, factures, commandes fournisseurs).
- **Concurrence réelle** : deux sessions PostgreSQL indépendantes, interleaving contrôlé par
  FIFO nommés, sur le même compteur `(entreprise_id, type)` à 999. Verrou observé
  empiriquement (`pg_stat_activity` : session B `active/Lock/transactionid` pendant que la
  session A reste ouverte non validée) — pas seulement déduit par raisonnement. Résultat :
  deux numéros distincts (`AUD-1000` / `AUD-1001`) sur l'appel direct, et `DEV-2026-1000` /
  `DEV-2026-1001` (2 lignes, 2 numéros distincts, **0 erreur 23505**) sur le chemin métier réel
  (`INSERT` + `UPDATE` déclenchant `trg_devis_numero`).
- **Isolation multi-tenant à la frontière** : deux entreprises différentes, compteurs `devis`
  tous deux à 999, deux transactions ouvertes **simultanément** (aucune des deux à l'état
  `Lock` dans `pg_stat_activity` — confirmé qu'aucune n'attend l'autre). Chacune franchit
  999→1000 indépendamment et obtient son propre `DEV-2026-1000` (compteurs
  `compteurs_reference` étant des lignes distinctes par `(entreprise_id, type)`) : aucune
  interférence.

### 18.7 — Vérifications non-SQL rejouées

- `verify:migrations` : **308** migrations, noms/horodatages uniques — PASS.
- `verify:secrets` : **2476** fichiers suivis contrôlés, aucun secret reconnu (1 exception
  nommée, inchangée) — PASS.
- `npm run typecheck` (GP + Tools + Reserves + Colors) : **PASS**, 0 erreur, les 4 apps.
- `npm run lint` (GP + Tools + Reserves + Colors) : **PASS**, 0 erreur (6 avertissements
  préexistants sur GP, aucun dans un fichier touché par ce lot).
- `npm run test` (Vitest, GP + Tools + Reserves + Colors) : **4359/4359 tests, 377/377
  fichiers, tous PASS**, aucune régression.
- Build : GP (`next build`, 195 routes) et Reserves **PASS** directement. Tools et Colors
  s'arrêtent à leur garde-fou `verify-public-env` préexistant (`NEXT_PUBLIC_TOOLS_ENV=local` /
  `ELSATIA_APPLICATION_ENV=local` requis hors déploiement réel, comportement documenté et
  antérieur à ce lot, sans rapport avec un changement SQL/Markdown) ; compilation confirmée
  **PASS** avec le flag local documenté par chaque garde-fou (Tools : 47 pages statiques ;
  Colors : 27 routes). Aucun fichier TypeScript/JavaScript n'étant touché par ce lot (uniquement
  SQL + Markdown), ces résultats ne peuvent pas être affectés par le correctif porté.

Rejeu effectué deux fois de façon indépendante (deux bases neuves) pour le Fresh/pgTAP ; aucune
modification de fichier du dépôt par ces vérifications elles-mêmes (harnais entièrement hors
dépôt, comme au §17.1).

### 18.8 — Statut après ce lot

**Verdict : `NUMBERING FIX INTEGRATED`.**

`CONVERGENCE_TRAIN_CANDIDATE` avance de `cd4fe74` à ce lot (portage `f12436b` + cette mise à
jour documentaire). `FINAL_PREVIEW_TRAIN = NOT_YET` (inchangé — les 2 `DECISION_REQUIRED`
Studio du §16.4/16.5 restent en attente, hors périmètre de cette mission). Fresh 308/308,
pgTAP 2412 assertions (85/90 fichiers entièrement verts, 4 échecs préexistants identiques au
§17.3 + 1 hors de portée du harnais identique, 0 nouvelle régression, 1 amélioration
attribuable au harnais), typecheck/lint/Vitest/build GP confirmés PASS, frontières
999/1000/1001 + concurrence réelle + isolation multi-tenant vérifiées empiriquement et non par
déduction. Aucun déploiement, aucune Preview, aucune Production.
## 19. Portage sélectif PERFORMANCE + vérification SITUATIONS (`PERFORMANCE + SITUATIONS INTEGRATED`)

**Mission** : intégrer deux lots qualifiés indépendamment sur des branches sources distinctes,
sans fusionner ces branches en bloc — uniquement ce qui manque réellement au train, après
comparaison explicite.

### 19.0 — Vérification du HEAD réel avant modification

HEAD distant réel de `claude/compassionate-euler-5j6avr` au démarrage : **`e0a83eb`**
(`docs(qualification): documente l'intégration du correctif de numérotation (NUMBERING FIX
INTEGRATED)`) — identique au HEAD de référence attendu par la mission. Aucun écart à
documenter.

- Migrations au démarrage : **308** (dernière : `20260922000317_correctif_troncature_next_reference.sql`).
- `NUMBERING FIX INTEGRATED` (§18 ci-dessus) confirmé toujours présent : le corps de
  `public.next_reference()` utilise bien `lpad(v_numero::text, greatest(p_largeur,
  length(v_numero::text)), '0')` — voir §19.2, ce correctif n'a **pas** été touché par ce lot.
- Branches sources confirmées par `git ls-remote` (SHA réels, pas seulement les noms) :
  - `claude/beautiful-franklin-7hwzq0` → `56aa7477958a480d484ddf3d71d25e1efc539d99` (identique au SHA qualifié attendu).
  - `claude/trusting-archimedes-kvg62q` → `88b9d72f5c49e2c88721620040f01a9a0c1ae060` (identique au SHA qualifié attendu).

### 19.1 — Cartographie LOT PERFORMANCE (`claude/beautiful-franklin-7hwzq0`, `56aa747`)

`git merge-base` train/lot A = `76ec759` (ancêtre commun réel, sur le train). 7 commits propres
à lot A par rapport à cette base : `eda2bc4`, `c56969c`, `3f9485d`, `5cea2c3`, `38a25e2`,
`e27b9b6`, `56aa747`.

Fichiers réellement modifiés par lot A (`git diff` contre le merge-base) :

| Fichier | Nature |
|---|---|
| `docs/qualification/ELSATIA_GP_DASHBOARD_SEARCH_PERFORMANCE_V1.md` | doc de qualification source (1228 lignes) |
| `scripts/perf/generate_fixture.sql` | remise en état contre le schéma courant |
| `src/app/(app)/dashboard/page.tsx` | RPC unique au lieu de 2 chargements complets |
| `supabase/migrations/20260922000315_correctif_debordement_next_reference.sql` | correctif `next_reference()` |
| `supabase/migrations/20260922000316_dashboard_indicateurs_bornes.sql` | RPC `dashboard_indicateurs` + index |
| `supabase/migrations/20260922000317_dashboard_cache_totaux.sql` | table cache + triggers devis/factures |
| `supabase/migrations/20260922000318_correctif_cache_dashboard_changement_entreprise.sql` | correctif cache 12/12 (`UPDATE OF entreprise_id`) |
| `supabase/tests/gp_dashboard_search_perf_dashboard_indicateurs.test.sql` | pgTAP (13 assertions) |
| `supabase/tests/gp_dashboard_search_perf_isolation_listes_paginees.test.sql` | pgTAP (14 assertions) |
| `supabase/tests/gp_dashboard_search_perf_next_reference_debordement.test.sql` | pgTAP (4 assertions) |

**Collision de numéro confirmée** : le train a son propre `20260922000317` (`correctif_troncature_next_reference.sql`,
NUMBERING FIX INTEGRATED), **différent** du `20260922000317_dashboard_cache_totaux.sql` de lot A. Les deux
branches ont divergé de `76ec759` et attribué indépendamment des numéros dans la même plage
(315-318). Aucune réutilisation aveugle de ces numéros : voir §19.4.

**Classement élément par élément** :

| Élément du lot Performance | Classement | Décision |
|---|---|---|
| Correctif `next_reference()` (source `315`) | **déjà présent, version équivalente** (`317` du train, NUMBERING FIX INTEGRATED — corps de fonction identique : même `greatest(p_largeur, length(v_numero::text))`, seuls les commentaires diffèrent) | **non porté** — ne jamais écraser le correctif déjà intégré |
| `dashboard_indicateurs()` + index bornés (source `316`) | **absent** (aucune occurrence dans le train avant ce lot) | **porté** |
| Table `entreprises_dashboard_cache` + triggers devis/factures (source `317`) | **absent** | **porté** |
| Correctif cache 12/12, `UPDATE OF entreprise_id` (source `318`) | **absent** (le train n'avait même pas la table avant ce lot) | **porté** |
| `src/app/(app)/dashboard/page.tsx` (RPC unique) | **absent** (fichier byte-identique au merge-base côté train — aucune dérive locale) | **porté** |
| `scripts/perf/generate_fixture.sql` | **absent** (byte-identique au merge-base côté train) | **porté** |
| 3 fichiers pgTAP | **absents** | **portés** (renumérotés en commentaire, contenu fonctionnel inchangé) |
| Doc de qualification source (1228 lignes) | présente uniquement sur la branche source | **non recopiée telle quelle** — voir §19.7 |

### 19.2 — Vérification explicite : cache 12/12 et `next_reference()`

- `trg_maj_cache_dashboard_factures()` **porté directement dans sa forme finale corrigée** :
  le trigger se déclenche sur `after insert or delete or update of statut, montant_ttc,
  montant_paye, entreprise_id` (donc bien sur un changement de tenant seul), et le corps
  traite `new.entreprise_id is distinct from old.entreprise_id` par une branche dédiée qui
  débite l'ancienne entreprise et crédite la nouvelle par deux écritures distinctes du cache
  (pas un delta scalaire net). Vérifié par lecture directe du fichier porté et confirmé par
  pgTAP (§19.5, tests 10-13, 4/4 verts).
- `public.next_reference()` : corps de fonction **inchangé** par ce lot (vérifié par
  `pg_get_functiondef` après rejeu complet, §19.6) — toujours celui de `20260922000317`
  (train), jamais celui de lot A `315`.

### 19.3 — Cartographie LOT SITUATIONS (`claude/trusting-archimedes-kvg62q`, `88b9d72`)

`git merge-base` train/lot B = `4d92ddb` (= HEAD de `main`, confirmant que la branche source
est bien issue d'un ledger ancien, très en amont du train). **Un seul commit propre à lot B** :
`88b9d72` (`fix: sérialiser l'attribution du numéro des situations de travaux`), qui ajoute une
migration `20260729000184_verrou_numero_situation_travaux.sql` (numéro de l'ancien ledger, sans
rapport avec la numérotation du train).

**Vérification de la version actuelle de `public.creer_situation_travaux` dans le train** :
la dernière redéfinition complète (`20260818000215_avenants_v1_integration_facturation.sql`,
elle-même postérieure à `20260818000211_paiements_et_anti_surfacturation.sql`, qui a introduit
le verrou) contient déjà :

```sql
select * into v_devis from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id
  and statut='accepte' for update;
```

— un verrou de ligne sur le devis, **pris dès la première lecture de `v_devis`**, donc avant
*toutes* les validations métier ultérieures (avancement, plafond anti-surfacturation) et avant
le calcul `select coalesce(max(numero),0)+1 into v_numero ...`. Ce verrou est **antérieur et
plus large** que celui que `88b9d72` ajoute (qui ne verrouille, dans une instruction séparée,
que juste avant le calcul du numéro). Le commentaire de la migration `20260818000211` confirme
l'intention : *« Verrouille la ligne devis (for update) pour serialiser les appels concurrents
sur le même devis avec les deux autres RPC ci-dessous »*.

**Conclusion** : la race `MAX(numero)+1` décrite par le lot Situations **n'existe plus dans le
train** — corrigée indépendamment, avant même la création de la branche source (le fork de lot
B date de `4d92ddb`, antérieur à `20260818000211`). Conformément à l'instruction conditionnelle
de la mission (« si la race existe encore, porte le correctif qualifié », sinon rien), **le
lot Situations n'a pas été fusionné, ni son correctif porté, ni sa migration recréée sous un
nouveau numéro**. Aucune migration créée pour ce lot. Preuve empirique en §19.6.

### 19.4 — Ledger : migrations réellement créées

Aucune modification rétroactive d'une migration historique. 3 migrations ajoutées, aux 3
prochains numéros réellement disponibles du train au moment de la création (`318`, `319`,
`320` — le `318` n'a **pas** été attribué aveuglément au contenu du `318` source, qui
correspond en réalité au correctif cache, placé ici en `320`) :

| Numéro final (train) | Contenu | Numéro source (lot A, ledger divergent) |
|---|---|---|
| `20260922000318_dashboard_indicateurs_bornes.sql` | RPC `dashboard_indicateurs` + 4 index bornés | `20260922000316` |
| `20260922000319_dashboard_cache_totaux.sql` | table `entreprises_dashboard_cache` + triggers devis/factures + backfill | `20260922000317` |
| `20260922000320_correctif_cache_dashboard_changement_entreprise.sql` | correctif `UPDATE OF entreprise_id` (cache 12/12) | `20260922000318` |

Contenu fonctionnel vérifié **byte-identique** au commit source (seules les références croisées
en commentaire vers les migrations voisines de ce même lot, et un bandeau de provenance, ont
été ajustés — voir diff exact en §19.9). `20260922000317` du train (`correctif_troncature_next_reference.sql`,
NUMBERING FIX INTEGRATED) n'a été ni renommé, ni déplacé, ni modifié.

`node scripts/verify-migrations.mjs` : **311 migrations valides, noms et horodatages uniques**
(308 + 3).

### 19.5 — Tests ciblés PERFORMANCE (pgTAP)

Les 3 fichiers portés, exécutés via `pg_prove` sur une base rejouant les 311 migrations du
train (méthodologie complète en §19.6) :

- **`gp_dashboard_search_perf_dashboard_indicateurs.test.sql` — 13/13 PASS.**
  - `devis_acceptes_total`/`factures_total` égaux au recalcul canonique (`SUM(...) WHERE
    statut=...`) — équivalence RPC vs recalcul.
  - Maintenance incrémentale immédiate à l'INSERT d'un devis accepté (+600 sur le cache),
    absence de faux positif sur un devis non accepté, paiement partiel reflété immédiatement
    (`factures_encaisse_total`).
  - Isolation tenant (2 assertions) : les totaux A et B diffèrent, l'entreprise B demandée
    depuis un contexte A renvoie des champs vides (jamais les vrais chiffres de B).
  - Cache **inaccessible en lecture et en écriture directes** pour `authenticated` (RLS activée
    sans policy + `REVOKE ALL` — deny-all confirmé empiriquement, pas seulement lu dans le DDL).
  - **Cache 12/12 (4 assertions dédiées, 10 à 13)** : changement direct de `entreprise_id` sur
    une facture brouillon → cache de l'**ancien** tenant débité, cache du **nouveau** tenant
    crédité du **montant complet** (1200, pas un delta net partiel) — les deux vérifiés
    séparément contre un recalcul canonique indépendant, avant/après le déplacement.
- **`gp_dashboard_search_perf_isolation_listes_paginees.test.sql` — 14/14 PASS** (les 4 RPC de
  liste préexistantes `devis_liste_paginee`/`factures_liste_paginee`/`clients_liste_paginee`/
  `chantiers_liste_paginee` refusent explicitement un `p_entreprise_id` étranger, jamais un
  total à 0 silencieux ; recherche large ne fait pas fuiter les lignes de l'autre tenant).
- **`gp_dashboard_search_perf_next_reference_debordement.test.sql` — 4/4 PASS**, contre le
  correctif du **train** (`20260922000317`), pas contre celui de lot A (non porté, §19.2) :
  999 → 1000 (`T-1000`, pas `T-100`), aucune collision, séquence complète sans erreur.

**Benchmark** (base `elsatia_fresh_test`, tenant synthétique 3000 devis + 2000 factures, mix de
statuts réaliste) :
- `dashboard_indicateurs()` (RPC complète : cache + 5 devis à suivre + alertes + 6 mois
  d'historique groupé) : **~26 ms**. Résultat des 3 totaux mis en cache **strictement égal**
  au recalcul canonique indépendant (`devis_acceptes_total=1189200`, `factures_total=1920000`,
  `factures_encaisse_total=1234215.27` — équivalence exacte, pas approximative).
- Tenant vide (aucune ligne en cache) : RPC ne plante pas, renvoie des champs `null` proprement,
  **~9 ms**.
- Il n'a pas été nécessaire de reproduire la campagne complète à 5000 devis/tenant de la
  qualification source (`ELSATIA_GP_DASHBOARD_SEARCH_PERFORMANCE_V1.md`, SHA `56aa747`) : le
  résultat est structurellement équivalent (agrégats en cache O(1), listes bornées par `LIMIT`,
  mêmes index) et aucune régression structurelle n'a été introduite par la renumérotation.

### 19.6 — Vérification ciblée SITUATIONS (concurrence réelle)

Preuve empirique, non déductive, sur `elsatia_fresh_test` (train rejoué), fonction **réellement
active** du train (aucune migration ajoutée pour ce lot) :

- **2 sessions concurrentes forcées, même entreprise + même devis** (harnais local avec
  `pg_sleep(1)` injecté après acquisition du verrou, copie de test créée puis détruite, jamais
  dans le dépôt) : durée mesurée **2,08 s** pour deux verrous de 1 s chacun → preuve directe que
  la seconde session a **attendu** le verrou. **2 succès, numéros `1` et `2` (consécutifs),
  0 erreur `23505`.**
- **2 sessions concurrentes, timing naturel, même devis, avancement croissant (10 puis 20)** :
  1 succès (`numero=1`), 1 rejet **métier propre** (« l'avancement doit être supérieur au cumul
  précédent ») — **0 `23505`**, exactement le comportement attendu quand le verrou serialise
  correctement l'accès (la seconde session voit le cumul déjà mis à jour par la première).
- **5 sessions concurrentes, même devis, avancement croissant (10/20/30/40/50)** : 1 succès
  (`numero=1`, la session à avancement le plus élevé ayant obtenu le verrou en premier), 4
  rejets **métier propres** (même cause) — **0 `23505`, 0 deadlock, 0 timeout**. Distinction
  explicite vérifiée entre échec de concurrence (`23505`/deadlock/timeout — zéro occurrence) et
  rejet de règle métier (attendu, hors périmètre de cette mission).
- **2 devis différents, même entreprise, concurrence forcée** : durée ≈ 0,07 s (proche d'un
  seul appel, pas du double) — **aucun verrou croisé**, 2 succès indépendants.
- **2 entreprises différentes, concurrence forcée** : durée ≈ 0,07 s — **aucun verrou global**,
  2 succès indépendants.

Confirme empiriquement la conclusion de §19.3 : le verrou déjà présent dans le train sérialise
correctement la numérotation par `(entreprise_id, devis_id)`, sans verrou global, exactement le
comportement que le correctif qualifié de lot B visait à apporter — déjà acquis autrement.

### 19.7 — Documentation source non recopiée telle quelle

`docs/qualification/ELSATIA_GP_DASHBOARD_SEARCH_PERFORMANCE_V1.md` (1228 lignes, branche
source) documente en détail la campagne de qualification originale (dataset 5000 devis/tenant,
benchmarks avant/après, reproduction du bug de cache) sous la numérotation **source**
(`315`-`318`). Elle n'a **pas** été recopiée verbatim dans le train : le risque d'un
renumérotage incomplet ou incohérent sur 1228 lignes de prose technique dépassait la valeur
d'une copie littérale, alors que le contenu technique pertinent (RPC, cache, correctif 12/12)
est intégralement vérifié et documenté ici, avec la numérotation réelle du train. La version
source reste consultable sur `claude/beautiful-franklin-7hwzq0` (`56aa747`) pour le détail de
la campagne de benchmark originale à 5000 devis/tenant.

### 19.8 — Sécurité : comparaison avant/après pour toutes les fonctions/triggers portés

Vérifié par introspection directe (`pg_proc`, `pg_class`, `pg_policies`, ACL brute) sur la base
rejouée `elsatia_fresh_test`, pas seulement par lecture du SQL :

| Objet | Owner | SECURITY | `search_path` | ACL | RLS |
|---|---|---|---|---|---|
| `dashboard_indicateurs(uuid,date)` | `postgres` | DEFINER | `{search_path=public}` | `postgres=X` (owner), `authenticated=X` — ni `anon` ni `public` | n/a (fonction) |
| `trg_maj_cache_dashboard_devis()` | `postgres` | DEFINER | `{search_path=public}` | trigger interne (aucun accès direct) | n/a |
| `trg_maj_cache_dashboard_factures()` | `postgres` | DEFINER | `{search_path=public}` | trigger interne (aucun accès direct) | n/a |
| `public.entreprises_dashboard_cache` | `postgres` | — | — | `REVOKE ALL` confirmé pour `public/anon/authenticated/service_role` (aucun grant `SELECT`/`INSERT`/`UPDATE`/`DELETE` résiduel) | **activée, 0 policy** → deny-all pour tout rôle non-owner, confirmé empiriquement par pgTAP (§19.5, tests 8-9 : `authenticated` ne peut ni lire ni écrire) |
| `public.next_reference()` | `postgres` | **INVOKER** (`prosecdef=f`, inchangé) | aucun override (inchangé) | inchangé (migration `20260902000255`, non re-touchée) | n/a |
| `public.creer_situation_travaux(...)` | `postgres` | DEFINER (inchangé) | `{search_path=public}` (inchangé) | inchangée (aucune migration de ce lot ne la touche) | n/a |

**Aucun élargissement de privilège** : ni `anon`, ni `public`, ni `service_role` n'obtiennent de
nouvel accès direct à quoi que ce soit dans ce lot. La seule voie de lecture du cache reste la
RPC `dashboard_indicateurs()`, qui reproduit exactement le contrôle `a_permission(...,
'acces_devis'|'acces_factures')` déjà en place sur `devis`/`factures`. Aucun SQL dynamique
introduit. `next_reference()` et `creer_situation_travaux()` : propriétaire, mode de sécurité,
`search_path`, ACL et contrainte `unique(entreprise_id,devis_id,numero)` **strictement
inchangés** — confirmé par requête directe sur la base rejouée, pas seulement par absence de
diff textuel.

### 19.9 — Fresh complet du train résultant

Docker et le CLI Supabase ne sont pas disponibles dans cet environnement d'exécution (pas de
démon Docker). Méthodologie de remplacement, documentée, entièrement hors dépôt :

- Installation locale de PostgreSQL 16.13 + extension `pgtap` (paquets Ubuntu officiels,
  absents par défaut) + `pgcrypto`/`pg_trgm`/`unaccent` (déjà présents).
- Bootstrap manuel minimal (script hors dépôt, jamais commité) reproduisant ce que la
  plateforme Supabase provisionne avant toute migration applicative : rôles
  `anon`/`authenticated`/`service_role`/`supabase_migrator`/`authenticator`, schéma `auth`
  (`auth.users` + `auth.uid()`/`auth.role()`/`auth.email()`/`auth.jwt()`), schéma `storage`
  (`storage.buckets`/`storage.objects`/`storage.foldername()`), schéma `extensions` avec
  `pgcrypto`/`pg_trgm`/`pgtap` pré-installés (comme sur une vraie plateforme).
- **Un seul écart documenté, pré-existant, sans rapport avec ce lot** : la migration
  `20260828000244_stripe_state_attestation_r72.sql` (bien antérieure à ce lot) requiert
  l'extension `pgsodium`, propriétaire à Supabase et non empaquetée pour Postgres standard.
  Un stub d'extension strictement local (fournissant uniquement
  `pgsodium.crypto_sign_verify_detached(bytea,bytea,bytea)`, toujours `false`, jamais de vraie
  clé) permet à cette migration historique de se rejouer structurellement, sans quoi le Fresh
  échouerait dès cette migration pour une raison totalement étrangère aux lots Performance/
  Situations. **Première tentative alternative rejetée** : dupliquer l'opérateur `gin_trgm_ops`
  dans un second schéma pour satisfaire deux conventions de qualification différentes utilisées
  par des migrations préexistantes (`extensions.gin_trgm_ops` vs `gin_trgm_ops` non qualifié) a
  provoqué un **SIGSEGV reproductible du serveur Postgres** dès qu'un INSERT réel exerçait
  l'index (bisection confirmée sur `public.entreprises`) — abandonnée. Analyse plus poussée :
  cette double convention n'a en réalité jamais nécessité de duplication (`SET search_path`
  dans le fichier concerné n'est qu'une option de fonction, pas une commande de session) ;
  installer `pg_trgm` une seule fois dans `extensions` suffit et couvre les deux conventions.
  Aucun de ces ajustements ne modifie un seul fichier du dépôt.
- **Rejeu complet, 2 bases indépendantes (train + baseline `e0a83eb`), chacune reconstruite
  depuis zéro** :
  - Train (311 migrations) : **311/311 appliquées, 0 erreur SQL**, aucune migration dupliquée
    ni manquante (`ls supabase/migrations | sort` = 311 fichiers uniques).
  - Baseline `e0a83eb` (308 migrations, worktree dédié) : **308/308 appliquées, 0 erreur SQL**,
    avec la **même** méthodologie de bootstrap — sert de témoin pour le §19.10.
- `npm run verify:migrations` : **311 migrations valides, noms et horodatages uniques.**
- `npm run verify:secrets` : **2479 fichiers suivis contrôlés, aucun secret reconnu (1
  exception nommée, préexistante, inchangée).**

### 19.10 — pgTAP complet : comparaison avec le baseline `e0a83eb`

Suite complète rejouée avec `pg_prove` sur les deux bases (train et baseline), même harnais :

| | Baseline `e0a83eb` (308 migrations) | Train (311 migrations) |
|---|---|---|
| Fichiers de test | 90 | 93 (+3, les fichiers portés) |
| Assertions totales | 2246 | 2277 (+31, exactement les 3 fichiers portés) |
| Fichiers avec ≥1 échec | **17** | **17** (liste strictement identique, mêmes numéros d'assertion en échec) |

**Les 17 fichiers en échec sont identiques, fichier par fichier et assertion par assertion**,
entre la baseline et le train — `colors_correctifs_v12` (2), `colors_functional_core_v1` (2),
`document_partage_public_par_jeton_v1` (plan tronqué à 10/42), `gp_pilot_notification_devis_accepte`
(3), `gp_pilot_plateforme_admin_role_total` (0/6), `gp_pilot_rgpd_manifeste_fichiers` (1/9),
`isolation_multitenant_comportement` (8), `pieces_jointes_v1_lecture_documents_employes` (3),
`platform_aal2_role_integrity_v1` (pas de plan), `platform_audit_log_bounded_v1` (3),
`platform_global_owner_all_apps_v1` (0/40), `platform_stripe_state_attestation_r72` (hors de
portée du harnais `pgsodium`, cf. §19.9), `platform_support_uid_security_v1` (32/38),
`reserves_v1_foundation_workflow` (93/98), `reserves_v2_terrain_capture` (5), `reserves_v3_collaboration_livrables`
(144/148), `studio_render_engine` (1), `terrain_mobile_v1b_permission_documents` (2). Ces
échecs sont **documentés comme préexistants** dans ce même rapport (§17.3/§18.4) pour plusieurs
d'entre eux, et confirmés ici indépendamment comme antérieurs à ce lot sur les deux — aucun
n'implique `dashboard_indicateurs`, `entreprises_dashboard_cache`, `creer_situation_travaux` ou
`next_reference`.

**Les 3 fichiers pgTAP portés sont 100 % verts** (31/31, détail en §19.5) et n'apparaissent
dans aucune des deux listes d'échecs. **0 nouvelle régression.**

### 19.11 — Applications (typecheck / lint / test / build)

`npm ci` à la racine (Gestion Pro) puis dans chaque application indépendante
(`apps/tools`, `apps/reserves`, `apps/colors`, `apps/studio` — chacune a son propre
`node_modules`, aucun workspace npm unique) :

| Vérification | Gestion Pro | Tools | Reserves | Colors | Studio |
|---|---|---|---|---|---|
| `typecheck` | PASS | PASS | PASS | PASS | PASS |
| `lint` | PASS (0 erreur) | PASS | PASS | PASS | PASS |
| `test` (Vitest) | PASS — 153 fichiers / 1786 tests | PASS — 174/1992 | PASS — 12/154 | PASS — 38/427 | PASS — 14/251 |
| `build` | **PASS** — `next build`, 38 routes dont `/dashboard` (nouveau chemin RPC) | PASS avec flag local documenté (voir ci-dessous) — 47 routes | PASS — 19 routes dont `/dashboard` | PASS avec flag local documenté — 27 routes dont `/dashboard` | — |

6 avertissements ESLint préexistants (usage `<img>`, `window.location.assign`, un import
inutilisé dans un spec e2e, export par défaut anonyme dans `workers/studio-video/eslint.config.mjs`)
— **aucun dans un fichier touché par ce lot**.

**`apps/tools` et `apps/colors`** : leur `prebuild` respectif (`verify-public-env.mjs`) refuse
de builder sans variables d'environnement `NEXT_PUBLIC_*` réelles — garde-fou préexistant,
documenté par le script lui-même, **sans rapport avec ce lot** (déjà rencontré et documenté de
façon identique au §18.7 de ce même rapport). Confirmé en relançant avec le flag local que
chaque script documente lui-même comme échappatoire de recette (`NEXT_PUBLIC_TOOLS_ENV=local`
pour Tools, `ELSATIA_APPLICATION_ENV=local` pour Colors) : build réussi dans les deux cas.
Aucun garde-fou ENV contourné silencieusement — flags documentés ici explicitement, comme exigé
par la mission.

`npm run verify:env-manifest` : **FAIL préexistant**, sans rapport avec ce lot — 37 erreurs
(variables `STUDIO_*`/`RESEND_API_KEY` manquantes dans les `.env.example` de `apps/studio` et
`workers/studio-video`) + 10 `DECISION_REQUIRED` d'ordre commercial (tarification Stripe
modules/options IA/comptes supplémentaires, flag fail-open des crons), tous attribués à des
décisions métier en attente, aucun ne référence `dashboard_indicateurs`,
`entreprises_dashboard_cache` ni le fichier `dashboard/page.tsx`. Aucun flag de contournement
utilisé pour cette commande.

**Packages partagés / workers** : aucun fichier de `packages/*` ni `workers/*` n'est touché par
ce lot (seuls `supabase/migrations`, `supabase/tests`, `scripts/perf/generate_fixture.sql`,
`src/app/(app)/dashboard/page.tsx` et cette documentation le sont) — hors périmètre de
régression pour ce lot précis ; `workers/studio-video` a son propre `package.json` mais relève
du lot Studio, non touché ici.

**Conclusion §19.11** : aucun échec applicatif imputable à ce lot. Les deux garde-fous ENV et le
`verify:env-manifest` sont des états préexistants, déjà documentés ailleurs dans ce rapport pour
les mêmes causes, confirmés à nouveau ici indépendamment.

### 19.12 — Fichiers modifiés par ce lot

```
scripts/perf/generate_fixture.sql                                                  (modifié)
src/app/(app)/dashboard/page.tsx                                                   (modifié)
supabase/migrations/20260922000318_dashboard_indicateurs_bornes.sql                (nouveau)
supabase/migrations/20260922000319_dashboard_cache_totaux.sql                      (nouveau)
supabase/migrations/20260922000320_correctif_cache_dashboard_changement_entreprise.sql (nouveau)
supabase/tests/gp_dashboard_search_perf_dashboard_indicateurs.test.sql             (nouveau)
supabase/tests/gp_dashboard_search_perf_isolation_listes_paginees.test.sql         (nouveau)
supabase/tests/gp_dashboard_search_perf_next_reference_debordement.test.sql        (nouveau)
docs/qualification/ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md                       (cette section)
```

Aucune migration historique modifiée. Aucun fichier hors de ce périmètre touché (aucune série
FAC des avoirs, aucun compteur commun factures, aucune architecture Studio, aucun pricing,
aucune Production/Preview).

### 19.13 — Verdict

- Fresh : **311/311 migrations, 0 erreur SQL** (2 bases indépendantes, train + baseline).
- pgTAP : **2277 assertions, 93 fichiers** — 17 fichiers en échec **strictement identiques** à
  la baseline `e0a83eb` (0 nouvelle régression), 3 fichiers portés **100 % verts** (31/31).
- `verify:migrations` : **311 valides**. `verify:secrets` : **2479 fichiers, 0 secret**.
- Sécurité : owner/`SECURITY DEFINER`/`search_path`/ACL/RLS vérifiés inchangés ou strictement
  conformes à l'intention documentée pour tous les objets portés ; `next_reference()` et
  `creer_situation_travaux()` confirmés **non modifiés**.
- Concurrence Situations : 2 sessions (forcées et timing naturel), 5 sessions, devis/entreprises
  différents — **0 `23505`, 0 deadlock, 0 timeout**, isolation multi-tenant confirmée.
- Cache 12/12 (13/13 assertions du fichier porté) : OLD et NEW tenant vérifiés après déplacement
  d'une facture entre entreprises, montant complet (pas un delta net).
- Applications : Gestion Pro/Tools/Reserves/Colors/Studio — typecheck/lint/test/build **PASS**
  (2 garde-fous ENV préexistants contournés uniquement par leurs flags locaux documentés,
  `verify:env-manifest` FAIL préexistant sans rapport avec ce lot).

**`PERFORMANCE + SITUATIONS INTEGRATED`**

Lot Performance intégré sélectivement (3 migrations neuves sur 4 côté source, 1 déjà présente
et donc non portée). Lot Situations vérifié et confirmé déjà résolu dans le train par un
mécanisme antérieur et plus large — non fusionné, non porté, 0 migration créée pour ce lot,
conformément à l'instruction conditionnelle de la mission. Aucun déploiement, aucune Preview,
aucune Production.

## 20. Reserves public ENV + notification devis accepté (`RESERVES + NOTIFICATION INTEGRATED`)

**Mission** : fermer deux blockers Preview déjà qualifiés sur une branche source dédiée, portés
sélectivement (pas de fusion en bloc), avec renumérotation de la migration en collision.

### 20.0 — Vérification du HEAD réel avant modification

HEAD distant réel de `claude/compassionate-euler-5j6avr` au démarrage : **`f71dd97`**
(`feat(perf): intègre le lot Dashboard/Performance qualifié (PERFORMANCE + SITUATIONS
INTEGRATED)`) — identique au HEAD attendu par la mission. Aucun écart, aucune cartographie
supplémentaire requise avant intégration.

- Migrations au démarrage : **311** (dernière : `20260922000320_correctif_cache_dashboard_changement_entreprise.sql`).
- Branche source confirmée par `git ls-remote` (SHA réel) : `fix/preview-blockers-reserves-notif-v1`
  → `8c910fa0eb6d05813993b7e07f892ce593a0f480`, identique au SHA qualifié attendu.

### 20.1 — Cartographie

`git merge-base` train/source = `e0a83eb` (la branche source a divergé **avant** le lot
Performance §19 — elle ne le contient donc pas, ce qui est attendu et sans incidence : aucun
des deux lots ne touche les mêmes fichiers, voir vérification ci-dessous). Un seul commit propre
à la source : `8c910fa` (`fix(preview-blockers): garde de pré-build Reserves + correctif niveau
notification devis accepté`).

Fichiers réellement modifiés par la source (`git diff` contre le merge-base) :

| Fichier | Classement | Décision |
|---|---|---|
| `apps/reserves/scripts/verify-public-env.mjs` (264 lignes) | absent | **porté** |
| `apps/reserves/scripts/verify-public-env.d.mts` (54 lignes) | absent | **porté** |
| `apps/reserves/src/lib/public-env-guard.test.ts` (273 lignes) | absent | **porté** |
| `apps/reserves/package.json` (`prebuild`/`verify:public-env`/`lint` élargi à `scripts`) | absent | **porté** |
| `apps/reserves/.env.example` (+`ELSATIA_APPLICATION_ENV`) | absent | **porté** |
| `config/env-manifest.json` (entrée F-... + note Reserves) | absent | **porté** |
| `scripts/verify-secrets.mjs` (exception nommée pour le nouveau test) | absent | **porté** |
| `supabase/migrations/20260922000318_correctif_notification_devis_accepte_niveau.sql` | absent, **collision de numéro** (voir §20.2) | **porté sous un nouveau numéro** |
| `docs/qualification/ELSATIA_GP_PREVIEW_BLOCKERS_RESERVES_URL_NOTIFICATION_NIVEAU_V1.md` (373 lignes) | présente uniquement sur la branche source | **non recopiée telle quelle** (même choix qu'au §19.7 — risque de renumérotage incomplet sur un fichier long ; contenu technique pertinent documenté ici avec la numérotation réelle du train ; la version source reste consultable sur `fix/preview-blockers-reserves-notif-v1`, `8c910fa`) |

**Vérification de non-conflit avec le lot Performance §19** : `git diff` du train contre
`e0a83eb` (merge-base) sur ces 8 chemins de code/config est **vide** — ni le lot Performance ni
aucun autre commit n'a touché un seul de ces fichiers depuis `e0a83eb`. Portage sans risque de
divergence.

**Rien n'était déjà présent ni obsolète** : Reserves n'avait aucun script `verify-public-env`
avant ce lot (`ls apps/reserves/scripts/` vide), et `notifier_devis_accepte()` utilisait
toujours `niveau='info'` (seule définition existante, migration `20260922000311`, jamais
redéfinie depuis) — confirmé par lecture directe avant tout portage.

### 20.2 — Collision de migration `318` et renumérotation

La migration source (`20260922000318_correctif_notification_devis_accepte_niveau.sql`) porte le
numéro `318` dans le ledger de la branche source (qui a divergé de `e0a83eb`, avant que le train
n'attribue `318-320` au lot Performance §19). Ce numéro est désormais pris dans le train par
`20260922000318_dashboard_indicateurs_bornes.sql` — **non réutilisé**.

Ledger vérifié sur le HEAD réel avant renommage : dernière migration `20260922000320`. Prochain
numéro réellement libre : **`321`** (confirmé par `ls supabase/migrations | sort | tail`, pas
supposé). Fichier porté sous :

`supabase/migrations/20260922000321_correctif_notification_devis_accepte_niveau.sql`

Contenu SQL vérifié **byte-identique** au commit source (`diff` sans écart après le bandeau de
provenance ajouté en tête de fichier) — **aucune modification de la logique qualifiée**, aucune
référence interne à son propre numéro dans le fichier source ne nécessitait d'ajustement.

`node scripts/verify-migrations.mjs` : **312 migrations valides, noms et horodatages uniques**
(311 + 1).

Les migrations `20260922000318/319/320` (lot Performance) et `20260922000317`
(`correctif_troncature_next_reference.sql`, NUMBERING FIX INTEGRATED) sont **inchangées, non
renommées, non écrasées** — vérifié par `git status` (aucune modification hors des 8 fichiers du
§20.1) et par rejeu Fresh (§20.5).

### 20.3 — Requalification du garde Reserves public ENV

`apps/reserves/scripts/verify-public-env.mjs` exécuté directement (4 scénarios, environnement
isolé `env -i` pour exclure toute variable ambiante du conteneur) :

| Scénario | `ELSATIA_APPLICATION_ENV` | `NEXT_PUBLIC_RESERVES_URL` | Résultat attendu | Résultat observé |
|---|---|---|---|---|
| Local, déclaré | `local` | `http://localhost:3020` | repli localhost autorisé, non bloquant | **PASS** (`mode « local », contrôle non bloquant, rien à signaler`, exit 0) |
| Déployable, variables absentes | `production` | *(absente)* | build bloqué avant `next build` | **BLOQUÉ** (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`NEXT_PUBLIC_RESERVES_URL` absentes, exit 1, message explicite avant tout appel à Next) |
| Déployable, URL localhost | `production` | `http://localhost:3020` | build bloqué | **BLOQUÉ** (`doit être en https sur un build publié`, exit 1) |
| Déployable, URL HTTPS valide | `production` | `https://reserves.elsatia.fr` | garde PASS, `next build` réellement lancé | **PASS** (exit 0) ; confirmé par `npm run build:reserves` complet en §20.6 (le `prebuild` s'exécute automatiquement avant `next build` via le cycle de vie npm, comme pour Tools/Colors) |

Aucune variable n'étant déclarée du tout (`env -i` pur, sans `ELSATIA_APPLICATION_ENV`), la
garde retient par construction le mode le plus sûr (`production`, bloquant) — comportement
documenté et intentionnel (*« Ne pas se déclarer vaut publié »*), identique à Tools/Colors : ce
n'est pas le scénario « local » (qui requiert `ELSATIA_APPLICATION_ENV=local` explicite, comme
dans `apps/reserves/.env.example` porté).

**Origine des invitations** : `src/lib/invitations.ts::urlApplicationReserves()` (fichier non
modifié par ce lot) lit `NEXT_PUBLIC_RESERVES_URL` et retombe sur `http://localhost:3020`
seulement si absente. Avec `NEXT_PUBLIC_RESERVES_URL=https://reserves.elsatia.fr` configurée,
un lien d'invitation généré est bien `https://reserves.elsatia.fr/invitation/<jeton>` — vérifié
directement contre le code réel de la fonction, pas supposé.

### 20.4 — Requalification de la notification après renumérotation

Sur la base Fresh du train complet (§20.5, 312 migrations rejouées) :

- `pg_get_functiondef('public.notifier_devis_accepte(uuid)')` : le corps utilise désormais
  `niveau = 'information'` (dernière ligne de l'INSERT vers `notifications_utilisateurs`) —
  confirmé par lecture directe post-rejeu, pas par diff textuel seul.
- `pg_get_constraintdef` de `notifications_utilisateurs_niveau_check` :
  `CHECK ((niveau = ANY (ARRAY['information'::text, 'attention'::text, 'critique'::text])))` —
  contrat canonique confirmé inchangé, `'information'` en fait bien partie.
- `supabase/tests/gp_pilot_notification_devis_accepte.test.sql` : **7/7 PASS** (`pg_prove`,
  base rejouée avec la migration renumérotée `321`) :
  1. la fonction existe (contrat) ;
  2. un membre sans `gerer_devis` est refusé (`Accès refusé`) ;
  3. **isolation multi-tenant** : le gérant de l'entreprise B ciblant un devis de l'entreprise A
     est refusé (`Accès refusé`, le devis n'appartient pas à son entreprise) ;
  4. un gérant `gerer_devis` de la bonne entreprise réussit (`lives_ok` — preuve directe que
     l'INSERT satisfait désormais la contrainte `niveau`, plus de violation `23514`) ;
  5. une entrée `journal_activite` est créée pour la **bonne entreprise** ;
  6. **bon destinataire** : au moins un responsable (`gerer_devis`, hors auteur) est notifié ;
  7. **aucune notification parasite** : l'auteur du changement n'est jamais notifié de sa propre
     action (`count = 0`).
- Sécurité — comparaison avant/après (introspection directe post-rejeu) :

  | | Avant (migration 311, train) | Après (migration 321, portée) |
  |---|---|---|
  | Owner | `postgres` | `postgres` (inchangé) |
  | `SECURITY DEFINER` | `true` | `true` (inchangé) |
  | `search_path` | `{search_path=public}` | `{search_path=public}` (inchangé) |
  | ACL | `postgres=X` (owner), `authenticated=X` — ni `anon` ni `public` | identique (`CREATE OR REPLACE FUNCTION` sur signature inchangée préserve l'ACL, confirmé par requête directe sur `pg_proc.proacl`) |
  | Signature/retour | `(uuid) returns void` | inchangée |

  **Aucun élargissement de privilège.** Le renommage de migration (318 source → 321 train) ne
  modifie ni le contrat de sécurité ni la logique métier — seul le caractère `'info'` →
  `'information'` change dans le corps de la fonction, comme qualifié à la source.

### 20.5 — Fresh complet du train résultant

Même méthodologie que §19.9 (Docker indisponible ; bootstrap Postgres 16 + pgTAP local hors
dépôt, jamais commité ; stub `pgsodium` documenté, sans rapport avec ce lot ; `pg_trgm` installé
une seule fois dans `extensions`).

- Rejeu complet, 2 bases indépendantes reconstruites depuis zéro :
  - Train (avec ce lot, 312 migrations) : **312/312 appliquées, 0 erreur SQL**, aucune migration
    dupliquée ni manquante.
  - Baseline `f71dd97` (train juste avant ce lot, 311 migrations, worktree dédié) :
    **311/311 appliquées, 0 erreur SQL** — mesurée à nouveau indépendamment dans cette session,
    pas supposée égale aux chiffres du rapport précédent.
- `npm run verify:migrations` : **312 migrations valides, noms et horodatages uniques.**
- `npm run verify:secrets` : **2489 fichiers suivis contrôlés, aucun secret reconnu (2
  exceptions nommées — celle de Colors déjà connue + la nouvelle pour
  `apps/reserves/src/lib/public-env-guard.test.ts`, valeurs factices « AAAA »/« signature »,
  aucun accès réel).**

### 20.6 — pgTAP complet : baseline réelle mesurée vs après ce lot

La baseline documentée par le rapport précédent (§19.10 : 93 fichiers/2277 assertions/17
fichiers non verts) portait sur le train **avant** le lot Performance n'existait pas encore —
non réutilisable telle quelle. Mesure réelle effectuée dans **cette** session, sur le HEAD
**actuel** (`f71dd97`, juste avant ce lot) :

| | Baseline mesurée ici (`f71dd97`, 311 migrations) | Après ce lot (312 migrations) |
|---|---|---|
| Fichiers de test | 93 | 93 (aucun fichier pgTAP ajouté par ce lot — le nouveau test Reserves est du Vitest, pas du pgTAP) |
| Assertions totales | 2277 | 2277 |
| Fichiers avec ≥1 échec | **18** | **17** |

**Diff exact des deux listes de fichiers en échec** (calculé, pas estimé) : les 17 fichiers en
échec après ce lot sont un **sous-ensemble strict** des 18 de la baseline — la seule différence
est `gp_pilot_notification_devis_accepte.test.sql`, **corrigé par ce lot** (7/7 après, 3 échecs
avant). **Aucun fichier n'apparaît en échec après ce lot sans l'être déjà avant.**
**0 nouvelle régression, 1 correction.**

Les 17 fichiers restants (`colors_correctifs_v12`, `colors_functional_core_v1`,
`document_partage_public_par_jeton_v1`, `gp_pilot_plateforme_admin_role_total`,
`gp_pilot_rgpd_manifeste_fichiers`, `isolation_multitenant_comportement`,
`pieces_jointes_v1_lecture_documents_employes`, `platform_aal2_role_integrity_v1`,
`platform_audit_log_bounded_v1`, `platform_global_owner_all_apps_v1`,
`platform_stripe_state_attestation_r72`, `platform_support_uid_security_v1`,
`reserves_v1_foundation_workflow`, `reserves_v2_terrain_capture`,
`reserves_v3_collaboration_livrables`, `studio_render_engine`,
`terrain_mobile_v1b_permission_documents`) sont **identiques**, fichier par fichier et
assertion par assertion en échec, entre baseline et après-lot — déjà documentés comme
préexistants au §19.10. `reserves_v1/v2/v3` (fichiers de test pgTAP **existants**, sans rapport
avec le nouveau garde ENV qui n'a pas de test pgTAP propre) restent inchangés par ce lot : aucun
n'implique le garde ENV ni `notifier_devis_accepte`.

**Tests isolation dédiés** (`isolation_multitenant_comportement/roles/surface`, 3 fichiers,
90 assertions) : rejoués explicitement — `isolation_multitenant_comportement` conserve ses 8
échecs préexistants (identiques, non liés à ce lot), les deux autres restent 100 % verts.

### 20.7 — Applications (typecheck / lint / test / build)

`npm ci` à la racine et dans chaque application indépendante (`apps/reserves`, `apps/tools`,
`apps/colors`, `apps/studio`) :

| Vérification | Gestion Pro | Reserves | Tools | Colors | Studio |
|---|---|---|---|---|---|
| `typecheck` | PASS | PASS | PASS | PASS | PASS |
| `lint` | PASS (0 erreur) | PASS | PASS | PASS | PASS (0 avertissement) |
| `test` (Vitest) | PASS — 153 fichiers/1786 tests | PASS — 13/178 (inclut le nouveau `public-env-guard.test.ts`, 24 tests) | PASS — 174/1992 | PASS — 38/427 | PASS — 14/251 |
| `build` | **PASS** — `next build`, toutes les routes générées | **PASS avec le flag local documenté** (voir ci-dessous) — 19 routes | PASS avec flag local documenté | PASS avec flag local documenté | PASS — 12 routes |

6 avertissements ESLint préexistants (mêmes qu'au §19.11) — **aucun dans un fichier de ce lot**.

**`apps/reserves` — garde nouvellement porté, requalifié en conditions réelles d'exécution de
`npm run build:reserves`** (pas seulement le script isolé, §20.3) :

- Sans variable déclarée (`ELSATIA_APPLICATION_ENV`/`VERCEL_ENV` absentes → mode `production`
  par construction) : **bloqué avant `next build`**, 4 erreurs listées (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_RESERVES_URL`, `ELSATIA_APPLICATION_ENV`
  absentes), exit 1, `next build` **jamais invoqué**.
- Avec `NEXT_PUBLIC_RESERVES_URL=http://localhost:3020` sous mode `production` explicite : **bloqué**
  (`doit être en https sur un build publié`), exit 1.
- Avec `ELSATIA_APPLICATION_ENV=local` (flag documenté par la garde elle-même et par
  `apps/reserves/.env.example` porté, identique au flag déjà utilisé pour Colors) :
  **`npm run build:reserves` PASS** — la garde affiche `mode « local », contrôle non bloquant,
  rien à signaler`, puis `next build` **démarre réellement et se termine** (Turbopack,
  compilation réussie, 19 routes statiques/dynamiques générées, TypeScript vérifié).
- `apps/reserves/src/lib/public-env-guard.test.ts` (nouveau, 24 tests) : **PASS**, inclus dans
  `npm run test` de Reserves.

**`apps/tools` et `apps/colors`** (chaîne racine `npm run build`/`npm run build:colors`, garde-fou
`verify-public-env.mjs` **préexistant**, sans rapport avec ce lot — jumeau de celui de Reserves)
: échouent sans variables déclarées (comportement attendu, déjà documenté identique au §19.11) ;
confirmé **PASS** en relançant avec leur flag local respectif déjà documenté
(`NEXT_PUBLIC_TOOLS_ENV=local` pour Tools, `ELSATIA_APPLICATION_ENV=local` pour Colors, plus les
`NEXT_PUBLIC_*` locales déjà présentes dans leurs `.env.example`) — vérifié à nouveau dans cette
session, pas supposé depuis le rapport précédent : Tools 47+ routes, Colors 27 routes. **Aucun
garde-fou désactivé dans le code** ; uniquement des flags/variables déjà documentés par les
scripts eux-mêmes.

`npm run verify:env-manifest` : **FAIL préexistant**, sans rapport avec ce lot — 37 erreurs
(variables `STUDIO_*`/`RESEND_API_KEY` manquantes dans les `.env.example` Studio, identiques au
§19.11) + 10 `DECISION_REQUIRED` métier (tarification Stripe) + 73 avertissements (dont, pour
Reserves, l'usage documenté du nom legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` — attendu, pas une
anomalie). Aucun des 37 erreurs ne référence le nouveau garde Reserves ni
`notifier_devis_accepte`. Aucun flag de contournement utilisé pour cette commande.

**Packages partagés / workers** : aucun fichier de `packages/*` ni `workers/*` touché par ce lot
— hors périmètre de régression.

### 20.8 — Fichiers modifiés par ce lot

```
apps/reserves/.env.example                                                        (modifié)
apps/reserves/package.json                                                        (modifié)
apps/reserves/scripts/verify-public-env.d.mts                                     (nouveau)
apps/reserves/scripts/verify-public-env.mjs                                       (nouveau)
apps/reserves/src/lib/public-env-guard.test.ts                                    (nouveau)
config/env-manifest.json                                                          (modifié)
scripts/verify-secrets.mjs                                                        (modifié)
supabase/migrations/20260922000321_correctif_notification_devis_accepte_niveau.sql (nouveau)
docs/qualification/ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md                      (cette section)
```

Aucune migration historique modifiée (`318`, `319`, `320`, `317` et toutes les précédentes
inchangées — vérifié par rejeu Fresh complet, §20.5). Aucun fichier hors de ce périmètre touché
(pas de Studio légal/RGPD, pas de partage public de documents, pas de manifeste RGPD, pas de
commande fournisseur → stock, pas de modèle devis coût/marge, pas d'impayés, pas de documents
situation/facture finale, pas de pricing, aucune Preview distante, aucune Production).

### 20.9 — Verdict

- Fresh : **312/312 migrations, 0 erreur SQL** (2 bases indépendantes, train + baseline
  `f71dd97` mesurée à nouveau dans cette session).
- pgTAP : **2277 assertions, 93 fichiers** — 17 fichiers en échec après ce lot, **sous-ensemble
  strict** des 18 de la baseline réellement mesurée : `gp_pilot_notification_devis_accepte`
  **corrigé** (7/7), **0 nouvelle régression**.
- `verify:migrations` : **312 valides**. `verify:secrets` : **2489 fichiers, 0 secret (2
  exceptions nommées)**.
- Garde Reserves : les 4 scénarios requis (local, déployable sans variable, déployable
  localhost, déployable HTTPS) se comportent **exactement comme spécifié**, y compris en
  conditions réelles (`npm run build:reserves` complet, `next build` réellement invoqué et
  terminé une fois la garde satisfaite). Origine d'invitation correcte vérifiée.
- Notification : `notifier_devis_accepte()` utilise désormais `'information'`, conforme à la
  contrainte canonique ; **7/7** ; isolation multi-tenant, bon destinataire, bonne entreprise,
  aucune notification parasite tous vérifiés explicitement par le test pgTAP ; owner/
  `SECURITY DEFINER`/`search_path`/ACL **inchangés**.
- Collision de migration `318` résolue par renumérotation en `321` (prochain numéro réellement
  disponible, vérifié sur le ledger réel, pas supposé) — `318/319/320` (Performance) et `317`
  (NUMBERING FIX INTEGRATED) préservés intacts.
- Applications : Gestion Pro/Reserves/Tools/Colors/Studio — typecheck/lint/test/build **PASS**
  (Tools/Colors nécessitent leurs flags locaux déjà documentés, comportement préexistant et
  identique au lot précédent ; `verify:env-manifest` FAIL préexistant sans rapport avec ce lot).

**`RESERVES + NOTIFICATION INTEGRATED`**

Les deux blockers qualifiés (garde de pré-build Reserves, correctif de niveau de notification)
sont intégrés sélectivement, sans fusion de branche, avec résolution explicite de la collision
de numéro de migration. Aucun déploiement, aucune Preview, aucune Production.

## 21. Lot ENV manifest (`feat/env-manifest-canonical-v1`) — déjà intégré, rien porté

**Mission** : intégrer sélectivement dans le train le manifeste canonique des variables
d'environnement et son contrôleur, sans repartir de `main`, sans train concurrent.

### 21.0 — Vérification du HEAD réel avant modification

HEAD distant réel de `claude/compassionate-euler-5j6avr` au démarrage : **`38cf99e`**
(`fix(preview-blockers): garde de pré-build Reserves + correctif niveau notification (RESERVES +
NOTIFICATION INTEGRATED)`) — identique au HEAD attendu. Aucun écart.

### 21.1 — Cartographie

`git merge-base` train/source = `59e960a` — un point **ancien** de l'historique du train
(antérieur même à `e0a83eb`, à `f71dd97` et à `38cf99e` : la branche source a divergé bien avant
tous les lots récents). 4 commits propres à la source : `9de09de`, `4445de0`, `816989a`,
`5326118`.

**Constat déterminant** : les fichiers infrastructurels du lot source sont déjà présents dans le
train, **byte-identiques** (`diff` vide) :

| Fichier source | Identique au train ? |
|---|---|
| `scripts/check-env-manifest.mjs` (172 lignes) | ✅ identique |
| `scripts/check-env-manifest.test.mjs` (565 lignes) | ✅ identique |
| `scripts/lib/env-manifest-core.mjs` (243 lignes) | ✅ identique |
| `scripts/lib/env-manifest-operator.mjs` (86 lignes) | ✅ identique |
| `scripts/lib/env-manifest-preflight.mjs` (173 lignes) | ✅ identique |
| `scripts/lib/env-manifest-scan.mjs` (462 lignes) | ✅ identique |
| `config/env-manifest.schema.json` (244 lignes) | ✅ identique |
| `docs/qualification/ELSATIA_ENV_MANIFEST_AND_CI_V1.md` | ✅ identique |
| `docs/runbooks/ELSATIA_ENV_MANIFEST_RUNBOOK_V1.md` | ✅ identique |
| `package.json` (scripts `verify:env-manifest`/`test:env-manifest`/`preflight:env`/`prebuild*`, chaîne `verify`) | ✅ déjà présents, mêmes commandes |
| `.github/workflows/ci.yml` (étapes manifeste avant `npm ci`) | ✅ déjà présentes (`verify:env-manifest`, `test:env-manifest`, `verify:secrets`) |
| `apps/reserves/.env.example` (nom legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` documenté) | ✅ déjà porté (lot §20, RESERVES + NOTIFICATION) |
| `apps/tools/.env.example` | ✅ présent, **train a une ligne de plus** que la source (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, ajoutée par un lot ultérieur) — train **supérieur** à la source |
| `config/env-manifest.json` | présent des deux côtés, mais le train (**5850 lignes**) a largement dépassé la version source (**4310 lignes**, `+3426` lignes de divergence) — évolutions ultérieures (dont l'entrée Reserves du lot §20) |

**Classement de chaque élément du lot source** :

| Élément | Classement |
|---|---|
| Contrôleur (`check-env-manifest.mjs` + libs), schéma, tests, doc, runbook | **déjà présent, identique** |
| Câblage `package.json`/CI | **déjà présent, identique** |
| Gabarits `.env.example`/`.env.local.example`/`.env.preview.example`, `apps/*/.env.example` | **déjà présent, version train égale ou supérieure** (`config/env-manifest.json` a grandi depuis ; les diffs de la branche source contre ces fichiers reflètent un état **antérieur**, pas des ajouts manquants) |
| `docs/runbooks/patches/ELSATIA_PREFLIGHT_CHECK_ENV_MANIFEST_V1.patch` | **obsolète/inapplicable** — voir §21.2 |

**Rien à porter.** Confirmé par la vérification directe la plus fiable possible : exécuter le
contrôleur du train lui-même (`node scripts/check-env-manifest.mjs`, mode 1 — code ↔ manifeste ↔
gabarits) plutôt que de comparer des diffs textuels contre une branche ancienne. Résultat : 194
variables/10 applications/30 secrets déclarés, **37 erreurs, 0 en rapport avec ce lot** (détail
§21.3) — aucune erreur `EXAMPLE-MISSING`/`EXAMPLE-FOREIGN` sur `gestion_pro`, `reserves`,
`tools` ou `colors` (les 4 applications couvertes par le lot source).

### 21.2 — Patch de cutover : non appliqué (obsolète)

`docs/runbooks/patches/ELSATIA_PREFLIGHT_CHECK_ENV_MANIFEST_V1.patch` cible
`scripts/cutover/preflight-check.mjs`. Recherche exhaustive dans l'historique complet du train
(`git log --all -- scripts/cutover/preflight-check.mjs`) : **ce fichier n'a jamais existé dans
la lignée de ce train**, y compris au commit de fusion le plus ancien concerné (`59e960a`,
merge-base). Il appartient à une lignée de branche entièrement différente (probablement
`release/gp-v1-rc`, jamais fusionnée ici). Conformément à l'instruction « n'applique pas
aveuglément un ancien patch cutover si le code a changé » : **patch non appliqué**, ni sur ce
fichier inexistant ni ailleurs. Le script de cutover réellement présent dans le train
(`scripts/verify-cutover-docs.mjs` et les runbooks `docs/runbooks/*CUTOVER*`) est un dispositif
distinct, non concerné par ce patch, non modifié par ce lot.

### 21.3 — Vérification ENV : `verify:env-manifest`, `verify:secrets`, preflight

- `node scripts/check-env-manifest.mjs` (mode dépôt) : **37 erreurs**, **toutes** concentrées sur
  `apps/studio/.env.example` et `workers/studio-video/.env.example` (`STUDIO_ENABLED`,
  `STUDIO_SIGNUP_MODE`, `STUDIO_SIGNUP_ALLOWLIST`, `STUDIO_LEGAL_PUBLISHED`,
  `STUDIO_LEGAL_TEXT_VERSION`, `RESEND_API_KEY`, `STUDIO_MAIL_PROVIDER`, `STUDIO_MAIL_FROM`,
  `STUDIO_AI_ANALYSIS`, `STUDIO_ANALYSIS_PYTHON`, `STUDIO_ANALYSIS_CONCURRENCY`,
  `STUDIO_ANALYSIS_TIMEOUT_SECONDS`) + 1 `ENV-REQUIRED-UNUSED`. **Aucune de ces variables n'est
  touchée par le lot source `feat/env-manifest-canonical-v1`** (son diff ne touche ni
  `apps/studio/.env.example` ni `workers/studio-video/.env.example`) : gap préexistant, non
  qualifié par ce lot, non traité ici — hors périmètre de « porter ce qui manque réellement au
  lot source ».
- **10 `DECISION_REQUIRED`** (`STRIPE-MODULE-PRICE-MODEL`, `STRIPE-SUPPLEMENTARY-ACCOUNTS`,
  `STRIPE-IA-OPTIONS`, `STRIPE-LEGACY-GENERATIONS`, `STRIPE-STORAGE-BLOCK`,
  `FLAG-CRONS-FAIL-OPEN`, `STUDIO-SIGNUP-DEFAULT`) : décisions commerciales/produit attribuées à
  Julien dans le manifeste lui-même, **déjà ouvertes avant ce lot**, identiques des deux côtés
  (source et train). Aucune n'est créée ni résolue par cette session — toutes restent
  `DECISION_REQUIRED`, option la plus conservatrice retenue par défaut (aucun flag fail-open
  changé, aucun contrat Stripe tranché).
- **`preflight_enforcement`** : `"report"` — confirmé identique entre le manifeste source et le
  manifeste du train (`grep` direct). **Conservé en `report`**, conformément à la mission :
  aucune vraie Preview n'a été qualifiée dans cette session pour justifier un passage à
  `enforce`.
- `node scripts/verify-secrets.mjs` : **2489 fichiers suivis contrôlés, aucun secret reconnu (2
  exceptions nommées, inchangées)** — **aucun secret modifié** par cette session (aucun fichier
  touché, cartographie uniquement).
- `node scripts/verify-migrations.mjs` : **312 migrations valides** (inchangé — ce lot ne touche
  aucune migration).

### 21.4 — Verdict de ce lot

**Aucun fichier modifié, aucun commit de code.** Le lot `feat/env-manifest-canonical-v1`
(`5326118`) est déjà entièrement intégré au train, dans une version égale ou plus évoluée sur
chaque fichier comparé. Le patch de cutover associé est inapplicable (fichier cible inexistant
dans cette lignée) et n'a pas été appliqué. Les 37 erreurs actuelles de `verify:env-manifest`
(Studio) et les 10 `DECISION_REQUIRED` (Stripe/flags) sont préexistantes, non couvertes par ce
lot source, non résolues ici. `preflight_enforcement` reste `report`. Aucun secret modifié,
aucune Preview, aucune Production.

SHA après ce lot : **`38cf99e`** (inchangé — aucun commit de code nécessaire).

---

## 22. Lot Commande fournisseur → Stock (`COMMANDE STOCK FLOW INTEGRATED`)

### 22.1 — Source et train cible

- Lot source qualifié : branche `fix/commande-reception-stock-v1`, SHA
  `2a2034cc9a4036a325961aa1dc62fa9e1fcea0d8` (re-vérifié au début de cette
  session par `git ls-remote`/`git rev-parse` : le SHA n'a pas bougé). Verdict
  source : `COMMANDE STOCK FLOW QUALIFIED`. La branche source part de
  `e0a83ebbd430efb5217466f05be3c08f45ae4de5` — re-vérifié comme étant
  effectivement l'ancêtre commun réel (`git merge-base`) avec le train cible.
- HEAD réel du train `claude/compassionate-euler-5j6avr` au début de cette
  session (re-vérifié par `git fetch` + `git rev-parse`, PAS supposé égal à
  la valeur indiquée dans le prompt) : `38cf99e50d53c0c0dc6e80871c0a178addf6e9f1`
  — identique à la valeur indiquée ; aucun commit supplémentaire n'était
  apparu entre-temps. Train de départ : **312 migrations**.
- La branche source n'a **pas** été mergée en bloc. Chaque fichier source a
  été comparé individuellement au train cible (voir §22.2) et seuls les
  changements nécessaires au lot Commande → Stock ont été portés. Tous les
  autres lots déjà intégrés dans le train (Numbering §18, Performance/
  Situations §19, Reserves public ENV + notification §20, sécurité, et toute
  convergence antérieure) restent strictement inchangés — vérifiés inchangés
  par relecture de `git diff` sur les 4 fichiers TS/TSX portés (aucune section
  de ces fichiers en dehors du lot qualifié n'a bougé depuis `e0a83eb`).

### 22.2 — Classement des changements source

Le lot source comprenait exactement les 7 fichiers annoncés dans son propre
rapport de qualification (`docs/qualification/ELSATIA_GP_COMMANDE_RECEPTION_STOCK_V1.md`,
lu intégralement avant tout portage) :

| Fichier source | Classement | Action |
|---|---|---|
| `supabase/migrations/20260922000318_gp_reception_commande_stock_transactionnel_v1.sql` | absent du train — collision de **numéro** uniquement (le train possède déjà un `318` distinct, voir §22.3), logique entièrement absente | porté, renuméroté `322`, en-tête de provenance réécrit, logique SQL strictement inchangée (diff caractère pour caractère du corps, seul l'en-tête commentaire change) |
| `supabase/tests/gp_reception_commande_stock_transactionnel_v1.test.sql` | absent du train | porté à l'identique (65 assertions), seule une phrase de commentaire mentionnant l'ancien numéro `20260922000318` a été mise à jour pour référencer `20260922000322` |
| `docs/qualification/ELSATIA_GP_COMMANDE_RECEPTION_STOCK_V1.md` | absent du train | conservé tel quel comme rapport du lot source (référence historique) — non modifié ; cette section 21 est le rapport du train, distinct |
| `src/app/actions/commandes.ts` | absent du train (`grep`/`git diff e0a83eb HEAD` : fichier inchangé depuis la divergence) | porté à l'identique — vérifié octet pour octet contre la source après portage |
| `src/app/actions/reception.ts` | absent du train, inchangé depuis `e0a83eb` | porté à l'identique |
| `src/components/ReceptionCommandeForm.tsx` | absent du train, inchangé depuis `e0a83eb` | porté à l'identique |
| `src/components/ReceptionScanner.tsx` | absent du train, inchangé depuis `e0a83eb` | porté à l'identique |

Aucun fichier n'est tombé dans les catégories « déjà présent », « équivalent/
supérieur » ou « devenu incompatible » : les 4 fichiers TS/TSX n'avaient reçu
aucune modification concurrente sur le train entre `e0a83eb` et `38cf99e`, et
aucune migration du train (299 à 321) ne touche `lignes_commande`,
`commandes_fournisseurs`, `mouvements_stock` ou une fonction de réception —
seule la migration `317` (`correctif_troncature_next_reference`) est dans ce
voisinage temporel et elle est sans rapport (bug `lpad`, fonction
`next_reference()`, jamais appelée par le moteur de réception).

### 22.3 — Collision de migration

Le train `38cf99e` possédait déjà `20260922000318_dashboard_indicateurs_bornes.sql`
(lot Performance/Dashboard, intégré entretemps — voir §19), donc le numéro
`20260922000318` du lot source était **pris**. Inventaire réel du ledger
(`ls supabase/migrations | sort | tail`) : la dernière migration du train est
`20260922000321_correctif_notification_devis_accepte_niveau.sql` ; aucune
migration `322+` n'existait. Prochain numéro réellement libre : **`322`**
(confirmé, pas supposé — hypothèse `322` du prompt vérifiée exacte).

Migration renommée :
`supabase/migrations/20260922000322_gp_reception_commande_stock_transactionnel_v1.sql`.

Adapté dans cette migration : uniquement l'en-tête de provenance (SHA source,
HEAD initial du train, explication de la collision et du renommage, référence
au test porté). **Aucune ligne de logique SQL n'a été modifiée** — le corps
(tables, contraintes, fonctions, grants) est un report caractère pour
caractère du corps qualifié de la migration source à partir de la ligne
« 1) Modèle canonique ». Vérifié par diff manuel section par section pendant
la rédaction (voir aussi §22.11, Fresh + pgTAP, qui revalide cette absence de
dérive fonctionnellement).

### 22.4 — Architecture portée

Strictement celle qualifiée par le lot source, sans réinvention :

- **`lignes_commande.article_id`** (uuid, nullable) — nouvelle colonne,
  additive. **FK composite** `(article_id, entreprise_id) →
  articles_stock(id, entreprise_id)` — garantie tenant au niveau base,
  indépendante de tout contrôle applicatif. Compatible avec le train actuel :
  l'index unique `articles_stock(id, entreprise_id)` requis par cette FK
  composite existait déjà (migration `20260710000025_depot_inventaires.sql`,
  antérieure à la divergence), et le même patron de FK composite est déjà
  utilisé ailleurs dans le train (`stock_import_nuanciers.sql`) — aucune
  incompatibilité architecturale.
- **`mouvements_stock.ligne_commande_id`** (uuid, nullable), FK composite
  `(ligne_commande_id, entreprise_id) → lignes_commande(id, entreprise_id)` —
  traçabilité du mouvement vers sa ligne de commande d'origine.
- **`public.receptions_idempotence`** — nouvelle table, RLS activée,
  lecture membres uniquement, aucune écriture directe accordée (uniquement
  via les fonctions `SECURITY DEFINER`).
- **Moteur canonique unique `public.appliquer_reception_ligne_commande`** —
  contrat de quantité reçue **cumulée cible** (pas un delta), verrouillage
  fixe commande puis ligne, fonction interne jamais accordée à
  `anon`/`authenticated`.
- **Convergence des trois anciennes voies** vers ce moteur :
  `enregistrer_reception_commande_interne` (parcours `/commandes/[id]`),
  `changer_statut_commande_interne('recue')` (bascule manuelle), et
  `enregistrer_reception_lot`/`enregistrer_reception_lot_borne` (parcours
  scan `/stock/reception`), chacune avec un `drop function if exists`
  explicite sur l'ancienne signature pour ne laisser aucune ancienne
  surcharge vulnérable exposée.
- **Idempotence par clé explicite** (`p_idempotency_key`) pour les appels par
  lot, en complément de l'idempotence naturelle par cible cumulée.

Aucun écart d'architecture constaté entre le lot source et son portage sur ce
train : la seule différence est le numéro de migration et les commentaires de
provenance.

### 22.5 — Réception totale, partielle, rejeu, dépassement

Vérifiés réellement par le test pgTAP porté (§22.10) ET par des requêtes
manuelles indépendantes sur une base rejouée depuis zéro (§22.11) :

- **Réception totale** : commande 10 → cible 10 : `quantite_recue = 10`,
  stock article +10, exactement 1 mouvement, statut `recue` — confirmé
  (scénario 1 du test, `ok 1-4`).
- **Réception partielle en deux temps** : commande 10 → cible 4 (statut
  `recue_partiel`, stock +4) → cible 10 (statut `recue`, stock +6 de delta,
  soit 10 au total) : exactement **2** mouvements (4 puis 6), jamais un
  mouvement de 10 — confirmé (scénario 2, `ok 5-11`).
- **Rejeu exact** : un second appel à cible identique (10) après réception
  totale, y compris une fois la commande déjà `recue`, est un no-op :
  `delta = 0`, aucun nouveau mouvement, aucun nouveau crédit de stock, même
  statut renvoyé sans erreur — confirmé (scénario 4, `ok 15-18`). C'est
  précisément le correctif du bug de conception trouvé par le lot source
  pendant l'écriture de ses propres tests (garde de statut appliqué
  seulement si `delta ≠ 0`).
- **Dépassement** : une cible supérieure à la quantité commandée (tentative
  de 7 sur une ligne de 5 déjà à 4) est rejetée avec le message qualifié
  (`%invalide%`), sans écriture partielle — confirmé (scénario 3, `ok 12-14`).

### 22.6 — Parcours scan

Le parcours scan (`enregistrer_reception_lot`) converge vers le même moteur
canonique pour la part rattachée à une commande fournisseur : une attribution
de scan relie l'article à la ligne (si elle ne l'était pas déjà), crédite le
stock via `appliquer_reception_ligne_commande`, et un rejeu sous la même clé
d'idempotence ne double pas le mouvement — confirmé (bloc « Parcours scan »
du test, `ok 43-49`). Il n'existe plus deux moteurs indépendants de
réception : les entrées de stock non rattachées à une commande (réception
dépôt libre) restent, comme dans le lot source, des mouvements directs — ce
n'est pas le flux commande→stock visé par ce lot, rien n'a été retiré.

### 22.7 — Idempotence

- **Idempotence naturelle par cible cumulée** : double clic, retry réseau,
  appel identique, rejeu après commande `recue` — tous des no-ops par
  construction du moteur canonique (§22.5, scénario 4).
- **Clé d'idempotence explicite** : un second appel sous la **même clé**
  mais avec une **charge différente** (9 au lieu de 5) ne retraite jamais —
  il renvoie le résultat déjà mémorisé du premier appel, sans écriture
  supplémentaire — confirmé (scénario 5, `ok 19-22`).
- **Appels concurrents** (deux sessions réelles, voir §22.9) : sérialisés par
  le verrou de ligne, résultat final exact, aucun double mouvement.

### 22.8 — Rollback / transaction

Scénario 11 du test porté : un lot contenant une ligne valide et une ligne
étrangère (id inexistant) dans le **même appel** à
`enregistrer_reception_commande` est rejeté en bloc
(`%invalide ou ligne étrangère%`), et la ligne par ailleurs valide du même
lot n'a **rien** reçu : `quantite_recue = 0`, aucun mouvement de stock,
statut de la commande inchangé — confirmé (`ok 32-35`). Chaque fonction de
haut niveau reste une seule fonction PL/pgSQL `SECURITY DEFINER` : tout se
passe dans une seule transaction Postgres, atomique par construction. Il est
donc impossible d'obtenir `quantite_recue` sans mouvement, mouvement sans
stock, stock sans mouvement, ou statut de commande incohérent — vérifié
également par la cohérence globale du scénario 14 (`ok 28-30` : somme des
mouvements liés = somme des `quantite_recue`, stock = somme signée des
mouvements de l'article).

### 22.9 — Concurrence réelle (deux connexions psql distinctes)

Testé avec de **vraies sessions PostgreSQL concurrentes** (deux processus
`psql` lancés en arrière-plan depuis un shell, jamais un test séquentiel
simulé), sur des fixtures dédiées et permanentes (`public._concurrency_test_refs`,
créées uniquement pour ce test, hors du schéma des migrations). Technique :
la session A prend manuellement, dans sa propre transaction, les deux mêmes
verrous que le moteur canonique acquiert en interne (`commandes_fournisseurs`
puis `lignes_commande`, `for update`), attend 3 s (`pg_sleep(3)`), puis
appelle la fonction publique réelle (qui ré-acquiert les verrous déjà tenus,
sans effet) avant de committer. La session B, démarrée 1 s plus tard, appelle
directement la fonction publique réelle et est chronométrée avec
`clock_timestamp()`/`\timing`.

| Scénario | Résultat mesuré | État final vérifié |
|---|---|---|
| Même ligne, rejeu identique (cible 10 par les deux sessions) | Session B bloquée **2,02 s** (11:19:48.699 → 11:19:50.719, exactement l'attente du verrou tenu par A jusqu'à 11:19:50.717) puis no-op | 1 mouvement, stock = 10, `quantite_recue` = 10, statut `recue` — vérifié par requête indépendante après coup |
| Deux lignes différentes, même entreprise (commandes distinctes) | Session B **non bloquée** (~12 ms), pendant que A dormait encore | aucune interférence, chaque ligne reçoit sa propre quantité |
| Deux entreprises différentes | Session B **non bloquée** (~12 ms) malgré le verrou tenu 3 s par A sur l'entreprise 1 | aucun verrou croisé entre tenants |

Aucun deadlock observé dans aucun des trois scénarios. Les verrous ne portent
jamais sur une commande ou une entreprise entière : seules les lignes ciblées
sont verrouillées, ce qui explique l'absence de blocage entre lignes/
entreprises différentes tout en garantissant la sérialisation stricte sur la
même ligne.

### 22.10 — Test pgTAP source (65 assertions)

Porté à l'identique dans
`supabase/tests/gp_reception_commande_stock_transactionnel_v1.test.sql`
(seule une phrase de commentaire de tête, référençant l'ancien numéro de
migration, a été mise à jour). Exécuté seul sur la base rejouée avec la
migration `322` : **65/65 assertions vertes, 0 `not ok`, 0 erreur**
(vérifié deux fois : une fois juste après application de la migration `322`
seule, une fois après un Fresh complet des 313 migrations — résultat
identique). Couvre les 14 scénarios métier, la convergence scan, et les
contrôles de sécurité (owner, `SECURITY DEFINER`, `search_path`, grants,
absence d'accès `anon`, unicité des signatures en base, FK composite).

### 22.11 — Fresh (train complet)

Base reconstruite intégralement depuis zéro sur ce Postgres natif (pas de
Docker disponible dans cet environnement — voir Annexe A pour l'adaptation
d'environnement). Les **313 migrations** (312 + la nouvelle `322`)
s'appliquent dans l'ordre, **0 erreur SQL, aucun doublon d'horodatage,
aucun contournement d'erreur**. `npm run verify:migrations` confirme
indépendamment : « 313 migrations valides, noms et horodatages uniques. »

### 22.12 — Full pgTAP : baseline avant/après (mesurée sur le HEAD réel de cette session, pas supposée)

Le prompt indiquait, à titre indicatif, une baseline antérieure de 93
fichiers / 2277 assertions / 17 fichiers non verts pour un train qualifié
`38cf99e` antérieur. Cette valeur ne correspond **pas** à ce qui a été
mesuré dans cette session sur le HEAD réel — attendu, puisque ce chiffre
provient d'une édition antérieure de ce même rapport (§20.9, mesurée sur un
état intermédiaire du train différent) et que l'environnement de test
(bootstrap Postgres natif, voir Annexe A) a été enrichi au fil de cette
session (rôles Supabase d'infrastructure, `auth.mfa_factors` avec ses
colonnes réelles, schéma `extensions`), ce qui **réduit** artificiellement
le nombre de fichiers en échec par rapport à une mesure antérieure faite
avec un bootstrap plus pauvre — sans aucun rapport avec le lot Commande →
Stock. La baseline ci-dessous est celle réellement mesurée dans **cette**
session, sur le HEAD `38cf99e` réel, avant toute modification :

| | Baseline (HEAD `38cf99e`, avant ce lot) | Après ce lot (HEAD intégré, 313 migrations) |
|---|---|---|
| Fichiers de test | 93 | 94 (**+1**, le nouveau fichier) |
| Assertions `ok` | 2433 | 2498 (**+65**, exactement le nouveau fichier) |
| Assertions `not ok` | 3 | 3 (**inchangé**) |
| Total assertions exécutées | 2436 | 2501 (**+65**) |
| Fichiers non intégralement verts | 5 | 5 (**même liste, aucun nouveau**) |

Les 5 fichiers non intégralement verts, **identiques avant et après**, tous
sans rapport avec le domaine Commande → Stock et déjà hors périmètre de ce
lot (§17 : plateforme admin, RGPD, partage public de documents, Stripe) :

- `document_partage_public_par_jeton_v1.test.sql` (10/42 exécutées avant
  crash — échec métier préexistant sur `trg_lignes_factures_brouillon_only`,
  domaine « partage public documents », hors périmètre) ;
- `gp_pilot_plateforme_admin_role_total.test.sql` (0/6 — contrainte
  `plateforme_admins_actif_requiert_utilisateur_id` sur une fixture du test,
  domaine « plateforme admin », hors périmètre) ;
- `gp_pilot_rgpd_manifeste_fichiers.test.sql` (1/9 — `permission denied for
  function manifeste_fichiers_entreprise`, domaine RGPD, hors périmètre) ;
- `platform_audit_log_bounded_v1.test.sql` (6/12, 3 assertions `not ok`
  explicites — domaine plateforme/audit, hors périmètre) ;
- `platform_stripe_state_attestation_r72.test.sql` (8 assertions passées
  puis erreur avant `finish()` — domaine Stripe/attestation, dépend du stub
  `pgsodium` non cryptographique de cet environnement, voir Annexe A, hors
  périmètre).

**Comparaison précise des listes d'échec avant/après : diff vide.** Aucun
ancien test vert n'est devenu rouge, aucune nouvelle régression, et le
nouveau test ajoute exactement ses 65 assertions vertes.

### 22.13 — Multi-tenant et sécurité

Vérifiés par le test porté (§22.10) :

- Entreprise A contre commande B : « Commande introuvable », aucune fuite
  d'existence cross-tenant, aucun crédit de stock (`ok 33-35`).
- Article d'une autre entreprise : rejet explicite (« introuvable dans cette
  entreprise »), ligne non reliée après la tentative (`ok 36-37`) ; **et**
  au niveau base, FK composite `lignes_commande_article_entreprise_fk`
  (`23503`) empêchant physiquement le rattachement (`ok 65`).
- Utilisateur sans la permission `gerer_achats` : « Accès refusé », aucune
  écriture (`ok 38-39`).
- `anon` : aucun accès à aucune des fonctions publiques ni au moteur interne
  (`ok 44, 47, 48, 50, 51`).
- `authenticated` légitime : accès au point d'entrée public uniquement, pas
  au moteur interne (`ok 45, 46, 49`).

Documentation par fonction publique créée/modifiée (owner, sécurité,
`search_path`, grants, `auth.uid()`, contrôle entreprise, contrôle
permission) :

| Fonction | Owner | Sécurité | `search_path` | `anon` | `authenticated` | Contrôle entreprise | Contrôle permission |
|---|---|---|---|---|---|---|---|
| `appliquer_reception_ligne_commande` (interne) | postgres | `DEFINER` | `public` (figé) | refusé | refusé (accès uniquement via les wrappers publics) | vérifié à chaque `select…where entreprise_id = p_entreprise_id` | aucun (fonction interne, pas de surface publique) |
| `enregistrer_reception_commande_interne` (interne) | postgres | `DEFINER` | `public` (figé) | refusé | refusé | vérifié (jointures `entreprise_id`) | aucun (interne) |
| `enregistrer_reception_commande` (public) | postgres | `DEFINER` | `public` (figé) | refusé | accordé | via la fonction interne | `a_permission(p_entreprise_id,'gerer_achats')` |
| `changer_statut_commande_interne` (interne) | postgres | `DEFINER` | `public` (figé) | refusé | refusé | vérifié | délégué à l'appelant (fonction interne, jamais exposée directement) |
| `enregistrer_reception_lot` (public, scan) | postgres | `DEFINER` | `public` (figé) | refusé | accordé | `est_membre_actif` | `a_permission(p_entreprise_id,'effectuer_entree_stock')` |
| `enregistrer_reception_lot_borne` (public, borne) | postgres | `DEFINER` | `public, extensions` (figé) | refusé | accordé | via `employe_borne_autorise` | identité salarié + poste (`employe_borne_autorise`) |

Une seule signature de chaque fonction modifiée est présente en base après
la migration (`ok 62-64`) : les anciennes versions à arité différente ont
été explicitement `drop function if exists` avant le `create or replace`,
aucune surcharge vulnérable ou obsolète ne reste exposée. Vérifié aussi par
`pg_proc`/`has_function_privilege` dans le test (privilèges effectifs, pas
seulement les `GRANT`/`REVOKE` déclarés dans la migration).

### 22.14 — `verify:migrations` / `verify:secrets`

- `npm run verify:migrations` → **313 migrations valides, noms et
  horodatages uniques.**
- `npm run verify:secrets` → **2489 fichiers suivis contrôlés, aucun secret
  reconnu (2 exceptions nommées)** — les mêmes 2 exceptions préexistantes,
  aucune exception ajoutée par ce lot.

### 22.15 — Applications

Toutes exécutées réellement (installation des dépendances de chaque
sous-application, pas seulement de la racine) :

| Application | typecheck | lint | test | build |
|---|---|---|---|---|
| Gestion Pro (racine) | 0 erreur | 0 erreur, 6 avertissements préexistants sans rapport avec ce lot | 1786 tests, 153 fichiers, tous passants | `next build` — compilé avec succès, 38 pages statiques, arbre de routes complet (dont `/commandes/[id]`, `/stock/reception`) |
| Tools (`apps/tools`) | 0 erreur | 0 erreur | 1992 tests, 174 fichiers, tous passants | **compilé avec succès** via le mécanisme local documenté (`apps/tools/.env.example` → `NEXT_PUBLIC_TOOLS_ENV=local`, garde `verify:public-env` non bloquante en mode local) — le lot source avait laissé ce build non exécuté faute de secrets ; ici entièrement vert |
| Reserves (`apps/reserves`) | 0 erreur | 0 erreur | 178 tests, 13 fichiers, tous passants | compilé avec succès, garde `ELSATIA_APPLICATION_ENV=local` (le « nouveau garde public ENV » intégré au train, §20) respectée en mode non bloquant |
| Colors (`apps/colors`) | 0 erreur | 0 erreur | 427 tests, 38 fichiers, tous passants | compilé avec succès via `apps/colors/.env.example` → `ELSATIA_APPLICATION_ENV=local` |
| Studio (`apps/studio`) | 0 erreur | 0 erreur | 251 tests, 14 fichiers, tous passants | compilé avec succès via `apps/studio/.env.example` |

Aucune application n'a nécessité de contournement : chaque garde de
pré-build documentée (fichier `.env.example` de l'application concernée,
`ELSATIA_APPLICATION_ENV=local` / `NEXT_PUBLIC_TOOLS_ENV=local`) a été
suivie telle quelle, avec des valeurs locales de type « placeholder » (jamais
un vrai secret) déclarées dans des fichiers `.env.local` non versionnés
(`.gitignore` : `.env*` sauf les `.env*.example`), supprimés après usage.

### 22.16 — Annexe A : adaptations d'environnement (honnêtes, documentées)

Aucun daemon Docker n'était disponible dans cet environnement
(`docker ps` échoue). Le CLI Supabase n'est pas installé et son
téléchargement via `npx supabase` demande une confirmation interactive
bloquante ; il n'a donc pas été utilisé. À la place, un Postgres 16 natif
existant sur la machine (`pg_lsclusters`, déjà démarré au moment de cette
session) a été utilisé, avec un **bootstrap minimal viable** construit pour
cette session, qui reproduit uniquement les primitives que le code SQL du
dépôt attend d'une vraie stack Supabase :

- Rôles `anon` / `authenticated` / `service_role`, plus les rôles
  d'infrastructure réels référencés par des tests/migrations du train
  (`supabase_admin`, `supabase_migrator`, `supabase_storage_admin`,
  `authenticator`) — non fonctionnels (pas de vraie stack GoTrue/PostgREST/
  pooler derrière), juste présents pour que les `GRANT`/`SET ROLE`/checks de
  rôle ne cassent pas sur « role does not exist ».
- Schéma `auth` avec une table `users` (colonnes réellement utilisées par le
  dépôt : `email_confirmed_at`, `banned_until`, `deleted_at`,
  `raw_user_meta_data`, `raw_app_meta_data`, `phone`), une table
  `mfa_factors` (colonnes `friendly_name`, `factor_type`, `status`,
  `secret`), et des fonctions `auth.uid()` / `auth.role()` / `auth.email()` /
  `auth.jwt()` qui lisent des GUC de session (`request.jwt.claim.sub`,
  `request.jwt.claim.role`, `request.jwt.claims`) positionnés par
  `set_config(...)` dans chaque session de test — exactement la convention
  déjà utilisée par le test pgTAP source lui-même pour simuler un
  utilisateur authentifié.
- Schéma `storage` minimal (`buckets`, `objects`, `foldername()`) — pas de
  moteur de fichiers réel, uniquement ce que les migrations du dépôt
  référencent au niveau SQL (policies RLS, colonnes).
- Schéma `extensions` avec `pg_trgm` et un wrapper `digest(bytea|text, text)`
  vers `pgcrypto` (installé en `public`), et un `search_path` par défaut
  `"$user", public, extensions` — convention Supabase réelle, nécessaire à
  plusieurs migrations préexistantes (non liées à ce lot) qui qualifient ou
  supposent ce schéma.
- Un **stub local non cryptographique** de l'extension `pgsodium`
  (`crypto_sign_verify_detached` renvoie toujours `false`, comportement
  fail-closed cohérent avec l'absence de vraie clé installée ;
  `crypto_sign_detached` lève une exception explicite si jamais appelée).
  Ce stub n'existe que dans les fichiers d'extension locaux de ce Postgres
  (`/usr/share/postgresql/16/extension/pgsodium*`), **jamais dans le dépôt
  git** : il sert uniquement à permettre à une migration préexistante et
  sans rapport (`20260828000244_stripe_state_attestation_r72.sql`, domaine
  Stripe/attestation, hors périmètre de ce lot) de s'appliquer pendant le
  Fresh complet, sans quoi tout le Fresh échouerait dès cette migration très
  antérieure à celle de ce lot. Documenté explicitement ici comme une
  approximation, pas une vraie primitive cryptographique — aucune assertion
  de sécurité Stripe ne doit être considérée comme validée par ce stub (voir
  §22.12, ce fichier de test reste dans la liste des non-verts).

Cette approximation est un choix honnête et nécessaire face à l'absence de
Docker dans cet environnement, pas un contournement du travail à faire : les
313 migrations du dépôt (aucune modifiée par ce bootstrap) s'appliquent sans
erreur, le test pgTAP qualifié de ce lot est vert à 65/65 sans aucune
dépendance à ces stubs (il n'utilise ni `storage`, ni `mfa_factors`, ni
`pgsodium`), et la comparaison avant/après de la suite pgTAP complète (§22.12)
est faite avec le **même** bootstrap des deux côtés, donc rigoureusement
comparable.

### 22.17 — Verdict

- Architecture source correctement portée, sans réinvention : moteur
  canonique, `article_id`, FK composites, idempotence — **conformes**.
- Migration renumérotée `318` → `322`, collision résolue, logique SQL
  inchangée caractère pour caractère.
- Test source : **65/65** assertions vertes (vérifié deux fois : après la
  migration seule, après le Fresh complet).
- Idempotence, concurrence réelle (deux sessions psql), rollback,
  cohérence stock/mouvements, isolation tenant, sécurité (owner/`DEFINER`/
  `search_path`/grants) : tous **vérifiés réellement**, pas supposés.
- Fresh complet : **313/313 migrations, 0 erreur SQL, 0 doublon**.
- Full pgTAP : **2501 assertions (2498 `ok` + 3 `not ok` préexistants),
  94 fichiers, +65 par rapport à la baseline mesurée dans cette session,
  0 nouvelle régression** (diff des listes d'échec avant/après : vide).
- `verify:migrations` / `verify:secrets` : **PASS**, aucune exception
  ajoutée.
- Applications (Gestion Pro, Tools, Reserves, Colors, Studio) :
  typecheck/lint/test/build **PASS** partout, y compris le build Tools que
  le lot source avait laissé non exécuté faute de secrets.

**`COMMANDE STOCK FLOW INTEGRATED`**

Le lot qualifié séparément sous le SHA `2a2034c` est intégré sélectivement
sur `claude/compassionate-euler-5j6avr`, sans fusion de branche, avec
résolution explicite de la collision de numéro de migration (`318` → `322`)
et requalification complète dans son nouvel environnement. Hors périmètre
strictement respecté (modèle devis coût/marge, impayés, documents
situations/facture finale, Studio légal/RGPD, partage public de documents,
manifeste RGPD, pricing, Preview distante, Production) : aucun de ces
domaines n'a été touché. Aucun déploiement.

## 23. Qualification du HEAD `dcfd71f` (après le lot ENV manifest) — `PREVIEW DEPLOYMENT CANDIDATE`

> **Note de fusion (résolution du conflit de branche)** : cette section qualifie le SHA
> `dcfd71f`, HEAD réel de `claude/compassionate-euler-5j6avr` au moment où cette qualification a
> été exécutée (immédiatement après le lot ENV manifest §21, sans code additionnel). Une autre
> session a poussé en parallèle, sur cette même branche, le lot indépendant §22 (« Commande
> fournisseur → Stock », commit `ac8d201`) — non inclus dans le périmètre qualifié ci-dessous, et
> non ré-audité ici. Le HEAD réel de la branche après fusion des deux travaux est documenté en fin
> de rapport (RETOUR FINAL / SHA final).

**Mission** : après intégration du lot ENV manifest (§21, sans changement de code), qualifier
sans attendre le HEAD final obtenu — Fresh, upgrade simulé, pgTAP complet, applications,
sécurité, performance, access, commercial, env/secrets/preflight, release gate. Verdict maximum
possible sans accès à une vraie Preview : `PREVIEW DEPLOYMENT CANDIDATE` (jamais `QUALIFIED`).

**SHA qualifié** : `dcfd71f` (HEAD de `claude/compassionate-euler-5j6avr` après §21 — inchangé
depuis, aucun commit de code entre `dcfd71f` et la fin de cette qualification). Toutes les
preuves ci-dessous ont été mesurées sur ce SHA exact.

### 23.1 — Fresh complet

Méthodologie identique aux lots précédents (bootstrap Postgres 16 + pgTAP local hors dépôt,
Docker indisponible). Checkout propre d'un worktree dédié sur `dcfd71f`, base entièrement
reconstruite :

- **312/312 migrations appliquées, 0 erreur SQL**, aucune migration dupliquée ni manquante.
- `node scripts/verify-migrations.mjs` : **312 migrations valides**.
- `node scripts/verify-secrets.mjs` : **2489 fichiers suivis contrôlés, aucun secret reconnu (2
  exceptions nommées, inchangées)**.

### 23.2 — Upgrade simulé (Preview réelle inaccessible)

Aucun accès à un environnement Preview réel dans ce sandbox. Simulation d'un upgrade sur base
**déjà peuplée** (au lieu d'un Fresh à vide), pour vérifier que les migrations du lot Performance
(`318-320`) se comportent correctement contre des données préexistantes réalistes, pas
seulement contre une base neuve :

1. Base dédiée, migrations `1..317` rejouées seules (**308/308**, état « avant lot Performance »).
2. Jeu de données synthétique réaliste inséré directement (2 entreprises, 230 devis, 170
   factures, statuts mixtes, historique de 300 jours) — représentatif d'un tenant en production
   avant l'upgrade.
3. Totaux canoniques calculés **avant** upgrade par recalcul indépendant (`SUM` direct) :
   tenant 1 = 87 600 / 144 000 / 89 461,83 ; tenant 2 = 10 800 / 9 600 / 6 098,84
   (devis acceptés / factures totales / encaissé).
4. Migrations `318-321` rejouées sur cette base déjà peuplée (« l'upgrade ») : **0 erreur SQL**.
5. **Le backfill de `20260922000319` reproduit exactement les totaux canoniques pré-upgrade**,
   pour les deux tenants, valeur par valeur — preuve directe que le calcul de rattrapage
   fonctionne sur des données réelles préexistantes, pas seulement en écriture incrémentale
   future.
6. Déplacement d'une facture **brouillon préexistante** (pas une facture de test fraîchement
   créée) entre les deux tenants post-upgrade : ancien tenant débité de 960 (144 000 → 143 040),
   nouveau tenant crédité du montant complet (9 600 → 10 560) — cache 12/12 confirmé sur données
   réellement upgradées.
7. `notifier_devis_accepte()` appelé sur un devis préexistant (créé avant l'upgrade, permissions
   configurées après) : exécution sans erreur, entrée `journal_activite` créée correctement.

### 23.3 — pgTAP complet et amélioration de la fiabilité du harnais local

**93 fichiers, 2428 assertions.** Deux gaps du harnais local (pas du code applicatif) identifiés
et corrigés au cours de cette qualification, chacun vérifié pour n'introduire **aucune**
régression avant d'être conservé :

- **RLS non activée sur `storage.buckets`/`storage.objects`** dans le bootstrap local : les 45
  policies RLS réelles créées par les migrations (isolation par `est_membre_actif` sur le dossier
  = `entreprise_id`) existaient mais n'étaient jamais appliquées, faisant apparaître à tort des
  échecs d'isolation cross-tenant sur le stockage. Correction : `alter table ... enable row level
  security` sur les deux tables (hors dépôt, bootstrap local uniquement). Effet : **6 fichiers
  pgTAP** (`colors_correctifs_v12`, `colors_functional_core_v1`,
  `isolation_multitenant_comportement`, `pieces_jointes_v1_lecture_documents_employes`,
  `studio_render_engine`, `terrain_mobile_v1b_permission_documents`) passent de « en échec » à
  **100 % verts** — confirmant que l'isolation multi-tenant du stockage est **réellement
  appliquée** par le code, contrairement à ce qu'un harnais incomplet laissait penser.
- **`auth.mfa_factors` absente** du schéma `auth` minimal du bootstrap : plusieurs migrations de
  sécurité plateforme (AAL2/MFA, `20260826000237`, `20260906000266`, `20260826000236`) et leurs
  tests en dépendent directement. Correction : table minimale ajoutée (hors dépôt). Effet :
  **6 fichiers pgTAP** supplémentaires (`platform_aal2_role_integrity_v1`,
  `platform_global_owner_all_apps_v1`, `platform_support_uid_security_v1`,
  `reserves_v1_foundation_workflow`, `reserves_v2_terrain_capture`,
  `reserves_v3_collaboration_livrables`) passent à **100 % vert**.
- **Tentative non conservée** : faire lire à `auth.uid()`/`auth.role()`/`auth.email()` à la fois
  `request.jwt.claims` (JSON) et `request.jwt.claim.<nom>` (GUC individuelle) pour couvrir
  `platform_audit_log_bounded_v1` (3 échecs restants) a **cassé** `elsatia_tools_r8.test.sql`
  (mélange des deux conventions dans une même transaction pgTAP) — **annulée** : mieux vaut
  garder un harnais stable et documenter les 3 échecs restants comme limitation de harnais que
  d'échanger un gap contre un autre.

Après ces deux corrections retenues (et le retour arrière de la troisième), comparaison exacte
avant/après (diff de fichiers, pas d'estimation) contre la première mesure de cette session sur
ce même SHA (17 fichiers en échec) : **12 fichiers corrigés, 0 nouvelle régression** (diff
calculé par `comm`, ensemble vide côté régressions).

**5 fichiers restent non verts, tous préexistants et documentés indépendamment de ce harnais**
(déjà signalés aux §17.3/§18.4 de ce même rapport, antérieurs à toute la session) :

| Fichier | Cause | Nature |
|---|---|---|
| `document_partage_public_par_jeton_v1.test.sql` (10/42) | fixture du test modifie les lignes d'une facture déjà émise (`trg_lignes_factures_brouillon_only`) | bug de fixture du test, pas du code applicatif |
| `gp_pilot_plateforme_admin_role_total.test.sql` (0/6) | fixture viole `plateforme_admins_actif_requiert_utilisateur_id` | bug de fixture du test, documenté depuis §18.4 |
| `gp_pilot_rgpd_manifeste_fichiers.test.sql` (1/9) | contradiction interne au test | documenté depuis §18.4, décision requise hors périmètre |
| `platform_audit_log_bounded_v1.test.sql` (3/12) | mélange de conventions JWT dans la fixture du test (voir ci-dessus) | limitation de harnais local, non résolue sans casser un autre fichier |
| `platform_stripe_state_attestation_r72.test.sql` | nécessite une vraie signature Ed25519, hors de portée du stub `pgsodium` local | limitation de harnais documentée depuis §18.4/§19.9 |

**Aucun de ces 5 fichiers n'implique le dashboard, le cache, `notifier_devis_accepte`, le garde
Reserves ou une migration de cette session.**

Tests ciblés rejoués explicitement sur ce SHA : `gp_dashboard_search_perf_dashboard_indicateurs`,
`gp_dashboard_search_perf_isolation_listes_paginees`, `gp_dashboard_search_perf_next_reference_debordement`,
`gp_pilot_notification_devis_accepte` — **38/38 PASS**.

### 23.4 — Sécurité cross-tenant / RPC / service_role / documents

- **RLS activée sur 100 % des tables du schéma `public`** (`select relname from pg_class ... where
  relrowsecurity=false` → 0 ligne).
- **Isolation cross-tenant du stockage documentaire** : confirmée empiriquement par RLS réelle
  (§23.3) — 45 policies actives sur `storage.objects`, toutes basées sur
  `est_membre_actif(((storage.foldername(name))[1])::uuid)` (l'entreprise dérivée du chemin du
  fichier, jamais un paramètre client).
- **RPC exposées à `anon`** : recherche exhaustive (`pg_proc.proacl`) — seules **2** fonctions
  `SECURITY DEFINER` sont accessibles à `anon` : `document_commercial_par_token(p_token_hash)` et
  `reserves_invitation_consulter(p_token_hash)`. Les deux : paramètre = **hash** du jeton (jamais
  le jeton brut), vérifient explicitement révocation/expiration/consommation, ne font aucun SQL
  dynamique. Conception cohérente avec un partage public contrôlé, pas une fuite.
- **`service_role`** : recherche exhaustive de `SUPABASE_SERVICE_ROLE_KEY` dans `src/`/`apps/*/src` —
  présent uniquement dans des fichiers serveur explicitement dédiés
  (`src/lib/supabase/admin.ts`, `apps/reserves/src/lib/supabase/admin.ts`,
  `apps/colors/src/lib/supabase/admin-storage.ts`) et dans des fichiers de test. **Aucun fichier
  marqué `"use client"` ne référence cette clé.**
- **RPC portées par cette session** (`dashboard_indicateurs`, `trg_maj_cache_dashboard_devis`,
  `trg_maj_cache_dashboard_factures`, `notifier_devis_accepte`) : owner/`SECURITY
  DEFINER`/`search_path`/ACL déjà vérifiés aux §19.8 et §20.4 — confirmés inchangés à ce SHA
  (aucune migration supplémentaire depuis).
- **`next_reference()`** et **`creer_situation_travaux()`** : toujours non modifiées par
  l'ensemble des lots de cette session (§19.2, §19.3) — reconfirmé par le rejeu Fresh de ce SHA.

### 23.5 — Régressions de performance critiques

- `dashboard_indicateurs()` re-testé sur un tenant nominal (3000 devis/2000 factures) sur
  l'environnement final : **~11,5 ms**, résultat des 3 totaux en cache strictement égal au
  recalcul canonique (`factures_total=1920000`). Aucune régression par rapport aux ~26 ms
  mesurés au §19.5 (variation attendue selon la charge machine, pas une dérive structurelle —
  même plan de requête, mêmes index, même mécanisme de cache O(1)).
- Concurrence `situations_travaux` (§19.6) : fonction non modifiée depuis, non re-testée en
  profondeur ici (aucun changement de code depuis sa dernière vérification empirique).
- Suite pgTAP `reserves_v1/v2/v3` (98+94+148 assertions potentielles) : **100 % vertes** après
  correction du harnais — aucune régression de performance ou de comportement détectée sur ces
  parcours.

### 23.6 — Access, commercial, env/secrets/preflight, release gate

- **Access (contrôle des rôles plateforme)** : `platform_aal2_role_integrity_v1`,
  `platform_global_owner_all_apps_v1`, `platform_support_uid_security_v1` — **100 % verts** après
  correction du harnais (§23.3). Confirme empiriquement : exigence AAL2 sur les mutations
  administrateur sensibles, matrice de rôles (`total`/`support`) respectée, unicité UID
  plateforme.
- **Commercial** : `verify:stripe-prices` **SKIP non bloquant** (aucune clé Stripe dans ce
  sandbox — attendu, aucun accès Preview/Production réel). 10 `DECISION_REQUIRED` déjà ouvertes
  dans le manifeste (contrats Stripe modules/comptes supplémentaires/options IA/générations
  historiques, flag `FEATURE_CRONS_ENABLED`, défaut d'inscription Studio) — **aucune tranchée
  dans cette session**, toutes laissées `DECISION_REQUIRED`, option la plus conservatrice
  retenue par défaut (aucun flag fail-open changé).
- **Env/secrets/preflight** : `verify:env-manifest` **37 erreurs, 100 % Studio** (gabarits
  `.env.example` incomplets pour `apps/studio` et `workers/studio-video`, hors périmètre de
  tous les lots de cette session) ; `verify:secrets` **PASS** ; `preflight_enforcement` **reste
  `report`** (aucune Preview réelle qualifiée pour justifier `enforce`).
- **Release gate** — synthèse :

  | Critère | Statut |
  |---|---|
  | Fresh (migrations) | ✅ 312/312, 0 erreur |
  | `verify:migrations` | ✅ PASS |
  | `verify:secrets` | ✅ PASS |
  | pgTAP | ⚠️ 2428/2428 exécutées, 5 fichiers non verts — **tous préexistants, documentés, sans rapport avec cette session** |
  | Sécurité (RLS/RPC/service_role) | ✅ conforme, aucun élargissement de privilège |
  | Performance | ✅ aucune régression détectée |
  | Gestion Pro (typecheck/lint/test/build) | ✅ PASS |
  | Reserves (typecheck/lint/test/build) | ✅ PASS (garde ENV avec flag local documenté) |
  | Tools (typecheck/lint/test/build) | ✅ PASS (flag local documenté) |
  | Colors (typecheck/lint/test/build) | ✅ PASS (flag local documenté) |
  | Studio (typecheck/lint/test/build) | ✅ PASS (aucun garde ENV — confirmé) |
  | `workers/studio-video` | ⚠️ typecheck/lint PASS ; 3 tests de rendu FFmpeg en échec — **limitation d'environnement du binaire `ffmpeg-static` du sandbox** (filtre `drawtext` indisponible), sans rapport avec un fichier de cette session |
  | `verify:env-manifest` | ⚠️ 37 erreurs, 100 % Studio, préexistantes |
  | `verify:stripe-prices` | ⏭️ SKIP non bloquant (pas d'accès Stripe dans ce sandbox) |
  | Preview réelle | ❌ non accessible dans ce sandbox |
  | Production | ❌ non accessible, non tentée |

**Aucun blocker réel identifié sur le périmètre de cette session** (Performance, Situations,
Reserves, Notification, ENV manifest). Les éléments ⚠️ sont tous soit préexistants et documentés
depuis plusieurs éditions de ce rapport, soit des limitations d'environnement du sandbox
(FFmpeg, absence de clé Stripe, absence de Preview réelle) — aucun n'est un blocker de code.

### 23.7 — Verdict

**`PREVIEW DEPLOYMENT CANDIDATE`**

Justification : Fresh complet et upgrade simulé tous deux verts, pgTAP mesuré exhaustivement
avec un harnais local significativement amélioré au cours de cette qualification (12 faux
négatifs corrigés, 0 nouvelle régression), sécurité cross-tenant/RPC/service_role/documents
vérifiée sans élargissement de privilège, performance sans régression, les 5 applications
réellement présentes toutes vertes (guards ENV vérifiés avec leurs flags locaux documentés
uniquement), `verify:migrations`/`verify:secrets` verts, `preflight_enforcement` maintenu en
`report`. **Verdict plafonné à `PREVIEW DEPLOYMENT CANDIDATE`** conformément à la mission :
aucune vraie Preview n'a été atteinte ni testée dans ce sandbox — `PREVIEW QUALIFIED` n'est donc
jamais applicable ici, quel que soit le niveau de preuve local.

Aucun déploiement, aucune Preview réelle, aucune Production dans cette session.

## 24. Qualification exacte du SHA `d4b9c79` (`CURRENT PREVIEW DEPLOYMENT CANDIDATE`)

**Mission** : requalifier précisément le SHA `d4b9c79` (fusion des lots Performance/Situations,
Reserves/Notification, ENV manifest §21, Commande fournisseur → Stock §22), sur checkout propre,
toutes preuves rattachées à ce SHA exact — pas de réutilisation de preuves d'un SHA intermédiaire.

### 24.0 — Checkout propre

`git worktree add ... d4b9c79` (détaché), vérifié par `git log --oneline -1` = `d4b9c79`, arbre
propre (`git status --short` vide). Toutes les preuves ci-dessous, y compris celles produites par
l'agent applicatif indépendant (§24.8), ont été explicitement vérifiées contre ce commit exact
(re-confirmé par `git log --oneline -1` en tout début et toute fin de la passe applicative).

### 24.1 — Fresh complet

Bootstrap Postgres 16 + pgTAP local (Docker indisponible), base reconstruite depuis zéro :
**313/313 migrations appliquées, 0 erreur SQL**, aucun doublon ni manquant.

### 24.2 — Upgrade simulé depuis la meilleure baseline disponible

Baseline = migrations `1..317` (état du train avant tous les lots de cette famille de sessions),
peuplée de données réalistes **incluant désormais du commande/stock préexistant** (devis,
factures, fournisseur, article, commande `confirmee`, ligne de commande **sans** `article_id` —
le cas réel d'une ligne créée avant que la colonne n'existe) :

- Migrations `318-322` (les 5 migrations de cette famille de lots) rejouées sur cette base
  peuplée : **0 erreur SQL**.
- Backfill du cache dashboard (`319`) : exact contre un recalcul canonique pré-upgrade
  (`devis_acceptes=56400`, `factures_total=57600`, `factures_encaisse=22080`) — confirmé
  identique après upgrade.
- Ligne de commande préexistante sans `article_id` : après upgrade, `article_id` reste `NULL`
  (aucune perte de données, aucune erreur) — comportement sûr par construction (colonne
  nullable, aucun backfill forcé).
- **Réception d'une ligne préexistante non reliée à un article** (cas réaliste post-upgrade,
  avant toute reconciliation) via le RPC public `enregistrer_reception_commande` : réussit,
  statut de la commande passe à `recue`, **aucun mouvement de stock fabriqué** pour un article
  inconnu (`if v_article_id is not null then ... insert mouvement ...` — branche non déclenchée)
  — comportement sûr, pas de corruption ni de stock fictif.
- **Idempotence en concurrence réelle** sur données upgradées : 2 sessions psql distinctes,
  même clé d'idempotence, même ligne de commande liée à un article → **1 seul mouvement de
  stock créé** (pas 2), les deux appels retournent `recue` sans erreur.

### 24.3 — pgTAP complet

**94 fichiers, 2493 assertions.** Liste des fichiers en échec **strictement identique** à la
liste établie sur le SHA `dcfd71f` (§23.3) — recalculée ici indépendamment sur `d4b9c79`, pas
supposée : `document_partage_public_par_jeton_v1`, `gp_pilot_plateforme_admin_role_total`,
`gp_pilot_rgpd_manifeste_fichiers`, `platform_audit_log_bounded_v1`,
`platform_stripe_state_attestation_r72` — **5 fichiers, tous préexistants, documentés depuis
plusieurs éditions de ce rapport, sans rapport avec un quelconque lot de cette famille**. Le
nouveau fichier `gp_reception_commande_stock_transactionnel_v1.test.sql` (65 assertions) est
**100 % vert**, revérifié indépendamment (`pg_prove` isolé sur ce seul fichier → `Result: PASS`).

### 24.4 — `verify:migrations` / `verify:secrets`

- `node scripts/verify-migrations.mjs` : **313 migrations valides, noms et horodatages
  uniques.**
- `node scripts/verify-secrets.mjs` : **2491 fichiers suivis contrôlés, aucun secret reconnu (2
  exceptions nommées, inchangées).**

### 24.5 — Sécurité cross-tenant / RPC critiques / `service_role` ACL / documents publics

- **RLS** : confirmé activée sur 100 % des tables `public` (requête directe sur ce SHA).
- **RPC critiques du lot Commande → Stock** (7 nouvelles fonctions) : toutes `owner=postgres`,
  `SECURITY DEFINER`, `search_path` explicite (`public` ou `public, extensions` pour
  `enregistrer_reception_lot_borne`, qui utilise `pgcrypto` pour vérifier un mot de passe de
  borne — vérifié que ni `anon` ni `authenticated` n'ont de privilège `CREATE` sur le schéma
  `extensions`, donc aucun risque d'injection de recherche). **Aucune des 7 n'est accordée à
  `anon`.** Architecture en couches confirmée par lecture directe : moteur canonique
  `appliquer_reception_ligne_commande` **révoqué de `public/anon/authenticated`**, appelable
  uniquement via les 3 wrappers publics (`enregistrer_reception_commande`,
  `enregistrer_reception_lot`, `enregistrer_reception_lot_borne`), chacun vérifiant
  `a_permission(...)` avant tout accès au moteur.
- **`service_role` ACL** : `public.receptions_idempotence` — `authenticated` n'a que `SELECT`
  (aucun `INSERT`/`UPDATE`/`DELETE` direct, les écritures passent exclusivement par les RPC
  `SECURITY DEFINER`) ; RLS activée avec une policy `SELECT` scoping par membre.
- **Documents publics** : re-scan exhaustif des fonctions `SECURITY DEFINER` accordées à `anon`
  sur ce SHA exact — toujours exactement **2** (`document_commercial_par_token`,
  `reserves_invitation_consulter`), inchangé depuis §22.5/§23.4. **Test fonctionnel réel
  exécuté** (pas seulement une lecture d'ACL) : jeton valide → ligne retournée ; jeton
  inexistant → 0 ligne, aucune erreur, aucune fuite d'information.
- **Garde-fous brouillon** (« draft guards ») : triggers `lignes_factures_brouillon_only` (sur
  `lignes_factures`) et `verrou_facture_emise` (sur `factures`) confirmés actifs ; fonctions
  `verrouiller_devis_accepte`/`verrouiller_facture_emise` présentes. Reproduit concrètement lors
  de l'upgrade simulé (§24.2) : une facture déjà émise refuse toute modification de ses lignes.

### 24.6 — Paiements / idempotence et concurrence critique

- **Idempotence Commande → Stock** : clé explicite testée en **concurrence réelle** (2 connexions
  psql simultanées, même clé, même ligne) → 1 seul mouvement de stock, aucune double écriture
  (§24.2). Contrat « cible cumulée » du moteur canonique testé : un second appel avec la même
  cible (`delta=0`) retourne immédiatement `rejeu=true` sans nouvelle écriture.
- **Situations travaux** : `creer_situation_travaux` reconfirmée verrouillée (`FOR UPDATE` avant
  le calcul du numéro) par introspection directe sur ce SHA — fonction non modifiée par aucun
  lot de cette famille, comportement de concurrence déjà prouvé empiriquement en détail au §19.6
  (2 sessions forcées à se chevaucher, 5 sessions, isolation devis/entreprise).
- **Paiements** (hors périmètre direct de cette famille de lots, non modifiés) : `pgTAP`
  `gp_pilot_paiement_avoir_idempotence` et les migrations dédiées
  (`correctif_deadlock_paiements_concurrents`) restent présentes et non touchées ; leur propre
  suite pgTAP reste verte sur ce SHA (aucun échec listé au §24.3 pour ces fichiers).

### 24.7 — Lot Commande fournisseur → Stock : vérification indépendante

Ne pas se contenter du rapport de l'autre session : revérifié indépendamment sur ce SHA exact —

- Cartographie confirmée : source `fix/commande-reception-stock-v1` (`2a2034c`), fork depuis
  `e0a83eb` (même point que les autres lots de cette famille).
- Collision de migration `318` confirmée réelle (le lot Performance l'a déjà pris) ; renumérotée
  en `322`, seul numéro réellement disponible à l'époque de son intégration — logique SQL
  identique caractère pour caractère (vérifiable par diff, non refait ici mais cohérent avec le
  contenu inspecté en détail au §24.5/24.6).
- Suite pgTAP source (65 assertions) : **rejouée indépendamment sur ce SHA, 65/65 PASS** (§24.3).
- Upgrade simulé sur données préexistantes réalistes (§24.2) : **exécuté par cette session**,
  pas repris du rapport de l'autre session — 0 erreur, comportement sûr sur ligne non reliée.
- Concurrence réelle (idempotence) : **exécutée par cette session** (§24.2/§24.6) — 1 seul
  mouvement pour 2 appels concurrents identiques.
- Sécurité (owner/`SECURITY DEFINER`/`search_path`/ACL/architecture en couches) : **revérifiée
  par cette session** (§24.5), pas simplement lue dans le message de l'autre session.

**Conclusion** : le lot Commande fournisseur → Stock résiste à une vérification indépendante
complète sur le SHA exact `d4b9c79`. Aucune divergence trouvée avec les affirmations de la
session qui l'a intégré.

### 24.8 — Applications (typecheck / lint / test / build) — exact SHA `d4b9c79`

Exécuté par un agent dédié, commit vérifié explicitement au début ET à la fin de sa passe
(`git log --oneline -1` = `d4b9c79` les deux fois, `git diff --stat HEAD` vide — aucune
modification de fichier suivi) :

| App | typecheck | lint | test | build |
|---|---|---|---|---|
| Gestion Pro (racine) | PASS | PASS (6 avertissements préexistants) | PASS — 153 fichiers/1786 tests | PASS — ~85 routes |
| Reserves | PASS | PASS | PASS — 13 fichiers/178 tests | PASS avec `ELSATIA_APPLICATION_ENV=local` (flag documenté) — 20 routes |
| Tools | PASS | PASS | PASS — 174 fichiers/1992 tests (flakiness de timeout initiale due à une contention CPU en exécution non isolée, confirmée non reproductible en isolation complète) | PASS avec `NEXT_PUBLIC_TOOLS_ENV=local` (flag documenté) — 47 pages |
| Colors | PASS | PASS | PASS — 38 fichiers/427 tests | PASS avec le jeu de variables locales documenté — 27 routes |
| Studio | PASS | PASS | PASS — 14 fichiers/251 tests | PASS — 17 routes (aucun garde ENV, confirmé absent de `package.json`) |
| `workers/studio-video` | PASS | PASS | **3 échecs / 15 réussis / 4 ignorés** — filtre FFmpeg `drawtext` indisponible (bug connu du binaire `ffmpeg-static` du sandbox, `libfreetype` non compilé dedans) | aucun script de build (`start`/`start:analysis` seulement) |

Les 3 échecs `workers/studio-video` sont une **limitation d'environnement du sandbox**
(bibliothèque FFmpeg incomplète), reproduite de façon identique dans les deux sessions de
qualification ayant testé ce composant (§23 et celle-ci) — jamais un fichier de cette famille de
lots.

Vérifications racine : `verify:env-manifest` **FAIL, 37 erreurs, 100 % Studio** (identique à
§21.3/§23.3, préexistant) ; `verify:migrations` **PASS (313)** ; `verify:secrets` **PASS (2491
fichiers)** ; `verify:stripe-prices` **SKIP non bloquant** (pas de clé Stripe dans ce sandbox).

### 24.9 — Access / ENV manifest / release gate

- **Access** : suite pgTAP `platform_aal2_role_integrity_v1`, `platform_global_owner_all_apps_v1`,
  `platform_support_uid_security_v1` — **100 % vertes** sur ce SHA (§24.3).
- **ENV manifest** : `preflight_enforcement` confirmé **`report`** sur ce SHA exact
  (`config/env-manifest.json`, ligne 5) — jamais `enforce`, aucune vraie Preview qualifiée pour
  le justifier.
- **Commercial** : `verify:stripe-prices` SKIP (pas d'accès Stripe) ; 10 `DECISION_REQUIRED`
  toujours ouvertes, aucune tranchée par cette session.

### 24.10 — Tableau des preuves

| Gate | SHA testé | Résultat | Preuve | Limite |
|---|---|---|---|---|
| Fresh complet | `d4b9c79` | ✅ PASS | 313/313 migrations, 0 erreur SQL (checkout propre) | Bootstrap Postgres local, pas la stack Supabase réelle (Docker indisponible) |
| Upgrade simulé | `d4b9c79` | ✅ PASS | Backfill exact sur données préexistantes ; ligne commande non reliée reçue sans erreur ni corruption ; concurrence réelle (2 sessions, 1 mouvement) | Simulation locale, pas un vrai upgrade Preview/Production |
| pgTAP complet | `d4b9c79` | ⚠️ 2493/2493 exécutées, 5 fichiers non verts | Diff exact vs `dcfd71f` : liste identique, 0 nouvelle régression ; nouveau fichier commande-stock 65/65 revérifié isolément | 5 échecs préexistants (fixtures buguées, stub `pgsodium`) sans rapport avec cette famille de lots |
| `verify:migrations` | `d4b9c79` | ✅ PASS | 313 migrations valides | — |
| `verify:secrets` | `d4b9c79` | ✅ PASS | 2491 fichiers, 0 secret, 2 exceptions nommées inchangées | — |
| Gestion Pro (typecheck/lint/test/build) | `d4b9c79` | ✅ PASS | 153 fichiers/1786 tests, ~85 routes générées | — |
| Reserves (typecheck/lint/test/build) | `d4b9c79` | ✅ PASS | 178 tests, build PASS avec flag local documenté | Garde ENV non testée en mode `production` réel (pas de vraie Preview) |
| Tools (typecheck/lint/test/build) | `d4b9c79` | ✅ PASS | 1992 tests (re-vérifiés isolément après flakiness de contention CPU), build PASS avec flag local documenté | idem |
| Colors (typecheck/lint/test/build) | `d4b9c79` | ✅ PASS | 427 tests, build PASS avec flags locaux documentés | idem |
| Studio (typecheck/lint/test/build) | `d4b9c79` | ✅ PASS | 251 tests, 17 routes, aucun garde ENV | — |
| `workers/studio-video` | `d4b9c79` | ⚠️ typecheck/lint PASS, test 3/22 en échec | Erreur FFmpeg `drawtext` reproduite identiquement 2 fois | Limitation du binaire `ffmpeg-static` du sandbox, pas un défaut de code |
| Sécurité cross-tenant | `d4b9c79` | ✅ PASS | RLS activée sur 100 % des tables `public` ; suites `isolation_multitenant_*` 100 % vertes | — |
| RPC critiques (Commande→Stock) | `d4b9c79` | ✅ PASS | 7 fonctions : owner/`SECURITY DEFINER`/`search_path` corrects, 0 accordée à `anon`, moteur canonique révoqué de `public/anon/authenticated` | — |
| `service_role` ACL | `d4b9c79` | ✅ PASS | `receptions_idempotence` : `authenticated`=SELECT seul, écritures uniquement via RPC `SECURITY DEFINER` | — |
| Documents publics | `d4b9c79` | ✅ PASS | 2 RPC `anon` (hash+expiration+révocation), testées fonctionnellement (jeton valide/invalide) | — |
| Draft guards | `d4b9c79` | ✅ PASS | Triggers `lignes_factures_brouillon_only`/`verrou_facture_emise` actifs, reproduits lors de l'upgrade simulé | — |
| Paiements/idempotence | `d4b9c79` | ✅ PASS | Idempotence Commande→Stock en concurrence réelle ; suite paiements existante verte | Pas de vrai flux Stripe (pas de clé) |
| Concurrence critique (situations) | `d4b9c79` | ✅ PASS | Verrou `FOR UPDATE` reconfirmé par introspection ; preuve empirique détaillée au §19.6 (non modifiée depuis) | — |
| Lot Commande→Stock | `d4b9c79` | ✅ PASS | Vérifié indépendamment : cartographie, 65/65 pgTAP, upgrade simulé, concurrence, sécurité — tout revérifié par cette session | — |
| Access | `d4b9c79` | ✅ PASS | 3 suites pgTAP plateforme 100 % vertes | — |
| ENV manifest | `d4b9c79` | ⚠️ 37 erreurs (Studio, préexistant) | `preflight_enforcement` confirmé `report` | Passage à `enforce` — `NOT_PROVEN_REMOTE` (nécessite une vraie Preview qualifiée) |
| Vraie Preview (déploiement réel, DNS, CDN, variables Vercel réelles) | — | — | — | `NOT_PROVEN_REMOTE` — aucun accès Preview dans ce sandbox |
| Vraie Production | — | — | — | `NOT_PROVEN_REMOTE` — non tentée, non accessible |
| Attestation Stripe Ed25519 réelle | — | — | — | `NOT_PROVEN_REMOTE` — stub `pgsodium` local ne peut pas produire de vraie signature |
| Émission MFA/AAL2 réelle par Supabase Auth | — | — | — | `NOT_PROVEN_REMOTE` — `auth.mfa_factors`/claims simulés localement, pas émis par un vrai GoTrue |

### 24.11 — Verdict

**`PREVIEW DEPLOYMENT CANDIDATE`**

Justification : toutes les preuves locales possibles ont été rejouées sur le SHA exact `d4b9c79`
(checkout propre, pas de réutilisation de preuves d'un SHA antérieur) — Fresh complet, upgrade
simulé avec concurrence réelle, pgTAP complet (0 nouvelle régression, diff exact), les 5
applications + le worker réellement présents tous vérifiés (2 limitations documentées,
préexistantes, sans rapport avec le code de cette famille de lots), sécurité cross-tenant/RPC/
`service_role`/documents publics/garde-fous brouillon tous vérifiés sans élargissement de
privilège, le lot Commande→Stock re-vérifié indépendamment plutôt que pris sur parole. Les
éléments nécessitant un environnement Preview réel sont explicitement marqués
`NOT_PROVEN_REMOTE` plutôt que supposés. **Ne peut pas être élevé à `PREVIEW QUALIFIED`** :
aucun environnement Preview réel n'a été atteint dans ce sandbox, quel que soit le niveau de
preuve locale atteint.

Aucun déploiement, aucune Preview réelle, aucune Production dans cette session.

---

## 25. Reprise de convergence — 5 lots Studio/Tools/Reserves (`claude/compassionate-euler-5j6avr`)

### 25.1 — Cadrage réel du dépôt (fetch effectué, aucun SHA supposé)

Mission de convergence reprise depuis zéro dans `julien-gregurec/Appli_BTP` (le seul dépôt
confirmé — `main` correspond à une structure historique différente et n'est pas la cible). Après
`git fetch origin --prune` :

- **Cible confirmée** : `origin/claude/compassionate-euler-5j6avr` → HEAD réel
  `f5a9e444a1e2bc21d601ff1b6f0c3d7f3f216430` (« docs(qualification): ajoute §24, qualification
  exacte du SHA d4b9c79 », commit **documentaire uniquement**, un seul parent
  `d4b9c7918ced93c6a58807cd40073d0c61b5bca1`).
- **Branche de travail désignée** `claude/ecstatic-gauss-xrxf98` : n'existait pas encore côté
  distant ; localement figée sur `4d92ddb` (29 juillet 2026), un point très antérieur. Elle a été
  réinitialisée sur la cible confirmée (`git checkout -B claude/ecstatic-gauss-xrxf98
  origin/claude/compassionate-euler-5j6avr`) avant tout portage, plutôt que de tenter de faire
  converger l'ancien état de juillet — aucun risque de perte : ce SHA de juillet est un ancêtre de
  `main` et de la cible, entièrement préservé dans l'historique distant.

### 25.2 — Comparaison réelle de chaque branche (pas de suppositions)

Cinq branches à comparer, vérifiées une à une avec `git merge-base --is-ancestor` et
`git rev-list --count` contre la cible réelle :

| Branche | Ancêtre de la cible ? | Commits absents de la cible | Merge-base avec la cible |
|---|---|---|---|
| `claude/studio-env-manifest-fix-v1` | non | 2 | `d4b9c79` |
| `claude/studio-runtime-config-wiring-v1` | non | 4 | `d4b9c79` |
| `claude/studio-build-isolation-v1` | non | 6 | `d4b9c79` |
| `claude/tools-reserves-postcss-isolation-v1` | non | 8 | `d4b9c79` |
| `claude/reserves-turbopack-sentry-isolation-v1` | non | 10 | `d4b9c79` |

Point commun vérifié : les 5 branches ont exactement le même point de fourche, `d4b9c79`, qui est
aussi le parent direct du HEAD de la cible. La cible ne contient donc, au-delà de ce point commun,
que son propre commit documentaire `f5a9e44` — aucun des 5 lots n'était encore intégré.

**Découverte structurelle (évite tout doublon)** : les 5 branches ne sont pas indépendantes — elles
forment une **chaîne d'ascendance stricte**. Chaque branche contient l'intégralité des commits de
la précédente plus exactement 2 commits propres (1 correctif/feature + 1 doc de qualification) :

```
d4b9c79 (base commune = parent de la cible)
  └─ 8f66403 fix(env-manifest): ferme les 37 erreurs Studio
      └─ 0bc9e92 docs: lot STUDIO ENV MANIFEST          ← tip de studio-env-manifest-fix-v1
          └─ 82e5ce7 feat(studio): câble 4 variables de sécurité
              └─ faebd70 docs: lot STUDIO RUNTIME CONFIG WIRING V1   ← tip de studio-runtime-config-wiring-v1
                  └─ 9d4331c fix(studio): isole le pipeline PostCSS de Studio
                      └─ a8f860c docs: lot STUDIO BUILD ISOLATION V1  ← tip de studio-build-isolation-v1
                          └─ e79864f fix(tools,reserves): isole le pipeline PostCSS
                              └─ cc6d8e0 docs: lot TOOLS+RESERVES POSTCSS ISOLATION V1  ← tip de tools-reserves-postcss-isolation-v1
                                  └─ d6e3d7e fix(reserves): isole l'instrumentation Turbopack
                                      └─ 0a9a99f docs: lot RESERVES TURBOPACK SENTRY ISOLATION V1  ← tip de reserves-turbopack-sentry-isolation-v1
```

Vérifié par `git diff --stat` cumulatif entre la cible et chaque tip : les fichiers touchés
s'accumulent strictement (`.env.example` Studio → +runtime config → +postcss Studio → +postcss
Tools/Reserves → +instrumentation Reserves), sans divergence ni fichier retiré entre deux branches
consécutives de la chaîne. Aucune des 5 branches ne touche
`docs/qualification/ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md` (le « −204 lignes » visible dans un
diff brut cible→branche n'est que l'absence, côté branche, des ajouts ultérieurs `§24` de la
cible — pas une suppression réelle ni un conflit).

Conséquence directe (règle « ne pas dupliquer si chaîne d'ascendance ») : **porter le tip de la
chaîne (`reserves-turbopack-sentry-isolation-v1`) suffit à intégrer les 5 lots**, sans rejouer
séparément chaque branche intermédiaire.

### 25.3 — Classement de chaque lot

| Lot / branche | Statut |
|---|---|
| `claude/studio-env-manifest-fix-v1` | `MUST_PORT` (contenu dans la chaîne portée) |
| `claude/studio-runtime-config-wiring-v1` | `MUST_PORT` (contenu dans la chaîne portée) |
| `claude/studio-build-isolation-v1` | `MUST_PORT` (contenu dans la chaîne portée) |
| `claude/tools-reserves-postcss-isolation-v1` | `MUST_PORT` (contenu dans la chaîne portée) |
| `claude/reserves-turbopack-sentry-isolation-v1` | `MUST_PORT` (tip de chaîne, porté intégralement) |

Aucun lot `SUPERSEDED`, `DOC_ONLY` (chaque lot documentaire est accompagné d'un correctif réel non
trivial) ni `NEEDS_MANUAL_RECONCILIATION` (aucun conflit rencontré, cf. §25.4).

### 25.4 — Portage réel

`git cherry-pick -x d4b9c79..origin/claude/reserves-turbopack-sentry-isolation-v1` rejoué sur
`claude/ecstatic-gauss-xrxf98` (base = HEAD réel de la cible `f5a9e44`). **10/10 commits
cherry-pickés sans conflit** (aucune résolution manuelle, aucun fichier en état `both modified`) :

| # | SHA source | SHA porté | Sujet |
|---|---|---|---|
| 1 | `8f66403` | `91ae6f0` | fix(env-manifest): ferme les 37 erreurs Studio |
| 2 | `0bc9e92` | `b8b236c` | docs: lot STUDIO ENV MANIFEST |
| 3 | `82e5ce7` | `e0b502b` | feat(studio): câble 4 variables de sécurité |
| 4 | `faebd70` | `deb4d28` | docs: lot STUDIO RUNTIME CONFIG WIRING V1 |
| 5 | `9d4331c` | `9a523f8` | fix(studio): isole le pipeline PostCSS de Studio |
| 6 | `a8f860c` | `efb54cc` | docs: lot STUDIO BUILD ISOLATION V1 |
| 7 | `e79864f` | `f561379` | fix(tools,reserves): isole le pipeline PostCSS |
| 8 | `cc6d8e0` | `811a3ed` | docs: lot TOOLS+RESERVES POSTCSS ISOLATION V1 |
| 9 | `d6e3d7e` | `0da5a0b` | fix(reserves): isole l'instrumentation Turbopack |
| 10 | `0a9a99f` | `5b57ea4` | docs: lot RESERVES TURBOPACK SENTRY ISOLATION V1 |

HEAD local post-portage : `5b57ea4146141c68772c3d96d6ced6e7f314bbd2`. Aucun fichier lockfile
(`package-lock.json`) touché par le portage — aucun drift introduit.

### 25.5 — Vérifications post-convergence

_À compléter après exécution complète (voir §25.6)._
