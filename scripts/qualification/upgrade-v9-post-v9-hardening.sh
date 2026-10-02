#!/usr/bin/env bash
# ELSATIA POST-V9 HARDENING V1 — qualification d'UPGRADE V9 finale (389 migrations, 6392131a)
# → candidat hardening (391 migrations : 20261002001301, 20261002001302), AVEC DONNÉES.
# Rapport : docs/qualification/ELSATIA_POST_V9_HARDENING_V1.md (Lot G).
#
# Entrée : une base V9 PEUPLÉE produite par le harnais V9 lui-même, depuis un worktree V9 vierge
# (les 17 migrations V9 exactement) :
#   git worktree add --detach ../v9 6392131aa02cecc9991358915963068de8292d24
#   (cd ../v9 && UPG_PASSE=historique|volumetrique UPG_OUT=/tmp/upg scripts/qualification/upgrade-v8-v9.sh upg_v9 <fresh-v9>)
#
#   1. copie de la base V9 peuplée (jamais modifiée) ;
#   2. précondition : aucune des 11 fonctions post-V9, pas de garde SEC-4 ;
#   3. instantané avant → migrations > 20261002001113 (attendu : 2) → instantané après ;
#   4. comparaison (upgrade_compare.py) + verdict automatique : 0 écart de lignes / checksums /
#      RLS / policies / droits de table / EXECUTE existants / sonde RLS réelle ; 11 fonctions
#      nouvelles dont UNE seule exécutable par authenticated (entreprise_active_autorisee) ;
#   5. schéma + ACL de la base upgradée = fresh hardening (pg_dump -s), GoTrue de l'historique
#      rejoué sur la copie fresh comme dans upgrade-v8-v9.sh ;
#   6. contrôles métier V9 rejoués (garanties V9 conservées) + suites pgTAP post-V9.
#
# Usage : scripts/qualification/upgrade-v9-post-v9-hardening.sh <base-v9-peuplée> <base-fresh-hardening> \
#           <gotrue.sql de l'historique> <contrôles-métier.sql> [UPGRADE_SNAPSHOT_SANS_SONDE=1 pour la passe volumétrique]
set -uo pipefail
SRC="${1:?base V9 peuplée}"
FRESH="${2:?base fresh hardening}"
GOTRUE_SQL="${3:?gotrue.sql (UPG_OUT/v7/gotrue.sql du harnais V9)}"
CONTROLES="${4:?contrôles métier (upgrade_v7_v8_business_checks.sql ou upgrade_v8_v9_business_checks.sql)}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
SOCLE_V9="20261002001113"
DB="${SRC}_pv9"
OUT="${UPG_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT"
psql_db() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1"; }
echec=0

echo "== 1. Copie de la base V9 peuplée ($SRC → $DB) =="
su postgres -c "psql -X -q -c 'drop database if exists \"$DB\";' -c 'create database \"$DB\" template \"$SRC\";'" || exit 1
su postgres -c "psql -X -q -At -d $DB -c 'select count(*) from auth.users'" | sed 's/^/  utilisateurs : /'

echo "== 2. Précondition : base V9 (aucun objet post-V9) =="
pre=$(su postgres -c "psql -X -q -At -d $DB -c \"select count(*) from pg_proc where proname in ('compter_comptes_application_service','relances_auto_parametres_service','relances_auto_candidats_service','relance_document_service','relance_nouveau_lien_partage_service','push_notifications_en_attente_service','push_preparer_notification_service','push_marquer_notification_envoyee_service','push_supprimer_abonnement_service','entreprise_active_autorisee','utilisateurs_entreprise_active_garde')\"")
[ "$pre" = 0 ] && echo "  ✅ 0/11 fonction post-V9 présente" || { echo "  ❌ $pre fonction(s) post-V9 déjà présente(s) : base non V9"; exit 1; }
su postgres -c "psql -X -q -d $DB -c 'analyze'" >/dev/null
export UPGRADE_SNAPSHOT_JOBS="${UPGRADE_SNAPSHOT_JOBS:-4}"

echo "== 3. Instantané avant, migrations post-V9, instantané après =="
UPGRADE_SNAPSHOT_V8=1 UPGRADE_SNAPSHOT_V9=1 python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/avant.json"
m=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" > "$SOCLE_V9" ]] || continue
  psql_db "$DB" < "$f" >/dev/null 2>"$OUT/err" || { echo "FAIL migration $(basename "$f")"; cat "$OUT/err"; exit 1; }
  m=$((m+1)); echo "  ✓ $(basename "$f")"
done
[ "$m" = 2 ] || { echo "attendu 2 migrations post-V9, trouvé $m"; exit 1; }
UPGRADE_SNAPSHOT_V8=1 UPGRADE_SNAPSHOT_V9=1 python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/apres.json" --colonnes-de "$OUT/avant.json"

