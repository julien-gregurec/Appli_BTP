#!/usr/bin/env bash
# ELSATIA PERFORMANCE HARDENING V9.1 — index taches(chantier_id, created_at) : effet isolé.
# Sur une base V9.1 volumétrique SANS l'index (tout se passe dans des transactions annulées) :
#   1. requête de la page chantier (superutilisateur, sans RLS : effet de l'index seul) sans / avec index ;
#   2. même requête sous RLS (rôle authenticated, admin du tenant k) sans / avec index ;
#   3. coût d'écriture : 5 000 insertions de tâches sans / avec index (médiane de 3) ;
#   4. taille de l'index.
# Usage : taches_chantier.sh <base> [k]
set -uo pipefail
DB="${1:?base}"; K="${2:-15}"
E="e0000000-0000-4000-e000-0000000000$K"; U="facc0000-0000-4000-e000-0000000000$K"
q() { su postgres -c "psql -X -q -At -d $DB" ; }
CH=$(echo "select t.chantier_id from taches t join chantiers c on c.id = t.chantier_id where c.entreprise_id = '$E' group by 1 order by count(*) desc limit 1" | q)
SQLP="select id, libelle, description, statut, echeance, devis_id from public.taches where chantier_id = '$CH' order by created_at"
temps() { python3 -c 'import json,sys;t=sys.stdin.read();i=t.find("[");p=json.loads(t[i:])[0];print(round(p["Execution Time"],1), p["Plan"]["Plans"][0]["Node Type"] if p["Plan"].get("Plans") else p["Plan"]["Node Type"])'; }

echo "taches: $(echo 'select count(*) from taches' | q) lignes ; chantier mesuré : $CH ($(echo "select count(*) from taches where chantier_id = '$CH'" | q) tâches)"
for idx in sans avec; do
  creer=""; [ "$idx" = avec ] && creer="create index taches_chantier_created_idx_mesure on public.taches (chantier_id, created_at); analyze public.taches;"
  for i in 1 2 3; do
    echo "begin; $creer explain (analyze, format json) $SQLP; rollback;" | q | temps
  done | sort -n | sed -n 2p | sed "s/^/superutilisateur $idx index : /"
  for i in 1 2 3; do
    echo "begin; $creer set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','$U','role','authenticated')::text, true) \\g /dev/null
explain (analyze, format json) $SQLP; rollback;" | q | temps
  done | sort -n | sed -n 2p | sed "s/^/RLS authenticated $idx index : /"
  for i in 1 2 3; do
    echo "begin; $creer \\timing on
insert into public.taches (chantier_id, libelle) select '$CH', 'Mesure ' || g from generate_series(1, 5000) g;
rollback;" | q | grep -oE 'Time: [0-9.]+' | tail -1 | cut -d' ' -f2
  done | sort -n | sed -n 2p | sed "s/^/5000 insertions $idx index (ms) : /"
done
echo "begin; create index taches_chantier_created_idx_mesure on public.taches (chantier_id, created_at);
select 'taille index : ' || pg_size_pretty(pg_relation_size('public.taches_chantier_created_idx_mesure')) || ' ; table : ' || pg_size_pretty(pg_relation_size('public.taches')); rollback;" | q
