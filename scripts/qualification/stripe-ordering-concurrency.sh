#!/usr/bin/env bash
# ELSATIA-STRIPE-EVENT-ORDERING-REPLAY-HARDENING-V1 — preuve de concurrence RÉELLE
# (plusieurs sessions PostgreSQL simultanées) du contrat d'ordre Stripe
# (migration 20260927000506). Une transaction pgTAP ne peut pas se bloquer
# elle-même : ce harnais ouvre de vraies connexions psql concurrentes.
#
# LOCAL UNIQUEMENT : socket Unix du PostgreSQL local, utilisateur OS postgres.
# Aucune URL distante n'est acceptée. Crée des entreprises jetables
# (préfixe « Concurrence ordre ») et les supprime à la fin.
#
# Usage : scripts/qualification/stripe-ordering-concurrency.sh <base-locale> [iterations]
#   ex. : scripts/local-postgres-bootstrap/rebuild_db.sh ordre_conc
#         scripts/qualification/stripe-ordering-concurrency.sh ordre_conc 40
#
# Scénarios :
#   C1  paid(t200) tient le verrou ; payment_failed(t100) concurrent → bloqué, puis PÉRIMÉ → actif
#   C2  payment_failed(t100) tient le verrou ; paid(t200) concurrent → bloqué, puis APPLIQUÉ → actif
#   C3  payment_failed(t300) (plus récent) vs paid(t200) (plus ancien), deux ordres → suspendu
#   C4  égalité à la seconde, deux ordres → actif (paid gagne l'égalité)
#   C5  stress : N itérations, les deux RPC lancées en parallèle sans pause → état = chronologie
#   C6  100 livraisons concurrentes du MÊME event id → 1 décision, état identique
set -uo pipefail

DB="${1:?usage: stripe-ordering-concurrency.sh <base-locale> [iterations]}"
N="${2:-40}"
case "$DB" in
  *://*|*@*|*host=*) echo "REFUS : base locale uniquement (nom de base, pas d'URL)"; exit 2 ;;
esac

PSQL=(su postgres -c)
q() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB -c \"$1\""; }

PASS=0; FAIL=0
verifier() { # libellé attendu obtenu
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "ok   - $1 ($3)"; else FAIL=$((FAIL+1)); echo "FAIL - $1 : attendu '$2', obtenu '$3'"; fi
}

nouvelle_entreprise() { # $1 = suffixe numérique
  local id; id=$(printf 'cc000000-0000-4000-8000-%012d' "$1")
  q "insert into public.entreprises(id, nom, code_adhesion, abonnement_statut) values ('$id','Concurrence ordre $1','CC$(printf '%06d' "$1")','actif') on conflict (id) do update set abonnement_statut='actif'" >/dev/null
  echo "$id"
}

sql_facture() { # entreprise evt type n invoice
  local st; [ "$3" = "invoice.paid" ] && st=paid || st=open
  echo "select public.appliquer_evenement_facture_abonnement_service('$1'::uuid,'$2','$3', timestamptz '2026-10-01 00:00:00+00' + interval '$4 seconds','$5','$st', null, null, null, null, 10, 2, 12, 'eur', null, null)->>'decision'"
}

# Session qui prend le verrou et le garde $6 secondes avant COMMIT.
session_lente() { # entreprise evt type n invoice pause fichier
  su postgres -c "psql -X -q -At -d $DB" > "$7" 2>&1 <<SQL
begin;
$(sql_facture "$1" "$2" "$3" "$4" "$5");
select pg_sleep($6);
commit;
SQL
}
session_rapide() { # entreprise evt type n invoice fichier
  local debut fin
  debut=$(date +%s.%N)
  su postgres -c "psql -X -q -At -d $DB -c \"$(sql_facture "$1" "$2" "$3" "$4" "$5")\"" > "$6" 2>&1
  fin=$(date +%s.%N)
  echo "$(echo "$fin - $debut" | bc)" > "$6.duree"
}
statut() { q "select abonnement_statut from public.entreprises where id='$1'"; }
decision() { q "select decision from public.stripe_evenements_ordre where flux='abonnement' and stripe_event_id='$1'"; }

TMP=$(mktemp -d); chmod 777 "$TMP"
trap 'rm -rf "$TMP"; q "delete from public.stripe_evenements_ordre where entreprise_id::text like '"'"'cc000000-%'"'"'; delete from public.entreprises where id::text like '"'"'cc000000-%'"'"'" >/dev/null 2>&1' EXIT

echo "# Base : $DB — PostgreSQL $(q 'show server_version')"
q "select 1 from pg_proc where proname='appliquer_evenement_facture_abonnement_service'" | grep -q 1 \
  || { echo "FAIL - migration 20260927000506 absente de $DB"; exit 1; }

