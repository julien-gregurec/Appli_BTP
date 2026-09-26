# ELSATIA — Pilot Quick Wins Closure (V1)

Mission courte : traiter **uniquement** les 4 quick wins identifiés par
`docs/qualification/ELSATIA_PILOT_REMAINING_FAILS_TRIAGE_V1.md` — `PE-06`,
`CH-08`, `CM-06`, `PL-05`. Les 6 autres `FAIL` de la matrice V3 ne sont pas
touchés. Aucun refactor, aucun merge vers `main`.

Chaque cas a été **reproduit par exécution réelle avant tout correctif**, et
chaque ligne « BEFORE » ci-dessous est une mesure, pas une lecture de code.

---

## 0. Base de travail et provenance

| Élément | Référence |
|---|---|
| Branche de travail (seule branche poussée) | `claude/brave-feynman-6ogvtq` |
| Base | `origin/claude/loving-turing-aaopod` (`4056c5f3`) — seule branche portant les artefacts ELSATIA (tests `tests/e2e/pilot-acceptance-v3.spec.ts`, scripts `scripts/local-postgres-bootstrap/`, rapport V3) |
| Rapport de triage repris | `origin/claude/eager-ptolemy-ro5m59` (`0bcc3559`), cherry-pick du seul commit de documentation |
| `main` | `4d92ddbe` — **ne contient aucun artefact ELSATIA** (ni `tests/`, ni le rapport V3) : vérifié par `git ls-tree`, d'où le choix de base ci-dessus |

`git fetch --all --prune` exécuté en préalable. `origin/claude/eager-ptolemy-ro5m59`
et `origin/claude/loving-turing-aaopod` partagent `4d92ddbe` comme base commune ;
la branche de triage ne portait que le document, la branche V3 porte les 2 610
fichiers du produit et de la recette.

### Environnement de reproduction

- PostgreSQL 16.13 local, base reconstruite de zéro par
  `scripts/local-postgres-bootstrap/rebuild_db.sh` : **318 migrations rejouées
  proprement** (316 avant correctifs, 318 après), puis
  `supabase/production/seed_entreprise_pilote_btp.sql` (fixture `PILOTE-BTP-V1`,
  28 salariés / 5 profils, 7 chantiers, 300 affectations, 4 commandes).
- Identités RLS réelles : `set local role authenticated` +
  `request.jwt.claims` portant le `sub` de l'utilisateur pilote visé — mêmes
  fonctions `auth.uid()`/`a_permission()` que la production.
- `pgtap` 1.3.2 installé pour exécuter les suites `supabase/tests/`.
- **Non exécuté** : la pile e2e complète (GoTrue + `next dev` + Playwright sur la
  fixture). Les conséquences sur le statut de chaque cas sont dites explicitement
  plus bas, jamais lissées.

---

## 1. Tableau de clôture

