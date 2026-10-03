#!/usr/bin/env bash
# Enveloppe un seed d'époque (antérieur aux verrous 231 « devis accepté / facture émise ») :
# désactive UNIQUEMENT les triggers de verrouillage le temps du seed, dans la même transaction,
# puis les réactive. Les données produites représentent un état que la Production a pu contenir
# (documents acceptés / émis avant l'introduction des verrous) ; aucun autre trigger n'est touché
# (numérotation, recalcul, synchronisation chantier, codes d'identification restent actifs).
# Usage : verrous_historiques.sh < seed.sql | psql ...
set -euo pipefail
V="devis:verrou_devis_accepte lignes_devis:verrou_lignes_devis_accepte factures:verrou_facture_emise lignes_factures:lignes_factures_brouillon_only"
echo "begin;"
for x in $V; do echo "alter table public.${x%%:*} disable trigger ${x#*:};"; done
cat
for x in $V; do echo "alter table public.${x%%:*} enable trigger ${x#*:};"; done
echo "commit;"
