#!/usr/bin/env bash
# RGPD × commandes fournisseurs engagées — harnais de qualification V1.
# Rapport : docs/qualification/ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1.md
#
# Usage : scripts/qualification/rgpd-purchase-orders-v1.sh <base-V3> [dossier-de-sortie]
#   base-V3 : base neuve au train canonique V3 SANS 20260926000506
#             (scripts/local-postgres-bootstrap/rebuild_db.sh après avoir écarté 506, ou
#             copie d'une base V3 existante).
# Étapes :
#   1. T0      : V3 + jeu réaliste (fixtures RGPD factures/contrats/commandes, seed pilote GP) ;
#                reproduction du blocage et des défauts D1/D2 (politique contrats activée avec
#                une durée de TEST dans la base jetable, pour isoler les commandes).
#   2. UPGRADE : T0 + données → + 506 ; instantanés avant/après (comptes, empreintes métier,
#                RLS, sonde RLS, droits) ; schéma upgrade = schéma fresh (V3 + 506).
#   3. DR      : pour chaque tenant et chaque politique contrats (livrée / activée) :
#                sauvegarde → purge → E1 → restauration dans une base neuve → rejeu → E2.
#   4. pgTAP   : suites ciblées sur la base fresh.
# À lancer en root (bascule sur postgres, authentification pair).
set -uo pipefail
V3="${1:?usage: rgpd-purchase-orders-v1.sh <base-V3-sans-506> [sortie]}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${2:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT" 2>/dev/null || true
M506="$REPO/supabase/migrations/20260926000506_rgpd_purge_commandes_fournisseurs_reconciliation.sql"
A=a0000000-0000-0000-0000-000000000001