| ID | BEFORE (mesuré) | ROOT CAUSE | FIX | TEST | STATUS |
|---|---|---|---|---|---|
| **PE-06** | Geste du test V3 rejoué dans un vrai Chromium sur la logique réelle du composant : les 4 handlers React se déclenchent, `vide` passe à `false`, **1 requête réseau émise**, message « Signature enregistrée. ». Le témoin sans tracé : 0 requête + message de garde. | **`AUTOMATION_FALSE_POSITIVE`** — la cause racine documentée en V3 (« le `PointerEvent` synthétique ne fait pas passer `vide.current` à `false` ») est **réfutée par exécution**. Le composant `SignatureEmploye.tsx` n'a pas de défaut de détection de tracé. Le test V3 ne capturait pas le message d'erreur client, d'où un diagnostic par déduction. | Correctif **test uniquement** : geste `page.mouse` réel (prouvé équivalent), assertion explicite de l'absence du message de garde client pour que tout échec futur nomme sa propre cause, commentaire « KNOWN ISSUE » erroné remplacé par la preuve. Sonde de reproduction versionnée. | `scripts/qualification/pe06_signature_canvas_probe.{jsx,mjs}` + `README_PE06.md` (3 scénarios : synthétique / réel / témoin négatif) ; `tests/e2e/pilot-acceptance-v3.spec.ts` §PE-06 réécrit. | ⚠️ **ROOT CAUSE RÉFUTÉE — TEST CORRIGÉ, E2E NON REJOUÉ** |
| **CH-08** | Sous l'identité RLS de l'ouvrier pilote non affecté : `select count(*) from chantiers` → **7** (tous les chantiers de l'entreprise) ; `peut_consulter_chantier(...)` → `true` sur chaque chantier non affecté. | **`REAL_PRODUCT_BUG`, mais pas là où le triage le situait.** Le garde serveur existe et est correct : la policy RLS `lecture_chantiers_selon_permission` sur `public.chantiers` délègue à `peut_consulter_chantier(entreprise_id, id)`, qui restreint bien à l'affectation active pour un poste en `voir_chantiers_assignes`. La cause réelle est une **dérive de la fixture pilote** : `seed_entreprise_pilote_btp.sql` donnait `acces_chantiers` (= « tous les chantiers ») aux postes `Ouvrier` et `Chef d'équipe`, alors que le catalogue canonique `modeles_roles_predefinis` — que le commentaire du seed dit reproduire — leur donne `voir_chantiers_assignes`. | 1) Seed réaligné sur le catalogue canonique (`Ouvrier` et `Chef d'équipe` : `voir_chantiers_assignes`, + `voir_pointages_equipe` manquant pour `Chef d'équipe`) → **égalité stricte avec `modeles_roles_predefinis` désormais assertée**. 2) Défense en profondeur : appel explicite de `peut_consulter_chantier` en tête de `chantiers/[id]/page.tsx` → `notFound()`. Même prédicat que la RLS, donc aucun accès légitime perdu. | `supabase/tests/ch08_acces_detail_chantier_non_affecte.test.sql` — **9/9 ok** ; `tests/e2e/pilot-acceptance-v3.spec.ts` §CH-08 passe de test-mesure à test-assertif. | ✅ **FIXED** |
| **CM-06** | Sous l'identité RLS du gérant (`a_permission('gerer_achats')` = `true`) : `delete from commandes_fournisseurs where id=<statut 'recue'>` **supprime la ligne sans erreur**. | **`REAL_PRODUCT_BUG`** — exactement la cause documentée : aucune contrainte ni trigger DB ne regarde le statut. Les policies ne portent que sur le droit (`membres commandes` = `est_membre_actif`, restrictive `role_gestion_delete` = `a_permission('gerer_achats')`). Seule `supprimerCommandeAction` filtrait le statut, donc tout chemin hors de cette server action contournait la règle métier. | Trigger `BEFORE DELETE` `trg_commande_fournisseur_suppression_statut` (migration `20260923000326`), réplique du patron `PL-02` / `trg_affectation_employe_actif`. Statuts autorisés = exactement ceux que la server action accepte déjà (`brouillon`, `annulee`) : la garde DB ne durcit pas la règle produit, elle la rend inviolable. | `supabase/tests/cm06_suppression_commande_fournisseur_statut.test.sql` — **11/11 ok** | ✅ **FIXED** |
| **PL-05** | Sous l'identité RLS de l'ouvrier pilote : **300 affectations visibles** sur toute l'entreprise, **15 collègues distincts**, dont seulement 20 lignes lui appartenant ; ni `gerer_planning`, ni `voir_pointages_equipe`, ni `voir_heures_chantiers`. | **`REAL_PRODUCT_BUG`** — cause documentée confirmée et précisée : `public.affectations` n'avait, en lecture, que la policy **permissive** `membres affectations` (`est_membre_actif`) et **aucune policy restrictive `SELECT`**, contrairement à `public.pointages` qui porte déjà `role_pointage_select` (restrictive) + `peut_consulter_pointage_employe()`. | 1) `peut_consulter_affectation_employe()` + policy **RESTRICTIVE** `role_affectation_select` (migration `20260923000327`) — réplique exacte du patron déjà en place pour les pointages. Vue globale conservée pour `gerer_planning`, `voir_pointages_equipe` ou `voir_heures_chantiers`. 2) Filtre écran aligné sur le même prédicat dans `planning/page.tsx`, même geste que le tableau de bord qui filtrait déjà. | `supabase/tests/pl05_cloisonnement_lecture_affectations.test.sql` — **12/12 ok** | ✅ **FIXED** |

