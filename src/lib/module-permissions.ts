export const MODULE_PERMISSION_PAR_CHEMIN: [string,string][] = [
  ["/api/employes","acces_employes"],
  ["/api/documents","acces_chantiers"],["/api/exports","acces_exports"],["/api/referentiels/vehicules","acces_flotte"],
  ["/imprimer/devis","acces_devis"],["/imprimer/factures","acces_factures"],["/imprimer/commandes","acces_achats"],
  ["/parametres/acces","gerer_utilisateurs"],["/parametres","acces_parametres"],
  ["/clients","acces_clients"],["/chantiers","acces_chantiers"],
  ["/prestations","acces_devis"],["/devis","acces_devis"],["/factures","acces_factures"],
  ["/commandes","acces_achats"],["/fournisseurs","acces_achats"],["/depenses","acces_achats"],["/charges","acces_achats"],
  ["/planning","acces_planning"],["/employes","acces_employes"],["/pointage","acces_pointage"],
  ["/rentabilite","acces_rentabilite"],["/tresorerie","acces_rentabilite"],
  ["/stock","acces_stock"],["/depot","acces_stock"],["/inventaires","acces_stock"],
  ["/flotte","acces_flotte"],["/outillage","acces_outillage"],["/exports","acces_exports"],
];

export const GESTION_PERMISSION_PAR_CHEMIN: [string,string][] = [
  ["/api/employes","gerer_employes"],
  ["/parametres/acces","gerer_utilisateurs"],["/parametres","gerer_parametres"],
  ["/clients","gerer_clients"],["/chantiers","gerer_chantiers"],
  ["/prestations","gerer_devis"],["/devis","gerer_devis"],["/factures","gerer_factures"],
  ["/commandes","gerer_achats"],["/fournisseurs","gerer_achats"],["/depenses","gerer_achats"],["/charges","gerer_achats"],
  ["/planning","gerer_planning"],["/employes","gerer_employes"],["/pointage","gerer_pointage"],
  ["/stock","gerer_stock"],["/depot","gerer_stock"],["/inventaires","gerer_stock"],
  ["/flotte","gerer_flotte"],["/outillage","gerer_outillage"],
];

export const PERMISSIONS_MUTATION_ALTERNATIVES: Record<string,string[]> = {
  "/pointage": ["gerer_pointage", "saisir_son_pointage"],
};
