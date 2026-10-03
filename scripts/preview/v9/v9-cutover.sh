#!/usr/bin/env bash
# ELSATIA — Pack opérateur V9 : cutover GÉNÉRIQUE de la base Preview vers le train local (Phase F).
#
# Aucun nombre codé : CURRENT_LEDGER (ledger exporté), TARGET_LEDGER (supabase/migrations de HEAD)
# et PENDING_MIGRATIONS (train − ledger, dans l'ordre) sont CALCULÉS et consignés.
#
# PAR DÉFAUT : DRY-RUN. Rien n'est appliqué sans --apply-preview ET --confirm-ref pgvvpqyjziyapbbkydmc.
# Même avec ces drapeaux, la garde de cible est rejouée JUSTE AVANT l'application.
# Jamais --include-all, jamais `migration repair`, jamais la Production (exhvuzegsefmoguxoiak).
#
# Étapes : 1 SHA git · 2 branche · 3 worktree propre (+ train local) · 4 garde de cible ·
#          5 lecture du ledger · 6 préfixe exact · 7 plan (PENDING_MIGRATIONS) · 8 sauvegarde déclarée ·
#          9 db push --dry-run · 10 exactement les PENDING du plan · 11 application (--apply-preview) ·
#          12 relecture du ledger · 13 ledger = train complet · 14 DB verify + contrôles V9 · 15 rapport + porte code.
# Ponts phase 0 (`-- elsatia:upgrade-phase0`) : no-op en Preview (20260921000300 au ledger),
# appliqués dans l'ordre lexical normal ; sans 300 au ledger → refus (historique Production).
#
# Usage (depuis la racine du dépôt, branche du pack) :
#   scripts/preview/v9/v9-cutover.sh --out <dossier hors dépôt> --backup-manifest <manifeste.json>
#        [--apply-preview --confirm-ref pgvvpqyjziyapbbkydmc]      # applique (sinon dry-run)
#        [--verify-only]                                           # base déjà au train complet : étapes 12 → 15
#        [--resume-partial]                                        # reprise d'un push interrompu (préfixe exact partiel), cas A
#        [--attendu-courant <n>]                                   # exige CURRENT_LEDGER = n (facultatif)
#        [--offline-ledger <export> [--offline-dry-run <sortie>]]  # simulation hors ligne (jamais d'application)
#        [--local-harness]                                         # banc PostgreSQL local (ELSATIA_V9_HARNESS_DB)
# Environnement (jamais écrit dans le dépôt, jamais affiché) :
#   ELSATIA_PREVIEW_DB_URL   URL PostgreSQL de la Preview (lecture seule forcée par le pack)
#   SUPABASE_DB_PASSWORD     mot de passe attendu par `supabase db push` (fourni par l'opérateur)
#   SUPABASE_BIN             commande de la CLI Supabase (défaut : « npx supabase »)
# Sorties : 0 succès de l'étape demandée · 1 NO-GO · 2 refus / usage · 3 base déjà au train complet (utiliser --verify-only).
# Compatible bash 3.2 (macOS) : ni tableaux associatifs, ni mapfile, ni ${var,,}.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
V9="$REPO/scripts/preview/v9"
REF_PREVIEW="pgvvpqyjziyapbbkydmc"
REF_PRODUCTION="exhvuzegsefmoguxoiak"

for a in "$@"; do
  case "$a" in
    --include-all|--include-all=*) echo "REFUS : --include-all est interdit par le pack V9 (historique linéaire exigé)." >&2; exit 2 ;;
  esac
done

OUT=""; BACKUP=""; APPLY=0; CONFIRM=""; VERIFY_ONLY=0; OFF_LEDGER=""; OFF_DRY=""; HARNESS=0; RESUME=0; COURANT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="${2:-}"; shift 2 ;;
    --backup-manifest) BACKUP="${2:-}"; shift 2 ;;
    --apply-preview) APPLY=1; shift ;;
    --confirm-ref) CONFIRM="${2:-}"; shift 2 ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --offline-ledger) OFF_LEDGER="${2:-}"; shift 2 ;;
    --offline-dry-run) OFF_DRY="${2:-}"; shift 2 ;;
    --local-harness) HARNESS=1; shift ;;
    --resume-partial) RESUME=1; shift ;;
    --attendu-courant) COURANT="${2:-}"; shift 2 ;;
    *) echo "REFUS : option inconnue $1" >&2; exit 2 ;;
  esac
