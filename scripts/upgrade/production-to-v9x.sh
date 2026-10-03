#!/usr/bin/env bash
# ELSATIA — PRODUCTION UPGRADE HARNESS : Production historique → tête V9.x (V9 finale, hardening, V9.1 future…).
# Rapport : docs/qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md
#
# NE S'EXÉCUTE QUE SUR UN POSTGRESQL LOCAL JETABLE (socket Unix, peer auth). Aucune connexion Production,
# Preview ou Stripe ; toute variable / tout argument évoquant une cible distante est refusé (lib/common.sh).
#
# Paramétrable : la cible n'est JAMAIS figée. --target-sha désigne n'importe quel commit (V9.1 dès qu'elle
# existe) ; --target-migration-count est l'attendu, vérifié contre l'arbre de ce commit.
#
# Étapes (une section par étape dans le journal) :
#   1 snapshot avant (empreintes zéro perte + sécurité + sonde RLS)   10 RLS (drapeaux, policies, sonde réelle)
#   2 ledger avant (supabase_migrations.schema_migrations)            11 fonctions (SECURITY DEFINER, search_path)
#   3 classification des migrations (déjà appliquées / en attente,     12 triggers
#     hors ordre, inattendues, historiques modifiées)                  13 grants (tables, colonnes, fonctions, schémas)
#   4 dry-run (copie jetable, transaction annulée par migration)       14 index
#   5 application (une transaction par migration + ligne de ledger,    15 contraintes
#     mesures : durée, verrous, réécritures, DML, mémoire)             16 contrôles de données (zéro perte, FK)
#   6 snapshot après                                                   17 performance sanity (requêtes clés, RLS)
#   7 comparaison avant / après et upgradé / fresh cible (pg_dump -s + ACL)
#   8 contrôles métier (pgTAP : anciennes offres, abonnements, isolation)
#   9 ACL (fermé : upgradé = fresh cible, inventaire avant → après)
#
# Usage :
#   scripts/upgrade/production-to-v9x.sh --target-sha <sha> --target-migration-count <n> --source-db <base 210 peuplée> [options]
# Options :
#   --work-db NOM          base upgradée (copie de la source ; défaut <source>_v9x)
#   --fresh-db NOM         fresh cible (reconstruite si absente ; défaut fresh_<sha8>)
#   --out DIR              journaux et preuves (défaut $UPG_OUT ou mktemp)
#   --dry-run              étapes 1 à 4 seulement (rien n'est appliqué sur la base de travail)
#   --stop-after VERSION   interruption simulée : arrêt propre après cette version (code 75)
#   --fail-at VERSION      panne simulée : erreur injectée DANS la transaction de cette version (code 76)
#   --resume               reprend la base de travail existante là où son ledger s'est arrêté
#   --sans-sonde           pas de sonde RLS par utilisateur (passes volumétriques)
#   --expected-changes F   changements de données déclarés (défaut scripts/upgrade/expected-changes.json)
#   --bridge F             pont d'upgrade PROPOSÉ (fichier de migration hors train, ex. bridges/*.sql) inséré à sa
#                          place lexicale, appliqué aussi au fresh de comparaison (répétable). Inutile depuis
#                          V9.1 readiness : les ponts du train (supabase/migrations/*_pont_upgrade_*) sont lus dans
#                          la cible ; ceux marqués « -- elsatia:upgrade-phase0 » sont appliqués EN PREMIER.
#   --publish-plan         copie le plan qualifié (target-<sha8>.json) dans scripts/upgrade/manifests/ si verdict OK
#   --source-manifest F    manifeste (version → sha256) des migrations historiques (défaut manifests/source-prod-210-5777abb.json)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib/common.sh"
BOOT="$REPO/scripts/local-postgres-bootstrap"

