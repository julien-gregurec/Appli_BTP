#!/usr/bin/env bash
# Train canonique V9 — preuve du ledger de migrations (rapport V9 §5).
#   1. aucune migration historique V8 modifiée, renommée ni supprimée (partagé + Studio dédié) ;
#   2. les 371 premières versions V9 = les 371 versions V8 (préfixe strict, même ordre) ;
#   3. versions uniques, ordre lexical = ordre d'application, aucune version V9 ≤ dernière V8 ;
#   4. ledger simulé façon Supabase (supabase_migrations.schema_migrations) sur une base au train V8 :
#      les versions en attente sont exactement les 13 versions V9, toutes postérieures au ledger
#      (`supabase db push` les applique sans --include-all), puis ledger V9 complet = fichiers V9.
# Usage : scripts/qualification/v9/ledger-check.sh [ref-v8] [base-v8-jetable]
set -uo pipefail
REF_V8="${1:-53b4bc76b1096acbd8a8a8dd7340b1a577f99307}"
DB="${2:-ledger_v9_check}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DERNIERE_V8="20260928000812"
ok=0; ko=0
verifier() { if [ "$1" = 0 ]; then echo "  ✅ $2"; ok=$((ok+1)); else echo "  ❌ $2"; ko=$((ko+1)); fi; }

modifs=$(git -C "$REPO" diff --name-status "$REF_V8" HEAD -- supabase/migrations apps/studio/supabase/migrations | grep -vc '^A')
verifier "$modifs" "aucune migration V8 modifiée / renommée / supprimée ($(git -C "$REPO" diff --name-status "$REF_V8" HEAD -- supabase/migrations apps/studio/supabase/migrations | grep -c '^A') ajout(s))"
v8=$(git -C "$REPO" ls-tree --name-only "$REF_V8" supabase/migrations/ | xargs -n1 basename | cut -d_ -f1)
v9=$(ls "$REPO"/supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1)
n8=$(echo "$v8" | wc -l); n9=$(echo "$v9" | wc -l)
[ "$(echo "$v9" | head -n "$n8")" = "$v8" ]; verifier $? "préfixe strict : les $n8 premières versions V9 sont les versions V8, dans le même ordre"
[ "$(echo "$v9" | sort -u | wc -l)" = "$n9" ]; verifier $? "$n9 versions uniques (aucun doublon)"
echo "$v9" | sort -c 2>/dev/null; verifier $? "ordre lexical = ordre d'application"
[ "$(echo "$v9" | tail -n +"$((n8+1))" | awk -v d="$DERNIERE_V8" '$0 <= d' | wc -l)" = 0 ]; verifier $? "$((n9-n8)) versions V9, toutes > $DERNIERE_V8 (dernière V8)"

su postgres -c "psql -X -q -c 'drop database if exists $DB' -c 'create database $DB'" >/dev/null
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB" <<SQL >/dev/null
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, name text);
insert into supabase_migrations.schema_migrations (version) values $(echo "$v8" | sed "s/.*/('&')/" | paste -sd,);
create temp table fichiers (version text);
insert into fichiers values $(echo "$v9" | sed "s/.*/('&')/" | paste -sd,);
create table attente as select version from fichiers except select version from supabase_migrations.schema_migrations;
SQL
q() { su postgres -c "psql -X -q -At -d $DB -c \"$1\""; }
[ "$(q "select count(*) from attente")" = "$((n9-n8))" ]; verifier $? "ledger V8 simulé : $(q "select count(*) from attente") version(s) en attente = les versions V9"
[ "$(q "select count(*) from attente where version <= (select max(version) from supabase_migrations.schema_migrations)")" = 0 ]; verifier $? "toutes postérieures au ledger : db push sans --include-all"
[ "$(q "select count(*) from supabase_migrations.schema_migrations where version not in ($(echo "$v9" | sed "s/.*/'&'/" | paste -sd,))")" = 0 ]; verifier $? "aucune version du ledger V8 absente des fichiers V9 (aucun trou)"
q "insert into supabase_migrations.schema_migrations (version) select version from attente" >/dev/null
[ "$(q "select count(*) from supabase_migrations.schema_migrations")" = "$n9" ]; verifier $? "ledger après push = $n9 = fichiers V9"
su postgres -c "psql -X -q -c 'drop database if exists $DB'" >/dev/null
echo "Ledger : $ok/$((ok+ko)) contrôles"
[ "$ko" = 0 ]
