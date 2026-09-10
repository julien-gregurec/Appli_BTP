#!/usr/bin/env bash
# Dépose dans le Storage de RECETTE les octets des deux documents « Emporter » déclarés par
# `prepare-pilote-mobile.sql` (a7000000-…-0011 et …-0012).
#
# Les octets sont embarqués ici : la recette vérifie des tailles EXACTES (92 et 70 octets), et
# un fichier régénéré différemment ferait échouer le test pour une mauvaise raison.
#
# Aucune clé dans ce fichier. Il lit l'environnement de la pile LOCALE de recette :
#   NEXT_PUBLIC_SUPABASE_URL      ex. http://127.0.0.1:60321
#   SUPABASE_SERVICE_ROLE_KEY     clé de service de cette pile locale
# Il refuse toute URL qui n'est pas locale : il ne doit jamais toucher un projet hébergé.
set -euo pipefail

: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquant}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquant}"
case "$NEXT_PUBLIC_SUPABASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refus : $NEXT_PUBLIC_SUPABASE_URL n'est pas une pile locale." >&2; exit 2 ;;
esac

BUCKET="chantier-documents"
DOSSIER="a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000002"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

deposer() {
  local nom="$1" mime="$2" taille="$3" contenu="$4"
  printf '%s' "$contenu" | base64 -d > "$TMP/$nom"
  [ "$(wc -c < "$TMP/$nom" | tr -d ' ')" = "$taille" ] || { echo "Taille inattendue pour $nom" >&2; exit 3; }
  curl -sS --fail-with-body -X POST \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: $mime" -H "x-upsert: true" \
    --data-binary "@$TMP/$nom" \
    "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/$BUCKET/$DOSSIER/$nom" > /dev/null
  echo "déposé : $nom ($taille octets)"
}

deposer recette-mobile-plan.pdf application/pdf 92 \
  "JVBERi0xLjQKJSBQbGFuIGRlIHJlY2V0dGUgbW9iaWxlIC0gZW1wb3J0ZXIgaG9ycyBsaWduZQoxIDAgb2JqPDw+PmVuZG9iagp0cmFpbGVyPDw+PgolJUVPRgo="
deposer recette-mobile-photo.png image/png 70 \
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
