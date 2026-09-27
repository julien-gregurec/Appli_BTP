# ELSATIA — Train canonique V3 : convergence finale

| | |
|---|---|
| Date | 2026-09-26 → 2026-09-27 |
| Base | `integration/elsatia-canonical-train-v2` @ `819ebe56` (335 migrations, dernière `20260923000400`) |
| Branche | `integration/elsatia-canonical-train-v3` |
| Migrations | **<!--train:nb-->341<!--/train:nb-->**, dernière **`<!--train:derniere-->20260926000506<!--/train:derniere-->`** (valeurs générées : `npm run sync:train-expectations`) |
| Moteur | PostgreSQL 16.13 réel + pgTAP 1.3, amorce `scripts/local-postgres-bootstrap` (sans Docker) |
| Navigateur | Chromium 1194 (Playwright), apps compilées (`next build` + `next start`) |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge vers `main`. |

## Verdict

```
CANONICAL TRAIN V3 READY FOR REMOTE PREVIEW EXECUTION
```

Les cinq lots demandés sont intégrés, dédupliqués et renumérotés dans une séquence monotone ;
la décision RGPD `conserver_contrat_minimise` est officielle et **fail-closed** tant que la durée
n'est pas validée ; l'export RGPD inclut `lignes_avenants` (et 5 autres tables enfants oubliées).
Toutes les portes locales sont vertes : base neuve 340/340, upgrade V2 → V3 avec données
(0 écart hors backfill voulu, schéma identique au fresh), pgTAP sans régression
(**124/133** fichiers propres contre 115/126 sur V2 ; les 9 restants sont la dette connue,
identique sur V2), Réserves **594/594** pgTAP et **59/59** Playwright, Colors **73/73**,
typecheck / lint / Vitest / build des 5 apps, et l'outillage Preview est resynchronisé et
**généré** (plus aucun nombre de migrations maintenu à la main).

**Pourquoi pas seulement `LOCALLY QUALIFIED`** : le pack d'exécution Preview est à jour sur V3
(ref, 340 migrations, DB verify à 17 contrôles prouvé GO sur V3 et NO-GO explicite sur V2),
et aucun point ouvert ne bloque une Preview (tous sont en échec sûr, §12).

**Pourquoi pas `BLOCKED`** : aucune porte rouge imputable au train. Les écarts restants sont
des décisions propriétaire ou juridiques, en échec sûr, et la dette pgTAP connue du tronc.

**Préalables à l'exécution distante** (inchangés, hors code) : identifiants Supabase / Vercel /
Stripe Test / Brevo / Redis, et décisions D1–D5 du pack (défauts conservateurs documentés).

---

## 1. Sources intégrées

| Lot | Branche | Commits | Mode d'intégration | Commits V3 |
|---|---|---|---|---|
| A. RGPD × factures émises | `claude/great-curie-i94633` | `1011ce37` (base V1) | **Non mergé** : contenu déjà porté sur V2 par B (`e0de3dd8`), SQL identique | — |
| B. RGPD × contrats acceptés | `claude/beautiful-archimedes-sc6t9g` | `e0de3dd8`, `de69f1f2` | cherry-pick `-x` | `4db65ac5`, `300b3f76` |
| C. Réserves qualification locale V1 | `claude/modest-hopper-bygbnh` | `92db5376`, `bf22fe9e` | cherry-pick `-x` (conflit DB verify résolu, §6) | `04cdce28`, `ec27d986` |
| D. Pack d'exécution Preview | `claude/trusting-edison-scjrd5` | `832c41ea` | cherry-pick `-x` | `2d0d901b` |
| E. Décision Studio | `claude/brave-pasteur-28vkel` | `d7f5fb34`, `1b6003df` | fichiers seuls (`docs/architecture/**`), base de la branche antérieure à V2 | `9058121c` |
| V3 | — | — | renumérotation, décision RGPD, export, outillage, harnais, rapport | `c30190cd` → HEAD |

## 2. Déduplication (contenu réel comparé, pas les SHA)

