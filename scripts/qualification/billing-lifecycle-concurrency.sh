#!/usr/bin/env bash
# ELSATIA — Billing & Subscription Lifecycle Qualification V1 : concurrence RÉELLE du cycle commercial.
# Rapport : docs/qualification/ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1.md
#
# N sessions PostgreSQL parallèles sur la vraie base (train V6 + …0928 701-703 ; train V8 : …0928 801-803) :
#   C1  premier Checkout complété livré N fois en parallèle (double clic, 2 onglets,
#       re-livraison Stripe) → une seule liaison, un seul contrat, prix canonique 79 € ;
#   C2  deux Checkout complétés pour deux subscriptions DIFFÉRENTES (2 onglets) →
#       une seule rattachée, l'autre refusée (42501, jamais facturée en double chez nous) ;
#   C3  annulation (deleted relu canceled) mêlée à des invoice.paid / payment_failed
#       tardifs de la même subscription, pour 20 entreprises → toujours annulé (B-1) ;
#   C4  paid et payment_failed de la MÊME seconde livrés N fois en désordre → actif
#       (le paiement gagne l'égalité), une décision par événement ;
#   C5  changements d'offre (Portail) relus concurremment : toutes les relectures
#       portent la vérité Stripe courante (business/annuel) → droits business/annuel,
#       contrat au prix canonique 4 490 € ;
#   C6  transitions d'accès concurrentes (payment_failed ↔ invoice.paid, horodatages
#       croissants) → l'état final est celui de l'événement le plus récent.
#
# Usage : scripts/qualification/billing-lifecycle-concurrency.sh <base-locale> [sessions]
# Base : rebuild_db.sh <base>. Les données créées sont supprimées à la fin. Aucun appel réseau.
set -uo pipefail
DB="${1:?usage: billing-lifecycle-concurrency.sh <base-locale> [sessions]}"
N="${2:-40}"
OUT="$(mktemp -d)"; chmod 777 "$OUT"
q() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" ; }
pass=0; fail=0
verifier() { if [ "$2" = "$3" ]; then echo "ok   - $1 ($2)"; pass=$((pass+1)); else echo "FAIL - $1 (obtenu: $2, attendu: $3)"; fail=$((fail+1)); fi; }

PFX="ee000000-0000-4000-8000-"
ent() { printf '%s%012d' "$PFX" "$1"; }
nettoyer() {
  q <<SQL >/dev/null 2>&1
delete from public.stripe_subscriptions_remplacees where entreprise_id::text like '${PFX}%';
delete from public.stripe_essai_ecarts where entreprise_id::text like '${PFX}%';
delete from public.stripe_evenements_ordre where entreprise_id::text like '${PFX}%';
delete from public.stripe_objets_ordre where entreprise_id::text like '${PFX}%';
delete from public.factures_abonnement where entreprise_id::text like '${PFX}%';
delete from public.abonnements_entreprises where entreprise_id::text like '${PFX}%';
delete from public.entreprises where id::text like '${PFX}%';
SQL
}
nettoyer
creer() { # k
  echo "insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id)
        values ('$(ent "$1")', 'Concurrence cycle $1', 'CCBL$(printf '%04d' "$1")', 'essai', current_date - 5, current_date + 25, 'cus_bl_$1');" | q >/dev/null
}
# Chemin applicatif complet d'un événement subscription (relecture → rattachement → RPC ordonnée).
sub_evt() { # k sub statut_stripe statut evt secondes offre periodicite
  cat <<SQL
do \$\$
declare v text;
begin
  v := public.relier_subscription_reabonnement_service('$(ent "$1")', '$2', 'cus_bl_$1', '$3', null, null);
  if v not in ('remplacee', 'terminale_ignoree') then
    perform public.synchroniser_abonnement_stripe_ordonne_service('$(ent "$1")', '$2', 'cus_bl_$1', '$4', '$7', '$8',
      current_date + 30, null, null, null, null, '$5', 'customer.subscription.updated', timestamptz '2026-11-01' + make_interval(secs => $6), 'subscription', '$2');
  end if;
  raise notice 'issue=%', v;
end \$\$;
SQL
}
fac() { # k evt type invoice sub secondes
  echo "select public.appliquer_evenement_facture_abonnement_v2_service('$(ent "$1")', '$2', '$3', timestamptz '2026-11-01' + make_interval(secs => $6), '$4',
    case when '$3' = 'invoice.paid' then 'paid' else 'open' end, timestamptz '2026-11-01', null, null, null, 79, 0, 79, 'eur', null, null, '$5')->>'decision';"
}
st() { echo "select abonnement_statut from public.entreprises where id = '$(ent "$1")';" | q; }

