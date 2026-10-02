# ELSATIA — FINANCE AGGREGATES DATA CORRECTNESS V1

**Verdict : ELSATIA FINANCE DATA CORRECTNESS LOCALLY QUALIFIED** (périmètre §2, réserves §13)

| | |
|---|---|
| Base | `integration/elsatia-canonical-train-v8` @ `53b4bc7` (branche présente : pas de repli nécessaire) |
| Branche | `claude/confident-brown-sndsqb` (10 commits au-dessus de la base) |
| Moteur | PostgreSQL 16 réel + train complet (375 migrations, `rebuild_db.sh`), **PostgREST v12.2.3 réel avec `db-max-rows = 1000`** (valeur de `supabase/config.toml`), pgTAP 1.3.5, Node 22, Vitest 4, Playwright + Chromium 1194, Gestion Pro compilé (`next build` + `next start`) |
| Interdit respecté | `max_rows` **jamais** relevé : toutes les preuves vertes tournent sous le plafond de 1 000 |

## 1. Problème

PostgREST renvoie au plus `max_rows` lignes par réponse (1 000), **sans erreur**. Une page ou un export
qui lit une table entière sans `.range()` puis additionne côté Next obtient un total faux, en silence,
dès la 1 001ᵉ ligne. Le correctif ne pouvait pas être une simple pagination côté Next : le coût RLS
par ligne (`a_permission`, `est_membre_actif`, `peut_consulter_pointage_employe`… 0,1 à 1,6 ms par
ligne) est payé à chaque page, et une pagination par décalage le paie sur toutes les lignes qui
précèdent (mesuré : 294 s pour un mois de pointage à 20 000 lignes, 108 s pour une fiche chantier).

## 2. Inventaire et traitement

Inventaire complet de `src/` (requêtes non bornées dont le résultat est sommé, exporté ou réécrit).

