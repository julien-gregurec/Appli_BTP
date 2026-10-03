# ELSATIA — PRODUCTION UPGRADE HARNESS V1 (ancienne Production 210 → tête V9.x)

> **Suite** : [`ELSATIA_PLATFORM_READINESS_V9_1.md`](ELSATIA_PLATFORM_READINESS_V9_1.md) — les ponts v1/v2 proposés ci-dessous
> (versions 298 / 399, antérieures à des migrations appliquées en Preview) ne sont **pas** intégrés ; ils sont remplacés
> par les ponts post-V9.1 du train (`20261003000201` phase 0, `20261003000202`). Le harnais y est qualifié sans `--bridge`.

```
SOURCE_LEDGER_ASSUMED=5777abbcb94fb899ed14a3e7e5213be8f3abb0e7 (dernière 20260824000231 ; rapporté, NON vérifié en direct)
SOURCE_MIGRATION_COUNT=210
TARGET_SHA=877a4b9f284150e5d4f06fd68250f3ea19ff62a1 (hardening) ; 24a0c2e9 (tête V9.1, arbre de migrations identique) — paramétrable
TARGET_MIGRATION_COUNT=391 (+2 ponts d'upgrade PROPOSÉS, hors train)
UPGRADE_TESTED=OUI — 181 migrations (13 hors ordre) + 2 ponts, sur Production 210 reconstruite et peuplée, 4 paliers
DATA_LOSS=0 (ZERO_PERTE : 153 tables / toutes lignes d'avant comparées clé par clé et colonne par colonne ; 13 changements DÉCLARÉS et vérifiés)
ACL_DIFF=0 vs fresh cible (inventaire fermé 15 familles, 12 397 lignes) ; avant→après inventorié, 0 signal bloquant
RLS_DIFF=0 vs fresh cible ; continuité d'accès : 0 perte non déclarée (après régularisation UPG-P1-1)
ROLLBACK_TESTED=OUI — restauration du dump d'avant upgrade : empreintes + ACL/RLS identiques, ledger 210 (S5)
INTERRUPTION_RECOVERY=OUI — coupure, panne intra-transaction, ledger en retard, ledger en avance, idempotence (S1–S6)
VOLUMETRIC_MAX=100 000 lignes par table critique (602 632 lignes au total)
```

## Verdict

**`PRODUCTION_UPGRADE_HARNESS_PARTIALLY_QUALIFIED`**

Le harnais est complet, paramétrable et qualifié **localement** de bout en bout. Avec le pont v2 et la régularisation
UPG-P1-1, l'upgrade 210 → `877a4b9f` **et** 210 → tête V9.1 `24a0c2e9` est vert à tous les contrôles (zéro perte,
sécurité fermée, anciennes offres, accès, interruptions, restauration), jusqu'à 100 000 lignes par table critique. Le verdict n'est pas
« LOCALLY_QUALIFIED » pour une raison de fond, pas d'outillage : **l'upgrade de la Production réelle n'est
PAS possible avec le train tel quel**. Le harnais l'a démontré et a produit les correctifs à arbitrer :

