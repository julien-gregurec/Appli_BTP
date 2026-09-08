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

echo "1/5 · Jeu métier multi-tenant"
{ echo "begin;"; cat "$RACINE/supabase/tests/fixtures/isolation_multitenant.inc"; echo "commit;"; } \
  | docker exec -i "$CONTENEUR" psql -U postgres -q -v ON_ERROR_STOP=1

echo "2/5 · Représentation Auth locale"
psql_fichier "$RACINE/scripts/e2e/prepare-local-recipe.sql"

echo "3/5 · Décor de collaboration V3"
psql_fichier "$RACINE/scripts/e2e/prepare-reserves-v3-recipe.sql"

# La normalisation Auth est REJOUÉE ici, et ce n'est pas une précaution de style.
# `prepare-reserves-v3-recipe.sql` crée le gérant de l'entreprise extérieure APRÈS
# l'étape 2 : ses colonnes de jetons restent donc NULL, et GoTrue échoue à les lire
# (« converting NULL to string is unsupported ») avec un 500 sur toute tentative de
# connexion. Le symptôme était intermittent en apparence seulement — il frappait
# systématiquement l'entreprise invitée, donc les seuls scénarios qui la font agir.
# Le script étant idempotent, le rejouer ici couvre tout compte créé par le décor.
psql_fichier "$RACINE/scripts/e2e/prepare-local-recipe.sql"

echo "4/5 · Remise à zéro du parcours + décor des listes V4"
psql_fichier "$RACINE/scripts/e2e/reset-reserves-recipe.sql"
psql_fichier "$RACINE/scripts/e2e/prepare-reserves-v4-listes.sql"

echo "5/5 · Dépôt des objets (plan et photos)"
node "$RACINE/scripts/e2e/amorcer-recette-v4.mjs"

echo
echo "Décor prêt. Lancer ensuite :"
echo "  npm --prefix apps/reserves run build && npm --prefix apps/reserves run start"
echo "  E2E_RESERVES_URL=http://127.0.0.1:3020 npx playwright test reserves-v3 reserves-v4"
