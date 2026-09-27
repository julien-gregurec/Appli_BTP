# ELSATIA — Seed compatibility hardening V1 (Preview / Pilote / DR)

**Date** : 2026-09-27 · **Branche** : `claude/adoring-hawking-yke3o0`
**Verdict** : **ALL ACTIVE SEEDS QUALIFIED** — voir §10 pour ce que ce verdict ne couvre pas.

## 1. Base

- Train canonique V3 (`origin/integration/elsatia-canonical-train-v3`, `ef7443c0`) **+ derniers
  correctifs RGPD** (`claude/hopeful-lamport-qsqd8h` : `e64fe252` réconciliation RGPD × commandes
  fournisseurs, migration `…506` ; `cc230de8` dette résiduelle, migration `…507`). Avance rapide
  de la branche désignée, aucun commit perdu.
- **342 migrations**, dernière `20260927000507_rgpd_dette_residuelle_historique_affectations_bon_commande.sql`.
- Base fraîche : PostgreSQL 16.13, `scripts/local-postgres-bootstrap/rebuild_db.sh` (amorce
  Supabase minimale + toutes les migrations) — 342/342, puis `search_path` hébergé
  (`"$user", public, extensions`). Drill DR : pipeline DR propre (`scripts/dr/01_replay_migrations.sh`)
  — 342/342.

## 2. Inventaire et classement

Registre exécutable : `scripts/seeds/registry.mjs` (source de vérité du harnais et du test
statique) : **37 scripts de données** suivis par git — 7 PREVIEW, 2 PRODUCTION_TOOL, 2 ACTIVE, 20 CI_ONLY, 6 LEGACY, 0 BROKEN, 0 UNKNOWN ; 14 exécutés directement par le harnais, les autres couverts par une chaîne qui les exécute.

