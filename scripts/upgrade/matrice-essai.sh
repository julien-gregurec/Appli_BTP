#!/usr/bin/env bash
# ELSATIA — UPG-P0-2 : matrice des formes de dates d'essai (Production 210) face à l'upgrade → tête V9.x.
#
# Pour CHAQUE cas, une base 210 jetable (copie de --source, sans les cas de la matrice) reçoit UNE entreprise
# synthétique dans la forme exacte qu'elle peut avoir en Production : avant 231 (abonnement_essai_debut NULL,
# triggers d'époque contournés comme l'était la base avant 231) ou après 231 (debut posé par le trigger, fin
# éventuellement réécrite par le webhook Stripe de fcdd4e7c). Puis tout le plan d'upgrade est appliqué dans
# l'ordre réel (phase 0, puis ordre lexical), une transaction par migration + ligne de ledger, jusqu'à la fin ou
# jusqu'au premier échec. Sortie : migration en échec (ou OK), dates après, etat_commercial_gestion_pro après,
# et la classification du preflight (sonde lecture seule) AVANT upgrade.
#
# Aucune régularisation : la matrice dit seulement ce qui bloque, ce qui est modifié et ce qui coupe l'accès.
# Local uniquement (lib/common.sh). Usage :
#   scripts/upgrade/matrice-essai.sh --target-sha <sha> --source <base 210> --out <dossier> [cas…]
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib/common.sh"
SHA=""; SRC=""; OUT=""; CAS_DEMANDES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --target-sha) SHA="$2"; shift 2;;
    --source) SRC="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    *) CAS_DEMANDES+=("$1"); shift;;
  esac
done
[ -n "$SHA" ] && [ -n "$SRC" ] && [ -n "$OUT" ] || upg_die "usage : --target-sha <sha> --source <base 210> --out <dossier>"
upg_garde_locale "$SHA" "$SRC" "$OUT"; upg_nom_base "$SRC"; upg_exists "$SRC" || upg_die "source $SRC absente"
mkdir -p "$OUT"; chmod 777 "$OUT"
upg_extraire_migrations "$REPO" "$SHA" "$OUT/target"; MIG="$OUT/target/supabase/migrations"
upg_ledger "$SRC" > "$OUT/ledger.txt"
python3 "$HERE/lib/classify.py" plan "$OUT/ledger.txt" "$MIG" "$OUT/plan.json" >/dev/null || upg_die "plan"
python3 -c "import json;[print(m) for m in json.load(open('$OUT/plan.json'))['en_attente']]" > "$OUT/en_attente.txt"

