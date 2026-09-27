#!/usr/bin/env bash
# ELSATIA — Stripe Trial Synchronization V1 : qualification d'UPGRADE.
#
# Base à l'état du train canonique V3 (toutes les migrations jusqu'à
# 20260926000505 incluse) + jeu pilote GP + entreprises en essai à différents
# jours (0, 1, 10, 15, 29, 30, expiré, converti, abonnées Stripe) → instantané
# → migrations 506 (ordre) et 507 (essai) → instantané → comparaison, schéma
# comparé au fresh, suites pgTAP Stripe sur la base upgradée.
#
# Usage : scripts/qualification/stripe-trial-upgrade.sh [base-upgrade] [base-fresh]
# Prérequis : PostgreSQL 16 local (peer auth `postgres`), pgTAP, python3.
# Aucun appel réseau, aucune Preview, aucune Production.
set -uo pipefail

DB="${1:-trial_upgrade}"
FRESH="${2:-trial_upgrade_fresh}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
DERNIERE_V3="20260926000505"
OUT="$(mktemp -d)"
chmod 777 "$OUT"
echec=0

psql_db() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1"; }
appliquer() {
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$2" | psql_db "$1" >/dev/null 2>"$OUT/err" \
    || { echo "FAIL migration $(basename "$2") sur $1"; cat "$OUT/err"; exit 1; }
}
verifier() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; else echo "  ❌ $1 (obtenu: $2, attendu: $3)"; echec=1; fi; }

echo "== 1. Base V3 ($DERNIERE_V3) =="
su postgres -c "psql -X -q -c 'drop database if exists \"$DB\";' -c 'create database \"$DB\";'"
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$DB -d $DB -f $BOOT/pg_bootstrap.sql" >/dev/null
n=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" > "$DERNIERE_V3" ]] && continue
  appliquer "$DB" "$f"; n=$((n+1))
done
echo "  $n migrations V3 appliquées"

echo "== 2. Jeu de données =="
psql_db "$DB" < "$REPO/supabase/production/seed_entreprise_pilote_btp.sql" >/dev/null 2>"$OUT/err" \
  || { echo "seed pilote : échec"; cat "$OUT/err"; exit 1; }
# Essais à différents jours : l'essai débute à created_at::date (trigger
# initialiser_essai_entreprise) ; les dates sont posées explicitement, comme
# après 30 jours de vie réelle, et respectent la contrainte existante.
psql_db "$DB" <<'SQL' >/dev/null || { echo "seed essais : échec"; exit 1; }
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id, stripe_subscription_id) values
  ('a7000000-0000-4000-8000-000000000000', 'UPG jour 0',   'UPGJ0000', 'essai',  current_date,      current_date + 30, null, null),
  ('a7000000-0000-4000-8000-000000000001', 'UPG jour 1',   'UPGJ0001', 'essai',  current_date - 1,  current_date + 29, null, null),
  ('a7000000-0000-4000-8000-000000000010', 'UPG jour 10',  'UPGJ0010', 'essai',  current_date - 10, current_date + 20, 'cus_upg_10', null),
  ('a7000000-0000-4000-8000-000000000015', 'UPG jour 15',  'UPGJ0015', 'essai',  current_date - 15, current_date + 15, null, null),
  ('a7000000-0000-4000-8000-000000000029', 'UPG jour 29',  'UPGJ0029', 'essai',  current_date - 29, current_date + 1,  null, null),
  ('a7000000-0000-4000-8000-000000000030', 'UPG jour 30',  'UPGJ0030', 'essai',  current_date - 30, current_date,      null, null),
  ('a7000000-0000-4000-8000-000000000040', 'UPG expiré',   'UPGEXP01', 'essai',  current_date - 45, current_date - 15, null, null),
  ('a7000000-0000-4000-8000-000000000050', 'UPG converti', 'UPGCNV01', 'actif',  current_date - 40, current_date - 12, 'cus_upg_50', 'sub_upg_50'),
  ('a7000000-0000-4000-8000-000000000060', 'UPG raccourci','UPGRAC01', 'essai',  current_date - 5,  current_date + 3,  'cus_upg_60', 'sub_upg_60'),
  ('a7000000-0000-4000-8000-000000000070', 'UPG annulé',   'UPGANN01', 'annule', current_date - 60, current_date - 30, 'cus_upg_70', 'sub_upg_70')
on conflict (id) do nothing;
SQL
psql_db "$DB" <<'SQL' > "$OUT/essais_avant.txt"
\pset format unaligned
\pset tuples_only on
select id || '|' || abonnement_statut || '|' || abonnement_essai_debut || '|' || abonnement_essai_fin || '|' || coalesce(stripe_subscription_id, '')
  from public.entreprises order by id;
SQL
python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/avant.json" >/dev/null

echo "== 3. Upgrade : 506 + 507 =="
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" > "$DERNIERE_V3" ]] || continue
  appliquer "$DB" "$f"; echo "  appliquée : $(basename "$f")"
done
# Idempotence : 507 rejouée sur la base upgradée.
appliquer "$DB" "$REPO/supabase/migrations/20260927000507_stripe_trial_synchronization_v1.sql"
echo "  507 rejouée : sans erreur"
python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/apres.json" --colonnes-de "$OUT/avant.json" >/dev/null
psql_db "$DB" <<'SQL' > "$OUT/essais_apres.txt"
\pset format unaligned
\pset tuples_only on
select id || '|' || abonnement_statut || '|' || abonnement_essai_debut || '|' || abonnement_essai_fin || '|' || coalesce(stripe_subscription_id, '')
  from public.entreprises order by id;
SQL

