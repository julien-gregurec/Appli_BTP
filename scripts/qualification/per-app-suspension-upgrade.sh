#!/usr/bin/env bash
# ELSATIA — Per-App Commercial Suspension V1 : qualification d'UPGRADE 361 → 362.
# Rapport : docs/qualification/ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1.md §11.
#
#   1. base au train Billing (361 migrations, <= 20260928000703) + comptes représentatifs
#      des états existants (GP suspendu / annulé / essai expiré / impayé échu / actif,
#      droits retirés ou échus, intervenant Réserves actif) ;
#   2. rapport d'impact AVANT migration (docs/runbooks/sql/ELSATIA_PER_APP_SUSPENSION_IMPACT_V1.sql) ;
#   3. accès réel de chaque utilisateur habilité, AVANT (fonctions V6 + Billing) ;
#   4. migration 20260929000801 ;
#   5. accès APRÈS ; contrôles : aucune perte, gains = rapport d'impact = rapport écrit par
#      la migration ; schéma upgradé identique au neuf (pg_dump -s).
#
# Usage : scripts/qualification/per-app-suspension-upgrade.sh <base-upgrade> <base-fresh-362>
set -uo pipefail
DB="${1:-upg_perapp}"
FRESH="${2:?base neuve à 362 migrations (rebuild_db.sh)}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
DERNIERE="20260928000703"
OUT="$(mktemp -d)"; chmod 777 "$OUT"
q() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB"; }
pass=0; fail=0
verifier() { if [ "$2" = "$3" ]; then echo "ok   - $1 ($2)"; pass=$((pass+1)); else echo "FAIL - $1"; echo "       obtenu : $2"; echo "       attendu: $3"; fail=$((fail+1)); fi; }

echo "== 1. base $DERNIERE (361) =="
su postgres -c "psql -X -q -c 'drop database if exists \"$DB\";' -c 'create database \"$DB\";'"
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$DB -d $DB -f $BOOT/pg_bootstrap.sql" >/dev/null
n=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"; [[ "$v" > "$DERNIERE" ]] && continue
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$f" | q >/dev/null 2>"$OUT/err" || { echo "FAIL $f"; cat "$OUT/err"; exit 1; }
  n=$((n+1))
done
verifier "361 migrations avant la mise à niveau" "$n" "361"

# U1..U8 : un admin habilité à tout ce que l'entreprise possède.
q >/dev/null 2>"$OUT/decor_err" <<'SQL'
set elsatia.capacite_personnes_bypass = 'on';
create temp table decor (k int, statut text, essai_debut date, essai_fin date, suspension interval, apps text[], retire text, echu text);
insert into decor values
  (1, 'suspendu', current_date - 60, current_date - 30, null,                         array['tools','colors','reserves'], null, null),
  (2, 'annule',   current_date - 60, current_date - 30, null,                         array['reserves'],                  null, null),
  (3, 'essai',    current_date - 40, current_date - 10, null,                         array['colors'],                    null, null),
  (4, 'actif',    current_date - 60, current_date - 30, interval '-1 minute',         array['tools'],                     null, null),
  (5, 'actif',    current_date - 60, current_date - 30, null,                         array['tools','colors'],            null, null),
  (6, 'suspendu', current_date - 60, current_date - 30, null,                         array['colors'],                    'colors', null),
  (7, 'suspendu', current_date - 60, current_date - 30, null,                         array['tools'],                     null, 'tools'),
  (8, 'actif',    current_date - 60, current_date - 30, interval '5 days',            array['reserves'],                  null, null);
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000'::uuid, ('ed000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'authenticated', 'authenticated',
       'upg-perapp-' || k || '@invalid.local', 'x', now(), now(), now() from decor
