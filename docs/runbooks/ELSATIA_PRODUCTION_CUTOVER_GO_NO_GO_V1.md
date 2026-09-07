# ELSATIA — GO / NO-GO de cutover Production V1

**Lot :** `ELSATIA-PRODUCTION-CUTOVER-PREFLIGHT-V1` — 2026-09-07
**Nature :** checklist de décision. **Production touchée : NON.**

Audit d'appui : `docs/audits/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_V1.md`
Déroulé : `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_RUNBOOK_V1.md`

---

## Règle de décision

> **GO exige que TOUTES les lignes bloquantes soient à ✅.**
> **Une seule ligne à ❌ ou ⚠ non levée = NO-GO.**
> Aucune ligne ne se compense, ne se moyenne, ne se reporte « on verra pendant la fenêtre ».
> Le NO-GO est le **résultat par défaut** : c'est le GO qui doit être démontré.

Trois niveaux :
- **A — avant d'ouvrir la fenêtre** (jours/semaines à l'avance)
- **B — GATE T-45** (baseline Production, lecture seule)
- **C — GATE T0** (dernière décision avant écriture)

---

# A. Avant d'ouvrir la fenêtre

## A.1 — Ledger et cible

| # | Critère | Attendu | État au 2026-09-07 | Bloquant |
|---|---|---|:--:|:--:|
| A1 | Ledger dépôt connu et vérifié | 263, max `…000265` | ✅ `npm run verify:migrations` = 263 valides | ✅ |
| A2 | SHA cible figé et non ambigu | `996be15…` | ✅ vérifié (= `1d15289` + documentation seule) | ✅ |
| A3 | Gap recalculé depuis le dépôt | **53**, append-only 53 A / 0 M / 0 D | ✅ recalculé ce jour | ✅ |
| A4 | `--include-all` documenté comme obligatoire | oui (13 horodatages inversés) | ✅ | ✅ |
| A5 | Fast-forward possible vers la Production Branch | `origin/release/…` ancêtre de `996be15` | ✅ vérifié | ✅ |
| A6 | Aucune migration concurrente ; ledger gelé à 263 | oui | ✅ | ✅ |
| A7 | Baseline Production **attendue** documentée | 210, `…000231` | ✅ (image Git `5777abb` = 210 fichiers) | ✅ |

## A.2 — Infrastructure et sauvegardes

| # | Critère | Attendu | État | Bloquant |
|---|---|---|:--:|:--:|
| A8 | **Supabase Production en plan Pro** | actif | ❌ **plan gratuit** | ✅ **BLOCKER E-03** |
| A9 | **Backup managé quotidien réellement listé** | ≥ 1 sauvegarde visible | ❌ dépend de A8 | ✅ **BLOCKER** |
| A10 | PITR | décision tranchée (oui/non, +100 $/mois) | ❌ non tranché | ⚠ non bloquant si A9 + B7 |
| A11 | Volume DR chiffré monté, espace suffisant | ≥ 50 Gio | ✅ monté, 1,4 Tio libres | ✅ |
| A12 | Procédure de dump **exécutable sur le poste opérateur** | testée contre Preview | ❌ `pg_dump`/`psql` **absents du PATH** (**O-1**) | ✅ **BLOCKER** |
| A13 | Procédure de restauration testée | test réussi hors Production | ⚠ prouvée en drill offline, à rejouer à T-15 | ✅ |
| A14 | Compte bancaire ELSATIA ouvert | oui | ❌ non confirmé au dépôt | ✅ (conditionne A8) |

## A.3 — Gouvernance humaine

| # | Critère | Attendu | État | Bloquant |
|---|---|---|:--:|:--:|
| A15 | Date et heure de fenêtre fixées | valeurs réelles | ❌ **ACTION JULIEN** | ✅ |
| A16 | Rôle A (opérateur DB) nommé | nom | ❌ **ACTION JULIEN** | ✅ |
| A17 | Rôle B (opérateur applicatif) nommé | nom | ❌ **ACTION JULIEN** | ✅ |
| A18 | **Rôle C (décideur rollback) nommé, distinct de A** | nom | ❌ **ACTION JULIEN** | ✅ **NO-GO explicite si vide** |
| A19 | Rôle D (vérificateur smokes) nommé | nom | ❌ **ACTION JULIEN** | ✅ |
| A20 | **Rôle E — second admin humain identifié** | nom | ❌ **BLOCKER E-04, bus factor 1** | ✅ |
| A21 | Second admin : compte Auth Production créé | oui | ❌ | ✅ |
| A22 | Second admin : **TOTP enrôlé et vérifié par la personne** | oui | ❌ | ✅ |
| A23 | Procédure d'activation du second admin comprise et planifiée à T+45 | oui | ✅ documentée (runbook P5/P6) | ✅ |
| A24 | Contact rollback joignable toute la fenêtre | oui | ❌ **ACTION JULIEN** | ✅ |
| A25 | Communication utilisateurs tranchée | oui/non assumé | ❌ **ACTION JULIEN** | ⚠ |

