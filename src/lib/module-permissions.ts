export const MODULE_PERMISSION_PAR_CHEMIN: [string,string][] = [
  ["/api/employes","acces_employes"],
  ["/api/documents","acces_chantiers"],["/api/exports","acces_exports"],["/api/referentiels/vehicules","acces_flotte"],
  ["/imprimer/devis","acces_devis"],["/imprimer/factures","acces_factures"],["/imprimer/commandes","acces_achats"],
  ["/parametres/acces","gerer_utilisateurs"],["/parametres","acces_parametres"],
  ["/abonnement","acces_parametres"],
  ["/clients","acces_clients"],["/chantiers","acces_chantiers"],
  ["/mes-travaux","voir_devis_chantier_sans_prix"],
  ["/prestations","acces_devis"],["/devis","acces_devis"],["/factures","acces_factures"],
  ["/facturation-avancee","acces_facturation_avancee"],["/ouvrages","acces_ouvrages"],
  ["/interventions","acces_interventions"],["/crm","acces_crm"],["/connecteurs","acces_connecteurs"],
  ["/sous-traitants","acces_sous_traitants"],
  ["/messagerie","acces_messagerie"],["/appels-offres","acces_appels_offres"],
  ["/commandes","acces_achats"],["/fournisseurs","acces_achats"],["/depenses","acces_achats"],["/charges","acces_achats"],
  ["/api/notes-frais","saisir_ses_notes_frais"],["/notes-frais","saisir_ses_notes_frais"],
  ["/grands-deplacements","saisir_ses_notes_frais"],
  ["/conges","demander_ses_conges"],
  ["/planning","acces_planning"],["/employes","acces_employes"],["/pointage","acces_pointage"],
  ["/rentabilite","acces_rentabilite"],["/tresorerie","acces_rentabilite"],
  ["/stock/borne","utiliser_borne_stock"],["/stock","acces_stock"],["/depot","acces_stock"],["/inventaires","acces_stock"],
  ["/boutique","acces_boutique"],
  ["/flotte","acces_flotte"],["/outillage","acces_outillage"],["/exports","acces_exports"],
  ["/paiements-bancaires","acces_paiements_bancaires"],
  ["/api/paie/periodes","exporter_paie"],["/api/paie/documents","consulter_sa_paie"],
  ["/imprimer/paie","exporter_paie"],["/paie","consulter_sa_paie"],
];

export const GESTION_PERMISSION_PAR_CHEMIN: [string,string][] = [
  ["/api/employes","gerer_employes"],
  ["/parametres/acces","gerer_utilisateurs"],["/parametres","gerer_parametres"],
  ["/abonnement","gerer_parametres"],
  ["/clients","gerer_clients"],["/chantiers","gerer_chantiers"],
  ["/prestations","gerer_devis"],["/devis","gerer_devis"],["/factures","gerer_factures"],
  ["/facturation-avancee","gerer_facturation_avancee"],["/ouvrages","gerer_ouvrages"],
  ["/interventions","gerer_interventions"],["/crm","gerer_crm"],["/connecteurs","gerer_connecteurs"],
  ["/sous-traitants","gerer_sous_traitants"],
  ["/messagerie","acces_messagerie"],["/appels-offres","gerer_appels_offres"],
  ["/commandes","gerer_achats"],["/fournisseurs","gerer_achats"],["/depenses","gerer_achats"],["/charges","gerer_achats"],
  ["/notes-frais","gerer_notes_frais"],
  ["/grands-deplacements","gerer_notes_frais"],
  ["/conges","gerer_conges"],
  ["/planning","gerer_planning"],["/employes","gerer_employes"],["/pointage","gerer_pointage"],
  ["/stock/borne","utiliser_borne_stock"],["/stock","gerer_stock"],["/depot","gerer_stock"],["/inventaires","gerer_stock"],
  ["/boutique","gerer_boutique"],
  ["/flotte","gerer_flotte"],["/outillage","gerer_outillage"],
  ["/paiements-bancaires","preparer_virements"],
  ["/api/paie/documents","gerer_paie"],["/paie","saisir_variables_paie"],
];

export const PERMISSIONS_MUTATION_ALTERNATIVES: Record<string,string[]> = {
  "/pointage": ["gerer_pointage", "saisir_son_pointage"],
  "/notes-frais": ["gerer_notes_frais", "saisir_ses_notes_frais"],
  "/grands-deplacements": ["gerer_notes_frais", "saisir_ses_notes_frais"],
  "/conges": ["gerer_conges", "demander_ses_conges"],
  "/paiements-bancaires": ["gerer_coordonnees_bancaires", "gerer_paie", "preparer_virements", "valider_virements", "executer_virements"],
  "/paie": ["saisir_variables_paie", "controler_variables_paie", "gerer_paie", "exporter_paie", "parametrer_paie"],
};

// Sous-ressources d'un chantier ouvertes à la contribution terrain (ajout de
// photos/documents/comptes-rendus) sans exiger gerer_chantiers, qui reste
// requis pour tout le reste sous /chantiers/[id]/... (modification, suppression,
// budget, client, planning). Vérifiées avant la règle générique du préfixe
// /chantiers ci-dessus car un identifiant de chantier dynamique empêche de les
// exprimer comme un simple préfixe littéral.
const SOUS_RESSOURCES_CHANTIER_TERRAIN: [RegExp, string[]][] = [
  [/^\/chantiers\/[^/]+\/documents(\/|$)/, ["gerer_chantiers", "ajouter_documents_chantier"]],
  [/^\/chantiers\/[^/]+\/comptes-rendus(\/|$)/, ["gerer_chantiers", "ajouter_documents_chantier"]],
];

/**
 * Résout les droits de gestion (mutation) applicables à un chemin, en
 * centralisant la logique partagée par le proxy serveur (`updateSession`) et
 * `ModuleAccessBoundary` (masquage client des formulaires). Un tableau vide
 * signifie qu'aucune permission de gestion n'est exigée pour ce chemin.
 */
export function droitsGestionPour(pathname: string): string[] {
  const sousRessource = SOUS_RESSOURCES_CHANTIER_TERRAIN.find(([regex]) => regex.test(pathname));
  if (sousRessource) return sousRessource[1];
  const correspond = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const droitGestion = GESTION_PERMISSION_PAR_CHEMIN.find(([chemin]) => correspond(chemin))?.[1];
  if (!droitGestion) return [];
  const cheminAlternatif = Object.keys(PERMISSIONS_MUTATION_ALTERNATIVES).find(correspond);
  return cheminAlternatif ? PERMISSIONS_MUTATION_ALTERNATIVES[cheminAlternatif] : [droitGestion];
}

export const PERMISSIONS_ACCES_ALTERNATIVES: Record<string,string[]> = {
  "/chantiers": ["acces_chantiers", "voir_chantiers_assignes"],
  "/grands-deplacements": ["gerer_notes_frais", "saisir_ses_notes_frais"],
  "/paie": ["consulter_sa_paie", "saisir_variables_paie", "controler_variables_paie", "gerer_paie", "exporter_paie", "parametrer_paie", "voir_paie_confidentielle"],
};
