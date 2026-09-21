#!/bin/bash
# Banc de concurrence Pointages — 40 sessions PostgreSQL réellement
# concurrentes (pas une boucle séquentielle), mélange représentatif :
# arrivées, départs, lectures, validations manager, rejets manager,
# retry/double-clic, conflit direct sur un même pointage, isolation
# multi-tenant.
#
# Contexte : docs/qualification/ELSATIA_GP_PLANNING_POINTAGE_CONCURRENCY_V1.md
# (§ CONCURRENCY, "Pointages — banc mixte 40 sessions réelles").
#
# Prérequis :
#   - Une base PostgreSQL jetable avec les migrations de ce dépôt appliquées
#     et la fixture scripts/perf/generate_fixture.sql rejouée (pour disposer
#     de 2 tenants, salariés, chantiers, pointages en attente de validation).
#   - Rôles anon/authenticated/service_role et fonctions auth.uid()/auth.role()
#     lisant les GUC request.jwt.claim.* (voir le rapport de qualification
#     pour la reconstruction d'un socle Postgres natif si aucun projet
#     Supabase de test n'est disponible).
#   - psql, bc, jq ne sont PAS requis (awk/psql suffisent).
#
# Usage :
#   PGDATABASE=ma_base_jetable ./scripts/perf/bench_pointages_concurrency_40.sh
#
# Le script interroge la base pour choisir dynamiquement ses salariés/
# pointages/chantiers (aucun UUID en dur) : reproductible sur n'importe quelle
# base construite à partir de la fixture Performance de ce dépôt.
set -u
DB="${PGDATABASE:-gp_test}"
PSQL="psql -d $DB -v ON_ERROR_STOP=0 -X -q"

psql_as() {
  # $1 = uuid utilisateur ; le SQL de la session est lu sur stdin.
  $PSQL <<SQL
set role authenticated;
set request.jwt.claim.sub = '$1';
set request.jwt.claim.role = 'authenticated';
$(cat)
SQL
}

sql1() { psql -d "$DB" -t -A -c "$1" | grep -v '^INSERT\|^UPDATE\|^DELETE'; }

TENANT_A=$(sql1 "select id from public.entreprises order by created_at limit 1;")
TENANT_B=$(sql1 "select id from public.entreprises where id <> '$TENANT_A' order by created_at limit 1;")
if [ -z "$TENANT_A" ] || [ -z "$TENANT_B" ]; then
  echo "Deux tenants introuvables — la fixture Performance (scripts/perf/generate_fixture.sql) doit être rejouée d'abord." >&2
  exit 1
fi
CH_A=$(sql1 "select id from public.chantiers where entreprise_id='$TENANT_A' limit 1;")
CH_B=$(sql1 "select id from public.chantiers where entreprise_id='$TENANT_B' limit 1;")

OUTDIR="${BENCH_OUTDIR:-/tmp/bench_pointages_40}"
rm -rf "$OUTDIR"; mkdir -p "$OUTDIR"

# Ferme toute session déjà ouverte du tenant A pour repartir d'un état propre
# (équivalent d'un "début de journée", aucune donnée métier réelle affectée
# sur une base jetable).
psql -d "$DB" -c "delete from public.sessions_pointage where entreprise_id='$TENANT_A' and depart_at is null;" >/dev/null

sql1 "select utilisateur_id||','||id from public.employes where entreprise_id='$TENANT_A' and utilisateur_id is not null and statut='actif' order by id;" > "$OUTDIR/pool.txt"
NB_POOL=$(wc -l < "$OUTDIR/pool.txt")
if [ "$NB_POOL" -lt 18 ]; then
  echo "Seulement $NB_POOL salariés avec compte actif tenant A trouvés (18 minimum requis par ce banc)." >&2
  echo "Voir le rapport de qualification, § OPEN RISKS, sur la limite de comptes de la fixture partagée." >&2
  exit 1
fi
# S'assure que l'auto-saisie de pointage est activée pour tout le pool utilisé
# (garde-fou métier distinct de la concurrence — voir peut_pointer_pour_employe()).
psql -d "$DB" -c "update public.utilisateurs_entreprises set pointage_personnel_actif=true where entreprise_id in ('$TENANT_A','$TENANT_B');" >/dev/null

sed -n '1,11p'  "$OUTDIR/pool.txt" > "$OUTDIR/grp_arrivee.txt"
sed -n '12p'    "$OUTDIR/pool.txt" > "$OUTDIR/grp_doubleclic.txt"
sed -n '13,18p' "$OUTDIR/pool.txt" > "$OUTDIR/grp_depart.txt"

