#!/usr/bin/env bash
# Train canonique V9.2 — bases V9.1 peuplées pour l'upgrade V9.1 → V9.2 (bases locales jetables).
#
#   <prefixe>_metier     : V9.1 + seed PILOTE-BTP-V1 (28 comptes, historique métier) + fixture satellites
#                          + jeu d'isolation multitenant + devis remisé accepté, facture émise, paiement
#                          partiel, avoir 10 %, pointages, notifications (récentes et arriéré > 25 h) ;
#   <prefixe>_historique : <prefixe>_metier + données HISTORIQUES que les règles V9.2 refusent désormais
#                          (budget négatif, dates inversées, remise > 100 %, facture émise puis annulée,
#                          pointage rejeté, doublon de pointage oublié, > 24 h/jour, brouillons).
# Usage : preparer-bases-upgrade.sh <base-v91-fraîche> <prefixe>
set -euo pipefail
V91="${1:?base V9.1 fraîche}"; P="${2:?prefixe}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; DEPOT="$(cd "$ICI/../../.." && pwd)"
pg() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pg -c "drop database if exists ${P}_historique" -c "drop database if exists ${P}_metier" -c "create database ${P}_metier template \"$V91\""
pg -c "alter database ${P}_metier set search_path = public, extensions"
pg -d "${P}_metier" < "$DEPOT/supabase/production/seed_entreprise_pilote_btp.sql" > /dev/null
pg -d "${P}_metier" < "$DEPOT/supabase/production/fixture_preview_satellites_pilote.sql" > /dev/null
pg -d "${P}_metier" < "$DEPOT/supabase/production/assertions_fixture_preview_satellites_pilote.sql" > /dev/null
(cd "$DEPOT/tests/e2e/gp-business-hardening-pile-locale" && pg -d "${P}_metier" -f seed-postgrest.sql > /dev/null)
pg -d "${P}_metier" <<'SQL'
set elsatia.capacite_personnes_bypass = 'on';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001', (select v from banc.ids where k = 'f1'), 1000, current_date, 'virement', 'HIST-1');
select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', (select v from banc.ids where k = 'd1'), 'avoir', 10, false, (select v from banc.ids where k = 'f1'));
-- Notifications : récentes (file) et arriéré mort pour l'ancien cron (> 25 h).
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, message, created_at)
select 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'info', 'Notif ' || g, 'Corps ' || g,
       now() - (case when g % 2 = 0 then interval '2 hours' else interval '3 days' end)
from generate_series(1, 40) g;
SQL
pg -c "create database ${P}_historique template ${P}_metier"
pg -d "${P}_historique" <<'SQL'
set elsatia.capacite_personnes_bypass = 'on';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
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
values ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date - 2, 7, 5, 'rejete'),
       ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000002', current_date - 3, 14, 6, 'a_verifier'),
       ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date - 3, 8, 0, 'a_verifier');
SQL
echo "OK ${P}_metier ${P}_historique"
