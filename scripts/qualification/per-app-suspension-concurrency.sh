#!/usr/bin/env bash
# ELSATIA — Per-App Commercial Suspension V1 : concurrence RÉELLE.
# Rapport : docs/qualification/ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1.md
#
# Des sessions PostgreSQL « lectrices » (rôle authenticated + JWT, RLS réelle) observent en
# boucle, dans UNE requête par observation, l'accès GP / Tools / Colors / Réserves de leur
# entreprise pendant que des sessions « écrivaines » appliquent en parallèle :
#   P1  cycle GP complet (payment_failed → paid → annulation → réabonnement), chaque
#       événement livré plusieurs fois en parallèle → Tools / Colors / Réserves JAMAIS
#       observés fermés ; lignes de droit strictement inchangées ; GP final rouvert ;
#   P2  cycle Tools (past_due / active / canceled livrés en désordre, puis réabonnement)
#       → GP / Colors / Réserves jamais fermés ; Tools final = réabonné ; une décision
#       par événement ;
#   P3  incidents simultanés sur la MÊME entreprise (GP impayé, Colors past_due, Tools
#       réabonné) → chaque application finit dans SON état, aucune contamination ;
#   P4  suspension GLOBALE puis levée pendant les lectures → chaque observation est
#       « tout ouvert » ou « tout fermé » (jamais un mélange), aucune erreur ;
#   P5  même événement d'application livré N fois → une décision, une ligne d'audit.
#
# Usage : scripts/qualification/per-app-suspension-concurrency.sh <base-locale> [lecteurs] [observations]
# Base : rebuild_db.sh <base> (362 migrations). Données supprimées à la fin. Aucun appel réseau.
set -uo pipefail
DB="${1:?usage: per-app-suspension-concurrency.sh <base-locale> [lecteurs] [observations]}"
R="${2:-16}"
OBS="${3:-150}"
OUT="$(mktemp -d)"; chmod 777 "$OUT"
q() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" ; }
pass=0; fail=0
verifier() { if [ "$2" = "$3" ]; then echo "ok   - $1 ($2)"; pass=$((pass+1)); else echo "FAIL - $1 (obtenu: $2, attendu: $3)"; fail=$((fail+1)); fi; }

PFX="ea000000-0000-4000-8000-"; UPFX="eb000000-0000-4000-8000-"
ent() { printf '%s%012d' "$PFX" "$1"; }
usr() { printf '%s%012d' "$UPFX" "$1"; }
nettoyer() {
  q <<SQL >/dev/null 2>&1
delete from public.evenements_commerciaux_applications where entreprise_id::text like '${PFX}%';
delete from public.historique_acces_applications where cible_id::text like '${PFX}%';
delete from public.stripe_subscriptions_remplacees where entreprise_id::text like '${PFX}%';
delete from public.stripe_essai_ecarts where entreprise_id::text like '${PFX}%';
delete from public.stripe_evenements_ordre where entreprise_id::text like '${PFX}%';
delete from public.stripe_objets_ordre where entreprise_id::text like '${PFX}%';
delete from public.factures_abonnement where entreprise_id::text like '${PFX}%';
delete from public.abonnements_entreprises where entreprise_id::text like '${PFX}%';
delete from public.habilitations_applications_utilisateurs where entreprise_id::text like '${PFX}%';
delete from public.acces_applications_entreprises where entreprise_id::text like '${PFX}%';
delete from public.utilisateurs_entreprises where entreprise_id::text like '${PFX}%';
delete from public.permissions_poste where entreprise_id::text like '${PFX}%';
delete from public.postes where entreprise_id::text like '${PFX}%';
update public.utilisateurs set entreprise_active_id = null where id::text like '${UPFX}%';
delete from public.entreprises where id::text like '${PFX}%';
delete from public.utilisateurs where id::text like '${UPFX}%';
delete from auth.users where id::text like '${UPFX}%';
SQL
}
nettoyer

