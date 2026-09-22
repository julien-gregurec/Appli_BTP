# Local PostgreSQL bootstrap (no Docker / no Supabase CLI)

Some environments this project's missions run in have PostgreSQL 16 installed
locally but no Docker daemon reachable and no way to install the Supabase
CLI's local stack (`supabase start` requires Docker; without it there is no
`auth`/`storage`/`realtime`/PostgREST). This directory lets those missions
still replay the real migration train and run the real pgTAP suite
(`supabase/tests/*.test.sql`) against a real PostgreSQL engine, instead of
stopping at `EXECUTION_NOT_PROVEN`.

First documented and validated by
`docs/qualification/ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md` (§0) as a
one-off; promoted to a committed, reusable script during
`ELSATIA_EXTERNAL_PILOT_FULL_REHEARSAL_V2` after it was also used to run the
full pgTAP suite (94 files) for the first time in this project's history.

## What it does

`pg_bootstrap.sql` creates, on a bare PostgreSQL 16 database:

- the `anon` / `authenticated` / `service_role` / `authenticator` /
  `supabase_admin` / `supabase_migrator` roles real Supabase projects have,
- minimal `auth` (`users`, `mfa_factors`, `uid()`/`role()`/`email()`/`jwt()`)
  and `storage` (`buckets`, `objects`, `foldername()`/`filename()`/
  `extension()`, RLS **enabled** to match what the real Storage service does)
  schemas,
- `pgcrypto` pre-installed in `extensions` (as on a real Supabase project,
  before any user migration runs — needed for `extensions.digest()` etc.
  used by application code),
- a `pgsodium` schema stub (`crypto_sign_detached`/`crypto_sign_verify_detached`)
  just complete enough for the repo's migrations to apply; it is **not** real
  Ed25519 crypto, so anything that actually verifies a signature against it
  will not pass — see Limits below.

`rebuild_db.sh <db-name>` drops/creates that database, runs the bootstrap,
then applies every file in `supabase/migrations/` in order via `psql`,
stopping at the first real error.

## Usage

```bash
# Fresh DB with just the schema (for pgTAP, which brings its own fixtures):
scripts/local-postgres-bootstrap/rebuild_db.sh pgtap_test
cd supabase/tests && pg_prove -d pgtap_test *.test.sql

# Fresh DB for the pilot fixture cycle:
scripts/local-postgres-bootstrap/rebuild_db.sh pilot_test
psql -d pilot_test -f supabase/production/seed_entreprise_pilote_btp.sql
psql -d pilot_test -f supabase/production/assertions_entreprise_pilote_btp.sql
psql -d pilot_test -f supabase/production/cleanup_entreprise_pilote_btp.sql
```

Run as a user that can `su postgres` (the scripts shell out to the
`postgres` OS user for peer auth).

## What this proves, and what it does not

Proves, for real, on a real PostgreSQL 16 engine with the repo's actual
schema: migration replay end-to-end, table/column/constraint/trigger
behavior, and — because pgTAP tests exercise `set local role
authenticated`/`anon` plus `auth.uid()` via `request.jwt.claim*`/
`request.jwt.claims` — **real RLS policy enforcement**, not a superuser
bypass.

Does **not** prove: anything that needs GoTrue (real password/session auth,
MFA enrollment), PostgREST (the actual HTTP API surface, its auto-generated
schema exposure), Storage's real upload/signing pipeline, Realtime, or actual
Ed25519 signature verification via real `pgsodium`. `platform_stripe_state_attestation_r72.test.sql`
is the one pgTAP suite in this repo that needs genuine `pgsodium` crypto and
is expected to fail here for that reason alone — not a product defect.

If Docker ever becomes available with unrestricted image pulls, prefer
`supabase start` + `supabase test db` over this directory: it is a strictly
closer match to production. This bootstrap is a fallback for when it isn't.

## Real local Auth (GoTrue), when Docker itself works but image pulls don't

