#!/usr/bin/env bash
# Mesures avant / après sur le banc PostgREST réel (max_rows = 1000) :
# « avant » = la requête PostgREST d'origine (plafonnée, donc FAUSSE au-delà de
# 1 000 lignes), « après » = la RPC qui la remplace (complète). Temps total HTTP.
# Usage : set -a; source /tmp/finance-bench/env; set +a; mesures-avant-apres.sh f5000 f2000
set -uo pipefail
D1=2026-01-01; D2=2026-06-30
t() { curl -s -o /dev/null -w "%{time_total}s %{size_download}o" -H "Authorization: Bearer $1" "${@:2}"; }
for pfx in "$@"; do
  up=$(echo "$pfx" | tr a-z A-Z); J="FINANCE_BENCH_JWT_${up}_ADMIN"; J="${!J}"; E="${pfx}e00-0000-0000-0000-000000000001"; U="$FINANCE_BENCH_URL"
  rpc() { t "$J" -X POST -H "Content-Type: application/json" -d "$2" "$U/rpc/$1"; }
  echo "== $pfx =="
  echo "ventes        avant $(t "$J" "$U/factures?select=numero,date_emission,montant_ttc,client:clients!factures_client_id_fkey(nom)&entreprise_id=eq.$E&numero=not.is.null&date_emission=gte.$D1&date_emission=lte.$D2&order=date_emission,numero")  après $(rpc export_comptable_ventes "{\"p_entreprise_id\":\"$E\",\"p_debut\":\"$D1\",\"p_fin\":\"$D2\"}")"
  echo "règlements    avant $(t "$J" "$U/paiements?select=date,montant,facture:factures!inner(numero,entreprise_id)&facture.entreprise_id=eq.$E&date=gte.$D1&date=lte.$D2&order=date")  après $(rpc export_comptable_reglements "{\"p_entreprise_id\":\"$E\",\"p_debut\":\"$D1\",\"p_fin\":\"$D2\"}")"
  echo "achats        avant $(t "$J" "$U/depenses_fournisseurs?select=numero_piece,montant_ttc,fournisseur:fournisseurs(nom),chantier:chantiers(nom)&entreprise_id=eq.$E&date_piece=gte.$D1&date_piece=lte.$D2&statut=neq.annulee&order=date_piece,numero_piece")  après $(rpc export_comptable_achats "{\"p_entreprise_id\":\"$E\",\"p_debut\":\"$D1\",\"p_fin\":\"$D2\"}")"
  echo "tva collectée avant (PGRST201, toujours en erreur)  après $(rpc export_comptable_tva_collectee "{\"p_entreprise_id\":\"$E\",\"p_debut\":\"$D1\",\"p_fin\":\"$D2\"}")"
  echo "trésorerie    avant(factures, PGRST201) $(t "$J" "$U/factures?select=id,montant_ttc,chantier:chantiers(nom)&entreprise_id=eq.$E")  après $(rpc tresorerie_donnees "{\"p_entreprise_id\":\"$E\",\"p_depuis\":\"2026-06-01\"}")"
  echo "dépenses tot. avant $(t "$J" "$U/depenses_fournisseurs?select=statut,montant_ttc,montant_regle&entreprise_id=eq.$E")  après $(rpc depenses_fournisseurs_totaux "{\"p_entreprise_id\":\"$E\"}")"
  echo "pointage mois avant(pointages seuls) $(t "$J" "$U/pointages?select=id,date,heures_normales,employe:employes(id,prenom,nom),chantier:chantiers(id,nom)&entreprise_id=eq.$E&date=gte.2026-03-01&date=lte.2026-03-31&order=date.desc")  après(3 listes) $(rpc pointages_equipe_periode "{\"p_entreprise_id\":\"$E\",\"p_debut\":\"2026-03-01\",\"p_fin\":\"2026-03-31\",\"p_debut_at\":\"2026-03-01T00:00:00+02:00\",\"p_fin_at\":\"2026-03-31T23:59:59+02:00\"}")"
  echo "planning sem. avant(affectations) $(t "$J" "$U/affectations?select=id,date,heures,chantier:chantiers(id,nom),employe:employes(id,prenom,nom)&entreprise_id=eq.$E&date=gte.2026-03-02&date=lte.2026-03-08&order=date")  après $(rpc planning_semaine "{\"p_entreprise_id\":\"$E\",\"p_debut\":\"2026-03-02\",\"p_fin\":\"2026-03-08\"}")"
  echo "fiche chantier avant(pointages) $(t "$J" "$U/pointages?select=id,date,heures_normales,employe:employes(prenom,nom)&chantier_id=eq.${pfx}ca0-0000-0000-0000-000000000001&entreprise_id=eq.$E&order=date.desc")  après(5 listes) $(rpc chantier_donnees_chiffrees "{\"p_entreprise_id\":\"$E\",\"p_chantier_id\":\"${pfx}ca0-0000-0000-0000-000000000001\"}")"
  echo "quota IA      avant $(t "$J" "$U/journal_ia?select=operations_decomptees,cout_estime_ht&entreprise_id=eq.$E&statut=eq.succes&annule_at=is.null")  après $(rpc journal_ia_consommation "{\"p_entreprise_id\":\"$E\",\"p_debut\":\"2026-10-01T00:00:00Z\",\"p_fin\":\"2026-11-01T00:00:00Z\"}")"
done