pg()  { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pga() { runuser -u postgres -- psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
db_new() { # db_new <nom> [template]
  pg -c "drop database if exists \"$1\"" >/dev/null 2>&1
  if [ -n "${2:-}" ]; then pg -c "create database \"$1\" template \"$2\"" >/dev/null; else pg -c "create database \"$1\"" >/dev/null; fi
  pg -c "alter database \"$1\" set search_path = public, extensions" >/dev/null
}
db_drop() { pg -c "drop database if exists \"$1\"" >/dev/null 2>&1; }
programmer() { pga -d "$1" -c "update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = '$2'" >/dev/null; }
activer_contrats() { pga -d "$1" -c "select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'QUALIF-PO-V1-DUREE-DE-TEST', interval '10 years', false)" >/dev/null; }
purger() { # purger <db> <entreprise> <run> → résultat
  { echo "begin;"
    echo "select set_config('rgpd.entreprise_cible', '$2', true);"
    echo "select set_config('rgpd.run_id', '$3', true);"
    echo "\\ir $REPO/supabase/tests/fixtures/rgpd_purge_driver.inc"
    echo "select 'RESULTAT=' || current_setting('rgpd.resultat');"
    echo "commit;"; } | runuser -u postgres -- psql -X -q -At -d "$1" 2>"$OUT/purge.err" | grep '^RESULTAT=' | sed 's/RESULTAT=//'
}
causes() { pga -d "$1" -c "select coalesce(string_agg(distinct table_nom || ':' || split_part(erreur, ' ', 1), ', '), '-') from platform.purge_audit where not ok and run_id = '$2'"; }
commandes() { # commandes <db> <entreprise> : état des commandes engagées
  pga -d "$1" -c "select coalesce(string_agg(numero || '=' || statut || '/' || montant_ttc || '€/' || (select count(*) from public.lignes_commande l where l.commande_id = c.id) || 'l', ' ' order by numero), 'aucune')
                    from public.commandes_fournisseurs c where c.entreprise_id = '$2' and c.statut <> 'brouillon' and c.statut <> 'annulee'"
}
depenses() { # factures fournisseurs rattachées à une commande : statut / réglé
  pga -d "$1" -c "select coalesce(string_agg(numero_piece || '=' || statut || '/' || montant_regle || '€', ' ' order by numero_piece), 'aucune')
                    from public.depenses_fournisseurs where entreprise_id = '$2' and (commande_id is not null or purge_snapshot ? 'commande_id')"
}
factures() { pga -d "$1" -c "select coalesce(md5(string_agg(id || public.empreinte_comptable_facture(id), ',' order by id)), 'aucune') from public.factures where entreprise_id = '$2'"; }
fournisseurs_cpt() { # empreinte comptable fournisseurs, calculée ici (existe aussi sans 506)
  pga -d "$1" -c "select coalesce(md5(string_agg(d.id || ':' || md5((to_jsonb(d) - 'chantier_id' - 'commande_id' - 'charge_recurrente_id' - 'outil_id' - 'vehicule_id' - 'purge_snapshot' - 'updated_at')::text
                    || coalesce((select jsonb_agg(to_jsonb(r) order by r.date, r.id)::text from public.reglements_fournisseurs r where r.depense_id = d.id), '[]')), ',' order by d.id)), 'aucune')
                    from public.depenses_fournisseurs d where d.entreprise_id = '$2'"
}
# Empreinte d'état du tenant, indépendante de l'horloge et des identifiants de run.
empreinte() { # empreinte <db> <entreprise>
  pga -d "$1" -v e="$2" <<'SQL'
select md5(string_agg(x, '|' order by x)) from (
  select 'f:' || f.id || ':' || public.empreinte_comptable_facture(f.id) as x
    from public.factures f where f.entreprise_id = :'e'
  union all
  select 'd:' || (to_jsonb(d) - 'updated_at' - 'purge_snapshot')::text
         || ':' || coalesce((select string_agg(k || '=' || (v - 'purge_le')::text, ',' order by k)
                             from jsonb_each(d.purge_snapshot) as e(k, v)), '-')
    from public.depenses_fournisseurs d where d.entreprise_id = :'e'
  union all
  select 'r:' || to_jsonb(r)::text from public.reglements_fournisseurs r where r.entreprise_id = :'e'
  union all
  select 'fo:' || (to_jsonb(f) - 'updated_at')::text from public.fournisseurs f where f.entreprise_id = :'e'
  union all
  select 't:' || r.table_nom || ':' || r.categorie || ':' || r.nb_lignes from public.rapport_purge_entreprise(:'e') r
  union all
  select 'e:' || (to_jsonb(x) - 'updated_at' - 'purgee_at' - 'created_at' - 'suppression_prevue_at')::text || ':' || (x.purgee_at is not null)
    from public.entreprises x where x.id = :'e'
  union all
  select 's:' || o.bucket_id || '/' || o.name from storage.objects o where o.name like :'e' || '/%'
  union all
  select 'p:' || p.type_contrat || ':' || p.source_id || ':' || p.empreinte_document || ':' || p.empreinte_contenu
    from platform.contrats_acceptes_purges p where p.entreprise_id = :'e'
  union all
  select 'po:' || p.commande_id || ':' || p.numero || ':' || p.statut || ':' || p.empreinte_document || ':' || p.empreinte_contenu
    from platform.commandes_fournisseurs_purgees p where p.entreprise_id = :'e'
) t;
SQL
}
autres() { # autres <db> <entreprise> : empreinte des commandes/fournisseurs/factures des autres tenants
  pga -d "$1" -c "select md5(coalesce(string_agg(x, '|' order by x), '')) from (
     select 'c:' || (to_jsonb(c) - 'updated_at')::text x from public.commandes_fournisseurs c where c.entreprise_id <> '$2'
     union all select 'l:' || to_jsonb(l)::text from public.lignes_commande l where l.entreprise_id <> '$2'
     union all select 'd:' || (to_jsonb(d) - 'updated_at')::text from public.depenses_fournisseurs d where d.entreprise_id <> '$2'
     union all select 'f:' || f.id || public.empreinte_comptable_facture(f.id) from public.factures f where f.entreprise_id <> '$2') t"
}

