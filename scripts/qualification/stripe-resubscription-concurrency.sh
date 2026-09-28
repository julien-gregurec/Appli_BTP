#!/usr/bin/env bash
# ELSATIA — Stripe Resubscription Flow V1 : concurrence RÉELLE du réabonnement.
#
# N sessions PostgreSQL parallèles, sur la vraie base (migrations …0927 506 + …0927 507 + …0928 201, train V5) :
#   R1  N livraisons simultanées du rattachement de la MÊME nouvelle subscription
#       → exactement un « relie », le reste « deja_lie », un seul historique ;
#   R2  N nouvelles subscriptions DIFFÉRENTES rattachées en même temps (double
#       Checkout / subscription parasite) → une seule gagne, les autres 42501 ;
#   R3  événements tardifs de l'ANCIENNE (payment_failed, paid, deleted, plus
#       récents) mêlés à ceux de la nouvelle → jamais de suspension ni d'accès
#       venus de l'ancienne ; état final = celui de la nouvelle ;
#   R4  N re-livraisons simultanées du même invoice.paid → une seule décision ;
#   R5  rattachement + synchronisation (chemin applicatif complet) de la
#       nouvelle en parallèle du deleted de l'ancienne → actif, un remplacement.
#
# Usage : scripts/qualification/stripe-resubscription-concurrency.sh <base-locale> [sessions]
# Base : rebuild_db.sh <base>. Les données créées sont supprimées à la fin. Aucun appel réseau.
set -uo pipefail
DB="${1:?usage: stripe-resubscription-concurrency.sh <base-locale> [sessions]}"
N="${2:-40}"
OUT="$(mktemp -d)"; chmod 777 "$OUT"
q() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" ; }
pass=0; fail=0
verifier() { if [ "$2" = "$3" ]; then echo "ok   - $1 ($2)"; pass=$((pass+1)); else echo "FAIL - $1 (obtenu: $2, attendu: $3)"; fail=$((fail+1)); fi; }

E=(dd000000-0000-4000-8000-000000000001 dd000000-0000-4000-8000-000000000002 dd000000-0000-4000-8000-000000000003 dd000000-0000-4000-8000-000000000004 dd000000-0000-4000-8000-000000000005)
liste="'${E[0]}','${E[1]}','${E[2]}','${E[3]}','${E[4]}'"
nettoyer() {
  q <<SQL >/dev/null 2>&1
delete from public.stripe_subscriptions_remplacees where entreprise_id in ($liste);
delete from public.stripe_essai_ecarts where entreprise_id in ($liste);
delete from public.stripe_evenements_ordre where entreprise_id in ($liste);
delete from public.stripe_objets_ordre where entreprise_id in ($liste);
delete from public.factures_abonnement where entreprise_id in ($liste);
delete from public.abonnements_entreprises where entreprise_id in ($liste);
delete from public.entreprises where id in ($liste);
SQL
}
nettoyer
# Chaque entreprise : ancienne subscription annulée (deleted appliqué, filigrane à T100).
for i in 0 1 2 3 4; do
  q <<SQL >/dev/null
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id)
values ('${E[$i]}', 'Concurrence réabonnement $i', 'CCRSB$i', 'essai', current_date - 10, current_date + 20, 'cus_cr_$i');
select public.relier_subscription_reabonnement_service('${E[$i]}', 'sub_cr_old_$i', 'cus_cr_$i', 'active', null, null);
select public.synchroniser_abonnement_stripe_ordonne_service('${E[$i]}', 'sub_cr_old_$i', 'cus_cr_$i', 'annule', 'pro', 'mensuel',
  current_date, null, null, null, null, 'evt_cr_old_del_$i', 'customer.subscription.deleted', timestamptz '2026-11-01' + interval '100 seconds', 'subscription', 'sub_cr_old_$i');
SQL
done
echo "# Base : $DB — $N sessions parallèles"

# R1 : même nouvelle subscription, N rattachements simultanés.
for k in $(seq 1 "$N"); do
  ( echo "select public.relier_subscription_reabonnement_service('${E[0]}', 'sub_cr_new_0', 'cus_cr_0', 'active', 'sub_cr_old_0', 'canceled');" | q > "$OUT/r1_$k.txt" 2>&1 ) &