| Script | Classe | Exécution réelle | Avant ce lot | Après |
|---|---|---|---|---|
| `scripts/seed-elsatia-preview-year.mjs` | PREVIEW | ×3 + 5 reprises | **BROKEN** (ACL 255, colonnes de taux, 99 permissions, devis/commandes engagés, salarié sorti) | QUALIFIED |
| `supabase/production/seed_entreprise_pilote_btp.sql` (+ `assertions_…`) | PREVIEW | ×3 + nettoyage→reseed | rejouable avec dérives (compteurs, statut chantier, historique capacité, stock double) | QUALIFIED |
| `supabase/production/cleanup_entreprise_pilote_btp.sql` | PREVIEW (destructif) | cycle pilote | **BROKEN** (verrou PO-1) + triggers laissés coupés en cas d'échec | QUALIFIED |
| `supabase/production/seed_entreprise_test_5_ans.sql` | PREVIEW | ×3 | **BROKEN** (devis accepté → lignes ; non rejouable : suppression de documents immuables) | QUALIFIED |
| `supabase/production/seed_entreprise_test_tous_onglets.sql` | PREVIEW | ×3 (après 5 ans) | bloqué par 5 ans | QUALIFIED |
| `supabase/production/seed_entreprise_test_suivi_terrain.sql` | PREVIEW | ×3 (après 5 ans) | rejeu non déterministe (contrôles GPS hors zone tirés sur l'UUID de session) | QUALIFIED |
| `supabase/production/creer_entreprise_demo_18_mois.sql` | PRODUCTION_TOOL | ×3 + reset→recréation | **BROKEN** (`employes.taux_horaire`, devis accepté → lignes, capacité) | QUALIFIED |
| `supabase/production/reset_entreprise_demo_18_mois.sql` | PRODUCTION_TOOL | cycle démo | **BROKEN** (facture émise → brouillon refusé) ; détruisait le poste « Compte dépôt » | QUALIFIED |
| `scripts/dr/03_seed_synthetic_dataset.sql` | ACTIVE | rejeu DR → sauvegarde → restauration → 07/08 | saut brouillon→reçue, réception sans mouvement de stock, stock ≠ mouvements | QUALIFIED |
| `scripts/dr/00_supabase_stubs.sql` | ACTIVE (amorce) | via `01_replay_migrations.sh` | — | OK |
| `supabase/production/seed_purge_qualification_v2.sql` | CI_ONLY | ×3 | **BROKEN** (capacité, devis accepté → lignes) ; compteurs décalés à chaque rejeu | QUALIFIED |
| `scripts/perf/generate_fixture.sql` | CI_ONLY | ×1 (7 min) | **BROKEN** (`employes.taux_horaire`) | QUALIFIED |
| `scripts/perf/annuaire-plateforme.sql` | CI_ONLY | ×2 | OK (search_path hébergé requis) | QUALIFIED |
| `scripts/e2e/prepare-*.sql`, `reset-reserves-recipe.sql`, `recette-reserves-v4.sh` | CI_ONLY | chaîne ×3 | numérotation des réserves et compteur global dérivant à chaque passe | QUALIFIED |
| `scripts/e2e/amorcer-recette-v4.mjs` | CI_ONLY | non (dépôt Storage, passerelle requise) | — | couvert par sa recette |
| `tests/e2e/fixtures/colors-pilote.sql` | CI_ONLY | ×3 | compteur global consommé à chaque passe ; code `RECB0001` en collision avec Réserves | QUALIFIED |
| `scripts/local-postgres-bootstrap/upgrade_v1_v2_…`, `upgrade_v2_v3_seed_complement.sql` | CI_ONLY | ×1 sur la chaîne complète | chargement impossible sans retouche manuelle (`RECB0001`) | QUALIFIED |
| `supabase/tests/fixtures/rgpd_tenant_commandes_fournisseurs.inc` | CI_ONLY | ×1 | OK | QUALIFIED |
| `supabase/tests/fixtures/isolation_multitenant.inc`, `rgpd_*`, `rgpd_purge_driver.inc` | CI_ONLY | prérequis des cas ci-dessus / suites pgTAP | — | couverts |
| `apps/studio/scripts/benchmark-projects-local.sql` | CI_ONLY | CI Studio (chaîne de migrations séparée) | — | hors train GP |
| `supabase/production/seed_juju_6_mois.sql` | **LEGACY** | non | ne compile pas ; entreprise supprimée le 14-07 | refusé par le wrapper |
| `supabase/production/corriger_encodage_juju.sql` | **LEGACY** | non | correctif ponctuel d'une entreprise supprimée | refusé par le wrapper |
| `supabase/production/supprimer_entreprises_test.sql` | **LEGACY** | non | identifiants en dur obsolètes (écarté par P11) | refusé par le wrapper |
| `supabase/production/archive/NE_PAS_EXECUTER_sortie_mode_prototype.sql` | LEGACY | non | archivé | inchangé |
| `scripts/seed-demo-history.mjs` | **LEGACY** | non | dépend de `dev_contexte_entreprise()` (supprimée par `…078`) | arrêt immédiat en tête |
| `docs/qualification/witnesses/10_seed_tenants.sql` | LEGACY | non | preuve figée d'un rapport clos | archive |

Aucune entrée BROKEN ni UNKNOWN ne subsiste (le test statique échoue sinon).

## 3. Exécution réelle

`npm run verify:seeds` (`scripts/seeds/verify-seeds.mjs`) — par seed :

1. base « prérequis » clonée de la base fraîche (entreprise onboardée par les **vraies** fonctions
   du train — `seed_harness.onboarder()` reproduit `creer_entreprise_bootstrap()`, `scripts/seeds/fixtures/prerequis.sql`) ;
2. seed exécuté **séparément**, `ON_ERROR_STOP`, **stderr affiché tel quel** ;
3. assertions du seed après chaque run, empreinte d'état par table (stricte et métier) ;
4. contrôles d'intégrité après le dernier run, comparés aux prérequis (§6) ;
5. scénario propre au seed (§4, §7, §8, §9).

Résultat du run final (base reconstruite, 342 migrations) : voir §11.

## 4. Commandes fournisseurs : « commande envoyée → ajout de lignes » remplacé

Depuis `…506` (PO-1), les lignes d'une commande envoyée/confirmée/reçue sont verrouillées ; depuis
`…507`, l'identité imprimée est figée quand la commande quitte le brouillon. Patron appliqué
partout (Preview, 5 ans, pilote, DR) :

```
insert commande (statut 'brouillon') → insert lignes (quantite_recue = 0)
→ changer_statut_commande_interne('envoyee') → ('confirmee')
→ enregistrer_reception_commande_interne(lignes, quantités cibles)   -- moteur canonique …322
   (statut recalculé : recue / recue_partiel ; entrée de stock pour les lignes reliées à un article)
→ ou changer_statut_commande_interne('annulee')
```

Même patron pour les **devis** (brouillon → lignes → envoyé → accepté/refusé/expiré ; un devis
accepté verrouille ses lignes, V3) et les **factures** (brouillon → lignes → émission → règlements).
Aucune quantité reçue posée à la main, aucun saut de statut, aucun trigger désactivé.

Contrôles vérifiés sur chaque seed : identité figée présente sur toute commande engagée, commande
`recue` soldée, `recue_partiel` entamée, total = lignes, pas de surréception, stock des lignes
reliées = quantité reçue.

## 5. Idempotence (runs 1, 2, 3)

Exigence : même empreinte **métier** après les runs 2 et 3 qu'après le run 1 (toutes colonnes hors
horodatages et UUID ; UUID contenus dans des valeurs neutralisés ; seules exclusions : valeurs
aléatoires par conception du produit — code d'adhésion, n° d'inscription, codes d'identification,
empreinte bcrypt). L'empreinte stricte (UUID compris) est aussi publiée.

