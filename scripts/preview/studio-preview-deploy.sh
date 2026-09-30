#!/usr/bin/env bash
# ELSATIA Studio — déploiement de la Preview Studio DÉDIÉE (B + I1). Opérateur humain, poste lié.
#
# Chaque sous-commande qui écrit à distance passe d'abord par la garde de cible
# (scripts/preview/studio-preview-guard.mjs --check-links) : SUPABASE STUDIO PREVIEW + VERCEL STUDIO
# PREVIEW identifiés, sinon STOP WRITES. Jamais `--prod`, jamais studio.elsatia.fr, jamais le projet
# Supabase GP. Aucune valeur de secret n'est affichée.
#
# Variables (hors dépôt) :
#   STUDIO_PREVIEW_ENV_FILE    fichier dotenv web Studio Preview (ex. ~/elsatia-studio-preview/studio.env)
#   STUDIO_PREVIEW_WORKER_ENV  fichier dotenv du worker (facultatif)
#   STUDIO_PREVIEW_REF         référence du projet Supabase Studio Preview
#   STUDIO_PREVIEW_BACKUP_DIR  dossier des sauvegardes (défaut ~/elsatia-studio-preview/backups)
#
# Usage : scripts/preview/studio-preview-deploy.sh <guard|ledger|backup|migrate|env|deploy|alias|smoke|disable|rollback> [args]
#   migrate  exige STUDIO_PREVIEW_CONFIRM_MIGRATE=YES (après backup + ledger)
#   alias    <deployment-url>  → studio-preview.elsatia.fr
#   rollback <deployment-url-précédente> → réattribue l'alias Preview (aucune suppression)
#   disable  STUDIO_ENABLED=0 sur la cible Preview + redéploiement (coupe-circuit : 503 partout)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$ROOT/apps/studio"
DOMAIN="studio-preview.elsatia.fr"
PROJECT="elsatia-studio-preview"
BACKUP_DIR="${STUDIO_PREVIEW_BACKUP_DIR:-$HOME/elsatia-studio-preview/backups}"
die() { echo "REFUS : $*" >&2; exit 2; }
for a in "$@"; do case "$a" in --prod|--production|--target=production) die "option Production interdite ($a)";; esac; done
[ -n "${STUDIO_PREVIEW_ENV_FILE:-}" ] || die "STUDIO_PREVIEW_ENV_FILE requis"
[ -n "${STUDIO_PREVIEW_REF:-}" ] || die "STUDIO_PREVIEW_REF requis"

guard() {
  local extra=()
  [ -n "${STUDIO_PREVIEW_WORKER_ENV:-}" ] && extra=(--worker-env-file "$STUDIO_PREVIEW_WORKER_ENV")
  node "$ROOT/scripts/preview/studio-preview-guard.mjs" --env-file "$STUDIO_PREVIEW_ENV_FILE" \
    --studio-ref "$STUDIO_PREVIEW_REF" --check-links ${extra[@]+"${extra[@]}"} || { echo "STOP WRITES" >&2; exit 1; }
}
supa() { (cd "$ROOT" && npx --yes supabase "$@" --workdir apps/studio); }
vercel() { npx --yes vercel "$@" --cwd "$APP"; }

cmd="${1:-}"; shift || true
case "$cmd" in
  guard) guard ;;
  ledger)  # lecture seule : registre distant vs chaîne dédiée locale
    guard
    supa migration list --linked
    echo "Chaîne locale : $(ls "$APP/supabase/migrations"/*.sql | wc -l) migrations dédiées"
    ;;
  backup)  # avant toute modification si des données existent
    guard
    mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    supa db dump --linked -f "$BACKUP_DIR/studio-preview-schema-$ts.sql"
    supa db dump --linked --data-only -f "$BACKUP_DIR/studio-preview-data-$ts.sql"
    supa migration list --linked > "$BACKUP_DIR/studio-preview-ledger-$ts.txt"
    echo "Sauvegarde : $BACKUP_DIR (*-$ts.*). Storage non couvert : voir le rapport §Storage."
    ;;
  migrate)
    guard
    [ "${STUDIO_PREVIEW_CONFIRM_MIGRATE:-}" = "YES" ] || die "STUDIO_PREVIEW_CONFIRM_MIGRATE=YES requis (backup + ledger faits ?)"
    node "$ROOT/scripts/verify-migration-targets.mjs"
    supa db push --linked --dry-run
    supa db push --linked
    supa migration list --linked
    ;;
  env)  # pousse les variables du fichier vers la cible Preview du projet Vercel Studio (valeurs jamais affichées)
    guard
    while IFS= read -r line || [ -n "$line" ]; do
      [[ "$line" =~ ^[[:space:]]*# || -z "${line// }" ]] && continue
      name="${line%%=*}"; value="${line#*=}"; value="${value%\"}"; value="${value#\"}"
      [ -z "$value" ] && { echo "  · $name vide : ignorée"; continue; }
      vercel env rm "$name" preview --yes >/dev/null 2>&1 || true
      printf '%s' "$value" | vercel env add "$name" preview >/dev/null
      echo "  ✓ $name (preview)"
    done < "$STUDIO_PREVIEW_ENV_FILE"
    ;;
  deploy)
    guard
    url="$(vercel deploy --yes)"
    echo "Déploiement Preview : $url"
    ;;
  alias)
    guard
    [ -n "${1:-}" ] || die "alias <deployment-url>"
    vercel alias set "$1" "$DOMAIN"
    ;;
  smoke)
    [ -n "${1:-}" ] || die "smoke <url>"
    extra=(); [[ "$1" == *"$DOMAIN"* ]] && extra=(--allow-custom-domain)
    node "$ROOT/scripts/preview/studio-preview-smoke.mjs" --studio "$1" --supabase-url "https://$STUDIO_PREVIEW_REF.supabase.co" --env-file "$STUDIO_PREVIEW_ENV_FILE" ${extra[@]+"${extra[@]}"}
    ;;
  disable)
    guard
    vercel env rm STUDIO_ENABLED preview --yes >/dev/null 2>&1 || true
    printf '0' | vercel env add STUDIO_ENABLED preview >/dev/null
    url="$(vercel deploy --yes)"
    vercel alias set "$url" "$DOMAIN"
    echo "Studio Preview désactivée (503) : $url"
    ;;
  rollback)
    guard
    [ -n "${1:-}" ] || die "rollback <deployment-url-précédente>"
    vercel alias set "$1" "$DOMAIN"
    echo "Alias $DOMAIN → déploiement précédent. Base : restauration manuelle depuis $BACKUP_DIR si nécessaire (jamais de suppression de base)."
    ;;
  *) die "sous-commande inconnue : ${cmd:-∅} (guard|ledger|backup|migrate|env|deploy|alias|smoke|disable|rollback)";;
esac
