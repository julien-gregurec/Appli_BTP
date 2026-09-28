# ELSATIA — Baseline performance V1 : tableaux détaillés (annexe)

Générés par `scripts/perf/baseline-v1/tableau.mjs` depuis les JSON bruts de ce dossier. Temps en ms (p50 / p95 / p99 / max), poids = taille moyenne du document HTML reçu. Rapport : `../ELSATIA_PERFORMANCE_CAPACITY_BASELINE_V1.md`.

## Gestion Pro — V5 (avant), 1 utilisateur

**gp_petit_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 3.2 req/s, 64 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 100 | 100 | 100 | 100 | 200×1 | 0 ko |
| `/dashboard` | 20 | 192 | 285 | 295 | 295 | 200×20 | 428 ko |
| `/chantiers` | 20 | 140 | 152 | 155 | 155 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 743 | 799 | 810 | 810 | 200×20 | 258 ko |
| `/devis` | 20 | 108 | 134 | 142 | 142 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 196 | 214 | 222 | 222 | 200×20 | 147 ko |
| `/factures` | 20 | 106 | 116 | 125 | 125 | 200×20 | 139 ko |
| `/factures/:id` | 20 | 144 | 155 | 164 | 164 | 200×20 | 106 ko |
| `/planning` | 20 | 326 | 340 | 363 | 363 | 200×20 | 1.6 Mo |
| `/pointage` | 20 | 232 | 306 | 352 | 352 | 200×20 | 62 ko |
| `/pointage/gestion` | 20 | 749 | 821 | 826 | 826 | 200×20 | 1.3 Mo |

**gp_moyen_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 1.1 req/s, 181 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 99 | 99 | 99 | 99 | 200×1 | 0 ko |
| `/dashboard` | 20 | 627 | 702 | 705 | 705 | 200×20 | 4.9 Mo |
| `/chantiers` | 20 | 337 | 361 | 374 | 374 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 707 | 768 | 769 | 769 | 200×20 | 247 ko |
| `/devis` | 20 | 127 | 149 | 155 | 155 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 1 399 | 1 543 | 2 063 | 2 063 | 200×20 | 1.5 Mo |
| `/factures` | 20 | 117 | 155 | 191 | 191 | 200×20 | 140 ko |
| `/factures/:id` | 20 | 161 | 229 | 239 | 239 | 200×20 | 107 ko |
| `/planning` | 20 | 1 892 | 2 134 | 2 708 | 2 708 | 200×20 | 18.1 Mo |
| `/pointage` | 20 | 254 | 295 | 354 | 354 | 200×20 | 60 ko |
| `/pointage/gestion` | 20 | 2 798 | 3 208 | 3 309 | 3 309 | 200×20 | 3.5 Mo |

**gp_gros_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 0.3 req/s, 754 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 97 | 97 | 97 | 97 | 200×1 | 0 ko |
| `/dashboard` | 20 | 2 335 | 2 495 | 2 524 | 2 524 | 200×20 | 19.4 Mo |
| `/chantiers` | 20 | 1 198 | 1 269 | 1 273 | 1 273 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 779 | 823 | 840 | 840 | 200×20 | 237 ko |
| `/devis` | 20 | 168 | 177 | 179 | 179 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 1 728 | 1 844 | 2 000 | 2 000 | 200×20 | 1.5 Mo |
| `/factures` | 20 | 158 | 170 | 178 | 178 | 200×20 | 140 ko |
| `/factures/:id` | 20 | 182 | 208 | 220 | 220 | 200×20 | 107 ko |
| `/planning` | 20 | 19 776 | 20 237 | 20 430 | 20 430 | 200×20 | 190.6 Mo |
| `/pointage` | 20 | 301 | 356 | 362 | 362 | 200×20 | 61 ko |
| `/pointage/gestion` | 20 | 9 128 | 9 591 | 9 628 | 9 628 | 200×20 | 3.7 Mo |

## Gestion Pro — après 401 (7 fonctions) + 402, avant correctif planning

**gp_petit_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 7.0 req/s, 29 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 102 | 102 | 102 | 102 | 200×1 | 0 ko |
| `/dashboard` | 20 | 127 | 149 | 175 | 175 | 200×20 | 428 ko |
| `/chantiers` | 20 | 75 | 84 | 88 | 88 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 200 | 229 | 229 | 229 | 200×20 | 258 ko |
| `/devis` | 20 | 71 | 82 | 128 | 128 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 102 | 125 | 126 | 126 | 200×20 | 147 ko |
| `/factures` | 20 | 74 | 90 | 91 | 91 | 200×20 | 139 ko |
| `/factures/:id` | 20 | 91 | 111 | 268 | 268 | 200×20 | 106 ko |
| `/planning` | 20 | 233 | 252 | 257 | 257 | 200×20 | 1.6 Mo |
| `/pointage` | 20 | 94 | 107 | 117 | 117 | 200×20 | 62 ko |
| `/pointage/gestion` | 20 | 243 | 280 | 285 | 285 | 200×20 | 1.3 Mo |