| Prio | Chemin | Fichier(s) | Défaut constaté | Traitement |
|---|---|---|---|---|
| **P0** | Journal des ventes | `api/exports/comptabilite` | tronqué à 1 000 | RPC `export_comptable_ventes` |
| **P0** | Règlements clients | idem | tronqué ; 136–185 s à 20 000 | RPC `export_comptable_reglements` |
| **P0** | Journal des achats | idem | tronqué | RPC `export_comptable_achats` |
| **P0** | TVA déductible | idem | détail **et synthèse par taux** tronqués | même RPC, synthèse inchangée |
| **P0** | TVA collectée | idem | **toujours en erreur** (PGRST201) ; cumul flottant décalant d'1 centime | RPC `export_comptable_tva_collectee` (détail + synthèse en `numeric`) |
| **P0** | Export ZIP notes de frais | `api/notes-frais/exports` | `.limit(500)` silencieux ; `.in()` de 500 UUID → `fetch failed` ; versions / historique plafonnés à 1 000 | refus explicite 413 au-delà de 500 ; lectures par lots de 100, paginées |
| **P0** | Clôture d'inventaire (rapport comptable) | `api/inventaires/[id]/cloture` | tronqué | lecture complète de la RPC d'origine |
| P1 | Trésorerie | `tresorerie/page.tsx` | factures **toujours en erreur** (PGRST201) → « à encaisser » = 0 € ; tables entières | RPC `tresorerie_donnees` |
| P1 | Totaux factures fournisseurs | `depenses/page.tsx` | totaux sur 1 000 pièces | RPC `depenses_fournisseurs_totaux` ; liste bornée **annoncée** |
| P1 | Valeur du stock / alertes | `stock/page.tsx` | sur 1 000 articles | lecture complète (RPC d'origine / curseur) |
| P1 | Inventaire (page + comptage) | `inventaires/[id]/page.tsx`, `actions/inventaires.ts` | > 1 000 articles : comptage **refusé** par la RPC (partiel), synthèse fausse | lecture complète |
| P1 | Pointage d'équipe (blocker **B2** V8) | `pointage/gestion/page.tsx` | heures par salarié fausses | RPC `pointages_equipe_periode` |
| P1 | Planning | `planning/page.tsx` | heures prévues / réalisées fausses | RPC `planning_semaine` + index (quadratique) |
| P1 | Fiche chantier | `chantiers/[id]/page.tsx` | facturé, encaissé, heures, dépenses, notes de frais faux | RPC `chantier_donnees_chiffrees` |
| P1 | Quota IA mensuel | `lib/ai/journal.ts` | plafonné à 1 000 opérations : le quota cessait de bloquer | RPC `journal_ia_consommation` (INVOKER) |
| — | Rentabilité | `rentabilite/page.tsx`, `lib/rentabilite.ts`, `actions/rentabilite.ts` | **toujours tronquée sur cette base** (témoin 22) | **hors périmètre** : chemin de la mission Rentabilité, non modifié ici (§13) |
| P2 | Voir §13 | | | non traités, listés |

## 3. Preuves rouges (avant correctif, code d'origine, PostgREST réel)

Banc : `scripts/qualification/finance-aggregates/` — cinq entreprises de **500, 1 000, 1 462, 5 000 et
20 000** lignes par table + un tenant témoin ; vérité = requête PostgreSQL directe (superutilisateur).

| Chemin | 500 | 1 000 | 1 462 | 5 000 | 20 000 | Témoin |
|---|---|---|---|---|---|---|
| Ventes (lignes export / vérité) | ✔ | ✔ | **1 000 / 1 462** | **1 000 / 5 000** | **1 000 / 20 000** | 01 |
| Règlements | ✔ | ✔ | **1 000 / 1 462** | **1 000 / 5 000** | **1 000 / 20 000** (185 s) | 01 |
| Achats / TVA déductible | ✔ | ✔ | **1 000 / 1 412** | **1 000 / 4 828** | **1 000 / 19 311** | 01 |
| TVA collectée | **PGRST201** | **PGRST201** | **PGRST201** | **PGRST201** | **PGRST201** | 01 |
| Trésorerie (factures ouvertes) | **0 / 363** | **0 / 727** | **0 / 1 064** | **0 / 3 636** | **0 / 14 545** | 03 |
| Totaux /depenses (pièces) | ✔ | ✔ | **1 000 / 1 462** | **1 000 / 5 000** | **1 000 / 20 000** | 05 |
| Export NF (sélection) | ✔ | **500 / 1 000** | **500 / 1 462** | **500 / 5 000** | **500 / 20 000** | 07 |
| Export NF (justificatifs, 500 notes) | **fetch failed** | **fetch failed** | **fetch failed** | **fetch failed** | **fetch failed** | 07 |
| Stock / inventaire | ✔ | ✔ | **1 000 / 1 462** | **1 000 / 5 000** | **1 000 / 20 000** | 09 |
| Pointage d'équipe (3 listes) | ✔ | ✔ | **1 000 / 1 462** | **1 000 / 5 000** | **1 000 / 20 000** | 11 |
| Planning (affectations) | ✔ | ✔ | **1 000 / 1 462** | **1 000 / 5 000** | **1 000 / 20 000** | 11 |
| Fiche chantier (gros chantier) | ✔ | ✔ | ✔ | **1 000 / 2 500** | **1 000 / 10 000** | 13 |
| Quota IA (opérations) | ✔ | ✔ | **2 000 / 2 924** | **2 000 / 10 001** | **2 000 / 40 001** | 15 |

✔ = exact (sous le plafond). Témoins : `docs/qualification/witnesses/finance-aggregates-v1/`.

## 4. Correctif

**Principe** : le calcul se fait là où sont les données. Chaque écran ou export reçoit **une seule
valeur `jsonb`** (non soumise à `max_rows`) produite en base, avec exactement les mêmes filtres,
colonnes, ordres et règles qu'avant. Côté Next, la mise en forme (CSV/XLSX, libellés, identité figée
du client `client_snapshot`) est inchangée et réutilise les mêmes fonctions.

