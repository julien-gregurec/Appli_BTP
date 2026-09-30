#!/usr/bin/env bash
# ELSATIA_NEXT_MEMORY_CAPACITY_V1 — campagne complémentaire : routes isolées, PDF,
# charge intense, limites de conteneur. Chaque mesure démarre un `next start` neuf.
# Usage : campaign.sh <racine-sortie> [étapes...]  (étapes : routes pdf stress leak limits alloc)
set -uo pipefail
ROOT="$1"; shift
STEPS=("${@:-routes pdf stress limits}")
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$HERE/run-protocol.sh"
HEAVY="430079ed-e42f-4a04-9703-3746464bfbf6,b9b40720-cd97-4e2c-9156-224af5eefe77,698b150d-273f-4315-8160-52f15b1feb39,0522ded5-1efa-4cc3-a789-c245c5d8ba9d,ba4757a4-16d6-4104-b3f4-635129715cd6,dbf3b61e-a573-4ea0-bdf8-693d297d6a86"
for STEP in ${STEPS[@]}; do case "$STEP" in
  routes)
    for S in dashboard planning devis factures pointages chantiers; do
      [ -e "$ROOT/route-$S/phases.jsonl" ] && grep -q stop "$ROOT/route-$S/phases.jsonl" && continue
      rm -rf "$ROOT/route-$S"; QUICK=1 LOAD_S=120 SCENARIO=$S "$RUN" "$ROOT/route-$S" 1000 10
    done ;;
  pdf)
    [ -e "$ROOT/pdf/phases.jsonl" ] && grep -q stop "$ROOT/pdf/phases.jsonl" || {
      rm -rf "$ROOT/pdf"; QUICK=1 LOAD_S=90 SCENARIO=pdf LOADGEN_EXTRA="--accounts heavy --pdf-ids $HEAVY" "$RUN" "$ROOT/pdf" 0 1 5 10; } ;;
  stress)
    [ -e "$ROOT/stress/phases.jsonl" ] && grep -q stop "$ROOT/stress/phases.jsonl" || {
      rm -rf "$ROOT/stress"; LOAD_S=180 COOL_MIN=15 SNAP=1 "$RUN" "$ROOT/stress" 500 10 25 50; } ;;
  limits)
    for L in 2048 1024 512; do for V in defaut borne; do
      D="$ROOT/limit-$L-$V"
      [ -e "$D/phases.jsonl" ] && grep -q stop "$D/phases.jsonl" && continue
      EXTRA=""; [ "$V" = borne ] && EXTRA="--max-old-space-size=$(( L * 60 / 100 ))"
      rm -rf "$D"; QUICK=1 LOAD_S=180 LIMIT_MB=$L NODE_EXTRA="$EXTRA" "$RUN" "$D" 500 25
    done; done ;;
  leak)
    # Critère de fuite : 4 cycles identiques (50 VU, 120 s, think 500 ms), GC forcé +
    # heap snapshot après chacun ; comparer c2 -> c3 -> c4 (c1 inclut l'échauffement JIT).
    [ -e "$ROOT/leak/phases.jsonl" ] && grep -q stop "$ROOT/leak/phases.jsonl" || {
      rm -rf "$ROOT/leak"; LOAD_S=120 COOL_MIN=1 CYCLES=4 SNAP=1 "$RUN" "$ROOT/leak" 500 50; } ;;
  alloc)
    # A/B allocateur natif, même charge que « stress » palier 25 puis refroidissement court.
    for V in glibc arena2 jemalloc identity; do
      D="$ROOT/alloc-$V"
      [ -e "$D/phases.jsonl" ] && grep -q stop "$D/phases.jsonl" && continue
      X=""
      case $V in glibc) E="";; arena2) E="MALLOC_ARENA_MAX=2";; jemalloc) E="LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2";; identity) E=""; X="--identity";; esac
      rm -rf "$D"; QUICK=1 LOAD_S=180 SERVER_ENV="$E" LOADGEN_EXTRA="$X" "$RUN" "$D" 500 25
    done ;;
esac; done
