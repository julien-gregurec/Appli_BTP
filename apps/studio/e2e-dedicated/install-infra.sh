#!/usr/bin/env bash
# Prépare les binaires du banc E2E Studio dédié dans $E2E_BIN (idempotent, aucun registre Docker) :
#   gotrue     github.com/supabase/auth v2.192.0      (go build, CGO désactivé)
#   postgrest  PostgREST v12.2.3                      (binaire statique officiel)
#   storage    github.com/supabase/storage v1.79.22   (npm ci + build esbuild ; fs-xattr natif)
# Prérequis : git, go ≥ 1.24, node/npm, curl, tar/xz, make + g++ (module natif fs-xattr).
set -euo pipefail
E2E_BIN="${E2E_BIN:-/tmp/claude-0/infra}"
GOTRUE_VERSION="${GOTRUE_VERSION:-v2.192.0}"
POSTGREST_VERSION="${POSTGREST_VERSION:-v12.2.3}"
STORAGE_VERSION="${STORAGE_VERSION:-v1.79.22}"
mkdir -p "$E2E_BIN"
cd "$E2E_BIN"

if [ ! -x gotrue ]; then
  rm -rf gotrue-src
  git clone -q --depth 1 --branch "$GOTRUE_VERSION" https://github.com/supabase/auth.git gotrue-src
  (cd gotrue-src && CGO_ENABLED=0 go build -o ../gotrue .)
fi
if [ ! -x postgrest ]; then
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar xJ
fi
if [ ! -f storage-src/dist/start/server.js ]; then
  rm -rf storage-src
  git clone -q --depth 1 --branch "$STORAGE_VERSION" https://github.com/supabase/storage.git storage-src
  (
    cd storage-src
    # Le dépôt exige node ≥ 24 (engine-strict) ; le banc tourne aussi sous node 22.
    npm ci --ignore-scripts --engine-strict=false --no-audit --no-fund
    npm rebuild fs-xattr
    node ./build.js
    npx resolve-tspaths
  )
fi
./gotrue --version 2>/dev/null | head -1 || true
./postgrest --version | head -1
echo "storage-api $STORAGE_VERSION : $E2E_BIN/storage-src/dist"