| Source | Élément | Statut | Détail |
|---|---|---|---|
| A | `supabase/migrations/20260923000347_rgpd_purge_facture_emise_reconciliation.sql` | **SUPERSEDED** | `git diff` vide avec `…401` de B → devient `20260926000501` |
| A | `supabase/tests/fixtures/rgpd_purge_driver.inc`, `rgpd_tenant_facture_emise.inc` | **IDENTICAL** | pris depuis B |
| A | `supabase/tests/rgpd_purge_facture_emise_reconciliation_v1.test.sql` | **SUPERSEDED** | B a adapté l'assertion 24 ; V3 l'étend à la cause « durée requise » |
| A | `scripts/purger-entreprise.mjs`, rapport factures V1 | **SUPERSEDED** | version B (portage + note) |
| A | `docs/migrations-proposees/rgpd-purge-contrats-acceptes-v1.*.proposed`, `scripts/qualification/rgpd-invoice-immutability-v1.sh` | **SUPERSEDED** | remplacés par `…502` et `rgpd-accepted-contracts-v1.sh` (B) |
| B | migrations `…401`, `…402` ; 3 suites pgTAP ; fixture contrats ; harnais ; planificateur (+ test) ; script de purge | **NEW** | renumérotées `501`, `502` (§3) |
| B | `ELSATIA_PREVIEW_DB_VERIFY_V1.sql`, runbook V3 | **CONFLICT** avec C | attendus codés en dur divergents (337/402 vs 336/401) → remplacés par un attendu **généré** (§6) |
| C | migration `…401` Réserves, suite `reserves_full_local_qualification_v1` (181), R-01…R-05 | **NEW** | renumérotée `503` |
| C | `reserves_v1_foundation_workflow.test.sql`, `reset-reserves-recipe.sql`, specs `reserves-v3/v6`, `passerelle.mjs`, `preparer-base.sh` | **NEW** (corrections de harnais utiles) | références `…401` → `…503` |
| C | rapport, PDF témoins (`docs/qualification/witnesses/reserves-full-local-v1/*.pdf`) | **DOCUMENTATION_ONLY** | preuves citées par le rapport ; aucun artefact temporaire (`test-results/`, journaux) n'était présent dans la branche |
| D | `scripts/preview/*`, `preview-pack.test.mjs`, CI, manifeste, inventaire généré, pack | **NEW** | nombres codés en dur corrigés (§6) |
| E | dossier de décision, page propriétaire, POC `docs/architecture/poc/…` | **DOCUMENTATION_ONLY** | POC hors build, non importé ; décision B + I1 consignée (§5) |

Aucun commit n'a été fusionné deux fois ; aucune migration n'existe en double.

## 3. Migrations — séquence V3

Trois branches en vol utilisaient `20260926000401` (B : RGPD factures, C : Réserves,
`claude/dazzling-gates-uzfkvz` : Tools relevé métré, hors périmètre). V3 place **toutes** ses
migrations dans une plage neuve, strictement après le dernier numéro du V2 et après tout numéro
utilisé par une branche distante (max observé : `20260926000402`).

| SOURCE | OLD_VERSION | V3_VERSION | STATUS | DEPENDENCY | REASON |
|---|---|---|---|---|---|
| A great-curie | `20260923000347` | — | SUPERSEDED | — | SQL identique à B `…401` ; `347 < 400` aurait cassé la montée monotone |
| B archimedes | `20260926000401` | **`20260926000501`** | NEW | `…331` (purge V2), `…400` (preuve hors base) | collision de numéro avec C et Tools |
| B archimedes | `20260926000402` | **`20260926000502`** | NEW | `501` (autorisation R1, empreintes) | suit 501 |
| C modest-hopper | `20260926000401` | **`20260926000503`** | NEW | `…273` (Réserves V5), `…331` (condition de purge) | collision de numéro avec B |
| V3 | — | **`20260926000504`** | NEW | `502` | décision `conserver_contrat_minimise`, fail-closed sans durée (§4) |
| V3 | — | **`20260926000505`** | NEW | `…310` (export RGPD) | export des tables enfants (§4) |