charger_jeu() { # charger_jeu <db> : jeu réaliste (committé)
  { echo "begin;"
    for f in isolation_multitenant rgpd_tenant_facture_emise rgpd_tenant_contrats_acceptes rgpd_tenant_commandes_fournisseurs; do
      echo "\\ir $REPO/supabase/tests/fixtures/$f.inc"
    done
    echo "commit;"; } | pga -d "$1" >/dev/null
  pga -d "$1" -f "$REPO/supabase/production/seed_entreprise_pilote_btp.sql" >/dev/null
}

echo "== sortie : $OUT"
PILOTE=""

# ─── 1. T0 ────────────────────────────────────────────────────────────
echo "== 1. T0 (train V3 sans 506) : reproduction"
db_new po_t0 "$V3"
echo "   migrations : $(pga -d po_t0 -c "select count(*) from supabase_migrations.schema_migrations" 2>/dev/null || echo '?') ; 506 présente : $(pga -d po_t0 -c "select to_regclass('platform.commandes_fournisseurs_purgees') is not null")"
charger_jeu po_t0
PILOTE=$(pga -d po_t0 -c "select id from entreprises where reference_interne = 'PILOTE-BTP-V1'")
echo "   jeu : $(pga -d po_t0 -c "select count(*) || ' commandes (' || count(*) filter (where statut not in ('brouillon','annulee')) || ' engagées), ' || (select count(*) from depenses_fournisseurs) || ' factures fournisseurs, ' || (select count(*) from reglements_fournisseurs) || ' règlements' from commandes_fournisseurs")"
for T in "$A" "$PILOTE"; do
  db_new po_t0_repro po_t0; activer_contrats po_t0_repro; programmer po_t0_repro "$T"
  echo "   tenant $T"
  echo "     avant : commandes $(commandes po_t0_repro "$T") ; factures fournisseurs $(depenses po_t0_repro "$T")"
  r=$(purger po_t0_repro "$T" "d9000000-0000-0000-0000-0000000000a1")
  echo "     purge : $r ; causes : $(causes po_t0_repro d9000000-0000-0000-0000-0000000000a1)"
  echo "     après : commandes $(commandes po_t0_repro "$T") ; factures fournisseurs $(depenses po_t0_repro "$T")"
  db_drop po_t0_repro
done
d3=$(pga -d po_t0 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.commandes_fournisseurs set statut = 'brouillon', montant_ttc = 1 where numero = 'CMD-2026-003' and entreprise_id = '$A';
delete from public.commandes_fournisseurs where numero = 'CMD-2026-003' and entreprise_id = '$A';
select 'D3=' || count(*) from public.commandes_fournisseurs where numero = 'CMD-2026-003' and entreprise_id = '$A';
rollback;
SQL
)
echo "   D3 (administrateur du tenant, PostgREST direct) : commande reçue → brouillon puis supprimée ; reste $(echo "$d3" | grep -o 'D3=[0-9]*')"

# ─── 2. UPGRADE ───────────────────────────────────────────────────────
echo "== 2. UPGRADE : T0 + données → + 506"
db_new po_upg po_t0
python3 "$REPO/scripts/local-postgres-bootstrap/upgrade_snapshot.py" po_upg "$OUT/avant.json" | sed 's/^/   /'
sed -E 's/^create extension if not exists pgsodium;?/--/I' "$M506" | pga -d po_upg >"$OUT/upgrade.log" 2>&1 \
  && echo "   migration 506 appliquée sur base avec données : OK ($(grep -c 'WARNING' "$OUT/upgrade.log") warning)" \
  || { echo "   migration 506 : ÉCHEC"; cat "$OUT/upgrade.log"; exit 1; }
python3 "$REPO/scripts/local-postgres-bootstrap/upgrade_snapshot.py" po_upg "$OUT/apres.json" --colonnes-de "$OUT/avant.json" | sed 's/^/   /'
python3 - "$OUT/avant.json" "$OUT/apres.json" <<'PY' | sed 's/^/   /'
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
rc = [(t, a["row_counts"].get(t), b["row_counts"].get(t)) for t in sorted(set(a["row_counts"]) | set(b["row_counts"]))
      if a["row_counts"].get(t) != b["row_counts"].get(t)]
