// Configuration du module universel de reprise CSV / Excel.
// Les profils facilitent la reconnaissance des exports sans dépendre d'un format propriétaire.

export type LogicielSource = {
  cle: string;
  libelle: string;
  description: string;
};

export const LOGICIELS_SOURCE: LogicielSource[] = [
  { cle: "generique", libelle: "Fichier CSV / Excel générique", description: "Export structuré provenant de n'importe quel logiciel." },
  { cle: "batigest", libelle: "Sage Batigest / Batigest Connect", description: "Clients, chantiers, articles, stock et journaux exportés depuis Batigest." },
  { cle: "batappli", libelle: "Batappli", description: "Exports de gestion, catalogue, stock et comptabilité Batappli." },
  { cle: "ebp_batiment", libelle: "EBP Bâtiment", description: "Exports EBP Gestion Bâtiment ou EBP Gestion Commerciale." },
  { cle: "obat", libelle: "Obat", description: "Exports clients, chantiers et bibliothèque d'ouvrages Obat." },
  { cle: "tolteck", libelle: "Tolteck", description: "Exports clients, documents et catalogue Tolteck." },
  { cle: "extrabat", libelle: "Extrabat", description: "Exports CRM, chantiers et articles Extrabat." },
  { cle: "autre", libelle: "Autre logiciel", description: "Tout logiciel capable de produire un fichier CSV ou Excel." },
];

