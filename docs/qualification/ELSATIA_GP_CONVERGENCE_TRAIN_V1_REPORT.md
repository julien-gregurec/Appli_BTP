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

### 16.9 — Statut après ce lot

`CONVERGENCE_TRAIN_CANDIDATE = 67b1564` (branche `claude/compassionate-euler-5j6avr`, à pousser). `FINAL_PREVIEW_TRAIN = NOT_YET`.

C'était le 6ᵉ et dernier lot de la liste transmise. **Aucun des deux `DECISION_REQUIRED` du lot Studio (§16.4, §16.5) n'est tranché** ; le train reste un candidat de convergence, pas une base Preview qualifiée. Aucun déploiement, aucune Preview, aucune Production.