**gp_moyen_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 2.3 req/s, 89 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 106 | 106 | 106 | 106 | 200×1 | 0 ko |
| `/dashboard` | 20 | 412 | 500 | 504 | 504 | 200×20 | 4.9 Mo |
| `/chantiers` | 20 | 121 | 202 | 209 | 209 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 253 | 303 | 314 | 314 | 200×20 | 247 ko |
| `/devis` | 20 | 87 | 110 | 115 | 115 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 498 | 523 | 524 | 524 | 200×20 | 1.5 Mo |
| `/factures` | 20 | 92 | 107 | 107 | 107 | 200×20 | 140 ko |
| `/factures/:id` | 20 | 100 | 126 | 135 | 135 | 200×20 | 107 ko |
| `/planning` | 20 | 1 585 | 1 790 | 1 824 | 1 824 | 200×20 | 18.1 Mo |
| `/pointage` | 20 | 115 | 140 | 170 | 170 | 200×20 | 60 ko |
| `/pointage/gestion` | 20 | 834 | 944 | 1 003 | 1 003 | 200×20 | 3.5 Mo |

**gp_gros_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 0.4 req/s, 546 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 121 | 121 | 121 | 121 | 200×1 | 0 ko |
| `/dashboard` | 20 | 1 583 | 1 636 | 1 674 | 1 674 | 200×20 | 19.4 Mo |
| `/chantiers` | 20 | 421 | 478 | 510 | 510 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 379 | 415 | 424 | 424 | 200×20 | 237 ko |
| `/devis` | 20 | 123 | 139 | 149 | 149 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 815 | 851 | 866 | 866 | 200×20 | 1.5 Mo |
| `/factures` | 20 | 125 | 143 | 158 | 158 | 200×20 | 140 ko |
| `/factures/:id` | 20 | 129 | 148 | 159 | 159 | 200×20 | 107 ko |
| `/planning` | 20 | 18 630 | 20 343 | 20 574 | 20 574 | 200×20 | 190.6 Mo |
| `/pointage` | 20 | 173 | 202 | 203 | 203 | 200×20 | 61 ko |
| `/pointage/gestion` | 20 | 3 348 | 3 503 | 3 638 | 3 638 | 200×20 | 3.7 Mo |

## Gestion Pro — après 401 (7 fonctions) + 402 + correctif planning

**gp_petit_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 7.2 req/s, 28 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 99 | 99 | 99 | 99 | 200×1 | 0 ko |
| `/dashboard` | 20 | 131 | 152 | 157 | 157 | 200×20 | 428 ko |
| `/chantiers` | 20 | 78 | 87 | 101 | 101 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 198 | 221 | 232 | 232 | 200×20 | 258 ko |
| `/devis` | 20 | 72 | 84 | 85 | 85 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 107 | 124 | 203 | 203 | 200×20 | 147 ko |
| `/factures` | 20 | 79 | 85 | 88 | 88 | 200×20 | 139 ko |
| `/factures/:id` | 20 | 92 | 100 | 111 | 111 | 200×20 | 106 ko |
| `/planning` | 20 | 166 | 190 | 196 | 196 | 200×20 | 402 ko |
| `/pointage` | 20 | 96 | 114 | 148 | 148 | 200×20 | 62 ko |
| `/pointage/gestion` | 20 | 250 | 279 | 290 | 290 | 200×20 | 1.3 Mo |

**gp_moyen_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 3.2 req/s, 62 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 98 | 98 | 98 | 98 | 200×1 | 0 ko |
| `/dashboard` | 20 | 396 | 416 | 646 | 646 | 200×20 | 4.9 Mo |
| `/chantiers` | 20 | 118 | 143 | 357 | 357 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 243 | 292 | 337 | 337 | 200×20 | 247 ko |
| `/devis` | 20 | 81 | 95 | 105 | 105 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 472 | 550 | 557 | 557 | 200×20 | 1.5 Mo |
| `/factures` | 20 | 87 | 105 | 109 | 109 | 200×20 | 140 ko |
| `/factures/:id` | 20 | 97 | 117 | 119 | 119 | 200×20 | 107 ko |
| `/planning` | 20 | 432 | 453 | 463 | 463 | 200×20 | 1.3 Mo |
| `/pointage` | 20 | 102 | 114 | 115 | 115 | 200×20 | 60 ko |
| `/pointage/gestion` | 20 | 815 | 1 115 | 1 150 | 1 150 | 200×20 | 3.5 Mo |

**gp_gros_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 1.1 req/s, 181 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 107 | 107 | 107 | 107 | 200×1 | 0 ko |
| `/dashboard` | 20 | 1 635 | 1 725 | 1 735 | 1 735 | 200×20 | 19.4 Mo |
| `/chantiers` | 20 | 432 | 453 | 466 | 466 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 386 | 414 | 437 | 437 | 200×20 | 237 ko |
| `/devis` | 20 | 129 | 148 | 165 | 165 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 830 | 882 | 888 | 888 | 200×20 | 1.5 Mo |
| `/factures` | 20 | 126 | 144 | 155 | 155 | 200×20 | 140 ko |
| `/factures/:id` | 20 | 129 | 137 | 145 | 145 | 200×20 | 107 ko |
| `/planning` | 20 | 1 470 | 1 531 | 1 542 | 1 542 | 200×20 | 4.0 Mo |
| `/pointage` | 20 | 151 | 165 | 174 | 174 | 200×20 | 61 ko |
| `/pointage/gestion` | 20 | 3 253 | 3 322 | 3 350 | 3 350 | 200×20 | 3.7 Mo |

