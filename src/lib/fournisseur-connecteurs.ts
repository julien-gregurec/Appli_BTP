export type ModeConnecteurFournisseur =
  | "portail"
  | "csv"
  | "xlsx"
  | "fabdis"
  | "api"
  | "edi"
  | "punchout_oci"
  | "punchout_cxml"
  | "oauth2";

export type ConnecteurFournisseurConnu = {
  code: string;
  nom: string;
  nomFournisseur: string;
  description: string;
  portailUrl: string;
  contactIntegration?: string;
  modes: ModeConnecteurFournisseur[];
  capacites: string[];
  integrationPublique: boolean;
};

/**
 * Capacités annoncées par les fournisseurs sur leurs sites officiels.
 * Une fiche ne vaut jamais activation : les échanges automatiques nécessitent
 * toujours un contrat et des paramètres techniques remis par le fournisseur.
 */
export const CONNECTEURS_FOURNISSEURS_CONNUS: ConnecteurFournisseurConnu[] = [
  {
    code: "wurth",
    nom: "Würth France",
    nomFournisseur: "Würth",
    description: "Catalogue négocié, PunchOut et échanges automatisés des commandes, BL et factures.",
    portailUrl: "https://eshop.wurth.fr/E-procurement/solutions_achats_avances.cyid/solutions_achats_avances.cgid/fr/FR/EUR/",
    contactIntegration: "eprocurement.wurth@wurth.fr",
    modes: ["xlsx", "fabdis", "punchout_oci", "punchout_cxml", "edi"],
    capacites: ["catalogue", "tarifs_negocies", "stocks", "commandes", "bons_livraison", "factures"],
    integrationPublique: true,
  },
  {
    code: "foussier",
    nom: "Foussier",
    nomFournisseur: "Foussier",
    description: "Accès aux tarifs contractuels et au stock, panier PunchOut, commandes et documents par EDI.",
    portailUrl: "https://www.foussier.fr/punch-out-pour-synchroniser-votre-gestion-commande/pg1563",
    modes: ["punchout_oci", "punchout_cxml", "edi", "xlsx", "csv"],
    capacites: ["catalogue", "tarifs_negocies", "stocks", "commandes", "bons_livraison", "factures"],
    integrationPublique: true,
  },
  {
    code: "siehr",
    nom: "SIEHR",
    nomFournisseur: "SIEHR",
    description: "Compte professionnel, tarifs personnalisés, devis, commandes et suivi depuis les outils SIEHR.",
    portailUrl: "https://www.siehr.fr/pour-les-pros/",
    modes: ["portail", "xlsx", "csv"],
    capacites: ["tarifs_negocies", "stocks", "devis_fournisseur", "commandes"],
    integrationPublique: false,
  },
  {
    code: "aubade",
    nom: "Espace Aubade / eBat",
    nomFournisseur: "Espace Aubade",
    description: "Compte professionnel Aubade et commandes via eBat. L’échange automatique doit être validé avec le commercial.",
    portailUrl: "https://www.espace-aubade.fr/services-pro",
    modes: ["portail", "xlsx", "csv"],
    capacites: ["tarifs_negocies", "devis_fournisseur", "commandes"],
    integrationPublique: false,
  },
  {
    code: "provitrage",
    nom: "Saint-Gobain Vitrage Bâtiment · PROVITRAGE",
    nomFournisseur: "Saint-Gobain Vitrage Bâtiment",
    description: "Configuration du vitrage, prix personnalisés, devis PDF, commandes, suivi et factures dans PROVITRAGE.",
    portailUrl: "https://www.saint-gobain-glass.fr/fr/pro-vitrage-commander-votre-verre-en-ligne",
    modes: ["portail", "xlsx", "csv"],
    capacites: ["configurateur", "tarifs_negocies", "devis_fournisseur", "commandes", "suivi_commandes", "factures"],
    integrationPublique: false,
  },
];

export const LIBELLES_MODES_CONNECTEUR: Record<ModeConnecteurFournisseur, string> = {
  portail: "Portail professionnel",
  csv: "Import CSV",
  xlsx: "Import Excel",
  fabdis: "Catalogue FAB-DIS",
  api: "API officielle",
  edi: "EDI",
  punchout_oci: "PunchOut OCI",
  punchout_cxml: "PunchOut cXML",
  oauth2: "OAuth 2",
};

export function connecteurFournisseurConnu(code: string) {
  return CONNECTEURS_FOURNISSEURS_CONNUS.find((connecteur) => connecteur.code === code);
}
