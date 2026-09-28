#!/usr/bin/env bash
# Rejoue la chaîne du projet Supabase DÉDIÉ Studio (apps/studio/supabase/migrations, SEULE) sur une
# base PostgreSQL 16 locale vierge, puis les suites pgTAP Studio valables sur ce projet.
# Substitut local du second `supabase db reset --workdir apps/studio` + `supabase test db` (CI double),
# sans Docker. Aucun service distant. Usage : apps/studio/scripts/dedicated-db-check.sh [nom-base]
set -uo pipefail
DB="${1:-studio_dedicated_check}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
pg() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 $*"; }

pg "-c 'drop database if exists \"$DB\";' -c 'create database \"$DB\";'" || exit 1
pg "-v dbname=$DB -d $DB -f $REPO/scripts/local-postgres-bootstrap/pg_bootstrap.sql" >/dev/null 2>&1 || { echo "bootstrap KO"; exit 1; }
# GoTrue crée auth.sessions sur un vrai projet ; le substitut n'a que auth.users.
pg "-d $DB -c 'create table if not exists auth.sessions (id uuid primary key, user_id uuid);'" || exit 1
for f in "$REPO"/apps/studio/supabase/migrations/*.sql; do
  pg "-d $DB -f $f" >/dev/null || { echo "ÉCHEC migration $(basename "$f")"; exit 1; }
done
echo "chaîne dédiée : $(ls "$REPO"/apps/studio/supabase/migrations/*.sql | wc -l) migrations appliquées"
gp=$(su postgres -c "psql -X -At -d $DB -c \"select count(*) from pg_tables where schemaname='public' and tablename not like 'studio\\_%'\"")
[ "$gp" = "0" ] || { echo "ÉCHEC : $gp table(s) non Studio dans le projet dédié"; exit 1; }

run() { # fichier
  out=$(su postgres -c "psql -X -q -At -d $DB -f $1" 2>&1)
  ok=$(grep -c '^ok' <<<"$out"); nok=$(grep -c '^not ok' <<<"$out"); err=$(grep -m1 'ERROR' <<<"$out")
  printf '%-52s ok=%-4s not_ok=%s %s\n' "$(basename "$1")" "$ok" "$nok" "$err"
  [ "$nok" = 0 ] && [ -z "$err" ] && [ "$ok" -gt 0 ]
}
status=0
# Instance jetable : ses comptes de test ne passent pas par le pont (non liés). La garde d'écriture
# centrale les refuse par défaut (fail-closed) ; on l'autorise ici EXPLICITEMENT, comme
# scripts/local-test.mjs. Jamais sur un projet hébergé. La suite studio_db_write_guard le remet à
# false pour prouver le refus.
pg "-d $DB -c \"update studio_guard.control set allow_unlinked_writes = true\"" >/dev/null
# Suites propres au projet dédié (politique héritée laissée « closed » : elles la posent elles-mêmes).
for t in "$REPO"/apps/studio/supabase/tests/*.test.sql; do run "$t" || status=1; done
run "$REPO/supabase/tests/studio_signup_policy.test.sql" || status=1
# Suites métier de la racine : comptes hors pont, donc politique « open » comme scripts/local-test.mjs.
pg "-d $DB -c \"update public.studio_signup_policy set mode = 'open'\"" >/dev/null
for name in analysis editor media_upload project_management render_engine templates timeline; do
  run "$REPO/supabase/tests/studio_$name.test.sql" || status=1
done
# Non rejouées ici (coexistence avec le projet PARTAGÉ, sans objet sur le projet dédié) :
#   studio_final_qualification_v3.test.sql (public.entreprises) ;
#   studio_workspace_foundation.test.sql → remplacée par studio_workspace_foundation_dedicated.test.sql.
[ $status = 0 ] && echo "OK : projet dédié Studio conforme" || echo "ÉCHEC"
exit $status