- Aucun timestamp du V2 réutilisé ; les 335 migrations V2 sont **inchangées** (`git diff` vide).
- SQL de 501–503 inchangé (seuls des commentaires de référence suivent la renumérotation).
- Aucune base distante n'a jamais reçu `…401`/`…402` (aucune action distante dans ces lots) :
  la renumérotation est sans effet sur un registre existant.
- À noter pour la suite : `claude/dazzling-gates-uzfkvz` (`…401` Tools) et
  `claude/brave-pascal-agrr5v` (`…347` Réserves) devront être renumérotés **après `…505`**.

## 4. RGPD

### 4.1 Politique officielle : `conserver_contrat_minimise` (`20260926000504`)

| Élément | Mise en œuvre |
|---|---|
| Décision enregistrée | `platform.purge_politique_contrats` = `conserver_contrat_minimise`, référence `OWNER-DECISION-2026-09-26:…`, journal en ajout seul |
| Durée | **NULL — aucune durée inventée.** La contrainte de 502 qui l'imposait est remplacée : NULL admis (politique retenue, **non active**), durée renseignée > 0 |
| État effectif | `platform.etat_politique_contrats()` : `non_decidee` · **`duree_requise`** (livré) · `supprimer_apres_preuve` · `conserver_contrat_minimise` (actif) |
| Fail-closed | `purger_table_entreprise` refuse les 5 tables porteuses de contrats **avant écriture**, audité `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` ; `_preserver_contrats_acceptes` refuse de figer ; `_purge_contrat_autorisee` (verrous) exige un état actif |
| Rapport | `rapport_contrats_acceptes_purge` expose `etat` et `duree_conservation` ; `purger-entreprise.mjs` affiche la décision requise |
| Photos | `inclure_photos = false` (défaut de minimisation de 502), ajustable dans la migration d'activation |
| Mécanisme B intégré | instantané immuable minimisé, garde-fous, refus TRUNCATE (8 tables), fix planificateur (balayage final), correctifs factures portés |

Activation, le jour où la durée est validée — **une ligne** :

```sql
select platform.definir_politique_purge_contrats(
  'conserver_contrat_minimise', '<référence décision + validation de la durée>',
  interval '<durée validée>', <photos : true|false>);
```

### 4.2 Export RGPD complet (`20260926000505`)

`exporter_donnees_entreprise` ne parcourait que les tables à colonne `entreprise_id`. Vérifié
sur le schéma V3, **six** tables enfants manquaient, pas seulement `lignes_avenants` :

| Table | Parent | Donnée |
|---|---|---|
| `lignes_avenants` | `avenants` | contenu d'un avenant accepté |
| `contacts_clients` | `clients` | nom, fonction, e-mail, téléphone |
| `paiements` | `factures` | encaissements |
| `taches` | `chantiers`, `devis` | planification |
| `chantier_transferts` | `chantiers` | historique client d'un chantier |
| `boutique_lignes_commande` | `boutique_commandes` | lignes de commande Boutique |

Liste **explicite** (pas de découverte automatique par clé étrangère, qui entraînerait des
tables Réserves ou plateforme), mêmes droits (`authenticated` seul, contrôle
`gerer_parametres`), même filtrage des colonnes sensibles, mêmes clés JSON.

### 4.3 Tests

| Suite | Sans 504/505 | V3 |
|---|---|---|
| `rgpd_politique_contrats_conserver_minimise_v3` (nouvelle) | 1/28 + 65 erreurs | **28/28** |
| `rgpd_export_tables_enfants_v3` (nouvelle) | 7/14 | **14/14** |
| `rgpd_purge_contrats_acceptes_securite_v1` (adaptée : défaut V3 + chemin `non_decidee` conservé) | — | 46/46 |
| `rgpd_purge_contrats_acceptes_conserver_v1` / `_supprimer_v1` | — | 30/30 · 16/16 |
| `rgpd_purge_facture_emise_reconciliation_v1` (assertion 24 étendue) | — | 48/48 |
| `purge_entreprise_architecture_v2` · `purge_entreprise_supprimee` · `purge_preuve_et_garde_annulation` | V2 : 18/26 · 19/20 · 43/43 | **26/26 · 20/20 · 43/43** |
| `gp_pilot_rgpd_manifeste_fichiers` | — | 9/9 |

