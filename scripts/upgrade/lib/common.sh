#!/usr/bin/env bash
# ELSATIA — harnais d'upgrade Production → V9.x — fonctions communes.
# RÈGLE ABSOLUE : ce harnais ne parle QU'À un PostgreSQL LOCAL, par socket Unix, en peer auth
# (`su postgres -c psql`). Aucune URL, aucun hôte, aucun mot de passe n'est accepté.

# Références interdites (audit uniquement — jamais une cible) : Production, Preview.
UPG_REFS_INTERDITES="exhvuzegsefmoguxoiak pgvvpqyjziyapbbkydmc"

upg_die() { echo "❌ $*" >&2; exit "${UPG_EXIT:-1}"; }

# Refuse tout environnement qui pourrait rediriger psql vers un serveur distant.
upg_garde_locale() {
  local v
  for v in PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE PGPASSFILE PGPASSWORD DATABASE_URL SUPABASE_DB_URL \
           POSTGRES_URL SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ACCESS_TOKEN \
           STRIPE_SECRET_KEY STRIPE_LIVE_SECRET_KEY; do
    if [ -n "${!v:-}" ]; then upg_die "variable $v définie : le harnais refuse de tourner hors d'un PostgreSQL local isolé"; fi
  done
  local a ref
  for a in "$@"; do
    case "$a" in *supabase.co*|*supabase.com*|*://*|*@*:*) upg_die "argument « $a » : URL / hôte distant interdit";; esac
    for ref in $UPG_REFS_INTERDITES; do
      case "$a" in *"$ref"*) upg_die "argument « $a » : référence Production/Preview interdite";; esac
    done
  done
  command -v psql >/dev/null || upg_die "psql absent"
  # Le serveur atteint doit être local (socket Unix : inet_server_addr() nul).
  local addr
  addr=$(su postgres -c "psql -X -q -At -d postgres -c 'select inet_server_addr() is null'" 2>/dev/null) \
    || upg_die "PostgreSQL local injoignable (service postgresql start ?)"
  [ "$addr" = t ] || upg_die "connexion non locale (socket TCP) : refus"
}

# Nom de base : identifiant simple, jamais une URL.
upg_nom_base() {
  [[ "$1" =~ ^[a-z][a-z0-9_]{0,50}$ ]] || upg_die "nom de base invalide : $1"
}

upg_psql() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1"; }
upg_q() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $1 -c \"$2\""; }
upg_drop() { su postgres -c "psql -X -q -d postgres -c 'drop database if exists \"$1\" with (force)'" >/dev/null; }
# Copie par template + recopie des réglages de base (ALTER DATABASE … SET, ex. search_path = public, extensions,
# que Supabase porte sur ses rôles) : un template ne les transmet pas.
upg_clone() {
  upg_drop "$2"; su postgres -c "psql -X -q -d postgres -c 'create database \"$2\" template \"$1\"'" >/dev/null
  local r
  while IFS= read -r r; do
    [ -n "$r" ] && su postgres -c "psql -X -q -d postgres -c \"alter database \\\"$2\\\" set ${r%%=*} = ${r#*=}\"" >/dev/null
  done < <(upg_q postgres "select unnest(setconfig) from pg_db_role_setting where setrole = 0 and setdatabase = (select oid from pg_database where datname = '$1')")
}
upg_exists() { [ "$(upg_q postgres "select count(*) from pg_database where datname='$1'")" = 1 ]; }

# Fichiers de migration d'un SHA git, extraits dans un répertoire (sans checkout).
upg_extraire_migrations() { # <repo> <sha> <dest>
  rm -rf "$3"; mkdir -p "$3"
  git -C "$1" archive "$2" supabase/migrations | tar -x -C "$3" || upg_die "git archive $2 impossible"
  chmod -R a+rX "$3"
}
upg_versions_dir() { ls "$1"/*.sql 2>/dev/null | xargs -n1 basename | cut -d_ -f1 | sort; }

# Contenu d'une migration tel qu'appliqué localement (pgsodium indisponible hors Supabase : stub du bootstrap).
upg_contenu_migration() {
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$1"
}

# Ledger Supabase simulé (même table que la CLI : supabase_migrations.schema_migrations).
upg_creer_ledger() {
  upg_psql "$1" >/dev/null <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
SQL
}
upg_ledger() { upg_q "$1" "select version from supabase_migrations.schema_migrations order by 1"; }
