# ELSATIA — GATE du train canonique V9.2

Train : `integration/elsatia-canonical-train-v9.2` — 408 migrations, dernière `20261003001504`.
Rapport de preuve : `docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_2_CONVERGENCE_V1.md`.

Règle : un gate n'est franchi que sur preuve **de son propre niveau**. `LOCAL QUALIFIED` ne vaut jamais
`PRODUCTION READY` : aucune preuve hébergée (Preview ou Production) n'a été produite pour ce train.

| Gate | État | Ce qui le prouve | Ce qui manque pour le franchir |
|---|---|---|---|
| **CODE_GATE** | ✅ PASSED | intégrité du train (391 V9.1 à l'octet, 17 ajouts tracés, renumérotation prouvée), composition du catalogue (0 conflit), typecheck / lint / Vitest des 4 apps, builds (GP, Colors, Réserves, Tools ×3 + 2 refus), `verify:*`, `test:*` | — |
| **LOCAL_GATE** | ✅ PASSED | fresh 408/408 ; upgrades V9.1 → V9.2 (fraîche, métier, historique, volumétrique) 0 perte ; Production 210 → V9.2 sans `--bridge` (ZERO_PERTE, ACL/RLS = fresh, offres 24/24, interruptions 9/9, ponts PS1–PS4) ; pgTAP 172/181 (9 = V9.1) ; PostgREST réel ; Playwright GP 13/13 et satellites 16/16 ; push / relances / RLS / multi-tenant / endurance | NOT_PROVEN assumés : Supabase CLI réel (Docker), WebKit, PostgreSQL 17 |
| **PREVIEW_GATE** | ⛔ NOT_RUN | pack opérateur générique `PREVIEW_V9_OPERATOR_PACK_READY` (hors ligne) : CURRENT / TARGET / PENDING calculés, garde `pgvvpqyjziyapbbkydmc`, Production refusée, sans `--include-all` | export du ledger réel, sauvegarde, `db push --dry-run` réel, application, DB verify, contrôles post-cutover, inventaire Vercel, attestation k1, déploiement des 4 apps, recette HTTP et pilote |
| **PRODUCTION_GATE** | ⛔ BLOCKED | harnais et preflight qualifiés localement, fail-closed | `DECISION_REQUIRED_PRODUCTION` (UPG-P0-2, troncature d'essai, essai sans date, propriétaire plateforme, logout, fenêtre `…1503`) ; preuves Preview ; sauvegarde et fenêtre de maintenance réelles |
| **COMMERCIAL_GATE** | ⛔ BLOCKED | — | `DECISION_REQUIRED_PRODUCT` B10 / B22 / B23 (et B20 inverse, PENDING vs VALIDATED) ; Stripe Live (non configuré, non testé) |