# Pré-ouvre 6 sessions (arrivée il y a 8h, durée valide pour la clôture).
> "$OUTDIR/depart_sessions.txt"
while IFS=, read -r uid empid; do
  sessid=$(sql1 "insert into public.sessions_pointage (id, entreprise_id, employe_id, chantier_id, arrivee_at, tache) values (gen_random_uuid(),'$TENANT_A','$empid','$CH_A', now() - interval '8 hours', 'pre-ouverte banc40') returning id;")
  echo "$uid,$sessid" >> "$OUTDIR/depart_sessions.txt"
done < "$OUTDIR/grp_depart.txt"

sql1 "select id from public.pointages where entreprise_id='$TENANT_A' and verification_statut in ('sans_preuve','a_verifier') order by id limit 11;" > "$OUTDIR/pointages_pool.txt"
mapfile -t POINTAGES < "$OUTDIR/pointages_pool.txt"
if [ "${#POINTAGES[@]}" -lt 9 ]; then
  echo "Pas assez de pointages en attente de validation pour ce banc." >&2
  exit 1
fi

MANAGER1=$(sql1 "select utilisateur_id from public.utilisateurs_entreprises where entreprise_id='$TENANT_A' limit 1;")
MANAGER2=$(sql1 "select utilisateur_id from public.utilisateurs_entreprises where entreprise_id='$TENANT_A' order by utilisateur_id desc limit 1;")
UID_B1=$(sql1 "select utilisateur_id from public.utilisateurs_entreprises where entreprise_id='$TENANT_B' limit 1;")
EMP_B1=$(sql1 "select id from public.employes where entreprise_id='$TENANT_B' and utilisateur_id='$UID_B1' limit 1;")
UID_B2=$(sql1 "select utilisateur_id from public.utilisateurs_entreprises where entreprise_id='$TENANT_B' order by utilisateur_id desc limit 1;")

N=0
run() {
  N=$((N+1))
  local label=$1 uid=$2 sql=$3
  psql_as "$uid" > "$OUTDIR/${N}_${label}.txt" 2>&1 <<SQL &
$sql
SQL
}

START=$(date +%s.%N)

# 1-11 : arrivées fraîches, 11 salariés distincts.
i=0
while IFS=, read -r uid empid; do
  i=$((i+1))
  run "arrivee_$i" "$uid" "
select pg_sleep(0.1 * (random()));
insert into public.sessions_pointage (id, entreprise_id, employe_id, chantier_id, arrivee_at, tache)
values (gen_random_uuid(), '$TENANT_A', '$empid', '$CH_A', now(), 'Bench40 arrivee $i') returning id;"
done < "$OUTDIR/grp_arrivee.txt"

# 12-13 : double-clic arrivée (même salarié, 2 sessions concurrentes).
read -r UID_DC EMP_DC < <(tr ',' ' ' < "$OUTDIR/grp_doubleclic.txt")
run "doubleclic_a" "$UID_DC" "select pg_sleep(0.05); insert into public.sessions_pointage (id, entreprise_id, employe_id, chantier_id, arrivee_at, tache) values (gen_random_uuid(), '$TENANT_A', '$EMP_DC', '$CH_A', now(), 'Bench40 double-clic A') returning id;"
run "doubleclic_b" "$UID_DC" "select pg_sleep(0.05); insert into public.sessions_pointage (id, entreprise_id, employe_id, chantier_id, arrivee_at, tache) values (gen_random_uuid(), '$TENANT_A', '$EMP_DC', '$CH_A', now(), 'Bench40 double-clic B') returning id;"

# 14-19 : départs (6 sessions déjà ouvertes, via la RPC réelle).
i=0
while IFS=, read -r uid sessid; do
  i=$((i+1))
  run "depart_$i" "$uid" "select pg_sleep(0.1 * (random())); select public.cloturer_session_pointage('$TENANT_A','$sessid', now(), 30, null, null, null, null, 'bench40 sans gps');"
done < "$OUTDIR/depart_sessions.txt"