creer() { # k : entreprise GP active (Stripe), Tools / Colors / Réserves actifs, un admin habilité partout
  local e u p; e=$(ent "$1"); u=$(usr "$1"); p="ec000000-0000-4000-8000-$(printf '%012d' "$1")"
  q >/dev/null <<SQL
set elsatia.capacite_personnes_bypass = 'on';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '$u', 'authenticated', 'authenticated', 'conc-pa-$1@invalid.local', 'x', now(), now(), now());
insert into public.utilisateurs (id, prenom, nom) values ('$u', 'Conc', 'PA$1') on conflict (id) do nothing;
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id)
values ('$e', 'Concurrence per-app $1', 'CCPA$(printf '%04d' "$1")', 'essai', current_date - 5, current_date + 25, 'cus_pa_$1');
insert into public.postes (id, entreprise_id, nom) values ('$p', '$e', 'Direction');
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select '$e', '$p', c, true from unnest(array['gerer_parametres','acces_chantiers']) c;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values ('$u', '$e', '$p', 'actif');
update public.utilisateurs set entreprise_active_id = '$e' where id = '$u';
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, statut_commercial)
values ('$e','tools',true,'conc','active'), ('$e','colors',true,'conc','active'), ('$e','reserves',true,'conc','entitled');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
values ('$e','$u','tools','tools_pro'), ('$e','$u','colors','colors_admin_organisation'), ('$e','$u','reserves','reserves_admin_organisation');
SQL
  sub_evt "$1" "sub_pa_$1" active actif "evt_pa_init_$1" 10 | q >/dev/null 2>&1
}
# Chemin applicatif complet d'un événement subscription GP (relecture → rattachement → RPC ordonnée).
sub_evt() { # k sub statut_stripe statut evt secondes [ancienne_sub ancien_statut]
  local anc="${7:-}" ancst="${8:-}"
  cat <<SQL
do \$\$
declare v text;
begin
  v := public.relier_subscription_reabonnement_service('$(ent "$1")', '$2', 'cus_pa_$1', '$3',
    nullif('$anc', ''), nullif('$ancst', ''));
  if v not in ('remplacee', 'terminale_ignoree') then
    perform public.synchroniser_abonnement_stripe_ordonne_service('$(ent "$1")', '$2', 'cus_pa_$1', '$4', 'pro', 'mensuel',
      current_date + 30, null, null, null, null, '$5', 'customer.subscription.updated', timestamptz '2026-11-01' + make_interval(secs => $6), 'subscription', '$2');
  end if;
end \$\$;
SQL
}
fac() { # k evt type invoice sub secondes
  echo "select public.appliquer_evenement_facture_abonnement_v2_service('$(ent "$1")', '$2', '$3', timestamptz '2026-11-01' + make_interval(secs => $6), '$4',
    case when '$3' = 'invoice.paid' then 'paid' else 'open' end, timestamptz '2026-11-01', null, null, null, 79, 0, 79, 'eur', null, null, '$5')->>'decision';"
}
app_evt() { # k app statut_stripe sub evt secondes
  echo "select public.synchroniser_statut_commercial_application_service('$(ent "$1")', '$2', '$3', '$4', '$5', timestamptz '2026-11-01' + make_interval(secs => $6))->>'decision';"
}
# Script lecteur : OBS observations, chacune UNE requête (un instantané) des 4 accès.
lecteur() { # k
  local e; e=$(ent "$1")
  echo "set role authenticated;"
  echo "select set_config('request.jwt.claims', '{\"sub\":\"$(usr "$1")\",\"role\":\"authenticated\"}', false) is not null as _;"
  for _ in $(seq 1 "$OBS"); do
    echo "select 'obs', public.est_membre_actif('$e'), public.a_acces_application('$e','tools'), public.a_acces_application('$e','colors'), public.a_acces_application('$e','reserves'), (select count(*) from public.acces_applications_entreprises where entreprise_id = '$e');"
  done
}
lancer_lecteurs() { # tag k
  for i in $(seq 1 "$R"); do ( lecteur "$2" | q > "$OUT/$1_lect_$i.txt" 2>&1 ) & done
}
obs() { cat "$OUT"/$1_lect_*.txt | grep '^obs|'; }
empreinte() { echo "select string_agg(application_code || ':' || autorise || ':' || statut_commercial || ':' || coalesce(commercial_subscription_ref,'-') || ':' || updated_at, ',' order by application_code) from public.acces_applications_entreprises where entreprise_id = '$(ent "$1")';" | q; }
acces_service() { # k : accès vu par l'admin, hors concurrence
  printf "set role authenticated;\nselect set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', false) is not null;\nselect public.est_membre_actif('%s')||'/'||public.a_acces_application('%s','tools')||'/'||public.a_acces_application('%s','colors')||'/'||public.a_acces_application('%s','reserves');\n" \
    "$(usr "$1")" "$(ent "$1")" "$(ent "$1")" "$(ent "$1")" "$(ent "$1")" | q | tail -1
}

