#!/usr/bin/env bash
# Installe une extension Postgres FACTICE nommée "pgsodium" dans
# /usr/share/postgresql/*/extension/, pour permettre à
# supabase/migrations/20260828000244_stripe_state_attestation_r72.sql et
# .../20260828000245_stripe_discount_observation_r73.sql (qui font
# `create extension if not exists pgsodium;`) de s'installer sur un
# PostgreSQL local sans la plateforme Supabase/Vault.
#
# Portée volontairement étroite : la seule primitive pgsodium réellement
# utilisée par nos migrations est pgsodium.crypto_sign_verify_detached()
# (vérification de signature Ed25519). Ce stub l'implémente réellement via
# PL/Python3 + PyNaCl (libsodium) — donc fonctionnellement équivalente pour
# cette primitive précise — et ne réimplémente RIEN d'autre de la vraie
# extension pgsodium (pas de gestion de clés, pas de Vault, pas de
# chiffrement symétrique). Ne jamais installer ce stub sur un Postgres qui
# sert par ailleurs une charge réelle : il écrit dans un répertoire système
# partagé par toutes les bases du cluster.
#
# Nécessite des droits d'écriture sur le répertoire d'extensions Postgres
# (root dans ce bac à sable de drill). Usage : scripts/dr/02_install_pgsodium_stub.sh
set -euo pipefail

PG_SHAREDIR="$(pg_config --sharedir 2>/dev/null || echo /usr/share/postgresql/16)"
EXT_DIR="$PG_SHAREDIR/extension"

if [[ ! -w "$EXT_DIR" ]]; then
  echo "[dr] ERREUR: pas de droit d'écriture sur $EXT_DIR (besoin de root)." >&2
  exit 1
fi

cat > "$EXT_DIR/pgsodium.control" <<'EOF'
# Stub DR local -- PAS la vraie extension pgsodium/Supabase Vault.
# Voir scripts/dr/02_install_pgsodium_stub.sh pour le contexte et la portée.
comment = 'DR LOCAL STUB - only crypto_sign_verify_detached is real (Ed25519 via PyNaCl)'
default_version = '1.0'
relocatable = false
requires = 'plpython3u'
EOF

cat > "$EXT_DIR/pgsodium--1.0.sql" <<'EOF'
-- Stub DR local. Voir scripts/dr/02_install_pgsodium_stub.sh.
create schema if not exists pgsodium;

create or replace function pgsodium.crypto_sign_verify_detached(
  signature bytea, message bytea, public_key bytea
) returns boolean
language plpython3u
as $BODY$
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
try:
    VerifyKey(bytes(public_key)).verify(bytes(message), bytes(signature))
    return True
except (BadSignatureError, ValueError):
    return False
$BODY$;

revoke all on function pgsodium.crypto_sign_verify_detached(bytea, bytea, bytea) from public;
grant execute on function pgsodium.crypto_sign_verify_detached(bytea, bytea, bytea) to service_role;
EOF

echo "[dr] Stub pgsodium installé dans $EXT_DIR (contrôle: crypto_sign_verify_detached uniquement)." >&2
