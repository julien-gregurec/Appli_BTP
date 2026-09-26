#!/usr/bin/env bash
# Qualification — RGPD × immutabilité des factures émises (V1).
# Rapport : docs/qualification/ELSATIA_RGPD_INVOICE_IMMUTABILITY_RECONCILIATION_V1.md
#
# PostgreSQL 16 local + scripts/local-postgres-bootstrap (pas de Docker). Étapes :
#   1. T0      : train canonique SANS 20260923000347 + tenant réaliste → reproduction
#                du blocage (purge en échec sur les factures émises).
#   2. UPGRADE : même base, données comprises, + 20260923000347 → reprise des identités
#                émettrices, schéma identique au fresh, purge (bloquée seulement par
#                les contrats acceptés).
#   3. PROTO   : + prototype non activé (docs/migrations-proposees/) → purge complète.
#   4. DR      : sauvegarde avant purge → purge → restauration de la sauvegarde →
#                rejeu de la purge → même résultat (empreinte d'état identique).
#   5. FRESH   : base neuve avec 20260923000347, suites pgTAP RGPD et factures.
#
# Usage : scripts/qualification/rgpd-invoice-immutability-v1.sh [dossier-de-sortie]
# À lancer en root (bascule sur l'utilisateur postgres via runuser, comme rebuild_db.sh).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
OUT="${1:-$(mktemp -d)}"
mkdir -p "$OUT"
MIG_V1="20260923000347_rgpd_purge_facture_emise_reconciliation.sql"
PROTO="$REPO/docs/migrations-proposees/rgpd-purge-contrats-acceptes-v1.sql.proposed"
PROTO_TEST="$REPO/docs/migrations-proposees/rgpd-purge-contrats-acceptes-v1.pgtap.sql.proposed"
A="a0000000-0000-0000-0000-000000000001"
RUN="c9000000-0000-0000-0000-0000000000d1"