print("row counts :", len(a["row_counts"]), "→", len(b["row_counts"]), "tables ; écarts :", rc or "0")
ck = [t for t in a["checksums"] if a["checksums"][t] != b["checksums"].get(t)]
print("empreintes métier :", len(a["checksums"]), "tables ; différentes :", ck or "0")
print("RLS (tables/flags) :", "identique" if a["rls_tables"] == b["rls_tables"] else "DIFFÉRENT")
pa, pb = set(a["policies"]), set(b["policies"])
print("policies :", len(pa), "→", len(pb), "; supprimées", len(pa - pb), "; ajoutées", len(pb - pa))
print("sonde RLS :", len(a["rls_probe"]), "utilisateurs ;", "0 écart" if a["rls_probe"] == b["rls_probe"] else "ÉCARTS")
ga, gb = set(a["grants"]), set(b["grants"])
print("droits de table : retirés", sorted(ga - gb) or 0, "; ajoutés", sorted(gb - ga) or 0)
fa = {l.rsplit("|", 3)[0]: l for l in a["fonctions"]}; fb = {l.rsplit("|", 3)[0]: l for l in b["fonctions"]}
mod = [k for k in fa if k in fb and fa[k] != fb[k]]
nouv = [fb[k] for k in fb if k not in fa]
print("EXECUTE fonctions existantes modifiés :", mod or 0)
print("fonctions nouvelles :", len(nouv), "; exécutables anon :", sum(l.split("|")[-3] in ("t", "true") for l in nouv),
      "; authenticated :", sum(l.split("|")[-2] in ("t", "true") for l in nouv), "; service_role :", sum(l.split("|")[-1] in ("t", "true") for l in nouv))