done
wait
verifier "R1 exactement un rattachement" "$(grep -lx relie "$OUT"/r1_*.txt | wc -l)" "1"
verifier "R1 les autres : deja_lie" "$(grep -lx deja_lie "$OUT"/r1_*.txt | wc -l)" "$(( N - 1 ))"
verifier "R1 aucune erreur" "$(grep -l ERROR "$OUT"/r1_*.txt | wc -l)" "0"
verifier "R1 un seul historique" "$(echo "select count(*) from public.stripe_subscriptions_remplacees where entreprise_id = '${E[0]}';" | q)" "1"

# R2 : N nouvelles subscriptions différentes en même temps.
for k in $(seq 1 "$N"); do
  ( echo "select public.relier_subscription_reabonnement_service('${E[1]}', 'sub_cr_new_1_$k', 'cus_cr_1', 'active', 'sub_cr_old_1', 'canceled');" | q > "$OUT/r2_$k.txt" 2>&1 ) &
done
wait
verifier "R2 une seule subscription gagne" "$(grep -lx relie "$OUT"/r2_*.txt | wc -l)" "1"
verifier "R2 toutes les autres refusées (42501)" "$(grep -l "Subscription Stripe non liée" "$OUT"/r2_*.txt | wc -l)" "$(( N - 1 ))"
gagnante=$(grep -lx relie "$OUT"/r2_*.txt | head -1 | sed -E 's/.*r2_([0-9]+)\.txt/\1/')
verifier "R2 la gagnante est la subscription courante" "$(echo "select stripe_subscription_id from public.entreprises where id = '${E[1]}';" | q)" "sub_cr_new_1_$gagnante"

# R3 : ancienne (événements plus récents !) contre nouvelle, en parallèle.
echo "select public.relier_subscription_reabonnement_service('${E[2]}', 'sub_cr_new_2', 'cus_cr_2', 'active', 'sub_cr_old_2', 'canceled');" | q >/dev/null
fac() { # entreprise evt type invoice sub secondes
  echo "select public.appliquer_evenement_facture_abonnement_v2_service('$1', '$2', '$3', timestamptz '2026-11-01' + make_interval(secs => $6), '$4',
    case when '$3' = 'invoice.paid' then 'paid' else 'open' end, timestamptz '2026-11-01', null, null, null, 249, 49.8, 298.8, 'eur', null, null, '$5')->>'decision';"
}
for k in $(seq 1 "$N"); do
  case $(( k % 4 )) in
    0) ( fac "${E[2]}" "evt_cr3_oldfail_$k" invoice.payment_failed "in_cr3_old_$k" sub_cr_old_2 $(( 5000 + k )) | q > "$OUT/r3_$k.txt" 2>&1 ) & ;;
    1) ( fac "${E[2]}" "evt_cr3_oldpaid_$k" invoice.paid "in_cr3_old_$k" sub_cr_old_2 $(( 5000 + k )) | q > "$OUT/r3_$k.txt" 2>&1 ) & ;;
    2) ( fac "${E[2]}" "evt_cr3_newpaid_$k" invoice.paid "in_cr3_new_$k" sub_cr_new_2 $(( 200 + k )) | q > "$OUT/r3_$k.txt" 2>&1 ) & ;;
    3) ( echo "select public.synchroniser_abonnement_stripe_ordonne_service('${E[2]}', 'sub_cr_new_2', 'cus_cr_2', 'actif', 'pro', 'mensuel',
          current_date + 30, null, null, null, null, 'evt_cr3_newupd_$k', 'customer.subscription.updated', timestamptz '2026-11-01' + make_interval(secs => $(( 200 + k ))), 'subscription', 'sub_cr_new_2')->>'decision';" | q > "$OUT/r3_$k.txt" 2>&1 ) & ;;
  esac
done
wait
verifier "R3 aucune erreur" "$(grep -l ERROR "$OUT"/r3_*.txt | wc -l)" "0"
verifier "R3 état final actif (jamais suspendu par l'ancienne)" "$(echo "select abonnement_statut from public.entreprises where id = '${E[2]}';" | q)" "actif"
verifier "R3 aucun événement de l'ancienne appliqué" \
  "$(echo "select count(*) from public.stripe_evenements_ordre where entreprise_id = '${E[2]}' and stripe_event_id like 'evt_cr3_old%' and decision <> 'sans_effet';" | q)" "0"
