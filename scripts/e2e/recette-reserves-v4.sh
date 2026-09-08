#!/usr/bin/env bash
# Amorçage complet de la recette ELSATIA Réserves V4 sur une base JETABLE.
#
# Rejouable de bout en bout : chaque étape est idempotente, et la remise à zéro du décor
# rend le parcours navigateur reproductible (une invitation est à usage unique, un
# intervenant déjà rattaché ne rejoue pas le scénario).
#
# ⚠️ Ce script ne doit JAMAIS viser la stack de développement principale. Il exige une
# URL Supabase locale explicite et un conteneur de base nommé.
set -euo pipefail

CONTENEUR="${RESERVES_DB_CONTAINER:?Définir RESERVES_DB_CONTAINER (conteneur Postgres de la stack jetable)}"
: "${E2E_SUPABASE_URL:?Définir E2E_SUPABASE_URL (http://127.0.0.1:PORT)}"
: "${E2E_SUPABASE_SERVICE_ROLE_KEY:?Définir E2E_SUPABASE_SERVICE_ROLE_KEY}"

case "$E2E_SUPABASE_URL" in
  http://127.0.0.1:*) ;;
  *) echo "Recette strictement locale : E2E_SUPABASE_URL doit pointer sur 127.0.0.1." >&2; exit 1 ;;
esac
case "$CONTENEUR" in
  *btp-platform*) echo "Refus : ce conteneur est la stack de développement principale." >&2; exit 1 ;;
esac

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
psql_fichier() {
  docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 < "$1"
}

# Le jeu multi-tenant insère un MOUVEMENT DE STOCK de sortie. Ses insertions sont en
# `on conflict do nothing`, mais le trigger `appliquer_mouvement_stock()` a, lui, déjà
# décrémenté l'article au premier passage — et la ligne d'article n'est jamais réécrite.
# Au bout de dix rejeux, la quantité tombe à zéro et le décor entier s'arrête sur
# « Stock insuffisant », très loin de ce que la recette Réserves cherche à vérifier.
#
# On remet donc les deux articles de test à leur quantité nominale avant de rejouer. Ce
# n'est pas un contournement : c'est ce qui rend le script réellement rejouable, comme son
# en-tête l'annonce. Aucun autre article n'est touché — la clause porte sur les seuls
# identifiants du jeu de test.
echo "0/5 · Remise à niveau du stock du jeu de test"
docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
update public.articles_stock set quantite_stock = 10
 where id = 'ad000000-0000-0000-0000-000000000001' and quantite_stock < 10;
update public.articles_stock set quantite_stock = 20
 where id = 'bd000000-0000-0000-0000-000000000001' and quantite_stock < 20;
SQL

echo "1/5 · Jeu métier multi-tenant"
{ echo "begin;"; cat "$RACINE/supabase/tests/fixtures/isolation_multitenant.inc"; echo "commit;"; } \
  | docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1

echo "2/5 · Représentation Auth locale"
psql_fichier "$RACINE/scripts/e2e/prepare-local-recipe.sql"

echo "3/5 · Décor de collaboration V3"
psql_fichier "$RACINE/scripts/e2e/prepare-reserves-v3-recipe.sql"

echo "4/5 · Remise à zéro du parcours + décor des listes V4"
psql_fichier "$RACINE/scripts/e2e/reset-reserves-recipe.sql"
psql_fichier "$RACINE/scripts/e2e/prepare-reserves-v4-listes.sql"

echo "5/5 · Dépôt des objets (plan et photos)"
node "$RACINE/scripts/e2e/amorcer-recette-v4.mjs"

echo
echo "Décor prêt. Lancer ensuite :"
echo "  npm --prefix apps/reserves run build && npm --prefix apps/reserves run start"
echo "  E2E_RESERVES_URL=http://127.0.0.1:3020 npx playwright test reserves-v3 reserves-v4"