> `plateforme@invalid.local` **n'est pas** un second admin. A20→A22 exigent un humain.
> A20 ne peut pas être « activé » avant le cutover : les migrations `…000237`/`…000250` imposent
> AAL2. Le prérequis est **prêt à activation**, l'activation a lieu à T+45.

## A.4 — Tests pré-cutover (sur `996be15`, hors fenêtre)

| # | Test | Attendu | État | Bloquant |
|---|---|---|:--:|:--:|
| A26 | `npm run verify:migrations` | 263 valides | ✅ **exécuté ce jour — PASS** | ✅ |
| A27 | Base fraîche 263 (`db:reset`) | 0 erreur | ⚠ à exécuter (**Docker UP**) | ✅ |
| A28 | **pgTAP complet** (`npm run test:db`, 55 suites) | 100 % PASS | ⚠ à exécuter (**Docker UP** — E-11 levée) | ✅ |
| A29 | `npm run typecheck` | 0 erreur | ⚠ à exécuter | ✅ |
| A30 | `npm run lint` | 0 erreur | ⚠ à exécuter | ✅ |
| A31 | `npm run test` | 100 % PASS | ⚠ à exécuter | ✅ |
| A32 | `npm run verify:secrets` | PASS | ⚠ à exécuter | ✅ |
| A33 | `npm run build` | succès | ⚠ à exécuter | ✅ |
| A34 | Multi-tenant (suites d'isolation) | PASS | ⚠ via A28 | ✅ |
| A35 | Auth / AAL2 | PASS | ⚠ via A28 | ✅ |
| A36 | Entitlements Tools (R8/R9/R10) | PASS | ⚠ via A28 | ✅ |
| A37 | Billing / capacité (R1/R2/R3) | PASS | ⚠ via A28 | ✅ |
| A38 | Global owner / support | PASS | ⚠ via A28 | ✅ |
| A39 | Colors | PASS | ⚠ via A28 | ✅ |
| A40 | **Restore 210 → 263** | 263 atteint, 0 erreur | ⚠ à rejouer sur `996be15` | ✅ |
| A41 | **Drift Fresh ↔ Restore = 0** | 0 | ⚠ à rejouer | ✅ |
| A42 | `npm run verify:stripe-prices --strict` | 8/8 | ❌ 4 `_ANNUEL` sur d'anciens Prices ×12 (E-15) | ⚠ P1 |

## A.5 — Environnement et secrets

| # | Critère | Attendu | État | Bloquant |
|---|---|---|:--:|:--:|
| A43 | Fiche variables Vercel Production relue (**noms et présence seulement**) | complète | ⚠ à faire à J-1 | ✅ |
| A44 | Couple Ed25519 prêt, **non encore posé** | prêt | ✅ généré et auto-vérifié | ✅ |
| A45 | Ordre Ed25519 compris : **Vercel d'abord, registry DB ensuite** (registry impossible avant ledger `…000245`) | oui | ✅ documenté | ✅ |
| A46 | `ABONNEMENTS_PUBLICS_OUVERTS=false` | false | ✅ | ✅ |
| A47 | `STRIPE_WEBHOOK_EXPECTED_MODE=test` | test | ✅ | ✅ |
| A48 | Aucune clé `sk_live_` en Production | aucune | ✅ | ✅ |
| A49 | `npx vercel whoami` authentifié (**O-2**) | oui | ⚠ à valider à J-1 | ✅ |
| A50 | `release/commercialisation-v1` locale à jour (**O-4** : 3 commits de retard) | `git fetch` fait | ⚠ à faire | ✅ |

## A.6 — DNS et e-mail

| # | Critère | Attendu | État | Bloquant |
|---|---|---|:--:|:--:|
| A51 | DKIM `elsatia.fr` (Brevo) actif | oui | ✅ documenté | ✅ |
| A52 | DMARC présent | `p=reject; adkim=s; aspf=s` | ✅ documenté | ✅ |
| A53 | **SPF cohérent avec les émetteurs réels** | décision tranchée | ❌ `v=spf1 -all` → alignement SPF **structurellement impossible**, tout repose sur DKIM | ✅ **BLOCKER E-08** |
| A54 | **Test d'envoi réel** avec `Authentication-Results` lus (Gmail + Outlook + tiers) | `dkim=pass`, `dmarc=pass` | ❌ non fait | ✅ **BLOCKER E-08** |
| A55 | Adresse `rua=` des rapports DMARC existante et relevée | oui | ❌ non vérifié | ⚠ |
| A56 | Domaines couverts : `elsatia.fr`, `app.`, `tools.`, `colors.` | oui | ⚠ à vérifier | ✅ |

> A53/A54 sont bloquants pour le **pilote**, pas pour la mécanique du cutover : un échec DKIM
> avec `p=reject` provoque un **rejet dur** (pas un classement en indésirables) sur la vérification
> d'adresse, la récupération de mot de passe, l'envoi de devis et de factures.

## A.7 — Stripe

| # | Critère | Attendu **pour ce cutover** | État | Bloquant |
|---|---|---|:--:|:--:|
| A57 | Production reste en **Stripe TEST** pendant la fenêtre | oui | ✅ | ✅ |
| A58 | Aucun produit / prix / webhook Live créé | aucun | ✅ | ✅ |
| A59 | Compte Live | **hors périmètre — lot P15** | ❌ inexistant | ❌ non bloquant ici |
| A60 | KYC | hors périmètre | ❌ | ❌ non bloquant ici |
| A61 | 24 Prices Live | hors périmètre | ❌ | ❌ non bloquant ici |
| A62 | Paiement réel contrôlé | hors périmètre | ❌ | ❌ non bloquant ici |

> **Stripe Live n'est pas un prérequis du cutover technique.** Il est un prérequis de
> l'**ouverture commerciale**, postérieure. Ne pas confondre les deux : c'est la confusion qui a
> le plus retardé ce projet.

## A.8 — Rollback

| # | Critère | Attendu | État | Bloquant |
|---|---|---|:--:|:--:|
| A63 | Absence de migration `down` **comprise et assumée** | oui | ✅ vérifié : aucune dans le dépôt | ✅ |
| A64 | Stratégies A / B / C connues de A, B et C | oui | ✅ | ✅ |
| A65 | **1er geste irréversible identifié = migration #6**, pas #43 | oui | ✅ établi par ce lot | ✅ |
| A66 | Point de non-retour ACL identifié = #43 `…000255` | oui | ✅ | ✅ |
| A67 | Critères de rollback immédiat écrits et lus | oui | ✅ runbook | ✅ |
| A68 | Sauvegarde restaurable **prouvée** avant toute écriture | oui | ⚠ à T-15 | ✅ |

---

# B. GATE T-45 — baseline Production (lecture seule)

Rempli en direct. **Un seul écart = STOP, la fenêtre est refermée sans aucune écriture.**

| # | Contrôle | Attendu | Constaté | GO/STOP |
|---|---|---|---|:--:|
| B1 | Ledger Production | **210** | ______ | ____ |
| B2 | Dernière version | `20260824000231` | ______ | ____ |
| B3 | Les 53 migrations du gap sont absentes | oui | ______ | ____ |
| B4 | Aucune migration appliquée en Prod n'est absente du dépôt | oui | ______ | ____ |
| B5 | Sentinelle `public.employes_cout_horaire` | **absente** | ______ | ____ |
| B6 | Sentinelle `public.avenants` | **absente** | ______ | ____ |
| B7 | Sentinelle `public.lignes_avenants` | **absente** | ______ | ____ |
| B8 | Sentinelle `public.pointages.cout_horaire_applique` | **absente** | ______ | ____ |
| B9 | Signature `plateforme_entreprises` — contient `option_ia_statut` ? | observation | ______ | informatif |
| B10 | Sorties archivées dans le volume DR | oui | ______ | ____ |

> **B5→B8 sont l'apport de ce lot.** Ces 4 objets sont créés **sans garde `if not exists`** par
> les migrations #6, #7 et #11. S'ils existent déjà (dérive hors ledger — précédent avéré en
> Production), la migration échoue **en dur au milieu de la fenêtre**. Coût du contrôle : une
> requête en lecture seule.