TARGET_SHA=""; TARGET_N=""; SRC_DB=""; WORK_DB=""; FRESH_DB=""; DRY=0; STOP_AFTER=""; FAIL_AT=""; RESUME=0; SONDE=1
ATTENDUS="$HERE/expected-changes.json"; OUT="${UPG_OUT:-}"; PONTS=()
MANIFESTE="$HERE/manifests/source-prod-210-5777abb.json"
while [ $# -gt 0 ]; do
  case "$1" in
    --target-sha) TARGET_SHA="$2"; shift 2;;
    --target-migration-count) TARGET_N="$2"; shift 2;;
    --source-db) SRC_DB="$2"; shift 2;;
    --work-db) WORK_DB="$2"; shift 2;;
    --fresh-db) FRESH_DB="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --dry-run) DRY=1; shift;;
    --stop-after) STOP_AFTER="$2"; shift 2;;
    --fail-at) FAIL_AT="$2"; shift 2;;
    --resume) RESUME=1; shift;;
    --sans-sonde) SONDE=0; shift;;
    --expected-changes) ATTENDUS="$2"; shift 2;;
    --source-manifest) MANIFESTE="$2"; shift 2;;
    --bridge) PONTS+=("$2"); shift 2;;
    --publish-plan) PUBLIER=1; shift;;
    -h|--help) sed -n '2,40p' "$0"; exit 0;;
    *) upg_die "option inconnue : $1";;
  esac
done
[ -n "$TARGET_SHA" ] || upg_die "--target-sha obligatoire"
[[ "$TARGET_N" =~ ^[0-9]+$ ]] || upg_die "--target-migration-count obligatoire (entier)"
[ -n "$SRC_DB" ] || upg_die "--source-db obligatoire (base historique peuplée, cf. build-source.sh)"
upg_garde_locale "$TARGET_SHA" "$SRC_DB" "$WORK_DB" "$FRESH_DB" "$OUT"
TARGET_SHA="$(git -C "$REPO" rev-parse --verify "$TARGET_SHA^{commit}" 2>/dev/null)" || upg_die "SHA cible inconnu du dépôt"
WORK_DB="${WORK_DB:-${SRC_DB}_v9x}"; FRESH_DB="${FRESH_DB:-fresh_${TARGET_SHA:0:8}${PONTS:+_p${#PONTS[@]}}}"
for b in "$SRC_DB" "$WORK_DB" "$FRESH_DB"; do upg_nom_base "$b"; done
[ "$SRC_DB" != "$WORK_DB" ] || upg_die "la base source n'est jamais modifiée : --work-db doit différer"
upg_exists "$SRC_DB" || upg_die "base source $SRC_DB absente (scripts/upgrade/build-source.sh)"
PROFIL_ACL=$(upg_q postgres "select coalesce(substring(shobj_description(oid, 'pg_database') from 'profil_acl=([a-z]+)'), 'minimal') from pg_database where datname = '$SRC_DB'")
[ "$PROFIL_ACL" = supabase ] && FRESH_DB="${FRESH_DB}_sb"
OUT="${OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT"
echo "ELSATIA production → V9.x : cible $TARGET_SHA ($TARGET_N migrations) ; source $SRC_DB (profil ACL $PROFIL_ACL) ; travail $WORK_DB ; fresh $FRESH_DB ; preuves $OUT"
VERDICT_KO=0
ko() { VERDICT_KO=1; echo "  ❌ $*"; echo "$*" >> "$OUT/echecs.txt"; }
ok() { echo "  ✅ $*"; }
etape() { echo; echo "== $* =="; }