echo "== 4. Comparaison =="
python3 - "$OUT/avant.json" "$OUT/apres.json" > "$OUT/cmp.txt" <<'PY'
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
ecarts = {t: (a["row_counts"][t], b["row_counts"].get(t)) for t in a["row_counts"] if a["row_counts"][t] != b["row_counts"].get(t)}
nouvelles = sorted(set(b["row_counts"]) - set(a["row_counts"]))
chk = [t for t in a["checksums"] if a["checksums"][t] != b["checksums"].get(t)]
pol_a = {json.dumps(p, sort_keys=True) for p in a["rls"]["policies"]} if isinstance(a.get("rls"), dict) and "policies" in a["rls"] else None
pol_b = {json.dumps(p, sort_keys=True) for p in b["rls"]["policies"]} if isinstance(b.get("rls"), dict) and "policies" in b["rls"] else None
probe = [k for k in a.get("rls_probe", {}) if a["rls_probe"][k] != b.get("rls_probe", {}).get(k)]
print(f"tables={len(a['row_counts'])}")
print(f"row_count_ecarts={len(ecarts)} {ecarts}")
print(f"nouvelles={','.join(nouvelles)}")
print(f"checksums={len(a['checksums'])} ecarts={len(chk)} {chk}")
if pol_a is not None:
    print(f"policies_supprimees={len(pol_a - pol_b)} ajoutees={len(pol_b - pol_a)}")
print(f"rls_probe={len(a.get('rls_probe', {}))} ecarts={len(probe)}")
PY
cat "$OUT/cmp.txt" | sed 's/^/  /'
verifier "row counts identiques" "$(grep -c '^row_count_ecarts=0 ' "$OUT/cmp.txt")" "1"
verifier "checksums métier identiques" "$(grep -c ' ecarts=0 \[\]$' "$OUT/cmp.txt")" "1"
verifier "sonde RLS identique" "$(grep -c '^rls_probe=.* ecarts=0$' "$OUT/cmp.txt")" "1"
verifier "essais (statut, début, fin, subscription) inchangés par l'upgrade" "$(diff -q "$OUT/essais_avant.txt" "$OUT/essais_apres.txt" >/dev/null && echo oui || echo non)" "oui"
verifier "aucun essai hors fenêtre après upgrade" "$(su postgres -c "psql -X -At -d $DB -c \"select count(*) from public.entreprises where abonnement_essai_fin is null or abonnement_essai_fin not between abonnement_essai_debut and abonnement_essai_debut + 30\"")" "0"

echo "== 5. Schéma upgrade vs fresh ==" # (jeton aléatoire \\restrict de pg_dump exclu)
"$BOOT/rebuild_db.sh" "$FRESH" >/dev/null 2>&1 || { echo "fresh : échec"; exit 1; }
su postgres -c "pg_dump -s -d $DB" | grep -v '^--' | grep -v '^$' | grep -Ev '^.(un)?restrict ' > "$OUT/schema_upg.sql"
su postgres -c "pg_dump -s -d $FRESH" | grep -v '^--' | grep -v '^$' | grep -Ev '^.(un)?restrict ' > "$OUT/schema_fresh.sql"
verifier "schéma (ACL comprises) identique au fresh ($(wc -l < "$OUT/schema_fresh.sql") lignes)" \
  "$(diff -q "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" >/dev/null && echo identique || echo différent)" "identique"

echo "== 6. Comportement sur la base upgradée =="
# Un webhook legacy (trial 30 j depuis le jour 15) sur une entreprise existante : borné, pas d'erreur.
res=$(su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" <<'SQL'
begin;
select public.synchroniser_abonnement_stripe_ordonne_service(
  'a7000000-0000-4000-8000-000000000015', 'sub_upg_15', 'cus_upg_15', 'essai', 'pro', 'mensuel', current_date + 45,
  current_date + 30, null, now(), now() + interval '30 days', 'evt_upg_15', 'customer.subscription.created', now(), 'subscription', 'sub_upg_15')->>'decision'
  || '|' || (select abonnement_essai_fin - abonnement_essai_debut from public.entreprises where id = 'a7000000-0000-4000-8000-000000000015');
rollback;
SQL
)
verifier "jour 15 + trial legacy 30 j : appliqué, fenêtre bornée à 30 jours" "$res" "applique|30"
res=$(su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" <<'SQL'
begin;
select public.synchroniser_abonnement_stripe_ordonne_service(
  'a7000000-0000-4000-8000-000000000060', 'sub_upg_60', 'cus_upg_60', 'actif', 'pro', 'mensuel', current_date + 30,
  null, null, now(), now() + interval '30 days', 'evt_upg_60', 'customer.subscription.updated', now(), 'subscription', 'sub_upg_60')->>'decision'
  || '|' || (select abonnement_essai_fin - current_date from public.entreprises where id = 'a7000000-0000-4000-8000-000000000060');
rollback;
SQL
)
verifier "abonnée existante, trial_end null : appliqué, essai local conservé" "$res" "applique|3"
cd "$REPO/supabase/tests"
chmod o+r ./*.sql 2>/dev/null
if su postgres -c "cd $PWD && pg_prove -d $DB stripe_trial_synchronization_v1.test.sql stripe_trial_checkout_exhaustive_v1.test.sql stripe_event_ordering_v1.test.sql stripe_subscription_webhook_acl_v1.test.sql" > "$OUT/prove.txt" 2>&1; then
  echo "  ✅ pgTAP Stripe sur base upgradée : $(grep -o 'Tests=[0-9]*' "$OUT/prove.txt")"
else
  echo "  ❌ pgTAP Stripe sur base upgradée"; cat "$OUT/prove.txt"; echec=1
fi

echo
if [ $echec -eq 0 ]; then echo "UPGRADE STRIPE TRIAL : OK"; else echo "UPGRADE STRIPE TRIAL : ÉCHEC"; fi
exit $echec
