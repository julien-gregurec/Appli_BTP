# ELSATIA — SaaS Performance & Capacity Baseline V1

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v5` @ `f6399f15` (verdict `CANONICAL TRAIN V5 LOCALLY QUALIFIED`, 355 migrations) — aucun train V6 n'existe : **V5 retenu** |
| Branche | `claude/brave-carson-cj8ofz` (avance rapide sur V5, puis commits de cette mission) |
| Migrations | **357** (+2 : `20260928000401`, `20260928000402`), aucune migration V5 modifiée |
| Moteur | PostgreSQL 16.13 réel (amorce `scripts/local-postgres-bootstrap`, sans Docker), PostgREST **v12.2.3 réel**, Next.js 16.3.5 **compilé** (`next build` + `next start`) pour Gestion Pro, Réserves et Colors ; Tools en `next dev --webpack` comme ses recettes |
| Poste | conteneur 4 vCPU / 15 Go, **tout co-localisé** (base, API, applications, injecteur de charge) |
| Actions distantes | **Aucune** (ni Preview, ni Production, ni merge) |

## 0. Verdict

**`ELSATIA PERFORMANCE BLOCKERS FOUND`**

La baseline est **établie et reproductible** (p50/p95/p99 de toutes les routes demandées, 3 jeux GP,
3 volumes Réserves, Tools, Colors, concurrence 10/25/50, mémoire, requêtes lentes, limites de débit),
et **4 correctifs prouvés** (mesure → correctif → contre-mesure, RLS et tests intacts) suppriment les
pires effondrements mesurés :

| Parcours | V5 | Après | Gain |
|---|---|---|---|
| GP `/planning` (gros : 120 salariés, 600 chantiers) | 19,8 s · **190 Mo** de HTML | 1,5 s · 4,0 Mo | ×13 |
| GP enregistrement d'un devis de 1 000 lignes | 13,4 s | 0,33 s | ×41 |
| GP `/pointage/gestion` (gros) | 9,1 s | 3,3 s | ×2,8 |
| Réserves « Toutes les réserves » (≈ 6 100) | 46,2 s | 7,0 s | ×6,6 |
| Réserves fiche chantier 5 000 réserves | 24,4 s | 3,9 s | ×6,2 |
| Réserves PDF 5 000 réserves | **502** (échec) | 16,6 s | produit |
| Colors tableau de bord / inventaire (3 000 seaux) | 4,3 s / 3,3 s | 0,57 s / 0,47 s | ×7 |
| Tools fiche relevé (600 pièces) / plan 500 murs + 300 ouvertures | 20,4 s / 17,5 s | 7,6 s / 7,2 s | ×2,5 |

Mais des **bloquants restent ouverts**, dont deux cassent un parcours normal et ne relèvent pas d'une
optimisation sûre dans cette mission (décision ou chantier dédié requis) — § 13 :

1. **B1 — Limite de connexion par IP** : à partir de la **11ᵉ connexion en 10 minutes depuis une même
   IP**, `/login` répond 429. Une agence dont 15 salariés se connectent à 8 h derrière la même box voit
   **5 salariés bloqués** jusqu'à 10 minutes (mesuré, § 8). Réglage de sécurité : décision requise.
2. **B2 — Troncature silencieuse à 1 000 lignes** (`max_rows` PostgREST, `supabase/config.toml` et
   défaut hébergé) : `/pointage/gestion` ne lit que 1 000 pointages du mois alors que le jeu moyen en
   porte **1 462** (38 salariés) — totaux d'heures par salarié **faux sans avertissement** ; même motif
   pour la liste des pointages de la fiche chantier. Défaut de justesse révélé par la volumétrie.
3. **B3 — Mémoire du serveur Next** : **3,2 Go** de RSS pour 25 utilisateurs simultanés sur le jeu
   moyen (repos : 224 Mo), 8,0 Go à 50 utilisateurs sur le jeu gros ; la RSS ne redescend pas après la
   charge. Au-delà des limites mémoire usuelles d'une fonction serverless — à revalider sur l'hébergeur.
4. **B4 — Édition d'une facture brouillon cassée** (trouvé en mesurant) : `modifier_facture_brouillon`
   (SECURITY INVOKER) appelle `recalc_totaux_facture`, dont l'EXECUTE a été retiré à `authenticated`
   par la réconciliation ACL `20260902000255` → « permission denied », l'éditeur de facture échoue.
   Hors périmètre performance, non corrigé ici (posture ACL), signalé § 13.

Les goulets P1/P2 restants (centre d'alertes non borné, listes Réserves > 1 000, débit plafonné par le
rendu mono-thread) sont au § 12.

---

## 1. Méthode

- **Parcours métier réels uniquement** : chaque mesure HTTP traverse le **vrai proxy Next** (session
  `getUser`, `contexte_acces_proxy`, limiteur), le **rendu serveur compilé**, **PostgREST réel** et la
  **RLS réelle** de PostgreSQL. Connexion par `POST /auth/v1/token` puis cookie `@supabase/ssr`
  (`scripts/perf/baseline-v1/bench-http.mjs`). Une réponse n'est un succès que si elle vaut 200 **sans
  redirection** et n'est pas une page d'erreur Next (détectée) ; une redirection vers `/login` compte
  comme échec.
- **Actions sûres** : GET de pages uniquement pour la charge. Les écritures (enregistrement de devis, de
  facture) sont mesurées en SQL sous `authenticated`, dans une transaction **annulée**.
- **Mesure → correctif → contre-mesure** sur des **copies** des mêmes bases (clones `TEMPLATE`) : seules
  les migrations/le code changent entre « avant » et « après ».
- **Requêtes lentes** : `pg_stat_statements` (remis à zéro à chaque campagne, `track = all`),
  `log_min_duration_statement = 100`, puis `EXPLAIN (ANALYZE, BUFFERS)` ciblé. `auto_explain` volontairement
  **non chargé** (il instrumente toutes les requêtes et fausserait les latences).
- **Pile locale** : PostgREST v12.2.3 (`db-pool = 10`, `db-max-rows = 1000` comme `supabase/config.toml`),
  passerelle de recette pour Auth/Storage (`tests/e2e/colors-pile-locale/passerelle.mjs`, JWT HS256 du même
  secret), routeur `scripts/perf/baseline-v1/routeur-local.mjs` (rôle de Kong). Tools : pile Relevé
  officielle (GoTrue v2.196.0 compilé + PostgREST + Storage local).
- p50/p95/p99 par **rang** (percentile le plus proche). Avec n = 3 (Réserves), p95 = p99 = max : c'est dit
  explicitement. Tableaux complets : [`perf-baseline-v1/TABLEAUX.md`](perf-baseline-v1/TABLEAUX.md) ;
  JSON bruts, relevés `pg_stat_statements`, EXPLAIN et échantillons mémoire dans
  [`perf-baseline-v1/`](perf-baseline-v1/).

## 2. Jeux de données

Générés sur des bases **jetables** clonées d'une V5 fraîche ; aucune donnée personnelle
(`@perf.invalid`, `@invalid.local`, `@recette.invalid`, `@example.test`).

### 2.1 Gestion Pro — `scripts/perf/baseline-v1/run-gp-datasets.sh`

Variante **paramétrée** de `scripts/perf/generate_fixture.sql` (même logique), + planning (`gp_affectations.sql`)
+ accès de banc (`gp_bench_access.sql`). Tenant principal (un second tenant sert au cloisonnement) :

| Jeu | Salariés | Comptes | Clients | Chantiers | Devis | Lignes devis | Factures | Lignes factures | Pointages | Évén. planning | Affectations | Taille base |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **petit** | 10 | 8 | 40 | 25 | 300 | 4 020 | 200 | 1 681 | 10 787 | 310 | 610 | 51 Mo |
| **moyen** | 40 | 20 | 200 | 150 | 5 012 | 74 656 | 3 000 | 26 241 | 46 609 | 4 950 | 2 318 | 132 Mo |
| **gros** | 120 | 60 | 800 | 600 | 20 012 | 285 332 | 12 000 | 103 947 | 157 778 | 19 500 | 7 015 | 343 Mo |

Moyen et gros comprennent 12 devis « lourds » (3 × 20 / 100 / 500 / 1 000 lignes). Historique 5 ans.

- **Variante « encaissements réalistes »** (`gp_encaissements_realistes.sql`) : la fixture laisse ~70 %
  des factures envoyées impayées sur 5 ans (10 736 alertes « à encaisser » sur le gros). Les factures
  échues depuis plus de 120 jours y sont soldées : il reste **83** (moyen) / **312** (gros) alertes
  d'encaissement. L'état final et la concurrence sont mesurés sur cette variante.
- **Scénario « chantier long »** : 10 909 pointages sur un seul chantier (base `perf_gp_chantier_long`,
  issue d'un premier tirage de fixture défectueux — tous les pointages sur un chantier — conservé
  volontairement comme cas limite).
- Défauts de fixture trouvés et corrigés en route (sans effet sur le produit) : collision de devis de
  repli dans les situations de travaux sur un petit jeu ; tirage de chantier non corrélé au jour.

### 2.2 Réserves — `reserves_charge_100_1000_5000.sql`

Sur le décor de recette complet (`tests/e2e/reserves-pile-locale/preparer-base.sh`) : trois chantiers de
**100, 1 000 et 5 000 réserves** (statuts et priorités répartis, organisation intervenante dédiée,
triggers de numérotation et d'historique actifs) + **5 lignes d'historique par réserve** (30 500 au total).
Le compte mesuré voit ≈ 6 100 réserves tous chantiers confondus.

### 2.3 Colors — `colors_charge.sql`, `generer-nuancier.mjs`

Organisation A de la recette : 12 emplacements, **3 000 seaux**, 18 000 mouvements. Nuancier : fichier de
recette (4 teintes) et nuancier fictif de **5 000 teintes** (329 ko, même contrat).

### 2.4 Tools — `tests/e2e/tools-releve-perf-baseline.spec.ts` (nouveau) + recette Lot 4 `@perf`

Relevé de **3 bâtiments × 8 niveaux × 25 pièces = 600 pièces** ; plan 2D de **500 murs + 300 ouvertures**
(porte, fenêtre, baie, passage) ; **200 photos** 1 600 × 1 200 (dont 50 dans une pièce), recette Lot 4.
Lot 6 **non porté** dans V5 (consigne) : les ouvertures sont celles du Lot 5, présentes dans V5.

## 3. Gestion Pro — p50 / p95 / p99 (1 utilisateur, 20 itérations, ms)

Même jeu de données avant et après (clones) ; « après » = 401 + 402 + correctif planning.

| Route | petit V5 | petit après | moyen V5 | moyen après | gros V5 | gros après |
|---|---|---|---|---|---|---|
| `/dashboard` | 192 / 285 / 295 | 103 / 120 / 133 | 627 / 702 / 705 | 396 / 416 / 646 | 2 335 / 2 495 / 2 524 | 1 635 / 1 725 / 1 735 |
| `/chantiers` (liste) | 140 / 152 / 155 | 61 / 77 / 78 | 337 / 361 / 374 | 118 / 143 / 357 | 1 198 / 1 269 / 1 273 | 432 / 453 / 466 |
| `/chantiers/:id` (fiche) | 743 / 799 / 810 | 177 / 194 / 202 | 707 / 768 / 769 | 243 / 292 / 337 | 779 / 823 / 840 | 386 / 414 / 437 |
| `/devis` (liste) | 108 / 134 / 142 | 56 / 62 / 104 | 127 / 149 / 155 | 81 / 95 / 105 | 168 / 177 / 179 | 129 / 148 / 165 |
| `/devis/:id` (plus gros devis) | 196 / 214 / 222 | 85 / 92 / 94 | 1 399 / 1 543 / 2 063 | 472 / 550 / 557 | 1 728 / 1 844 / 2 000 | 830 / 882 / 888 |
| `/factures` (liste) | 106 / 116 / 125 | 59 / 67 / 70 | 117 / 155 / 191 | 87 / 105 / 109 | 158 / 170 / 178 | 126 / 144 / 155 |
| `/factures/:id` | 144 / 155 / 164 | 68 / 80 / 80 | 161 / 229 / 239 | 97 / 117 / 119 | 182 / 208 / 220 | 129 / 137 / 145 |
| `/planning` | 326 / 340 / 363 | 146 / 154 / 157 | 1 892 / 2 134 / 2 708 | 432 / 453 / 463 | 19 776 / 20 237 / 20 430 | 1 470 / 1 531 / 1 542 |
| `/pointage` | 232 / 306 / 352 | 78 / 93 / 219 | 254 / 295 / 354 | 102 / 114 / 115 | 301 / 356 / 362 | 151 / 165 / 174 |
| `/pointage/gestion` | 749 / 821 / 826 | 235 / 250 / 254 | 2 798 / 3 208 / 3 309 | 815 / 1 115 / 1 150 | 9 128 / 9 591 / 9 628 | 3 253 / 3 322 / 3 350 |
| connexion (`/auth/v1/token`) | ≈ 100 ms partout | | | | | |

« Plus gros devis » : 68 lignes (petit), **1 000 lignes** (moyen, gros). Fiche chantier : le chantier le
plus chargé en pointages du jeu (484 / 387 / 335). **État final** (401 à 11 fonctions, variante
encaissements réalistes) : moyen dashboard 280 / 361 / 454 (3,1 Mo), gros dashboard 1 262 / 1 488 / 1 540
(12 Mo, cf. § 12 G1) ; autres routes identiques à la colonne « après » à ±10 % — détail en annexe.

Poids des documents HTML (état final) : dashboard 0,4 / 3,1 / 12 Mo ; planning 0,4 / 1,3 / 4,0 Mo (V5 :
1,6 / 18 / **190 Mo**) ; `/pointage/gestion` 1,3 / 3,5 / 3,7 Mo ; devis 1 000 lignes 1,5 Mo.

**Chantier long** (10 909 pointages, V5) : la requête des pointages de la fiche seule prend **13,8 s** sans
plafond (EXPLAIN § 6) ; avec `max_rows = 1000` elle est tronquée (B2).

**Écriture — enregistrement d'un devis** (`modifier_devis_brouillon`, rôle `authenticated`, jeu moyen,
2ᵉ enregistrement) :

| Lignes | V5 | Après | Totaux |
|---|---|---|---|
| 20 | 379 ms | 35 ms | identiques (720,00) |
| 100 | 1 294 ms | 58 ms | identiques (3 600,00) |
| 500 | 6 081 ms | 187 ms | identiques (18 000,00) |
| 1 000 | 13 417 ms | 327 ms | identiques (36 000,00) |

Transformation d'un devis accepté en facture (`creer_facture_depuis_devis`, V5) : 70 ms (20 lignes),
220 ms (100), 1,15 s (500), 2,55 s (1 000) — même mécanisme de trigger par ligne sur `lignes_factures`,
non corrigé (P2, § 12). L'édition de facture n'a pas pu être mesurée : B4.

## 4. Tools — Relevé & Métré

Pile Relevé réelle, Chromium 1194, poste 1 366 × 1 024, `next dev --webpack` (compilation incluse au
premier passage ; les passages suivants sont comparables). V5 pur (worktree) vs après.

| Mesure | V5 | Après |
|---|---|---|
| Dépôt de la structure (3 bât., 24 niveaux, 600 pièces) | 3,7 s | — |
| Page **structure** (5 chargements) | 10,6 / 8,3 / 7,7 / 7,9 / 8,4 s | 3,7 / 3,7 / 3,5 / 3,5 / 3,6 s |
| **Fiche relevé** (5 chargements) | 25,4 / 20,4 / 21,6 / 20,5 / 20,3 s | 8,9 / 7,6 / 7,6 / 7,7 / 7,6 s |
| Plan 2D : enregistrement 500 murs / 300 ouvertures (RPC) | 432 / 303 ms | 456 / 296 ms |
| Plan 2D : rendu 500 murs + 300 ouvertures (3 chargements) | 16,8 / 17,5 / 18,0 s | 7,6 / 7,2 / 6,9 s |
| Plan 2D : pan (p95 / max image) | 50 / 100 ms | 50 / 100 ms |
| Plan 2D : zoom (p95 image) | 67 ms | 33 ms |
| Plan 2D : édition d'un mur → cote à jour | 112 ms | 225 ms |
| Plan 2D : sauvegarde automatique | 816 ms | 825 ms |
| Plan 2D : 500 murs et 300 ouvertures dessinés | 500 / 300 | 500 / 300 |
| Tas JS après plan | 148 Mo | 205 Mo |
| Photos (200) : première vue galerie | 6,7 s | 3,2 s |
| Photos : galerie de 200 affichée / pièce de 50 | 1,4 s / 239 ms | 0,85 s / — |
| Photos : tas JS / tâche longue max | 158 Mo / 438 ms | 157 Mo |
| Photos : envoi séquentiel 12 Mpx (compression + dépôt) | 2,7 s / photo | 2,1 s / photo |

Les interactions locales du plan (pan, zoom, édition) restent sous le budget d'une image à 60-100 ms ;
le temps restant est au **chargement** (requêtes et RLS `tools_releve_peut`), divisé par ~2,5 par 401.
Non-régression Relevé Lots 2-5 + Atelier sur l'état après : **52/52** (§ 11).

## 5. Réserves — 100 / 1 000 / 5 000 réserves (1 utilisateur, 3 itérations : p95 = p99 = max)

| Route | 100 V5 | 100 après | 1 000 V5 | 1 000 après | 5 000 V5 | 5 000 après |
|---|---|---|---|---|---|---|
| **Liste** — fiche chantier `/chantiers/:id` | 172 / 176 / 176 | 74 / 78 / 78 | 2 381 / 2 405 / 2 405 | 454 / 462 / 462 | 24 418 / 25 259 / 25 259 | 3 910 / 4 087 / 4 087 |
| **Liste** filtrée entreprise `/reserves?entreprise=` | 163 / 164 / 164 | 66 / 69 / 69 | 2 348 / 2 402 / 2 402 | 429 / 485 / 485 | 33 301 / 33 342 / 33 342 | 5 003 / 5 006 / 5 006 |
| **Filtres** + statut | 72 / 74 / 74 | 42 / 42 / 42 | 301 / 306 / 306 | 83 / 86 / 86 | 2 466 / 2 466 / 2 466 | 424 / 438 / 438 |
| **Filtres** + priorité + statut | 49 / 52 / 52 | 38 / 42 / 42 | 105 / 110 / 110 | 50 / 51 / 51 | 345 / 353 / 353 | 99 / 103 / 103 |
| **Fiche** réserve (+ **historique**, 5 lignes) | 54 / 59 / 59 | 48 / 48 / 48 | 58 / 61 / 61 | 47 / 48 / 48 | 61 / 64 / 64 | 46 / 47 / 47 |
| Document imprimable | 163 / 167 / 167 | 65 / 72 / 72 | 2 342 / 2 346 / 2 346 | 453 / 464 / 464 | 32 805 / 33 597 / 33 597 | 5 139 / 5 160 / 5 160 |
| **PDF** (Chromium serveur) | 2 790 / 2 842 / 2 842 | 1 347 / 1 359 / 1 359 | 5 774 / 5 786 / 5 786 | 4 363 / 4 444 / 4 444 | **502 ×3** | 16 567 / 16 814 / 16 814 |

Tous chantiers (≈ 6 100 réserves) : « Toutes les réserves » `/reserves` **46,2 s → 7,0 s** ; tableau de
bord **46,5 s → 6,7 s** ; liste des chantiers 69 → 47 ms. Coût restant : ≈ 0,5 ms par réserve lue
(policy `reserves_select` → `reserves_action_autorisee` → `reserves_role_courant` évaluée par ligne) et
lecture **intégrale** par tranches de 1 000 (`toutesLesLignes`) — G3, § 12.

## 6. Colors (1 utilisateur, 10 itérations)

| Route | V5 (nuancier 4) | Après (nuancier 4) | Après (nuancier **5 000**) |
|---|---|---|---|
| `/dashboard` | 4 268 / 4 337 / 4 337 | 574 / 608 / 608 | ≈ identique |
| `/inventaire` (3 000 seaux, paginé) | 3 296 / 4 017 / 4 017 | 469 / 494 / 494 | ≈ identique |
| **Recherche** `?q=velours` | 3 766 / 3 905 / 3 905 | 536 / 570 / 570 | ≈ identique |
| **Recherche** `?q=PERF-02999` | 3 180 / 3 712 / 3 712 | 452 / 487 / 487 | ≈ identique |
| **Filtres** état + emplacement | 320 / 352 / 352 | 78 / 84 / 84 | ≈ identique |
| **Filtres** stock faible + tri | 529 / 628 / 628 | 103 / 115 / 115 | ≈ identique |
| **Nuancier** `/nuanciers` | 47 / 58 / 58 | 38 / 50 / 50 | 37 / 39 / 39 (53 ko, aperçu borné) |
| Nuancier : teinte la plus proche `?hex=` | 44 / 62 / 62 | 34 / 42 / 42 | 48 / 55 / 55 (5 000 comparaisons) |
| `/activite`, `/depots` | 43-63 | 36-56 | ≈ identique |
| **Auth** : connexion | 98 ms | 99 ms | — |

Chargement du nuancier : lu une fois par processus (`nuancierColors()` mémorisé), 5 000 teintes sans
effet mesurable. `/mouvements` est une redirection permanente vers `/activite` (307, normal).

## 7. Concurrence — 10 / 25 / 50 utilisateurs (GP, état final, variante réaliste)

Chaque utilisateur virtuel se connecte (comptes distincts du jeu, réutilisés au-delà de 20/60) puis
parcourt 3 fois `/dashboard`, `/chantiers`, fiche chantier, `/devis`, `/factures`, `/planning`,
`/pointage` (GET uniquement). p50 / p95 / p99 en ms.

| Palier | Requêtes | Erreurs | Débit | dashboard | chantiers | fiche chantier | devis | factures | planning | pointage |
|---|---|---|---|---|---|---|---|---|---|---|
| moyen × 10 | 220 | 0 | 8,1 req/s | 2 068 / 2 921 / 2 941 | 502 / 1 336 / 1 457 | 887 / 1 050 / 1 089 | 458 / 686 / 687 | 1 381 / 1 476 / 1 687 | 2 789 / 3 536 / 3 747 | 894 / 2 743 / 2 759 |
| moyen × 25 | 550 | 0 | 8,0 req/s | 5 158 / 6 306 / 6 386 | 1 290 / 4 057 / 4 633 | 2 189 / 2 396 / 2 422 | 1 205 / 1 824 / 2 215 | 2 870 / 3 052 / 3 067 | 8 318 / 8 808 / 9 474 | 1 849 / 8 306 / 8 327 |
| moyen × 50 | 1 100 | 0 | 7,5 req/s | 11 916 / 13 885 / 17 385 | 2 796 / 6 967 / 9 726 | 4 572 / 5 027 / 10 454 | 2 868 / 3 615 / 3 804 | 5 801 / 7 019 / 7 059 | 16 522 / 18 715 / 18 917 | 3 949 / 15 842 / 17 106 |
| gros × 10 | 220 | 0 | 3,3 req/s | 6 973 / 8 716 / 8 779 | 680 / 4 467 / 4 692 | 1 444 / 3 120 / 6 076 | 817 / 2 875 / 6 943 | 1 079 / 4 041 / 4 624 | 7 166 / 9 737 / 10 602 | 1 451 / 4 983 / 5 256 |
| gros × 25 | 550 | 1 | 3,2 req/s | 18 133 / 21 704 / 25 139 | 1 814 / 4 902 / 7 893 | 2 614 / 3 570 / 4 290 | 2 934 / 12 880 / 13 535 | 5 423 / 12 373 / 14 072 | 16 709 / 24 607 / 25 101 | 7 446 / 15 348 / 17 900 |
| gros × 50 | 1 100 | 10 | 2,9 req/s | 39 936 / 48 073 / 55 065 | 4 416 / 10 204 / 19 587 | 6 640 / 12 138 / 21 197 | 6 087 / 17 840 / 20 421 | 16 265 / 26 171 / 32 421 | 35 079 / 43 544 / 46 528 | 16 889 / 28 282 / 30 603 |

Lecture :
- **0 erreur** jusqu'à 50 utilisateurs sur le jeu moyen ; gros : 1 puis 10 erreurs (0,9 %), toutes des
  **307 vers `/login`** : sous saturation, la vérification de session (`getUser`) auprès de la passerelle
  locale échoue (« other side closed ») et le proxy déconnecte l'utilisateur. La passerelle est
  mono-processus et locale : **NOT PROVEN** avec GoTrue hébergé, mais le comportement du proxy (échec
  d'auth transitoire ⇒ redirection `/login` plutôt que réessai) est réel.
- Aucun deadlock, aucune erreur SQL, aucun 5xx applicatif.
- Le **débit plafonne** (~8 req/s moyen, ~3 req/s gros) : le serveur Next est **mono-thread** (≈ 1 cœur à
  80 %) pendant que PostgreSQL utilise ≈ 2 cœurs ; la latence croît linéairement avec le nombre
  d'utilisateurs (file d'attente), sans effondrement. Sur l'hébergement cible, le rendu est réparti sur
  plusieurs instances : ces latences ne s'extrapolent pas ; le **coût par page** (≈ 0,4 s CPU tous
  composants confondus sur le jeu moyen, ≈ 1 s sur le gros : 3 cœurs occupés pour 8 et 3 req/s) et
  l'absence d'erreur, si.
- Première campagne (jeux « après », dashboard à 10 736 alertes) : même profil, dashboard jusqu'à 62 s
  p50 à gros × 50 (annexe).

## 8. Limites de débit (`src/lib/security/rate-limit.ts`)

`scripts/perf/baseline-v1/rate-limit-parcours.mjs`, GP compilé, limiteur réel (`consommer_rate_limit`,
clé HMAC locale), jeu moyen.

| Scénario (parcours normal) | Résultat V5 | Après |
|---|---|---|
| A. 15 salariés se connectent depuis **une même IP** (box d'agence) | **429 dès la 11ᵉ connexion** (5 / 15 bloqués) | inchangé — **B1** |
| B. « Photos & documents » d'un chantier à **80 photos** de conversation | **21 vignettes en 429** (au-delà de 60 / min, la page elle-même compte) | **0 requête** vers la route limitée : 80 URL signées en un appel |
| C. Navigation soutenue : 120 pages en ~18 s | 0 × 429 | 0 × 429 |
| D. 25 utilisateurs × 20 pages, même IP | 0 × 429 | 0 × 429 |

Politiques en cause : `auth:login` 10 / 600 s / IP ; `api:signed-downloads` 60 / 60 s / utilisateur
(motif `/(documents|pieces-jointes|photo|signature|carte-btp)/`). Pages ordinaires : aucune limite.
Réserves et Colors n'ont pas de limiteur applicatif (les limites GoTrue hébergées, par IP, ne sont pas
reproduites localement — NOT PROVEN).

## 9. Mémoire — pages les plus lourdes

**Serveur Next (GP, RSS)** — serveur redémarré avant la série :

| Situation | RSS max |
|---|---|
| Au repos après démarrage | 224 Mo |
| Jeu moyen, 1 utilisateur | 440 Mo |
| Jeu moyen, 25 utilisateurs | **3 181 Mo** |
| Jeu gros, 25 utilisateurs (serveur déjà chaud) | 3 441 Mo |
| Jeu gros, 50 utilisateurs (première campagne, dashboard 19 Mo) | **7 994 Mo** |
| Au repos après les charges | 3 382 Mo (non restitué) |

PostgREST : 50-100 Mo. PostgreSQL (tous processus, `shared_buffers` 512 Mo) : 1,6-3,1 Go.

**Navigateur (Chromium, jeu gros, état final)** :

| Page | Chargement (`load`) | Document | Nœuds DOM | Tas JS |
|---|---|---|---|---|
| `/dashboard` | 3 155 ms | 12 Mo | **81 079** | 50 Mo |
| `/planning` | 2 142 ms | 4,0 Mo (V5 : 190 Mo) | 15 006 | 26 Mo |
| `/pointage/gestion` | 3 899 ms | 3,7 Mo | 22 269 | 21 Mo |
| `/devis/:id` (1 000 lignes) | 1 319 ms | 1,5 Mo | 8 233 | 17 Mo |
| fiche chantier | 687 ms | 0,2 Mo | 1 305 | 8 Mo |
| `/chantiers`, `/factures` | 350-640 ms | 0,1-0,2 Mo | ~900 | 6 Mo |
| Tools : plan 500 + 300 / galerie 200 photos | — | — | 800 éléments SVG / 200 vignettes | 148-205 Mo / 158 Mo |

## 10. Base de données — requêtes lentes

Compteurs `pg_stat_statements` par campagne (1 utilisateur, 20 passages ; requêtes distinctes dont le
temps **moyen** / **maximal** dépasse le seuil ; hors requêtes du banc lui-même) :

| Campagne | moy > 100 ms | moy > 500 ms | moy > 1 s | max > 100 ms | max > 500 ms | max > 1 s |
|---|---|---|---|---|---|---|
| GP petit V5 → après | 3 → 0 | 2 → 0 | 0 → 0 | 4 → 4 | 2 → 0 | 0 → 0 |
| GP moyen V5 → final | 9 → 3 | 3 → 0 | 2 → 0 | 11 → 3 | 4 → 0 | 2 → 0 |
| GP gros V5 → final | 12 → 10 | 8 → 3 | 7 → 1 | 15 → 15 | 8 → 7 | 7 → 2 |
| Réserves V5 → après | 9 → 7 | 8 → 6 | 7 → 0 | 12 → 8 | 8 → 7 | 8 → 1 |
| Colors V5 → après | 5 → 3 | 3 → 1 | 3 → 0 | 5 → 3 | 4 → 2 | 3 → 0 |

**Cause dominante mesurée** : dans `pg_stat_statements` (moyen V5, 200 pages), le corps de
`est_membre_actif` est exécuté **202 764 fois** et celui de `a_permission` **85 674 fois** (≈ 138 s
cumulées) ; en profil de fonctions : `est_membre_actif` ≈ 200 µs/appel dont 125 µs pour
`est_acces_support_actif`, `a_permission` ≈ 565 µs/appel. Ces fonctions `LANGUAGE sql` +
`SECURITY DEFINER` + `SET search_path` ne sont jamais inlinées, et une fonction SQL non inlinée appelée
depuis une autre est **re-planifiée à chaque appel** (PostgreSQL ≤ 17). La RLS les évalue **par ligne**.

**EXPLAIN (ANALYZE, BUFFERS)** — rôle `authenticated`, jeu gros, `perf-baseline-v1/explain/` :

| Requête (page) | V5 | Après 401 | Plan / cause |
|---|---|---|---|
| R1 pointages du mois, toute l'entreprise (`/pointage/gestion`, 1 000 lignes) | 6 238 ms | 685 ms | Bitmap sur `(entreprise_id, date)` correct ; coût = `peut_consulter_pointage_employe` + `est_membre_actif` en *Filter* par ligne |
| R2 lignes d'un devis de 1 000 lignes (`/devis/:id`) | 827 ms | 154 ms | Index `devis_id` ; coût = `a_permission`/`est_membre_actif` par ligne |
| R3 `chantiers_liste_paginee` (`/chantiers`) | 671 ms | 83 ms | `peut_consulter_chantier` évalué pour les 600 chantiers **avant** LIMIT |
| R4 chantiers ouverts (`/planning`, `/pointage/gestion`) | 623 ms | 76 ms | RLS `peut_consulter_chantier` par ligne |
| R5 affectations de la semaine (`/planning`) | 1 309 ms | 171 ms | idem, + sous-requêtes chantier/employé |
| Chantier long : pointages d'un chantier (10 909 lignes, sans plafond) | 13 825 ms | 2 217 ms (prototype) | 470 000 tampons lus : ≈ 43 par ligne |
| Réserves : réserves d'un chantier (1 000 lignes) | 909 ms | 430 ms | `reserves_action_autorisee` → `reserves_role_courant` → `a_acces_application` par ligne |
| `modifier_devis_brouillon` (200 lignes, trigger) | 1 266 ms insert + 1 412 ms delete | — (402) | `recalc_devis_apres_ligne` = 1 085 + 1 044 ms : un `UPDATE devis` par ligne |

Aucun index manquant n'a été trouvé sur les parcours mesurés : les plans utilisent les bons index ; le
coût est **par ligne**, dans les fonctions de RLS et les triggers.

## 11. Correctifs (mesure → correctif → contre-mesure) et non-régression

| # | Correctif | Problème prouvé | Contre-mesure |
|---|---|---|---|
| **C1** | `supabase/migrations/20260928000401_rls_helpers_plpgsql_plan_cache_v1.sql` — 11 fonctions d'aide RLS (`session_jwt_courante`, `session_courante_revoquee`, `est_acces_support_actif(uuid)`, `est_membre_actif`, `est_plateforme_admin`, `a_permission`, `a_acces_application`, `peut_consulter_pointage_employe`, `peut_consulter_chantier`, `reserves_role_courant`, `reserves_intervenant_courant`) passent de `sql` à `plpgsql` (plans mis en cache par session). Corps **extraits par `pg_get_functiondef` de V5**, repris tels quels dans `return ( … )` ; même signature, `SECURITY DEFINER`, `search_path`, volatilité, propriétaire et droits | § 10 : 0,2 à 1,3 ms par ligne en RLS | GP : `/pointage/gestion` gros 9,1 → 3,3 s ; devis 1 000 lignes 1,4 → 0,5 s (moyen) ; Réserves ×6 ; Colors ×7 ; Tools ×2,5 ; EXPLAIN R1-R5 ×7-9 |
| **C2** | `20260928000402_devis_recalc_totaux_par_instruction_v1.sql` — `recalc_devis_apres_ligne` (FOR EACH ROW) remplacé par 3 triggers **FOR EACH STATEMENT** à tables de transition appelant la **même** `recalc_totaux_devis` une fois par devis touché ; `trg_recalc_devis` conservée | 13,4 s pour enregistrer 1 000 lignes ; génération du jeu gros > 47 min sans fin | 1 000 lignes 13,4 s → 0,33 s, totaux identiques ; jeu gros généré en 26 min |
| **C3** | `src/app/(app)/planning/page.tsx` + `src/components/ModifierAffectationDiffere.tsx` — le formulaire « Modifier » d'une affectation n'est rendu qu'**à l'ouverture** ; la liste des chantiers est transmise **une fois** (contexte client). Mêmes champs, mêmes noms, même action serveur | HTML de 18 Mo (moyen) / 190 Mo (gros), 19,8 s | 1,3 Mo / 4,0 Mo ; 0,43 s / 1,5 s |
| **C4** | `src/app/(app)/chantiers/[id]/documents/page.tsx` — médias de la conversation signés **en un appel** (`createSignedUrls`, session de l'utilisateur, policies Storage `messagerie_medias_*`), comme les documents de la même page ; la route API reste pour le téléchargement et en repli | 21 vignettes / 80 en 429 (limite 60/min) | 0 requête vers la route limitée ; 80 URL signées |

Effet de bord relevé : l'édition de planning demande désormais JavaScript pour déplier le formulaire
(l'application en dépend déjà ailleurs).

**Non-régression** (état final, 357 migrations) :

| Porte | Résultat |
|---|---|
| Base neuve | 357/357 migrations, 0 erreur |
| pgTAP complet (`pgtap-run-v3.sh`, une base par fichier) | **151 fichiers, 142 propres, 4 309 ok / 14 not ok** ; les **149 fichiers communs sont identiques à V5 fichier par fichier** ; les 9 non-propres sont **exactement** ceux du rapport V5 (7 suites Studio, `platform_stripe_state_attestation_r72`, `elsatia_tools_cloud_sync_entitlement_closure_v1`) |
| Nouveau pgTAP `rls_helpers_plpgsql_equivalence_v1` | **16/16** : attributs de sécurité et ACL inchangés ; **équivalence différentielle** de chaque fonction contre une copie `LANGUAGE sql` de sa version V5, sur toute la matrice du jeu d'isolation (tous utilisateurs + anonyme × entreprises × permissions × applications × chantiers × salariés × intervenants), session révoquée et accès support compris ; chaque branche « vraie » rare est exercée ; **tests de mutation** : une fonction faussée fait échouer 1 à 3 assertions |
| Nouveau pgTAP `devis_recalc_totaux_par_instruction_v1` | **12/12** (insertion multi-devis, remises, UPDATE, déplacement de lignes entre devis, suppressions, verrou des devis acceptés) |
| RLS via API réelle — recette Relevé Lots 2-5 + Atelier (cross-tenant inclus) | **52/52** |
| RLS via API réelle — recette Réserves complète (chaîne du rapport V5, `recette-reserves-comparee.sh`), V5 pur vs après | **59/59 et 59/59** (tableau ci-dessous) |
| Vitest racine | **2 292** passés, 32 ignorés (V5 : 2 290 ; +2 : `ModifierAffectationDiffere.test.ts`) |
| typecheck / lint | OK / 0 erreur (15 avertissements, comme V5) |
| `next build` Gestion Pro, Réserves, Colors | OK |
| `verify:migrations` · `verify:train-expectations` · `test:preview-pack` · `test:migration-targets` · `verify:secrets` | 357 · OK (attendus **régénérés** par `sync:train-expectations` : 357 / `20260928000402`) · 28/28 · 7/7 · OK |

**Recette Réserves, mêmes conditions, V5 pur (worktree `f6399f15`) puis état après** — décor
`preparer-base.sh` + charge V6 + `amorcer-recette-v4.mjs`, Réserves compilé, passerelle :

| Spec | V5 pur | Après |
|---|---|---|
| `reserves-v3-collaboration` | 1/1 (7,8 s) | 1/1 (4,6 s) |
| `reserves-v4-listes-pdf` (PDF Chromium réel) | 11/11 (17,5 s) | 11/11 (16,9 s) |
| `reserves-v4-offline-mobile` | 6/6 (1,3 min) | 6/6 (17,4 s) |
| `reserves-v5-offline` (`--grep-invert "rechargement hors ligne"`, comme V3/V4/V5) | 13/13 (2,3 min) | 13/13 (51,6 s) |
| `reserves-v6-securite` (cross-tenant, écritures directes refusées, historique immuable) | 23/23 (51,6 s) | 23/23 (12,2 s) |
| `reserves-v6-performance` (chantier 2 000 réserves) | 5/5 (1,4 min) | 5/5 (38,2 s) |
| **Total** | **59/59** | **59/59** |

Un premier passage isolé de `reserves-v6-securite` sans l'amorçage de la chaîne avait échoué sur un cas
positif **à l'identique sur V5 pur et sur l'état après** (400 à l'acceptation) : artefact de
préparation, levé en rejouant la chaîne officielle, non compté.

## 12. Goulets ouverts (non corrigés, avec cause et piste)

| ID | Goulet | Mesure | Cause | Piste |
|---|---|---|---|---|
| **G1** | Centre d'alertes du dashboard **non borné** | gros : 4 902 alertes « devis arrive à expiration » + 312 encaissements → 12 Mo, 81 079 nœuds DOM, 1,26 s ; fixture brute 10 736 alertes → 19 Mo | toutes les alertes rendues ; `alerte_cle IN (…)` avec des milliers d'identifiants dans l'URL (masquages, délégations) — au-delà de quelques centaines, **risque d'URL trop longue** derrière la passerelle hébergée (NOT PROVEN localement) | borner (N plus urgentes + compteurs par domaine), lire masquages/délégations par entreprise + utilisateur sans liste `IN`, clore automatiquement les devis expirés |
| **G2** | `/pointage/gestion` gros | 3,3 s, 3,7 Mo (et tronqué : B2) | liste mensuelle complète rendue + RLS par ligne | agrégats serveur (RPC d'heures par salarié) + liste paginée |
| **G3** | Listes Réserves > 1 000 | 5 000 : fiche 3,9 s, liste 5,0 s, impression 5,1 s, PDF 16,6 s ; « Toutes les réserves » 7,0 s | lecture intégrale par tranches + ≈ 0,5 ms/ligne de RLS | pagination / virtualisation ; PDF : 16,6 s < `maxDuration` 60 s mais à surveiller |
| **G4** | Débit par instance Next | ~8 req/s (moyen) sur 1 cœur | rendu serveur mono-thread de pages lourdes | voir G1/G2 ; mise à l'échelle horizontale de l'hébergeur |
| **G5** | Facture depuis devis de 1 000 lignes | 2,55 s | même trigger par ligne que C2 sur `lignes_factures` | appliquer le motif C2 à `recalc_facture_apres_ligne` (non fait : ≤ 2,6 s, action rare) |
| **G6** | Tools fiche relevé 600 pièces | 7,6 s (`next dev`) | nombreuses requêtes + RLS `tools_releve_peut` | mesurer en build de production avant d'agir |
| **G7** | Messagerie : même motif que C4 | non mesuré | `<img src="/api/messagerie/pieces-jointes/…">` par pièce | même correctif que C4 si une conversation dépasse ~60 médias |

## 13. Bloquants

| ID | Bloquant | Preuve | Pourquoi non corrigé ici | Action |
|---|---|---|---|---|
| **B1** | Connexion : 429 dès la 11ᵉ tentative / 10 min / IP | § 8, A | réglage de **sécurité** (anti force brute) : l'assouplir est une décision, pas une optimisation | `DECISION_REQUIRED:RATE-LIMIT-LOGIN-IP-PARTAGEE` — p. ex. clé IP + identifiant et plafond IP plus haut |
| **B2** | Troncature silencieuse à 1 000 lignes | § 3, `/pointage/gestion` moyen : 1 462 pointages, 1 000 lus | refonte d'écran (agrégats + pagination), pas une optimisation locale | chantier dédié ; inventaire des lectures non bornées > 1 000 (pointages mensuels, pointages de la fiche chantier, lignes d'un devis > 1 000) |
| **B3** | Mémoire Next 3,2 Go à 25 utilisateurs (moyen) | § 9 | dépend du modèle d'exécution de l'hébergeur | mesurer sur la Preview réelle (mémoire par instance, concurrence par instance) ; G1/G2 réduisent la cause |
| **B4** | Édition de facture brouillon : « permission denied for function recalc_totaux_facture » | `modifier_facture_brouillon` sous `authenticated`, jeu moyen, V5 et après | ACL volontaire (`20260902000255`) : ne pas la rouvrir sans revue | redéfinir `modifier_facture_brouillon` sans appel direct (le trigger SECURITY DEFINER recalcule déjà) + test pgTAP `authenticated` |

## 14. Limites de cette baseline

- **Tout est co-localisé** sur 4 vCPU : les latences absolues sous charge et le débit ne prédisent pas
  l'hébergement réel (Vercel / Supabase, réseau, pooler, Kong). Valent : les **coûts par requête et par
  ligne**, les **rapports avant/après**, les **tailles de document**, l'absence d'erreur/deadlock.
- **PostgreSQL 16.13** local ; le projet cible PostgreSQL 17 (même absence de cache de plan pour les
  fonctions SQL imbriquées ; PostgreSQL 18 l'ajoute).
- **Auth et Storage** : passerelle de recette (JWT HS256 vérifiés, bcrypt, RLS Storage réelle), pas GoTrue
  ni storage-api hébergés ; leurs limites de débit propres ne sont pas reproduites. Tools : GoTrue réel.
- **Tools** mesuré en `next dev --webpack` (comme ses recettes) : valeurs plus pessimistes qu'en build.
- Réserves : 3 itérations par route (p95 = p99 = max). Concurrence : 3 passages par utilisateur.
- `shared_buffers` porté à 512 Mo (défaut Debian 128 Mo) pour rester proche d'une petite instance gérée.
- Outillage : `scripts/local-postgres-bootstrap/releve_e2e_stack.sh` ne tue pas un PostgREST déjà lancé
  (`pkill` sur chemin absolu, binaire lancé en relatif) : une relance sur une autre base garde l'**ancien**
  PostgREST sur `:3001` (constaté deux fois ; contourné en l'arrêtant). Même piège corrigé dans
  `scripts/perf/baseline-v1/pile-mesure.sh` (garde-fou : un seul PostgREST, connecté à la bonne base).
- Pas de mesure réseau mobile, ni d'appareil réel, ni de Preview/Production (consigne).

## 15. Reproduire

```bash
git checkout claude/brave-carson-cj8ofz && npm ci && for a in reserves colors tools; do npm ci --prefix apps/$a; done
pg_ctlcluster 16 main start          # + conf.d : shared_preload_libraries = 'pg_stat_statements', shared_buffers = 512MB
# Binaires : PostgREST v12.2.3 dans /tmp/postgrest-build ; GoTrue compilé par gotrue_pilot_bootstrap.sh (Tools)
# Environnement local (jamais de secret réel) : PASSERELLE_SECRET_JWT, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321,
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / _ANON_KEY et SUPABASE_SERVICE_ROLE_KEY signées avec ce secret,
#   PASSERELLE_MDP_DB, RATE_LIMIT_HMAC_KEY → fichier ENV_PERF