---

## 2. Témoins par cas

### PE-06 — sonde de détection de tracé

`scripts/qualification/pe06_signature_canvas_probe.mjs`, vrai Chromium, React 19,
logique du composant répliquée verbatim :

| Scénario | Handlers reçus | Requêtes réseau | Message |
|---|---|---|---|
| A. `PointerEvent` synthétiques — **geste exact du test V3** | `pointerdown`, `pointermove` ×2, `pointerup` | **1** | « Signature enregistrée. » |
| B. `page.mouse` — geste utilisateur réel | `pointerdown`, `pointermove` ×16, `pointerup` | **1** | « Signature enregistrée. » |
| C. Témoin négatif — aucun tracé | aucun | **0** | « Dessinez la signature avant d'enregistrer. » |

Vérifications complémentaires sur la fixture : `signature_storage_path` de
l'ouvrier pilote est `null`, donc `aDejaSignature = false` et le `<canvas>` est
bien rendu (l'hypothèse alternative « la branche `<img>` + Remplacer masque le
canvas » est écartée) ; `enregistrerSignatureEmployeAction` appelle bien
`revalidatePath`, donc l'apparition de `<img alt="Signature de l'employé">`
attendue par le test est atteignable côté produit.

**Ce qui reste ouvert, dit franchement** : la sonde prouve que la cause racine
écrite dans la V3 est fausse, et corrige le test en conséquence. Elle ne prouve
pas que le cas e2e passe maintenant de bout en bout — la pile complète (GoTrue +
`next dev` + Playwright sur `pilot_gp`) n'a pas été rejouée dans cette session.
Le cas est donc **à revalider par un run e2e**, avec l'avantage qu'un échec
nommera désormais sa cause au lieu d'être re-diagnostiqué par déduction.

### CH-08 — avant / après (base reconstruite, seed réaligné)

| Acteur | Chantiers visibles AVANT | Chantiers visibles APRÈS | `peut_consulter_chantier` sur un chantier non affecté |
|---|---|---|---|
| Ouvrier pilote (non affecté) | **7** | **1** (exactement son affectation) | `false` — lecture directe par id : **aucune ligne → `notFound()`** |
| Chef de chantier (`acces_chantiers`) | 7 | **7** | `true` — non-régression |

Égalité seed / catalogue canonique après correctif, assertée en base :
`Ouvrier` → `true`, `Chef d'équipe` → `true`.

Cross-tenant (suite pgTAP, fixture `isolation_multitenant`) : l'ouvrier B ne
consulte aucun chantier de l'entreprise A, affecté ou non.

### CM-06 — avant / après

| Geste (SQL direct, identité gérant) | AVANT | APRÈS |
|---|---|---|
| `delete` commande `recue` | **supprimée** | `COMMANDE_SUPPRESSION_STATUT_INTERDIT` |
| `delete` commande `confirmee` | supprimée | `COMMANDE_SUPPRESSION_STATUT_INTERDIT` |
| `delete` commande `recue_partiel` | supprimée | `COMMANDE_SUPPRESSION_STATUT_INTERDIT` |
| `delete` commande `brouillon` | supprimée | **supprimée** (positive witness conservé) |
| `delete` commande `annulee` | supprimée | **supprimée** |
| `delete` de masse sur l'entreprise | supprimait tout | refusé et **atomique** : aucune ligne perdue, même supprimable |
| `update` statut `recue` → `annulee` puis `delete` | — | autorisé — le trigger ne porte que sur `DELETE` |