# id | ère | statut | création (jours avant aujourd'hui) | debut (expr. SQL, c = created_at::date) | fin | description
CAS=$(cat <<'TXT'
A1|pre231|essai|90|null|null|essai sans date, ancien (« essai perpétuel »)
A2|pre231|essai|10|null|null|essai sans date, récent
A3|pre231|essai|60|null|c + 30|essai, fin passée dans la fenêtre
A4|pre231|essai|10|null|c + 30|essai, fin future dans la fenêtre
A5|pre231|essai|20|null|current_date + 25|essai Stripe, fin future > création + 30 (encore future après troncature)
A6|pre231|essai|40|null|current_date + 20|essai Stripe, fin future > création + 30 (passée après troncature)
A7|pre231|essai|10|null|c - 5|fin d'essai antérieure à la création
A8|pre231|actif|400|null|null|legacy actif, aucune date (offre historique)
A9|pre231|actif|400|null|c + 14|legacy actif, vieil essai Stripe de 14 j
A10|pre231|actif|100|null|c + 60|actif, essai Stripe ancien > 30 j
A11|pre231|annule|300|null|null|annulé, aucune date
A12|pre231|suspendu|200|null|c + 30|suspendu, fin passée
B1|post231|essai|10|c|c + 30|essai trigger 231, fin future
B2|post231|essai|40|c|c + 30|essai trigger 231, fin passée
B3|post231|essai|20|c|c + 45|essai : fin réécrite par Stripe > debut + 30 (future)
B4|post231|actif|35|c|c + 45|converti après un essai Stripe > debut + 30
B5|post231|annule|35|c|c + 60|annulé après un essai Stripe > debut + 30
B6|post231|essai|10|c|null|debut posé, fin effacée
B7|post231|actif|20|c|c - 1|fin antérieure au début
B8|post231|suspendu|35|c|c + 30|suspendu, fenêtre exacte
TXT
)
printf 'cas\tere\tstatut\tdescription\tsonde_bloquant_hors_fenetre\tsonde_bloquant_perpetuel\tsonde_info_tronque\tsonde_bloquant_tronque_expire\tresultat\tdebut_apres\tfin_apres\tetat_gp_apres\n' > "$OUT/matrice.tsv"
while IFS='|' read -r id ere statut jours debut fin desc; do
  [ -n "$id" ] || continue
  if [ ${#CAS_DEMANDES[@]} -gt 0 ] && [[ ! " ${CAS_DEMANDES[*]} " =~ " $id " ]]; then continue; fi
  db="mat_essai_$(echo "$id" | tr 'A-Z' 'a-z')"
  upg_clone "$SRC" "$db"
  eid="e55a1000-0000-0000-0000-$(printf '%012d' "$(echo "$id" | tr -dc '0-9')$( [ "${id:0:1}" = B ] && echo 1 || echo 0)")"
  # Neutralise les autres entreprises du jeu historique côté essai : la matrice isole UN cas.
  {
    echo "set session_replication_role = replica;"   # contourne les triggers d'époque (forme exacte d'avant 231)
    echo "update public.entreprises set abonnement_essai_debut = created_at::date, abonnement_essai_fin = created_at::date + 30 where id <> '$eid';"
    echo "insert into public.entreprises (id, nom, abonnement_statut, created_at, abonnement_essai_debut, abonnement_essai_fin)"
    echo "select '$eid', 'Matrice $id', '$statut', ts_, $debut, $fin from (select (now() - interval '$jours days'), (now() - interval '$jours days')::date) x(ts_, c);"
  } | upg_psql "$db" >/dev/null 2>"$OUT/$id.seed.err" || { echo "$id : seed KO"; cat "$OUT/$id.seed.err"; continue; }
  sonde=$(upg_q "$db" "select
      (select count(*) from public.entreprises where (abonnement_essai_debut is not null and abonnement_essai_fin is not null and abonnement_essai_fin not between abonnement_essai_debut and abonnement_essai_debut + 30) or (abonnement_essai_debut is null and abonnement_essai_fin is not null and abonnement_essai_fin < created_at::date))
      ||'|'|| (select count(*) from public.entreprises where abonnement_statut = 'essai' and abonnement_essai_fin is null and coalesce(abonnement_essai_debut, created_at::date) + 30 < current_date)
      ||'|'|| (select count(*) from public.entreprises where abonnement_essai_debut is null and abonnement_essai_fin > created_at::date + 30)
      ||'|'|| (select count(*) from public.entreprises where abonnement_statut = 'essai' and abonnement_essai_debut is null and abonnement_essai_fin >= current_date and created_at::date + 30 < current_date)")
  res=OK
  while read -r m; do
    [ -n "$m" ] || continue
    b=${m%.sql}; v=${b%%_*}; nom=${b#*_}
    if ! { upg_contenu_migration "$MIG/$m" | python3 "$HERE/lib/strip_txn.py"; echo; echo "insert into supabase_migrations.schema_migrations(version, name) values ('$v', '$nom');"; } \
        | su postgres -c "psql -X -q -1 -v ON_ERROR_STOP=1 -d $db" >/dev/null 2>"$OUT/$id.err"; then
      res="ECHEC $v : $(grep -m1 ERROR "$OUT/$id.err" | cut -c1-140)"; break
    fi
  done < "$OUT/en_attente.txt"
  if [ "$res" = OK ]; then
    apres=$(upg_q "$db" "select coalesce(abonnement_essai_debut::text,'∅')||'|'||coalesce(abonnement_essai_fin::text,'∅')||'|'||public.etat_commercial_gestion_pro(id) from public.entreprises where id = '$eid'")
  else
    apres="—|—|—"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$ere" "$statut" "$desc" "$(echo "$sonde" | tr '|' '\t')" "$res" "$(echo "$apres" | tr '|' '\t')" >> "$OUT/matrice.tsv"
  echo "$id ($ere, $statut, $desc) : sonde $sonde → $res ; après $apres"
  upg_drop "$db"
done <<< "$CAS"