## Gestion Pro — état final (401 à 11 fonctions, 402, planning, médias), jeux « encaissements réalistes »

**gp_petit_apres_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 8.5 req/s, 24 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 100 | 100 | 100 | 100 | 200×1 | 0 ko |
| `/dashboard` | 20 | 103 | 120 | 133 | 133 | 200×20 | 428 ko |
| `/chantiers` | 20 | 61 | 77 | 78 | 78 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 177 | 194 | 202 | 202 | 200×20 | 258 ko |
| `/devis` | 20 | 56 | 62 | 104 | 104 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 85 | 92 | 94 | 94 | 200×20 | 147 ko |
| `/factures` | 20 | 59 | 67 | 70 | 70 | 200×20 | 139 ko |
| `/factures/:id` | 20 | 68 | 80 | 80 | 80 | 200×20 | 106 ko |
| `/planning` | 20 | 146 | 154 | 157 | 157 | 200×20 | 402 ko |
| `/pointage` | 20 | 78 | 93 | 219 | 219 | 200×20 | 62 ko |
| `/pointage/gestion` | 20 | 235 | 250 | 254 | 254 | 200×20 | 1.3 Mo |

**gp_moyen_reel_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 3.3 req/s, 61 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 103 | 103 | 103 | 103 | 200×1 | 0 ko |
| `/dashboard` | 20 | 280 | 361 | 454 | 454 | 200×20 | 3.1 Mo |
| `/chantiers` | 20 | 106 | 118 | 120 | 120 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 228 | 255 | 260 | 260 | 200×20 | 247 ko |
| `/devis` | 20 | 64 | 75 | 83 | 83 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 493 | 544 | 594 | 594 | 200×20 | 1.5 Mo |
| `/factures` | 20 | 71 | 91 | 124 | 124 | 200×20 | 140 ko |
| `/factures/:id` | 20 | 78 | 95 | 98 | 98 | 200×20 | 107 ko |
| `/planning` | 20 | 435 | 458 | 696 | 696 | 200×20 | 1.3 Mo |
| `/pointage` | 20 | 91 | 103 | 342 | 342 | 200×20 | 60 ko |
| `/pointage/gestion` | 20 | 824 | 921 | 1 005 | 1 005 | 200×20 | 3.5 Mo |

**gp_gros_reel_u1.json** — 1 utilisateur(s), 201 requêtes, 0 erreur(s), 1.1 req/s, 181 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 100 | 100 | 100 | 100 | 200×1 | 0 ko |
| `/dashboard` | 20 | 1 262 | 1 488 | 1 540 | 1 540 | 200×20 | 12.1 Mo |
| `/chantiers` | 20 | 440 | 465 | 476 | 476 | 200×20 | 176 ko |
| `/chantiers/:id` | 20 | 363 | 407 | 452 | 452 | 200×20 | 237 ko |
| `/devis` | 20 | 101 | 109 | 112 | 112 | 200×20 | 163 ko |
| `/devis/:id` | 20 | 860 | 916 | 917 | 917 | 200×20 | 1.5 Mo |
| `/factures` | 20 | 101 | 113 | 114 | 114 | 200×20 | 140 ko |
| `/factures/:id` | 20 | 105 | 111 | 119 | 119 | 200×20 | 107 ko |
| `/planning` | 20 | 1 493 | 1 603 | 1 618 | 1 618 | 200×20 | 4.0 Mo |
| `/pointage` | 20 | 140 | 152 | 160 | 160 | 200×20 | 61 ko |
| `/pointage/gestion` | 20 | 3 582 | 3 697 | 3 750 | 3 750 | 200×20 | 3.7 Mo |

## Gestion Pro — concurrence (jeux « après », dashboard à 10 736 alertes)

**gp_moyen_u10.json** — 10 utilisateur(s), 220 requêtes, 0 erreur(s), 7.4 req/s, 30 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 10 | 99 | 143 | 143 | 143 | 200×10 | 0 ko |
| `/dashboard` | 30 | 2 669 | 4 216 | 4 264 | 4 264 | 200×30 | 4.9 Mo |
| `/chantiers` | 30 | 590 | 1 467 | 1 521 | 1 521 | 200×30 | 176 ko |
| `/chantiers/:id` | 30 | 839 | 944 | 954 | 954 | 200×30 | 247 ko |
| `/devis` | 30 | 534 | 1 109 | 1 489 | 1 489 | 200×30 | 163 ko |
| `/factures` | 30 | 949 | 1 829 | 1 889 | 1 889 | 200×30 | 140 ko |
| `/planning` | 30 | 2 153 | 2 305 | 2 681 | 2 681 | 200×30 | 1.3 Mo |
| `/pointage` | 30 | 1 849 | 2 182 | 2 193 | 2 193 | 200×30 | 60 ko |