## 5. Studio : décision B + I1

Consignée dans `docs/architecture/ELSATIA_STUDIO_SUPABASE_DECISION_RECORD_V1.md` (nouvelle),
la page propriétaire et `config/env-manifest.json` (`STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`
marquée **tranchée**, gardée tant que l'implémentation n'est pas livrée). Intégrés : dossier,
page de décision, POC sous `docs/` (14/14 tests en mémoire rejoués ; 15 exigent deux GoTrue
réels). **Non intégrés** (pas prêts pour la Production) : routes d'échange, tables Studio,
retrait des migrations Studio de la racine. Studio reste exclu de la Preview (D3).

## 6. Outillage Preview

| Avant (V2 + lots) | V3 |
|---|---|
| `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` : `337 / …402` (B) contre `336 / …401` (C), à la main | CTE `attendu_train` **généré** : `340 / 20260926000505` |
| `db-verify.mjs` : « 13 contrôles » codé en dur (forme et message) | nombre lu dans le SQL |
| `preview-pack.test.mjs` : `335` et `20260923000400` codés en dur | propriétés (tri, unicité, V2 inclus) + test de synchronisation |
| Runbook V3 : ref `claude/fervent-dirac-eez6pk` (321), `337`, `13/13` | ref V3, valeurs par marqueurs `<!--train:*-->` générés |
| — | `scripts/preview/train-expectations.mjs` : `npm run sync:train-expectations` / `verify:train-expectations` (**étape CI**) |
| DB verify : 13 contrôles | **17** : + politique RGPD retenue, TRUNCATE refusé (8 triggers), gardes Réserves R-01…R-05 (7 triggers), export `lignes_avenants` |
| DB verify sur base V2 : **plantait** (table V3 absente) | lecture dynamique : 17 lignes explicites, NO-GO attendu avant push |
| Inventaire des variables | inchangé (manifeste : seule la question Studio change) ; test de conformité fichier généré ↔ manifeste ajouté |

Preuves `db-verify` (lecture seule forcée, registre CLI simulé) :

| Base | Résultat |
|---|---|
| V3 neuve (340) | **GO** — 17/17, préflight 0 anomalie bloquante, 20/20 RPC service-role only |
| V2 + données, avant push (335) | **NO-GO attendu** : 5 migrations en attente, contrôles 1 et 14–17 en échec explicite |
| V3 + données (upgrade) | 17/17 sauf « buckets » : le bucket public `logos` vient de la fixture de test RGPD (jamais du schéma) — détection correcte |

## 7. Fresh DB

`rebuild_db.sh v3_fresh` : **340/340 migrations, 0 erreur** (PostgreSQL 16.13, base vide).
Référence V2 : 335/335.

## 8. Upgrade V2 → V3 avec données réalistes

Protocole : base à l'état V2 (335) → jeu réaliste → `upgrade_snapshot.py` → migrations 501–505
→ instantané → comparaison ; schéma comparé au fresh V3.

Jeu de données (7 entreprises, 48 utilisateurs, 3 051 lignes) : fixtures RGPD A/B (clients,
contact, **devis acceptés, avenant accepté**, lignes, **acompte/finale/avoir émis, paiements**,
chantiers, photo et note vocale, signature interne) ; recette Réserves V3/V4/V6 (chantiers,
plans, réserves, photos, historique, intervenants) ; seed pilote GP (28 salariés, 7 chantiers,
9 devis, 7 factures, 300 affectations, **300 pointages**, **6 notes de frais**, commandes, stock,
congés) ; **Colors** (2 organisations, seaux, emplacements) ; complément V1→V2 (Boutique,
**entitlements** entreprise et utilisateur) ; complément V2→V3 (nouveau :
**Tools** — projet synchronisé, client et abonnement Stripe Test ; tâches et transfert de chantier).

