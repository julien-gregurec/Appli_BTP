#!/usr/bin/env bash
# ELSATIA — Stripe Trial Synchronization V1 : concurrence RÉELLE sur l'essai.
#
# N sessions PostgreSQL parallèles livrent, pour la MÊME entreprise, des
# customer.subscription.* portant des trial_end différents (null, avant début,
# dans la fenêtre, au-delà : Checkout legacy 30 j, doublons de subscription)
# via la vraie RPC ordonnée. Attendus : aucune erreur (aucun 500), fenêtre
# finale dans la contrainte, jamais prolongée, et une seconde subscription
# concurrente n'est jamais rattachée.
#
# Usage : scripts/qualification/stripe-trial-concurrency.sh <base-locale> [sessions]
# Base : rebuild_db.sh <base> (migrations 506 + 507). Les données créées sont
# supprimées à la fin. Aucun appel réseau.
set -uo pipefail
DB="${1:?usage: stripe-trial-concurrency.sh <base-locale> [sessions]}"
N="${2:-60}"
OUT="$(mktemp -d)"; chmod 777 "$OUT"
q() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" ; }
pass=0; fail=0
verifier() { if [ "$2" = "$3" ]; then echo "ok   - $1 ($2)"; pass=$((pass+1)); else echo "FAIL - $1 (obtenu: $2, attendu: $3)"; fail=$((fail+1)); fi; }

E1=cc000000-0000-4000-8000-000000000001   # même subscription, trial_end variés
E2=cc000000-0000-4000-8000-000000000002   # deux subscriptions concurrentes (double Checkout)
nettoyer() {
  q <<SQL >/dev/null 2>&1
delete from public.stripe_essai_ecarts where entreprise_id in ('$E1','$E2');
delete from public.stripe_evenements_ordre where entreprise_id in ('$E1','$E2');
delete from public.stripe_objets_ordre where entreprise_id in ('$E1','$E2');
delete from public.abonnements where entreprise_id in ('$E1','$E2');
delete from public.entreprises where id in ('$E1','$E2');
SQL
}
nettoyer
q <<SQL >/dev/null
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin) values
  ('$E1', 'Concurrence essai', 'CCESSAI1', 'essai', '2026-10-01', '2026-10-31'),
  ('$E2', 'Double Checkout',   'CCESSAI2', 'essai', '2026-10-01', '2026-10-31');
SQL

echo "# Base : $DB — $N sessions parallèles"
# T1 : même subscription, trial_end variés, dates d'événements mélangées.
for i in $(seq 1 "$N"); do
  off=$(( (i * 37) % 80 - 10 ))             # -10 … +69 jours depuis le début
  [ $((i % 7)) -eq 0 ] && trial="null" || trial="date '2026-10-01' + $off"
  created=$(( (i * 53) % N ))
  (
    q > "$OUT/t1_$i.txt" 2>&1 <<SQL
select public.synchroniser_abonnement_stripe_ordonne_service(
  '$E1', 'sub_cc_1', 'cus_cc_1', 'essai', 'pro', 'mensuel', date '2026-12-01', $trial, null,
  timestamptz '2026-10-01', timestamptz '2026-10-31', 'evt_cc1_$i', 'customer.subscription.updated',
  timestamptz '2026-10-01' + make_interval(secs => $created), 'subscription', 'sub_cc_1')->>'decision';
SQL
  ) &
done
wait
erreurs=$(grep -l "ERROR" "$OUT"/t1_*.txt 2>/dev/null | wc -l)
verifier "T1 aucune erreur (aucun 500) sur $N livraisons concurrentes" "$erreurs" "0"
verifier "T1 fenêtre finale dans la contrainte, jamais prolongée" \
  "$(echo "select (abonnement_essai_fin between abonnement_essai_debut and date '2026-10-31')::text from public.entreprises where id = '$E1';" | q)" "true"
verifier "T1 toutes les livraisons journalisées une fois" \
  "$(echo "select count(*) from public.stripe_evenements_ordre where entreprise_id = '$E1';" | q)" "$N"
decisions=$(cat "$OUT"/t1_*.txt | sort | uniq -c | awk '{printf "%s:%s ", $2, $1}')
echo "#    décisions : $decisions"

# T2 : deux subscriptions concurrentes (double Checkout legacy) pour la même entreprise.
for i in $(seq 1 "$N"); do
  sub="sub_cc_2_$(( i % 2 ))"
  (
    q > "$OUT/t2_$i.txt" 2>&1 <<SQL
select public.synchroniser_abonnement_stripe_ordonne_service(
  '$E2', '$sub', 'cus_cc_2', 'essai', 'pro', 'mensuel', date '2026-12-01', date '2026-10-01' + $(( 20 + i % 20 )), null,
  timestamptz '2026-10-01', timestamptz '2026-10-31', 'evt_cc2_$i', 'customer.subscription.created',
  timestamptz '2026-10-01' + make_interval(secs => $i), 'subscription', '$sub')->>'decision';
SQL
  ) &
done
wait
rattachees=$(echo "select count(distinct stripe_subscription_id) from public.entreprises where id = '$E2' and stripe_subscription_id is not null;" | q)
verifier "T2 une seule subscription rattachée" "$rattachees" "1"
refus=$(grep -l "Subscription Stripe non liée" "$OUT"/t2_*.txt | wc -l)
autres=$(grep -L "Subscription Stripe non liée" "$OUT"/t2_*.txt | xargs grep -l "ERROR" 2>/dev/null | wc -l)
verifier "T2 l'autre subscription est refusée (42501) à chaque livraison" "$refus" "$(( N / 2 ))"
verifier "T2 aucune autre erreur" "$autres" "0"
verifier "T2 fenêtre finale dans la contrainte, jamais prolongée" \
  "$(echo "select (abonnement_essai_fin between abonnement_essai_debut and date '2026-10-31')::text from public.entreprises where id = '$E2';" | q)" "true"

nettoyer
echo "# PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