done

refus() { echo "REFUS : $*" >&2; exit 2; }
stop() { echo "STOP (NO-GO) : $*" >&2; [ -n "${RAPPORT:-}" ] && node "$V9/cutover-step.mjs" report-set "$RAPPORT" verdict '"NO_GO"' >/dev/null; echo "CODE_DEPLOY_ALLOWED=false"; exit 1; }
etape() { echo; echo "── ÉTAPE $1 — $2"; }

[ -n "$OUT" ] || refus "--out <dossier hors dépôt> obligatoire"
mkdir -p "$OUT" || refus "dossier --out non créable"
OUT="$(cd "$OUT" && pwd)"
case "$OUT/" in "$REPO"/*) refus "--out doit être HORS du dépôt (exports et rapport ne doivent jamais être commités)" ;; esac
[ -n "$OFF_LEDGER" ] && [ "$APPLY" = 1 ] && refus "--offline-ledger est une simulation : --apply-preview interdit"
[ -n "$OFF_LEDGER" ] && [ "$HARNESS" = 1 ] && refus "--offline-ledger et --local-harness sont exclusifs"
[ "$VERIFY_ONLY" = 1 ] && [ "$APPLY" = 1 ] && refus "--verify-only et --apply-preview sont exclusifs"
[ "$VERIFY_ONLY" = 1 ] && [ "$RESUME" = 1 ] && refus "--verify-only et --resume-partial sont exclusifs"
if [ "$APPLY" = 1 ] && [ "$CONFIRM" != "$REF_PREVIEW" ]; then refus "--apply-preview exige --confirm-ref $REF_PREVIEW (confirmation explicite de la cible)"; fi
[ "$CONFIRM" = "$REF_PRODUCTION" ] && refus "--confirm-ref désigne la PRODUCTION"
case "$COURANT" in ""|*[!0-9]*) [ -n "$COURANT" ] && refus "--attendu-courant exige un nombre entier" ;; esac

MODE="dry-run"; [ "$APPLY" = 1 ] && MODE="apply"; [ "$VERIFY_ONLY" = 1 ] && MODE="verify"; [ -n "$OFF_LEDGER" ] && MODE="offline"
RAPPORT="$OUT/cutover-report.json"
rm -f "$RAPPORT"
node "$V9/cutover-step.mjs" report-set "$RAPPORT" mode "\"$MODE\"" >/dev/null
node "$V9/cutover-step.mjs" report-set "$RAPPORT" reprise "$([ "$RESUME" = 1 ] && echo true || echo false)" >/dev/null
node "$V9/cutover-step.mjs" report-set "$RAPPORT" harness "$([ "$HARNESS" = 1 ] && echo true || echo false)" >/dev/null
SHA_HEAD="$(node "$V9/cutover-step.mjs" head)" || refus "SHA de HEAD illisible"
node "$V9/cutover-step.mjs" report-set "$RAPPORT" sha_deploye "\"$SHA_HEAD\"" >/dev/null
echo "ELSATIA V9 — cutover Preview → train local (HEAD $SHA_HEAD) — mode $MODE$([ "$HARNESS" = 1 ] && echo ' (BANC LOCAL)') — sorties : $OUT"

# ── Accès base (lecture seule forcée) et CLI Supabase ─────────────────────────────────────────
if [ "$HARNESS" = 1 ]; then
  DB_HARNESS="${ELSATIA_V9_HARNESS_DB:-}"
  case "$DB_HARNESS" in elsatia_v9_harness_*) ;; *) refus "--local-harness exige ELSATIA_V9_HARNESS_DB=elsatia_v9_harness_<nom> (base locale jetable)" ;; esac
  [ -n "${ELSATIA_PREVIEW_DB_URL:-}" ] && refus "--local-harness : ELSATIA_PREVIEW_DB_URL doit être vide (aucune base distante)"
  SUPABASE_BIN="$V9/harness/supabase-sim.sh"
  psql_ro() { PGOPTIONS='-c default_transaction_read_only=on' psql -X -At -v ON_ERROR_STOP=1 -d "$DB_HARNESS" "$@"; }
  DB_VERIFY_URL="postgresql://localhost/$DB_HARNESS?host=/var/run/postgresql"
  # Banc neuf : ni propriétaire plateforme ni clé d'attestation (STEP 7 du runbook V3) → les 2
  # anomalies documentées de db-verify --before-owner sont tolérées. JAMAIS sur la Preview réelle.
  DB_VERIFY_ARGS=(--local-harness --before-owner)
else
  SUPABASE_BIN="${SUPABASE_BIN:-npx supabase}"
  psql_ro() { PGOPTIONS='-c default_transaction_read_only=on' PGCONNECT_TIMEOUT=15 psql "$ELSATIA_PREVIEW_DB_URL" -X -At -v ON_ERROR_STOP=1 "$@"; }
  DB_VERIFY_URL="${ELSATIA_PREVIEW_DB_URL:-}"
  DB_VERIFY_ARGS=()
fi

garde() {
  local args=(--ref "$REF_PREVIEW" --environment preview)
  if [ "$HARNESS" = 1 ]; then args+=(--no-linked); fi
  if [ -n "$OFF_LEDGER" ]; then args+=(--no-linked); fi
  node "$V9/guard-preview-target.mjs" "${args[@]}"
}

# ── 1-3 : git + train local ────────────────────────────────────────────────────────────────────
etape "1-3" "base V9.1 ancêtre de HEAD, branche, worktree propre, train local (TARGET_LEDGER)"
node "$V9/cutover-step.mjs" git-check || stop "contrôle git en échec (base V9.1 absente de HEAD, branche ou worktree sale)"
node "$V9/cutover-step.mjs" train-check || stop "train local non conforme aux invariants (plancher 813 originale, V9.1, phase 0)"
node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.git '{"ok":true}' >/dev/null

# ── 4 : garde de cible ─────────────────────────────────────────────────────────────────────────
etape 4 "garde de cible"
if [ "$HARNESS" = 0 ] && [ -z "$OFF_LEDGER" ]; then
  [ -n "${ELSATIA_PREVIEW_DB_URL:-}" ] || refus "ELSATIA_PREVIEW_DB_URL absente (URL PostgreSQL de la Preview)"
  [ -f "$REPO/supabase/.temp/project-ref" ] || refus "projet Supabase non lié : npx supabase link --project-ref $REF_PREVIEW"
fi
garde || refus "garde de cible : TARGET_REJECTED"
node "$V9/cutover-step.mjs" report-set "$RAPPORT" ref "\"$REF_PREVIEW\"" >/dev/null
node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.cible '{"ok":true}' >/dev/null

lire_ledger() { # $1 = fichier de sortie
  if [ -n "$OFF_LEDGER" ]; then cp "$OFF_LEDGER" "$1"; return; fi
  psql_ro -f "$REPO/docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql" > "$1.brut" || return 1
  node "$V9/cutover-step.mjs" ledger-tag "$REF_PREVIEW" "$1.brut" "$1" && rm -f "$1.brut"
}

verifier_apres() {
  etape 12 "relecture du ledger"
  lire_ledger "$OUT/ledger-apres.json" || stop "export du ledger après cutover impossible"
  etape 13 "ledger = train complet (CURRENT_LEDGER = TARGET_LEDGER), 813 originale"
  node "$V9/check-ledger-v9.mjs" "$OUT/ledger-apres.json" --expect post --require-813-proof
  local c=$?
  node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.ledger_apres "{\"verdict\":\"$( [ $c = 0 ] && echo PREVIEW_LEDGER_V9_COMPLETE || echo PREVIEW_LEDGER_DIVERGENCE)\"}" >/dev/null
  [ $c = 0 ] || stop "ledger après cutover ≠ train complet : runbook ELSATIA_V9_PREVIEW_ROLLBACK.md, cas A"

  etape 14 "DB verify (contrôles du train) + contrôles V9 post-cutover"
  ELSATIA_PREVIEW_DB_URL="$DB_VERIFY_URL" node "$REPO/scripts/preview/db-verify.mjs" ${DB_VERIFY_ARGS[@]+"${DB_VERIFY_ARGS[@]}"} | tee "$OUT/db-verify.txt"
  local dv=${PIPESTATUS[0]}
  node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.db_verify "{\"code\":$dv}" >/dev/null
  psql_ro -F '|' -f "$REPO/docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql" > "$OUT/v9-checks.txt" 2>"$OUT/v9-checks.err" || true
  node "$V9/cutover-step.mjs" v9-checks "$OUT/v9-checks.txt"
  local vc=$?
  node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.controles_v9 "{\"ok\":$([ $vc = 0 ] && echo true || echo false)}" >/dev/null

  etape 15 "rapport et porte « code après base »"
  node "$V9/code-deploy-gate.mjs" --report "$RAPPORT" --ledger "$OUT/ledger-apres.json"
  local g=$?
  node "$V9/cutover-step.mjs" report-set "$RAPPORT" verdict "\"$([ $g = 0 ] && echo DB_V9_CONFIRMED || echo NO_GO)\"" >/dev/null
  echo "Rapport : $RAPPORT"
  [ $g = 0 ] || exit 1
  exit 0
}

# ── Vérification seule (base déjà au train complet) ─────────────────────────────────────────────────────────
if [ "$VERIFY_ONLY" = 1 ]; then verifier_apres; fi

# ── 5-7 : ledger, préfixe, plan ────────────────────────────────────────────────────────────────
etape 5 "lecture du ledger Preview (lecture seule)"
lire_ledger "$OUT/ledger-avant.json" || stop "export du ledger impossible (connexion ? droits ?)"
ATTENTE=pre; PLAN_ARGS=(--require-813-proof); [ "$RESUME" = 1 ] && { ATTENTE=reprise; PLAN_ARGS+=(--resume); }
COURANT_ARGS=(); [ -n "$COURANT" ] && COURANT_ARGS=(--attendu-courant "$COURANT")
etape "6-7" "préfixe exact du train ($([ "$RESUME" = 1 ] && echo "reprise d'un push interrompu" || echo "CURRENT_LEDGER calculé")) et PENDING_MIGRATIONS"
node "$V9/check-ledger-v9.mjs" "$OUT/ledger-avant.json" --expect "$ATTENTE" --require-813-proof ${COURANT_ARGS[@]+"${COURANT_ARGS[@]}"} | tee "$OUT/ledger-avant.txt"
c=${PIPESTATUS[0]}
if [ $c = 3 ]; then node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.ledger_avant '{"verdict":"PREVIEW_LEDGER_ALREADY_V9"}' >/dev/null; echo "Base déjà au train complet : relancer avec --verify-only."; exit 3; fi
[ $c = 0 ] || { node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.ledger_avant '{"verdict":"PREVIEW_LEDGER_DIVERGENCE"}' >/dev/null; stop "ledger Preview non conforme à l'attente « $ATTENTE » : ne rien appliquer, décision humaine (ELSATIA_V9_PREVIEW_ROLLBACK.md)"; }
node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.ledger_avant "{\"verdict\":\"PREVIEW_LEDGER_PREFIX_OK\",\"reprise\":$([ "$RESUME" = 1 ] && echo true || echo false)}" >/dev/null
for k in CURRENT_LEDGER TARGET_LEDGER PENDING_MIGRATIONS; do
  v="$(sed -n "s/^$k=\([0-9][0-9]*\).*/\1/p" "$OUT/ledger-avant.txt" | head -n 1)"
  [ -n "$v" ] && node "$V9/cutover-step.mjs" report-set "$RAPPORT" "train.$k" "$v" >/dev/null
