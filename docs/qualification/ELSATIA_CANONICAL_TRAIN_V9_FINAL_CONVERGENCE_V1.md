# ELSATIA — Canonical Train V9 FINAL : reconvergence sur la base canonique (V1)

| | |
|---|---|
| Date | 2026-10-02 |
| Base canonique | V8 `53b4bc76` + **hotfix 813 original** `integration/elsatia-canonical-train-v8-hotfix-813-original` @ `de50245a259e06623fbab070f9dc296573bae0ce` : 372 migrations, dernière `20261002000813`, **= ledger de la Preview hébergée** |
| Branche | `integration/elsatia-canonical-train-v9-final` (worktree local), poussée sous la seule branche autorisée de la session `claude/compassionate-ptolemy-vu8vbx` (même commit, §10) |
| SHA final | le commit de ce rapport. Dernier commit de code : `b730405a` |
| Migrations | **389**, dernière **`20261002001113`** : socle 372 (intact) + **17**. Studio dédié : **23**, inchangé |
| Remplace | le train V9 `b50979d4`, construit depuis V8 seul. Il reste une **source** qualifiée, mais il n'est pas canonique : ses 13 migrations étaient toutes antérieures à 813 et 901 |
| Actions distantes | **Aucune** : ni Preview, ni Production, ni Vercel, ni Supabase hébergé, ni merge |

## 0. Verdict

**`ELSATIA CANONICAL TRAIN V9 FINAL LOCALLY QUALIFIED`**

| Preuve | Résultat |
|---|---|
| Base neuve | **389/389**, 0 erreur |
| Ledger (socle `de50245a`) | **9/9** : 0 migration du socle modifiée, 813 intact, préfixe de 372 versions strict, 389 versions uniques et monotones, 17 versions toutes > `20261002000813`, ledger simulé de la Preview : 17 en attente, `db push` **sans `--include-all`** |
| Upgrade **372 → 389**, passe historique (base V3 → V8 + 813 réelle, 52 utilisateurs) | 280 tables : **0 écart** de lignes, **117/117** empreintes ; policies : **seulement les 5 de Security V2**, vérifiées (§4) ; sonde RLS 2 499 cellules : **51 baisses, chacune égale exactement aux lignes des entreprises sans membre**, 0 autre écart ; EXECUTE **0 modifié** ; schéma + ACL **= fresh** (36 204 lignes, 2 311 ACL) ; **contrôles V8 47/47** |
| Upgrade 372 → 389, passe volumétrique (+ jeux 500 → 20 000 lignes) | 0 écart, schéma + ACL = fresh, **contrôles V9 33/33** |
| Droits nouveaux | 71 fonctions nouvelles : 48 `authenticated`, 12 `service_role` seul, 11 internes, **0 `anon`** ; 2 droits de table nouveaux, `service_role SELECT` sur le registre légal seulement ; **aucun changement silencieux** |
| pgTAP | **174 fichiers, 165 propres, 8 917 ok**. Les 170 fichiers communs avec `b50979d4` donnent des résultats **identiques fichier par fichier** (eux-mêmes identiques à V8 sur ses 163). 4 suites du socle, toutes propres : Legal 45, 813 14, Security 16, Stripe 23. Les 9 fichiers non propres sont les limites de banc connues depuis V8 |
| DB verify (38) | fresh **GO** |
| Applications | typecheck, lint (0 erreur, 15 avertissements), Vitest (**GP 2 845**, Tools 2 150, Réserves 226, Colors 431, Studio 343), build **5/5** |
| Bancs PostgREST réels (max_rows = 1 000) | Finance **89/89**, GP résiduel **50/50**, pointages **5/5**, rentabilité **4/4**, PDF Chromium **24/24** |
| Concurrence Billing / Stripe / Per-App (Stripe ciblé intégré) | Per-App **27/27**, cycle **22/22**, réabonnement **20/20**, essai **7/7**, ordre **15/15** |
| Playwright | Finance **11/11**, résiduel **12/12**, Employés **15/15**, pilote v2 + v3 **32/32**, pointages + facture brouillon **4/4**, rentabilité **5/5**, capacité **6/6**, soit **85/85** |
| Recette pilote backend | 69 PASS / 1 FAIL (PE-04) / 1 MANUAL, **identique à V8** ; scénarios auth / RLS tous verts |
| Seeds / incident | **ALL ACTIVE SEEDS QUALIFIED — 17/17 sur 389** ; drill d'incident **91/91** |
| Portes | `verify:migrations` 389 ✅, `verify:train-expectations` ✅ (389 / `…1113` / 38), `verify:env-manifest` ✅, `test:env-manifest` 67/67, `test:seeds` 48/48, `test:preview-pack` 31/31, `test:migration-targets` 7/7, `test:preflight-preview` 5/5, smoke e-mail 13/13, DR guard 10/10, drill (unit.) 6/6, bank-keys ✅, `verify:secrets` ✅, `verify:stripe-prices` ✅ |

