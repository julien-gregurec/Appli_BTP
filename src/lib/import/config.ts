// Configuration du module d'import générique (CSV / Excel) depuis un autre logiciel (Batappli, EBP…).
// Chaque type d'import cible une table existante ; les champs sont mappés manuellement par l'utilisateur.

export type ChampImport = {
  cle: string;
  libelle: string;
  requis?: boolean;
  aide?: string;
};

export type TypeImport = {
  cle: "clients" | "chantiers" | "employes" | "catalogue" | "tarifs_fournisseurs" | "stock" | "ecritures_comptables";
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
  {
    cle: "stock",
    libelle: "Stock et codes-barres",
    table: "articles_stock",
    description: "Articles, quantités, emplacements, prix d’achat/revente et codes-barres exportés de Batappli ou d’un autre logiciel.",
    champs: [
      { cle: "reference", libelle: "Référence", requis: true },
      { cle: "designation", libelle: "Désignation", requis: true },
      { cle: "code_barres", libelle: "Code-barres / EAN" },
      { cle: "marque", libelle: "Marque / fabricant" },
      { cle: "unite", libelle: "Unité" },
      { cle: "quantite_stock", libelle: "Quantité en stock" },
      { cle: "seuil_alerte", libelle: "Seuil d’alerte" },
      { cle: "prix_achat_ht", libelle: "Prix d’achat HT" },
      { cle: "prix_vente_ht", libelle: "Prix de vente HT" },
      { cle: "emplacement", libelle: "Emplacement" },
    ],
  },
  {
    cle: "ecritures_comptables",
    libelle: "Écritures comptables historiques",
    table: "ecritures_comptables_importees",
    description: "Journal comptable exporté de Batappli, EBP ou du cabinet comptable. Les écritures restent identifiées comme données historiques importées.",
    champs: [
      { cle: "journal", libelle: "Journal", requis: true, aide: "Ex. VE, AC, BQ, OD" },
      { cle: "date_ecriture", libelle: "Date d’écriture", requis: true },
      { cle: "numero_piece", libelle: "Numéro de pièce" },
      { cle: "compte", libelle: "Compte comptable", requis: true },
      { cle: "libelle", libelle: "Libellé", requis: true },
      { cle: "debit", libelle: "Débit" },
      { cle: "credit", libelle: "Crédit" },
      { cle: "source_logiciel", libelle: "Logiciel source", aide: "Batappli par défaut" },
      { cle: "reference_source", libelle: "Référence source" },
    ],
  },
  {
    cle: "tarifs_fournisseurs",
    libelle: "Tarifs négociés fournisseurs",
    table: "tarifs_fournisseurs",
    description: "Catalogues CSV ou Excel remis officiellement par Würth, Foussier, SIEHR, Aubade, PROVITRAGE ou un autre fournisseur.",
    champs: [
      { cle: "fournisseur_nom", libelle: "Fournisseur", requis: true, aide: "Le fournisseur est créé s’il n’existe pas encore" },
      { cle: "reference_fournisseur", libelle: "Référence fournisseur", requis: true },
      { cle: "eancode", libelle: "EAN / code-barres" },
      { cle: "designation", libelle: "Désignation", requis: true },
      { cle: "unite", libelle: "Unité", aide: "u, boîte, m², ml…" },
      { cle: "prix_public_ht", libelle: "Prix public HT" },
      { cle: "prix_negocie_ht", libelle: "Prix négocié HT", requis: true },
      { cle: "devise", libelle: "Devise", aide: "EUR par défaut" },
      { cle: "disponibilite", libelle: "Disponibilité" },
      { cle: "minimum_commande", libelle: "Minimum de commande" },
      { cle: "valide_du", libelle: "Valide du" },
      { cle: "valide_au", libelle: "Valide au" },
    ],
  },
];

export function typeImport(cle: string): TypeImport | undefined {
  return TYPES_IMPORT.find((t) => t.cle === cle);
}
