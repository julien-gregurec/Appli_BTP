#!/usr/bin/env bash
# Qualification — RGPD × contrats acceptés (devis, avenants) — V1.
# Rapport : docs/qualification/ELSATIA_RGPD_ACCEPTED_CONTRACTS_RECONCILIATION_V1.md
#
# PostgreSQL 16 local + scripts/local-postgres-bootstrap (pas de Docker). Étapes :
#   1. T0      : train canonique V2 (sans 20260926000401 ni 20260926000402) + tenant
#                réaliste → reproduction du blocage.
#   2. UPGRADE : même base, données comprises, + 401 + 402 → compteurs inchangés, schéma
#                identique au fresh, politique non_decidee, purge arrêtée (DECISION_REQUIRED).
#   3. DR      : pour chaque politique (supprimer_apres_preuve, conserver_contrat_minimise) :
#                sauvegarde avant purge → purge → restauration → rejeu → même état final
#                (données, preuves de contrats, Storage) et même preuve hors base.
#                Variante : sauvegarde prise AVANT la décision → le rejeu s'arrête
#                (échec sûr) → la décision est ré-appliquée → rejeu → même état final.
#   4. FRESH   : suites pgTAP RGPD, factures et devis sur base neuve.
#
# Usage : scripts/qualification/rgpd-accepted-contracts-v1.sh [dossier-de-sortie]
# À lancer en root (bascule sur l'utilisateur postgres via runuser, comme rebuild_db.sh).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
OUT="${1:-$(mktemp -d)}"
mkdir -p "$OUT"
chmod 755 "$OUT" 2>/dev/null || true
MIG_401="20260926000401_rgpd_purge_facture_emise_reconciliation.sql"
MIG_402="20260926000402_rgpd_purge_contrats_acceptes_politique.sql"
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
appliquer() { # appliquer <db> <fichier migration>
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed) &/I' "$2" | pg -d "$1" >/dev/null 2>"$OUT/migr.err" \
    || { echo "ÉCHEC migration $(basename "$2")"; cat "$OUT/migr.err"; exit 1; }
}
migrer() { # migrer <db> <exclure-regex>
  local n=0
  for f in "$REPO"/supabase/migrations/*.sql; do
    if [ -n "$2" ] && [[ "$(basename "$f")" =~ $2 ]]; then continue; fi
    appliquer "$1" "$f"
    n=$((n+1))
  done
  echo "$n"
}

charger_tenant() { # tenant réaliste COMMITTÉ (contrairement aux tests pgTAP)
  cat > "$OUT/charger.sql" <<SQL
begin;
\ir $REPO/supabase/tests/fixtures/isolation_multitenant.inc
\ir $REPO/supabase/tests/fixtures/rgpd_tenant_facture_emise.inc
\ir $REPO/supabase/tests/fixtures/rgpd_tenant_contrats_acceptes.inc
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = '$A';
commit;
SQL
  pg -d "$1" < "$OUT/charger.sql" >/dev/null 2>"$OUT/charger.err" || { echo "ÉCHEC chargement"; cat "$OUT/charger.err"; exit 1; }
}

purger() { # purger <db> → résultat (déroulé SQL de scripts/purger-entreprise.mjs)
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

echecs() { # echecs <db> : échecs consignés du run, dédoublonnés
  pga -d "$1" -c "select '   échec ' || table_nom || ' : ' || left(erreur, 110) from platform.purge_audit where not ok and run_id = '$RUN' group by table_nom, erreur order by 1"
}

# Empreinte d'état du tenant A, indépendante de l'horloge : factures, comptes par table,
# fiches anonymisées, fichiers Storage, preuves de contrats (sans id/run/horodatage).
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
  union all
  select 'p:' || p.type_contrat || ':' || p.source_id || ':' || p.niveau || ':' || p.politique || ':' || p.decision_ref
         || ':' || p.empreinte_document || ':' || p.empreinte_contenu || ':' || coalesce(p.conserver_jusqu_au::text, '-')
    from platform.contrats_acceptes_purges p where p.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
) t;
SQL
}
empreintes_hors_base() { # liste des empreintes de contrats dans la preuve hors base
  pga -d "$1" -c "select md5(coalesce((select string_agg((c ->> 'type') || (c ->> 'id') || (c ->> 'empreinte_document'), ',' order by c ->> 'type', c ->> 'id', c ->> 'empreinte_document') from jsonb_array_elements(public.preuve_purge_entreprise('$A') -> 'contrats_acceptes') c), ''))"
}

echo "== sortie : $OUT"

echo "== 1. T0 (train V2 sans ${MIG_401%%_*} ni ${MIG_402%%_*}) : reproduction"
db_new rgpdc_t0
pg -d rgpdc_t0 -v dbname=rgpdc_t0 < "$BOOT/pg_bootstrap.sql" >/dev/null 2>&1
echo "   migrations appliquées : $(migrer rgpdc_t0 "^(${MIG_401}|${MIG_402})$")"
charger_tenant rgpdc_t0
db_new rgpdc_t0_data rgpdc_t0
echo "   contrats acceptés du tenant A : $(pga -d rgpdc_t0 -c "select (select count(*) from devis where entreprise_id = '$A' and statut = 'accepte') || ' devis, ' || (select count(*) from avenants where entreprise_id = '$A' and statut = 'accepte') || ' avenant(s)'")"
echo "   purge : $(purger rgpdc_t0)"
echecs rgpdc_t0
echo "   pièces jointes du devis accepté restantes après la purge T0 : $(pga -d rgpdc_t0 -c "select count(*) from pieces_jointes_devis where devis_id = 'c3000000-0000-0000-0000-000000000002'") (2 avant)"

echo "== 2. UPGRADE : T0 + données → + ${MIG_401%%_*} + ${MIG_402%%_*}"
db_new rgpdc_up rgpdc_t0_data
appliquer rgpdc_up "$REPO/supabase/migrations/$MIG_401"
appliquer rgpdc_up "$REPO/supabase/migrations/$MIG_402"
echo "   migrations appliquées sur base avec données : OK"
for t in devis lignes_devis avenants lignes_avenants pieces_jointes_devis factures paiements; do
  printf '   %s : %s → %s\n' "$t" "$(pga -d rgpdc_t0_data -c "select count(*) from $t")" "$(pga -d rgpdc_up -c "select count(*) from $t")"
done
echo "   politique après upgrade : $(pga -d rgpdc_up -c 'select politique from platform.purge_politique_contrats')"
db_new rgpdc_fresh
pg -d rgpdc_fresh -v dbname=rgpdc_fresh < "$BOOT/pg_bootstrap.sql" >/dev/null 2>&1
echo "   fresh : $(migrer rgpdc_fresh '') migrations"
runuser -u postgres -- pg_dump -s -d rgpdc_up    | grep -vE '^\\(un)?restrict ' > "$OUT/schema_upgrade.sql"
runuser -u postgres -- pg_dump -s -d rgpdc_fresh | grep -vE '^\\(un)?restrict ' > "$OUT/schema_fresh.sql"
if diff -q "$OUT/schema_upgrade.sql" "$OUT/schema_fresh.sql" >/dev/null; then
  echo "   schéma upgrade = schéma fresh : IDENTIQUE"
else
  echo "   schéma upgrade ≠ fresh :"; diff "$OUT/schema_upgrade.sql" "$OUT/schema_fresh.sql" | head -20
fi
db_new rgpdc_up_purge rgpdc_up
echo "   purge (politique non décidée) : $(purger rgpdc_up_purge)"
echecs rgpdc_up_purge

decider() { # decider <db> <politique>
  case "$2" in
    supprimer_apres_preuve) pga -d "$1" -c "select platform.definir_politique_purge_contrats('supprimer_apres_preuve', 'QUALIF-D')" >/dev/null ;;
    conserver_contrat_minimise) pga -d "$1" -c "select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'QUALIF-C', interval '10 years', true)" >/dev/null ;;
  esac
}

for POL in supprimer_apres_preuve conserver_contrat_minimise; do
  echo "== 3. DR — politique $POL (activée dans cette base de qualification uniquement)"
  db_new rgpdc_dr rgpdc_up
  runuser -u postgres -- pg_dump -Fc -d rgpdc_dr > "$OUT/sauvegarde_avant_decision_$POL.dump"
  decider rgpdc_dr "$POL"
  runuser -u postgres -- pg_dump -Fc -d rgpdc_dr > "$OUT/sauvegarde_avant_purge_$POL.dump"
  echo "   sauvegarde avant purge : $(du -h "$OUT/sauvegarde_avant_purge_$POL.dump" | cut -f1)"
  AVANT_FACT=$(pga -d rgpdc_dr -c "select md5(string_agg(id || public.empreinte_comptable_facture(id), ',' order by id)) from factures where entreprise_id = '$A'")
  echo "   purge : $(purger rgpdc_dr)"
  APRES_FACT=$(pga -d rgpdc_dr -c "select md5(string_agg(id || public.empreinte_comptable_facture(id), ',' order by id)) from factures where entreprise_id = '$A'")
  echo "   factures : empreinte avant $AVANT_FACT / après $APRES_FACT"
  echo "   preuves figées : $(pga -d rgpdc_dr -c "select string_agg(n || ' ' || niveau, ', ') from (select niveau, count(*) n from platform.contrats_acceptes_purges group by niveau) t")"
  E1=$(empreinte_etat rgpdc_dr); H1=$(empreintes_hors_base rgpdc_dr)
  echo "   état après purge : $E1"

  db_new rgpdc_restore
  runuser -u postgres -- pg_restore -d rgpdc_restore < "$OUT/sauvegarde_avant_purge_$POL.dump" 2>"$OUT/restore.err" || true
  pg -c "alter database rgpdc_restore set search_path = public, extensions" >/dev/null
  echo "   restauration : erreurs pg_restore = $(grep -c 'error' "$OUT/restore.err")"
  echo "   base restaurée : purgée=$(pga -d rgpdc_restore -c "select purgee_at is not null from entreprises where id = '$A'"), devis acceptés=$(pga -d rgpdc_restore -c "select count(*) from devis where entreprise_id = '$A' and statut = 'accepte'"), preuves=$(pga -d rgpdc_restore -c 'select count(*) from platform.contrats_acceptes_purges'), politique=$(pga -d rgpdc_restore -c 'select politique from platform.purge_politique_contrats')"
  echo "   rejeu de la purge : $(purger rgpdc_restore)"
  E2=$(empreinte_etat rgpdc_restore); H2=$(empreintes_hors_base rgpdc_restore)
  echo "   état après rejeu : $E2"
  if [ "$E1" = "$E2" ]; then echo "   REJEU = PURGE D'ORIGINE : IDENTIQUE"; else echo "   REJEU ≠ PURGE D'ORIGINE"; fi
  if [ "$H1" = "$H2" ]; then echo "   preuve hors base (empreintes des contrats) : IDENTIQUE"; else echo "   preuve hors base : DIFFÉRENTE"; fi

  db_new rgpdc_restore_ancien
  runuser -u postgres -- pg_restore -d rgpdc_restore_ancien < "$OUT/sauvegarde_avant_decision_$POL.dump" 2>"$OUT/restore.err" || true
  pg -c "alter database rgpdc_restore_ancien set search_path = public, extensions" >/dev/null
  echo "   variante — sauvegarde antérieure à la décision : politique restaurée=$(pga -d rgpdc_restore_ancien -c 'select politique from platform.purge_politique_contrats'), rejeu=$(purger rgpdc_restore_ancien)"
  decider rgpdc_restore_ancien "$POL"
  echo "   décision ré-appliquée, rejeu : $(purger rgpdc_restore_ancien)"
  E3=$(empreinte_etat rgpdc_restore_ancien)
  if [ "$E1" = "$E3" ]; then echo "   REJEU (sauvegarde ancienne) = PURGE D'ORIGINE : IDENTIQUE"; else echo "   REJEU (sauvegarde ancienne) ≠ PURGE D'ORIGINE"; fi
done

echo "== 4. FRESH : pgTAP"
cd "$REPO/supabase/tests"
for t in rgpd_purge_contrats_acceptes_securite_v1 rgpd_purge_contrats_acceptes_conserver_v1 rgpd_purge_contrats_acceptes_supprimer_v1 \
         rgpd_purge_facture_emise_reconciliation_v1 purge_entreprise_architecture_v2 purge_entreprise_supprimee \
         purge_preuve_et_garde_annulation verrouiller_facture_emise correctif_isolation_devis_client \
         gp_pilot_notification_devis_accepte document_partage_public_par_jeton_v1 idempotence_paiement_et_avoir; do
  db_new rgpdc_tap rgpdc_fresh
  o=$(runuser -u postgres -- psql -X -q -At -d rgpdc_tap -f "$PWD/$t.test.sql" 2>&1)
  echo "   $t : $(echo "$o" | grep -oE '^1\.\.[0-9]+' | head -1) ok=$(echo "$o" | grep -cE '^ok ') not_ok=$(echo "$o" | grep -cE '^not ok ')"
done