echo "# Base : $DB — $R lecteurs × $OBS observations par scénario"

# ── P1 : cycle GP complet pendant les lectures ─────────────────────────────────
creer 1
avant1=$(empreinte 1)
lancer_lecteurs p1 1
for rep in 1 2 3; do
  ( fac 1 evt_p1_fail invoice.payment_failed in_p1_a sub_pa_1 200 | q > "$OUT/p1_w_fail_$rep.txt" 2>&1 ) &
done; sleep 0.3
for rep in 1 2 3; do
  ( fac 1 evt_p1_paid invoice.paid in_p1_a sub_pa_1 300 | q > "$OUT/p1_w_paid_$rep.txt" 2>&1 ) &
done; sleep 0.3
for rep in 1 2 3; do
  ( sub_evt 1 sub_pa_1 canceled annule evt_p1_del 400 | q > "$OUT/p1_w_del_$rep.txt" 2>&1 ) &
done; sleep 0.3
for rep in 1 2 3; do
  ( sub_evt 1 sub_pa_1b active actif evt_p1_resub 500 sub_pa_1 canceled | q > "$OUT/p1_w_resub_$rep.txt" 2>&1 ) &
done
wait
verifier "P1 lectures effectuées" "$(obs p1 | wc -l)" "$(( R * OBS ))"
verifier "P1 GP observé fermé au moins une fois (le cycle a bien eu lieu pendant les lectures)" "$( [ "$(obs p1 | awk -F'|' '$2=="f"' | wc -l)" -gt 0 ] && echo oui || echo non)" "oui"
verifier "P1 Tools / Colors / Réserves JAMAIS observés fermés" "$(obs p1 | awk -F'|' '$3!="t"||$4!="t"||$5!="t"' | wc -l)" "0"
verifier "P1 ligne de droit toujours lisible (3 applications)" "$(obs p1 | awk -F'|' '$6!="3"' | wc -l)" "0"
verifier "P1 aucune erreur (lecteurs et écrivains)" "$(grep -l ERROR "$OUT"/p1_*.txt | wc -l)" "0"
verifier "P1 lignes de droit strictement inchangées" "$(empreinte 1)" "$avant1"
verifier "P1 GP final réabonné, tout ouvert" "$(acces_service 1)" "true/true/true/true"
verifier "P1 aucune suspension globale déduite" "$(echo "select count(*) from public.entreprises where id = '$(ent 1)' and suspension_globale_at is not null;" | q)" "0"

# ── P2 : cycle Tools en désordre pendant les lectures ─────────────────────────
creer 2
app_evt 2 tools active sub_t2 evt_p2_lien 10 | q >/dev/null
lancer_lecteurs p2 2
for rep in 1 2 3 4; do
  ( app_evt 2 tools past_due sub_t2 evt_p2_pd 20 | q > "$OUT/p2_w_pd_$rep.txt" 2>&1 ) &
  ( app_evt 2 tools canceled sub_t2 evt_p2_del 40 | q > "$OUT/p2_w_del_$rep.txt" 2>&1 ) &
  ( app_evt 2 tools active sub_t2 evt_p2_act 30 | q > "$OUT/p2_w_act_$rep.txt" 2>&1 ) &
done
wait
verifier "P2 subscription terminée : Tools annulé quel que soit l'ordre" "$(echo "select statut_commercial from public.acces_applications_entreprises where entreprise_id = '$(ent 2)' and application_code = 'tools';" | q)" "cancelled"
lancer_lecteurs p2b 2
for rep in 1 2 3 4; do ( app_evt 2 tools active sub_t2b evt_p2_resub 60 | q > "$OUT/p2b_w_$rep.txt" 2>&1 ) & done
wait
verifier "P2 GP / Colors / Réserves JAMAIS observés fermés (compte)" "$( (obs p2; obs p2b) | awk -F'|' '$2!="t"||$4!="t"||$5!="t"' | wc -l)" "0"
verifier "P2 Tools observé fermé pendant le cycle" "$( [ "$( (obs p2; obs p2b) | awk -F'|' '$3=="f"' | wc -l)" -gt 0 ] && echo oui || echo non)" "oui"
verifier "P2 réabonnement Tools : rouvert" "$(acces_service 2)" "true/true/true/true"
verifier "P2 une décision par événement" "$(echo "select count(*) || '/' || count(distinct evenement_id) from public.evenements_commerciaux_applications where entreprise_id = '$(ent 2)';" | q)" "5/5"
verifier "P2 réabonnement appliqué une seule fois" "$(grep -hx applique "$OUT"/p2b_w_*.txt | wc -l)" "1"
verifier "P2 aucune erreur" "$(grep -l ERROR "$OUT"/p2_*.txt "$OUT"/p2b_*.txt | wc -l)" "0"
verifier "P2 état GP (entreprise) non touché" "$(echo "select abonnement_statut || ':' || stripe_subscription_id from public.entreprises where id = '$(ent 2)';" | q)" "actif:sub_pa_2"

