#!/usr/bin/env bash
# DR V2 — sauvegarde complète d'une base locale jetable.
#
# Usage : scripts/dr/v2/backup.sh <base> <dossier-parent>
#   → écrit <dossier-parent>/<backup_id>/ et affiche ce chemin sur la sortie standard.
#
# Contenu du dossier de sauvegarde :
#   db.dump              pg_dump --format=custom (schéma + données + ACL + policies RLS)
#   roles.sql            pg_dumpall --roles-only --no-role-passwords (rôles du cluster)
#   db_settings.sql      ALTER DATABASE … SET (search_path…) — absent d'un pg_dump sans --create
#   snapshot.json        instantané strict (scripts/dr/v2/snapshot.py) = référence de restauration
#   storage_inventory.json  inventaire des MÉTADONNÉES Storage (les fichiers binaires ne sont PAS
#                        dans la base : cette sauvegarde ne les contient pas, voir rapport §8)
#   manifest.json        backup_id, source, train (SHA git, migrations), tailles, sha256, durées
#   SHA256SUMS           sha256 de chaque fichier (vérifiable par `sha256sum -c`)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DB="${1:?usage: backup.sh <base> <dossier-parent>}"
PARENT="${2:?usage: backup.sh <base> <dossier-parent>}"
dr2_garde "$DB" drill
dr2_db_existe "$DB" || dr2_die "base '$DB' absente"

BACKUP_ID="drv2-$(date -u +%Y%m%dT%H%M%S%NZ | cut -c1-24)"
DEST="$PARENT/$BACKUP_ID"
mkdir -p "$DEST"; chmod 777 "$DEST"
dr2_log "backup_id=$BACKUP_ID base=$DB → $DEST"

T0=$(dr2_now)
BACKUP_AT=$(dr2_psqla "$DB" -c "select to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')")
dr2_pg_dump -d "$DB" --format=custom --compress=6 > "$DEST/db.dump"
T1=$(dr2_now)
dr2_pg_dumpall --roles-only --no-role-passwords > "$DEST/roles.sql"
dr2_reglages_base "$DB" > "$DEST/db_settings.sql"
T2=$(dr2_now)
python3 "$DR2_HERE/snapshot.py" "$DB" "$DEST/snapshot.json" >&2
T3=$(dr2_now)
dr2_psqla "$DB" -f "$DR2_HERE/storage_inventory.sql" > "$DEST/storage_inventory.json"

# Lisibilité immédiate : pg_restore --list lit la table des matières sans connexion.
TOC=$(pg_restore --list "$DEST/db.dump" | grep -cvE '^;|^$')
GIT_SHA=$(git -C "$DR2_REPO" rev-parse HEAD 2>/dev/null || echo inconnu)
NB_MIG=$(ls "$DR2_REPO"/supabase/migrations/*.sql | wc -l)
DERNIERE=$(basename "$(ls "$DR2_REPO"/supabase/migrations/*.sql | tail -1)")
PGV=$(dr2_psqla postgres -c "show server_version")

fichier_json() { printf '"%s": {"sha256": "%s", "octets": %s}' "$1" "$(sha256sum "$DEST/$1" | cut -d' ' -f1)" "$(stat -c%s "$DEST/$1")"; }
cat > "$DEST/manifest.json" <<EOF
{
  "backup_id": "$BACKUP_ID",
  "backup_at_utc": "$BACKUP_AT",
  "source_base": "$DB",
  "train": {"git_sha": "$GIT_SHA", "migrations": $NB_MIG, "derniere_migration": "$DERNIERE"},
  "postgresql": "$PGV",
  "pg_dump_toc_entrees": $TOC,
  "contenu": {
    "base": "complète (schémas public, platform, auth, storage, extensions… ; ACL ; policies RLS ; séquences)",
    "roles_cluster": "roles.sql (sans mots de passe)",
    "reglages_base": "db_settings.sql",
    "storage_binaires": "NON INCLUS — seules les métadonnées storage.* sont dans db.dump",
    "auth": "tables auth.* de la base locale incluses ; la configuration et les secrets du service Auth hébergé ne le sont pas"
  },
  "fichiers": {
    $(fichier_json db.dump),
    $(fichier_json roles.sql),
    $(fichier_json db_settings.sql),
    $(fichier_json snapshot.json),
    $(fichier_json storage_inventory.json)
  },
  "durees_secondes": {"pg_dump": $(dr2_dur "$T0" "$T1"), "roles_reglages": $(dr2_dur "$T1" "$T2"), "snapshot": $(dr2_dur "$T2" "$T3"), "total": $(dr2_dur "$T0" "$(dr2_now)")}
}
EOF
jq empty "$DEST/manifest.json" || dr2_die "manifest.json invalide"
(cd "$DEST" && sha256sum db.dump roles.sql db_settings.sql snapshot.json storage_inventory.json manifest.json > SHA256SUMS)
dr2_log "OK $BACKUP_ID : dump $(stat -c%s "$DEST/db.dump") o, $TOC entrées TOC, pg_dump $(dr2_dur "$T0" "$T1") s"
echo "$DEST"