**gp_moyen_u25.json** — 25 utilisateur(s), 550 requêtes, 0 erreur(s), 7.4 req/s, 74 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 25 | 104 | 116 | 117 | 117 | 200×25 | 0 ko |
| `/dashboard` | 75 | 6 759 | 9 266 | 9 388 | 9 388 | 200×75 | 4.9 Mo |
| `/chantiers` | 75 | 1 377 | 4 422 | 5 361 | 5 361 | 200×75 | 176 ko |
| `/chantiers/:id` | 75 | 1 879 | 2 072 | 2 310 | 2 310 | 200×75 | 247 ko |
| `/devis` | 75 | 1 331 | 1 694 | 1 715 | 1 715 | 200×75 | 163 ko |
| `/factures` | 75 | 3 477 | 4 117 | 4 294 | 4 294 | 200×75 | 140 ko |
| `/planning` | 75 | 6 572 | 7 386 | 8 522 | 8 522 | 200×75 | 1.3 Mo |
| `/pointage` | 75 | 2 986 | 6 615 | 6 799 | 6 799 | 200×75 | 58 ko |

**gp_moyen_u50.json** — 50 utilisateur(s), 1100 requêtes, 2 erreur(s), 6.6 req/s, 167 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 50 | 172 | 194 | 196 | 196 | 200×50 | 0 ko |
| `/dashboard` | 150 | 18 542 | 20 614 | 20 798 | 20 804 | 200×150 | 4.9 Mo |
| `/chantiers` | 150 | 2 833 | 4 029 | 5 752 | 6 441 | 200×150 | 176 ko |
| `/chantiers/:id` | 150 | 4 409 | 4 920 | 5 219 | 5 222 | 200×150 | 247 ko |
| `/devis` | 150 | 2 421 | 3 050 | 3 338 | 3 491 | 200×150 | 163 ko |
| `/factures` | 150 | 2 543 | 16 377 | 17 986 | 18 098 | 200×150 | 140 ko |
| `/planning` | 150 | 17 690 | 20 135 | 24 204 | 24 272 | 200×148 307×1 reseau×1 | 1.3 Mo |
| `/pointage` | 150 | 6 188 | 12 319 | 13 453 | 13 715 | 200×150 | 58 ko |

**gp_gros_u10.json** — 10 utilisateur(s), 220 requêtes, 0 erreur(s), 2.9 req/s, 76 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 10 | 81 | 139 | 139 | 139 | 200×10 | 0 ko |
| `/dashboard` | 30 | 9 942 | 13 392 | 14 457 | 14 457 | 200×30 | 19.4 Mo |
| `/chantiers` | 30 | 1 443 | 3 679 | 4 675 | 4 675 | 200×30 | 176 ko |
| `/chantiers/:id` | 30 | 1 617 | 4 675 | 5 070 | 5 070 | 200×30 | 237 ko |
| `/devis` | 30 | 1 332 | 4 037 | 4 567 | 4 567 | 200×30 | 163 ko |
| `/factures` | 30 | 1 341 | 4 600 | 4 847 | 4 847 | 200×30 | 140 ko |
| `/planning` | 30 | 4 928 | 7 577 | 7 597 | 7 597 | 200×30 | 4.0 Mo |
| `/pointage` | 30 | 2 849 | 6 969 | 6 996 | 6 996 | 200×30 | 59 ko |

**gp_gros_u25.json** — 25 utilisateur(s), 550 requêtes, 0 erreur(s), 2.8 req/s, 194 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 25 | 97 | 108 | 140 | 140 | 200×25 | 0 ko |
| `/dashboard` | 75 | 28 423 | 33 830 | 34 200 | 34 200 | 200×75 | 18.9 Mo |
| `/chantiers` | 75 | 3 833 | 10 482 | 12 707 | 12 707 | 200×75 | 176 ko |
| `/chantiers/:id` | 75 | 6 169 | 11 008 | 11 128 | 11 128 | 200×75 | 237 ko |
| `/devis` | 75 | 4 409 | 9 610 | 10 366 | 10 366 | 200×75 | 163 ko |
| `/factures` | 75 | 3 494 | 7 911 | 9 889 | 9 889 | 200×75 | 140 ko |
| `/planning` | 75 | 10 708 | 18 237 | 18 998 | 18 998 | 200×75 | 4.0 Mo |
| `/pointage` | 75 | 5 360 | 15 491 | 15 641 | 15 641 | 200×75 | 58 ko |