Cross-tenant : la garde s'applique à l'identique sur l'entreprise B — elle porte
sur le statut de la ligne, jamais sur le tenant de l'appelant.

### PL-05 — avant / après

| Acteur | Droits de vue globale | Affectations visibles AVANT | APRÈS |
|---|---|---|---|
| Ouvrier pilote | aucun | **300** (15 collègues) | **20** — ses lignes, **0 ligne de collègue** |
| Chef de chantier | `gerer_planning` + les deux autres | 300 | **300** — non-régression |
| Chef d'équipe | `voir_pointages_equipe`, `voir_heures_chantiers` | 300 | **300** — non-régression |
| Gérant | tous | 300 | **300** — non-régression |
| Non-membre | — | 0 | **0** |

Cross-tenant (suite pgTAP) : l'ouvrier B ne lit que sa propre affectation et
aucune ligne de l'entreprise A ; le dirigeant B, qui porte **tous** les droits
chez B, ne lit lui non plus aucune affectation de A — un droit de vue globale
est global *dans* son entreprise, pas au-delà. Un salarié passé `sorti` ne lit
plus son propre planning.

Périmètre de la restriction, vérifié avant de la poser : les fonctions
`SECURITY DEFINER` qui agrègent les affectations pour la paie
(`synchroniser_periode_paie` & co.) s'exécutent hors RLS et ne sont pas
concernées ; sur `chantiers/[id]`, le total d'heures issu des affectations n'est
affiché que derrière `peutVoirHeures` (`voir_heures_chantiers` /
`gerer_pointage`), donc aucun utilisateur nouvellement restreint ne le voyait ;
`mon-espace` filtrait déjà sur son propre `employe_id`.

---

## 3. Tests rejoués

| Vérification | Résultat |
|---|---|
| `rebuild_db.sh` (318 migrations, base neuve) | ✅ `OK: 318 migrations applied cleanly` |
| `seed_entreprise_pilote_btp.sql` sur base neuve | ✅ fixture complète recréée |
| `supabase/tests/ch08_acces_detail_chantier_non_affecte.test.sql` | ✅ **9/9** |
| `supabase/tests/cm06_suppression_commande_fournisseur_statut.test.sql` | ✅ **11/11** |
| `supabase/tests/pl05_cloisonnement_lecture_affectations.test.sql` | ✅ **12/12** |
| `tsc --noEmit --incremental false` (racine) | ✅ 0 erreur |
| `eslint` (racine, périmètre complet) | ✅ **19 problèmes (4 erreurs, 15 warnings) — strictement identique au baseline `HEAD`**, mesuré par `git stash` avant/après |
| `vitest run` | ✅ **153 fichiers, 1 786 tests, 0 échec** |
| `verify-migrations.mjs` | ✅ 318 migrations valides, noms et horodatages uniques |
| Sonde PE-06 (vrai Chromium) | ✅ 3 scénarios conformes (cf. §2) |
| Playwright e2e sur la fixture pilote | ❌ **non exécuté** (GoTrue + `next dev` non montés dans cette session) |

---

## 4. Fichiers touchés

**Migrations (2, nouvelles)**
- `supabase/migrations/20260923000326_cm06_garde_fou_suppression_commande_fournisseur.sql`
- `supabase/migrations/20260923000327_pl05_cloisonnement_lecture_affectations.sql`

**Tests DB (3, nouveaux)**
- `supabase/tests/ch08_acces_detail_chantier_non_affecte.test.sql`
- `supabase/tests/cm06_suppression_commande_fournisseur_statut.test.sql`
- `supabase/tests/pl05_cloisonnement_lecture_affectations.test.sql`

**Produit (2)**
- `src/app/(app)/chantiers/[id]/page.tsx` — garde serveur explicite CH-08
- `src/app/(app)/planning/page.tsx` — filtre écran PL-05

