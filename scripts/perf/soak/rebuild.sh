#!/usr/bin/env bash
# ELSATIA SOAK V1 — base jetable : migrations + fixture capacité (tenants A/B) -> modèle soak_base.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
"$REPO/scripts/local-postgres-bootstrap/rebuild_db.sh" soak_base
su postgres -c "psql -X -q -d soak_base -v ON_ERROR_STOP=1 -f $REPO/scripts/perf/generate_fixture.sql" >/dev/null
echo "soak_base prête"