| Migration | Fonctions |
|---|---|
| `20260928000813_finance_exports_agregats_exactitude_v1` | `export_comptable_ventes`, `_reglements`, `_achats`, `_tva_collectee`, `tresorerie_donnees`, `depenses_fournisseurs_totaux` |
| `20260928000814_pointage_planning_lecture_complete_v1` | `pointages_equipe_periode`, `planning_semaine` |
| `20260928000815_fiche_chantier_lecture_complete_v1` | `chantier_donnees_chiffrees` |
| `20260928000816_journal_ia_consommation_exacte_v1` | `journal_ia_consommation` (SECURITY INVOKER) |

Pour les lectures qui restent côté Next (RPC SECURITY DEFINER existantes, petites tables),
`src/lib/supabase/lecture-complete.ts` fournit :
- `lireToutesLesLignes` — pages `.range()` avec `count: "exact"` sur la première ; complet même si le
  serveur a un `max_rows` inférieur à la page ; erreur explicite au-delà de 250 000 ;
- `lireParCurseur` — pagination keyset (`id > dernier`) pour les tables sous RLS ;
- `lireParLots` — `.in()` découpé en lots de 100 identifiants (longueur d'URL), chaque lot paginé.

Toute erreur de lecture est désormais **levée** : aucun écran ni export n'affiche un montant calculé
sur des lignes manquantes (avant : `data ?? []` silencieux, d'où la trésorerie à 0 €).

## 5. TVA — règles conservées

Aucune règle fiscale modifiée. TVA collectée : base d'une ligne = `quantité × PU HT × (1 − remise/100)`,
TVA = `base × taux / 100`, **sans arrondi intermédiaire**, agrégées par facture et par taux, factures
numérotées non annulées de la période — exactement la formule de la route d'origine, évaluée en
`numeric`. La synthèse par taux est sommée en base : le cumul flottant côté Next décalait un total
d'un centime quand la somme exacte tombait sur une demi-unité (mesuré, 5 000 lignes, taux 5,5 % :
**1 474 951,665** exact, export d'origine **1 474 951,66**, corrigé **1 474 951,67**). TVA déductible :
montants de pièce inchangés, synthèse par taux inchangée. Règlements : avoirs toujours en négatif.

## 6. Exports — jamais tronqués en silence

- Exports comptables : produits en base, **toutes** les lignes de la période ; au-delà de 250 000 lignes,
  refus explicite (`EXPORT_TROP_VOLUMINEUX` → HTTP 413 « réduisez la période »).
- Export ZIP des notes de frais : au-delà de 500 notes (contrainte du ZIP et de `maxDuration`), **refus
  explicite 413** au lieu d'un export partiel ; justificatifs, versions et historique lus en entier ; une
  erreur d'historique interrompt l'export (avant : ignorée).
- Rapport de clôture d'inventaire : toutes les lignes.
- `/depenses` : la liste reste bornée à 1 000 pièces (rendu), **avec un avis** « N pièces les plus
  récentes listées sur M » ; les totaux portent sur toutes les pièces.

## 7. Sécurité

- Toutes les RPC : `search_path` figé, `revoke … from public, anon`, `grant … to authenticated`.
- SECURITY DEFINER **uniquement** avec les policies d'origine reproduites à l'identique (même motif que
  `factures_liste_paginee` / `dashboard_indicateurs`), évaluées une fois par entreprise, salarié, note
  ou chantier au lieu d'une fois par ligne : comptabilité (`acces_factures`, `acces_clients`), achats
  (`acces_achats`), chantier (`peut_consulter_chantier`), pointage (`peut_consulter_pointage_employe`,
  contrôles GPS), planning (`peut_consulter_affectation_employe`), notes de frais (les **trois**
  policies SELECT), membres (`est_membre_actif`, révocation de session, accès support inclus).
- `journal_ia_consommation` est SECURITY INVOKER : la policy `journal_ia_select` s'applique telle quelle.
- `acces_exports` (route), `exporter_notes_frais`, `voir_prix_stock` : contrôles côté route inchangés.
  Aucune policy, aucun grant de table, aucune fonction d'accès existante modifiés.
- **Preuve d'équivalence** (pgTAP `finance_agregats_exactitude_v1`, **237/237**) : pour admin, ouvrier,
  chef d'équipe, conducteur, comptable et dirigeant de A, puis l'admin A visant B, 32 mesures par profil
  comparent la RPC à la lecture directe sous RLS (lignes, sommes, jointures client / chantier /
  fournisseur / salarié visibles). Les profils divergent réellement (ex. comptable : 31 factures, 0 fiche
  client, 0 chantier ; ouvrier : ses seuls pointages) et la RPC suit la RLS dans chaque cas ; inter-tenant :
  0 partout ; `anon` ne peut exécuter aucune des 10 fonctions.
- Banc PostgREST et Playwright : tenant témoin jamais visible, ouvrier sans export (403 / redirection).

## 8. Performance (PostgREST réel, temps HTTP total)

« Avant » = requête d'origine (plafonnée, donc **fausse**) ; « après » = lecture complète.

| Lecture | 5 000 avant → après | 20 000 avant → après |
|---|---|---|
| Journal des ventes | 7,96 s → **0,18 s** | 1,77 s → **0,52 s** |
| Règlements | 78,2 s → **0,17 s** | 136,5 s → **0,61 s** |
| Achats | 7,15 s → **0,23 s** | 1,67 s → **0,58 s** |
| TVA collectée | erreur → **0,12 s** | erreur → **0,38 s** |
| Trésorerie | erreur → **0,42 s** | erreur → **0,85 s** |
| Totaux /depenses | 1,52 s → **0,01 s** | 1,47 s → **0,02 s** |
| Pointage d'équipe (mois, 3 listes) | 8,65 s (1 liste) → **0,80 s** | 1,69 s (1 liste) → **2,54 s** (60 000 lignes) |
| Planning (semaine) | 8,67 s → **0,34 s** | 1,89 s → **0,79 s** |
| Fiche chantier (5 listes) | 4,33 s (1 liste) → **0,29 s** | 17,6 s (1 liste) → **0,73 s** |

Pagination côté Next écartée par mesure : pointage 20 000 → 294 s, fiche chantier 10 000 → 108 s.
Pages complètes (Playwright, TTFB) : témoin 19. Planning : les filtrages quadratiques par cellule,
jusqu'ici masqués par la troncature, sont indexés (TTFB 5 000 affectations **23,5 s → 13,2 s**, reste
proportionnel au rendu). Script : `scripts/qualification/finance-aggregates/mesures-avant-apres.sh`.

## 9. Tests

| Couche | Résultat |
|---|---|
| pgTAP nouvelle suite (équivalence RLS) | **237/237** |
| pgTAP suite complète, base neuve 375 migrations | **164 fichiers, 155 propres, 8 296 ok** — V8 : 163 / 154 / 8 059 ; **mêmes 9 suites non propres** (7 Studio du projet dédié, attestation pgsodium, cloud sync Tools), **0 régression** |
| Vitest banc PostgREST réel (`*.postgrest.test.ts`, 8 fichiers) | **89/89** (2 min 46), rouges avant correctif : témoins 01–15 |
| Vitest complet (CI, banc ignoré) | **2 621 passés**, 125 ignorés, 0 échec |
| Vitest nouveaux unitaires | `lecture-complete` 27, `exports-comptables` 6, `journal` 8 |
| Playwright (pile réelle, `db-max-rows = 1000`) | **11/11** (`tests/e2e/finance-agregats-exactitude.spec.ts`) |
| Typecheck GP (`tsc --noEmit`) | ✔ |
| Lint (`eslint`) | **0 erreur** (15 avertissements préexistants, fichiers non touchés) |
| Build GP (`next build`) | ✔ (1 min 52) |
| `verify:migrations`, `verify:train-expectations`, `test:migration-targets`, `verify:secrets`, `test:seeds` | ✔ (375 ; attendus régénérés) |

Les suites `*.postgrest.test.ts` s'exécutent seulement si le banc est lancé (`FINANCE_BENCH_*`) : en CI
elles sont ignorées, les unitaires couvrent la logique.

## 10. Non-régression

| Domaine | Rejeu |
|---|---|
| Comptabilité | exports ventes / règlements / achats / TVA ×2 (banc 5 volumes + Playwright) ; pgTAP complet |
| Factures | pgTAP factures (verrouillage, isolation, relances, purge) propres ; Vitest factures |
| Devis | pgTAP devis (`devis_recalc_totaux_par_instruction_v1`, workflow) propres ; Vitest |
| Rentabilité | **code non modifié** ; Vitest et pgTAP inchangés ; défaut de troncature **toujours présent** (§13) |
| Pointages | banc + Playwright (heures par salarié) ; pgTAP pointage propres |
| Chantier | banc + RPC ; pgTAP chantier propres |
| Notes de frais | banc (sélection, justificatifs, historique) + Playwright 413 ; pgTAP notes de frais propres |

## 11. Défauts préexistants découverts et corrigés

1. **Export TVA collectée toujours en erreur** (PGRST201 : `lignes_factures` porte deux clés vers
   `factures`, l'embed `factures!inner` est ambigu) → l'export renvoyait 503 quel que soit le volume.
2. **Trésorerie : « Total à encaisser » = 0 €** pour tout tenant (embed `chantiers` ambigu sur `factures`,
   erreur avalée par `data ?? []`).
3. **Export notes de frais impossible** dès quelques centaines de notes (URL `.in()` trop longue).
4. **Inventaire > 1 000 articles impossible à enregistrer** (comptage partiel refusé par la RPC).
5. Centime de synthèse TVA collectée (cumul flottant).

## 12. Fichiers

- Migrations : `supabase/migrations/20260928000813…0816` (4, nouvelles).
- Lib : `src/lib/supabase/lecture-complete.ts`, `exports-comptables.ts`, `tresorerie-donnees.ts`,
  `depenses-totaux.ts`, `expenses/export-selection.ts`, `stock-donnees.ts`, `pointages-donnees.ts`,
  `chantier-donnees.ts` (nouveaux) ; `ai/journal.ts`.
- Routes / pages : `api/exports/comptabilite`, `api/notes-frais/exports`, `api/inventaires/[id]/cloture`,
  `tresorerie`, `depenses`, `stock`, `inventaires/[id]`, `actions/inventaires.ts`, `pointage/gestion`,
  `planning`, `chantiers/[id]`.
- Tests : `supabase/tests/finance_agregats_exactitude_v1.test.sql` ; `src/lib/**/*.postgrest.test.ts` (8),
  `lecture-complete.test.ts`, `exports-comptables.test.ts`, `ai/journal.test.ts` ;
  `tests/e2e/finance-agregats-exactitude.spec.ts`, `tests/e2e/finance-pile-locale/`.
- Banc : `scripts/qualification/finance-aggregates/{seed.sql,postgrest-bench.sh,mesures-avant-apres.sh}`,
  `src/lib/test-support/banc-postgrest.ts`.
- Attendus du train régénérés (`sync:train-expectations`) : 375 migrations.

## 13. Réserves (non masquées)

1. **Rentabilité** — `rentabilite/page.tsx`, `lib/rentabilite.ts` (copilote IA), `actions/rentabilite.ts`
   lisent toujours `pointages`, `factures`, `depenses_fournisseurs`, `mouvements_stock`, `notes_frais` sans
   borne : sur cette base, 1 000 lignes sur 4 000–5 000 (témoin 22). Laissé à la mission Rentabilité, dont
   le correctif n'est **pas** sur `integration/elsatia-canonical-train-v8` : **à fusionner avant
   production**, sinon la marge chantier reste fausse.
2. **P2 non traités** (sommes par entité, volumes plus faibles) : `clients/[id]`, `sous-traitants/[id]`,
   `flotte/[id]`, `outillage/[id]`, `crm` (encours), `facturation-avancee` (listes de choix),
   `notes-frais` (`.limit(300)` + totaux par salarié), `paie/[id]` (totaux de la page courante seulement),
   `plateforme` (MRR, annuaire de repli), `actions/paiements-bancaires.ts` (`coordonnees_bancaires`),
   `inventaires` (sélecteur d'articles), `chantiers/[id]/doe`, `ai/copilote.ts`, teintes du stock.
3. **Performance RLS résiduelle** (exact mais lent, coût des policies existantes) : liste `/depenses`
   (TTFB 8,8 s à 5 000 pièces : la requête de liste est celle d'origine, seule la borne explicite
   change, et son tri impose la policy sur toutes les pièces), justificatifs de l'export NF (~24 s pour 500 notes),
   inventaire sans droit prix à 20 000 lignes, rendu navigateur de `/pointage/gestion` à 5 000 sessions
   (TTFB 5,3 s, chargement complet 87 s — taille du DOM, lié à B3).
4. Le blocker **B2** du train V8 (`/pointage/gestion`) est levé ; B1, B3, B4 inchangés.
5. Garde 250 000 lignes non testée par pgTAP (volume) ; logique couverte en unitaire.

## 14. Reproduire

```bash
git checkout claude/confident-brown-sndsqb && npm ci
pg_ctlcluster 16 main start          # + pgTAP 1.3 (sources github.com/theory/pgtap, make install)
# pgTAP
scripts/local-postgres-bootstrap/rebuild_db.sh fin_fresh
scripts/qualification/pgtap-run-v3.sh fin_fresh                                 # 155/164, 8 296 ok
scripts/qualification/pgtap-run-v3.sh fin_fresh finance_agregats_exactitude_v1.test.sql   # 237/237
# Banc PostgREST réel max_rows=1000 + Vitest
scripts/qualification/finance-aggregates/postgrest-bench.sh fin_bench 3011
set -a; source /tmp/finance-bench/env; set +a
npx vitest run src/lib/*.postgrest.test.ts src/lib/*/*.postgrest.test.ts        # 89/89
scripts/qualification/finance-aggregates/mesures-avant-apres.sh f5000 f2000
# Playwright (variables : PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, clés anon/service HS256,
# NEXT_PUBLIC_SUPABASE_URL=E2E_SUPABASE_URL=http://127.0.0.1:54321, RATE_LIMIT_HMAC_KEY,
# ELSATIA_APPLICATION_ENV=local, POSTGREST_BIN, PW_CHROME_PATH)
tests/e2e/finance-pile-locale/preparer-base.sh fin_e2e
tests/e2e/finance-pile-locale/demarrer-pile.sh fin_e2e /tmp/fin-logs
npx next build && npx next start -p 3100 &
E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test tests/e2e/finance-agregats-exactitude.spec.ts --project=desktop-chromium --workers=1   # 11/11
```

## 15. Verdict

**ELSATIA FINANCE DATA CORRECTNESS LOCALLY QUALIFIED**

Sur le périmètre de la mission (exports comptables et TVA en P0, puis trésorerie, dépenses, notes de
frais, stock, planning — plus pointage d'équipe, fiche chantier et quota IA trouvés à l'inventaire),
chaque chemin faux a une preuve rouge sous PostgREST réel plafonné à 1 000, un correctif sans relèvement
de `max_rows`, une preuve verte aux cinq volumes, l'équivalence RLS prouvée en pgTAP et une recette
navigateur. Réserve bloquante pour la production : la Rentabilité (§13.1) doit être corrigée par sa
propre mission avant mise en ligne.