echo "# Base : $DB — $N sessions parallèles"

# C1 : première liaison livrée N fois en parallèle.
creer 1
for k in $(seq 1 "$N"); do
  ( sub_evt 1 sub_bl_1 trialing essai evt_c1 10 mini mensuel | q > "$OUT/c1_$k.txt" 2>&1 ) &
done
wait
verifier "C1 exactement une liaison" "$(grep -l 'issue=lie' "$OUT"/c1_*.txt | wc -l)" "1"
verifier "C1 aucune erreur" "$(grep -l ERROR "$OUT"/c1_*.txt | wc -l)" "0"
verifier "C1 un seul contrat" "$(echo "select count(*) from public.abonnements_entreprises where entreprise_id = '$(ent 1)';" | q)" "1"
verifier "C1 prix contractuel canonique (Mini 79 €)" "$(echo "select prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = '$(ent 1)';" | q)" "79.00"
verifier "C1 une décision journalisée" "$(echo "select count(*) from public.stripe_evenements_ordre where stripe_event_id = 'evt_c1';" | q)" "1"
verifier "C1 statut essai (trialing)" "$(st 1)" "essai"

# C2 : deux subscriptions différentes complétées en même temps (2 onglets).
creer 2
for k in $(seq 1 "$N"); do
  ( echo "select public.relier_subscription_reabonnement_service('$(ent 2)', 'sub_bl_2_$(( k % 2 ))', 'cus_bl_2', 'active', null, null);" | q > "$OUT/c2_$k.txt" 2>&1 ) &
done
wait
gagnante=$(echo "select stripe_subscription_id from public.entreprises where id = '$(ent 2)';" | q)
verifier "C2 une seule liaison" "$(grep -lx lie "$OUT"/c2_*.txt | wc -l)" "1"
verifier "C2 l'autre subscription toujours refusée (42501)" "$(grep -l 'ERROR' "$OUT"/c2_*.txt | xargs -r grep -l 'Subscription Stripe non liée\|encore active' | wc -l)" "$(( N / 2 ))"
verifier "C2 une subscription courante" "$( [ -n "$gagnante" ] && echo oui)" "oui"

# C3 : annulation + factures tardives de la même subscription, 20 entreprises, ordre aléatoire.
for e in $(seq 10 29); do
  creer "$e"
  sub_evt "$e" "sub_bl_$e" active actif "evt_c3_a_$e" 10 pro mensuel | q >/dev/null 2>&1
done
for e in $(seq 10 29); do
  for r in 1 2 3; do
    ( sub_evt "$e" "sub_bl_$e" canceled annule "evt_c3_del_$e" 100 pro mensuel | q > "$OUT/c3_${e}_d$r.txt" 2>&1 ) &
    ( fac "$e" "evt_c3_paid_$e" invoice.paid "in_c3_$e" "sub_bl_$e" 200 | q > "$OUT/c3_${e}_p$r.txt" 2>&1 ) &
    ( fac "$e" "evt_c3_fail_$e" invoice.payment_failed "in_c3b_$e" "sub_bl_$e" 150 | q > "$OUT/c3_${e}_f$r.txt" 2>&1 ) &
  done