done
node "$V9/migration-plan-v9.mjs" "$OUT/ledger-avant.json" "${PLAN_ARGS[@]}" ${COURANT_ARGS[@]+"${COURANT_ARGS[@]}"} | tee "$OUT/plan.md"; [ "${PIPESTATUS[0]}" = 0 ] || stop "plan de migration non prouvé"

# ── 8 : sauvegarde déclarée ────────────────────────────────────────────────────────────────────
etape 8 "sauvegarde déclarée"
if [ -n "$BACKUP" ]; then
  node "$V9/backup-check.mjs" "$BACKUP"; b=$?
else
  echo "BACKUP_MISSING"; echo "  ✖ --backup-manifest absent"; b=1
fi
node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.sauvegarde "{\"ok\":$([ $b = 0 ] && echo true || echo false)}" >/dev/null
if [ $b != 0 ]; then
  [ "$APPLY" = 1 ] && stop "sauvegarde absente ou non conforme : application REFUSÉE"
  echo "  ! dry-run poursuivi SANS sauvegarde conforme : --apply-preview sera refusé tant qu'elle manque"
fi

# ── 9-10 : dry-run CLI et égalité avec le plan ─────────────────────────────────────────────────
etape "9-10" "supabase db push --dry-run : exactement les PENDING_MIGRATIONS du plan, dans l'ordre"
if [ -n "$OFF_LEDGER" ]; then
  if [ -n "$OFF_DRY" ]; then cp "$OFF_DRY" "$OUT/dry-run.txt"; else echo "  · dry-run CLI non exécuté (hors ligne, --offline-dry-run absent)"; fi