# ── C1 / C2 : verrou réel, l'autre session attend ─────────────────────────────
for ordre in C1 C2; do
  E=$(nouvelle_entreprise $([ $ordre = C1 ] && echo 1 || echo 2))
  if [ $ordre = C1 ]; then
    session_lente "$E" "evt_${ordre}_paid" invoice.paid 200 "in_${ordre}_b" 2 "$TMP/lente" &
    sleep 0.5
    session_rapide "$E" "evt_${ordre}_failed" invoice.payment_failed 100 "in_${ordre}_a" "$TMP/rapide"
    wait
    verifier "$ordre failed(t100) concurrent de paid(t200) : décision" "perime" "$(decision evt_${ordre}_failed)"
  else
    session_lente "$E" "evt_${ordre}_failed" invoice.payment_failed 100 "in_${ordre}_a" 2 "$TMP/lente" &
    sleep 0.5
    session_rapide "$E" "evt_${ordre}_paid" invoice.paid 200 "in_${ordre}_b" "$TMP/rapide"
    wait
    verifier "$ordre paid(t200) concurrent de failed(t100) : décision" "applique" "$(decision evt_${ordre}_paid)"
  fi
  attente=$(cat "$TMP/rapide.duree")
  verifier "$ordre la 2e session a ATTENDU le verrou ligne (>= 1 s)" "1" "$(echo "$attente >= 1" | bc)"
  verifier "$ordre état final" "actif" "$(statut "$E")"
done

# ── C3 / C4 : chronologie et égalité, deux ordres, en parallèle ───────────────
course() { # entreprise nA typeA nB typeB tag
  session_lente "$1" "evt_$6_A" "$3" "$2" "in_$6_A" 1 "$TMP/a" &
  sleep 0.3
  session_rapide "$1" "evt_$6_B" "$5" "$4" "in_$6_B" "$TMP/b"
  wait
}
E=$(nouvelle_entreprise 3); course "$E" 300 invoice.payment_failed 200 invoice.paid C3a
verifier "C3a failed(t300) puis paid(t200) → chronologie" "suspendu" "$(statut "$E")"
E=$(nouvelle_entreprise 4); course "$E" 200 invoice.paid 300 invoice.payment_failed C3b
verifier "C3b paid(t200) puis failed(t300) → chronologie" "suspendu" "$(statut "$E")"
E=$(nouvelle_entreprise 5); course "$E" 500 invoice.paid 500 invoice.payment_failed C4a
verifier "C4a égalité paid→failed" "actif" "$(statut "$E")"
E=$(nouvelle_entreprise 6); course "$E" 500 invoice.payment_failed 500 invoice.paid C4b
verifier "C4b égalité failed→paid" "actif" "$(statut "$E")"

# ── C5 : stress parallèle sans pause ─────────────────────────────────────────
ko=0
for i in $(seq 1 "$N"); do
  E=$(nouvelle_entreprise $((100 + i)))
  # Alterne quel événement est le plus récent et lequel part en premier.
  if [ $((i % 2)) -eq 0 ]; then tp=200; tf=100; attendu=actif; else tp=100; tf=200; attendu=suspendu; fi
  if [ $((i % 4)) -lt 2 ]; then
    su postgres -c "psql -X -q -At -d $DB -c \"$(sql_facture "$E" "evt_s${i}_p" invoice.paid $tp "in_s${i}_p")\"" >/dev/null 2>&1 &
    su postgres -c "psql -X -q -At -d $DB -c \"$(sql_facture "$E" "evt_s${i}_f" invoice.payment_failed $tf "in_s${i}_f")\"" >/dev/null 2>&1 &
  else
    su postgres -c "psql -X -q -At -d $DB -c \"$(sql_facture "$E" "evt_s${i}_f" invoice.payment_failed $tf "in_s${i}_f")\"" >/dev/null 2>&1 &
    su postgres -c "psql -X -q -At -d $DB -c \"$(sql_facture "$E" "evt_s${i}_p" invoice.paid $tp "in_s${i}_p")\"" >/dev/null 2>&1 &
  fi
  wait
  [ "$(statut "$E")" = "$attendu" ] || { ko=$((ko+1)); echo "  écart itération $i : $(statut "$E") au lieu de $attendu"; }
done
verifier "C5 stress $N courses parallèles paid/failed : écarts à la chronologie" "0" "$ko"

# ── C6 : 100 livraisons concurrentes du même event id ─────────────────────────
E=$(nouvelle_entreprise 7)
for i in $(seq 1 100); do
  su postgres -c "psql -X -q -At -d $DB -c \"$(sql_facture "$E" evt_C6_dup invoice.payment_failed 100 in_C6)\"" >> "$TMP/c6" 2>&1 &
done
wait
verifier "C6 100 livraisons concurrentes : une seule décision" "1" "$(q "select count(*) from public.stripe_evenements_ordre where stripe_event_id='evt_C6_dup'")"
verifier "C6 réponses : 1 applique + 99 deja_traite" "1 applique|99 deja_traite" "$(sort "$TMP/c6" | uniq -c | awk '{print $1" "$2}' | paste -sd'|')"
verifier "C6 état final" "suspendu" "$(statut "$E")"
verifier "C6 une seule facture" "1" "$(q "select count(*) from public.factures_abonnement where stripe_invoice_id='in_C6'")"
q "delete from public.factures_abonnement where entreprise_id::text like 'cc000000-%'" >/dev/null 2>&1

echo "# PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
