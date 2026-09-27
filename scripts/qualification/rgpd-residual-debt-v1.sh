#!/usr/bin/env bash
# RGPD — dette technique résiduelle V1 (historique des affectations, bon de commande figé).
# Rapport : docs/qualification/ELSATIA_RGPD_PURGE_RESIDUAL_DEBT_CLOSURE_V1.md
#
# Usage : scripts/qualification/rgpd-residual-debt-v1.sh <base-V3+506> [dossier-de-sortie]
#   base-V3+506 : base neuve au train V3 + 20260926000506, SANS 20260927000508
#                 (rebuild_db.sh après avoir écarté 507).
# Étapes :
#   1. T0      : jeu réaliste (fixtures RGPD + seed pilote GP) ; reproduction RD-1 (purge
#                incomplète → historique restant → second passage) et RD-2 (commande envoyée →
#                fiche fournisseur modifiée → le bon imprimé change).
#   2. MATRICE : RD-1 pour chaque combinaison {sans/avec 507} × {déroulé d'origine/nouveau}.
#   3. UPGRADE : T0 + données → + 507 (rattrapage 'reconstituee'), instantanés avant/après,
#                schéma upgrade = schéma fresh.
#   4. PDF     : données réelles avant/après modification des fiches → PDF Chromium, texte extrait.
#   5. DR      : par tenant et politique contrats : sauvegarde → purge (UN passage) → E1 →
#                restauration → rejeu → E2 ; relance sur la même base : rien de plus supprimé.
#   6. pgTAP   : suites ciblées sur la base fresh.
# À lancer en root (bascule sur postgres, authentification pair).
set -uo pipefail
V506="${1:?usage: rgpd-residual-debt-v1.sh <base-V3+506-sans-507> [sortie]}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${2:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT" 2>/dev/null || true
M507="$REPO/supabase/migrations/20260927000508_rgpd_dette_residuelle_historique_affectations_bon_commande.sql"
DRIVER_NOUVEAU="$REPO/supabase/tests/fixtures/rgpd_purge_driver.inc"
# Déroulé d'origine (…506, sans balayage final en cas d'échec), pour la reproduction.
DRIVER_ORIGINE="$OUT/rgpd_purge_driver_origine.inc"
git -C "$REPO" show e64fe252:supabase/tests/fixtures/rgpd_purge_driver.inc > "$DRIVER_ORIGINE"
chmod 644 "$DRIVER_ORIGINE"
A=a0000000-0000-0000-0000-000000000001
FA=d1000000-0000-0000-0000-000000000001