**gp_gros_u50.json** — 50 utilisateur(s), 1100 requêtes, 12 erreur(s), 2.6 req/s, 427 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 50 | 196 | 210 | 221 | 221 | 200×50 | 0 ko |
| `/dashboard` | 150 | 61 772 | 79 405 | 90 060 | 90 155 | 200×150 | 19.3 Mo |
| `/chantiers` | 150 | 4 398 | 11 257 | 24 620 | 28 754 | 200×145 reseau×5 | 176 ko |
| `/chantiers/:id` | 150 | 8 314 | 13 383 | 26 708 | 34 391 | 200×150 | 237 ko |
| `/devis` | 150 | 6 324 | 17 219 | 18 055 | 18 057 | 200×150 | 163 ko |
| `/factures` | 150 | 12 908 | 23 812 | 30 651 | 30 651 | 200×148 307×2 | 140 ko |
| `/planning` | 150 | 34 269 | 43 505 | 44 315 | 50 419 | 200×146 307×4 | 4.0 Mo |
| `/pointage` | 150 | 18 981 | 31 188 | 33 391 | 33 411 | 200×149 307×1 | 58 ko |

## Gestion Pro — concurrence (jeux « encaissements réalistes »)

**gp_moyen_u10.json** — 10 utilisateur(s), 220 requêtes, 0 erreur(s), 8.1 req/s, 27 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 10 | 84 | 132 | 132 | 132 | 200×10 | 0 ko |
| `/dashboard` | 30 | 2 068 | 2 921 | 2 941 | 2 941 | 200×30 | 3.1 Mo |
| `/chantiers` | 30 | 502 | 1 336 | 1 457 | 1 457 | 200×30 | 176 ko |
| `/chantiers/:id` | 30 | 887 | 1 050 | 1 089 | 1 089 | 200×30 | 247 ko |
| `/devis` | 30 | 458 | 686 | 687 | 687 | 200×30 | 163 ko |
| `/factures` | 30 | 1 381 | 1 476 | 1 687 | 1 687 | 200×30 | 140 ko |
| `/planning` | 30 | 2 789 | 3 536 | 3 747 | 3 747 | 200×30 | 1.3 Mo |
| `/pointage` | 30 | 894 | 2 743 | 2 759 | 2 759 | 200×30 | 60 ko |

**gp_moyen_u25.json** — 25 utilisateur(s), 550 requêtes, 0 erreur(s), 8.0 req/s, 69 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 25 | 93 | 103 | 106 | 106 | 200×25 | 0 ko |
| `/dashboard` | 75 | 5 158 | 6 306 | 6 386 | 6 386 | 200×75 | 3.1 Mo |
| `/chantiers` | 75 | 1 290 | 4 057 | 4 633 | 4 633 | 200×75 | 176 ko |
| `/chantiers/:id` | 75 | 2 189 | 2 396 | 2 422 | 2 422 | 200×75 | 247 ko |
| `/devis` | 75 | 1 205 | 1 824 | 2 215 | 2 215 | 200×75 | 163 ko |
| `/factures` | 75 | 2 870 | 3 052 | 3 067 | 3 067 | 200×75 | 140 ko |
| `/planning` | 75 | 8 318 | 8 808 | 9 474 | 9 474 | 200×75 | 1.3 Mo |
| `/pointage` | 75 | 1 849 | 8 306 | 8 327 | 8 327 | 200×75 | 58 ko |

**gp_moyen_u50.json** — 50 utilisateur(s), 1100 requêtes, 0 erreur(s), 7.5 req/s, 147 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 50 | 145 | 162 | 182 | 182 | 200×50 | 0 ko |
| `/dashboard` | 150 | 11 916 | 13 885 | 17 385 | 18 772 | 200×150 | 3.1 Mo |
| `/chantiers` | 150 | 2 796 | 6 967 | 9 726 | 10 027 | 200×150 | 176 ko |
| `/chantiers/:id` | 150 | 4 572 | 5 027 | 10 454 | 10 899 | 200×150 | 247 ko |
| `/devis` | 150 | 2 868 | 3 615 | 3 804 | 3 825 | 200×150 | 163 ko |
| `/factures` | 150 | 5 801 | 7 019 | 7 059 | 7 061 | 200×150 | 140 ko |
| `/planning` | 150 | 16 522 | 18 715 | 18 917 | 19 215 | 200×150 | 1.3 Mo |
| `/pointage` | 150 | 3 949 | 15 842 | 17 106 | 17 458 | 200×150 | 58 ko |

**gp_gros_u10.json** — 10 utilisateur(s), 220 requêtes, 0 erreur(s), 3.3 req/s, 67 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 10 | 83 | 128 | 128 | 128 | 200×10 | 0 ko |
| `/dashboard` | 30 | 6 973 | 8 716 | 8 779 | 8 779 | 200×30 | 12.1 Mo |
| `/chantiers` | 30 | 680 | 4 467 | 4 692 | 4 692 | 200×30 | 176 ko |
| `/chantiers/:id` | 30 | 1 444 | 3 120 | 6 076 | 6 076 | 200×30 | 237 ko |
| `/devis` | 30 | 817 | 2 875 | 6 943 | 6 943 | 200×30 | 163 ko |
| `/factures` | 30 | 1 079 | 4 041 | 4 624 | 4 624 | 200×30 | 140 ko |
| `/planning` | 30 | 7 166 | 9 737 | 10 602 | 10 602 | 200×30 | 4.0 Mo |
| `/pointage` | 30 | 1 451 | 4 983 | 5 256 | 5 256 | 200×30 | 59 ko |