**Fixture (1)**
- `supabase/production/seed_entreprise_pilote_btp.sql` — réalignement des rôles
  `Ouvrier` / `Chef d'équipe` sur `modeles_roles_predefinis`

**Recette (1)**
- `tests/e2e/pilot-acceptance-v3.spec.ts` — CH-08 devient assertif, PE-06 corrigé

**Outillage de preuve (4, nouveaux)**
- `scripts/qualification/pe06_signature_canvas_probe.jsx` / `.mjs` / `README_PE06.md`
- `eslint.config.mjs` — la sonde, réplique verbatim assumée, est ignorée par le
  lint (la renommer lui ferait perdre sa valeur de preuve)

Aucun refactor. Aucun des 6 autres `FAIL` (`NF-01`, `CH-09`, `FA-08`, `PL-03`,
`PE-07`, `PT-08`) n'est touché.

---

## 5. Écarts par rapport au triage, à acter

1. **PE-06** : la cause racine « probable » de la V1 du triage est **fausse**,
   démontrée par exécution. Le triage la présentait comme « non confirmée
   comme défaut produit » — c'était la bonne prudence ; la sonde tranche
   maintenant dans le sens du faux positif d'automatisation.
2. **CH-08** : le triage situait la cause dans `chantiers/[id]/page.tsx` (« ne
   vérifie que le tenant »). C'est vrai du code de la page, mais la décision
   d'accès était déjà prise par la RLS, correctement. La cause réelle est une
   dérive du seed pilote par rapport au catalogue canonique de rôles. Le
   « correctif probable » proposé (vérifier `equipes_chantiers` en tête de page,
   inconditionnellement) **aurait cassé un accès légitime** : les postes
   `Administration` / `Conducteur de travaux`, qui portent `acces_chantiers`,
   ne sont jamais affectés à un chantier. Le correctif retenu réutilise le
   prédicat existant, ce qui rend la régression impossible par construction.
3. **CM-06** : le triage notait une « décision produit documentée de ne pas
   corriger ». La mission demandait explicitement de corriger ce cas ; c'est
   fait, avec une garde DB qui n'élargit ni ne durcit la règle produit
   existante. **Cette décision produit reste à reconfirmer côté métier.**
4. **PL-05** : le triage évoquait `voir_heures_chantiers` (`PL-06`) comme
   permission de vue globale. Retenu, avec `gerer_planning` et
   `voir_pointages_equipe` en plus, pour que le `Chef d'équipe` de la fixture ne
   perde pas la vue d'équipe qu'il avait. Effet de bord assumé et mesuré : le
   poste `Administration`, qui ne porte aucun des trois, ne voit désormais que
   ses propres affectations sur `/planning` — c'est déjà ce que faisait le
   tableau de bord pour ce même poste, donc la cohérence entre les deux écrans
   s'améliore au lieu de se dégrader.

---

## 6. Verdict

> ### PILOT QUICK WINS PARTIALLY CLOSED

**3 cas sur 4 fermés avec correctif vérifié en base** : `CH-08`, `CM-06`,
`PL-05` — reproduits avant correctif, corrigés, et couverts par 32 assertions
pgTAP vertes (positive witness, negative witness, cross-tenant, non-régression
par rôle).

**`PE-06` n'est pas fermé mais est tranché** : `AUTOMATION_FALSE_POSITIVE` quant
à la cause racine documentée, réfutée par exécution dans un vrai navigateur ; le
test est corrigé et rendu diagnostique. Il manque un run Playwright de bout en
bout sur la fixture pilote pour le passer à `PASS`, run qui n'a pas pu être
monté dans cette session. C'est la seule raison du verdict *partially* plutôt
que *closed* : le reste du périmètre demandé est traité et vérifié.

**Prochain geste, hors périmètre de cette mission** : `npm run pilot:acceptance:v3`
puis `npx playwright test tests/e2e/pilot-acceptance-v3.spec.ts` sur la fixture
reconstruite, pour valider les 4 cas au niveau e2e et reprendre la matrice V3.