Défauts de rejeu trouvés **par exécution** et corrigés :

| Seed | Dérive au rejeu | Cause | Correctif |
|---|---|---|---|
| pilote, démo | `compteurs_reference` +28 / +12 par run | `INSERT … ON CONFLICT DO UPDATE` : le trigger BEFORE INSERT d'identifiant consomme un numéro même en conflit | mise à jour ciblée, insertion seulement si absent |
| purge V2, Colors, Réserves | tous les compteurs doublés / compteur global d'entreprises | même mécanisme avec `ON CONFLICT DO NOTHING` | garde « déjà présent » (purge), `INSERT … WHERE NOT EXISTS` |
| pilote, démo | statut de chantier réécrit | `ON CONFLICT DO UPDATE SET statut` écrasait l'état issu de la synchronisation devis/factures | statut non réécrit |
| pilote | +1 ligne d'historique de capacité par run | insertion inconditionnelle | geste opérateur fait une fois |
| suivi terrain | contrôles GPS hors zone différents à chaque run | tirage sur l'UUID de session régénéré | tirage sur le pointage d'origine |
| Réserves (recette) | réserves renumérotées à la suite (R-9, R-10…) | `compteur_reserves` jamais remis à zéro | remis à zéro avec les réserves |
| 5 ans | rejeu impossible | suppression de devis acceptés, factures émises, commandes envoyées, paie verrouillée | historiques créés une fois, sans suppression |

Seeds non rejouables par construction (déclarés `idempotent: false`) : drill DR (base jetable
neuve à chaque drill), fixture perf (volumétrie aléatoire), compléments d'upgrade, fixture pgTAP.

## 6. Seed Preview année (priorité absolue)

### 6.1 Pourquoi il était cassé sur le train (4 causes indépendantes, trouvées par exécution)

1. **ACL canonique `20260902000255`** : `service_role` n'a plus aucun droit sur `employes`,
   `clients`, `devis`, `factures`, `commandes_fournisseurs`… (`REVOKE` explicites, confirmés par
   `has_table_privilege`). Le seed, écrit en supabase-js + clé `service_role`, échouait dès le
   préflight. Rendre ces droits pour un seed serait une régression de sécurité.
2. `employes.taux_horaire` / `cout_horaire` n'existent plus (`…205`, `…328`).
3. Préflight « le Gérant a exactement 99 permissions » : le catalogue en compte 100 depuis `…216`.
4. Devis acceptés et commandes engagées insérés avant leurs lignes (verrous V3 et PO-1), et un
   salarié sorti affecté au planning (`AFFECTATION_EMPLOYE_INACTIF`, garde légitime).

### 6.2 Correctif

