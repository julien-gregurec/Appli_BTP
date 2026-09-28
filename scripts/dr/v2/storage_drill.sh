#!/usr/bin/env bash
# DR V2 — drill Storage avec la VRAIE API Storage (image supabase/storage-api, backend fichier).
# Rapport : docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md §8.
#
# Usage : scripts/dr/v2/storage_drill.sh [dossier-de-sortie]
# Prérequis : Docker (démon joignable) et l'image STORAGE_IMAGE (défaut supabase/storage-api:v1.25.7),
# PostgreSQL 16 local. Si l'un manque, le drill s'arrête avec le verdict STORAGE_NOT_PROVEN
# (code 2) : il ne prétend jamais qualifier Storage sans vraie storage-api.
#
# Distingue explicitement :
#   - MÉTADONNÉES Storage (storage.buckets / storage.objects, dans PostgreSQL → pg_dump) ;
#   - FICHIERS (octets, hors PostgreSQL → archive séparée du magasin d'objets).
# Scénarios :
#   S0  sauvegarde APPARIÉE (même backup_id) : pg_dump de la base Storage + archive des fichiers
#       + manifeste SHA-256 de chaque objet TÉLÉCHARGÉ par l'API ;
#   S1  restauration de la base SEULE après des écritures postérieures (ajout, suppression,
#       remplacement) : métadonnées ≠ fichiers → objets illisibles et fichiers orphelins ;
#   S2  perte totale (base + fichiers) → restauration appariée → chaque objet re-téléchargé
#       par l'API avec le SHA-256 du manifeste ; URL signée émise avant la sauvegarde.
#       Contre-épreuve : une archive des fichiers SANS attributs étendus (tar par défaut) rend
#       tous les objets illisibles — l'archive doit être faite avec --xattrs.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
set +e

OUT="${1:-/tmp/elsatia-dr-v2/storage-$(date -u +%Y%m%dT%H%M%SZ)}"
DB=elsatia_dr_v2_storage
IMAGE="${STORAGE_IMAGE:-supabase/storage-api:v1.25.7}"
PORT=5055; CONTENEUR=elsatia-dr-v2-storage
DATA="$OUT/storage-data"; BK="$OUT/backup"
export STORAGE_URL="http://127.0.0.1:$PORT"
export STORAGE_JWT_SECRET="drv2-local-only-$(openssl rand -hex 16)"   # clé jetable de la pile locale
PW="drv2-$(openssl rand -hex 8)"
CLIENT="node $DR2_HERE/storage_client.mjs"
mkdir -p "$OUT" "$BK"; RES="$OUT/storage_results.json"; echo '{"controles": []}' > "$RES"; ECHECS=0
exec > >(tee -a "$OUT/storage_drill.log") 2>&1
res_set() { local t; t=$(mktemp); jq "$1" "$RES" > "$t" && mv "$t" "$RES"; }
controle() {
  [[ "$3" == ok ]] || ECHECS=$((ECHECS + 1))
  printf '  %s %s — %s%s\n' "$([[ $3 == ok ]] && echo ✅ || echo ❌)" "$1" "$2" "${4:+ ($4)}"
  res_set ".controles += [{\"id\": \"$1\", \"libelle\": $(jq -Rn --arg v "$2" '$v'), \"statut\": \"$3\", \"detail\": $(jq -Rn --arg v "${4:-}" '$v')}]"
}
mesure() { res_set ".mesures[\"$1\"] = $2"; }

dr2_garde "$DB" drill
if ! timeout 10 docker info >/dev/null 2>&1 || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "STORAGE_NOT_PROVEN : Docker ou l'image $IMAGE indisponible — aucune qualification Storage prétendue."
  res_set '.verdict = "STORAGE_NOT_PROVEN"'; exit 2
fi