| Contrôle | Résultat |
|---|---|
| Application de 501–505 | ✅ 0 erreur, 0 warning |
| Row counts (244 tables public/platform/auth/storage) | ✅ **0 écart** ; 4 tables nouvelles (`platform`) : politique (1), journal (2), preuves (0), autorisations (0) |
| Checksums métier (54 tables, colonnes V2) | ✅ **53/54 identiques** ; `factures` : seule `entreprise_snapshot` change — backfill **voulu** de 501 (identité émettrice figée des 12 factures émises, marquée `identite_incertaine`) |
| Factures | ✅ statuts, montants, lignes, paiements inchangés |
| Contrats (devis, lignes, avenants, lignes d'avenant, pièces jointes, signatures) | ✅ identiques |
| Historique (`reserves_historique`, `journal_activite`) | ✅ identiques |
| RLS — flags et 599 policies | ✅ 0 supprimée, 0 modifiée, 0 ajoutée |
| RLS — sonde réelle (48 utilisateurs × 16 tables, `set local role authenticated`) | ✅ **0 écart** (292 cellules non nulles) |
| Permissions — droits de table (anon / authenticated / service_role) | ✅ 0 retiré, 0 ajouté |
| Permissions — EXECUTE des fonctions existantes | ✅ 0 modifié ; 28 fonctions nouvelles, dont seules 5 exécutables par service_role, **aucune** par anon ou authenticated |
| Entitlements (`acces_applications_entreprises`, `entitlements_utilisateurs_elsatia`, `habilitations_applications_utilisateurs`, Tools) | ✅ identiques |
| Schéma upgrade vs fresh V3 (`pg_dump -s`, ACL comprises, 56 165 lignes) | ✅ **identique** |

Constat de harnais : `colors-pilote.sql` et `prepare-reserves-v3-recipe.sql` utilisent le même
code d'adhésion `RECB0001` (jamais chargés ensemble jusqu'ici) ; le chargeur remappe celui de
Colors. Aucun impact produit.

## 9. RGPD de bout en bout

`scripts/qualification/rgpd-end-to-end-v3.sh` sur la base upgradée : pour chaque tenant, copie
jetable → sauvegarde `pg_dump` → purge (déroulé SQL de `purger-entreprise.mjs`) → restauration
dans une base neuve → rejeu. Politique **livrée**, puis **activée** avec une durée de test posée
dans la base jetable uniquement.

| Cas | Tenant | Livrée (`duree_requise`) | Activée (durée de test) |
|---|---|---|---|
| Sans contrat | Peintures Recette A (Colors, 1 fichier) | `complete`, fichier supprimé | `complete` |
| Avec factures + devis acceptés | pilote Bati-Rhône (7 factures, 6 devis) | `incomplete` : `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` + `COMMANDE_SUPPRESSION_STATUT_INTERDIT` (§12) | contrats purgés, 6 instantanés ; reste `incomplete` sur `commandes_fournisseurs` (§12) |
| Devis accepté + avenant + photo/audio | RECETTE_A (4 contrats, 8 fichiers) | `incomplete` : `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` seul ; contrats, photo et audio **intacts** | `complete`, 4 instantanés `contrat_minimise` ; photo et audio supprimés ; restent la signature interne et le logo (RETAIN) |
| Déjà purgé | S1 et S3 purgés, purge relancée | `complete`, état **inchangé** | `complete`, état **inchangé** |

Dans **les 6 exécutions** : `pg_restore` 0 erreur ; **rejeu = purge d'origine (empreinte
identique)** ; factures inchangées ; autres tenants inchangés ; aucune preuve figée tant que la
politique n'est pas active.

## 10. Réserves

| Porte | Résultat |
|---|---|
| pgTAP Réserves (7 fichiers) | **594/594** (181 + 98 + 94 + 148 + 41 + 14 + 18) |
| Vitest | **178/178** |
| typecheck · lint · build | ✅ · ✅ · ✅ |
| Playwright (Réserves compilé, passerelle, Chromium, base aux 340 migrations) | **59/59** : V3 1, V4 listes/PDF 11, V4 mobile 6, V5 13, V6 sécurité 23, V6 performance 5 |
| PDF | génération réelle (`/api/documents/chantier/[id]/pdf`, Chromium local) couverte par V4 listes/PDF 11/11 |
| Colors (harnais partagé non modifié par V3, rejoué quand même) | **73/73** |