union all
select '00000000-0000-0000-0000-000000000000', 'ed000000-0000-4000-8000-000000000099', 'authenticated', 'authenticated', 'upg-perapp-guest@invalid.local', 'x', now(), now(), now();
insert into public.utilisateurs (id, prenom, nom)
select ('ed000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'Upg', 'U' || k from decor
union all select 'ed000000-0000-4000-8000-000000000099', 'Upg', 'Invité'
on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin)
select ('ee100000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'Upgrade per-app U' || k, 'UPPA' || lpad(k::text, 4, '0'), 'essai', essai_debut, essai_fin from decor
union all select 'ee100000-0000-4000-8000-000000000099', 'Upgrade per-app invité', 'UPPA0099', 'actif', current_date - 60, current_date - 30;
update public.entreprises e set abonnement_statut = d.statut, suspension_prevue_at = now() + d.suspension
from decor d where e.id = ('ee100000-0000-4000-8000-' || lpad(d.k::text, 12, '0'))::uuid;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, statut)
select ('ed000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, ('ee100000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'actif' from decor
union all select 'ed000000-0000-4000-8000-000000000099', 'ee100000-0000-4000-8000-000000000099', 'actif';
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, valide_jusqu_au)
select ('ee100000-0000-4000-8000-' || lpad(d.k::text, 12, '0'))::uuid, a, a is distinct from d.retire, 'legacy',
       case when a = d.echu then now() - interval '1 day' end
from decor d, unnest(d.apps) a
union all select 'ee100000-0000-4000-8000-000000000099', 'reserves', true, 'reserves_invitation_gratuite', null;
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
select ('ee100000-0000-4000-8000-' || lpad(d.k::text, 12, '0'))::uuid, ('ed000000-0000-4000-8000-' || lpad(d.k::text, 12, '0'))::uuid, a,
       case a when 'tools' then 'tools_pro' when 'colors' then 'colors_admin_organisation' else 'reserves_admin_organisation' end
from decor d, unnest(d.apps) a
union all select 'ee100000-0000-4000-8000-000000000099', 'ed000000-0000-4000-8000-000000000099', 'reserves', 'reserves_intervenant';
-- U2 (GP annulé) accueille un intervenant actif (l'invité).
insert into public.reserves_chantiers (id, entreprise_id, nom, created_by) values ('ee200000-0000-4000-8000-000000000002', 'ee100000-0000-4000-8000-000000000002', 'Chantier U2', 'ed000000-0000-4000-8000-000000000002');
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat, statut, entreprise_intervenante_id, created_by, rejoint_at)
values ('ee300000-0000-4000-8000-000000000002', 'ee100000-0000-4000-8000-000000000002', 'ee200000-0000-4000-8000-000000000002', 'Invité', 'Peinture', 'active', 'ee100000-0000-4000-8000-000000000099', 'ed000000-0000-4000-8000-000000000002', now());
SQL
grep -q ERROR "$OUT/decor_err" && { cat "$OUT/decor_err"; exit 1; }
verifier "décor chargé (9 entreprises)" "$(echo "select count(*) from public.entreprises where id::text like 'ee100000%';" | q)" "9"

acces() { # instantané de l'accès réel de chaque utilisateur habilité, par application
  for k in 1 2 3 4 5 6 7 8; do
    printf "set role authenticated;\nselect set_config('request.jwt.claims', '{\"sub\":\"ed000000-0000-4000-8000-%012d\",\"role\":\"authenticated\"}', false) is null;\nselect string_agg(a || '=' || public.a_acces_application('ee100000-0000-4000-8000-%012d', a), ',' order by a) from unnest(array['colors','reserves','tools']) a;\n" "$k" "$k" | q | tail -1 | sed "s/^/U$k:/"
  done
}
guest_ecriture() { # l'invité écrit-il encore chez U2 ? (D-01 : hôte fermé → lecture seule)
  echo "select public.reserves_hote_ecriture_ouverte('ee100000-0000-4000-8000-000000000002');" | q
}

echo "== 2. rapport d'impact AVANT migration =="
su postgres -c "psql -X -q -At -F'|' -d $DB -f $REPO/docs/runbooks/sql/ELSATIA_PER_APP_SUSPENSION_IMPACT_V1.sql" 2>&1 | grep '^ee100000' | cut -d'|' -f1,3,5,7 | sort > "$OUT/impact.txt"
cat "$OUT/impact.txt" | sed 's/^/  impact: /'