**gp_gros_u25.json** — 25 utilisateur(s), 550 requêtes, 1 erreur(s), 3.2 req/s, 172 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 25 | 95 | 107 | 148 | 148 | 200×25 | 0 ko |
| `/dashboard` | 75 | 18 133 | 21 704 | 25 139 | 25 139 | 200×75 | 12.1 Mo |
| `/chantiers` | 75 | 1 814 | 4 902 | 7 893 | 7 893 | 200×75 | 176 ko |
| `/chantiers/:id` | 75 | 2 614 | 3 570 | 4 290 | 4 290 | 200×75 | 237 ko |
| `/devis` | 75 | 2 934 | 12 880 | 13 535 | 13 535 | 200×75 | 163 ko |
| `/factures` | 75 | 5 423 | 12 373 | 14 072 | 14 072 | 200×75 | 140 ko |
| `/planning` | 75 | 16 709 | 24 607 | 25 101 | 25 101 | 200×75 | 4.0 Mo |
| `/pointage` | 75 | 7 446 | 15 348 | 17 900 | 17 900 | 200×74 307×1 | 58 ko |

**gp_gros_u50.json** — 50 utilisateur(s), 1100 requêtes, 10 erreur(s), 2.9 req/s, 378 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 50 | 153 | 173 | 186 | 186 | 200×50 | 0 ko |
| `/dashboard` | 150 | 39 936 | 48 073 | 55 065 | 58 553 | 200×149 307×1 | 12.0 Mo |
| `/chantiers` | 150 | 4 416 | 10 204 | 19 587 | 21 563 | 200×150 | 176 ko |
| `/chantiers/:id` | 150 | 6 640 | 12 138 | 21 197 | 21 490 | 200×150 | 237 ko |
| `/devis` | 150 | 6 087 | 17 840 | 20 421 | 22 896 | 200×150 | 163 ko |
| `/factures` | 150 | 16 265 | 26 171 | 32 421 | 33 777 | 200×146 307×4 | 139 ko |
| `/planning` | 150 | 35 079 | 43 544 | 46 528 | 48 377 | 200×146 307×4 | 4.0 Mo |
| `/pointage` | 150 | 16 889 | 28 282 | 30 603 | 31 824 | 200×149 307×1 | 58 ko |

## Réserves

**reserves_global_u1.json** — 1 utilisateur(s), 10 requêtes, 0 erreur(s), 0.0 req/s, 373 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 100 | 100 | 100 | 100 | 200×1 | 0 ko |
| `/reserves` | 3 | 46 155 | 46 837 | 46 837 | 46 837 | 200×3 | 6.1 Mo |
| `/dashboard` | 3 | 46 490 | 46 689 | 46 689 | 46 689 | 200×3 | 2.3 Mo |
| `/chantiers` | 3 | 69 | 73 | 73 | 73 | 200×3 | 17 ko |

**reserves_100_u1.json** — 1 utilisateur(s), 22 requêtes, 0 erreur(s), 1.6 req/s, 14 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 77 | 77 | 77 | 77 | 200×1 | 0 ko |
| `/chantiers/:id` | 3 | 172 | 176 | 176 | 176 | 200×3 | 123 ko |
| `/reserves?entreprise=:id` | 3 | 163 | 164 | 164 | 164 | 200×3 | 113 ko |
| `/reserves?entreprise=:id&statut=levee_demandee` | 3 | 72 | 74 | 74 | 74 | 200×3 | 35 ko |
| `/reserves?entreprise=:id&priorite=bloquante&statut=emise` | 3 | 49 | 52 | 52 | 52 | 200×3 | 19 ko |
| `/reserves/:id` | 3 | 54 | 59 | 59 | 59 | 200×3 | 23 ko |
| `/imprimer/chantier/:id` | 3 | 163 | 167 | 167 | 167 | 200×3 | 98 ko |
| `/api/documents/chantier/:id/pdf` | 3 | 2 790 | 2 842 | 2 842 | 2 842 | 200×3 | 332 ko |

**reserves_1000_u1.json** — 1 utilisateur(s), 22 requêtes, 0 erreur(s), 0.4 req/s, 53 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 75 | 75 | 75 | 75 | 200×1 | 0 ko |
| `/chantiers/:id` | 3 | 2 381 | 2 405 | 2 405 | 2 405 | 200×3 | 1.1 Mo |
| `/reserves?entreprise=:id` | 3 | 2 348 | 2 402 | 2 402 | 2 402 | 200×3 | 1.0 Mo |
| `/reserves?entreprise=:id&statut=levee_demandee` | 3 | 301 | 306 | 306 | 306 | 200×3 | 220 ko |
| `/reserves?entreprise=:id&priorite=bloquante&statut=emise` | 3 | 105 | 110 | 110 | 110 | 200×3 | 64 ko |
| `/reserves/:id` | 3 | 58 | 61 | 61 | 61 | 200×3 | 23 ko |
| `/imprimer/chantier/:id` | 3 | 2 342 | 2 346 | 2 346 | 2 346 | 200×3 | 773 ko |
| `/api/documents/chantier/:id/pdf` | 3 | 5 774 | 5 786 | 5 786 | 5 786 | 200×3 | 2.9 Mo |