`ELSATIA_EXTERNAL_PILOT_FULL_REHEARSAL_V2` found that `dockerd` could start in
its environment but `supabase start` still failed, because pulling the
Supabase images from the registry hit a proxy data-transfer cap
(`Data limit exceeded`) rather than a missing daemon. Since GoTrue
(`github.com/supabase/auth`) is a plain Go binary, it can be built from
source over a plain `git clone` (no registry involved) and run against this
same bootstrapped Postgres, giving real signed JWTs, real login/ban/expiry
enforcement, and real onboarding RPC execution (`creer_entreprise_bootstrap`,
`activer_compte_employe`) instead of pgTAP's fabricated `request.jwt.claim*`
GUCs.

```bash
npm run pilot:auth:local
# = gotrue_pilot_bootstrap.sh pilot_gp   (build GoTrue if needed, real GoTrue
#   migrations, roles/db, app migrations, pilot fixture, start GoTrue :9999)
# + run_pilot_auth_scenarios.sh pilot_gp (real signup/activation for the 5
#   pilot profiles + a fresh "tenant B", then the mission's 5 session
#   scenarios: valid / expired / wrong tenant / inactive user / revoked
#   membership, plus the centralized permission-guard checks)
```

Requires the same PostgreSQL 16 as above, a Go toolchain, Node.js, and
network access to `github.com` (plain git, not any Docker/OCI registry).

Still NOT covered, same root cause as the Docker registry cap (see
`docs/qualification/ELSATIA_PILOT_AUTH_POSTGREST_ACCEPTANCE_AUTOMATION_V1.md`
for the full breakdown): real PostgREST (no Haskell toolchain in this
sandbox either), real Storage, real e-mail delivery, and anything requiring
an actual browser against a live `next dev`/PostgREST-backed app. Where this
script's `jwt_bridge.mjs` runs SQL under a verified real JWT's claims
(`SET LOCAL role` + `request.jwt.claims`), that is RLS validated under a
real, cryptographically verified JWT -- not a real PostgREST HTTP request.
Its header spells out exactly what is and isn't equivalent.

## Real local PostgREST + a real browser (V2)

The "no Haskell toolchain" limitation above turned out to be about compiling
PostgREST from source, not about running it: PostgREST ships a static Linux
binary as a plain GitHub release asset, downloadable with an ordinary `curl`
(no Docker/OCI registry involved, same as the GoTrue binary above) --
`docs/qualification/ELSATIA_PILOT_ACCEPTANCE_AUTOMATION_V2.md` §1 has the
details. `local_supabase_proxy.mjs` fronts that real PostgREST + the real
GoTrue above with a single `/auth/v1`, `/rest/v1` URL, exactly what Kong does
in production, so `@supabase/ssr`/`@supabase/supabase-js` (and therefore
`next dev` and Playwright) can talk to a fully real local backend for the
first time in this project's qualification history.

```bash
npm run pilot:acceptance:v2
# = pilot:auth:local + a real PostgREST binary (downloaded once, cached) +
#   local_supabase_proxy.mjs + the 69 ACTUALLY_AUTOMATABLE acceptance-test
#   IDs from V1, executed for real (run_pilot_acceptance_v2.mjs)
```

For the browser layer (not part of the single command above -- needs a live
`next dev` and a real browser):

```bash
# .env.local: NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321, with an anon/
# service key signed with the same secret as GoTrue (node scripts/local-
# postgres-bootstrap/jwt_bridge.mjs sign '{"role":"anon", ...}')
npm run dev -- -p 3100
npx playwright test tests/e2e/pilot-acceptance-v2.spec.ts --project=desktop-chromium
```

Still NOT covered: real Storage (`storage-api` isn't a static binary the way
GoTrue/PostgREST are, and `api.github.com` -- needed even just to list
release candidates -- stays blocked in this sandbox, confirmed again in V2)
and anything needing real e-mail delivery or an LLM/external service call.
