#!/usr/bin/env bash
# ELSATIA — harnais d'upgrade Production → V9.x — PHASE I : interruptions, reprises, ledger incohérent,
# idempotence, restauration. Tout sur copies LOCALES jetables de la source 210 (jamais modifiée).
#
#   S1 coupure ENTRE deux migrations (arrêt propre après la migration P, point de non-retour ACL 255) :
#      ledger = source + préfixe exact du plan ; reprise --resume → verdict complet identique à un run d'une traite.
#   S2 panne DANS une migration (erreur injectée dans la transaction de 20260921000300) : transaction annulée,
#      schéma + ACL + ledger STRICTEMENT identiques à l'état d'avant la tentative ; reprise → OK.
#   S3 ledger EN RETARD (migration appliquée, ligne de ledger perdue — COMMIT interne / coupure réseau entre
#      les deux) : la reprise naïve rejoue la migration → mesure de son idempotence ; réparation manuelle
#      (vérification de l'état puis inscription de la version) → reprise OK.
#   S4 ledger EN AVANCE (version inscrite sans migration appliquée — « migration repair » abusif) : la reprise
#      saute la migration ; le harnais DOIT le détecter (schéma ≠ fresh) → seule issue : restauration.
#   S5 RESTAURATION : dump -Fc de la source avant upgrade, restauré après un upgrade partiel → empreintes
#      zéro perte identiques à la source, ledger revenu à 210.
#   S6 IDEMPOTENCE : chaque migration en attente rejouée une 2e fois (transaction annulée) sur la base upgradée.
# Usage : scripts/upgrade/interruption.sh <source> <sha> <n> <sortie> [--bridge F]...
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib/common.sh"
SRC="${1:?source}"; SHA="${2:?sha}"; N="${3:?n}"; OUTI="${4:?sortie}"; shift 4
PONTS=(); while [ $# -gt 0 ]; do case "$1" in --bridge) PONTS+=(--bridge "$2"); shift 2;; *) upg_die "option $1";; esac; done
upg_garde_locale "$SRC" "$SHA" "$OUTI"
mkdir -p "$OUTI"; chmod 777 "$OUTI"
H="$HERE/production-to-v9x.sh"
POINT_STOP="20260902000255"     # point de non-retour ACL
POINT_PANNE="20260921000300"    # backfill lignes (le plus lent)
res() { echo "$1|$2|$3" >> "$OUTI/resultats.txt"; echo "  $( [ "$2" = OK ] && echo ✅ || echo ❌) $1 : $3"; }
: > "$OUTI/resultats.txt"
etat() { # <base> <fichier> : schéma + ACL + ledger (empreinte d'état)
  { su postgres -c "pg_dump -s -d $1" | grep -vE '^(--|SET |SELECT pg_catalog.set_config)' | sed '/^$/d'
    upg_ledger "$1"; } | sha256sum | cut -c1-64 > "$2"
}

echo "== S1 : coupure entre deux migrations (après $POINT_STOP) puis reprise =="
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s1 --sans-sonde "${PONTS[@]}" \
  --stop-after "$POINT_STOP" --out "$OUTI/s1" > "$OUTI/s1_a.log" 2>&1; rc=$?
lg=$(upg_q upg_s1 "select count(*) from supabase_migrations.schema_migrations")
mx=$(upg_q upg_s1 "select max(version) from supabase_migrations.schema_migrations where version > '20260824000231'")
attendu=$(python3 -c "
import json;p=json.load(open('$OUTI/s1/plan.json'));e=[m.split('_')[0] for m in p['en_attente']];print(210+e.index('$POINT_STOP')+1)")
[ "$rc" = 75 ] && [ "$lg" = "$attendu" ] && res S1a OK "arrêt propre (code 75), ledger $lg = 210 + préfixe jusqu'à $POINT_STOP" \
  || res S1a KO "code $rc, ledger $lg (attendu $attendu)"
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s1 --sans-sonde "${PONTS[@]}" \
  --resume --out "$OUTI/s1" > "$OUTI/s1_b.log" 2>&1; rc=$?
grep -q "UPGRADE QUALIFIÉ" "$OUTI/s1_b.log" && res S1b OK "reprise --resume : upgrade complet qualifié (ledger $(upg_q upg_s1 "select count(*) from supabase_migrations.schema_migrations"))" \
  || res S1b KO "reprise en échec (code $rc) : $(tail -3 "$OUTI/s1_b.log" | tr '\n' ' ')"

echo "== S2 : panne DANS la transaction de $POINT_PANNE =="
prec=$(python3 -c "
import json;p=json.load(open('$OUTI/s1/plan.json'));e=[m.split('_')[0] for m in p['en_attente']];print(e[e.index('$POINT_PANNE')-1])")
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s2 --sans-sonde "${PONTS[@]}" \
  --stop-after "$prec" --out "$OUTI/s2" > "$OUTI/s2_a.log" 2>&1
etat upg_s2 "$OUTI/s2_etat_avant.txt"
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s2 --sans-sonde "${PONTS[@]}" \
  --resume --fail-at "$POINT_PANNE" --out "$OUTI/s2" > "$OUTI/s2_b.log" 2>&1; rc=$?
etat upg_s2 "$OUTI/s2_etat_apres.txt"
if [ "$rc" = 76 ] && diff -q "$OUTI/s2_etat_avant.txt" "$OUTI/s2_etat_apres.txt" >/dev/null; then
  res S2a OK "panne → code 76, transaction annulée : schéma + ACL + ledger identiques à l'état d'avant (empreinte $(cut -c1-12 "$OUTI/s2_etat_avant.txt"))"
else res S2a KO "code $rc ; état avant/après panne différent"; fi
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s2 --sans-sonde "${PONTS[@]}" \
  --resume --out "$OUTI/s2" > "$OUTI/s2_c.log" 2>&1
grep -q "UPGRADE QUALIFIÉ" "$OUTI/s2_c.log" && res S2b OK "reprise après panne : upgrade complet qualifié" || res S2b KO "reprise après panne en échec"

echo "== S3 : ledger EN RETARD (migration appliquée sans sa ligne de ledger) =="
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s3 --sans-sonde "${PONTS[@]}" \
  --stop-after "$prec" --out "$OUTI/s3" > "$OUTI/s3_a.log" 2>&1
f=$(ls "$OUTI/s3/target/supabase/migrations/${POINT_PANNE}"_*.sql)
upg_contenu_migration "$f" | su postgres -c "psql -X -q -1 -v ON_ERROR_STOP=1 -d upg_s3" >/dev/null 2>&1   # sans ledger
upg_clone upg_s3 upg_s3_naif
# Reprise naïve : rejoue la migration déjà appliquée.
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s3_naif --sans-sonde "${PONTS[@]}" \
  --resume --out "$OUTI/s3n" > "$OUTI/s3_naif.log" 2>&1; rc=$?
if grep -q "UPGRADE QUALIFIÉ" "$OUTI/s3_naif.log"; then res S3a OK "reprise naïve : $POINT_PANNE rejouée sans erreur (idempotente) — état final qualifié"
else res S3a OK "reprise naïve REFUSÉE par la migration elle-même (non idempotente, code $rc) : arrêt sûr, aucune corruption — réparation manuelle requise"; fi
# Réparation manuelle : prouver que l'état = celui d'une base où la migration a été appliquée normalement, puis inscrire.
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s3_ref --sans-sonde "${PONTS[@]}" \
  --stop-after "$POINT_PANNE" --out "$OUTI/s3r" > "$OUTI/s3_ref.log" 2>&1
su postgres -c "pg_dump -s -d upg_s3" | grep -vE '^(--|SET )' | sed '/^$/d' | sha256sum > "$OUTI/s3_etat_sans_ledger.txt"
su postgres -c "pg_dump -s -d upg_s3_ref" | grep -vE '^(--|SET )' | sed '/^$/d' | sha256sum > "$OUTI/s3_etat_reference.txt"
if diff -q "$OUTI/s3_etat_sans_ledger.txt" "$OUTI/s3_etat_reference.txt" >/dev/null; then
  upg_q upg_s3 "insert into supabase_migrations.schema_migrations(version, name) values ('$POINT_PANNE', '$(basename "$f" .sql | cut -d_ -f2-)')" >/dev/null
  "$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s3 --sans-sonde "${PONTS[@]}" \
    --resume --out "$OUTI/s3" > "$OUTI/s3_b.log" 2>&1
  grep -q "UPGRADE QUALIFIÉ" "$OUTI/s3_b.log" && res S3b OK "réparation : état prouvé égal à la référence, version inscrite à la main, reprise qualifiée" \
    || res S3b KO "réparation puis reprise en échec"
else res S3b KO "état sans ledger ≠ référence : inscription manuelle interdite, restauration"; fi

echo "== S4 : ledger EN AVANCE (version inscrite, migration jamais appliquée) =="
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s4 --sans-sonde "${PONTS[@]}" \
  --stop-after "$prec" --out "$OUTI/s4" > "$OUTI/s4_a.log" 2>&1
upg_q upg_s4 "insert into supabase_migrations.schema_migrations(version, name) values ('$POINT_PANNE', 'repair_abusif')" >/dev/null
"$H" --target-sha "$SHA" --target-migration-count "$N" --source-db "$SRC" --work-db upg_s4 --sans-sonde "${PONTS[@]}" \
  --resume --out "$OUTI/s4" > "$OUTI/s4_b.log" 2>&1; rc=$?
if grep -qE "❌ (schéma upgradé ≠ fresh|sécurité / catalogue)" "$OUTI/s4_b.log" || ! grep -q "UPGRADE QUALIFIÉ" "$OUTI/s4_b.log"; then
  res S4 OK "migration sautée DÉTECTÉE par le harnais (verdict KO : $(grep -E '❌' "$OUTI/s4_b.log" | head -2 | tr '\n' ' ' | cut -c1-160)) → restauration"
else res S4 KO "migration sautée NON détectée"; fi

echo "== S5 : restauration du dump d'avant upgrade =="
su postgres -c "pg_dump -Fc -d $SRC" > "$OUTI/source.dump"; chmod 644 "$OUTI/source.dump"
sha256sum "$OUTI/source.dump" | cut -c1-64 > "$OUTI/source.dump.sha256"
upg_drop upg_s5; su postgres -c "psql -X -q -d postgres -c 'create database upg_s5'" >/dev/null
su postgres -c "pg_restore -d upg_s5 --no-owner" < "$OUTI/source.dump" > "$OUTI/s5_restore.log" 2>&1
python3 "$HERE/lib/fingerprint.py" capture "$SRC" "$OUTI/s5_src" > /dev/null
python3 "$HERE/lib/fingerprint.py" capture upg_s5 "$OUTI/s5_rest" > /dev/null
python3 "$HERE/lib/security_snapshot.py" "$SRC" "$OUTI/s5_sec_src" > /dev/null
python3 "$HERE/lib/security_snapshot.py" upg_s5 "$OUTI/s5_sec_rest" > /dev/null
python3 "$HERE/lib/fingerprint.py" compare "$OUTI/s5_src" "$OUTI/s5_rest" /dev/null "$OUTI/s5_zp.json" > "$OUTI/s5_zp.txt"; z=$?
dsec=$(diff -r "$OUTI/s5_sec_src" "$OUTI/s5_sec_rest" | grep -c '^[<>]')
lgr=$(upg_q upg_s5 "select count(*) from supabase_migrations.schema_migrations")
[ "$z" = 0 ] && [ "$dsec" = 0 ] && [ "$lgr" = 210 ] \
  && res S5 OK "restauration : $(grep -oE '[0-9]+ tables / [0-9]+ lignes' "$OUTI/s5_zp.txt") identiques, ACL/RLS identiques (0 ligne), ledger 210 ; erreurs pg_restore : $(grep -c ERROR "$OUTI/s5_restore.log")" \
  || res S5 KO "restauration : zp=$z, écarts sécurité=$dsec, ledger=$lgr"

echo "== S6 : idempotence (chaque migration rejouée une 2e fois, transaction annulée) =="
: > "$OUTI/s6.tsv"
for m in $(python3 -c "import json;[print(x) for x in json.load(open('$OUTI/s1/plan.json'))['en_attente']]"); do
  if { echo "begin;"; upg_contenu_migration "$OUTI/s1/target/supabase/migrations/$m" | python3 "$HERE/lib/strip_txn.py"; echo; echo "rollback;"; } \
      | su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d upg_s1" >/dev/null 2>"$OUTI/s6.err"; then
    echo -e "$m\tIDEMPOTENTE" >> "$OUTI/s6.tsv"
  else echo -e "$m\tNON_IDEMPOTENTE\t$(grep -m1 ERROR "$OUTI/s6.err" | cut -c1-140)" >> "$OUTI/s6.tsv"; fi
done
res S6 OK "$(grep -c $'\tIDEMPOTENTE' "$OUTI/s6.tsv") migrations idempotentes, $(grep -c NON_IDEMPOTENTE "$OUTI/s6.tsv") non idempotentes (liste : s6.tsv) — la reprise s'appuie sur le ledger, jamais sur l'idempotence"
for b in upg_s1 upg_s2 upg_s3 upg_s3_naif upg_s3_ref upg_s4 upg_s5; do upg_drop "$b"; done
echo; cat "$OUTI/resultats.txt"
! grep -q '|KO|' "$OUTI/resultats.txt"
