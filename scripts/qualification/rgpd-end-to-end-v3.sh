#!/usr/bin/env bash
# Train canonique V3 — RGPD de bout en bout : sauvegarde → purge → restauration → rejeu.
# Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md (§9)
#
# Usage : scripts/qualification/rgpd-end-to-end-v3.sh <base-source> [dossier-de-sortie]
#   base-source : base au train V3 chargée du jeu réaliste (voir §8 : upgrade V2 → V3).
# Pour chaque tenant : copie jetable → suppression programmée échue → pg_dump → purge (déroulé
# SQL de scripts/purger-entreprise.mjs) → empreinte d'état E1 → pg_restore dans une base neuve
# → rejeu de la purge → E2 ; exige E1 = E2 et factures inchangées. Deux politiques :
#   LIVRÉE  : politique du dépôt (conserver_contrat_minimise, durée non validée → fail-closed) ;
#   ACTIVÉE : durée de TEST posée dans la base jetable uniquement (jamais par une migration),
#             pour prouver le chemin qui s'ouvrira quand la durée sera validée.
# À lancer en root (bascule sur postgres, authentification pair).
set -uo pipefail
SRC="${1:?usage: rgpd-end-to-end-v3.sh <base-source> [sortie]}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${2:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT" 2>/dev/null || true

