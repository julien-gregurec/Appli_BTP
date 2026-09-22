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
