#!/usr/bin/env bash
# Vérification FONCTIONNELLE (pas seulement textuelle) que les policies RLS
# survivent à une restauration : se connecte comme le ferait l'application
# (rôle authenticator -> authenticated, avec les GUCs request.jwt.claim.*
# que PostgREST/Supabase positionnent normalement) et vérifie l'isolation
# multi-tenant réelle sur les tables métier. Complète 04_manifest.sh (qui ne
# compare que le TEXTE des policies, pas leur EFFET une fois exécutées).
#
# Usage: scripts/dr/08_verify_rls_functional.sh
#
# Prérequis: le jeu de données DR (03_seed_synthetic_dataset.sql) doit être
# chargé, avec les permissions du poste "Chef d'équipe" (voir ce fichier).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source lib/common.sh

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0
fi

dr_require_local_target

as_user() {
  local uid="$1" sql="$2"
  PGPASSWORD="${DR_PGPASSWORD:-}" psql -X -q -tA -h "$DR_PGHOST" -p "$DR_PGPORT" -U authenticator -d "$DR_PGDATABASE" <<SQL
set role authenticated;
set request.jwt.claim.sub = '${uid}';
set request.jwt.claim.role = 'authenticated';
${sql}
SQL
}

# anon n'a par construction aucun GRANT sur les tables métier (posé par les
# migrations) : une erreur "permission denied" est donc un résultat correct,
# au même titre qu'un jeu de résultats vide via RLS. On la traite comme 0.
as_anon() {
  local sql="$1" out
  out=$(PGPASSWORD="${DR_PGPASSWORD:-}" psql -X -q -tA -h "$DR_PGHOST" -p "$DR_PGPORT" -U authenticator -d "$DR_PGDATABASE" 2>/dev/null <<SQL
set role anon;
${sql}
SQL
) || true
  [[ -z "$out" ]] && out=0
  echo "$out"
}

FAIL=0

for suffixe in A B; do
  UID_VAL=$(dr_psql -tAc "select u.id from public.utilisateurs u join public.utilisateurs_entreprises ue on ue.utilisateur_id=u.id join public.entreprises e on e.id=ue.entreprise_id where e.reference_interne='DR-TENANT-${suffixe}' and ue.poste_id in (select id from public.postes where entreprise_id=e.id and nom='Chef d''équipe DR') limit 1")
  [[ -n "$UID_VAL" ]] || dr_die "Utilisateur Chef d'équipe introuvable pour DR-TENANT-${suffixe} (jeu de données chargé ?)"

  OTHER_TENANTS=$(as_user "$UID_VAL" "select string_agg(distinct e.reference_interne, ',') from public.clients c join public.entreprises e on e.id=c.entreprise_id where e.reference_interne like 'DR-TENANT-%' and e.reference_interne <> 'DR-TENANT-${suffixe}';")
  COUNT_OWN=$(as_user "$UID_VAL" "select count(*) from public.clients c join public.entreprises e on e.id=c.entreprise_id where e.reference_interne = 'DR-TENANT-${suffixe}';")

  if [[ -n "$OTHER_TENANTS" ]]; then
    dr_log "ECHEC isolation: utilisateur DR-TENANT-${suffixe} voit aussi des clients de: $OTHER_TENANTS"
    FAIL=1
  elif [[ "$COUNT_OWN" == "0" ]]; then
    dr_log "ECHEC: utilisateur DR-TENANT-${suffixe} ne voit AUCUN client de son propre tenant (RLS trop restrictive ou permissions manquantes)."
    FAIL=1
  else
    dr_log "OK DR-TENANT-${suffixe}: $COUNT_OWN client(s) visibles, tous du bon tenant, aucune fuite cross-tenant."
  fi
done

ANON_COUNT=$(as_anon "select count(*) from public.clients;")
if [[ "$ANON_COUNT" != "0" ]]; then
  dr_log "ECHEC: le rôle anon (non authentifié) voit $ANON_COUNT client(s) — devrait être 0."
  FAIL=1
else
  dr_log "OK: le rôle anon (non authentifié) ne voit aucun client."
fi

if [[ "$FAIL" == "0" ]]; then
  dr_log "OK: isolation RLS multi-tenant fonctionnellement intacte."
else
  dr_die "Vérification RLS fonctionnelle échouée (voir ci-dessus)."
fi
