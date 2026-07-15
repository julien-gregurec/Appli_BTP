export type NavigationApplication = {
  href: string;
  label: string;
  actif: boolean;
  permission?: string;
};

export const NAVIGATION_APPLICATION: NavigationApplication[] = [
  { href: "/dashboard", label: "Tableau de bord", actif: true },
  { href: "/mon-espace", label: "Mon espace", actif: true },
  { href: "/mes-travaux", label: "Mes travaux", actif: true, permission: "voir_devis_chantier_sans_prix" },
  { href: "/clients", label: "Clients", actif: true, permission: "acces_clients" },
  { href: "/chantiers", label: "Chantiers", actif: true, permission: "acces_chantiers" },
  { href: "/devis", label: "Devis", actif: true, permission: "acces_devis" },
  { href: "/prestations", label: "Prestations", actif: true, permission: "acces_devis" },
  { href: "/factures", label: "Factures", actif: true, permission: "acces_factures" },
  { href: "/facturation-avancee", label: "Situations & DGD", actif: true, permission: "acces_facturation_avancee" },
  { href: "/ouvrages", label: "Ouvrages & métrés", actif: true, permission: "acces_ouvrages" },
  { href: "/interventions", label: "Interventions", actif: true, permission: "acces_interventions" },
  { href: "/crm", label: "CRM & relances", actif: true, permission: "acces_crm" },
  { href: "/commandes", label: "Commandes", actif: true, permission: "acces_achats" },
  { href: "/fournisseurs", label: "Fournisseurs", actif: true, permission: "acces_achats" },
  { href: "/depenses", label: "Dépenses", actif: true, permission: "acces_achats" },
  { href: "/charges", label: "Charges récurrentes", actif: true, permission: "acces_achats" },
  { href: "/notes-frais", label: "Notes de frais", actif: true, permission: "saisir_ses_notes_frais" },
  { href: "/conges", label: "Congés", actif: true, permission: "demander_ses_conges" },
  { href: "/planning", label: "Planning", actif: true, permission: "acces_planning" },
  { href: "/employes", label: "Employés", actif: true, permission: "acces_employes" },
  { href: "/pointage", label: "Pointage heures", actif: true, permission: "acces_pointage" },
  { href: "/rentabilite", label: "Rentabilité", actif: true, permission: "acces_rentabilite" },
  { href: "/tresorerie", label: "Trésorerie", actif: true, permission: "acces_rentabilite" },
  { href: "/stock", label: "Stock", actif: true, permission: "acces_stock" },
  { href: "/stock/borne", label: "Borne stock", actif: true, permission: "utiliser_borne_stock" },
  { href: "/flotte", label: "Flotte automobile", actif: true, permission: "acces_flotte" },
  { href: "/outillage", label: "Outillage", actif: true, permission: "acces_outillage" },
  { href: "/depot", label: "Dépôt", actif: true, permission: "acces_stock" },
  { href: "/inventaires", label: "Inventaires", actif: true, permission: "acces_stock" },
  { href: "/exports", label: "Exports comptables", actif: true, permission: "acces_exports" },
  { href: "/connecteurs", label: "Connecteurs", actif: true, permission: "acces_connecteurs" },
  { href: "/parametres", label: "Paramètres", actif: true, permission: "acces_parametres" },
];
