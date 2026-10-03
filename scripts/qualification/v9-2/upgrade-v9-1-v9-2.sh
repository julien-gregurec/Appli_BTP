#!/usr/bin/env bash
# Train canonique V9.2 — upgrade V9.1 → V9.2 sur une base existante, ZÉRO perte silencieuse.
#
#  1. copie <base-source> (V9.1 construite et éventuellement peuplée) → <base-upg> ;
#  2. empreinte AVANT, ligne à ligne, de chaque table (schémas public, private, platform, auth,
#     storage), restreinte aux colonnes existant avant l'upgrade ;
#  3. applique, une par une et dans l'ordre lexical, les migrations du train postérieures à la
#     dernière V9.1 (20261002001302) — durée mesurée par migration ;
#  4. empreinte APRÈS sur les mêmes colonnes : toute table modifiée doit figurer dans la liste
#     des modifications attendues (migration responsable + raison), sinon ÉCART ;
#  5. catalogue (schéma, colonnes, contraintes, index, triggers, policies RLS, fonctions,
#     ACL tables/colonnes/fonctions/schémas, privilèges par défaut) : base upgradée = <base-v92-fraîche>.
#
# Usage : upgrade-v9-1-v9-2.sh <base-source> <base-upg> <base-v92-fraîche> <dossier-sortie>
set -euo pipefail
SRC="${1:?base source V9.1}"; UPG="${2:?base upgradee}"; FRESH="${3:?base V9.2 fraîche}"; OUT="${4:?dossier de sortie}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; DEPOT="$(cd "$ICI/../../.." && pwd)"
DERNIERE_V91=20261002001302
mkdir -p "$OUT"; chmod 777 "$OUT" 2>/dev/null || true
pg() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
val() { runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d "$UPG" -c "$1"; }

# Modifications de données ATTENDUES (colonnes préexistantes) : table → migration et raison.
declare -A ATTENDU=(
  [public.entreprises_dashboard_cache]="20261003001406 : recalcul du cache « Total facturé » hors brouillons et annulées (B25/N1)"
  [public.applications_elsatia]="20261003000103 : url_locale de Réserves 3020 → 3040 si valeur d'origine (A-10)"
)

pg -c "drop database if exists \"$UPG\"" -c "create database \"$UPG\" template \"$SRC\""
pg -c "alter database \"$UPG\" set search_path = public, extensions"

# Colonnes préexistantes par table, figées avant l'upgrade.
val "select n.nspname||'.'||c.relname||'|'||string_agg(quote_ident(a.attname), ',' order by a.attnum) l
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where c.relkind in ('r','p') and n.nspname in ('public','private','platform','auth','storage')
     group by n.nspname, c.relname order by 1" > "$OUT/colonnes_avant.txt"

empreinte() {
  local sql="$OUT/empreinte.sql"; : > "$sql"
  while IFS='|' read -r t cols; do
    local s=${t%%.*} r=${t#*.}
    echo "select '$t|n=' || count(*) || ' md5=' || coalesce(md5(string_agg(x, E'\\n' order by x)), '-') from (select (row($cols))::text x from \"$s\".\"$r\") z;" >> "$sql"
  done < "$OUT/colonnes_avant.txt"
  runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d "$UPG" -f "$sql"
}
echo "== 1. empreinte avant ($(wc -l < "$OUT/colonnes_avant.txt") tables) =="
empreinte > "$OUT/empreinte_avant.txt"
cles() { val "select 'factures=' || count(*) || ' ttc=' || coalesce(sum(montant_ttc),0) || ' paye=' || coalesce(sum(montant_paye),0) from public.factures;
              select 'paiements=' || count(*) || ' somme=' || coalesce(sum(montant),0) from public.paiements;
              select 'devis=' || count(*) || ' ttc=' || coalesce(sum(montant_ttc),0) from public.devis;
              select 'pointages=' || count(*) || ' heures=' || coalesce(sum(heures_normales + coalesce(heures_supplementaires,0)),0) from public.pointages;
              select 'documents_chantier=' || count(*) from public.documents_chantier;
              select 'entreprises=' || count(*) || ' abonnement=' || md5(coalesce(string_agg(id::text||abonnement_statut||coalesce(stripe_subscription_id,''), ',' order by id),'')) from public.entreprises;
              select 'utilisateurs_entreprises=' || count(*) from public.utilisateurs_entreprises;"; }
cles > "$OUT/cles_avant.txt"

echo "== 2. migrations postérieures à $DERNIERE_V91 =="
n=0; : > "$OUT/migrations.tsv"
for f in "$DEPOT"/supabase/migrations/*.sql; do
  nom="$(basename "$f")"; [[ "${nom:0:14}" > "$DERNIERE_V91" ]] || continue
  t0=$(date +%s%N)
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$f" | pg -d "$UPG" > "$OUT/migration_$nom.log" 2>&1 || { echo "   ❌ $nom"; cat "$OUT/migration_$nom.log"; exit 1; }
  ms=$(( ($(date +%s%N) - t0) / 1000000 )); n=$((n+1))
  printf '%s\t%s ms\n' "$nom" "$ms" | tee -a "$OUT/migrations.tsv" | sed 's/^/   OK /'
done
echo "   $n migration(s) appliquée(s)"

echo "== 3. empreinte après (mêmes colonnes) =="
empreinte > "$OUT/empreinte_apres.txt"
cles > "$OUT/cles_apres.txt"
ko=0; : > "$OUT/ecarts_donnees.txt"
while IFS= read -r l; do
  t=${l%%|*}
  if [ -n "${ATTENDU[$t]:-}" ]; then echo "ATTENDU $t — ${ATTENDU[$t]}" >> "$OUT/ecarts_donnees.txt"
  else echo "ECART $t" >> "$OUT/ecarts_donnees.txt"; ko=$((ko+1)); fi
done < <(diff <(sort "$OUT/empreinte_avant.txt") <(sort "$OUT/empreinte_apres.txt") | sed -n 's/^> //p')
sed 's/^/   /' "$OUT/ecarts_donnees.txt"
diff "$OUT/cles_avant.txt" "$OUT/cles_apres.txt" > /dev/null && echo "   ✅ données métier clés inchangées : $(tr '\n' ' ' < "$OUT/cles_apres.txt")" || { echo "   ❌ données métier clés modifiées"; ko=$((ko+1)); }

echo "== 4. catalogue : base upgradée = V9.2 fraîche =="
cat_() { runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d "$1" -f "$ICI/catalogue.sql"; }
cat_ "$UPG" > "$OUT/catalogue_upg.txt"; cat_ "$FRESH" > "$OUT/catalogue_fresh.txt"
if diff "$OUT/catalogue_upg.txt" "$OUT/catalogue_fresh.txt" > "$OUT/catalogue.diff"; then
  echo "   ✅ catalogue identique ($(wc -l < "$OUT/catalogue_upg.txt") objets) — ACL_DIFF=0 RLS_DIFF=0"
else
  echo "   ❌ $(grep -c '^[<>]' "$OUT/catalogue.diff") ligne(s) d'écart :"; grep '^[<>]' "$OUT/catalogue.diff" | cut -c1-220 | head -20
  ko=$((ko+1))
fi
echo "ZERO_PERTE_SILENCIEUSE=$([ $ko = 0 ] && echo OUI || echo NON) ecarts=$ko" | tee "$OUT/resultat.txt"
[ "$ko" = 0 ]