Points ciblés, couverts par `reserves_full_local_qualification_v1` et V6 sécurité :
`reserves_transition_differee` (R-03, décision de levée par tout chemin), historique immuable
(R-02, UPDATE/DELETE/TRUNCATE refusés à tous les rôles), rattachement intervenant (R-05, fixme
devenu test vert), suppression d'un chantier GP importé (R-04), photo obligatoire par réserve
(R-01, non contournable hors ligne), cross-tenant A/B (toutes les portes).

Cas non exécutable, identique à la qualification d'origine : V5 « un rechargement hors ligne ne
perd ni le cache ni la file » (l'émulation hors-ligne de Chromium 1194 ne s'applique pas aux
`fetch` du service worker) ; les 13 autres V5 passent.

## 11. Portes complètes

| App | typecheck | lint | tests | build |
|---|---|---|---|---|
| Gestion Pro | ✅ | ✅ 0 erreur (15 warnings préexistants) | ✅ **1 854/1 854** (V2 : 1 853) | ✅ |
| Tools | ✅ | ✅ | ✅ 1 992/1 992 | ✅ (`NEXT_PUBLIC_TOOLS_ENV=local`) |
| Colors | ✅ | ✅ | ✅ 431/431 | ✅ |
| Réserves | ✅ | ✅ | ✅ 178/178 | ✅ |
| Studio | ✅ | ✅ | ✅ 260/260 | ✅ |

Les builds Réserves, Colors et Tools **refusent** de démarrer sans leurs variables publiques
(gardes de pré-build, fail-closed voulu) ; ils passent avec l'environnement local de recette.

| Vérification | Résultat |
|---|---|
| `verify:migrations` | ✅ 340 valides, noms et horodatages uniques |
| `verify:secrets` | ✅ 2 727 fichiers, aucun secret |
| `verify:env-manifest` · `test:env-manifest` | ✅ 0 erreur (14 DECISION_REQUIRED non bloquantes) · 67/67 |
| `verify:train-expectations` (nouveau, CI) | ✅ attendus à jour |
| `test:preview-pack` · `test:preflight-preview` · `test:smoke-email` | ✅ 27/27 · 5/5 · 12/12 |
| POC Studio (`node --test`) | ✅ 14/14 en mémoire (15 exigent GoTrue réel) |

pgTAP maximal (chaque fichier sur une copie neuve de la base) :

| | Fichiers | Propres | ok | not ok |
|---|---|---|---|---|
| V2 (335) | 126 | 115 | 2 809 | 23 |
| **V3 (340)** | **133** | **124** | **3 181** | **14** |