verifier "R3 tous les événements de l'ancienne journalisés sans effet" \
  "$(echo "select count(*) from public.stripe_evenements_ordre where entreprise_id = '${E[2]}' and stripe_event_id like 'evt_cr3_old%' and motif = 'subscription_remplacee';" | q)" "$(( N / 2 ))"

# R4 : N re-livraisons simultanées du même invoice.paid (nouvelle subscription).
echo "select public.relier_subscription_reabonnement_service('${E[3]}', 'sub_cr_new_3', 'cus_cr_3', 'active', 'sub_cr_old_3', 'canceled');" | q >/dev/null
for k in $(seq 1 "$N"); do
  ( fac "${E[3]}" evt_cr4_paid invoice.paid in_cr4 sub_cr_new_3 300 | q > "$OUT/r4_$k.txt" 2>&1 ) &
done
wait
verifier "R4 une seule application" "$(grep -lx applique "$OUT"/r4_*.txt | wc -l)" "1"
verifier "R4 les autres : deja_traite" "$(grep -lx deja_traite "$OUT"/r4_*.txt | wc -l)" "$(( N - 1 ))"
verifier "R4 journal : une ligne" "$(echo "select count(*) from public.stripe_evenements_ordre where stripe_event_id = 'evt_cr4_paid';" | q)" "1"
verifier "R4 droits rendus" "$(echo "select abonnement_statut from public.entreprises where id = '${E[3]}';" | q)" "actif"

# R5 : chemin applicatif complet (rattacher puis synchroniser, ou ignorer si remplacée)
# pour la nouvelle, en parallèle des rejeux du deleted de l'ancienne.
chemin() { # sub statut_stripe statut evt secondes ancienne ancienne_statut
  cat <<SQL
do \$\$
declare v text;
begin
  v := public.relier_subscription_reabonnement_service('${E[4]}', '$1', 'cus_cr_4', '$2', nullif('$6', ''), nullif('$7', ''));
  if v not in ('remplacee', 'terminale_ignoree') then
    perform public.synchroniser_abonnement_stripe_ordonne_service('${E[4]}', '$1', 'cus_cr_4', '$3', 'pro', 'mensuel',
      current_date + 30, null, null, null, null, '$4', 'customer.subscription.updated', timestamptz '2026-11-01' + make_interval(secs => $5), 'subscription', '$1');
  end if;
  raise notice 'issue=%', v;
end \$\$;
SQL
}
for k in $(seq 1 "$N"); do
  if [ $(( k % 2 )) -eq 0 ]; then
    ( chemin sub_cr_new_4 active actif "evt_cr5_new_$k" $(( 200 + k )) sub_cr_old_4 canceled | q > "$OUT/r5_$k.txt" 2>&1 ) &
  else
    # Livraison tardive de l'ancienne : l'application relit la courante (qui peut déjà être la nouvelle).
    ( chemin sub_cr_old_4 canceled annule "evt_cr5_old_$k" $(( 100 + k )) sub_cr_new_4 active | q > "$OUT/r5_$k.txt" 2>&1 ) &
  fi
done
wait
# Une livraison de l'ancienne qui précède le rattachement voit « deja_lie » (elle est encore
# courante) : l'application lui passe alors ancienne = NULL ; ici elle passe la nouvelle,
# d'où un refus 42501 possible (422, re-livré) — jamais une application sur la nouvelle.
autres=$(grep -l ERROR "$OUT"/r5_*.txt | xargs -r grep -L "Subscription Stripe non liée" | wc -l)
verifier "R5 aucune erreur hors refus 42501 re-livrable" "$autres" "0"
verifier "R5 la nouvelle est courante" "$(echo "select stripe_subscription_id from public.entreprises where id = '${E[4]}';" | q)" "sub_cr_new_4"
verifier "R5 état final actif" "$(echo "select abonnement_statut from public.entreprises where id = '${E[4]}';" | q)" "actif"
verifier "R5 un seul remplacement" "$(echo "select count(*) from public.stripe_subscriptions_remplacees where entreprise_id = '${E[4]}';" | q)" "1"
verifier "R5 essai clos (aucun nouvel essai)" "$(echo "select (abonnement_essai_fin < current_date)::text from public.entreprises where id = '${E[4]}';" | q)" "true"

nettoyer
echo "# PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