| Constat | Gravité | Effet sur une Production réelle | Réponse livrée |
|---|---|---|---|
| **UPG-P0-1** `20260921000300` échoue dès qu'une facture émise a des lignes | **P0 — bloquant** | upgrade arrêté au rang ~110 (transaction annulée, sans dégât) | ponts proposés `scripts/upgrade/bridges/` (v1 minimal, **v2 recommandé**) |
| **UPG-P0-2** `20260816000204` pose une contrainte « essai ≤ 30 j » | P0 conditionnel | upgrade arrêté si une entreprise post-231 a un `trial_end` Stripe hors fenêtre | précondition `bloquant_essai_hors_fenetre` (sonde + preflight) |
| **UPG-P1-1** « essai perpétuel » (statut `essai`, dates NULL, cas documenté de l'entreprise réelle ELSATIA) | **P1** | tous ses membres perdent l'accès à l'instant de l'upgrade | précondition `bloquant_essai_perpetuel` + SQL de régularisation **proposé** |
| **UPG-LOCK-1** `300` : cascade de recalcul quadratique sous ACCESS EXCLUSIVE | P1 opérationnel | 7,4 s (5 000) → 64,6 s (20 000) → **1 266 s = 21 min** (100 000) de blocage devis/factures | pont v2 : **3,6 s** (÷350), upgrade complet 1 287 s → **23 s** ; sinon fenêtre de maintenance ≥ 25 min |
| UPG-P2-1 | P2 | fin d'essai Stripe > 30 j tronquée rétroactivement par 204 | déclarée, sondée (`info_essai_tronque`) |
| UPG-P3-1 | P3 | `devis/factures.updated_at` réécrits à l'instant de l'upgrade (montants identiques) | déclarée ; supprimée par le pont v2 |
| UPG-PERF-1 | P2 | lectures sous RLS ≈ ×2 (gardes enrichies) ; planning d'autrui ×10–×20 | mesuré, non bloquant (< 2 s) |
| UPG-SEC-1 | décision | 233 ajoute l'administrateur plateforme `julien@elsatia.fr` (rôle total) | déclarée ; à confirmer au cutover |
| UPG-K-1 | **P1 cutover** | l'ancien code casse dès la 3ᵉ migration (37 accès à la fin, dont webhook Stripe) | runbook : base et code ensemble, jamais de rollback « code seul » |

Passage à `PRODUCTION_UPGRADE_HARNESS_LOCALLY_QUALIFIED` : intégrer (ou rejeter explicitement) les ponts dans la
tête V9.1, puis relancer `scripts/upgrade/production-to-v9x.sh --target-sha <tête V9.1 finale> …` sans `--bridge`
(le harnais doit alors être vert tel quel) et publier le plan qualifié (`--publish-plan`).

> **Aucune** connexion Production, Preview ou Stripe ; aucun secret ; aucun merge `main` ; aucune migration du
> train V9 modifiée. `exhvuzegsefmoguxoiak` n'apparaît que comme chaîne d'audit (garde de refus, comparaison
> d'attestation) — jamais comme cible.

---

## 1. Phase A — Inventaire historique

### 1.1 Point Production 210 (identifié, non vérifié en direct)

| Élément | Valeur | Source |
|---|---|---|
| Commit des 210 migrations | `5777abbcb94fb899ed14a3e7e5213be8f3abb0e7` (2026-08-24) | runbook `ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` §13.0, drill DB `a81f317` |
| Dernière version | `20260824000231` (rang 223 du train canonique) | idem §2.1bis |
| Code Production | `fcdd4e7c` (release/commercialisation-v1, 211 fichiers dont `…000233` **jamais appliquée**) | idem §13.0 |
| Écart 210 / 223 | 13 migrations Preview-only (`200`–`206`, `210`–`215`) **à horodatage < 231** → `--include-all` | idem « Pourquoi 210 et non 223 » |
| Manifeste figé | `scripts/upgrade/manifests/source-prod-210-5777abb.json` (version → sha256 des 210 fichiers) | ce lot |

Vérifié par le harnais : les 210 fichiers de `5777abb` sont présents **à l'octet près** dans chaque train
(V1 → V9.1), `5777abb` est ancêtre de chacun ; seule la mesure en direct du ledger (preflight P5/P7) dira si la
Production est toujours à ce point. Classement : **SOURCE_PRODUCTION_LEDGER = 5777abb (210), documenté, non
vérifié en direct** — et non `UNKNOWN`.

### 1.2 Graphe

```
PROD_HISTORIQUE 210 (5777abb, 2026-08-24) ── code fcdd4e7c (211 fichiers, 233 non appliquée)
  │  cibles de cutover planifiées, JAMAIS exécutées : 253 (ACL), 263 (996be15), 272 (train v2)
  ├─ release/gp-v1-rc 240 ─ gp-postcutover 263/265
  ├─ canonical V1 328 → V2 335 → V3 340 → V4 352 → V5 355 → V6 358 → V7 359
  ├─ V8 371 (53b4bc76) → 813 372 (23153716 ; Preview hébergée)
  ├─ V9 candidat 395 → V9 finale 389 (6392131a)
  ├─ hardening 391 (877a4b9f)
  └─ V9.1 (24a0c2e9, 391, même arbre de migrations que le hardening) → V9.1 finale (paramètre --target-sha)
```

### 1.3 Outillage existant réutilisé (et non dupliqué)

`scripts/local-postgres-bootstrap/` (bootstrap PG16, `upgrade_snapshot.py`, `upgrade_compare.py`),
harnais d'upgrade de train `scripts/qualification/upgrade-v3-v4.sh` … `upgrade-v9-post-v9-hardening.sh`,
`scripts/qualification/v9/ledger-check.sh`, DR `scripts/dr/` et `scripts/dr/v2/` (backup/restore/verify),
`scripts/verify-migration-targets.mjs`, pgTAP du dépôt. Aucun de ces outils ne partait de la Production 210 :
tous partaient d'un train (V3+) ; le drill 210 → 263 (`a81f317`) précède 120 migrations et n'avait que 7
sentinelles.

## 2. Phase B — Reconstruction d'une Production 210 locale

`scripts/upgrade/build-source.sh <base> [--vol N] [--remediation F] [--profil-acl supabase|minimal]`

- PostgreSQL 16 local jetable (socket Unix, peer auth) ; bootstrap `pg_bootstrap.sql` du dépôt ;
- **profil ACL « supabase »** (`lib/supabase_default_privileges.sql`, défaut) : privilèges par défaut d'un
  vrai projet Supabase (tout objet de `public` accordé à anon / authenticated / service_role), que les
  migrations 078 / 185 / 255 restreignent ensuite — sans lui la Production reconstruite serait plus fermée que
  la vraie (audit ACL V1 : 854 ACL excédentaires réelles) et l'upgrade des ACL ne serait pas exercé ;
- les **210 fichiers exacts** de `5777abb`, chacun dans sa transaction **avec sa ligne de ledger**
  (`supabase_migrations.schema_migrations`, comme la CLI) ; anciennes contraintes réelles (verrous 231…) actives.

## 3. Phase C — Jeu de données historique

Fichiers **d'époque** de `5777abb` quand ils existent + `scripts/upgrade/seed/` :

| Cas | Réalisation |
|---|---|
| petite / moyenne / volumétrique | « Petite SARL Histo » (2 employés) ; « Entreprise Test » (seed d'époque 5 ans + tous onglets + suivi terrain : ~50 000 lignes) ; « Volumetrique BTP » (500 → 100 000 lignes / table critique) |
| multi-entreprises, rôles | entreprises A / B de `isolation_multitenant.inc` d'époque (6 rôles chacune) ; admin-a membre de A **et** de l'entreprise moyenne |
| sans membre | « Entreprise Sans Membre » (clients, chantier, devis ; suppression programmée) |
| anciennes offres | essentiel v0 **59 €**, pro v1 historique **129 € (annuel 1 238,40)**, premium v0 **249 € annulé**, mini v1 **69 € négocié** (hors grille), business v1 449 € suspendu, entreprise v1 6 468 €/an |
| abonnements | actif, suspendu (impayé), essai expiré, annulé, **essai « perpétuel »** (statut essai, dates NULL) |
| comptes supplémentaires | options contractuelles (comptes terrain / administratifs, stockage) + facturation mensuelle par compte |
| IBAN historique | format `v1:iv:tag:ct` AES-256-GCM (clé de test), employé + fournisseur |
| permissions | postes prédéfinis + permissions personnalisées ; membre **sans poste** ; membre **désactivé** avec entreprise active pointée dessus ; utilisateur sans appartenance |
| support | session plateforme ouverte + close, journal, messages |
| Stripe | événements / journal / factures d'abonnement **synthétiques** (`*_SYNTH_*`, livemode=false) |
| tokens non secrets | empreintes de partage de documents, clés API hachées, codes d'accès |
| stockage | métadonnées `storage.objects` + chemin orphelin (fichier absent) |
| RGPD / légal | employé anonymisé, suppression d'entreprise programmée, snapshots d'identité NULL (factures émises) |

Fidélités imposées par l'ère 210 et **documentées** : verrous devis/factures neutralisés pendant les seeds
d'époque (antérieurs à 231) ; au-delà de 999 documents numérotés par entreprise la numérotation 210 **déborde**
(corrigé par 299 pendant l'upgrade) → les documents excédentaires du jeu volumétrique restent brouillons ;
planning créé par lots (verrou consultatif par ligne de `trg_verifier_heures_affectation`).

**Empreintes avant migration** (`lib/fingerprint.py capture`) : pour **chaque** table de public / platform /
auth / storage (aucune liste blanche) : clé primaire + md5 de la ligne, intégrité de chaque FK, 23 jeux de
valeurs critiques (`lib/critical_values.sql`).

## 4. Phase D — Harnais `scripts/upgrade/production-to-v9x.sh`

```bash
scripts/upgrade/production-to-v9x.sh --target-sha <sha> --target-migration-count <n> --source-db <base 210> \
  [--bridge F]… [--dry-run] [--stop-after V] [--fail-at V] [--resume] [--sans-sonde] [--publish-plan]
```

Jamais figé sur 391 : la cible est un SHA quelconque, le nombre attendu est vérifié contre son arbre, la
classification et le plan (`target-<sha8>.json`) sont produits pour CE SHA. Démontré sur `877a4b9f` et
`24a0c2e9` (V9.1).

Étapes : 1 snapshot avant · 2 ledger avant · 3 classification (déjà appliquées / en attente / hors ordre /
inconnues au ledger / historiques modifiées — bloquant) · 4 dry-run (copie jetable) · 5 application (une
transaction par migration **contenu + mesures + ligne de ledger**) · 6 snapshot après · 7 schéma upgradé vs
fresh cible (`pg_dump -s`) · 8 contrôles métier pgTAP (`scripts/upgrade/checks/`) · 9–15 inventaire fermé
(ACL tables / colonnes / fonctions / schémas / défauts, RLS, policies, fonctions SECURITY DEFINER + search_path,
triggers, index, contraintes, vues, storage, rôles) upgradé = fresh **et** avant → après · 10 sonde RLS réelle +
continuité d'accès par appartenance · 16 zéro perte · 17 performance sanity (requêtes d'écran sous RLS).

Garde-fous : refus de toute variable d'environnement de connexion (PG*, DATABASE_URL, SUPABASE_*, STRIPE_*),
de tout argument URL / `supabase.co` / ref Production ou Preview, de toute connexion non-socket ; la source
n'est jamais modifiée (copie).

## 5. Phase E — Zéro perte

`VERDICT : ZERO_PERTE` à chaque palier. Comparaison clé par clé et **colonne par colonne** ; distinction
« NULL renseigné » / « valeur écrasée » ; colonne supprimée = P0 sauf déplacement déclaré **et vérifié valeur
par valeur**. Changements déclarés (`scripts/upgrade/expected-changes.json`, motif + migration) :

| Table | Changement | Migration |
|---|---|---|
| employes | `cout_horaire`, `taux_horaire` **déplacées** → `employes_cout_horaire`, `employes_taux_facture` : 100 % retrouvées | 205, 328 |
| entreprises | `abonnement_essai_debut/fin` renseignés (NULL→) ; 1 fin d'essai Stripe **tronquée** (UPG-P2-1) | 204 |
| devis / factures | `updated_at` rafraîchis (UPG-P3-1) ; snapshots d'identité NULL→ renseignés, marqués `identite_incertaine` | 300, 272, 308, 501 |
| plans_abonnement | versions désactivées (`actif`, `valide_au`) + 8 versions ajoutées ; prix / ids d'avant intacts | 200, 201, 254, 802 |
| historique_tarification / plateforme_admins / storage.buckets | ajouts seulement | 254 / 233 / nouvelles apps |

Contrôles complémentaires : FK — aucun nouvel orphelin, aucune FK validée violée ; 23 jeux de valeurs critiques
(contrats, facturation, RH, IBAN chiffrés, documents, Stripe synthétique, support, tokens, auth) identiques hors
ajouts déclarés.

## 6. Phase F — Anciennes offres

`scripts/upgrade/checks/legacy_offers.test.sql` : **24/24** à chaque palier. Aucun contrat modifié
rétroactivement (prix, version, plan, périodicité, statut, ids Stripe) ; le contrat négocié à **69 €** n'est pas
remappé vers 79 ; aucun contrat attaché aux versions transitoires **69 / 199 / 399** que TARIFS-V2 (201) crée puis
que 802 désactive ; versions historiques intactes (59 / 129 / 249, mini v1 annuel 948 = 12×) ; seul le catalogue
**actif** (nouveaux contrats) passe à 79 / 249 / 449 / 599, annuel = 10×. À noter pour le cutover : entre 201 et
802, le catalogue actif est **transitoirement** 69 / 199 / 399 — sans trafic (maintenance) c'est sans effet.

## 7. Phase G — Sécurité

- **Fermeture** : inventaire de la base upgradée **identique** à celui du fresh cible (15 familles, 12 397 lignes,
  0 en trop / 0 manquante) ; schéma identique au fresh à l'ordre d'une colonne près (`entreprises`, colonne
  posée par 231 en Production puis « if not exists » par 204 — toléré et listé).
- **Avant → après** : 0 signal bloquant (aucune RLS retirée, aucun privilège ajouté à anon / PUBLIC sur un objet
  existant, aucune SECURITY DEFINER sans search_path, aucun bucket rendu public) ; tables 210 : 752 ACL retirées /
  14 défauts révoqués (réconciliation 255, profil Supabase) ; 2 tables `platform` sans RLS mais sans aucun privilège
  anon / authenticated (non exposées).
- **Isolation sur données historiques** (`checks/security_isolation.test.sql`, **21/21**) : anon (0 ligne, plus
  même de privilège), multi-entreprises, membre désactivé, utilisateur sans appartenance + entreprise active
  orpheline, SEC-4 (`entreprise_active_id` vers un tenant étranger refusé), IBAN illisibles hors permission.
- **Continuité d'accès** (`lib/access_check.py`, `est_membre_actif` sous l'identité de chaque membre, avant /
  après) : 19 appartenances ; pertes **toutes déclarées** (entreprise A : essai expiré, désormais appliqué en base
  par 803 — l'application 210 redirigeait déjà) ; réduction de visibilité déclarée (planning d'autrui pour un
  membre sans permission, PL-05). **Sans régularisation, UPG-P1-1 est détecté** : le gérant de l'« essai
  perpétuel » perd tout accès.

## 8. Phase H — Volumétrie

`scripts/upgrade/volumetrie.sh` (source reconstruite + remédiation, harnais complet sans sonde par utilisateur) :

| Palier (lignes / table critique) | Lignes totales | Application des 183 migrations | `300` | Harnais complet | Verdict |
|---|---|---|---|---|---|
| 500 | 56 398 | 19 s | 0,8 s | ~4 min | ✅ |
| 5 000 | 81 298 | 27 s | 7,4 s | 263 s | ✅ |
| 20 000 | 163 932 | 85 s | 64,6 s | 521 s | ✅ |
| 100 000 | 602 632 | **1 287 s** | **1 266 s** | 3 694 s | ✅ |

Mémoire backend max (contextes) : 9,3 Mo (5 000) → 14,2 Mo (20 000) → 33,6 Mo (100 000) ; RSS client du harnais ≤ 110 Mo.

Classement verrous (mesuré au palier max : verrous réellement tenus par la transaction, tables réécrites, lignes
existantes touchées) : **SAFE 83 · CAUTION 99 · MAINTENANCE_WINDOW_REQUIRED 1**. Seule
`20260921000300` exige une fenêtre (cascade de recalcul, coût quadratique, ACCESS EXCLUSIVE sur devis /
factures / lignes). Les CAUTION prennent un verrou fort **bref** sur des tables 210 (création de triggers,
contraintes, backfills < 0,5 s) : en Production, appliquer avec `lock_timeout` et trafic coupé.

**Pont v2** (`bridges/v2/`, run sur la tête V9.1 `24a0c2e9`, même source 100 000) :

| Mesure (100 000) | Sans pont v2 (pont v1) | Avec pont v2 |
|---|---|---|
| Dry-run (183 migrations) | 1 279 s | **19 s** |
| Application (183 migrations) | 1 287 s | **23 s** |
| `20260921000300` | 1 266 s, ACCESS EXCLUSIVE sur `devis`, `factures`, `lignes_devis`, `lignes_factures` ; 404 500 lignes touchées (cascade) | **3,6 s**, ACCESS EXCLUSIVE sur les deux tables de lignes seulement ; 201 440 lignes (le seul backfill) |
| `devis` / `factures` `updated_at` | réécrits (UPG-P3-1) | **inchangés** |

`300` reste classée MAINTENANCE_WINDOW_REQUIRED par la règle (DML > 10 000 lignes sous verrou exclusif), mais
pour 3,6 s : la fenêtre de maintenance du cutover (trafic fermé) la couvre largement.

### 8.1 UPG-PERF-1 — lectures sous RLS

Requêtes d'écran mesurées sous RLS (médiane de 3, avant / après, mêmes conditions) : **≈ ×2 à tous les paliers**
(ex. 5 000 : liste devis 269 → 526 ms ; 100 000 : 3,0 → 6,1 s ; journal 28,5 → 56,2 s). Cause : `est_membre_actif`
/ `a_permission` (SECURITY DEFINER, évaluées ligne par ligne) font désormais aussi `session_courante_revoquee()`,
`est_acces_support_actif()` et des contrôles d'abonnement / suspension. Planning d'autrui ×10–×20 (PL-05 :
`peut_consulter_affectation_employe` par ligne). Non bloquant au sens du harnais (aucune régression > ×3 au-delà
de 2 s), mais les valeurs absolues à 100 000 lignes par entreprise sont élevées **avant comme après** :
recommandation hors upgrade — politiques « ensemble » (`entreprise_id in (select …)` évalué une fois par requête)
plutôt que fonctions par ligne.

## 9. Phase I — Interruptions

`scripts/upgrade/interruption.sh` :

| Scénario | Simulation | Résultat |
|---|---|---|
| S1a | coupure propre après `20260902000255` (point de non-retour ACL) | ✅ code 75 ; ledger 253 = 210 + préfixe exact du plan |
| S1b | reprise `--resume` | ✅ upgrade complet qualifié (ledger 393) |
| S2a | panne injectée DANS la transaction de `300` | ✅ code 76 ; schéma + ACL + ledger **identiques** à l'état d'avant (empreinte `592cef31d7dd`) |
| S2b | reprise après panne | ✅ upgrade complet qualifié |
| S3a | ledger EN RETARD (300 appliquée sans sa ligne) — reprise naïve | ✅ 300 rejouée sans erreur (idempotente) ; état final qualifié |
| S3b | réparation manuelle : état prouvé = référence, version inscrite | ✅ reprise qualifiée |
| S4 | ledger EN AVANCE (version inscrite, migration jamais appliquée) | ✅ **détecté** : schéma ≠ fresh, fermeture sécurité KO → restauration |
| S5 | restauration du dump d'avant upgrade | ✅ 153 tables / 56 188 lignes identiques, ACL/RLS identiques, ledger 210, 0 erreur `pg_restore` |
| S6 | idempotence (chaque migration rejouée une 2ᵉ fois) | 128 idempotentes / **55 non idempotentes** → la reprise se fonde sur le ledger, jamais sur l'idempotence |

Deux faux positifs de l'outillage ont été corrigés pendant la phase (et non masqués) : le jeton aléatoire
`\restrict` de `pg_dump` ≥ 16.10 et l'aplatissement des `AND` d'une contrainte CHECK par dump / restore.

## 10. Phase J — Rollback

Aucun downgrade SQL n'est supposé. Classement par migration (mesuré) : **REVERSIBLE 52 · FORWARD_ONLY 80 ·
RESTORE_REQUIRED 51** ; dès la 1ʳᵉ migration (`200`, catalogue) le retour arrière fiable est la restauration.
Runbook : [`docs/runbooks/ELSATIA_PRODUCTION_V9X_ROLLBACK.md`](../runbooks/ELSATIA_PRODUCTION_V9X_ROLLBACK.md)
(avant code / après DB / après code / après trafic / données écrites par la nouvelle version).

## 11. Phase K — Ancien code Production sur nouvelle base

- **Contrat statique** (`lib/old_code_contract.py`) : 983 accès base de `fcdd4e7c` (427 fichiers). Sur la base
  upgradée : 939 OK, 3 OK via service_role, 4 déjà cassés en 210 (dérive / heuristique), **37 CASSÉS par
  l'upgrade** — webhook Stripe d'abonnement (INSERT `stripe_webhook_events`, `abonnement_evenements`,
  `factures_abonnement`, `abonnements_entreprises`), enregistrement des paiements, support, cartes BTP / signatures
  (colonnes sensibles d'`employes`), remises et console plateforme.
- **Fenêtre** (`old-code-window.sh`, contrôle après CHAQUE migration) : rollback « code seul » sûr jusqu'à
  `20260816000201` (#2) ; casse dès `20260816000202` (#3) ; 35 accès cassés après l'ACL `255` (#43).
- **pgTAP d'époque** (26 fichiers de `5777abb`) : 21/25 exécutables sur 210 (4 KO déjà en 210) ; sur 391, la fixture
  d'époque est refusée par la garde de capacité (`CAPACITE_PERSONNES_ATTEINTE`, R1) : 6/25.

**Conséquence cutover : base et code basculent ensemble ; aucun trafic sur l'ancien code après la 2ᵉ migration.**

## 12. Phase L — Préflight Production

`npm run production:v9x:preflight -- --target-sha … --target-migration-count … --ledger <export> \
  --production-attestation <json> --backup-attestation <json> [--target-plan …]`

Ne se connecte à rien, n'écrit rien (vérifié par test : aucune API d'écriture / réseau / psql dans le source).
Refuse : P1 mauvaise branche · P2 SHA inconnu / ≠ HEAD / non publié · P3 nombre de migrations · P4 migration
historique modifiée / renommée / absente (manifeste 210) · P5 ledger non préfixe (accepte source + préfixe du plan,
pour une reprise) · P6 migrations inattendues (absentes du plan qualifié pour ce SHA) · P7 Production non attestée
(ref, empreinte du ledger, lecture seule, préconditions `bloquant_*` et préconditions du plan) · P8 sauvegarde
absente / > 24 h / autre projet / restauration jamais testée ou testée sur Production/Preview · P0 option de
connexion ; un plan qualifié **avec ponts** est refusé tant que chaque pont n'est pas dans l'arbre de la cible à l'octet
près. Tests : `npm run test:production-v9x-preflight` → **32/32**. Données d'entrée Production : sonde
**lecture seule** `scripts/upgrade/sql/production_readonly_probe.sql` (transaction READ ONLY, SELECT uniquement),
exécutée par l'opérateur hors de ce dépôt ; gabarits d'attestation dans `scripts/upgrade/attestations/`.

**Démonstration sur la vraie tête V9.1** (`--depot` = checkout local de `24a0c2e9`, attestations **simulées**,
référence de projet fictive) : P1 ✅ P2 ✅ P3 ✅ P4 ✅ (210 migrations historiques identiques) P5 ✅ (ledger 210 =
source + préfixe 0/181) **P6 ❌ « plan qualifié AVEC ponts absents de la cible »** P7 ✅ P8 ✅ → `PREFLIGHT REFUSÉ` :
c'est l'état exact d'aujourd'hui (témoin `witnesses/…/preflight-demo-v91/`).

## 12 bis. Plan qualifié publié

`scripts/upgrade/manifests/target-24a0c2e9.json` (lu par le preflight, P6/P7) : 183 migrations à appliquer depuis
210 + 2 ponts v2 (sha256), classées — verrous mesurés au palier 100 000 avec pont v2 : **SAFE 84 · CAUTION 98 ·
MAINTENANCE_WINDOW_REQUIRED 1 (`300`, 3,6 s)** ; réversibilité : **REVERSIBLE 52 · FORWARD_ONLY 80 ·
RESTORE_REQUIRED 51** ; préconditions bloquantes `bloquant_essai_hors_fenetre`, `bloquant_essai_perpetuel`.

## 13. Recommandations à l'équipe V9.1

1. Intégrer le **pont v2** (`bridges/v2/20260921000298…`, `…399…`) au train V9.1 (versions libres, gardées par le
   ledger : no-op sur la Preview hébergée) — corrige UPG-P0-1, UPG-LOCK-1, UPG-P3-1.
2. Décider UPG-P1-1 (régularisation des essais sans fin) et UPG-SEC-1 (admin 233) **avant** la fenêtre.
3. Relancer ce harnais sur la tête V9.1 finale, sans `--bridge`, avec `--publish-plan` ; le preflight lit ce plan.

## 14. Limites

- Pas de dump Production réel (interdit) : la source est la reconstruction exacte des **migrations** 210 + un jeu
  synthétique ; une dérive non versionnée de la Production (hors 231) n'est pas reproduite. La sonde lecture seule
  et le preflight existent pour cela.
- PostgreSQL 16 local (Production : 17) ; pas de GoTrue / PostgREST / Storage réels ; `pgsodium` simulé.
- Durées mesurées sur une VM locale (4 vCPU) : ordres de grandeur, pas une promesse de durée Production.

## 15. Reproduire

```bash
service postgresql start
# Production 210 reconstruite + jeu historique (+ remédiation UPG-P1-1 simulée sur la copie locale)
scripts/upgrade/build-source.sh h210_v500_rem --vol 500 --remediation scripts/upgrade/sql/remediation_essai_perpetuel_PROPOSITION.sql
# Upgrade qualifié vers n'importe quelle tête (ici V9.1 + pont v2)
scripts/upgrade/production-to-v9x.sh --target-sha 24a0c2e993ec0836b492ea72f27ed7dc347a20fa --target-migration-count 391 \
  --source-db h210_v500_rem --bridge scripts/upgrade/bridges/v2/20260921000298_pont_upgrade_backfill_lignes_avant.sql \
  --bridge scripts/upgrade/bridges/v2/20260921000399_pont_upgrade_backfill_lignes_apres.sql --out /tmp/upg
# Paliers 500 → 100 000, interruptions S1–S6, fenêtre de l'ancien code
UPG_PONTS="<pont 298> <pont 399>" scripts/upgrade/volumetrie.sh <sha> <n> /tmp/vol 5000 20000 100000
scripts/upgrade/interruption.sh h210_v500_rem <sha> <n> /tmp/inter --bridge <298> --bridge <399>
scripts/upgrade/old-code-window.sh h210_v500_rem <sha> /tmp/fenetre --bridge <298> --bridge <399>
# Preflight (lecture seule) et ses tests
npm run test:production-v9x-preflight
npm run production:v9x:preflight -- --target-sha <sha> --target-migration-count <n> --ledger … --production-attestation … --backup-attestation …
```

## 16. Fichiers

`scripts/upgrade/` : `production-to-v9x.sh`, `build-source.sh`, `volumetrie.sh`, `interruption.sh`,
`old-code-window.sh`, `preflight.mjs` (+ test), `expected-changes.json`, `lib/` (common, fingerprint,
critical_values, security_snapshot, security_compare, access_check, classify, schema_diff, strip_txn, perf_sanity,
old_code_contract, supabase_default_privileges), `seed/`, `checks/`, `bridges/` (v1, v2), `sql/` (sonde lecture
seule, remédiation proposée), `manifests/`. Preuves : `docs/qualification/witnesses/production-upgrade-harness-v1/`.