else
  $SUPABASE_BIN db push --linked --dry-run </dev/null > "$OUT/dry-run.txt" 2>&1 || { cat "$OUT/dry-run.txt"; stop "db push --dry-run en échec"; }
fi
if [ -f "$OUT/dry-run.txt" ]; then
  node "$V9/migration-plan-v9.mjs" "$OUT/ledger-avant.json" "${PLAN_ARGS[@]}" ${COURANT_ARGS[@]+"${COURANT_ARGS[@]}"} --dry-run "$OUT/dry-run.txt" || stop "le dry-run ne correspond pas EXACTEMENT au plan"
  node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.dry_run '{"ok":true}' >/dev/null
fi

if [ "$APPLY" = 0 ]; then
  echo
  echo "DRY-RUN TERMINÉ : rien n'a été appliqué. Plan : $OUT/plan.md"
  node "$V9/cutover-step.mjs" report-set "$RAPPORT" verdict "\"$([ $b = 0 ] && echo DRY_RUN_OK || echo DRY_RUN_OK_SANS_SAUVEGARDE)\"" >/dev/null
  echo "CODE_DEPLOY_ALLOWED=false"
  exit 0
fi

# ── 11 : application (seulement --apply-preview) ───────────────────────────────────────────────
etape 11 "application des migrations du plan sur la Preview"
garde || refus "garde de cible rejouée avant application : TARGET_REJECTED"
[ -f "$OUT/dry-run.txt" ] || stop "aucun dry-run validé : application refusée"
$SUPABASE_BIN --version 2>/dev/null | sed 's/^/  CLI Supabase : /'
$SUPABASE_BIN db push --linked --yes </dev/null 2>&1 | tee "$OUT/db-push.txt"
p=${PIPESTATUS[0]}
node "$V9/cutover-step.mjs" report-set "$RAPPORT" etapes.application "{\"ok\":$([ $p = 0 ] && echo true || echo false),\"code\":$p}" >/dev/null
if [ $p != 0 ]; then
  lire_ledger "$OUT/ledger-apres-echec.json" && node "$V9/check-ledger-v9.mjs" "$OUT/ledger-apres-echec.json" --expect post
  stop "db push en échec : NE PAS déployer le code ; runbook ELSATIA_V9_PREVIEW_ROLLBACK.md, cas A (preuves dans $OUT)"
fi
verifier_apres
