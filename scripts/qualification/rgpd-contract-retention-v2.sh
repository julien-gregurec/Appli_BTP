#!/usr/bin/env bash
# RGPD × contrats acceptés — paramétrage de la conservation V2 : fresh, upgrade, sauvegarde →
# purge → échéance → restauration → rejeu, pour plusieurs durées de TEST.
# Rapport : docs/qualification/ELSATIA_RGPD_CONTRACT_RETENTION_PARAMETERIZATION_V2.md
#
# Les durées 1 an / 5 ans / 10 ans et la règle de départ utilisées ici sont des PARAMÈTRES
# TECHNIQUES DE TEST, posés uniquement dans les bases jetables de ce harnais. Ce ne sont pas des
# recommandations juridiques et aucune migration ne les écrit.
#
# Usage : scripts/qualification/rgpd-contract-retention-v2.sh <base-V4-sans-V2> [dossier-de-sortie]
#   base-V4-sans-V2 : base neuve au train canonique V4 (352 migrations), SANS 20260928000100
#                     (rebuild_db.sh sur integration/elsatia-canonical-train-v4).
# Étapes :
#   1. UPGRADE : V4 + jeu réaliste → + 20260928000100 ; compteurs inchangés ; politique livrée
#                non active ; schéma upgrade = schéma fresh (V4 + V2 sur base vide).
#   2. FAIL-CLOSED : purge et échéance refusées avec la politique livrée.
#   3. DR, pour chaque durée de TEST : sauvegarde B0 (avant purge) → paramètres de TEST → purge →
#      E1 → sauvegarde B1 → échéance (suppression des instantanés échus + fichiers) → E2 → rejeu
#      (rien) → restauration B1 → échéance → E2' ; restauration B0 → purge → échéance → E2'' ;
#      rejeu de l'échéance sous un autre fuseau de session ; sauvegarde antérieure aux paramètres.
# À lancer en root (bascule sur postgres, authentification pair).
set -uo pipefail
V4="${1:?usage: rgpd-contract-retention-v2.sh <base-V4-sans-V2> [sortie]}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${2:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT" 2>/dev/null || true
MV2="$REPO/supabase/migrations/20260928000100_rgpd_conservation_contrats_parametrage_v2.sql"
DRIVER="$REPO/supabase/tests/fixtures/rgpd_purge_driver.inc"
A=a0000000-0000-0000-0000-000000000001