Sur les 126 fichiers communs, les **seuls** écarts sont `purge_entreprise_architecture_v2`
(18 → 26/26) et `purge_entreprise_supprimee` (19 → 20/20). Les 9 fichiers non propres sont les
**mêmes** sur V2 et V3 — dette connue du tronc : 7 suites Studio (« Inscription fermée »),
`platform_stripe_state_attestation_r72` (pgsodium réel absent de l'amorce),
`elsatia_tools_cloud_sync_entitlement_closure_v1` (erreurs d'amorce, 8/8 assertions exécutées ok).

## 12. Décisions et constats ouverts

| ID | Nature | État | Effet |
|---|---|---|---|
| `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` | juridique — **durée seulement** | ouvert | purge des contrats acceptés refusée (fail-closed) ; activation = 1 ligne (§4.1) |
| `DECISION_REQUIRED:RGPD-PURGE-VS-COMMANDE-FOURNISSEUR` (nouveau constat) | produit / juridique | ouvert, **préexistant sur V2** (vérifié) | le garde-fou CM-06 (`…326`) refuse la suppression d'une commande fournisseur non brouillon, y compris pendant la purge RGPD (`…331`) : un tenant avec des commandes confirmées/reçues n'est jamais marqué purgé. Échec sûr. Choix conservateur : non corrigé ici (même classe de question que les contrats : conserver ou supprimer après preuve) |
| D-01 Réserves : hôte suspendu | propriétaire | ouvert (lot C) | intervenant actif garde l'accès à ses réserves ; aucun correctif |
| Intégration GP ↔ Réserves (écrans) | produit | ouvert (lot C) | base prouvée, pas d'UI |
| Studio B + I1 : implémentation | technique | décidée, non livrée | Studio exclu de la Preview |
| `STUDIO-SIGNUP-DEFAULT`, `HOSTING-PROVIDER-STUDIO-WORKER`, `PREVIEW-PROJECT-INVENTORY`, … | propriétaire | ouverts | inchangés (manifeste) |
| Storage réel, GoTrue réel, e-mail | exécution distante | NOT PROVEN localement | à prouver par le pack Preview |

## 13. Reproduire

```bash
git checkout integration/elsatia-canonical-train-v3 && npm ci
for a in tools colors reserves studio; do npm ci --prefix apps/$a; done
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap

# Fresh + pgTAP maximal (une base neuve par fichier)
scripts/local-postgres-bootstrap/rebuild_db.sh v3_fresh
scripts/qualification/pgtap-run-v3.sh v3_fresh                     # 124/133 propres

# Upgrade V2 → V3 : base aux 335 migrations V2, puis jeu réaliste :
#   colonnes auth de tests/e2e/reserves-pile-locale/preparer-base.sh ; fixtures isolation_multitenant +
#   rgpd_tenant_facture_emise + rgpd_tenant_contrats_acceptes (committées) ; scripts/e2e/prepare-* (Réserves) ;
#   supabase/production/seed_entreprise_pilote_btp.sql ; tests/e2e/fixtures/colors-pilote.sql (RECB0001 → autre code) ;
#   scripts/local-postgres-bootstrap/upgrade_v1_v2_seed_complement.sql puis upgrade_v2_v3_seed_complement.sql
python3 scripts/local-postgres-bootstrap/upgrade_snapshot.py upg avant.json
#   … appliquer supabase/migrations/2026092600050*.sql …
python3 scripts/local-postgres-bootstrap/upgrade_snapshot.py upg apres.json --colonnes-de avant.json

# RGPD bout en bout (sur la base upgradée)
scripts/qualification/rgpd-end-to-end-v3.sh upg

# Outillage Preview
npm run verify:train-expectations && npm run test:preview-pack
ELSATIA_PREVIEW_DB_URL=postgresql://…@127.0.0.1/v3_verify node scripts/preview/db-verify.mjs --local-harness --before-owner

# Réserves e2e / Colors e2e : docs/qualification/ELSATIA_RESERVES_FULL_LOCAL_QUALIFICATION_V1.md §7
#   (V5 : --grep-invert "rechargement hors ligne") ; Colors : + PLAYWRIGHT_CHROMIUM_EXECUTABLE
```

## 14. Fichiers V3 (hors lots portés)

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260926000504_rgpd_politique_contrats_conserver_minimise_retenue.sql` | décision RGPD, fail-closed |
| `supabase/migrations/20260926000505_rgpd_export_tables_enfants.sql` | export RGPD complet |
| `supabase/tests/rgpd_politique_contrats_conserver_minimise_v3.test.sql`, `rgpd_export_tables_enfants_v3.test.sql` | 28 + 14 assertions |
| `scripts/preview/train-expectations.mjs` | attendus générés, `sync:`/`verify:train-expectations` |
| `scripts/qualification/pgtap-run-v3.sh`, `rgpd-end-to-end-v3.sh` | harnais |
| `scripts/local-postgres-bootstrap/upgrade_v2_v3_seed_complement.sql`, `upgrade_snapshot.py` (étendu) | jeu et instantané d'upgrade |
| `docs/architecture/ELSATIA_STUDIO_SUPABASE_DECISION_RECORD_V1.md` | décision Studio |
| DB verify, `db-verify.mjs`, pack, runbook V3, CI, `package.json` | outillage resynchronisé |