- Le seed génère un **script SQL déterministe** exécuté par `supabase db query --linked` (rôle
  postgres), comme les autres scripts de recette Preview ; plus de clé `service_role`. Gardes de
  cible conservées + **projet lié par la CLI = Preview** exigé. `--emit-sql=<fichier>` écrit le
  script sans aucune connexion (relecture, harnais).
- **Préflight** en lecture seule, rejoué à chaque exécution : entreprise, 10 postes, compte Gérant
  (Auth puis UUID), appartenance unique, Compte dépôt non attribué, catalogue de permissions
  **lu en base**, **capacité de personnes**, collisions de numéros de commande et de pièces.
- **Un module = une transaction** ; insertion des seuls UUID absents puis contrôle de toutes les
  lignes du plan (entreprise, marqueur, valeurs) ; verrou consultatif (une relance attend une
  exécution interrompue encore active).
- Transitions métier (§4) ; taux/coûts dans leurs tables dédiées ; historique borné aux dates de
  contrat, salarié sorti créé actif puis **sorti par transition** en fin de peuplement (réintégré
  temporairement si un ancien état l'avait déjà sorti sans historique).

### 6.3 Preuves

- runs 1, 2, 3 : empreintes stricte et métier identiques ; 0 anomalie d'intégrité ;
  statuts finaux : devis 22 acceptés / 6 refusés / 4 expirés / 3 envoyés ; factures 14 payées /
  6 partielles / 3 en retard / 2 avoirs ; commandes 5 reçues / 5 partielles / 4 confirmées /
  4 annulées, 18 identités figées « envoi » ; 126 tâches (60 + 66 issues des lignes acceptées).
- **Reprise après interruption** : arrêt simulé au milieu des modules `lignesDevis`, `commandes`,
  `pointages`, `employeeExits` (modules précédents validés, module courant annulé par la base),
  puis 2 reprises : empreinte métier **identique** à une exécution d'un seul tenant.
  **SIGKILL réel** du client pendant l'exécution : la reprise attend la fin du backend orphelin
  (verrou consultatif) puis converge vers le même état. Sans ce verrou, la reprise échouait sur
  `pointages_pkey` (constaté, corrigé).
- 17 tests unitaires sans base (`scripts/seed-elsatia-preview-year.test.mjs`), dont : aucun
  `disable trigger` / `session_replication_role` / `capacite_personnes_bypass` / `service_role`
  dans le script généré, lignes avant transitions, préflight sans écriture.

## 7. DR

Flux complet exécuté par le harnais avec l'outillage DR lui-même :
`01_replay_migrations.sh --fresh` (stubs DR, 342/342) → `03_seed_synthetic_dataset.sql` →
`04_manifest` → `05_backup` → `06_restore --force` → `04_manifest` → **`07_verify` identique** →
**`08_verify_rls_functional` OK** → contrôles d'intégrité sur la base restaurée : 0 anomalie.

Seed DR aligné sur le patron métier : commandes par transitions et réception canonique ; stock
porté par ses mouvements (stock initial saisi comme entrée ; le réassort de 1 000 tuiles n'est plus
une entrée manuelle en doublon de la réception ; les 300 chevrons reçus créditent enfin le stock).
Montants de commandes inchangés (7 460 € et 3 000 € HT, recalculés depuis les lignes comme avant).
Stocks finaux : tuiles 1 700 (inchangé), chevrons 540 (240 avant : réception sans mouvement).
Prérequis d'environnement du drill (déjà documentés par ses scripts) : `postgresql-plpython3-16`,
`python3-nacl`, stub pgsodium (root), mot de passe jetable pour `postgres` et `authenticator`.

## 8. Pilote

Montants et états attendus **conservés** : commandes 4 536 € / 831 € / 2 880 € TTC (identiques au
rapport `…506`), statuts reçue / reçue partiellement / confirmée / brouillon ; 15 comptages de
`assertions_entreprise_pilote_btp.sql` OK après chacun des 3 runs et après nettoyage→reseed.
Correction d'état : le stock était double-compté (quantité déclarée + entrée « Stock initial »),
**aucun article** n'était sous son seuil alors que le pack pilote en promet (`ST-03` forçait une
mise à jour pour passer). Stock désormais égal aux quantités déclarées et au cumul des mouvements ;
la laine de verre est sous son seuil.
Nettoyage : résidu `compteurs_reference` (2 lignes orphelines) supprimé ; cycle nettoyage → reseed :
0 résidu, empreinte métier identique au premier seed.

