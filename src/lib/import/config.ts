// Configuration du module d'import générique (CSV / Excel) depuis un autre logiciel (Batappli, EBP…).
// Chaque type d'import cible une table existante ; les champs sont mappés manuellement par l'utilisateur.

export type ChampImport = {
  cle: string;
  libelle: string;
  requis?: boolean;
  aide?: string;
};

export type TypeImport = {
  cle: "clients" | "chantiers" | "employes" | "catalogue";
  libelle: string;
  table: string;
  description: string;
  champs: ChampImport[];
};

export const TYPES_IMPORT: TypeImport[] = [
  {
    cle: "clients",
    libelle: "Clients",
    table: "clients",
    description: "Fiches clients (particuliers, professionnels).",
    champs: [
      { cle: "nom", libelle: "Nom", requis: true, aide: "Nom de famille ou raison sociale" },
      { cle: "prenom", libelle: "Prénom" },
      { cle: "societe", libelle: "Société" },
      { cle: "type", libelle: "Type", aide: "particulier / professionnel / collectivite / syndic / promoteur" },
      { cle: "siret", libelle: "SIRET" },
      { cle: "adresse_facturation", libelle: "Adresse" },
      { cle: "code_postal", libelle: "Code postal" },
      { cle: "ville", libelle: "Ville" },
      { cle: "telephone", libelle: "Téléphone" },
      { cle: "email", libelle: "Email" },
    ],
  },
  {
    cle: "chantiers",
    libelle: "Chantiers",
    table: "chantiers",
    description: "Chantiers / affaires. Le client est rattaché par son nom (créé s'il n'existe pas).",
    champs: [
      { cle: "nom", libelle: "Nom du chantier", requis: true },
      { cle: "client_nom", libelle: "Nom du client", requis: true, aide: "Rattache au client existant (ou le crée)" },
      { cle: "adresse", libelle: "Adresse" },
      { cle: "code_postal", libelle: "Code postal" },
      { cle: "ville", libelle: "Ville" },
      { cle: "statut", libelle: "Statut", aide: "prospect / en_cours / termine / facture…" },
      { cle: "budget_previsionnel", libelle: "Budget prévisionnel" },
      { cle: "date_debut_prevue", libelle: "Date de début (AAAA-MM-JJ)" },
    ],
  },
  {
    cle: "employes",
    libelle: "Employés",
    table: "employes",
    description: "Salariés de l'entreprise.",
    champs: [
      { cle: "prenom", libelle: "Prénom", requis: true },
      { cle: "nom", libelle: "Nom", requis: true },
      { cle: "poste", libelle: "Poste" },
      { cle: "type_contrat", libelle: "Type de contrat", aide: "cdi / cdd / interim / apprenti / stage…" },
      { cle: "email", libelle: "Email" },
      { cle: "telephone", libelle: "Téléphone" },
      { cle: "taux_horaire", libelle: "Taux horaire" },
      { cle: "date_entree", libelle: "Date d'entrée (AAAA-MM-JJ)" },
    ],
  },
  {
    cle: "catalogue",
    libelle: "Catalogue / articles",
    table: "prestations_catalogue",
    description: "Bibliothèque de prestations et articles pour les devis.",
    champs: [
      { cle: "designation", libelle: "Désignation", requis: true },
      { cle: "description", libelle: "Description" },
      { cle: "type", libelle: "Type", aide: "main_oeuvre / fourniture / sous_traitance / deplacement / forfait" },
      { cle: "unite", libelle: "Unité", aide: "h, m², ml, u, forfait…" },
      { cle: "prix_unitaire_ht", libelle: "Prix unitaire HT" },
      { cle: "taux_tva", libelle: "Taux TVA (%)" },
    ],
  },
];

export function typeImport(cle: string): TypeImport | undefined {
  return TYPES_IMPORT.find((t) => t.cle === cle);
}
