#!/usr/bin/env bash
# GP BUSINESS HARDENING V9.1 — upgrade V9.1 (391) → candidat (399) sur une base PEUPLÉE.
#
#  1. copie <base-v91> (V9.1 fraîche, 391/391) → <base-upg> ;
#  2. décor métier V9.1 (jeu d'isolation + devis/facture/paiement/avoir) et données
#     HISTORIQUES devenues invalides : budget négatif, dates inversées, remise > 100 %,
#     facture annulée après émission, pointages rejetés, brouillons, cache tableau de bord ;
#  3. applique les migrations du candidat postérieures à 20261002001302, une par une ;
#  4. contrôles : migrations sans erreur, données conservées, contraintes NOT VALID
#     tolérant l'historique, cache du tableau de bord recalculé, schéma + ACL identiques à
#     <base-candidat-fraîche>, témoin pgTAP vert sur la base upgradée.
#
# Usage : upgrade-v9-1-gp-business-hardening.sh <base-v91> <base-upg> <base-candidat-fraîche>
set -euo pipefail
V91="${1:?base V9.1 fraîche}"; UPG="${2:?base d’upgrade}"; CAND="${3:?base candidat fraîche}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../.." && pwd)"
pg() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
val() { runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d "$UPG" -c "$1"; }

pg -c "drop database if exists \"$UPG\"" -c "create database \"$UPG\" template \"$V91\""
pg -c "alter database \"$UPG\" set search_path = public, extensions"
echo "== 1. base V9.1 : $(val "select count(*) from supabase_migrations.schema_migrations" 2>/dev/null || echo '?') migrations enregistrées =="

echo "== 2. décor V9.1 =="
(cd "$DEPOT/tests/e2e/gp-business-hardening-pile-locale" && pg -d "$UPG" -f seed-postgrest.sql > /dev/null)
pg -d "$UPG" <<'SQL'
set elsatia.capacite_personnes_bypass = 'on';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
-- Paiement partiel, avoir 10 % sur la facture émise du décor.
select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001', (select v from banc.ids where k = 'f1'), 1000, current_date, 'virement', 'HIST-1');
select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', (select v from banc.ids where k = 'd1'), 'avoir', 10, false, (select v from banc.ids where k = 'f1'));
-- Données historiques que les nouvelles règles refusent désormais (écrites AVANT l'upgrade).
insert into public.chantiers (id, entreprise_id, client_id, nom, statut, budget_previsionnel, date_debut_prevue, date_fin_prevue)
values ('a4000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'Historique invalide', 'en_cours', -500, '2026-10-10', '2026-10-01');
insert into banc.ids select 'dh', public.creer_devis_brouillon('a0000000-0000-0000-0000-000000000001',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","remise_globale":0}'::jsonb,
  '[{"designation":"Remise historique 150 %","type":"forfait","quantite":1,"unite":"u","prix_unitaire_ht":120,"remise_ligne":150,"taux_tva":20,"ordre":1}]'::jsonb);
insert into public.factures (id, entreprise_id, client_id, chantier_id, type, statut, montant_ht, montant_tva, montant_ttc)
values ('aa000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'simple', 'brouillon', 500, 100, 600);
update public.factures set statut = 'envoyee' where id = 'aa000000-0000-0000-0000-0000000000e2';
update public.factures set statut = 'annulee' where id = 'aa000000-0000-0000-0000-0000000000e2';
insert into public.factures (entreprise_id, client_id, chantier_id, type, statut, montant_ht, montant_tva, montant_ttc)
values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'simple', 'brouillon', 700, 140, 840);
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, verification_statut)
values ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date - 2, 7, 5, 'rejete');
SQL
avant() { val "select (select count(*) from public.factures) || '/' || (select count(*) from public.paiements) || '/' || (select count(*) from public.pointages) || '/' || (select count(*) from public.devis) || '/' || (select count(*) from public.chantiers) || '/' || (select sum(montant_ttc) from public.factures) || '/' || (select sum(montant) from public.paiements)"; }
COMPTES_AVANT="$(avant)"
CACHE_AVANT="$(val "select factures_total from public.entreprises_dashboard_cache where entreprise_id = 'a0000000-0000-0000-0000-000000000001'")"
echo "   factures/paiements/pointages/devis/chantiers/ΣTTC/Σpayé = $COMPTES_AVANT ; cache « Total facturé » = $CACHE_AVANT"

echo "== 3. migrations du candidat postérieures à 20261002001302 =="
n=0
for f in "$DEPOT"/supabase/migrations/*.sql; do
  nom="$(basename "$f")"; [[ "$nom" > "20261002001302_~" ]] || continue
  pg -d "$UPG" -f "$f" > /dev/null
  n=$((n+1)); echo "   OK $nom"
done
echo "   $n migration(s) appliquée(s)"

echo "== 4. contrôles =="
ko=0
verifier() { if [ "$2" = "$3" ]; then echo "   ✅ $1"; else echo "   ❌ $1 : obtenu « $2 », attendu « $3 »"; ko=$((ko+1)); fi; }
verifier "données conservées (comptes et sommes)" "$(avant)" "$COMPTES_AVANT"
verifier "cache « Total facturé » recalculé hors brouillons et annulées" \
  "$(val "select factures_total from public.entreprises_dashboard_cache where entreprise_id = 'a0000000-0000-0000-0000-000000000001'")" \
  "$(val "select sum(montant_ttc) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('annulee', 'brouillon')")"
verifier "contraintes NOT VALID : historique invalide conservé" \
  "$(val "select count(*) from public.chantiers where budget_previsionnel < 0") / $(val "select count(*) from public.lignes_devis where remise_ligne > 100")" "1 / 1"
verifier "contraintes posées NOT VALID (5)" "$(val "select count(*) from pg_constraint where conname in ('chantiers_budget_previsionnel_positif_check','chantiers_dates_prevues_ordonnees_check','lignes_devis_remise_ligne_bornee_check','lignes_factures_remise_ligne_bornee_check','devis_remise_globale_bornee_check') and not convalidated")" "5"
verifier "facture annulée historique conservée (aucune réécriture)" "$(val "select statut from public.factures where id = 'aa000000-0000-0000-0000-0000000000e2'")" "annulee"
verifier "authenticated ne lit plus pointages.cout_horaire_applique" "$(val "select has_column_privilege('authenticated', 'public.pointages', 'cout_horaire_applique', 'select')")" "f"
verifier "authenticated lit toujours pointages.heures_normales" "$(val "select has_column_privilege('authenticated', 'public.pointages', 'heures_normales', 'select')")" "t"

echo "== 5. schéma + ACL : base upgradée = candidat frais =="
dump() { runuser -u postgres -- pg_dump -s --no-owner -d "$1" --exclude-schema=banc | grep -v -E '^--|^SET |^SELECT pg_catalog.set_config|^\\(un)?restrict |^$' ; }
diff <(dump "$UPG") <(dump "$CAND") > /tmp/upg-v91-schema.diff && echo "   ✅ schéma + ACL identiques (pg_dump -s)" || { echo "   ❌ écarts de schéma : $(wc -l < /tmp/upg-v91-schema.diff) ligne(s), voir /tmp/upg-v91-schema.diff"; ko=$((ko+1)); }

echo "== 6. témoin pgTAP sur la base upgradée =="
PGTAP_OUT="${PGTAP_OUT:-/tmp/upg-v91-pgtap}" "$DEPOT/scripts/qualification/pgtap-run-v3.sh" "$UPG" gp_business_hardening_v9_1.test.sql | sed -n 1p

echo "== RÉSULTAT : $ko écart(s) =="
[ "$ko" = 0 ]