# --- Migrations cible -----------------------------------------------------------------------------
TGT="$OUT/target"; upg_extraire_migrations "$REPO" "$TARGET_SHA" "$TGT"; MIG="$TGT/supabase/migrations"
n=$(ls "$MIG"/*.sql | wc -l)
[ "$n" = "$TARGET_N" ] || upg_die "le commit cible porte $n migrations, --target-migration-count=$TARGET_N"
for p in "${PONTS[@]}"; do
  [ -f "$p" ] || upg_die "pont introuvable : $p"
  vp=$(basename "$p" | cut -d_ -f1)
  ls "$MIG"/"${vp}"_*.sql >/dev/null 2>&1 && upg_die "pont $p : la version $vp existe déjà dans la cible"
  cp "$p" "$MIG/"; chmod a+r "$MIG/$(basename "$p")"; echo "  pont d'upgrade proposé inséré : $(basename "$p")"
done
upg_versions_dir "$MIG" > "$OUT/versions_cible.txt"
[ "$(sort -u "$OUT/versions_cible.txt" | wc -l)" = "$(wc -l < "$OUT/versions_cible.txt")" ] || upg_die "versions dupliquées dans la cible"

# --- Base de travail ------------------------------------------------------------------------------
if [ "$RESUME" = 1 ]; then
  upg_exists "$WORK_DB" || upg_die "--resume : base $WORK_DB absente"
  echo "Reprise de $WORK_DB (ledger : $(upg_q "$WORK_DB" "select count(*) from supabase_migrations.schema_migrations") versions)"
else
  upg_clone "$SRC_DB" "$WORK_DB"
fi
SNAP_ENV=(env UPGRADE_SNAPSHOT_JOBS=4)
[ "$SONDE" = 1 ] || SNAP_ENV+=(UPGRADE_SNAPSHOT_SANS_SONDE=1)

etape "1. Snapshot avant"
if [ "$RESUME" = 0 ] || [ ! -e "$OUT/avant/meta.json" ]; then
  python3 "$HERE/lib/fingerprint.py" capture "$SRC_DB" "$OUT/avant" || upg_die "empreintes avant"
  python3 "$HERE/lib/security_snapshot.py" "$SRC_DB" "$OUT/securite_avant" || upg_die "sécurité avant"
  "${SNAP_ENV[@]}" python3 "$BOOT/upgrade_snapshot.py" "$SRC_DB" "$OUT/sonde_avant.json" >/dev/null || upg_die "sonde avant"
  ok "empreintes, inventaire sécurité et sonde RLS de la source (jamais modifiée)"
else
  ok "reprise : snapshot avant déjà présent"
fi

etape "2. Ledger avant"
upg_ledger "$WORK_DB" > "$OUT/ledger_avant.txt"
echo "  ledger : $(wc -l < "$OUT/ledger_avant.txt") versions, max $(tail -1 "$OUT/ledger_avant.txt")"

etape "3. Classification des migrations"
python3 "$HERE/lib/classify.py" plan "$OUT/ledger_avant.txt" "$MIG" "$OUT/plan.json" --manifest-source "$MANIFESTE" || ko "ledger incompatible avec la cible (versions inconnues / historiques modifiées)"
[ -s "$OUT/plan.json" ] || upg_die "plan absent"
python3 - "$OUT/plan.json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
print(f"  déjà appliquées {len(p['deja_appliquees'])} ; en attente {len(p['en_attente'])} "
      f"(dont {len(p['hors_ordre'])} hors ordre → --include-all) ; inattendues au ledger {len(p['inconnues_ledger'])}")
print(f"  ponts d'upgrade du train : {len(p.get('ponts_cible', []))} ; phase 0 (appliquée en premier) : "
      + (", ".join(p.get('phase0', [])) or "aucune"))
PY
python3 -c "import json;[print(m) for m in json.load(open('$OUT/plan.json'))['en_attente']]" > "$OUT/en_attente.txt"

# Application d'une migration : une transaction (psql -1) = contenu + mesures + ligne de ledger.
# Une enveloppe « begin; … commit; » englobant tout le fichier est neutralisée (atomicité conservée par -1,
# sans quoi le COMMIT interne fermerait la transaction avant la mesure et l'écriture du ledger).
appliquer() { # <base> <fichier> <mode: reel|dryrun|panne>
  local base="$1" f="$2" mode="$3" b v nom
  b=$(basename "$f" .sql); v=${b%%_*}; nom=${b#*_}
  {
    echo "create temp table if not exists _upg_rel (oid oid, relfilenode oid, nom text, reltuples real);"
    echo "truncate _upg_rel; insert into _upg_rel select c.oid, c.relfilenode, n.nspname||'.'||c.relname, c.reltuples from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r','i','m') and n.nspname in ('public','platform','auth','storage');"
    echo "create temp table if not exists _upg_t0 (t timestamptz); truncate _upg_t0; insert into _upg_t0 values (clock_timestamp());"
    upg_contenu_migration "$f" | python3 "$HERE/lib/strip_txn.py"
    echo
    [ "$mode" = panne ] && echo "select 1/0 as panne_simulee_harnais;"
    cat <<SQL
select 'UPGMESURE '||json_build_object(
  'version', '$v', 'nom', '$nom',
  'ms', round(extract(epoch from clock_timestamp() - (select t from _upg_t0)) * 1000, 1),
  'verrous', (select coalesce(json_agg(distinct jsonb_build_object('rel', r.nom, 'mode', l.mode, 'lignes', r.reltuples)), '[]')
                from pg_locks l join _upg_rel r on r.oid = l.relation
               where l.pid = pg_backend_pid() and l.granted and l.mode in ('AccessExclusiveLock','ExclusiveLock','ShareLock','ShareRowExclusiveLock')),
  'reecritures', (select coalesce(json_agg(jsonb_build_object('rel', r.nom, 'lignes', r.reltuples)), '[]')
                    from _upg_rel r join pg_class c on c.oid = r.oid where c.relfilenode <> r.relfilenode and r.reltuples > 0),
  'dml', (select coalesce(json_agg(jsonb_build_object('rel', s.schemaname||'.'||s.relname, 'ins', s.n_tup_ins, 'upd', s.n_tup_upd, 'del', s.n_tup_del)), '[]')
            from pg_stat_xact_user_tables s join _upg_rel r on r.nom = s.schemaname||'.'||s.relname
           where s.n_tup_upd + s.n_tup_del > 0 or (s.n_tup_ins > 0 and r.reltuples > 0)),
  'memoire_ko', (select sum(total_bytes) / 1024 from pg_backend_memory_contexts),
  'enveloppe_txn', $( upg_contenu_migration "$f" | python3 "$HERE/lib/strip_txn.py" --detect ));
SQL
    if [ "$mode" = dryrun ]; then echo "rollback;"; else
      echo "insert into supabase_migrations.schema_migrations(version, name) values ('$v', '$nom');"; fi
  } | su postgres -c "psql -X -q -At -1 -v ON_ERROR_STOP=1 -d $base" > "$OUT/apply.out" 2> "$OUT/apply.err"
}

etape "4. Dry-run (copie jetable, chaque migration annulée après mesure)"
DRY_DB="${WORK_DB}_dry"; upg_nom_base "$DRY_DB"
if [ "$RESUME" = 0 ]; then
  upg_clone "$WORK_DB" "$DRY_DB"; : > "$OUT/dryrun.jsonl"; dko=0
  # Un dry-run par migration ANNULÉE ne peut pas enchaîner des migrations dépendantes ; il valide donc la
  # PREMIÈRE migration en attente isolément puis rejoue la chaîne complète sur la copie (sans ledger final).
  premiere=$(head -1 "$OUT/en_attente.txt")
  if [ -n "$premiere" ]; then
    if appliquer "$DRY_DB" "$MIG/$premiere" dryrun; then grep '^UPGMESURE' "$OUT/apply.out" | cut -c11- >> "$OUT/dryrun.jsonl"
    else dko=1; ko "dry-run : $premiere échoue isolément"; cat "$OUT/apply.err"; fi
  fi
  t0=$(date +%s)
  while read -r m; do
    [ -n "$m" ] || continue
    appliquer "$DRY_DB" "$MIG/$m" reel || { dko=1; ko "dry-run : échec $m"; head -5 "$OUT/apply.err"; break; }
  done < "$OUT/en_attente.txt"
  [ "$dko" = 0 ] && ok "dry-run : $(wc -l < "$OUT/en_attente.txt") migrations rejouées sur copie jetable ($(( $(date +%s) - t0 )) s), base de travail intacte"
  upg_drop "$DRY_DB"
else
  ok "reprise : dry-run déjà effectué"
fi
if [ "$DRY" = 1 ]; then echo; echo "DRY-RUN terminé : aucune écriture sur $WORK_DB. Preuves : $OUT"; exit $VERDICT_KO; fi

etape "5. Application (une transaction par migration, ledger inclus)"
[ "$RESUME" = 1 ] || : > "$OUT/mesures.jsonl"
appl=0; t0=$(date +%s)
while read -r m; do
  [ -n "$m" ] || continue
  v=${m%%_*}
  if [ "$(upg_q "$WORK_DB" "select count(*) from supabase_migrations.schema_migrations where version='$v'")" = 1 ]; then
    continue  # reprise : déjà au ledger
  fi
  mode=reel; [ "$v" = "$FAIL_AT" ] && mode=panne
  if appliquer "$WORK_DB" "$MIG/$m" "$mode"; then
    grep '^UPGMESURE' "$OUT/apply.out" | cut -c11- >> "$OUT/mesures.jsonl"; appl=$((appl+1))
  else
    echo "  ⛔ échec de $m (transaction annulée) :"; sed 's/^/     /' "$OUT/apply.err" | head -8
    echo "  ledger : $(upg_q "$WORK_DB" "select count(*) from supabase_migrations.schema_migrations") versions (inchangé pour $v)"
    echo "$m" > "$OUT/arret.txt"
    UPG_EXIT=76 upg_die "upgrade interrompu par une panne sur $m — reprise : même commande + --resume"
  fi
  if [ -n "$STOP_AFTER" ] && [ "$v" = "$STOP_AFTER" ]; then
    echo "  ⏸  interruption simulée après $m ($appl migrations appliquées)"; echo "$m" > "$OUT/arret.txt"
    exit 75
  fi
done < "$OUT/en_attente.txt"
upg_ledger "$WORK_DB" > "$OUT/ledger_apres.txt"
echo "  $appl migration(s) appliquée(s) en $(( $(date +%s) - t0 )) s ; ledger $(wc -l < "$OUT/ledger_apres.txt") versions"
if diff -q "$OUT/ledger_apres.txt" "$OUT/versions_cible.txt" >/dev/null; then ok "ledger après = les $TARGET_N fichiers de la cible${PONTS:+ + ${#PONTS[@]} pont(s)}"
else ko "ledger après ≠ fichiers cible"; diff "$OUT/ledger_apres.txt" "$OUT/versions_cible.txt" | head; fi

etape "6. Snapshot après"
upg_q "$WORK_DB" "analyze" >/dev/null
python3 "$HERE/lib/fingerprint.py" capture "$WORK_DB" "$OUT/apres" --colonnes-de "$OUT/avant" || ko "empreintes après"
python3 "$HERE/lib/security_snapshot.py" "$WORK_DB" "$OUT/securite_apres" || ko "sécurité après"
"${SNAP_ENV[@]}" python3 "$BOOT/upgrade_snapshot.py" "$WORK_DB" "$OUT/sonde_apres.json" >/dev/null || ko "sonde après"

etape "7. Comparaison schéma : upgradé vs fresh cible"
if ! upg_exists "$FRESH_DB" || [ "$(upg_q "$FRESH_DB" "select count(*) from supabase_migrations.schema_migrations" 2>/dev/null)" != "$(wc -l < "$OUT/versions_cible.txt")" ]; then
  upg_drop "$FRESH_DB"; su postgres -c "psql -X -q -d postgres -c 'create database \"$FRESH_DB\"'" >/dev/null
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$FRESH_DB -d $FRESH_DB -f $BOOT/pg_bootstrap.sql" >/dev/null 2>&1
  [ "$PROFIL_ACL" = supabase ] && upg_psql "$FRESH_DB" < "$HERE/lib/supabase_default_privileges.sql" >/dev/null
  upg_creer_ledger "$FRESH_DB"
  for f in "$MIG"/*.sql; do appliquer "$FRESH_DB" "$f" reel || upg_die "fresh cible : $(basename "$f")"; done
  ok "fresh cible $FRESH_DB construite ($TARGET_N migrations)"
fi
dump() { su postgres -c "pg_dump -s -x --no-owner -N supabase_migrations -d $1" | grep -vE '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$2"; }
dumpacl() { su postgres -c "pg_dump -s -N supabase_migrations -d $1" | grep -E '^(GRANT|REVOKE)' | sort > "$2"; }
dump "$WORK_DB" "$OUT/schema_upgrade.sql"; dump "$FRESH_DB" "$OUT/schema_fresh.sql"
dumpacl "$WORK_DB" "$OUT/acl_upgrade.sql"; dumpacl "$FRESH_DB" "$OUT/acl_fresh.sql"
python3 "$HERE/lib/schema_diff.py" "$OUT/schema_upgrade.sql" "$OUT/schema_fresh.sql" > "$OUT/schema_diff.txt"; sd=$?
sed 's/^/  /' "$OUT/schema_diff.txt" | head -20
[ "$sd" = 0 ] && ok "schéma upgradé = fresh cible (aux seules positions de colonnes près, listées)" || ko "schéma upgradé ≠ fresh cible"

etape "8. Contrôles métier (pgTAP, transactions annulées)"
lancer_tap() { # <fichier> <libellé>
  local log="$OUT/tap_$(basename "$1" .sql).log" plan okn kon err
  (cd "$(dirname "$1")" && su postgres -c "psql -X -q -At -d $WORK_DB -f $1") > "$log" 2>&1
  plan=$(grep -oE '^1\.\.[0-9]+' "$log" | head -1 | cut -c4-)
  okn=$(grep -cE '^ok ' "$log"); kon=$(grep -cE '^not ok ' "$log"); err=$(grep -cE 'ERROR:' "$log")
  if [ -n "$plan" ] && [ "$okn" = "$plan" ] && [ "$kon" = 0 ] && [ "$err" = 0 ]; then ok "$2 : $okn/$plan"
  else ko "$2 : ok=$okn/${plan:-?} not_ok=$kon erreurs=$err ($log)"; grep -E "^not ok|ERROR|#  " "$log" | head -12 | sed 's/^/       /'; fi
}
for t in "$HERE"/checks/*.test.sql; do lancer_tap "$t" "$(basename "$t" .test.sql)"; done

etape "9-15. Sécurité et catalogue : upgradé = fresh cible (fermé) ; inventaire avant → après"
python3 "$HERE/lib/security_snapshot.py" "$FRESH_DB" "$OUT/securite_fresh" >/dev/null || ko "sécurité fresh"
python3 "$HERE/lib/security_compare.py" "$OUT/securite_avant" "$OUT/securite_apres" "$OUT/securite_fresh" "$OUT/securite_rapport.json" | sed 's/^/  /'
[ "${PIPESTATUS[0]}" = 0 ] || ko "sécurité / catalogue : écart upgradé ≠ fresh cible"
python3 "$BOOT/upgrade_compare.py" "$OUT/sonde_avant.json" "$OUT/sonde_apres.json" > "$OUT/sonde_comparaison.txt"
grep -E "^Sonde RLS|^RLS flags|^Policies" "$OUT/sonde_comparaison.txt" | sed 's/^/  /'
python3 "$HERE/lib/access_check.py" "$SRC_DB" "$WORK_DB" "$OUT/sonde_avant.json" "$OUT/sonde_apres.json" "$ATTENDUS" "$OUT/acces.json" | sed 's/^/  /'
[ "${PIPESTATUS[0]}" = 0 ] || ko "continuité d'accès : perte ou réduction non déclarée"

etape "16. Contrôles de données : zéro perte"
python3 "$HERE/lib/fingerprint.py" compare "$OUT/avant" "$OUT/apres" "$ATTENDUS" "$OUT/zero_perte.json" | sed 's/^/  /'
[ "${PIPESTATUS[0]}" = 0 ] || ko "zéro perte : P0"

etape "17. Performance sanity"
python3 "$HERE/lib/perf_sanity.py" "$SRC_DB" "$WORK_DB" "$OUT/perf.json" | sed 's/^/  /'
[ "${PIPESTATUS[0]}" = 0 ] || ko "performance : régression > seuil"
python3 "$HERE/lib/classify.py" risques "$OUT/mesures.jsonl" "$MIG" "$OUT/classification.json" --source-securite "$OUT/securite_avant" | tail -6 | sed 's/^/  /'

# Plan qualifié pour ce SHA (lu par le preflight, P6/P7) : migrations en attente classées + préconditions.
python3 - "$OUT" "$TARGET_SHA" "$TARGET_N" "$MANIFESTE" "$VERDICT_KO" "$MIG" "${PONTS[@]}" <<'PY'
import json, os, sys
import hashlib
out, sha, n, man, ko, mig, chemins = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7:]
pl = json.load(open(os.path.join(out, "plan.json")))
externes = {os.path.basename(p) for p in chemins}
# Ponts : ceux du TRAIN (fichiers *_pont_upgrade_* de la cible) et, le cas échéant, ceux passés par --bridge.
fichiers_ponts = sorted(set(pl.get("ponts_cible", [])) | externes)
ponts = [{"fichier": f, "sha256": hashlib.sha256(open(os.path.join(mig, f), "rb").read()).hexdigest(),
          "phase0": f in pl.get("phase0", []), "externe": f in externes} for f in fichiers_ponts]
cl = json.load(open(os.path.join(out, "classification.json")))
noms_ponts = {p["fichier"].split("_")[0] for p in ponts}
# UPG-P0-1 n'est plus une précondition bloquante quand un pont le couvre : v2 externe (298) ou phase 0 du train.
couvert = "20260921000298" in noms_ponts or any(p["phase0"] for p in ponts)
pre = ["bloquant_essai_hors_fenetre", "bloquant_essai_perpetuel"] + ([] if couvert else ["lignes_factures_emises"])
plan = {"target_sha": sha, "target_migration_count": n, "source_manifest": os.path.basename(man), "ponts": ponts,
        "phase0": pl.get("phase0", []),
        "qualifie": ko == "0", "preconditions_bloquantes": pre,
        "preconditions_phase_principale": ["bloquant_lignes_factures_emises_non_preparees"] if any(p["phase0"] for p in ponts) else [],
        "qualifie_avec_ponts": bool(ponts), "qualifie_avec_ponts_externes": bool(externes),
        "migrations": [{k: m.get(k) for k in ("migration", "verrou", "rollback", "ms", "motifs", "motifs_rollback")} for m in cl]}
p = os.path.join(out, f"target-{sha[:8]}.json")
json.dump(plan, open(p, "w"), indent=1, ensure_ascii=False)
print(f"  plan qualifié écrit : {p} ({len(plan['migrations'])} migrations, préconditions bloquantes {pre})")
PY
[ -n "${PUBLIER:-}" ] && [ "$VERDICT_KO" = 0 ] && cp "$OUT/target-${TARGET_SHA:0:8}.json" "$HERE/manifests/" && echo "  plan publié dans scripts/upgrade/manifests/"

echo
if [ "$VERDICT_KO" = 0 ]; then echo "VERDICT HARNAIS : ✅ UPGRADE QUALIFIÉ ($SRC_DB → $TARGET_SHA, $TARGET_N migrations). Preuves : $OUT"
else echo "VERDICT HARNAIS : ❌ ÉCHECS (voir $OUT/echecs.txt)"; cat "$OUT/echecs.txt"; fi
exit $VERDICT_KO