**reserves_5000_u1.json** — 1 utilisateur(s), 22 requêtes, 3 erreur(s), 0.0 req/s, 494 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 74 | 74 | 74 | 74 | 200×1 | 0 ko |
| `/chantiers/:id` | 3 | 24 418 | 25 259 | 25 259 | 25 259 | 200×3 | 5.5 Mo |
| `/reserves?entreprise=:id` | 3 | 33 301 | 33 342 | 33 342 | 33 342 | 200×3 | 5.0 Mo |
| `/reserves?entreprise=:id&statut=levee_demandee` | 3 | 2 466 | 2 466 | 2 466 | 2 466 | 200×3 | 1.0 Mo |
| `/reserves?entreprise=:id&priorite=bloquante&statut=emise` | 3 | 345 | 353 | 353 | 353 | 200×3 | 263 ko |
| `/reserves/:id` | 3 | 61 | 64 | 64 | 64 | 200×3 | 23 ko |
| `/imprimer/chantier/:id` | 3 | 32 805 | 33 597 | 33 597 | 33 597 | 200×3 | 3.8 Mo |
| `/api/documents/chantier/:id/pdf` | 3 | — | — | — | — | 502×3 | — |

**reserves_global_u1.json** — 1 utilisateur(s), 10 requêtes, 0 erreur(s), 0.2 req/s, 56 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 127 | 127 | 127 | 127 | 200×1 | 0 ko |
| `/reserves` | 3 | 7 000 | 7 084 | 7 084 | 7 084 | 200×3 | 6.1 Mo |
| `/dashboard` | 3 | 6 727 | 6 746 | 6 746 | 6 746 | 200×3 | 2.3 Mo |
| `/chantiers` | 3 | 47 | 48 | 48 | 48 | 200×3 | 17 ko |

**reserves_100_u1.json** — 1 utilisateur(s), 22 requêtes, 0 erreur(s), 1.8 req/s, 12 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 74 | 74 | 74 | 74 | 200×1 | 0 ko |
| `/chantiers/:id` | 3 | 74 | 78 | 78 | 78 | 200×3 | 123 ko |
| `/reserves?entreprise=:id` | 3 | 66 | 69 | 69 | 69 | 200×3 | 113 ko |
| `/reserves?entreprise=:id&statut=levee_demandee` | 3 | 42 | 42 | 42 | 42 | 200×3 | 35 ko |
| `/reserves?entreprise=:id&priorite=bloquante&statut=emise` | 3 | 38 | 42 | 42 | 42 | 200×3 | 19 ko |
| `/reserves/:id` | 3 | 48 | 48 | 48 | 48 | 200×3 | 23 ko |
| `/imprimer/chantier/:id` | 3 | 65 | 72 | 72 | 72 | 200×3 | 98 ko |
| `/api/documents/chantier/:id/pdf` | 3 | 1 347 | 1 359 | 1 359 | 1 359 | 200×3 | 332 ko |

**reserves_1000_u1.json** — 1 utilisateur(s), 22 requêtes, 0 erreur(s), 0.9 req/s, 24 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 77 | 77 | 77 | 77 | 200×1 | 0 ko |
| `/chantiers/:id` | 3 | 454 | 462 | 462 | 462 | 200×3 | 1.1 Mo |
| `/reserves?entreprise=:id` | 3 | 429 | 485 | 485 | 485 | 200×3 | 1.0 Mo |
| `/reserves?entreprise=:id&statut=levee_demandee` | 3 | 83 | 86 | 86 | 86 | 200×3 | 220 ko |
| `/reserves?entreprise=:id&priorite=bloquante&statut=emise` | 3 | 50 | 51 | 51 | 51 | 200×3 | 64 ko |
| `/reserves/:id` | 3 | 47 | 48 | 48 | 48 | 200×3 | 23 ko |
| `/imprimer/chantier/:id` | 3 | 453 | 464 | 464 | 464 | 200×3 | 773 ko |
| `/api/documents/chantier/:id/pdf` | 3 | 4 363 | 4 444 | 4 444 | 4 444 | 200×3 | 2.9 Mo |

**reserves_5000_u1.json** — 1 utilisateur(s), 22 requêtes, 0 erreur(s), 0.2 req/s, 126 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 75 | 75 | 75 | 75 | 200×1 | 0 ko |
| `/chantiers/:id` | 3 | 3 910 | 4 087 | 4 087 | 4 087 | 200×3 | 5.5 Mo |
| `/reserves?entreprise=:id` | 3 | 5 003 | 5 006 | 5 006 | 5 006 | 200×3 | 5.0 Mo |
| `/reserves?entreprise=:id&statut=levee_demandee` | 3 | 424 | 438 | 438 | 438 | 200×3 | 1.0 Mo |
| `/reserves?entreprise=:id&priorite=bloquante&statut=emise` | 3 | 99 | 103 | 103 | 103 | 200×3 | 263 ko |
| `/reserves/:id` | 3 | 46 | 47 | 47 | 47 | 200×3 | 23 ko |
| `/imprimer/chantier/:id` | 3 | 5 139 | 5 160 | 5 160 | 5 160 | 200×3 | 3.8 Mo |
| `/api/documents/chantier/:id/pdf` | 3 | 16 567 | 16 814 | 16 814 | 16 814 | 200×3 | 14.4 Mo |