pg()  { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pga() { runuser -u postgres -- psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
db_new() { # db_new <nom> [template]
  pg -c "drop database if exists \"$1\"" >/dev/null 2>&1
  if [ -n "${2:-}" ]; then pg -c "create database \"$1\" template \"$2\"" >/dev/null; else pg -c "create database \"$1\"" >/dev/null; fi
  pg -c "alter database \"$1\" set search_path = public, extensions" >/dev/null
}
programmer() { pga -d "$1" -c "update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = '$2'" >/dev/null; }
purger() { # purger <db> <entreprise> <run> → résultat
  { echo "begin;"
    echo "select set_config('rgpd.entreprise_cible', '$2', true);"
    echo "select set_config('rgpd.run_id', '$3', true);"
    echo "\\ir $REPO/supabase/tests/fixtures/rgpd_purge_driver.inc"
    echo "select 'RESULTAT=' || current_setting('rgpd.resultat');"
    echo "commit;"; } | runuser -u postgres -- psql -X -q -At -d "$1" 2>"$OUT/purge.err" | grep '^RESULTAT=' | sed 's/RESULTAT=//'
}
causes() { # causes <db> <run> : causes d'échec distinctes
  pga -d "$1" -c "select coalesce(string_agg(distinct split_part(erreur, ' ', 1), ', '), '-') from platform.purge_audit where not ok and run_id = '$2'"
}
factures() { pga -d "$1" -c "select coalesce(md5(string_agg(id || public.empreinte_comptable_facture(id), ',' order by id)), 'aucune') from public.factures where entreprise_id = '$2'"; }
# Empreinte d'état du tenant, indépendante de l'horloge et des identifiants de run.
empreinte() { # empreinte <db> <entreprise>
  pga -d "$1" -v e="$2" <<'SQL'
select md5(string_agg(x, '|' order by x)) from (
  select 'f:' || f.id || ':' || public.empreinte_comptable_facture(f.id)
         || ':' || coalesce(f.chantier_id::text, '-') || ':' || coalesce(f.devis_origine_id::text, '-')
         || ':' || coalesce((select string_agg(k || '=' || (v - 'purge_le')::text, ',' order by k)
                             from jsonb_each(f.purge_snapshot) as e(k, v)), '-') as x
    from public.factures f where f.entreprise_id = :'e'
  union all
  select 't:' || r.table_nom || ':' || r.categorie || ':' || r.nb_lignes from public.rapport_purge_entreprise(:'e') r
  union all
  select 'c:' || (to_jsonb(c) - 'updated_at' - 'created_at')::text from public.clients c where c.entreprise_id = :'e'
  union all
  select 'e:' || (to_jsonb(x) - 'updated_at' - 'purgee_at' - 'created_at' - 'suppression_prevue_at')::text || ':' || (x.purgee_at is not null)
    from public.entreprises x where x.id = :'e'
  union all
  select 's:' || o.bucket_id || '/' || o.name from storage.objects o where o.name like :'e' || '/%'
  union all
  select 'p:' || p.type_contrat || ':' || p.source_id || ':' || p.niveau || ':' || p.politique || ':' || p.decision_ref
         || ':' || p.empreinte_document || ':' || p.empreinte_contenu || ':' || coalesce(p.conserver_jusqu_au::text, '-')
    from platform.contrats_acceptes_purges p where p.entreprise_id = :'e'
) t;
SQL
}
objets() { pga -d "$1" -c "select count(*) from storage.objects where name like '$2/%'"; }
contrats() { pga -d "$1" -c "select (select count(*) from public.devis where entreprise_id = '$2' and statut = 'accepte') || ' devis, ' || (select count(*) from public.avenants where entreprise_id = '$2' and statut = 'accepte') || ' avenant(s)'"; }

scenario() { # scenario <code> <libellé> <entreprise> <politique: livree|activee>
  local code=$1 lib=$2 ent=$3 pol=$4 run1 run2 base="e2e_${1}_${4}"
  run1="c9000000-0000-0000-0000-$(printf '%012d' $((RANDOM)))"; run2="c9000000-0000-0000-0000-$(printf '%012d' $((RANDOM + 40000)))"
  echo "== $code — $lib — politique $pol"
  db_new "$base" "$SRC"
  if [ "$pol" = activee ]; then
    pga -d "$base" -c "select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'QUALIF-V3-DUREE-DE-TEST', interval '10 years', false)" >/dev/null
  fi
  echo "   état : $(pga -d "$base" -c 'select platform.etat_politique_contrats()') ; contrats acceptés : $(contrats "$base" "$ent") ; fichiers : $(objets "$base" "$ent")"
  programmer "$base" "$ent"
  runuser -u postgres -- pg_dump -Fc -d "$base" > "$OUT/$base.dump"
  local f0; f0=$(factures "$base" "$ent")
  local r1; r1=$(purger "$base" "$ent" "$run1")
  local e1; e1=$(empreinte "$base" "$ent")
  echo "   purge : $r1 ; causes d'échec : $(causes "$base" "$run1")"
  echo "   après purge : contrats $(contrats "$base" "$ent") ; fichiers $(objets "$base" "$ent") ; purgée=$(pga -d "$base" -c "select purgee_at is not null from entreprises where id = '$ent'") ; preuves figées=$(pga -d "$base" -c "select count(*) from platform.contrats_acceptes_purges where entreprise_id = '$ent'")"
  local f1; f1=$(factures "$base" "$ent")
  [ "$f0" = "$f1" ] && echo "   factures : INCHANGÉES ($f1)" || echo "   factures : MODIFIÉES ($f0 → $f1)"
  db_new "${base}_r"
  runuser -u postgres -- pg_restore -d "${base}_r" < "$OUT/$base.dump" 2>"$OUT/restore.err" || true
  pg -c "alter database \"${base}_r\" set search_path = public, extensions" >/dev/null
  echo "   restauration : erreurs pg_restore = $(grep -c 'error' "$OUT/restore.err") ; purgée=$(pga -d "${base}_r" -c "select purgee_at is not null from entreprises where id = '$ent'") ; contrats $(contrats "${base}_r" "$ent")"
  local r2; r2=$(purger "${base}_r" "$ent" "$run2")
  local e2; e2=$(empreinte "${base}_r" "$ent")
  echo "   rejeu : $r2"
  [ "$e1" = "$e2" ] && echo "   REJEU = PURGE D'ORIGINE : IDENTIQUE ($e1)" || echo "   REJEU ≠ PURGE D'ORIGINE ($e1 / $e2)"
  if [ "$r1" = complete ]; then # S4 : tenant déjà purgé, purge relancée sur la même base
    local r3; r3=$(purger "$base" "$ent" "c9000000-0000-0000-0000-00000000fff$((RANDOM % 10))")
    local e3; e3=$(empreinte "$base" "$ent")
    [ "$e1" = "$e3" ] && echo "   S4 déjà purgé : relance = $r3, état INCHANGÉ" || echo "   S4 déjà purgé : relance = $r3, état MODIFIÉ"
  fi
  # Isolation : les autres tenants ne bougent pas.
  local autres_avant autres_apres
  autres_avant=$(pga -d "$SRC" -c "select md5(string_agg(e.id::text || ':' || (select count(*) from devis d where d.entreprise_id = e.id) || ':' || (select count(*) from factures f where f.entreprise_id = e.id) || ':' || (select count(*) from clients c where c.entreprise_id = e.id), ',' order by e.id)) from entreprises e where e.id <> '$ent'")
  autres_apres=$(pga -d "$base" -c "select md5(string_agg(e.id::text || ':' || (select count(*) from devis d where d.entreprise_id = e.id) || ':' || (select count(*) from factures f where f.entreprise_id = e.id) || ':' || (select count(*) from clients c where c.entreprise_id = e.id), ',' order by e.id)) from entreprises e where e.id <> '$ent'")
  [ "$autres_avant" = "$autres_apres" ] && echo "   autres tenants : INCHANGÉS" || echo "   autres tenants : MODIFIÉS"
  pg -c "drop database if exists \"${base}_r\"" >/dev/null 2>&1; pg -c "drop database if exists \"$base\"" >/dev/null 2>&1
}

echo "== source : $SRC ; sortie : $OUT"
S1=e0000000-0000-4000-8000-00000000000a     # Peintures Recette A : sans contrat (Colors, 1 fichier)
S2=$(pga -d "$SRC" -c "select id from entreprises where reference_interne = 'PILOTE-BTP-V1'")   # factures + devis acceptés
S3=a0000000-0000-0000-0000-000000000001     # factures + devis acceptés + avenant + photo/audio
for pol in livree activee; do
  scenario S1 "tenant sans contrat (Colors)" "$S1" "$pol"
  scenario S2 "tenant avec factures et devis acceptés (pilote GP)" "$S2" "$pol"
  scenario S3 "tenant avec factures, devis accepté, avenant, photo et note vocale" "$S3" "$pol"
done