echo "== 3. accès AVANT =="
acces > "$OUT/avant.txt"; cat "$OUT/avant.txt" | sed 's/^/  /'
avant_d01=$(guest_ecriture)

echo "== 4. migration 20260929000801 =="
q < "$REPO/supabase/migrations/20260929000801_per_app_commercial_suspension_v1.sql" >/dev/null 2>"$OUT/err" || { echo "FAIL migration"; cat "$OUT/err"; exit 1; }
verifier "362 migrations" "$(ls "$REPO"/supabase/migrations/*.sql | wc -l)" "362"

echo "== 5. accès APRÈS et contrôles =="
acces > "$OUT/apres.txt"; cat "$OUT/apres.txt" | sed 's/^/  /'
pertes=$(paste -d'\n' "$OUT/avant.txt" "$OUT/apres.txt" | paste - - | awk '{ n=split($1,a,","); split($2,b,","); for(i=1;i<=n;i++){ if (a[i] ~ /=true$/ && b[i] ~ /=false$/) print a[i] } }' | wc -l)
verifier "aucune perte de droit (accès réel par utilisateur)" "$pertes" "0"
gains=$(paste -d'\n' "$OUT/avant.txt" "$OUT/apres.txt" | paste - - | awk '{ split($1,p,":"); n=split($1,a,","); split($2,b,","); for(i=1;i<=n;i++){ if (a[i] ~ /=false$/ && b[i] ~ /=true$/) { x=a[i]; sub(/^U[0-9]+:/,"",x); sub(/=false$/,"",x); print p[1] ":" x } } }' | sort | tr '\n' ' ')
verifier "gains réels = comptes à GP fermé avec droit ouvert" "$gains" "U1:colors U1:reserves U1:tools U2:reserves U3:colors U4:tools "
verifier "rapport de la migration = rapport d'impact pré-migration" \
  "$(echo "select entreprise_id || '|' || application_code || '|' || changement || '|' || intervenants_reserves_actifs from public.rapport_migration_suspension_par_app_v1 where entreprise_id::text like 'ee100000%' order by 1;" | q | sort | tr '\n' ' ')" \
  "$(awk -F'|' '{ print $1 "|" $2 "|" $3 "|" ($4==""?0:$4) }' "$OUT/impact.txt" | sort | tr '\n' ' ')"
verifier "rapport : aucune ligne perte_acces" "$(echo "select count(*) from public.rapport_migration_suspension_par_app_v1 where changement = 'perte_acces';" | q)" "0"
verifier "D-01 : l'intervenant de U2 (GP annulé, Réserves autorisé) repasse en écriture" "$avant_d01→$(guest_ecriture)" "f→t"
verifier "toutes les lignes existantes : statut entitled" "$(echo "select count(*) filter (where statut_commercial <> 'entitled') from public.acces_applications_entreprises;" | q)" "0"
verifier "aucune suspension globale posée" "$(echo "select count(*) from public.entreprises where suspension_globale_at is not null;" | q)" "0"
verifier "migration rejouée : refusée proprement (colonne existante), sans effet partiel" \
  "$(q < "$REPO/supabase/migrations/20260929000801_per_app_commercial_suspension_v1.sql" >/dev/null 2>&1; echo $?)" "3"
dump() { su postgres -c "pg_dump -s --no-owner -d $1" | grep -v '^--' | grep -v '^SET \|^SELECT pg_catalog\|^\\restrict\|^\\unrestrict' | sed '/^$/d'; }
dump "$DB" > "$OUT/upg.sql"; dump "$FRESH" > "$OUT/fresh.sql"
verifier "schéma upgradé identique au neuf (pg_dump -s, ACL comprises)" "$(diff "$OUT/upg.sql" "$OUT/fresh.sql" | wc -l)" "0"

echo "# PASS=$pass FAIL=$fail (journaux : $OUT)"
[ "$fail" -eq 0 ]