echo "== 4. Comparaison et verdict =="
python3 "$BOOT/upgrade_compare.py" "$OUT/avant.json" "$OUT/apres.json" | tee "$OUT/comparaison.txt"
python3 - "$OUT/avant.json" "$OUT/apres.json" <<'PY' || echec=1
import json, sys
a, p = (json.load(open(x)) for x in sys.argv[1:3])
ko = []
if any(p["row_counts"].get(t) != n for t, n in a["row_counts"].items()) or set(p["row_counts"]) - set(a["row_counts"]):
    ko.append("lignes : écart ou table nouvelle")
if any(p["checksums"].get(t) != c for t, c in a["checksums"].items()):
    ko.append("checksums métier différents")
if set(a["rls_tables"]) != set(p["rls_tables"]):
    ko.append("drapeaux RLS")
if set(a["policies"]) != set(p["policies"]):
    ko.append("policies")
if set(a["grants"]) != set(p["grants"]):
    ko.append("droits de table")
if a["rls_probe"] != p["rls_probe"]:
    ko.append("sonde RLS réelle")
fa = {l.rsplit("|", 3)[0]: l for l in a["fonctions"]}
fp = {l.rsplit("|", 3)[0]: l for l in p["fonctions"]}
if any(fp.get(k) != v for k, v in fa.items()):
    ko.append("EXECUTE d'une fonction existante modifié ou fonction supprimée")
nouvelles = sorted(set(fp) - set(fa))
app = [k for k in nouvelles if fp[k].rsplit("|", 3)[1] == "true" or fp[k].rsplit("|", 3)[2] == "true"]
if len(nouvelles) != 11:
    ko.append(f"{len(nouvelles)} fonctions nouvelles (attendu 11)")
if [k.split("(")[0] for k in app] != ["public.entreprise_active_autorisee"]:
    ko.append(f"fonctions nouvelles exécutables par l'API : {app}")
print("  VERDICT :", "✅ aucun écart hors des 11 fonctions post-V9 attendues" if not ko else "❌ " + " ; ".join(ko))
sys.exit(1 if ko else 0)
PY

echo "== 5. Schéma et ACL : upgradé vs fresh hardening ($FRESH) =="
dump() { su postgres -c "pg_dump -s -x --no-owner -d $1" | grep -vE '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$2"; }
dumpacl() { su postgres -c "pg_dump -s -d $1" | grep -E '^(GRANT|REVOKE)' | sort > "$2"; }
FRESH_CMP="${FRESH}_cmp_$$"
su postgres -c "psql -X -q -c 'drop database if exists \"$FRESH_CMP\";' -c 'create database \"$FRESH_CMP\" template \"$FRESH\";'"
psql_db "$FRESH_CMP" < "$GOTRUE_SQL" >/dev/null
dump "$DB" "$OUT/schema_upg.sql"; dump "$FRESH_CMP" "$OUT/schema_fresh.sql"
dumpacl "$DB" "$OUT/acl_upg.sql"; dumpacl "$FRESH_CMP" "$OUT/acl_fresh.sql"
su postgres -c "psql -X -q -c 'drop database if exists \"$FRESH_CMP\";'"
if diff -q "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" >/dev/null && diff -q "$OUT/acl_upg.sql" "$OUT/acl_fresh.sql" >/dev/null; then
  echo "  ✅ schéma et ACL identiques ($(wc -l < "$OUT/schema_upg.sql") lignes, $(wc -l < "$OUT/acl_upg.sql") ACL)"
else
  echec=1; echo "  ❌ écart de schéma/ACL (diff dans $OUT)"; diff "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" | head -40
fi

echo "== 6. Contrôles métier V9 rejoués + suites pgTAP post-V9 (transactions annulées) =="
lancer_tap() {
  (cd "$REPO/supabase/tests" && su postgres -c "psql -X -q -At -d $DB -f $1") > "$OUT/$(basename "$1").tap" 2>&1
  local plan ok ko err
  plan=$(grep -oE '^1\.\.[0-9]+' "$OUT/$(basename "$1").tap" | head -1 | cut -c4-)
  ok=$(grep -cE '^ok ' "$OUT/$(basename "$1").tap"); ko=$(grep -cE '^not ok ' "$OUT/$(basename "$1").tap"); err=$(grep -cE 'ERROR:' "$OUT/$(basename "$1").tap")
  if [ -n "$plan" ] && [ "$ok" = "$plan" ] && [ "$ko" = 0 ] && [ "$err" = 0 ]; then echo "  ✅ $(basename "$1") $ok/$plan"
  else echec=1; echo "  ❌ $(basename "$1") ok=$ok/${plan:-?} not_ok=$ko erreurs=$err"; grep -E "^not ok|ERROR" "$OUT/$(basename "$1").tap" | head -10; fi
}
lancer_tap "$CONTROLES"
su postgres -c "psql -X -q -c 'alter database \"$DB\" set search_path = public, extensions'" >/dev/null
lancer_tap "$REPO/supabase/tests/post_v9_service_role_fonctions_v1.test.sql"
lancer_tap "$REPO/supabase/tests/post_v9_sec4_entreprise_active_v1.test.sql"
echo "Journaux : $OUT"
exit $echec