scripts/local-postgres-bootstrap/rebuild_db.sh perf_v5                            # base modèle
scripts/perf/baseline-v1/run-gp-datasets.sh perf_v5 petit moyen gros            # jeux GP
psql -d perf_gp_moyen -f scripts/perf/baseline-v1/gp_encaissements_realistes.sql # variante réaliste (sur une copie)
npx next build && npx next start -p 3100                                          # GP compilé
ENV_PERF=… scripts/perf/baseline-v1/campagne.sh perf_gp_moyen gp_moyen \
  bash scripts/perf/baseline-v1/mesurer-gp.sh perf_gp_moyen moyen 1 20            # p50/p95/p99 + requêtes lentes
ENV_PERF=… scripts/perf/baseline-v1/concurrence-gp.sh perf_gp_moyen moyen 3       # 10/25/50 + mémoire
node scripts/perf/baseline-v1/rate-limit-parcours.mjs --app … --chantier <id>    # limites de débit
psql -d perf_gp_gros -f scripts/perf/baseline-v1/explain_requetes_lentes.sql     # EXPLAIN ANALYZE
# Réserves : tests/e2e/reserves-pile-locale/preparer-base.sh + reserves_charge_100_1000_5000.sql, puis mesurer-reserves.sh
# Colors   : tests/e2e/colors-pile-locale/preparer-base.sh + colors_charge.sql, puis mesurer-colors.sh
# Tools    : releve_e2e_stack.sh, Tools en next dev, puis
#            npx playwright test tests/e2e/tools-releve-perf-baseline.spec.ts tests/e2e/tools-releve-lot4.spec.ts --grep "@perf|Relevé structure|Plan 2D"
scripts/qualification/pgtap-run-v3.sh <base neuve>                                # non-régression pgTAP
```

## 16. Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260928000401_rls_helpers_plpgsql_plan_cache_v1.sql` | C1 |
| `supabase/migrations/20260928000402_devis_recalc_totaux_par_instruction_v1.sql` | C2 |
| `supabase/tests/rls_helpers_plpgsql_equivalence_v1.test.sql`, `devis_recalc_totaux_par_instruction_v1.test.sql` | preuves pgTAP de C1, C2 |
| `src/components/ModifierAffectationDiffere.tsx` (+ `.test.ts`), `src/app/(app)/planning/page.tsx` | C3 |
| `src/app/(app)/chantiers/[id]/documents/page.tsx` | C4 |
| `scripts/perf/baseline-v1/*` | jeux de données, pile de mesure, bancs HTTP / concurrence / navigateur / limites de débit, EXPLAIN, tableaux |
| `tests/e2e/tools-releve-perf-baseline.spec.ts` | banc Tools (structure 600 pièces, plan 500 murs + 300 ouvertures) |
| `docs/qualification/perf-baseline-v1/` | résultats bruts (JSON, `pg_stat_statements`, EXPLAIN, mémoire) + `TABLEAUX.md` |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql`, `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | attendus du train régénérés (357 migrations) par l'outil du dépôt |