done
wait
annules=0; for e in $(seq 10 29); do [ "$(st "$e")" = "annule" ] && annules=$((annules+1)); done
verifier "C3 20/20 entreprises annulées (aucune réouverture par facture tardive)" "$annules" "20"
verifier "C3 aucune erreur" "$(grep -l ERROR "$OUT"/c3_*.txt | wc -l)" "0"
verifier "C3 une décision par événement" \
  "$(echo "select count(*) from public.stripe_evenements_ordre where stripe_event_id like 'evt_c3_%';" | q)" \
  "$(echo "select count(distinct stripe_event_id) from public.stripe_evenements_ordre where stripe_event_id like 'evt_c3_%';" | q)"
verifier "C3 factures conservées (historique)" "$(echo "select count(*) from public.factures_abonnement where stripe_invoice_id like 'in\\_c3\\_%';" | q)" "20"

# C4 : paid / payment_failed de la même seconde, N livraisons en désordre.
creer 4
sub_evt 4 sub_bl_4 active actif evt_c4_a 10 pro mensuel | q >/dev/null 2>&1
for k in $(seq 1 "$N"); do
  if [ $(( k % 2 )) -eq 0 ]; then
    ( fac 4 evt_c4_paid invoice.paid in_c4_a sub_bl_4 500 | q > "$OUT/c4_$k.txt" 2>&1 ) &
  else
    ( fac 4 evt_c4_fail invoice.payment_failed in_c4_b sub_bl_4 500 | q > "$OUT/c4_$k.txt" 2>&1 ) &
  fi
done
wait
verifier "C4 le paiement gagne l'égalité à la seconde" "$(st 4)" "actif"
verifier "C4 aucune erreur" "$(grep -l ERROR "$OUT"/c4_*.txt | wc -l)" "0"
verifier "C4 deux décisions (une par événement)" "$(echo "select count(*) from public.stripe_evenements_ordre where stripe_event_id in ('evt_c4_paid','evt_c4_fail');" | q)" "2"

# C5 : changement d'offre relu concurremment (vérité Stripe courante = business/annuel).
creer 5
sub_evt 5 sub_bl_5 active actif evt_c5_a 10 mini mensuel | q >/dev/null 2>&1
for k in $(seq 1 "$N"); do
  ( sub_evt 5 sub_bl_5 active actif "evt_c5_$k" $(( 100 + (k * 7) % N )) business annuel | q > "$OUT/c5_$k.txt" 2>&1 ) &
done
wait
verifier "C5 aucune erreur" "$(grep -l ERROR "$OUT"/c5_*.txt | wc -l)" "0"
verifier "C5 droits = offre facturée" "$(echo "select abonnement_offre || '/' || abonnement_periodicite from public.entreprises where id = '$(ent 5)';" | q)" "business/annuel"
verifier "C5 contrat au prix canonique" "$(echo "select code_offre || ':' || prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = '$(ent 5)';" | q)" "business:4490.00"

# C6 : transitions d'accès concurrentes, horodatages croissants ; le plus récent (paid à 1000+N) gagne.
creer 6
sub_evt 6 sub_bl_6 active actif evt_c6_a 10 pro mensuel | q >/dev/null 2>&1
for k in $(seq 1 "$N"); do
  if [ $(( k % 2 )) -eq 0 ]; then
    ( fac 6 "evt_c6_$k" invoice.paid "in_c6_$k" sub_bl_6 $(( 1000 + k )) | q > "$OUT/c6_$k.txt" 2>&1 ) &
  else
    ( fac 6 "evt_c6_$k" invoice.payment_failed "in_c6_$k" sub_bl_6 $(( 1000 + k )) | q > "$OUT/c6_$k.txt" 2>&1 ) &
  fi
done
wait
dernier=$(( N % 2 == 0 ? 1 : 0 ))
verifier "C6 aucune erreur" "$(grep -l ERROR "$OUT"/c6_*.txt | wc -l)" "0"
verifier "C6 état final = événement le plus récent" "$(st 6)" "$( [ "$dernier" = 1 ] && echo actif || echo suspendu)"
verifier "C6 filigrane = dernier événement" "$(echo "select dernier_evenement_id from public.stripe_objets_ordre where flux = 'abonnement' and objet_type = 'entreprise_acces' and objet_id = '$(ent 6)';" | q)" "evt_c6_$N"

nettoyer
echo "# PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