PY
db_new po_fresh
runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -v dbname=po_fresh -d po_fresh -f "$REPO/scripts/local-postgres-bootstrap/pg_bootstrap.sql" >/dev/null
n=0; for f in "$REPO"/supabase/migrations/*.sql; do n=$((n+1)); sed -E 's/^create extension if not exists pgsodium;?/--/I' "$f" | pga -d po_fresh >/dev/null 2>"$OUT/fresh.err" || { echo "   fresh : ÉCHEC à $(basename "$f")"; cat "$OUT/fresh.err"; exit 1; }; done
echo "   fresh : $n migrations, 0 erreur"
runuser -u postgres -- pg_dump -s -d po_upg | grep -v -E '^--|^$|^\\(un)?restrict ' > "$OUT/schema_upg.sql"
runuser -u postgres -- pg_dump -s -d po_fresh | grep -v -E '^--|^$|^\\(un)?restrict ' > "$OUT/schema_fresh.sql"
if diff -q "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" >/dev/null; then
  echo "   schéma upgrade = schéma fresh : IDENTIQUE ($(wc -l < "$OUT/schema_fresh.sql") lignes, ACL comprises)"
else
  echo "   schéma upgrade ≠ schéma fresh : $(diff "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" | grep -c '^[<>]') ligne(s) (voir $OUT)"
fi

# ─── 3. DR ────────────────────────────────────────────────────────────
echo "== 3. DR : sauvegarde → purge → restauration → rejeu (base upgradée)"
scenario() { # scenario <code> <entreprise> <politique: livree|activee>
  local code=$1 ent=$2 pol=$3 base="po_dr_${1}_${3}" run1 run2
  run1="d9000000-0000-0000-0000-$(printf '%012d' $((RANDOM)))"; run2="d9000000-0000-0000-0000-$(printf '%012d' $((RANDOM + 40000)))"
  echo "   ── $code ($ent) — politique contrats $pol"
  db_new "$base" po_upg
  [ "$pol" = activee ] && activer_contrats "$base"
  programmer "$base" "$ent"
  echo "      avant : commandes $(commandes "$base" "$ent") ; factures fournisseurs $(depenses "$base" "$ent")"
  runuser -u postgres -- pg_dump -Fc -d "$base" > "$OUT/$base.dump"
  local f0 c0 a0; f0=$(factures "$base" "$ent"); c0=$(fournisseurs_cpt "$base" "$ent"); a0=$(autres "$base" "$ent")
  local r1; r1=$(purger "$base" "$ent" "$run1")
  local e1; e1=$(empreinte "$base" "$ent")
  echo "      purge : $r1 ; causes : $(causes "$base" "$run1")"
  echo "      après : commandes actives $(commandes "$base" "$ent") ; instantanés $(pga -d "$base" -c "select count(*) from platform.commandes_fournisseurs_purgees where entreprise_id = '$ent'") ; factures fournisseurs $(depenses "$base" "$ent") ; purgée=$(pga -d "$base" -c "select purgee_at is not null from entreprises where id = '$ent'")"
  [ "$f0" = "$(factures "$base" "$ent")" ] && echo "      factures clients : INCHANGÉES" || echo "      factures clients : MODIFIÉES"
  [ "$c0" = "$(fournisseurs_cpt "$base" "$ent")" ] && echo "      factures fournisseurs + règlements : INCHANGÉS ($c0)" || echo "      factures fournisseurs + règlements : MODIFIÉS"
  [ "$a0" = "$(autres "$base" "$ent")" ] && echo "      autres tenants : INCHANGÉS" || echo "      autres tenants : MODIFIÉS"
  db_new "${base}_r"
  runuser -u postgres -- pg_restore -d "${base}_r" < "$OUT/$base.dump" 2>"$OUT/restore.err" || true
  pg -c "alter database \"${base}_r\" set search_path = public, extensions" >/dev/null
  echo "      restauration : erreurs pg_restore = $(grep -c -i 'error' "$OUT/restore.err") ; commandes $(commandes "${base}_r" "$ent") ; instantanés $(pga -d "${base}_r" -c "select count(*) from platform.commandes_fournisseurs_purgees where entreprise_id = '$ent'") ; audit du run $(pga -d "${base}_r" -c "select count(*) from platform.purge_audit where run_id = '$run1'")"
  local r2; r2=$(purger "${base}_r" "$ent" "$run2")
  local e2; e2=$(empreinte "${base}_r" "$ent")
  echo "      rejeu : $r2"
  [ "$e1" = "$e2" ] && echo "      REJEU = PURGE D'ORIGINE : IDENTIQUE ($e1)" || echo "      REJEU ≠ PURGE D'ORIGINE ($e1 / $e2)"
  local r3; r3=$(purger "$base" "$ent" "d9000000-0000-0000-0000-00000000fff$((RANDOM % 10))")
  [ "$e1" = "$(empreinte "$base" "$ent")" ] && echo "      relance sur la même base : $r3, état INCHANGÉ" || echo "      relance sur la même base : $r3, état MODIFIÉ"
  db_drop "${base}_r"; db_drop "$base"
}
for pol in livree activee; do
  scenario A "$A" "$pol"
  scenario PILOTE "$PILOTE" "$pol"
done

# ─── 4. pgTAP ─────────────────────────────────────────────────────────
echo "== 4. pgTAP (base fresh, une copie neuve par suite)"
PGTAP_OUT="$OUT/pgtap" "$HERE/pgtap-run-v3.sh" po_fresh \
  rgpd_purge_commandes_fournisseurs_v1.test.sql cm06_suppression_commande_fournisseur_statut.test.sql \
  gp_reception_commande_stock_transactionnel_v1.test.sql 'rgpd_*.test.sql' 'purge_*.test.sql' \
  isolation_multitenant_comportement.test.sql isolation_multitenant_roles.test.sql gp_v1_numerotation_documents.test.sql \
  actions_nom_propre.test.sql | sed 's/^/   /'
db_drop po_t0
