# ELSATIA SOAK / PERFORMANCE — CHECKPOINT

Branche : `qualification/elsatia-soak-performance-v1`
Base : `integration/elsatia-post-v9-hardening-v1` @ `877a4b9f284150e5d4f06fd68250f3ea19ff62a1`
(aucune branche V9.1 canonique finale trouvée sur `origin` au démarrage, 2026-10-02).

## Étapes

- [x] 0. Sélection de la tête + branche isolée
- [x] 1. Environnement : PostgreSQL 16 local (`soak`, 391 migrations OK) + fixture `scripts/perf/generate_fixture.sql` + PostgREST v12.2.3 :3000 (max_rows=1000) + pgTAP apt
- [ ] 2. Fixtures volumétriques
- [ ] 3. Domaines A..L
  - [x] F cron push : 9 rouges pgTAP (`scripts/perf/soak/tests/cron_push_red.test.sql`) + 4 rouges Vitest (`cron-push-route.soak.test.ts`)
- [ ] 4. Rapport final

## Reprise

Reprendre à la première case non cochée. Les artefacts de mesure sont sous
`scripts/perf/soak/` et `docs/qualification/soak/`.