# runuser garde les arguments intacts ; les fichiers passent par l'entrée standard
# (ouverts par l'appelant) : seuls les \ir du dépôt sont lus par postgres.
pg()  { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pga() { runuser -u postgres -- psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
db_new() { # db_new <nom> [template]
  pg -c "drop database if exists \"$1\"" >/dev/null 2>&1
  if [ -n "${2:-}" ]; then pg -c "create database \"$1\" template \"$2\"" >/dev/null
  else pg -c "create database \"$1\"" >/dev/null; fi
  pg -c "alter database \"$1\" set search_path = public, extensions" >/dev/null
}
migrer() { # migrer <db> <exclure-regex>
  local n=0
  for f in "$REPO"/supabase/migrations/*.sql; do
    if [ -n "$2" ] && [[ "$(basename "$f")" =~ $2 ]]; then continue; fi
    sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed) &/I' "$f" \
      | pg -d "$1" >/dev/null 2>"$OUT/migr.err" \
      || { echo "ÉCHEC migration $(basename "$f")"; cat "$OUT/migr.err"; exit 1; }
    n=$((n+1))
  done
  echo "$n"
}

# Charge le tenant réaliste et le COMMITTE (contrairement aux tests pgTAP).
charger_tenant() {
  cat > "$OUT/charger.sql" <<SQL
begin;
\ir $REPO/supabase/tests/fixtures/isolation_multitenant.inc
\ir $REPO/supabase/tests/fixtures/rgpd_tenant_facture_emise.inc
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = '$A';
commit;
SQL
  pg -d "$1" < "$OUT/charger.sql" >/dev/null 2>"$OUT/charger.err" || { echo "ÉCHEC chargement"; cat "$OUT/charger.err"; exit 1; }
}

purger() { # purger <db> → résultat
  cat > "$OUT/purger.sql" <<SQL
begin;
select set_config('rgpd.entreprise_cible', '$A', true);
select set_config('rgpd.run_id', '$RUN', true);
\ir $REPO/supabase/tests/fixtures/rgpd_purge_driver.inc
select 'RESULTAT=' || current_setting('rgpd.resultat');
commit;
SQL
  runuser -u postgres -- psql -X -q -At -d "$1" < "$OUT/purger.sql" 2>/dev/null | grep '^RESULTAT=' | sed 's/RESULTAT=//'
}

# Empreinte d'état du tenant A, indépendante de l'horloge (purge_le, purgee_at,
# updated_at, created_at des lignes d'audit exclus) : factures, comptes par table,
# fiches anonymisées, fichiers Storage.
empreinte_etat() {
  pga -d "$1" <<'SQL' 2>/dev/null
select md5(string_agg(x, '|' order by x)) from (
  select 'f:' || f.id || ':' || public.empreinte_comptable_facture(f.id)
         || ':' || coalesce(f.chantier_id::text, '-') || ':' || coalesce(f.devis_origine_id::text, '-')
         || ':' || coalesce((select string_agg(k || '=' || (v - 'purge_le')::text, ',' order by k)
                             from jsonb_each(f.purge_snapshot) as e(k, v)), '-') as x
    from public.factures f where f.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
  union all
  select 't:' || r.table_nom || ':' || r.categorie || ':' || r.nb_lignes
    from public.rapport_purge_entreprise('a0000000-0000-0000-0000-000000000001') r
  union all
  select 'c:' || (to_jsonb(c) - 'updated_at' - 'created_at')::text from public.clients c
   where c.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
  union all
  select 'e:' || (to_jsonb(e) - 'updated_at' - 'purgee_at' - 'created_at' - 'suppression_prevue_at')::text || ':' || (e.purgee_at is not null)
    from public.entreprises e where e.id = 'a0000000-0000-0000-0000-000000000001'
  union all
  select 's:' || o.bucket_id || '/' || o.name from storage.objects o
   where o.name like 'a0000000-0000-0000-0000-000000000001/%'
) t;
SQL
}

echo "== sortie : $OUT"

echo "== 1. T0 (train sans ${MIG_V1%%_*}) : reproduction"
db_new rgpdq_t0
pg -d rgpdq_t0 -v dbname=rgpdq_t0 < "$BOOT/pg_bootstrap.sql" >/dev/null 2>&1
echo "   migrations appliquées : $(migrer rgpdq_t0 "^${MIG_V1}$")"
charger_tenant rgpdq_t0
db_new rgpdq_t0_data rgpdq_t0         # état T0 + données, avant toute purge
echo "   factures émises sans identité émettrice figée (T0) : $(pga -d rgpdq_t0 -c "select count(*) from factures where entreprise_id = '$A' and statut <> 'brouillon' and entreprise_snapshot is null")"
echo "   purge : $(purger rgpdq_t0)"
pga -d rgpdq_t0 -c "select '   échec ' || table_nom || ' : ' || erreur from platform.purge_audit where not ok and run_id = '$RUN' group by table_nom, erreur order by 1"

echo "== 2. UPGRADE : T0 + données → + ${MIG_V1%%_*}"
db_new rgpdq_up rgpdq_t0_data
sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed) &/I' "$REPO/supabase/migrations/$MIG_V1" \
  | pg -d rgpdq_up >/dev/null 2>&1 && echo "   migration appliquée sur base avec données : OK"
echo "   reprise des identités émettrices : $(pga -d rgpdq_up -c "select count(*) from factures where entreprise_snapshot ->> 'provenance' = 'backfill_identite_actuelle'") facture(s) ; restantes sans snapshot : $(pga -d rgpdq_up -c "select count(*) from factures where statut <> 'brouillon' and entreprise_snapshot is null")"
echo "   compteurs inchangés : factures $(pga -d rgpdq_t0_data -c 'select count(*) from factures') → $(pga -d rgpdq_up -c 'select count(*) from factures'), lignes $(pga -d rgpdq_t0_data -c 'select count(*) from lignes_factures') → $(pga -d rgpdq_up -c 'select count(*) from lignes_factures'), paiements $(pga -d rgpdq_t0_data -c 'select count(*) from paiements') → $(pga -d rgpdq_up -c 'select count(*) from paiements')"
db_new rgpdq_fresh
pg -d rgpdq_fresh -v dbname=rgpdq_fresh < "$BOOT/pg_bootstrap.sql" >/dev/null 2>&1
echo "   fresh : $(migrer rgpdq_fresh '') migrations"
runuser -u postgres -- pg_dump -s -d rgpdq_up    | grep -vE '^\\(un)?restrict ' > "$OUT/schema_upgrade.sql"
runuser -u postgres -- pg_dump -s -d rgpdq_fresh | grep -vE '^\\(un)?restrict ' > "$OUT/schema_fresh.sql"
if diff -q "$OUT/schema_upgrade.sql" "$OUT/schema_fresh.sql" >/dev/null; then
  echo "   schéma upgrade = schéma fresh : IDENTIQUE"
else
  echo "   schéma upgrade ≠ fresh :"; diff "$OUT/schema_upgrade.sql" "$OUT/schema_fresh.sql" | head -20
fi
db_new rgpdq_up_purge rgpdq_up
echo "   purge (sans décision contrats) : $(purger rgpdq_up_purge)"
pga -d rgpdq_up_purge -c "select '   échec ' || table_nom || ' : ' || erreur from platform.purge_audit where not ok and run_id = '$RUN' group by table_nom, erreur order by 1"

echo "== 3. PROTO : + prototype contrats acceptés (non activé dans le dépôt)"
db_new rgpdq_proto rgpdq_up
pg -d rgpdq_proto < "$PROTO" >/dev/null && echo "   prototype appliqué"
AVANT_FACT=$(pga -d rgpdq_proto -c "select md5(string_agg(id || public.empreinte_comptable_facture(id), ',' order by id)) from factures where entreprise_id = '$A'")

echo "== 4. DR : sauvegarde avant purge → purge → restauration → rejeu"
runuser -u postgres -- pg_dump -Fc -d rgpdq_proto > "$OUT/sauvegarde_avant_purge.dump"
echo "   sauvegarde : $(du -h "$OUT/sauvegarde_avant_purge.dump" | cut -f1)"
echo "   purge : $(purger rgpdq_proto)"
APRES_FACT=$(pga -d rgpdq_proto -c "select md5(string_agg(id || public.empreinte_comptable_facture(id), ',' order by id)) from factures where entreprise_id = '$A'")
E1=$(empreinte_etat rgpdq_proto)
echo "   factures : empreinte avant $AVANT_FACT / après $APRES_FACT"
echo "   état après purge : $E1"
db_new rgpdq_restore
runuser -u postgres -- pg_restore -d rgpdq_restore < "$OUT/sauvegarde_avant_purge.dump" 2>"$OUT/restore.err" || true
echo "   restauration : erreurs pg_restore = $(grep -c 'error' "$OUT/restore.err")"
echo "   base restaurée : purgée=$(pga -d rgpdq_restore -c "select purgee_at is not null from entreprises where id = '$A'"), chantiers=$(pga -d rgpdq_restore -c "select count(*) from chantiers where entreprise_id = '$A'"), client=$(pga -d rgpdq_restore -c "select nom from clients where id = 'c1000000-0000-0000-0000-000000000001'"), audit du run=$(pga -d rgpdq_restore -c "select count(*) from platform.purge_audit where run_id = '$RUN'")"
echo "   rejeu de la purge : $(purger rgpdq_restore)"
E2=$(empreinte_etat rgpdq_restore)
echo "   état après rejeu : $E2"
if [ "$E1" = "$E2" ]; then echo "   REJEU = PURGE D'ORIGINE : IDENTIQUE"; else echo "   REJEU ≠ PURGE D'ORIGINE"; fi

echo "== 5. FRESH : pgTAP"
cd "$REPO/supabase/tests"
for t in rgpd_purge_facture_emise_reconciliation_v1 purge_entreprise_architecture_v2 purge_entreprise_supprimee \
         verrouiller_facture_emise factures_relance_auto_exclue_verrou_v1 correctif_isolation_factures \
         correctif_rls_isolation_factures idempotence_paiement_et_avoir gp_pilot_paiement_avoir_idempotence \
         document_partage_public_par_jeton_v1; do
  db_new rgpdq_tap rgpdq_fresh
  o=$(runuser -u postgres -- psql -X -q -At -d rgpdq_tap -f "$PWD/$t.test.sql" 2>&1)
  echo "   $t : $(echo "$o" | grep -oE '^1\.\.[0-9]+' | head -1) ok=$(echo "$o" | grep -cE '^ok ') not_ok=$(echo "$o" | grep -cE '^not ok ')"
done
db_new rgpdq_tap rgpdq_fresh
pg -d rgpdq_tap < "$PROTO" >/dev/null
cd "$REPO/docs/migrations-proposees"
o=$(runuser -u postgres -- psql -X -q -At -d rgpdq_tap -f "$PWD/$(basename "$PROTO_TEST")" 2>&1)
echo "   prototype (non activé) : $(echo "$o" | grep -oE '^1\.\.[0-9]+' | head -1) ok=$(echo "$o" | grep -cE '^ok ') not_ok=$(echo "$o" | grep -cE '^not ok ')"