pg()  { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pga() { runuser -u postgres -- psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
db_new() { # db_new <nom> [template]
  pg -c "drop database if exists \"$1\"" >/dev/null 2>&1
  if [ -n "${2:-}" ]; then pg -c "create database \"$1\" template \"$2\"" >/dev/null; else pg -c "create database \"$1\"" >/dev/null; fi
  pg -c "alter database \"$1\" set search_path = public, extensions" >/dev/null
}
db_drop() { pg -c "drop database if exists \"$1\"" >/dev/null 2>&1; }
sauver()   { runuser -u postgres -- pg_dump -Fc -d "$1" > "$2"; }
restaurer() { # restaurer <dump> <db> → nombre d'erreurs pg_restore
  db_new "$2"
  runuser -u postgres -- pg_restore -d "$2" < "$1" 2>"$OUT/restore.err" || true
  pg -c "alter database \"$2\" set search_path = public, extensions" >/dev/null
  grep -c 'error' "$OUT/restore.err"
}
purger() { # purger <db> <run> → complete | incomplete:…
  { echo "begin;"
    echo "select set_config('rgpd.entreprise_cible', '$A', true);"
    echo "select set_config('rgpd.run_id', '$2', true);"
    cat "$DRIVER"
    echo "select 'RESULTAT=' || current_setting('rgpd.resultat');"
    echo "commit;"; } | runuser -u postgres -- psql -X -q -At -d "$1" 2>"$OUT/purge.err" | grep '^RESULTAT=' | sed 's/RESULTAT=//'
}
parametrer_test() { # parametrer_test <db> <durée de TEST>
  pga -d "$1" -c "select platform.definir_politique_purge_contrats('conserver_contrat_minimise',
                    'QUALIF-V2-PARAMETRES-DE-TEST-$2', interval '$2', true, array['fin_chantier'], 'date_contrat')" >/dev/null
}
echeance() { # echeance <db> [fuseau] → chemins Storage rendus (triés) ; supprime ces fichiers comme le ferait l'API Storage
  local tz="${2:-UTC}"
  pga -d "$1" >"$OUT/echeance.out" 2>"$OUT/echeance.err" <<SQL
begin;
set local timezone = '$tz';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table _lot on commit drop as select * from public.purger_contrats_conserves_echus();
reset role;
delete from storage.objects o using _lot l where o.name = any(l.chemins_storage);
select 'LOT=' || count(*) || ':' || coalesce(string_agg(array_to_string(chemins_storage, ','), ';' order by type_contrat, source_id), '') from _lot;
commit;
SQL
  grep '^LOT=' "$OUT/echeance.out" | sed 's/^LOT=//' || true
  if grep -q ERROR "$OUT/echeance.err"; then echo "ERREUR:$(grep -m1 -o 'DECISION_REQUIRED:[A-Z-]*' "$OUT/echeance.err" || head -1 "$OUT/echeance.err")"; fi
}
empreinte() { # état du tenant A, indépendant des identifiants techniques de run et de l'horloge d'exécution
  pga -d "$1" -v e="$A" <<'SQL'
select md5(string_agg(x, '|' order by x)) from (
  select 'f:' || f.id || ':' || public.empreinte_comptable_facture(f.id) as x from public.factures f where f.entreprise_id = :'e'
  union all select 't:' || r.table_nom || ':' || r.categorie || ':' || r.nb_lignes from public.rapport_purge_entreprise(:'e') r
  union all select 'e:' || (x.purgee_at is not null) from public.entreprises x where x.id = :'e'
  union all select 's:' || o.bucket_id || '/' || o.name from storage.objects o where o.name like :'e' || '/%'
  union all
  select 'p:' || p.type_contrat || ':' || p.source_id || ':' || p.niveau || ':' || p.empreinte_document || ':' || p.empreinte_contenu
         || ':' || p.date_depart_conservation || ':' || array_to_string(p.regles_depart_appliquees, '+') || ':' || p.duree_conservation
         || ':' || p.dernier_jour_conserve || ':' || to_char(p.conserver_jusqu_au at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || ':' || p.inclure_photos
    from platform.contrats_acceptes_purges p where p.entreprise_id = :'e'
  union all
  select 'a:' || count(*) || ':' || coalesce(string_agg(detail ->> 'source_id', ',' order by detail ->> 'source_id'), '')
    from platform.purge_audit where entreprise_id = :'e' and etape = 'echeance_contrat_conserve' and ok
) t;
SQL
}
instantanes() { pga -d "$1" -c "select count(*) || ' (' || coalesce(string_agg(type_contrat || ' départ ' || date_depart_conservation || ' [' || array_to_string(regles_depart_appliquees, '+') || '] dernier jour ' || dernier_jour_conserve, ' ; ' order by type_contrat, date_depart_conservation), '') || ')' from platform.contrats_acceptes_purges where entreprise_id = '$A'"; }
compare() { if [ "$2" = "$3" ]; then echo "   $1 : IDENTIQUE"; else echo "   $1 : DIFFÉRENT ($2 ≠ $3)"; ECARTS=$((ECARTS+1)); fi; }
ECARTS=0

echo "== sortie : $OUT"
# ─── 1. UPGRADE ────────────────────────────────────────────────────────
echo "== 1. UPGRADE : V4 + jeu réaliste → + 20260928000100"
db_new ret2_up "$V4"
echo "   migrations V4 : $(ls "$REPO"/supabase/migrations/*.sql | grep -vc 20260928000100) ; V2 présente : $(pga -d ret2_up -c "select exists (select 1 from information_schema.columns where table_schema = 'platform' and table_name = 'purge_politique_contrats' and column_name = 'regles_depart')")"
{ echo "begin;"
  for f in isolation_multitenant rgpd_tenant_facture_emise rgpd_tenant_contrats_acceptes rgpd_tenant_commandes_fournisseurs; do
    echo "\\ir $REPO/supabase/tests/fixtures/$f.inc"
  done
  # Données de TEST pour le point de départ : chantier c2…01 (2 devis + avenant) terminé il y a
  # 400 jours ; chantier a4…01 (1 devis) en cours → repli sur la date du contrat.
  echo "update public.chantiers set date_fin_reelle = current_date - 400 where id = 'c2000000-0000-0000-0000-000000000001';"
  echo "commit;"; } | pga -d ret2_up >/dev/null
COMPTES="select string_agg(t || '=' || n, ' ' order by t) from (select 'devis' t, count(*) n from devis union all select 'lignes_devis', count(*) from lignes_devis union all select 'avenants', count(*) from avenants union all select 'factures', count(*) from factures union all select 'paiements', count(*) from paiements union all select 'pieces_jointes_devis', count(*) from pieces_jointes_devis) x"
AVANT=$(pga -d ret2_up -c "$COMPTES")
pg -d ret2_up < "$MV2" >/dev/null 2>"$OUT/upgrade.err"
echo "   migration appliquée sur base avec données : erreurs=$(grep -c ERROR "$OUT/upgrade.err")"
APRES=$(pga -d ret2_up -c "$COMPTES")
compare "compteurs avant/après upgrade" "$AVANT" "$APRES"
echo "   état livré après upgrade : $(pga -d ret2_up -c "select platform.etat_politique_contrats() || ' ; manquants=' || array_to_string(platform.parametres_conservation_manquants(), ',')")"
db_new ret2_fresh "$V4"
pg -d ret2_fresh < "$MV2" >/dev/null 2>&1
runuser -u postgres -- pg_dump -s -d ret2_up    | grep -vE '^\\(un)?restrict ' > "$OUT/schema_upgrade.sql"
runuser -u postgres -- pg_dump -s -d ret2_fresh | grep -vE '^\\(un)?restrict ' > "$OUT/schema_fresh.sql"
if diff -q "$OUT/schema_upgrade.sql" "$OUT/schema_fresh.sql" >/dev/null; then echo "   schéma upgrade = schéma fresh : IDENTIQUE"; else echo "   schéma upgrade ≠ fresh"; ECARTS=$((ECARTS+1)); diff "$OUT/schema_upgrade.sql" "$OUT/schema_fresh.sql" | head -10; fi
db_drop ret2_fresh
pga -d ret2_up -c "update public.entreprises set suppression_prevue_at = now() - interval '1 second', suppression_demandee_at = now() - interval '31 days' where id = '$A'" >/dev/null

# ─── 2. FAIL-CLOSED ────────────────────────────────────────────────────
echo "== 2. FAIL-CLOSED (politique livrée, aucun paramètre validé)"
db_new ret2_fc ret2_up
echo "   purge : $(purger ret2_fc e2000000-0000-0000-0000-000000000001)"
echo "   causes : $(pga -d ret2_fc -c "select string_agg(distinct detail ->> 'decision_requise' || ' [' || (detail -> 'parametres_manquants')::text || ']', ', ') from platform.purge_audit where run_id = 'e2000000-0000-0000-0000-000000000001' and not ok")"
echo "   contrats acceptés restants : $(pga -d ret2_fc -c "select (select count(*) from devis where entreprise_id = '$A' and statut = 'accepte') + (select count(*) from avenants where entreprise_id = '$A' and statut = 'accepte')") ; instantanés : $(pga -d ret2_fc -c 'select count(*) from platform.contrats_acceptes_purges')"
echo "   échéance : $(echeance ret2_fc)"
db_drop ret2_fc

# ─── 3. DR par durée de TEST ───────────────────────────────────────────
for DUREE in "1 year" "5 years" "10 years"; do
  K=${DUREE// /_}
  echo "== 3. DR — durée de TEST $DUREE (règle de TEST fin_chantier, repli date_contrat, photos conservées)"
  db_new ret2_dr ret2_up
  sauver ret2_dr "$OUT/B0_avant_parametres_$K.dump"
  parametrer_test ret2_dr "$DUREE"
  sauver ret2_dr "$OUT/B0_avant_purge_$K.dump"
  echo "   purge : $(purger ret2_dr e2000000-0000-0000-0000-000000000002)"
  echo "   instantanés : $(instantanes ret2_dr)"
  E1=$(empreinte ret2_dr); echo "   E1 (après purge) : $E1"
  sauver ret2_dr "$OUT/B1_apres_purge_$K.dump"
  L1=$(echeance ret2_dr); E2=$(empreinte ret2_dr)
  echo "   échéance : lot $L1"
  echo "   E2 (après échéance) : $E2 ; instantanés restants : $(pga -d ret2_dr -c "select count(*) from platform.contrats_acceptes_purges where entreprise_id = '$A'")"
  compare "rejeu immédiat de l'échéance (lot)" "$(echeance ret2_dr)" "0:"
  compare "rejeu immédiat de l'échéance (état)" "$(empreinte ret2_dr)" "$E2"

  echo "   restauration B1 (après purge) : erreurs pg_restore = $(restaurer "$OUT/B1_apres_purge_$K.dump" ret2_r1)"
  compare "état restauré = E1" "$(empreinte ret2_r1)" "$E1"
  compare "échéance rejouée (lot)" "$(echeance ret2_r1)" "$L1"
  compare "échéance rejouée (état) = E2" "$(empreinte ret2_r1)" "$E2"

  echo "   restauration B1, rejeu sous le fuseau Pacific/Kiritimati : erreurs pg_restore = $(restaurer "$OUT/B1_apres_purge_$K.dump" ret2_r2)"
  compare "échéance (Kiritimati) lot" "$(echeance ret2_r2 Pacific/Kiritimati)" "$L1"
  compare "échéance (Kiritimati) état = E2" "$(empreinte ret2_r2)" "$E2"

  echo "   restauration B0 (avant purge) : erreurs pg_restore = $(restaurer "$OUT/B0_avant_purge_$K.dump" ret2_r3)"
  echo "   rejeu de la purge : $(purger ret2_r3 e2000000-0000-0000-0000-000000000003)"
  compare "purge rejouée = E1" "$(empreinte ret2_r3)" "$E1"
  compare "échéance après purge rejouée (lot)" "$(echeance ret2_r3)" "$L1"
  compare "chaîne complète rejouée = E2" "$(empreinte ret2_r3)" "$E2"

  echo "   restauration d'une sauvegarde ANTÉRIEURE aux paramètres : erreurs pg_restore = $(restaurer "$OUT/B0_avant_parametres_$K.dump" ret2_r4)"
  echo "     état restauré : $(pga -d ret2_r4 -c 'select platform.etat_politique_contrats()') ; purge : $(purger ret2_r4 e2000000-0000-0000-0000-000000000004) ; échéance : $(echeance ret2_r4)"
  parametrer_test ret2_r4 "$DUREE"
  echo "     paramètres de TEST ré-appliqués ; purge : $(purger ret2_r4 e2000000-0000-0000-0000-000000000004)"
  compare "échéance (sauvegarde ancienne) lot" "$(echeance ret2_r4)" "$L1"
  compare "chaîne rejouée depuis la sauvegarde ancienne = E2" "$(empreinte ret2_r4)" "$E2"
  for d in ret2_dr ret2_r1 ret2_r2 ret2_r3 ret2_r4; do db_drop "$d"; done
done
db_drop ret2_up
echo "== ÉCARTS : $ECARTS"