# ── P3 : incidents simultanés sur la même entreprise ──────────────────────────
creer 3
app_evt 3 tools active sub_t3 evt_p3_t0 10 | q >/dev/null
app_evt 3 tools canceled sub_t3 evt_p3_t1 20 | q >/dev/null
app_evt 3 colors active sub_c3 evt_p3_c0 10 | q >/dev/null
lancer_lecteurs p3 3
for rep in 1 2 3 4; do
  ( fac 3 evt_p3_gp_fail invoice.payment_failed in_p3 sub_pa_3 200 | q > "$OUT/p3_w_gp_$rep.txt" 2>&1 ) &
  ( app_evt 3 colors past_due sub_c3 evt_p3_c1 30 | q > "$OUT/p3_w_c_$rep.txt" 2>&1 ) &
  ( app_evt 3 tools active sub_t3b evt_p3_t2 40 | q > "$OUT/p3_w_t_$rep.txt" 2>&1 ) &
done
wait
verifier "P3 chaque application dans SON état (GP fermé, Tools réabonné, Colors fermé, Réserves ouvert)" "$(acces_service 3)" "false/true/false/true"
verifier "P3 Réserves JAMAIS observé fermé" "$(obs p3 | awk -F'|' '$5!="t"' | wc -l)" "0"
verifier "P3 aucune erreur" "$(grep -l ERROR "$OUT"/p3_*.txt | wc -l)" "0"

# ── P4 : suspension globale puis levée pendant les lectures ───────────────────
creer 4
lancer_lecteurs p4 4
sleep 0.4
echo "update public.entreprises set suspension_globale_at = now(), suspension_globale_motif = 'concurrence' where id = '$(ent 4)';" | q
sleep 0.6
echo "update public.entreprises set suspension_globale_at = null, suspension_globale_motif = null where id = '$(ent 4)';" | q
wait
fermes=$(obs p4 | awk -F'|' '$2=="f"&&$3=="f"&&$4=="f"&&$5=="f"' | wc -l)
ouverts=$(obs p4 | awk -F'|' '$2=="t"&&$3=="t"&&$4=="t"&&$5=="t"' | wc -l)
verifier "P4 observations : jamais un mélange ouvert / fermé entre applications" "$(( fermes + ouverts ))" "$(obs p4 | wc -l)"
verifier "P4 la suspension a bien été observée pendant les lectures" "$( [ "$fermes" -gt 0 ] && echo oui || echo non)" "oui"
verifier "P4 levée : tout rouvert, sans reconnexion" "$(acces_service 4)" "true/true/true/true"
verifier "P4 aucune erreur" "$(grep -l ERROR "$OUT"/p4_*.txt | wc -l)" "0"

# ── P5 : idempotence d'un événement d'application livré N fois en parallèle ─────
creer 5
for k in $(seq 1 "$R"); do ( app_evt 5 colors past_due sub_c5 evt_p5 10 | q > "$OUT/p5_$k.txt" 2>&1 ) & done
wait
verifier "P5 une seule décision appliquée" "$(grep -hx applique "$OUT"/p5_*.txt | wc -l)" "1"
verifier "P5 les autres livraisons : déjà traité" "$(grep -hx deja_traite "$OUT"/p5_*.txt | wc -l)" "$(( R - 1 ))"
verifier "P5 une ligne d'audit" "$(echo "select count(*) from public.historique_acces_applications where cible_id = '$(ent 5)' and action like 'statut_commercial:%';" | q)" "1"
verifier "P5 aucune erreur" "$(grep -l ERROR "$OUT"/p5_*.txt | wc -l)" "0"

nettoyer
echo "# PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