---

## 1. Graphe des migrations (établi avant toute écriture)

| # | Version | Source | Statut |
|---|---|---|---|
| 1-371 | `20260710000001` → `20260928000812` | V8 `53b4bc7` | historique, intouchable |
| 372 | `20261002000813_plateforme_annuaire_lecture_pure` | **813 original `de50245a`** (sha du contenu `c95e3e…`) | intouchable. La branche `…-hotfix-813` (`23153716`) porte un **813 différent** (`194d1d…`) : **non utilisée** |
| 373 | `20261002000901_acceptations_documents_legaux_v1` | Legal Consent `d17177b4` (base V8) | inchangé ; merge `0b862aa4` |
| 374 | `20261002001001_securite_residuel_entreprise_sans_membres_v1` | Security Residual V2 `f9748802` | inchangé |
| 375-376 | `20261002001002_stripe_prix_contractuel_periodicite_v1`, `…1003_stripe_facture_essai_zero_v1` | Stripe ciblé `2de34959` | inchangés |
| 377-389 | `20261002001101` → `…1113` | **13 migrations de `b50979d4`, renumérotées** | corps inchangés (§3) |

| Ancien (b50979d4) | Nouveau | Objet |
|---|---|---|
| `20260928000813` | `20261002001101` | finance : exports, TVA, trésorerie |
| `20260928000814` | `…1102` | pointage d'équipe, planning |
| `20260928000815` | `…1103` | fiche chantier |
| `20260928000816` | `…1104` | quota IA |
| `20260930000101` | `…1105` | totaux pointages (B2) |
| `20260930000102` | `…1106` | facture brouillon (B4) |
| `20260930000301` | `…1107` | rentabilité |
| `20260930000401` → `…0404` | `…1108` → `…1111` | agrégats GP résiduels, plateforme, sélecteurs |
| `20260930000813` | `…1112` | rotation des clés IBAN / BIC |
| `20260930000901` (origine `20260930000101`) | `…1113` | rate limit de connexion (B1) |