---

# C. GATE T0 — dernière décision avant écriture

Prononcé par **C**, à voix haute, tous présents.

| # | Contrôle | Attendu | Coché |
|---|---|---|:--:|
| C1 | GATE T-45 : **tout GO** | oui | ☐ |
| C2 | B1 snapshot managé pris, id + horodatage notés | oui | ☐ |
| C3 | B2 dump réalisé dans le volume DR, **SHA-256 calculé puis relu** | oui | ☐ |
| C4 | B3 backup Storage `verify-storage-backup` **PASS** | oui | ☐ |
| C5 | B5 état avant migration archivé (ledger, ACL, admins, sentinelles) | oui | ☐ |
| C6 | B6 manifeste unique, `backup_id` commun | oui | ☐ |
| C7 | **B7 test de restauration RÉUSSI**, sentinelles identiques | oui | ☐ |
| C8 | Rôle **C** présent et nommé | oui | ☐ |
| C9 | Rôle A et rôle B présents | oui | ☐ |
| C10 | Maintenance ON (si retenue) | oui | ☐ |
| C11 | La commande est exacte, `--include-all` inclus | oui | ☐ |
| C12 | La cible est bien Production (`--db-url`), **pas** un `--linked` vers Preview | oui | ☐ |
| C13 | Chacun a compris : **la migration #6 est le premier geste irréversible** | oui | ☐ |
| C14 | Critères de rollback immédiat relus à voix haute | oui | ☐ |