## Colors

**colors_avant_nuancier4_u1.json** — 1 utilisateur(s), 111 requêtes, 10 erreur(s), 0.6 req/s, 174 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 98 | 98 | 98 | 98 | 200×1 | 0 ko |
| `/dashboard` | 10 | 4 268 | 4 337 | 4 337 | 4 337 | 200×10 | 27 ko |
| `/inventaire` | 10 | 3 296 | 4 017 | 4 017 | 4 017 | 200×10 | 131 ko |
| `/inventaire?q=velours` | 10 | 3 766 | 3 905 | 3 905 | 3 905 | 200×10 | 131 ko |
| `/inventaire?q=PERF-02999` | 10 | 3 180 | 3 712 | 3 712 | 3 712 | 200×10 | 38 ko |
| `/inventaire?etat=ouvert&emplacement=:id` | 10 | 320 | 352 | 352 | 352 | 200×10 | 132 ko |
| `/inventaire?faible=1&tri=nom` | 10 | 529 | 628 | 628 | 628 | 200×10 | 140 ko |
| `/nuanciers` | 10 | 47 | 58 | 58 | 58 | 200×10 | 25 ko |
| `/nuanciers?hex=%232E5B8A` | 10 | 44 | 62 | 62 | 62 | 200×10 | 29 ko |
| `/mouvements` | 10 | — | — | — | — | 307×10 | — |
| `/activite` | 10 | 50 | 63 | 63 | 63 | 200×10 | 98 ko |
| `/depots` | 10 | 43 | 47 | 47 | 47 | 200×10 | 32 ko |

**colors_apres_nuancier4_u1.json** — 1 utilisateur(s), 101 requêtes, 0 erreur(s), 3.8 req/s, 26 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 99 | 99 | 99 | 99 | 200×1 | 0 ko |
| `/dashboard` | 10 | 574 | 608 | 608 | 608 | 200×10 | 27 ko |
| `/inventaire` | 10 | 469 | 494 | 494 | 494 | 200×10 | 131 ko |
| `/inventaire?q=velours` | 10 | 536 | 570 | 570 | 570 | 200×10 | 131 ko |
| `/inventaire?q=PERF-02999` | 10 | 452 | 487 | 487 | 487 | 200×10 | 38 ko |
| `/inventaire?etat=ouvert&emplacement=:id` | 10 | 78 | 84 | 84 | 84 | 200×10 | 132 ko |
| `/inventaire?faible=1&tri=nom` | 10 | 103 | 115 | 115 | 115 | 200×10 | 140 ko |
| `/nuanciers` | 10 | 38 | 50 | 50 | 50 | 200×10 | 25 ko |
| `/nuanciers?hex=%232E5B8A` | 10 | 34 | 42 | 42 | 42 | 200×10 | 29 ko |
| `/activite` | 10 | 39 | 56 | 56 | 56 | 200×10 | 98 ko |
| `/depots` | 10 | 36 | 38 | 38 | 38 | 200×10 | 32 ko |

**colors_apres_nuancier5000_u1.json** — 1 utilisateur(s), 101 requêtes, 0 erreur(s), 3.8 req/s, 27 s

| Route | n | p50 | p95 | p99 | max | statuts | poids |
|---|---|---|---|---|---|---|---|
| `POST /auth/v1/token (connexion)` | 1 | 96 | 96 | 96 | 96 | 200×1 | 0 ko |
| `/dashboard` | 10 | 568 | 605 | 605 | 605 | 200×10 | 27 ko |
| `/inventaire` | 10 | 469 | 477 | 477 | 477 | 200×10 | 131 ko |
| `/inventaire?q=velours` | 10 | 532 | 561 | 561 | 561 | 200×10 | 131 ko |
| `/inventaire?q=PERF-02999` | 10 | 450 | 498 | 498 | 498 | 200×10 | 38 ko |
| `/inventaire?etat=ouvert&emplacement=:id` | 10 | 76 | 92 | 92 | 92 | 200×10 | 132 ko |
| `/inventaire?faible=1&tri=nom` | 10 | 104 | 112 | 112 | 112 | 200×10 | 140 ko |
| `/nuanciers` | 10 | 37 | 39 | 39 | 39 | 200×10 | 53 ko |
| `/nuanciers?hex=%232E5B8A` | 10 | 48 | 55 | 55 | 55 | 200×10 | 59 ko |
| `/activite` | 10 | 40 | 45 | 45 | 45 | 200×10 | 98 ko |
| `/depots` | 10 | 37 | 42 | 42 | 42 | 200×10 | 32 ko |