## 9. Clés étrangères et invariants

`seed_harness.controles()` (`scripts/seeds/fixtures/harnais.sql`), après chaque seed, comparé à la
base de ses prérequis :

- **toutes** les clés étrangères des schémas `public`, `platform`, `storage` (0 orpheline — détecte
  aussi un seed qui aurait coupé l'intégrité référentielle), contraintes `NOT VALID` (8 dans le
  train lui-même, aucune ajoutée), **triggers laissés désactivés** ;
- devis engagé sans ligne ; facture émise sans ligne, montant payé ≠ paiements, paiement ≤ 0 ;
  commandes (total, identité figée, reçue soldée, partielle entamée, surréception, réception sur
  brouillon) ; réceptions → stock ; stock = cumul des mouvements, jamais négatif ; pointages et
  affectations dans l'entreprise du salarié et du chantier ; **Réserves** (réserve / chantier
  Réserves / chantier GP dans la même entreprise) ; **Colors, Tools et toute table multi-tenant**
  (y compris sans clé étrangère, ex. `compteurs_reference`) rattachées à une entreprise existante ;
  codes d'identification rattachés à une ressource existante.

Anomalies trouvées par ces contrôles et corrigées : stock pilote et DR, compteurs orphelins du
nettoyage pilote, codes d'identification et historique d'affectations laissés par le reset démo.

Anomalies **héritées** (signalées à part, non imputées) : le squelette RLS pgTAP
`isolation_multitenant.inc` porte volontairement un devis accepté et une facture émise sans lignes,
des totaux de commande saisis et un stock initial sans mouvement. Partagé par 94 suites pgTAP : non
modifié.

## 10. Sécurité : contournements de garde

- Seeds de recette Preview (année, 5 ans, onglets, terrain, pilote), démo et DR : **aucun**
  contournement ; les verrous (devis accepté, facture émise, PO-1, CM-06, capacité, salarié actif)
  sont respectés par les transitions métier.
- Contournements restants, **déclarés** dans le registre et vérifiés par le test statique
  (tout contournement non déclaré, ou déclaré mais absent, fait échouer la CI) :
  - `cleanup_entreprise_pilote_btp.sql` et `reset_entreprise_demo_18_mois.sql` : désactivation
    **nommée** des triggers d'immuabilité (et CM-06 pour le pilote), **dans une seule transaction**,
    réactivation vérifiée. **Défaut corrigé** : chaque `ALTER TABLE … DISABLE TRIGGER` était validé
    seul ; un échec en cours (reproduit sur le verrou PO-1) laissait les gardes d'immuabilité
    **désactivées pour toutes les entreprises** du projet.
  - fixtures locales (`seed_purge_qualification_v2.sql`, fixtures pgTAP) :
    `set local elsatia.capacite_personnes_bypass`, borné à la transaction et au superutilisateur.
- Scripts LEGACY retirés du registre du wrapper Preview et refusés avec motif ; correctif annexe :
  un nom hérité d'`Object.prototype` (`constructor`) était considéré comme un script connu.

## 11. Harnais et CI

| Commande | Rôle | Base |
|---|---|---|
| `npm run test:seeds` | registre (tout script classé, pas de BROKEN/UNKNOWN, couverture, contournements déclarés, LEGACY refusés, patron « document engagé inséré avec statut » interdit), seed Preview, garde du wrapper — 48 tests | aucune |
| `npm run verify:seeds` | exécution réelle §3 ; rapport JSON (`--report=`) ; code de sortie ≠ 0 si un seed échoue | PostgreSQL 16 local (root ou `PGUSER=postgres`) |

