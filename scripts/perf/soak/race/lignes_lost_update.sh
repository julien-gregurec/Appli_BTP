#!/usr/bin/env bash
# ELSATIA SOAK V1 — Domaine D : lost update des totaux devis/facture sur insertions de
# lignes concurrentes dans le MÊME document (recalc_totaux_devis / recalc_totaux_facture
# somment les lignes SANS verrouiller d'abord le document).
# Déterministe : T1 insère une ligne et garde la transaction ouverte ; T2 insère une
# ligne (son UPDATE du document attend le verrou de T1) ; T1 valide ; T2 valide.
# Usage : race/lignes_lost_update.sh <db> devis|facture
set -euo pipefail
DB="${1:-soak}"; KIND="${2:-devis}"
P() { su postgres -c "psql -X -At -v ON_ERROR_STOP=1 -d $DB $*"; }
if [ "$KIND" = devis ]; then
  DOC=$(P -c "\"select id from devis where entreprise_id='a0000000-0000-4000-a000-000000000001' and statut='brouillon' order by id limit 1\"")
  TBL=lignes_devis; FK=devis_id; DTBL=devis
else
  DOC=$(P -c "\"select id from factures where entreprise_id='a0000000-0000-4000-a000-000000000001' and statut='brouillon' order by id limit 1\"")
  TBL=lignes_factures; FK=facture_id; DTBL=factures
fi
ins() { echo "insert into $TBL ($FK, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre) values ('$DOC', 'RACE-$1', 'fourniture', 1, 'u', $2, 0, 20, 9000 + $3);"; }
P -c "\"delete from $TBL where $FK='$DOC' and designation like 'RACE-%'\"" >/dev/null
AVANT=$(P -c "\"select montant_ht from $DTBL where id='$DOC'\"")
FIFO=$(mktemp -u); mkfifo "$FIFO"; chmod 666 "$FIFO"
# T1 : insère 1000 € HT puis attend 3 s avant COMMIT.
( { echo "begin;"; ins T1 1000 1; echo "select pg_sleep(3);"; echo "commit;"; } | su postgres -c "psql -X -q -d $DB" >/dev/null ) &
sleep 1
# T2 : insère 1 € HT (bloque sur le verrou du document jusqu'au COMMIT de T1).
{ echo "begin;"; ins T2 1 2; echo "commit;"; } | su postgres -c "psql -X -q -d $DB" >/dev/null
wait
rm -f "$FIFO"
APRES=$(P -c "\"select montant_ht from $DTBL where id='$DOC'\"")
VRAI=$(P -c "\"select round(sum((quantite*prix_unitaire_ht)*(1-remise_ligne/100)),2) from $TBL where $FK='$DOC'\"")
echo "$KIND $DOC avant=$AVANT apres=$APRES somme_lignes=$VRAI attendu_delta=1001"
if [ "$(echo "$APRES == $VRAI" | bc)" = 1 ]; then echo "PASS : total cohérent"; else echo "FAIL : lost update (total document != somme des lignes)"; fi
P -c "\"delete from $TBL where $FK='$DOC' and designation like 'RACE-%'\"" >/dev/null