**Une case non cochée = NO-GO.**

---

# Verdict au 2026-09-07

## 🔴 NO-GO

Le cutover **ne peut pas être ouvert aujourd'hui**. Ce n'est pas la mécanique technique qui bloque
— elle est prête, recalculée et vérifiée — mais l'infrastructure, la gouvernance humaine et
l'outillage du poste opérateur.

### Blockers bloquants (7)

| # | Blocker | Réf. | Responsable |
|---|---|---|---|
| 1 | **Supabase Production en plan gratuit** — ni backup managé, ni PITR | A8, A9 / E-03 | **Julien** |
| 2 | **Bus factor 1** — aucun second admin `total` humain avec MFA | A20→A22 / E-04 | **Julien** |
| 3 | **Fenêtre non planifiée** — ni date, ni heure, ni rôles A–E ; **rôle C non nommé = NO-GO explicite** | A15→A19, A24 / E-10 | **Julien** |
| 4 | **SPF/DKIM/DMARC non validés par un envoi réel**, et SPF `-all` rend l'alignement SPF impossible | A53, A54 / E-08 | **Julien** |
| 5 | **Poste opérateur non outillé** — `pg_dump`, `psql`, `vercel` absents du PATH | A12, A49 / **O-1, O-2** | opérateur |
| 6 | **Suite pré-cutover non rejouée sur `996be15`** — pgTAP, Fresh, Restore, drift | A27→A41 | opérateur |
| 7 | **Compte bancaire ELSATIA non confirmé** au dépôt — conditionne le blocker 1 | A14 | **Julien** |

### Réserves non bloquantes pour le cutover technique

| # | Réserve | Réf. |
|---|---|---|
| R1 | 4 `STRIPE_PRICE_*_ANNUEL` pointent d'anciens Prices ×12 ; `STRIPE_PRICE_COMPTE_SUP_*` inexistantes | E-15, E-16 |
| R2 | Stripe Live à 0 % — **hors périmètre** du cutover, prérequis de l'ouverture commerciale | E-07 |
| R3 | Canons applicatifs Colors (`30fed99`) et Site (`1388d13`) non déployés — gestes **postérieurs** | E-13, E-14 |
| R4 | Documentation cutover éclatée sur 4 branches ; la copie de la branche courante annonce `1d15289` | **O-5** |
| R5 | Après cutover, `valider_preuve_pointage` ne renseigne plus `pointages.cout_horaire_applique` | audit §2.5-B |
| R6 | PITR non tranché | A10 |
| R7 | Refonte ELSATIA-UI-V2 non démarrée — conditionne l'ouverture commerciale, pas le cutover | E-18 |

### Ce qui est prêt et ne demande plus rien

- Ledger dépôt **263**, vérifié — 263 migrations valides, horodatages uniques.
- Cible **`996be15`** figée, sans ambiguïté ; fast-forward vers la Production Branch **possible**.
- Gap **53**, **append-only** (53 A / 0 M / 0 D), recalculé indépendamment.
- Ordre d'exécution complet, avec criticité par migration.
- **Classe de risque « inversion d'horodatage » fermée** : 8 cas analysés, 8 sans régression.
- **Aucun `TRUNCATE`, aucun `DELETE` au niveau migration**, un seul `DROP COLUMN` sans perte de
  donnée.
- Spécification de sauvegardes complète ; volume DR monté, 1,4 Tio libres.
- Runbook minuté, matrice de rollback par étape, critères de rollback immédiat.
- **Démon Docker disponible** → la réserve E-11 (pgTAP jamais exécuté) est **levée** : la suite
  complète est exécutable dès maintenant.

### Chemin le plus court vers un GO

```
1. Compte bancaire confirmé                          → débloque 7
2. Supabase Pro + 1 backup managé réellement listé   → débloque 1
3. Installer libpq / valider npx vercel              → débloque 5   (faisable aujourd'hui)
4. Rejouer T1→T18 sur 996be15 (Docker est UP)        → débloque 6   (faisable aujourd'hui)
5. Poser/trancher SPF + test d'envoi réel            → débloque 4
6. Désigner le second admin, créer le compte, TOTP   → débloque 2
7. Fixer date/heure + nommer A, B, C, D, E           → débloque 3
   → puis, et seulement alors, ouvrir la fenêtre.
```

Les points **3 et 4 ne dépendent de personne d'autre** et peuvent être traités immédiatement.
Les cinq autres relèvent d'une décision ou d'une démarche de Julien.
