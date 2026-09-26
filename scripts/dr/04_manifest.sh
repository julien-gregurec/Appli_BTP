#!/usr/bin/env bash
# Génère un manifeste de vérification de l'état d'une base : comptages,
# checksum par table, empreintes des contraintes/fonctions/triggers/policies
# RLS. Utilisé AVANT sauvegarde et APRES restauration pour prouver
# l'absence de perte (mission DR EXACT-TIP V2 §3 et §6).
#
# Usage:
#   scripts/dr/04_manifest.sh <fichier-sortie.json>
#
# Variables d'environnement : voir lib/common.sh.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source lib/common.sh

usage() { sed -n '2,11p' "${BASH_SOURCE[0]}"; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then usage; exit 0; fi
OUT="${1:-}"
[[ -n "$OUT" ]] || dr_die "Fichier de sortie requis. Voir --help."

dr_require_local_target

dr_log "Génération du manifeste depuis '$DR_PGDATABASE' vers $OUT"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "{"
  echo "  \"genere_le\": \"$(date -u +%FT%TZ)\","
  echo "  \"base\": \"$DR_PGDATABASE\","

  echo "  \"tables\": {"
  FIRST=1
  # Une ligne par table publique : nom, nombre de lignes, checksum md5
  # agrégé (insensible à l'ordre physique de stockage grâce à ORDER BY).
  while IFS=$'\t' read -r schema table; do
    [[ -z "$table" ]] && continue
    COLS=$(dr_psql -tAc "select string_agg(quote_ident(column_name), ',' order by ordinal_position) from information_schema.columns where table_schema='${schema}' and table_name='${table}'")
    COUNT=$(dr_psql -tAc "select count(*) from ${schema}.\"${table}\"")
    CHECKSUM=$(dr_psql -tAc "select coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), 'EMPTY') from ${schema}.\"${table}\" t" 2>/dev/null || echo "ERROR")
    [[ "$FIRST" == "1" ]] && FIRST=0 || echo ","
    printf '    "%s.%s": {"lignes": %s, "checksum": "%s"}' "$schema" "$table" "$COUNT" "$CHECKSUM"
  done < <(dr_psql -tA -F $'\t' -c "select table_schema, table_name from information_schema.tables where table_schema in ('public','auth','storage') and table_type='BASE TABLE' order by 1,2")
  echo ""
  echo "  },"

  FONCTIONS=$(dr_psql -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
  TRIGGERS=$(dr_psql -tAc "select count(*) from pg_trigger where not tgisinternal")
  POLICIES=$(dr_psql -tAc "select count(*) from pg_policies where schemaname='public'")
  CONTRAINTES=$(dr_psql -tAc "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'")
  RLS_ACTIVEES=$(dr_psql -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity")

  FONCTIONS_HASH=$(dr_psql -tAc "select md5(string_agg(md5(p.proname || '|' || pg_get_functiondef(p.oid)), '' order by p.proname, pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
  TRIGGERS_HASH=$(dr_psql -tAc "select md5(string_agg(md5(tgname || '|' || tgrelid::regclass::text || '|' || pg_get_triggerdef(oid)), '' order by tgrelid::regclass::text, tgname)) from pg_trigger where not tgisinternal")
  POLICIES_HASH=$(dr_psql -tAc "select md5(string_agg(md5(policyname || '|' || tablename || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'')), '' order by tablename, policyname)) from pg_policies where schemaname='public'")

  echo "  \"nombre_fonctions_public\": $FONCTIONS,"
  echo "  \"nombre_triggers\": $TRIGGERS,"
  echo "  \"nombre_policies_rls\": $POLICIES,"
  echo "  \"nombre_contraintes_public\": $CONTRAINTES,"
  echo "  \"nombre_tables_rls_activee\": $RLS_ACTIVEES,"
  echo "  \"checksum_fonctions\": \"$FONCTIONS_HASH\","
  echo "  \"checksum_triggers\": \"$TRIGGERS_HASH\","
  echo "  \"checksum_policies\": \"$POLICIES_HASH\""
  echo "}"
} > "$TMP"

mkdir -p "$(dirname "$OUT")"
mv "$TMP" "$OUT"
trap - EXIT
dr_log "Manifeste écrit: $OUT"