arreter() { docker rm -f "$CONTENEUR" >/dev/null 2>&1; }
demarrer() {
  docker run -d --name "$CONTENEUR" --network host \
    -e AUTH_JWT_SECRET="$STORAGE_JWT_SECRET" -e PGRST_JWT_SECRET="$STORAGE_JWT_SECRET" \
    -e ANON_KEY="x" -e SERVICE_KEY="x" \
    -e DATABASE_URL="postgres://drv2_storage:$PW@127.0.0.1:${DR_PGPORT}/$DB" \
    -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage -e TENANT_ID=stub -e REGION=local \
    -e GLOBAL_S3_BUCKET=stub -e DB_INSTALL_ROLES=false -e SERVER_PORT=$PORT -e PORT=$PORT \
    -e FILE_SIZE_LIMIT=52428800 -e ENABLE_IMAGE_TRANSFORMATION=false \
    -v "$DATA:/var/lib/storage" "$IMAGE" >/dev/null || return 1
  for _ in $(seq 1 60); do curl -sf -m 2 "$STORAGE_URL/status" >/dev/null && return 0; sleep 1; done
  docker logs "$CONTENEUR" 2>&1 | tail -5; return 1
}
liste_db() { dr2_psqla "$DB" -c "select bucket_id || '|' || name from storage.objects order by 1"; }
coherence() { # → "manquants orphelins" : lignes sans octets / octets sans ligne
  local db_v fs_v
  db_v=$(dr2_psqla "$DB" -c "select bucket_id || '/' || name || '/' || version from storage.objects order by 1")
  fs_v=$(cd "$DATA/stub/stub" 2>/dev/null && find . -type f ! -name '*.json' | sed 's|^\./||' | sort)
  echo "$(comm -23 <(echo "$db_v" | grep . | sort) <(echo "$fs_v" | grep . | sort) | grep -c .) $(comm -13 <(echo "$db_v" | grep . | sort) <(echo "$fs_v" | grep . | sort) | grep -c .)"
}
restaurer_db() {
  dr2_db_drop "$DB"; dr2_psql postgres -c "create database \"$DB\"" >/dev/null
  dr2_pg_restore -d "$DB" --exit-on-error "$BK/storage_db.dump" && sed "s/__BASE__/$DB/g" "$BK/db_settings.sql" | dr2_psql postgres >/dev/null
}

echo "== Storage DR — API réelle $IMAGE — sortie $OUT"
arreter; rm -rf "$DATA"; mkdir -p "$DATA"
dr2_psql postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'drv2_storage') then create role drv2_storage superuser login; end if; end \$\$" >/dev/null
dr2_psql postgres -c "alter role drv2_storage password '$PW'" -c "alter role drv2_storage set search_path = storage, public" >/dev/null
dr2_db_drop "$DB"; dr2_psql postgres -c "create database \"$DB\"" -c "alter database \"$DB\" set search_path = storage, public" >/dev/null
demarrer || { echo "storage-api ne démarre pas"; exit 1; }
# Droits de plateforme que Supabase pose hors migrations (DB_INSTALL_ROLES=false : rôles du cluster).
dr2_psql "$DB" -c "grant usage on schema storage to anon, authenticated, service_role; grant all on all tables in schema storage to anon, authenticated, service_role; grant all on all sequences in schema storage to anon, authenticated, service_role; grant all on all functions in schema storage to anon, authenticated, service_role;" >/dev/null
$CLIENT seed 24 "$OUT/seed.json" | sed 's/^/  /'
N=$(liste_db | grep -c .)
SIGNEE=$($CLIENT sign reserves-photos "b0000000-0000-0000-0000-000000000001/drv2/objet-000.jpg")
controle S-0 "pile réelle : storage-api + PostgreSQL, $N objets dans 4 buckets de l'application" "$([[ $N == 24 ]] && echo ok || echo ko)" "$N objets"

