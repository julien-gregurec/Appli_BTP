#!/usr/bin/env bash
# ELSATIA — harnais d'upgrade Production → V9.x — PHASE H : campagne volumétrique.
# Pour chaque palier (lignes des tables critiques : lignes_devis, lignes_factures, pointages, affectations,
# journal_activite ; parents à N/10, N/20) : source 210 reconstruite + remédiation, harnais complet SANS sonde
# RLS par utilisateur (évaluée ligne à ligne, hors de propos ici), puis synthèse : durée totale d'application,
# durée de vérification, migrations les plus lentes, verrous forts, réécritures, mémoire, temp files.
# Usage : UPG_PONTS="b1.sql b2.sql" scripts/upgrade/volumetrie.sh <sha> <nombre> <dossier-sortie> [paliers…]
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHA="${1:?sha}"; N="${2:?nombre de migrations}"; OUTV="${3:?sortie}"; shift 3
if [ $# -gt 0 ]; then PALIERS=("$@"); else PALIERS=(500 5000 20000 100000); fi
mkdir -p "$OUTV"; chmod 777 "$OUTV"
PONTS_ARGS=(); for p in ${UPG_PONTS:-}; do PONTS_ARGS+=(--bridge "$p"); done
for v in "${PALIERS[@]}"; do
  db="h210_vol$v"
  t0=$(date +%s)
  "$HERE/build-source.sh" "$db" --vol "$v" --remediation "$HERE/sql/remediation_essai_perpetuel_PROPOSITION.sql" > "$OUTV/build_$v.log" 2>&1 \
    || { echo "palier $v : construction en échec"; tail -5 "$OUTV/build_$v.log"; continue; }
  t1=$(date +%s)
  /usr/bin/time -v "$HERE/production-to-v9x.sh" --target-sha "$SHA" --target-migration-count "$N" --source-db "$db" \
    --sans-sonde "${PONTS_ARGS[@]}" --out "$OUTV/run_$v" > "$OUTV/run_$v.log" 2> "$OUTV/time_$v.log"
  rc=$?
  t2=$(date +%s)
  lignes=$(grep "lignes totales" "$OUTV/build_$v.log" | grep -oE '[0-9]+$')
  python3 - "$OUTV" "$v" "$rc" "$((t1-t0))" "$((t2-t1))" "${lignes:-0}" <<'PY'
import json, os, re, sys
out, v, rc, tb, th, lignes = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
run = os.path.join(out, f"run_{v}")
mes = [json.loads(l) for l in open(os.path.join(run, "mesures.jsonl"))] if os.path.exists(os.path.join(run, "mesures.jsonl")) else []
log = open(os.path.join(out, f"run_{v}.log")).read()
m = re.search(r"(\d+) migration\(s\) appliquée\(s\) en (\d+) s", log)
forts = sorted(((x["version"], x["nom"][:40], v2["rel"], v2["mode"], int(v2["lignes"] or 0)) for x in mes for v2 in x["verrous"]
                if v2["mode"] == "AccessExclusiveLock" and (v2["lignes"] or 0) >= 1000 and not v2["rel"].endswith(("_pkey", "_idx", "_key"))),
               key=lambda t: -t[4])
time_log = open(os.path.join(out, f"time_{v}.log")).read()
rss = re.search(r"Maximum resident set size \(kbytes\): (\d+)", time_log)
synth = {"palier": int(v), "lignes_totales": lignes, "code": rc, "construction_s": tb, "harnais_s": th,
         "application_s": int(m.group(2)) if m else None, "migrations": len(mes),
         "somme_ms_migrations": round(sum(x["ms"] for x in mes)),
         "plus_lentes": sorted(({"migration": x["version"] + "_" + x["nom"][:45], "ms": x["ms"]} for x in mes), key=lambda d: -d["ms"])[:8],
         "verrous_access_exclusive_tables_peuplees": [{"version": a, "nom": b, "rel": c, "lignes": e} for a, b, c, d, e in forts[:25]],
         "memoire_backend_max_ko": max([x.get("memoire_ko") or 0 for x in mes] or [0]),
         "rss_client_harnais_max_ko": int(rss.group(1)) if rss else None,
         "verdict": "OK" if "UPGRADE QUALIFIÉ" in log else "KO"}
json.dump(synth, open(os.path.join(out, f"synthese_{v}.json"), "w"), indent=1, ensure_ascii=False)
print(f"palier {v:>6} : {lignes} lignes ; application {synth['application_s']} s (Σ {synth['somme_ms_migrations']} ms) ; "
      f"harnais {th} s ; plus lente {synth['plus_lentes'][0]['migration'][:40]} {synth['plus_lentes'][0]['ms']} ms ; verdict {synth['verdict']}")
PY
done