pg()  { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pga() { runuser -u postgres -- psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
db_new() { # db_new <nom> [template]
  pg -c "drop database if exists \"$1\"" >/dev/null 2>&1
  if [ -n "${2:-}" ]; then pg -c "create database \"$1\" template \"$2\"" >/dev/null; else pg -c "create database \"$1\"" >/dev/null; fi
  pg -c "alter database \"$1\" set search_path = public, extensions" >/dev/null
}
db_drop() { pg -c "drop database if exists \"$1\"" >/dev/null 2>&1; }
programmer() { pga -d "$1" -c "update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = '$2'" >/dev/null; }
activer_contrats() { pga -d "$1" -c "select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'QUALIF-RD-V1-DUREE-DE-TEST', interval '10 years', false)" >/dev/null; }
purger() { # purger <db> <entreprise> <run> [driver] → résultat
  { echo "begin;"
    echo "select set_config('rgpd.entreprise_cible', '$2', true);"
    echo "select set_config('rgpd.run_id', '$3', true);"
    cat "${4:-$DRIVER_NOUVEAU}"   # contenu transmis tel quel : le dossier de sortie peut être illisible par postgres
    echo "select 'RESULTAT=' || current_setting('rgpd.resultat');"
    echo "commit;"; } | runuser -u postgres -- psql -X -q -At -d "$1" 2>"$OUT/purge.err" | grep '^RESULTAT=' | sed 's/RESULTAT=//'
}
hist() { pga -d "$1" -c "select count(*) from public.affectations_historique where entreprise_id = '$2'"; }
supprimees() { # lignes réellement supprimées par les étapes DELETE d'un run
  pga -d "$1" -c "select coalesce(string_agg(table_nom || '=' || lignes_affectees, ',' order by table_nom), 'aucune') from platform.purge_audit where run_id = '$2' and etape = 'purge_table' and ok and lignes_affectees > 0"
}
empreinte() { # empreinte <db> <entreprise> : état du tenant, indépendant de l'horloge et des runs
  pga -d "$1" -v e="$2" <<'SQL'
select md5(string_agg(x, '|' order by x)) from (
  select 'f:' || f.id || ':' || public.empreinte_comptable_facture(f.id) as x from public.factures f where f.entreprise_id = :'e'
  union all
  select 'd:' || (to_jsonb(d) - 'updated_at' - 'purge_snapshot')::text
         || ':' || coalesce((select string_agg(k || '=' || (v - 'purge_le')::text, ',' order by k) from jsonb_each(d.purge_snapshot) as e(k, v)), '-')
    from public.depenses_fournisseurs d where d.entreprise_id = :'e'
  union all select 'r:' || to_jsonb(r)::text from public.reglements_fournisseurs r where r.entreprise_id = :'e'
  union all select 'fo:' || (to_jsonb(f) - 'updated_at')::text from public.fournisseurs f where f.entreprise_id = :'e'
  union all select 'c:' || (to_jsonb(c) - 'updated_at' - 'identite_figee_le')::text from public.commandes_fournisseurs c where c.entreprise_id = :'e'
  union all select 'ah:' || count(*) from public.affectations_historique h where h.entreprise_id = :'e'
  union all select 'a:' || count(*) from public.affectations a where a.entreprise_id = :'e'
  union all select 't:' || r.table_nom || ':' || r.categorie || ':' || r.nb_lignes from public.rapport_purge_entreprise(:'e') r
  union all
  select 'e:' || (to_jsonb(x) - 'updated_at' - 'purgee_at' - 'created_at' - 'suppression_prevue_at')::text || ':' || (x.purgee_at is not null)
    from public.entreprises x where x.id = :'e'
  union all select 's:' || o.bucket_id || '/' || o.name from storage.objects o where o.name like :'e' || '/%'
  union all
  select 'p:' || p.type_contrat || ':' || p.source_id || ':' || p.empreinte_document || ':' || p.empreinte_contenu
    from platform.contrats_acceptes_purges p where p.entreprise_id = :'e'
  union all
  select 'po:' || p.commande_id || ':' || p.numero || ':' || p.statut || ':' || p.empreinte_contenu
    from platform.commandes_fournisseurs_purgees p where p.entreprise_id = :'e'
) t;
SQL
}
autres() { # empreinte des autres tenants (historique d'affectations, commandes, factures)
  pga -d "$1" -c "select md5(coalesce(string_agg(x, '|' order by x), '')) from (
     select 'h:' || to_jsonb(h)::text x from public.affectations_historique h where h.entreprise_id <> '$2'
     union all select 'a:' || (to_jsonb(a) - 'updated_at')::text from public.affectations a where a.entreprise_id <> '$2'
     union all select 'c:' || (to_jsonb(c) - 'updated_at')::text from public.commandes_fournisseurs c where c.entreprise_id <> '$2'
     union all select 'f:' || f.id || public.empreinte_comptable_facture(f.id) from public.factures f where f.entreprise_id <> '$2') t"
}
charger_jeu() { # charger_jeu <db> : jeu réaliste (committé)
  { echo "begin;"
    for f in isolation_multitenant rgpd_tenant_facture_emise rgpd_tenant_contrats_acceptes rgpd_tenant_commandes_fournisseurs; do
      echo "\\ir $REPO/supabase/tests/fixtures/$f.inc"
    done
    echo "commit;"; } | pga -d "$1" >/dev/null
  pga -d "$1" -f "$REPO/supabase/production/seed_entreprise_pilote_btp.sql" >/dev/null
  # Historique d'affectations préexistant pour le tenant A (utilisation normale du planning).
  # Le pilote garde son état naturel : 300 affectations, AUCUNE ligne d'historique au départ
  # (table absente du rapport initial, cas exact du constat).
  pga -d "$1" >/dev/null <<SQL
begin;
alter table public.affectations disable trigger notifications_affectations;
insert into public.affectations (id, entreprise_id, chantier_id, employe_id, date, heures, tache) values
  ('a3070000-0000-0000-0000-000000000001', '$A', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', current_date + 1, 7, 'Coffrage'),
  ('a3070000-0000-0000-0000-000000000002', '$A', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', current_date + 1, 7, 'Suivi');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.affectations set heures = 4 where id = 'a3070000-0000-0000-0000-000000000001';
reset role;
alter table public.affectations enable trigger notifications_affectations;
commit;
SQL
}
page_impression() { # la requête de /imprimer/commandes/[id] (fournisseur) sans 507
  pga -d "$1" -c "select c.numero || ' → ' || f.nom || ' / ' || coalesce(f.adresse, '') || ' / ' || coalesce(f.siret, '')
                    from public.commandes_fournisseurs c join public.fournisseurs f on f.id = c.fournisseur_id
                   where c.entreprise_id = '$A' and c.numero = 'CMD-2026-003'"
}

echo "== sortie : $OUT"

# ─── 1. T0 ────────────────────────────────────────────────────────────
echo "== 1. T0 (V3 + 506, sans 507) : reproduction"
db_new rd_t0 "$V506"
echo "   migrations : $(pga -d rd_t0 -c "select count(*) from supabase_migrations.schema_migrations" 2>/dev/null || ls "$REPO"/supabase/migrations/*.sql | grep -vc 000508) ; 507 présente : $(pga -d rd_t0 -c "select exists (select 1 from information_schema.columns where table_name = 'commandes_fournisseurs' and column_name = 'fournisseur_snapshot')")"
charger_jeu rd_t0
# SIRET émetteur connu pour la vérification PDF (fiche du tenant A sans SIRET dans la fixture).
pga -d rd_t0 -c "update public.entreprises set siret = coalesce(siret, '11111111100011') where id = '$A'" >/dev/null
PILOTE=$(pga -d rd_t0 -c "select id from entreprises where reference_interne = 'PILOTE-BTP-V1'")
echo "   jeu : $(pga -d rd_t0 -c "select count(*) || ' affectations, ' || (select count(*) from affectations_historique) || ' lignes d''historique, ' || (select count(*) from commandes_fournisseurs) || ' commandes' from affectations")"
echo "   RD-1 (pilote $PILOTE, politique contrats livrée, déroulé d'origine) :"
db_new rd_t0_r rd_t0; programmer rd_t0_r "$PILOTE"
echo "     historique avant : $(hist rd_t0_r "$PILOTE")"
r=$(purger rd_t0_r "$PILOTE" d9700000-0000-0000-0000-000000000001 "$DRIVER_ORIGINE")
echo "     passage 1 : $r ; historique restant $(hist rd_t0_r "$PILOTE") ; audit : affectations=$(pga -d rd_t0_r -c "select coalesce(string_agg(lignes_affectees::text, ','), '-') from platform.purge_audit where run_id = 'd9700000-0000-0000-0000-000000000001' and table_nom = 'affectations' and ok") ; étape affectations_historique=$(pga -d rd_t0_r -c "select coalesce(string_agg(lignes_affectees::text, ','), 'non exécutée') from platform.purge_audit where run_id = 'd9700000-0000-0000-0000-000000000001' and table_nom = 'affectations_historique'")"
echo "     lignes restantes : $(pga -d rd_t0_r -c "select operation || '=' || count(*) || ' (auteur ' || coalesce(max(auteur_id::text), 'null') || ')' from affectations_historique where entreprise_id = '$PILOTE' group by operation")"
r=$(purger rd_t0_r "$PILOTE" d9700000-0000-0000-0000-000000000002 "$DRIVER_ORIGINE")
echo "     passage 2 : $r ; supprimé : $(supprimees rd_t0_r d9700000-0000-0000-0000-000000000002) ; historique restant $(hist rd_t0_r "$PILOTE")"
db_drop rd_t0_r
echo "   RD-2 (tenant A, CMD-2026-003 reçue) :"
db_new rd_t0_p rd_t0
echo "     bon imprimé : $(page_impression rd_t0_p)"
pga -d rd_t0_p -c "update public.fournisseurs set nom = 'Nouveau Nom SAS', adresse = '99 rue Nouvelle', siret = '99999999900099' where id = '$FA'" >/dev/null
echo "     fiche fournisseur modifiée → bon réimprimé : $(page_impression rd_t0_p)"
db_drop rd_t0_p

# ─── 2. Matrice RD-1 ──────────────────────────────────────────────────
echo "== 2. MATRICE RD-1 (pilote, politique livrée) : historique après UN passage / supprimé au second"
db_new rd_t0_507 rd_t0
sed -E 's/^create extension if not exists pgsodium;?/--/I' "$M507" | pga -d rd_t0_507 >/dev/null 2>&1 || { echo "   507 : ÉCHEC"; exit 1; }
for base in rd_t0 rd_t0_507; do
  for drv in origine nouveau; do
    f="$DRIVER_NOUVEAU"; [ "$drv" = origine ] && f="$DRIVER_ORIGINE"
    db_new rd_m "$base"; programmer rd_m "$PILOTE"
    purger rd_m "$PILOTE" d9710000-0000-0000-0000-000000000001 "$f" >/dev/null
    h=$(hist rd_m "$PILOTE")
    purger rd_m "$PILOTE" d9710000-0000-0000-0000-000000000002 "$f" >/dev/null
    echo "   $( [ "$base" = rd_t0 ] && echo 'sans 507' || echo 'avec 507') × déroulé $drv : historique après passage 1 = $h ; supprimé au passage 2 : $(supprimees rd_m d9710000-0000-0000-0000-000000000002)"
    db_drop rd_m
  done
done
db_drop rd_t0_507

# ─── 3. UPGRADE ───────────────────────────────────────────────────────
echo "== 3. UPGRADE : T0 + données → + 507"
db_new rd_upg rd_t0
python3 "$REPO/scripts/local-postgres-bootstrap/upgrade_snapshot.py" rd_upg "$OUT/avant.json" | sed 's/^/   /'
sed -E 's/^create extension if not exists pgsodium;?/--/I' "$M507" | pga -d rd_upg >"$OUT/upgrade.log" 2>&1 \
  && echo "   migration 507 appliquée sur base avec données : OK ($(grep -c 'WARNING' "$OUT/upgrade.log") warning)" \
  || { echo "   migration 507 : ÉCHEC"; cat "$OUT/upgrade.log"; exit 1; }
python3 "$REPO/scripts/local-postgres-bootstrap/upgrade_snapshot.py" rd_upg "$OUT/apres.json" --colonnes-de "$OUT/avant.json" | sed 's/^/   /'
python3 - "$OUT/avant.json" "$OUT/apres.json" <<'PY' | sed 's/^/   /'
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
rc = [(t, a["row_counts"].get(t), b["row_counts"].get(t)) for t in sorted(set(a["row_counts"]) | set(b["row_counts"]))
      if a["row_counts"].get(t) != b["row_counts"].get(t)]
print("row counts :", len(a["row_counts"]), "→", len(b["row_counts"]), "tables ; écarts :", rc or "0")
ck = [t for t in a["checksums"] if a["checksums"][t] != b["checksums"].get(t)]
print("empreintes métier (colonnes d'avant) :", len(a["checksums"]), "tables ; différentes :", ck or "0")
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
echo "   rattrapage : $(pga -d rd_upg -c "select string_agg(k || '=' || n, ' ; ' order by k) from (select coalesce(identite_provenance, 'aucune (brouillon)') k, count(*) n from commandes_fournisseurs group by 1) t")"
echo "   rattrapage : non brouillon sans identité = $(pga -d rd_upg -c "select count(*) from commandes_fournisseurs where statut <> 'brouillon' and fournisseur_snapshot is null") ; brouillon avec identité = $(pga -d rd_upg -c "select count(*) from commandes_fournisseurs where statut = 'brouillon' and fournisseur_snapshot is not null")"
db_new rd_fresh
runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -v dbname=rd_fresh -d rd_fresh -f "$REPO/scripts/local-postgres-bootstrap/pg_bootstrap.sql" >/dev/null
n=0; for f in "$REPO"/supabase/migrations/*.sql; do n=$((n+1)); sed -E 's/^create extension if not exists pgsodium;?/--/I' "$f" | pga -d rd_fresh >/dev/null 2>"$OUT/fresh.err" || { echo "   fresh : ÉCHEC à $(basename "$f")"; cat "$OUT/fresh.err"; exit 1; }; done
echo "   fresh : $n migrations, 0 erreur"
runuser -u postgres -- pg_dump -s -d rd_upg | grep -v -E '^--|^$|^\\(un)?restrict ' > "$OUT/schema_upg.sql"
runuser -u postgres -- pg_dump -s -d rd_fresh | grep -v -E '^--|^$|^\\(un)?restrict ' > "$OUT/schema_fresh.sql"
if diff -q "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" >/dev/null; then
  echo "   schéma upgrade = schéma fresh : IDENTIQUE ($(wc -l < "$OUT/schema_fresh.sql") lignes, ACL comprises)"
else
  echo "   schéma upgrade ≠ schéma fresh : $(diff "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" | grep -c '^[<>]') ligne(s) (voir $OUT)"
fi
echo "   seed pilote sur base fresh : $(db_new rd_seed rd_fresh; pga -d rd_seed -f "$REPO/supabase/production/seed_entreprise_pilote_btp.sql" >/dev/null 2>"$OUT/seed.err" && echo "OK ($(pga -d rd_seed -c "select string_agg(numero || '=' || statut || '/' || identite_provenance, ' ' order by numero) from commandes_fournisseurs where statut <> 'brouillon'"))" || echo "ÉCHEC : $(head -2 "$OUT/seed.err")"; db_drop rd_seed)"

# ─── 4. PDF ───────────────────────────────────────────────────────────
echo "== 4. PDF du bon de commande (base upgradée, tenant A)"
db_new rd_pdf rd_upg
pga -d rd_pdf >/dev/null <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('rd.cmd', public.creer_commande_fournisseur('$A', '{"fournisseur_id":"$FA"}'::jsonb,
  '[{"designation":"Mortier colle","quantite":8,"unite":"sac","prix_unitaire_ht":11.5,"taux_tva":20,"ordre":1}]'::jsonb)::text, true);
select public.changer_statut_commande('$A', current_setting('rd.cmd')::uuid, 'envoyee');
commit;
SQL
etat_json() { pga -d rd_pdf -c "select json_build_object(
  'commandes', (select json_agg(json_build_object('commande', to_jsonb(c), 'lignes',
      (select coalesce(json_agg(json_build_object('designation', l.designation, 'description', l.description, 'quantite', l.quantite, 'unite', l.unite,
                                                  'prix_unitaire_ht', l.prix_unitaire_ht, 'taux_tva', l.taux_tva) order by l.ordre, l.id), '[]') from lignes_commande l where l.commande_id = c.id),
      'fournisseur', (select json_build_object('nom', f.nom, 'adresse', f.adresse, 'code_postal', f.code_postal, 'ville', f.ville, 'siret', f.siret) from fournisseurs f where f.id = c.fournisseur_id))
    order by c.numero) from commandes_fournisseurs c where c.entreprise_id = '$A' and c.fournisseur_id = '$FA'),
  'entreprise', (select to_jsonb(e) from entreprises e where e.id = '$A'))"; }
echo "   commandes : $(pga -d rd_pdf -c "select string_agg(numero || '=' || statut || '/' || coalesce(identite_provenance, '-'), ' ' order by numero) from commandes_fournisseurs where entreprise_id = '$A' and fournisseur_id = '$FA'")"
ANCIEN_F=$(pga -d rd_pdf -c "select nom from fournisseurs where id = '$FA'"); ANCIEN_S=$(pga -d rd_pdf -c "select siret from entreprises where id = '$A'")
etat_json > "$OUT/pdf_avant.json"
pga -d rd_pdf -c "update public.fournisseurs set nom = 'Nouveau Nom SAS', adresse = '99 rue Nouvelle', code_postal = '68000', ville = 'Autreville', siret = '99999999900099' where id = '$FA'" >/dev/null
pga -d rd_pdf -c "update public.entreprises set siret = '22222222200022', adresse = '2 rue Déménagée' where id = '$A'" >/dev/null
etat_json > "$OUT/pdf_apres.json"
python3 - "$OUT" "$ANCIEN_F" "$ANCIEN_S" <<'PY'
import json, sys
out, af, as_ = sys.argv[1:4]
json.dump({"avant": json.load(open(f"{out}/pdf_avant.json")), "apres": json.load(open(f"{out}/pdf_apres.json")),
           "ancien": {"fournisseur": af, "siret_entreprise": as_}, "nouveau": {"fournisseur": "Nouveau Nom SAS", "siret_entreprise": "22222222200022"},
           "sortie": f"{out}/pdf_resultats.json"}, open(f"{out}/pdf_entree.json", "w"), ensure_ascii=False)
PY
chmod 666 "$OUT/pdf_entree.json" 2>/dev/null
( cd "$REPO" && BON_COMMANDE_PDF_JSON="$OUT/pdf_entree.json" npx vitest run --config scripts/qualification/pdf/vitest.config.ts 2>&1 ) > "$OUT/pdf.log"
echo "   $(grep -E 'Tests +[0-9]' "$OUT/pdf.log" | sed 's/^ *//')"
python3 -c "
import json; r = json.load(open('$OUT/pdf_resultats.json'))
for x in r: print('   ', x['numero'], x['statut'], 'texte PDF identique avant/après' if x['identique'] else 'texte PDF CHANGÉ', x['sha_texte_apres'][:16])
" 2>/dev/null
db_drop rd_pdf

# ─── 5. DR ────────────────────────────────────────────────────────────
echo "== 5. DR : sauvegarde → purge (un passage) → restauration → rejeu (base upgradée)"
scenario() { # scenario <code> <entreprise> <politique: livree|activee>
  local code=$1 ent=$2 pol=$3 base="rd_dr_${1}_${3}" run1 run2 run3
  run1="d9800000-0000-0000-0000-$(printf '%012d' $((RANDOM)))"; run2="d9800000-0000-0000-0000-$(printf '%012d' $((RANDOM + 40000)))"
  run3="d9800000-0000-0000-0000-$(printf '%012d' $((RANDOM + 80000)))"
  echo "   ── $code ($ent) — politique contrats $pol"
  db_new "$base" rd_upg
  [ "$pol" = activee ] && activer_contrats "$base"
  programmer "$base" "$ent"
  echo "      avant : historique $(hist "$base" "$ent") ; commandes $(pga -d "$base" -c "select count(*) || ' (' || count(*) filter (where identite_provenance is not null) || ' identités figées)' from commandes_fournisseurs where entreprise_id = '$ent'")"
  runuser -u postgres -- pg_dump -Fc -d "$base" > "$OUT/$base.dump"
  local a0; a0=$(autres "$base" "$ent")
  local r1; r1=$(purger "$base" "$ent" "$run1")
  local e1; e1=$(empreinte "$base" "$ent")
  echo "      passage unique : $r1 ; historique restant $(hist "$base" "$ent") ; purgée=$(pga -d "$base" -c "select purgee_at is not null from entreprises where id = '$ent'")"
  [ "$a0" = "$(autres "$base" "$ent")" ] && echo "      autres tenants (historique, affectations, commandes, factures) : INCHANGÉS" || echo "      autres tenants : MODIFIÉS"
  local r3; r3=$(purger "$base" "$ent" "$run3")
  echo "      relance sur la même base : $r3 ; supprimé : $(supprimees "$base" "$run3") ; état $([ "$e1" = "$(empreinte "$base" "$ent")" ] && echo INCHANGÉ || echo MODIFIÉ)"
  db_new "${base}_r"
  runuser -u postgres -- pg_restore -d "${base}_r" < "$OUT/$base.dump" 2>"$OUT/restore.err" || true
  pg -c "alter database \"${base}_r\" set search_path = public, extensions" >/dev/null
  echo "      restauration : erreurs pg_restore = $(grep -c -i 'error' "$OUT/restore.err") ; historique $(hist "${base}_r" "$ent") ; audit du run $(pga -d "${base}_r" -c "select count(*) from platform.purge_audit where run_id = '$run1'")"
  local r2; r2=$(purger "${base}_r" "$ent" "$run2")
  local e2; e2=$(empreinte "${base}_r" "$ent")
  echo "      rejeu : $r2 ; historique restant $(hist "${base}_r" "$ent")"
  [ "$e1" = "$e2" ] && echo "      REJEU = PURGE D'ORIGINE : IDENTIQUE ($e1)" || echo "      REJEU ≠ PURGE D'ORIGINE ($e1 / $e2)"
  db_drop "${base}_r"; db_drop "$base"; rm -f "$OUT/$base.dump"
}
for pol in livree activee; do
  scenario A "$A" "$pol"
  scenario PILOTE "$PILOTE" "$pol"
done

# ─── 6. pgTAP ─────────────────────────────────────────────────────────
echo "== 6. pgTAP (base fresh, une copie neuve par suite)"
PGTAP_OUT="$OUT/pgtap" "$HERE/pgtap-run-v3.sh" rd_fresh \
  rgpd_dette_residuelle_v1.test.sql rgpd_purge_commandes_fournisseurs_v1.test.sql cm06_suppression_commande_fournisseur_statut.test.sql \
  gp_reception_commande_stock_transactionnel_v1.test.sql 'rgpd_*.test.sql' 'purge_*.test.sql' 'pl0*.test.sql' \
  isolation_multitenant_comportement.test.sql isolation_multitenant_roles.test.sql gp_v1_numerotation_documents.test.sql \
  actions_nom_propre.test.sql | sed 's/^/   /'
db_drop rd_t0; db_drop rd_upg
