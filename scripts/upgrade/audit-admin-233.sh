#!/usr/bin/env bash
# ELSATIA — UPG-SEC-1 : audit de 20260825000233 (julien@elsatia.fr, administrateur plateforme « total »)
# sur l'upgrade Production 210 → tête V9.x. Lecture du comportement, AUCUNE modification du train.
#
# Scénarios (base 210 jetable, plan d'upgrade réel phase 0 + ordre lexical) :
#   S0  aucun compte Auth julien@elsatia.fr (ni julien.gregurec@gmail.com)
#   S1  compte Auth julien@elsatia.fr existant et confirmé AVANT l'upgrade ; julien.gregurec@gmail.com existant
#   S2  compte Auth julien@elsatia.fr existant NON confirmé
#   S3  comme S1, avec un facteur MFA vérifié pour chacun des deux comptes
# Mesures après upgrade : lignes plateforme_admins, est_plateforme_admin() / plateforme_est_proprietaire() sous
# l'identité de chaque compte (AAL1 et AAL2), et effet de plateforme_proprietaire_revendiquer().
# Mesure pendant l'upgrade : est_plateforme_admin() par EMAIL juste après 233 (modèle 210, avant 235).
# Usage : scripts/upgrade/audit-admin-233.sh --target-sha <sha> --source <base 210> --out <dossier>
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib/common.sh"
SHA=""; SRC=""; OUT=""
while [ $# -gt 0 ]; do case "$1" in --target-sha) SHA="$2"; shift 2;; --source) SRC="$2"; shift 2;; --out) OUT="$2"; shift 2;; *) upg_die "option $1";; esac; done
[ -n "$SHA" ] && [ -n "$SRC" ] && [ -n "$OUT" ] || upg_die "usage : --target-sha <sha> --source <base 210> --out <dossier>"
upg_garde_locale "$SHA" "$SRC" "$OUT"; upg_exists "$SRC" || upg_die "source $SRC absente"
mkdir -p "$OUT"; chmod 777 "$OUT"
upg_extraire_migrations "$REPO" "$SHA" "$OUT/target"; MIG="$OUT/target/supabase/migrations"
upg_ledger "$SRC" > "$OUT/ledger.txt"
python3 "$HERE/lib/classify.py" plan "$OUT/ledger.txt" "$MIG" "$OUT/plan.json" >/dev/null || upg_die "plan"
python3 -c "import json;[print(m) for m in json.load(open('$OUT/plan.json'))['en_attente']]" > "$OUT/en_attente.txt"

JE=a2330000-0000-0000-0000-000000000e15
JG=a2330000-0000-0000-0000-000000000961
sous() { # <base> <uid> <email> <aal> <sql>
  upg_q "$1" "begin; set local role authenticated; select set_config('request.jwt.claim.sub', '$2', true), set_config('request.jwt.claim.email', '$3', true), set_config('request.jwt.claims', json_build_object('sub', '$2', 'email', '$3', 'aal', '$4', 'role', 'authenticated')::text, true);
$5; rollback;" 2>&1 | awk '/ERROR/ {print; e=1; exit} {l=$0} END {if (!e) print l}' 
}
for sc in S0 S1 S2 S3; do
  db="audit233_$(echo $sc | tr 'S' 's')"; upg_clone "$SRC" "$db"
  case $sc in
    S1) upg_q "$db" "insert into auth.users (id, email, email_confirmed_at, confirmed_at) values ('$JE', 'julien@elsatia.fr', now() - interval '30 days', now() - interval '30 days'), ('$JG', 'julien.gregurec@gmail.com', now() - interval '300 days', now() - interval '300 days') on conflict do nothing" >/dev/null;;
    S3) upg_q "$db" "insert into auth.users (id, email, email_confirmed_at, confirmed_at) values ('$JE', 'julien@elsatia.fr', now() - interval '30 days', now() - interval '30 days'), ('$JG', 'julien.gregurec@gmail.com', now() - interval '300 days', now() - interval '300 days') on conflict do nothing; insert into auth.mfa_factors (user_id, factor_type, status) values ('$JE', 'totp', 'verified'), ('$JG', 'totp', 'verified')" >/dev/null;;
    S2) upg_q "$db" "insert into auth.users (id, email) values ('$JE', 'julien@elsatia.fr') on conflict do nothing" >/dev/null;;
  esac
  pendant="—"
  while read -r m; do
    [ -n "$m" ] || continue
    b=${m%.sql}; v=${b%%_*}; nom=${b#*_}
    { upg_contenu_migration "$MIG/$m" | python3 "$HERE/lib/strip_txn.py"; echo; echo "insert into supabase_migrations.schema_migrations(version, name) values ('$v', '$nom');"; } \
      | su postgres -c "psql -X -q -1 -v ON_ERROR_STOP=1 -d $db" >/dev/null 2>"$OUT/$sc.err" || upg_die "$sc : échec $m"
    if [ "$v" = 20260825000233 ]; then
      pendant=$(upg_q "$db" "select set_config('request.jwt.claim.email', 'julien@elsatia.fr', false), public.est_plateforme_admin()" | cut -d'|' -f2)
    fi
  done < "$OUT/en_attente.txt"
  {
    echo "### $sc"
    echo "est_plateforme_admin() par email juste après 233 (modèle 210, avant 235) : $pendant"
    echo "plateforme_admins après upgrade :"
    upg_q "$db" "select email, role, actif, statut_identite, proprietaire, coalesce(utilisateur_id::text, '∅'), coalesce(ajoute_par, '∅') from public.plateforme_admins where email like 'julien%' order by email" | sed 's/^/  /'
    for id in "$JE|julien@elsatia.fr" "$JG|julien.gregurec@gmail.com"; do
      uid=${id%%|*}; em=${id#*|}
      for aal in aal1 aal2; do
        echo "  $em ($aal) : est_plateforme_admin=$(sous "$db" "$uid" "$em" "$aal" "select public.est_plateforme_admin()")"
      done
    done
    echo "  revendication propriétaire julien@elsatia.fr (aal2) : $(sous "$db" "$JE" julien@elsatia.fr aal2 "select public.plateforme_proprietaire_revendiquer()" | cut -c1-160)"
    echo "  après revendication (même transaction) : $(sous "$db" "$JE" julien@elsatia.fr aal2 "select public.plateforme_proprietaire_revendiquer(); select 'est_plateforme_admin=' || public.est_plateforme_admin()::text")"
    echo "  revendication par un autre compte (aal2) : $(sous "$db" "$JG" julien.gregurec@gmail.com aal2 "select public.plateforme_proprietaire_revendiquer()" | cut -c1-160)"
  } | tee -a "$OUT/audit.txt"
  upg_drop "$db"
done