CI (`.github/workflows/ci.yml`) : `test:seeds` dans le job `verification` ; nouveau job **`seeds`**
(PostgreSQL 16 + PL/Python/PyNaCl, mot de passe jetable généré et masqué) qui rejoue toutes les
migrations puis tous les seeds. **Une migration qui rend un seed incompatible fait échouer ce
job**, rapport en artefact `seeds-report`.

### Run final (base reconstruite depuis zéro, 342 migrations, dernière `20260927000507_rgpd_dette_residuelle_historique_affectations_bon_commande.sql`)

| Seed | Classe | Runs | Idempotent (métier) | Même état strict | Contrôles | Scénario | Durée |
|---|---|---|---|---|---|---|---|
| `preview-year` | PREVIEW | 3 | oui | oui | 0 anomalie | OK ×5 | 26 s |
| `pilote-btp` | PREVIEW | 3 | oui | non (UUID régénérés) | 0 anomalie | OK ×1 | 4 s |
| `entreprise-test-5-ans` | PREVIEW | 3 | oui | oui | 0 anomalie | — | 34 s |
| `entreprise-test-tous-onglets` | PREVIEW | 3 | oui | non (UUID régénérés) | 0 anomalie | — | 45 s |
| `entreprise-test-suivi-terrain` | PREVIEW | 3 | oui | non (UUID régénérés) | 0 anomalie | — | 42 s |
| `demo-18-mois` | PRODUCTION_TOOL | 3 | oui | non (UUID régénérés) | 0 anomalie | OK ×1 | 10 s |
| `dr-synthetic` | ACTIVE | 1 | oui | oui | 0 anomalie | OK ×1 | 124 s |
| `purge-qualification-v2` | CI_ONLY | 3 | oui | oui | 0 anomalie | — | 2 s |
| `perf-fixture` | CI_ONLY | 1 | oui | oui | 0 anomalie | — | 443 s |
| `perf-annuaire` | CI_ONLY | 2 | oui | oui | 0 anomalie | — | 35 s |
| `e2e-reserves` | CI_ONLY | 3 | oui | non (UUID régénérés) | 0 anomalie | — | 7 s |
| `e2e-colors` | CI_ONLY | 3 | oui | non (UUID régénérés) | 0 anomalie | — | 2 s |
| `upgrade-complements` | CI_ONLY | 1 | oui | oui | 0 anomalie | — | 5 s |
| `pgtap-rgpd-commandes` | CI_ONLY | 1 | oui | oui | 0 anomalie | — | 2 s |

Verdict du harnais : **ALL ACTIVE SEEDS QUALIFIED** (code de sortie 0). `npm run test:seeds` : 48/48.

## 12. Ce que ce verdict ne couvre pas

- **Aucune exécution sur Preview hébergée** (ni lecture, ni écriture) : tout est prouvé sur base
  locale à schéma identique. Le passage par `supabase db query --linked` d'un script de ~1,5 Mo n'a
  pas été éprouvé contre l'API hébergée ; en cas de limite de taille, le même script s'exécute par
  `psql` sur la chaîne de connexion Preview (`--emit-sql` puis `psql -f`).
- Reprise du seed Preview depuis un **état partiel laissé par l'ancienne version** (API
  service_role, août 2026) : raisonnée (plan identique jusqu'aux commandes, contrôles stricts qui
  arrêtent proprement sur toute divergence, réintégration du salarié sorti) mais non rejouée.
- Seeds PREVIEW déjà exécutés sur Preview avec l'ancien comportement (stock pilote double, statut
  chantier « termine ») : un rejeu ne les réécrit pas ; pour repartir propre, nettoyage puis reseed.
- Capacité de personnes de l'entreprise Preview `1bfc5dc6-…` : 11 salariés actifs prévus ; le
  préflight arrête proprement si la capacité ne suffit pas (geste opérateur plateforme).
- `reset_entreprise_demo_18_mois.sql` : son en-tête vise un projet Production alors que le README
  de `supabase/production/` l'interdit — contradiction documentaire préexistante, **à arbitrer**
  (script non ajouté au wrapper).
- `seed_juju_6_mois.sql` n'est pas réparé (LEGACY, entreprise supprimée) ; patron à suivre si
  besoin : `seed_entreprise_test_5_ans.sql`.