**Collisions et contraintes** :
- les 13 migrations de `b50979d4` étaient toutes **antérieures** à 813 et 901, déjà au ledger de la Preview : gardées telles quelles, elles auraient imposé `--include-all`, donc elles sont renumérotées ;
- aucune collision de numéro ;
- aucun objet SQL partagé entre 813, 901, 1001, 1002, 1003 et les 13 (vérifié par l'inventaire des `create or replace function / table / policy`) ;
- les noms et les corps sont **identiques octet pour octet** à la renumérotation déjà faite sur `claude/pensive-bohr-7oxgd8` (`bf89b175`), donc un seul schéma de numérotation pour V9.

**Composants non retenus (décision propriétaire du 02/10)** :

| Composant | Branche | Décision |
|---|---|---|
| Export RGPD (`…1201-1202` + Studio dédié `20261002100000`) | `kind-mayer` porté sur `pensive-bohr` | **non retenu** (« en dernier si retenu ») |
| Relevé Lots 10-11 (`…1114-1116`) | `pensive-bohr` | non retenu (hors liste) |
| Security V2 « `3835732` » | — | **introuvable** dans le dépôt (aucun objet, aucune ref). Remplacé, par décision propriétaire, par **`f9748802`** (Security Residual V2, qualifié sur V8 + 813 + 901) |

## 2. Construction (réutilisation, sans refaire les lots prouvés)

| Commit | Objet |
|---|---|
| `0b862aa4` | merge Legal Consent sur le 813 original. **Reproduit à l'identique** (même arbre en rejouant `merge d17177b4` sur `de50245a`), donc réutilisé tel quel |
| `f9748802` | Security Residual V2 (`…1001`, 5 policies, redirections résiduelles) |
| `2de34959` | Stripe ciblé (`…1002-1003`, P1-P7). Base de la V9 finale : `de50245a → 0b862aa4 → f9748802 → 2de34959`, **sans** Relevé ni RGPD dans l'ascendance |
| `ebd343a4` | merge de `b50979d4`. Il réutilise **les résolutions de conflits déjà qualifiées** de V9 : `/planning`, `/dashboard`, `/pointage/gestion`, manifeste, registre des seeds, harnais |
| `a4e7c404` | ledger sur le socle V8 + 813, harnais d'upgrade depuis la base canonique (372 → 389), inventaire Preview régénéré |
| `b730405a` | classement d'upgrade : règles fermées Legal 901 / Security 1001, schéma `platform`, contrôles S03, S04, LG01 |

**Conflits du merge `ebd343a4`** :

| Fichier | Résolution |
|---|---|
| pack Preview, runbook, DB verify (attendus générés) | côté base, puis `sync:train-expectations` (389 / `20261002001113` / 38) |
| `src/app/actions/paiements-bancaires.ts`, `src/app/api/paie/documents/upload/route.ts` | **version Security V2** : c'est le même correctif RT-01 que `b50979d4`, écrit à l'identique. Le témoin `redirections-residuelles-rt01.test.ts` de `b50979d4` fait doublon avec `redirects-residuel-v9.test.ts` et est retiré |
| `.env*.example`, `config/env-manifest.json` (Stripe × lots) | fusion automatique ; `verify:env-manifest` OK |

Après le merge :
- références aux anciens numéros alignées dans le code, les tests, le pgTAP et l'outillage (`bank-keys.test.mjs`, générateur pgTAP résiduel, commentaires) ;
- libellé du contrôle DB verify 38 → `20261002001112` ;
- les rapports de lot gardent leurs numéros d'origine ;
- le rapport `ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md` (train `b50979d4`) est conservé tel quel, comme trace historique.

## 3. Migrations renumérotées : contrôle d'identité

Chaque migration renumérotée reçoit un en-tête « Train canonique V9 FINAL : numéro d'origine …, renuméroté … », et son **corps est inchangé** :
- `diff` sans les lignes de commentaire : identique à `b50979d4` et à `pensive-bohr` pour les 13 fichiers ;
- l'en-tête intermédiaire « V9 » de la migration rate limit est remplacé par l'en-tête final, qui conserve les deux numéros précédents.

## 4. Upgrade depuis la base canonique réelle (372 → 389)

`scripts/qualification/upgrade-v8-v9.sh` part désormais de l'état de la **Preview hébergée** :
1. base V3 → V7 historisée ;
2. compléments de chaque ère ;
3. 12 migrations V8, puis **813** (soit 372) ;
4. données de l'ère V8 ;
5. les **17** migrations de la V9 finale.

Deux passes, comme le train V9 : historique avec sonde RLS complète, volumétrique sans sonde.

**Règles fermées ajoutées** (`upgrade_v8_v9_classify.py`). Chacune est **vérifiée par une requête**, pas seulement listée :

| Règle | Ce qui est vérifié |
|---|---|
| R-V9-LEGAL-901 | tables nouvelles `platform.documents_legaux_versions` (**3** versions : CGU, CGV, DPA) et `platform.acceptations_documents_legaux` (0) ; seul droit nouveau : `service_role SELECT` ; 5 fonctions `platform._*` internes (aucun rôle d'API) |
| R-V9-SEC-1001 | les 5 policies réécrites (4 recréées sous le même nom, « bootstrap ou invitation par un membre actif » → « invitation par un membre actif ») : **aucune** ne référence plus `entreprise_sans_membres`, **toutes** gardent `est_membre_actif` / `est_membre_actif_reel`. Sonde : une cellule ne peut **baisser** que sur `postes` / `permissions_poste`, et d'**exactement** le nombre de lignes des entreprises sans membre. Observé : 51 cellules, chacune −21 sur `permissions_poste` |
| R-V9-RPC | fonction nouvelle définie par une migration V9 (schémas `public` et `platform`), `search_path` figé, jamais `anon` |

Ce que montre la sonde : **avant 1001, chacun des 51 utilisateurs sondés lisait les 21 lignes de la matrice de
permissions d'une entreprise sans membre**. C'est la faille de lecture fail-open que Security V2 ferme. Le
contrôle **S04** le re-prouve sous `authenticated` sur la base upgradée. Aucune autre visibilité ne change.

**Contrôles métier V9 33/33** :
- les 30 du train V9 (B4, exactitude > 1 000, parité RLS, IBAN v1, rate limit, mode sûr) ;
- **S03** : plus aucune policy fail-open ;
- **S04** : la matrice d'un tenant sans membre n'est plus lisible ;
- **LG01** : 3 versions légales.

## 5. Non-régression et domaines du socle

| Domaine | Preuves |
|---|---|
| Hotfix 813 (annuaire en lecture pure) | pgTAP `plateforme_annuaire_lecture_pure` 14/14 ; fichier identique au 813 original (ledger) |
| Legal Consent | pgTAP 45/45 ; Vitest (acceptation, documents légaux) dans GP 2 845 ; onboarding et pages légales servis par les recettes pilote (32/32) |
| Security V2 | pgTAP 16/16 ; Vitest `redirects-residuel-v9` ; upgrade S03 / S04 ; recette pilote (création, adhésion, invitation) verte |
| Stripe ciblé | pgTAP `stripe_readiness_v9` 23/23, `stripe_trial_synchronization_v1` propre ; Vitest webhook, cron, rapprochement ; concurrence 27 / 22 / 20 / 7 / 15 identique à V8 |
| Apports `b50979d4` | rejoués sur ce socle : pgTAP identique, bancs PostgREST 89 / 50 / 5 / 4 / 24, Playwright 85/85 |

Passe invalide, non comptée : le build avec les `node_modules` du worktree V9 en lien symbolique, que Turbopack refuse (« points out of the filesystem root »). Des `node_modules` réels ont été installés (lockfiles identiques) → 5/5.

## 6. Risques et DECISION_REQUIRED

| ID | État | Effet |
|---|---|---|
| `DECISION_REQUIRED:V9F-SECURITY-V2-SOURCE` | **décidé (propriétaire)** | `3835732` introuvable ; `f9748802` retenu |
| `DECISION_REQUIRED:V9F-BASE` | **décidé (propriétaire)** | reconstruction sur le 813 original, en réutilisant `0b862aa4` / `f9748802` / `2de34959` et les résolutions de `b50979d4` |
| `DECISION_REQUIRED:V9F-RGPD-EXPORT`, `…-RELEVE-LOT10-11` | **décidé : non retenus** | disponibles sur `pensive-bohr` ; leurs numéros (`…1114-1116`, `…1201-1202`) restent postérieurs à la V9 finale : intégration ultérieure sans renumérotation |
| `DECISION_REQUIRED:V9F-INTEGRATION-BRANCH` | **ouvert** | `integration/elsatia-canonical-train-v9-final` est local ; la session ne pousse que `claude/compassionate-ptolemy-vu8vbx` |
| Deux trains V9 concurrents | **ouvert** | `claude/pensive-bohr-7oxgd8` (`bf89b175`, autre session) contient la même lignée + Relevé 10-11 + RGPD, sans rapport de qualification. À clore ou à rebaser sur cette V9 finale |
| 813 non original (`23153716`) | **ouvert** | contenu différent du 813 original : à retirer pour éviter toute confusion de déploiement |
| Hérités du train V9 (`b50979d4` §12) | ouverts | onboarding « Se déconnecter / Retour à l'accueil » : **toujours absent** des pages `src/app/onboarding/*`, y compris après Legal Consent qui les modifie (vérifié par recherche) ; SEC-4 / 5 / 6 ; RT-02 lecture **fermé par 1001** ; B1 en hébergé (pousser `…1113` avant le code) ; IBAN (attestation `k1`) ; B3 conditions d'exploitation ; pack Preview à repointer ; `V8-PILOTE-ESSAI-ECHU` ; `V8-PERF-C1` |

## 7. Reproduire

```bash
git fetch --all --prune && git worktree add -b integration/elsatia-canonical-train-v9-final ../v9f claude/compassionate-ptolemy-vu8vbx
cd ../v9f && npm ci && for a in tools colors reserves studio; do npm ci --prefix apps/$a; done
npm ci --prefix workers/studio-video && (cd tests/e2e/colors-pile-locale && npm ci)
scripts/local-postgres-bootstrap/rebuild_db.sh v9f_fresh                                   # 389/389
scripts/qualification/v9/ledger-check.sh                                                   # 9/9 (socle de50245a)
scripts/qualification/pgtap-run-v3.sh v9f_fresh                                            # 165/174, 8 917 ok
UPG_PASSE=historique   scripts/qualification/upgrade-v8-v9.sh upg_f_a v9f_fresh            # 372 → 389, 47/47
UPG_PASSE=volumetrique scripts/qualification/upgrade-v8-v9.sh upg_f_b v9f_fresh            # 33/33
for s in per-app-suspension billing-lifecycle stripe-resubscription stripe-trial stripe-ordering; do
  createdb -T v9f_fresh conc && scripts/qualification/$s-concurrency.sh conc; dropdb conc; done   # 27/22/20/7/15
# Applications, bancs, Playwright, seeds, drill : comme le rapport V9 §13, sur ce worktree
```
