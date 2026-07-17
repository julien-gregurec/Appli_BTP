export const MODULE_PERMISSION_PAR_CHEMIN: [string,string][] = [
  ["/api/employes","acces_employes"],
  ["/api/documents","acces_chantiers"],["/api/exports","acces_exports"],["/api/referentiels/vehicules","acces_flotte"],
  ["/imprimer/devis","acces_devis"],["/imprimer/factures","acces_factures"],["/imprimer/commandes","acces_achats"],
  ["/parametres/acces","gerer_utilisateurs"],["/parametres","acces_parametres"],
  ["/clients","acces_clients"],["/chantiers","acces_chantiers"],
  ["/mes-travaux","voir_devis_chantier_sans_prix"],
  ["/prestations","acces_devis"],["/devis","acces_devis"],["/factures","acces_factures"],
  ["/facturation-avancee","acces_facturation_avancee"],["/ouvrages","acces_ouvrages"],
  ["/interventions","acces_interventions"],["/crm","acces_crm"],["/connecteurs","acces_connecteurs"],
  ["/messagerie","acces_messagerie"],["/appels-offres","acces_appels_offres"],
  ["/commandes","acces_achats"],["/fournisseurs","acces_achats"],["/depenses","acces_achats"],["/charges","acces_achats"],
  ["/api/notes-frais","saisir_ses_notes_frais"],["/notes-frais","saisir_ses_notes_frais"],
  ["/conges","demander_ses_conges"],
  ["/planning","acces_planning"],["/employes","acces_employes"],["/pointage","acces_pointage"],
  ["/rentabilite","acces_rentabilite"],["/tresorerie","acces_rentabilite"],
  ["/stock/borne","utiliser_borne_stock"],["/stock","acces_stock"],["/depot","acces_stock"],["/inventaires","acces_stock"],
  ["/flotte","acces_flotte"],["/outillage","acces_outillage"],["/exports","acces_exports"],
  ["/paiements-bancaires","acces_paiements_bancaires"],
];

export const GESTION_PERMISSION_PAR_CHEMIN: [string,string][] = [
  ["/api/employes","gerer_employes"],
  ["/parametres/acces","gerer_utilisateurs"],["/parametres","gerer_parametres"],
  ["/clients","gerer_clients"],["/chantiers","gerer_chantiers"],
  ["/prestations","gerer_devis"],["/devis","gerer_devis"],["/factures","gerer_factures"],
  ["/facturation-avancee","gerer_facturation_avancee"],["/ouvrages","gerer_ouvrages"],
  ["/interventions","gerer_interventions"],["/crm","gerer_crm"],["/connecteurs","gerer_connecteurs"],
  ["/messagerie","acces_messagerie"],["/appels-offres","gerer_appels_offres"],
  ["/commandes","gerer_achats"],["/fournisseurs","gerer_achats"],["/depenses","gerer_achats"],["/charges","gerer_achats"],
  ["/notes-frais","gerer_notes_frais"],
  ["/conges","gerer_conges"],
  ["/planning","gerer_planning"],["/employes","gerer_employes"],["/pointage","gerer_pointage"],
  ["/stock/borne","utiliser_borne_stock"],["/stock","gerer_stock"],["/depot","gerer_stock"],["/inventaires","gerer_stock"],
  ["/flotte","gerer_flotte"],["/outillage","gerer_outillage"],
  ["/paiements-bancaires","preparer_virements"],
];

export const PERMISSIONS_MUTATION_ALTERNATIVES: Record<string,string[]> = {
  "/pointage": ["gerer_pointage", "saisir_son_pointage"],
  "/notes-frais": ["gerer_notes_frais", "saisir_ses_notes_frais"],
  "/conges": ["gerer_conges", "demander_ses_conges"],
  "/paiements-bancaires": ["gerer_coordonnees_bancaires", "gerer_paie", "preparer_virements", "valider_virements", "executer_virements"],
};