# ── S0. Sauvegarde appariée ────────────────────────────────────────────────────────────
echo "== S0. Sauvegarde appariée (métadonnées + fichiers)"
T0=$(dr2_now)
BACKUP_ID="drv2-storage-$(date -u +%Y%m%dT%H%M%SZ)"
dr2_pg_dump -d "$DB" --format=custom > "$BK/storage_db.dump"
dr2_reglages_base "$DB" > "$BK/db_settings.sql"
T1=$(dr2_now)
# Le backend fichier de storage-api range le content-type et le cache-control de chaque objet
# dans des ATTRIBUTS ÉTENDUS (user.supabase.*) : une archive qui les perd rend chaque objet
# illisible (HTTP 500) après restauration. --xattrs est donc obligatoire ; l'archive « naïve »
# n'est produite que comme contre-épreuve (S2-0).
tar --xattrs --xattrs-include='user.*' -C "$DATA" -czf "$BK/storage_files.tar.gz" .
T2=$(dr2_now)
tar -C "$DATA" -czf "$OUT/contre_epreuve_sans_xattrs.tar.gz" .
liste_db | $CLIENT hash > "$BK/manifest_objets.json"
T3=$(dr2_now)
jq -n --arg id "$BACKUP_ID" --slurpfile m "$BK/manifest_objets.json" \
  '{backup_id: $id, contenu: {"storage_db.dump": "métadonnées storage.* (PostgreSQL)", "storage_files.tar.gz": "octets du magasin d’objets"}, objets: ($m[0] | length)}' > "$BK/manifest.json"
(cd "$BK" && sha256sum storage_db.dump storage_files.tar.gz manifest_objets.json manifest.json db_settings.sql > SHA256SUMS)
mesure backup_db_s "$(dr2_dur "$T0" "$T1")"; mesure backup_fichiers_s "$(dr2_dur "$T1" "$T2")"; mesure manifeste_s "$(dr2_dur "$T2" "$T3")"
EG=$(jq -n --slurpfile a "$OUT/seed.json" --slurpfile b "$BK/manifest_objets.json" '[$a[0] | to_entries[] | select($b[0][.key] == .value)] | length')
controle S0-1 "manifeste : $EG/24 objets téléchargés par l'API = SHA-256 à l'envoi" "$([[ $EG == 24 ]] && echo ok || echo ko)"
controle S0-2 "sauvegarde appariée (backup_id commun, SHA256SUMS)" ok "$BACKUP_ID, db $(stat -c%s "$BK/storage_db.dump") o, fichiers $(stat -c%s "$BK/storage_files.tar.gz") o"

# ── Écritures postérieures à la sauvegarde ─────────────────────────────────────────────
X="a0000000-0000-0000-0000-000000000001/drv2/apres-backup.jpg"
Y="a0000000-0000-0000-0000-000000000001/drv2/objet-001.jpg"; YB=tools-releves
Z="b0000000-0000-0000-0000-000000000001/drv2/objet-002.pdf"; ZB=chantier-documents
$CLIENT put reserves-photos "$X" 4096 >/dev/null
$CLIENT rm "$YB" "$Y" >/dev/null
$CLIENT put "$ZB" "$Z" 8192 upsert >/dev/null
echo "  après sauvegarde : ajout X, suppression Y, remplacement Z"

# ── S1. Restauration de la base SEULE ──────────────────────────────────────────────────
echo "== S1. Restauration des MÉTADONNÉES seules (fichiers non restaurés)"
arreter; restaurer_db; demarrer
read -r MANQ ORPH <<<"$(coherence)"
liste_db | $CLIENT hash > "$OUT/s1_hash.json"
KO=$(jq '[.[] | select(startswith("ERR"))] | length' "$OUT/s1_hash.json")
echo "  cohérence : $MANQ ligne(s) sans octets, $ORPH fichier(s) orphelin(s) ; $KO objet(s) illisible(s) par l'API"
controle S1-1 "désynchronisation DÉTECTÉE (métadonnées restaurées ≠ fichiers courants)" "$([[ $MANQ -ge 1 && $ORPH -ge 1 && $KO -ge 1 ]] && echo ok || echo ko)" "manquants=$MANQ orphelins=$ORPH illisibles=$KO"
res_set ".s1 = {lignes_sans_octets: $MANQ, fichiers_orphelins: $ORPH, objets_illisibles: $KO}"

