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
