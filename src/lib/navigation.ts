export type NavigationApplication = {
  href: string;
  label: string;
  actif: boolean;
  permission?: string | string[];
  groupe: NavigationGroupe;
};

export type NavigationGroupe =
  | "principal"
  | "commercial"
  | "chantier"
  | "equipe"
  | "achats_stock"
  | "materiel"
  | "pilotage"
  | "administration";

export const NAVIGATION_GROUPES: Array<{ cle: NavigationGroupe; label: string }> = [
  { cle: "principal", label: "Accueil" },
  { cle: "commercial", label: "Clients & ventes" },
  { cle: "chantier", label: "Chantiers & interventions" },
  { cle: "equipe", label: "Équipe & temps" },
  { cle: "achats_stock", label: "Achats & stock" },
  { cle: "materiel", label: "Matériel" },
  { cle: "pilotage", label: "Pilotage" },
  { cle: "administration", label: "Administration" },
];

export const NAVIGATION_APPLICATION: NavigationApplication[] = [
  { href: "/dashboard", label: "Tableau de bord", actif: true, groupe: "principal" },
  { href: "/mon-espace", label: "Mon espace", actif: true, groupe: "principal" },
  { href: "/messagerie", label: "Messagerie", actif: true, permission: "acces_messagerie", groupe: "principal" },
  { href: "/clients", label: "Clients", actif: true, permission: "acces_clients", groupe: "commercial" },
  { href: "/devis", label: "Devis", actif: true, permission: "acces_devis", groupe: "commercial" },
  { href: "/prestations", label: "Prestations", actif: true, permission: "acces_devis", groupe: "commercial" },
  { href: "/factures", label: "Factures", actif: true, permission: "acces_factures", groupe: "commercial" },
  { href: "/facturation-avancee", label: "Situations & DGD", actif: true, permission: "acces_facturation_avancee", groupe: "commercial" },
  { href: "/crm", label: "CRM & relances", actif: true, permission: "acces_crm", groupe: "commercial" },
  { href: "/appels-offres", label: "Appels d’offres", actif: true, permission: "acces_appels_offres", groupe: "commercial" },
  { href: "/chantiers", label: "Chantiers", actif: true, permission: ["acces_chantiers", "voir_chantiers_assignes"], groupe: "chantier" },
  { href: "/mes-travaux", label: "Mes travaux", actif: true, permission: "voir_devis_chantier_sans_prix", groupe: "chantier" },
  { href: "/ouvrages", label: "Ouvrages & métrés", actif: true, permission: "acces_ouvrages", groupe: "chantier" },
  { href: "/interventions", label: "Interventions", actif: true, permission: "acces_interventions", groupe: "chantier" },
  { href: "/sous-traitants", label: "Sous-traitants", actif: true, permission: "acces_sous_traitants", groupe: "chantier" },
  { href: "/planning", label: "Planning", actif: true, permission: "acces_planning", groupe: "equipe" },
  { href: "/pointage", label: "Pointage heures", actif: true, permission: "acces_pointage", groupe: "equipe" },
  { href: "/employes", label: "Employés", actif: true, permission: "acces_employes", groupe: "equipe" },
  { href: "/conges", label: "Congés", actif: true, permission: "demander_ses_conges", groupe: "equipe" },
  { href: "/notes-frais", label: "Notes de frais", actif: true, permission: "saisir_ses_notes_frais", groupe: "equipe" },
  { href: "/fournisseurs", label: "Fournisseurs", actif: true, permission: "acces_achats", groupe: "achats_stock" },
  { href: "/commandes", label: "Commandes", actif: true, permission: "acces_achats", groupe: "achats_stock" },
  { href: "/depenses", label: "Factures fournisseurs", actif: true, permission: "acces_achats", groupe: "achats_stock" },
  { href: "/charges", label: "Charges récurrentes", actif: true, permission: "acces_achats", groupe: "achats_stock" },
  { href: "/stock", label: "Articles & stock", actif: true, permission: "acces_stock", groupe: "achats_stock" },
  { href: "/inventaires", label: "Inventaires", actif: true, permission: "acces_stock", groupe: "achats_stock" },
  { href: "/stock/borne", label: "Borne stock", actif: true, permission: "utiliser_borne_stock", groupe: "achats_stock" },
  { href: "/depot", label: "Dépôt", actif: true, permission: "acces_stock", groupe: "achats_stock" },
  { href: "/flotte", label: "Flotte automobile", actif: true, permission: "acces_flotte", groupe: "materiel" },
  { href: "/outillage", label: "Outillage", actif: true, permission: "acces_outillage", groupe: "materiel" },
  { href: "/rentabilite", label: "Rentabilité", actif: true, permission: "acces_rentabilite", groupe: "pilotage" },
  { href: "/tresorerie", label: "Trésorerie", actif: true, permission: "acces_rentabilite", groupe: "pilotage" },
  { href: "/exports", label: "Exports comptables", actif: true, permission: "acces_exports", groupe: "pilotage" },
  { href: "/paiements-bancaires", label: "Banque & paie", actif: true, permission: "acces_paiements_bancaires", groupe: "pilotage" },
  { href: "/connecteurs", label: "Connecteurs", actif: true, permission: "acces_connecteurs", groupe: "administration" },
  { href: "/abonnement", label: "Abonnement", actif: true, permission: "acces_parametres", groupe: "administration" },
  { href: "/parametres", label: "Paramètres", actif: true, permission: "acces_parametres", groupe: "administration" },
];

export function navigationAutorisee(permission: string | string[] | undefined, autorisations: string[] | null) {
  if (!permission || autorisations === null) return true;
  const attendues = Array.isArray(permission) ? permission : [permission];
  return attendues.some((droit) => autorisations.includes(droit));
}
