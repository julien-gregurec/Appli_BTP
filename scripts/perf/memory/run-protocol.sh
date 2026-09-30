#!/usr/bin/env bash
# ELSATIA_NEXT_MEMORY_CAPACITY_V1 — protocole de mesure mémoire sur `next start`.
#
# Usage : run-protocol.sh <out-dir> <think-ms> [palier1 palier2 ...]
#   Variables : LOAD_S (durée d'un palier, défaut 180), COOL_MIN (défaut 15 ; 1 = T+1 seulement),
#   SCENARIO (défaut mix), NODE_EXTRA (options node, ex. --max-old-space-size=512),
#   SNAP=1 (heap snapshots), CYCLES (répétitions du dernier palier + refroidissement),
#   LOADGEN_EXTRA (options supplémentaires de loadgen.mjs),
#   SERVER_ENV (variables pour le seul serveur, ex. MALLOC_ARENA_MAX=2),
#   APP_DIR (répertoire du build servi, défaut dépôt),
#   LIMIT_MB (limite mémoire cgroup simulée, ex. 512),
#   QUICK=1 (pas de refroidissement long : 60 s puis GC forcé — mesures par route).
# Prérequis : build de production déjà fait (`next build`), pile Supabase locale
# (scripts/local-postgres-bootstrap) sur :54321, .env.local pointant dessus.
set -uo pipefail
OUT="$1"; THINK="$2"; shift 2
PALIERS=("${@:-1 10 25 50}")
LOAD_S="${LOAD_S:-180}"; COOL_MIN="${COOL_MIN:-15}"; SCENARIO="${SCENARIO:-mix}"; CYCLES="${CYCLES:-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../../.." && pwd)"
mkdir -p "$OUT"; cd "$REPO"
set -a; . ./.env.local; set +a
# APP_DIR : répertoire du build à servir (défaut : le dépôt) — permet de comparer avant/après
# avec un second worktree construit séparément.
cd "${APP_DIR:-$REPO}"
mark() { echo "{\"t\":$(date +%s%3N),\"phase\":\"$1\"}" >> "$OUT/phases.jsonl"; echo "[$(date +%T)] $1"; }
cmd() { echo "$1" > "$OUT/cmd"; while [ -e "$OUT/cmd" ] && kill -0 "$SRV" 2>/dev/null; do sleep 0.5; done; rm -f "$OUT/cmd"; sleep 1; }
su postgres -c "psql -X -q -d pilot_gp -c 'truncate rate_limits_applicatifs;'" >/dev/null 2>&1 || true

# LIMIT_MB : simulation d'une limite mémoire de conteneur (cgroup v1 dédié, confiné au
# serveur Next et à ses enfants ; l'OOM killer n'atteint rien d'autre).
CG=""
if [ -n "${LIMIT_MB:-}" ]; then
  CG=/sys/fs/cgroup/memory/elsatia_mem_$LIMIT_MB
  mkdir -p "$CG"; echo 0 > "$CG/memory.swappiness" 2>/dev/null || true
  echo $((LIMIT_MB * 1024 * 1024)) > "$CG/memory.limit_in_bytes"
  echo $((LIMIT_MB * 1024 * 1024)) > "$CG/memory.memsw.limit_in_bytes" 2>/dev/null || true
  echo 0 > "$CG/memory.failcnt" 2>/dev/null || true
fi
MEM_SAMPLER_DIR="$OUT" NODE_ENV=production CG="$CG" nohup sh -c '[ -n "$CG" ] && echo $$ > "$CG/cgroup.procs"; exec "$@"' sh \
  env ${SERVER_ENV:-} node --expose-gc ${NODE_EXTRA:-} -r "$HERE/sampler.cjs" node_modules/next/dist/bin/next start -p 3000 > "$OUT/server.log" 2>&1 &
SRV=$!
until curl -s -o /dev/null localhost:3000/login; do sleep 0.5; kill -0 $SRV 2>/dev/null || { echo "server died"; exit 1; }; done
# RSS de l'arbre de processus (serveur + enfants éventuels : Chromium PDF), toutes les 2 s.
( while kill -0 $SRV 2>/dev/null; do
    PIDS=$(pstree -p $SRV 2>/dev/null | grep -o '([0-9]*)' | tr -d '()' | tr '\n' ',' | sed 's/,$//')
    echo "{\"t\":$(date +%s%3N),\"treeRssKb\":$(ps -o rss= -p ${PIDS:-$SRV} 2>/dev/null | awk '{s+=$1} END {print s+0}'),\"nproc\":$(echo "$PIDS" | tr ',' '\n' | grep -c .)}" >> "$OUT/tree.jsonl"
    sleep 2
  done ) &
mark "idle"; sleep 60
[ "${SNAP:-0}" = 1 ] && { mark "snap-idle"; cmd "snap:idle"; }
for P in "${PALIERS[@]}"; do
  mark "load-$P"
  node "$HERE/loadgen.mjs" --users "$P" --duration "$LOAD_S" --think "$THINK" --scenario "$SCENARIO" ${LOADGEN_EXTRA:-} --out "$OUT/load-$P.json" | tee -a "$OUT/load.log"
  mark "end-load-$P"
done
if [ "${QUICK:-0}" = 1 ]; then mark "cool-T0"; sleep 60; mark "gc"; cmd "gc"; [ "${SNAP:-0}" = 1 ] && { mark "snap-end"; cmd "snap:end"; }; CYCLES=0; fi
for C in $(seq 1 "$CYCLES"); do
  [ "$C" -gt 1 ] && { P="${PALIERS[-1]}"; mark "load-$P-cycle$C"; node "$HERE/loadgen.mjs" --users "$P" --duration "$LOAD_S" --think "$THINK" --scenario "$SCENARIO" ${LOADGEN_EXTRA:-} --out "$OUT/load-$P-c$C.json" | tee -a "$OUT/load.log"; mark "end-load-$P-cycle$C"; }
  mark "cool-T0-c$C"; sleep 60; mark "cool-T1-c$C"
  if [ "$COOL_MIN" -ge 5 ]; then sleep 240; mark "cool-T5-c$C"; sleep $(( (COOL_MIN - 5) * 60 )); mark "cool-T${COOL_MIN}-c$C"; fi
  mark "gc-c$C"; cmd "gc"
  [ "${SNAP:-0}" = 1 ] && { mark "snap-c$C"; cmd "snap:c$C"; }
done
mark "stop"
if [ -n "$CG" ]; then
  echo "{\"limitMb\":$LIMIT_MB,\"maxUsageMb\":$(( $(cat $CG/memory.max_usage_in_bytes) / 1048576 )),\"failcnt\":$(cat $CG/memory.failcnt),\"oom\":\"$(grep oom_kill $CG/memory.oom_control | tr '\n' ' ')\",\"serverAlive\":$(kill -0 $SRV 2>/dev/null && echo true || echo false)}" > "$OUT/cgroup.json"
  cat "$OUT/cgroup.json"
fi
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