export function logicielSource(cle: string): LogicielSource {
  return LOGICIELS_SOURCE.find((logiciel) => logiciel.cle === cle) ?? LOGICIELS_SOURCE[0];
}

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
    description: "Articles, quantités, emplacements, prix d’achat/revente et codes-barres exportés de l’ancien logiciel.",
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
    description: "Journal comptable exporté de l’ancien logiciel ou du cabinet comptable. Les écritures restent identifiées comme données historiques importées.",
    champs: [
      { cle: "journal", libelle: "Journal", requis: true, aide: "Ex. VE, AC, BQ, OD" },
      { cle: "date_ecriture", libelle: "Date d’écriture", requis: true },
      { cle: "numero_piece", libelle: "Numéro de pièce" },
      { cle: "compte", libelle: "Compte comptable", requis: true },
      { cle: "libelle", libelle: "Libellé", requis: true },
      { cle: "debit", libelle: "Débit" },
      { cle: "credit", libelle: "Crédit" },
      { cle: "source_logiciel", libelle: "Logiciel source", aide: "Le profil sélectionné est utilisé par défaut" },
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

export function normaliserEnteteImport(valeur: string): string {
  return valeur
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ALIASES_COMMUNS: Record<string, string[]> = {
  nom: ["nom", "nomclient", "raisonsociale", "tiers", "intitule", "intituletiers"],
  prenom: ["prenom", "prenomclient", "contactprenom"],
  societe: ["societe", "entreprise", "raisonsociale", "nomcommercial"],
  siret: ["siret", "numerosiret", "nosiret"],
  adresse: ["adresse", "adresse1", "adressechantier", "rue"],
  adresse_facturation: ["adresse", "adresse1", "adressefacturation", "rue"],
  code_postal: ["codepostal", "cp", "zipcode"],
  ville: ["ville", "localite"],
  telephone: ["telephone", "tel", "telportable", "telephoneportable", "mobile", "portable"],
  email: ["email", "courriel", "mail", "adressemail"],
  designation: ["designation", "libellearticle", "libelle", "article", "descriptionarticle"],
  description: ["description", "descriptionlongue", "detail"],
  reference: ["reference", "ref", "codearticle", "referencearticle", "codeproduit"],
  code_barres: ["codebarres", "ean", "ean13", "codeean", "gtin"],
  marque: ["marque", "fabricant"],
  unite: ["unite", "unitedevente", "unitestock", "uvente"],
  prix_achat_ht: ["prixachatht", "paht", "prixachat", "coutunitaire", "prixrevient"],
  prix_vente_ht: ["prixventeht", "pvht", "prixvente", "tarifht"],
  prix_unitaire_ht: ["prixunitaireht", "puht", "prixventeht", "tarifht"],
  taux_tva: ["tauxtva", "tva", "pourcentagetva"],
  quantite_stock: ["quantitestock", "stockreel", "stockactuel", "qtestock", "quantite", "stock"],
  seuil_alerte: ["seuilalerte", "stockminimum", "stockmini", "seuilreapprovisionnement"],
  emplacement: ["emplacement", "depot", "zone", "rayon", "localisation"],
  date_entree: ["dateentree", "datedembauche", "debutcontrat"],
  taux_horaire: ["tauxhoraire", "couthoraire", "tarifhoraire"],
  date_ecriture: ["dateecriture", "datecomptable", "datepiece", "date"],
  numero_piece: ["numeropiece", "nopiece", "piece", "referencepiece"],
  journal: ["journal", "codejournal", "journalcode"],
  compte: ["compte", "numerocompte", "nocompte", "comptegeneral"],
  libelle: ["libelle", "libelleecriture", "description", "intitule"],
  debit: ["debit", "montantdebit"],
  credit: ["credit", "montantcredit"],
  reference_source: ["referencesource", "idexterne", "identifiantorigine"],
};

const ALIASES_PAR_TYPE: Partial<Record<TypeImport["cle"], Record<string, string[]>>> = {
  chantiers: {
    nom: ["nomchantier", "libellechantier", "affaire", "nomaffaire", "libelleaffaire", "objet"],
    client_nom: ["nomclient", "client", "raisonsocialeclient", "tiers", "maitredouvrage"],
    budget_previsionnel: ["budgetprevisionnel", "budget", "montantprevu", "montantaffaire"],
    date_debut_prevue: ["datedebutprevue", "datedebut", "debutchantier"],
  },
  employes: {
    nom: ["nom", "nomsalarie", "nomemploye"],
    prenom: ["prenom", "prenomsalarie", "prenomemploye"],
    poste: ["poste", "fonction", "emploi", "qualification"],
    type_contrat: ["typecontrat", "contrat", "naturecontrat"],
  },
  catalogue: {
    type: ["type", "typearticle", "nature", "famille"],
  },
  stock: {
    designation: ["designation", "libellearticle", "nomarticle", "article"],
  },
  ecritures_comptables: {
    source_logiciel: ["logicielsource", "source", "origine"],
  },
  tarifs_fournisseurs: {
    fournisseur_nom: ["fournisseur", "nomfournisseur", "raisonsocialefournisseur"],
    reference_fournisseur: ["referencefournisseur", "reffournisseur", "referencearticle", "codearticle"],
    eancode: ["ean", "ean13", "codebarres", "codeean", "gtin"],
    prix_public_ht: ["prixpublicht", "tarifpublicht", "prixcatalogueht"],
    prix_negocie_ht: ["prixnegocieht", "prixnetht", "prixclientht", "prixachatht", "paht"],
    minimum_commande: ["minimumcommande", "quantiteminimum", "qtemini"],
  },
};

export function suggererMappingImport(typeCle: string, colonnes: string[]): Record<string, number> {
  const conf = typeImport(typeCle);
  if (!conf) return {};
  const normalisees = colonnes.map(normaliserEnteteImport);
  const dejaUtilisees = new Set<number>();
  const mapping: Record<string, number> = {};

  for (const champ of conf.champs) {
    const aliases = [
      ...(ALIASES_PAR_TYPE[conf.cle]?.[champ.cle] ?? []),
      ...(ALIASES_COMMUNS[champ.cle] ?? []),
      champ.cle,
      champ.libelle,
    ].map(normaliserEnteteImport).filter(Boolean);
    let index = normalisees.findIndex((colonne, i) => !dejaUtilisees.has(i) && aliases.includes(colonne));
    if (index < 0) {
      index = normalisees.findIndex((colonne, i) => !dejaUtilisees.has(i) && aliases.some((alias) => alias.length >= 5 && (colonne.includes(alias) || alias.includes(colonne))));
    }
    mapping[champ.cle] = index;
    if (index >= 0) dejaUtilisees.add(index);
  }
  return mapping;
}