# ── S2. Perte totale → restauration appariée ───────────────────────────────────────────
echo "== S2. Perte totale (base + fichiers) → restauration appariée"
# Contre-épreuve : fichiers restaurés SANS leurs attributs étendus.
arreter; dr2_db_drop "$DB"; rm -rf "$DATA"; mkdir -p "$DATA"
restaurer_db; tar -C "$DATA" -xzf "$OUT/contre_epreuve_sans_xattrs.tar.gz"; demarrer
liste_db | $CLIENT hash > "$OUT/s2_sans_xattrs.json"
KO=$(jq '[.[] | select(startswith("ERR"))] | length' "$OUT/s2_sans_xattrs.json")
read -r MANQ ORPH <<<"$(coherence)"
controle S2-0 "contre-épreuve : archive SANS attributs étendus → objets illisibles malgré une cohérence parfaite" \
  "$([[ $KO == 24 && $MANQ == 0 && $ORPH == 0 ]] && echo ok || echo ko)" "$KO/24 illisibles, manquants=$MANQ orphelins=$ORPH"
arreter; dr2_db_drop "$DB"; rm -rf "$DATA"; mkdir -p "$DATA"
T0=$(dr2_now)
(cd "$BK" && sha256sum --quiet -c SHA256SUMS) || { controle S2-0 "intégrité de la sauvegarde" ko; exit 1; }
restaurer_db
T1=$(dr2_now)
tar --xattrs --xattrs-include='user.*' -C "$DATA" -xzf "$BK/storage_files.tar.gz"
T2=$(dr2_now)
demarrer
T3=$(dr2_now)
liste_db | $CLIENT hash > "$OUT/s2_hash.json"
T4=$(dr2_now)
mesure restore_db_s "$(dr2_dur "$T0" "$T1")"; mesure restore_fichiers_s "$(dr2_dur "$T1" "$T2")"; mesure redemarrage_api_s "$(dr2_dur "$T2" "$T3")"; mesure verify_s "$(dr2_dur "$T3" "$T4")"
IDENT=$(jq -n --slurpfile a "$BK/manifest_objets.json" --slurpfile b "$OUT/s2_hash.json" '$a[0] == $b[0]')
controle S2-1 "chaque objet re-téléchargé par l'API = SHA-256 du manifeste" "$([[ $IDENT == true ]] && echo ok || echo ko)" "$(jq length "$OUT/s2_hash.json") objets"
read -r MANQ ORPH <<<"$(coherence)"
controle S2-2 "cohérence métadonnées ↔ fichiers" "$([[ $MANQ == 0 && $ORPH == 0 ]] && echo ok || echo ko)" "manquants=$MANQ orphelins=$ORPH"
XP=$(dr2_psqla "$DB" -c "select count(*) from storage.objects where name = '$X'")
controle S2-3 "objet écrit après la sauvegarde absent (RPO Storage = âge de la sauvegarde appariée)" "$([[ $XP == 0 ]] && echo ok || echo ko)"
SH=$($CLIENT get-url "$SIGNEE")
controle S2-4 "URL signée émise avant la sauvegarde encore valide après restauration (même secret JWT)" \
  "$([[ $SH == "$(jq -r '."reserves-photos|b0000000-0000-0000-0000-000000000001/drv2/objet-000.jpg"' "$BK/manifest_objets.json")" ]] && echo ok || echo ko)" "$SH"
arreter
res_set ".echecs = $ECHECS | .verdict = \"$([[ $ECHECS == 0 ]] && echo STORAGE_LOCALLY_QUALIFIED || echo STORAGE_BLOCKED)\""
echo "== Storage : $(jq -r .verdict "$RES") ($ECHECS échec(s)) — $RES"
exit $(( ECHECS > 0 ? 1 : 0 ))
