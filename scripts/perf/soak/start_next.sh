#!/usr/bin/env bash
# ELSATIA SOAK V1 — (re)démarre `next start` (build de production, jamais next dev) sur :3100
# avec l'échantillonneur mémoire in-process (scripts/perf/memory/sampler.cjs).
# Usage : start_next.sh <dossier-echantillons> [VAR=valeur ...]
set -euo pipefail
OUT="${1:?dossier}"; shift || true
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO"
for p in $(pgrep -f "next/dist/bin/next start -p 3100" || true); do kill "$p" 2>/dev/null || true; done
sleep 1
mkdir -p "$OUT"
set -a; . ./.env.local; set +a
for kv in "$@"; do export "$kv"; done
NODE_ENV=production MEM_SAMPLER_DIR="$OUT" nohup node --expose-gc -r ./scripts/perf/memory/sampler.cjs \
  node_modules/next/dist/bin/next start -p 3100 > "$OUT/server.log" 2>&1 &
for _ in $(seq 1 120); do curl -s -o /dev/null -m 2 localhost:3100/login && break; sleep 0.5; done
curl -s -o /dev/null -w "next start :3100 -> %{http_code}\n" localhost:3100/login