# 20-26 : lectures (7 sessions, vue équipe / vue employé).
for i in 1 2 3; do run "lecture_equipe_$i" "$MANAGER1" "select count(*) from public.pointages where entreprise_id='$TENANT_A' and date >= current_date - interval '30 days' and verification_statut='valide';"; done
for i in 1 2 3; do run "lecture_employe_$i" "$MANAGER2" "select count(*) from public.pointages where entreprise_id='$TENANT_A' and date >= current_date - interval '30 days';"; done
run "lecture_supplementaire" "$MANAGER1" "select count(*) from public.affectations where entreprise_id='$TENANT_A' and date >= current_date - interval '7 days';"

# 27-30 : validations manager sur pointages distincts.
for i in 0 1 2 3; do run "validation_$i" "$MANAGER2" "select pg_sleep(0.1 * (random())); select public.valider_preuve_pointage('$TENANT_A', '${POINTAGES[$i]}', 'valide', 'bench40 ok');"; done

# 31-34 : rejets manager sur pointages distincts.
for i in 4 5 6 7; do run "rejet_$i" "$MANAGER1" "select pg_sleep(0.1 * (random())); select public.valider_preuve_pointage('$TENANT_A', '${POINTAGES[$i]}', 'rejete', 'bench40 motif de rejet');"; done

# 35-36 : conflit réel sur le MÊME pointage (une décision différente chacune).
run "conflit_meme_ligne_valide" "$MANAGER1" "select pg_sleep(0.2); select public.valider_preuve_pointage('$TENANT_A', '${POINTAGES[8]}', 'valide', 'bench40 conflit - valide');"
run "conflit_meme_ligne_rejete" "$MANAGER2" "select pg_sleep(0.2); select public.valider_preuve_pointage('$TENANT_A', '${POINTAGES[8]}', 'rejete', 'bench40 conflit - rejete');"

# 37-38 : retry/double-clic (rejoue EXACTEMENT la validation #27 sur le même pointage).
run "retry_1" "$MANAGER2" "select pg_sleep(0.1); select public.valider_preuve_pointage('$TENANT_A', '${POINTAGES[0]}', 'valide', 'bench40 ok');"
run "retry_2" "$MANAGER2" "select pg_sleep(0.15); select public.valider_preuve_pointage('$TENANT_A', '${POINTAGES[0]}', 'valide', 'bench40 ok');"

# 39-40 : tenant B (isolation sous charge).
run "tenantB_arrivee" "$UID_B1" "insert into public.sessions_pointage (id, entreprise_id, employe_id, chantier_id, arrivee_at, tache) values (gen_random_uuid(), '$TENANT_B', '$EMP_B1', '$CH_B', now(), 'Bench40 tenant B') returning id;"
run "tenantB_lecture" "$UID_B2" "select count(*) from public.pointages where entreprise_id='$TENANT_B';"

wait
END=$(date +%s.%N)

echo "=== Banc Pointages 40 sessions — résumé ==="
echo "Sessions lancées : $N"
awk -v s="$START" -v e="$END" 'BEGIN{printf "Durée totale : %.2f s\n", e-s}'
echo "Erreurs (grep ERROR, inclut les 2 conflits attendus) :"
grep -l "^ERROR\|ERROR:" "$OUTDIR"/*.txt 2>/dev/null | sed "s#$OUTDIR/##"
echo "Deadlocks : $(grep -li deadlock "$OUTDIR"/*.txt 2>/dev/null | wc -l)"
echo "Timeouts : $(grep -li 'timeout\|timed out' "$OUTDIR"/*.txt 2>/dev/null | wc -l)"
echo
echo "=== Invariants (à vérifier après coup) ==="
echo "-- Doublons de session ouverte (doit être vide) --"
psql -d "$DB" -c "select employe_id, count(*) from public.sessions_pointage where depart_at is null group by employe_id having count(*) > 1;"
echo "-- Sessions à durée impossible (doit être 0) --"
psql -d "$DB" -c "select count(*) from public.sessions_pointage where depart_at is not null and depart_at <= arrivee_at;"
echo "-- Fuite inter-tenant employe/chantier sur pointages et sessions (doit être 0/0) --"
psql -d "$DB" -c "
select count(*) from public.pointages p join public.employes e on e.id=p.employe_id where p.entreprise_id <> e.entreprise_id;
select count(*) from public.sessions_pointage s join public.employes e on e.id=s.employe_id where s.entreprise_id <> e.entreprise_id;
"
echo "-- Pointage en conflit direct : une seule décision doit persister --"
psql -d "$DB" -c "select id, verification_statut, commentaire_verification, verification_par from public.pointages where id='${POINTAGES[8]}';"
echo "-- Résultats détaillés par session : $OUTDIR/*.txt --"
