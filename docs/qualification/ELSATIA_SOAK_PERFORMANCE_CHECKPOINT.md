# ELSATIA SOAK / PERFORMANCE — CHECKPOINT

Branche : `qualification/elsatia-soak-performance-v1`
Base : `integration/elsatia-post-v9-hardening-v1` @ `877a4b9f284150e5d4f06fd68250f3ea19ff62a1`
(aucune branche V9.1 canonique finale sur `origin` au démarrage, 2026-10-02).

## Environnement (à reconstruire après interruption — conteneur éphémère)

1. `service postgresql start` ; `apt-get install -y postgresql-16-pgtap bc` ; `npm ci`.
2. `scripts/perf/soak/rebuild.sh` → base modèle `soak_base` (391 migrations + fixture A/B).
   `createdb soak -T soak_base`, puis tenants : `psql -d soak -v k=K -v n=N -v e=E -v jours=J -f scripts/perf/soak/volume_tenant.sql`
   K/N/E/J : 11/1000/20/0, 12/5000/20/0, 13/20000/20/0, 14/50000/20/0, 15/100000/20/0, 16/250000/20/0, 21/1000/100/1825, 22/1000/500/365
   + `affectations_tenant.sql` (k=21,22).
3. PostgREST : `POSTGREST_BUILD_DIR=/tmp/claude-0/pgrst scripts/perf/postgrest_local.sh soak 3000`.
4. GoTrue : `git clone --branch v2.196.0 supabase/auth` + `go build` → `/tmp/gotrue-build/gotrue` ;
   pile app : `scripts/perf/soak/stack_app.sh` (base `soak_app`, GoTrue :9999, PostgREST :3001, proxy :54321).
5. `.env.local` LOCAL (non versionné) : clés anon/service_role signées avec le secret GoTrue local, **sans `sub`**.

## Étapes

- [x] 0. Sélection de la tête + branche isolée
- [x] 1. PostgreSQL 16 + 391 migrations + fixture + PostgREST + pgTAP
- [~] 2. Fixtures volumétriques (11, 12, 13 faits ; 14, 15, 16, 21, 22 en cours)
- [ ] 3. Domaines
  - [x] F cron push : 9 rouges pgTAP + 4 rouges Vitest
  - [x] D concurrence facturation : `docs/qualification/soak/domain_d_concurrence.json` (7 PASS, 1 DEGRADATION, 0 deadlock) ; lost update SQL lignes (P2)
  - [x] G relances : 2 rouges (famine, pas d'ORDER BY), doublons/reprise PASS
  - [~] E Stripe : rejeu synthétique (re-run après correctif JWT service sans `sub`) ; harnais existants à relancer après génération
  - [~] K multi-tenant : script prêt, à relancer hors charge
  - [ ] A dashboard (script prêt `domain_a_dashboard.mjs`) — après génération
  - [ ] B planning, C pointages, H PDF, I mémoire Next, J abus, L long run
- [ ] 4. Rapport final

## Constats provisoires
- F : cron push plafonné à 200, ordre physique, fenêtre 25 h → perte définitive (N=201 → 1 perdue, 300 → 100, 1000 → 800).
- G : `relances_auto_candidats_service` même motif (LIMIT 200 sans ORDER BY) → famine prouvée.
- D : numérotation, paiements, avoirs, acomptes, transformations : PASS sous 32 concurrents.
- Création d'entreprise sérialisée par le compteur global `next_reference(null,'entreprise')` (verrou tenu jusqu'au commit) — P2.
