export type CodeOffreTarifaire =
  | "mini"
  | "pro"
  | "business"
  | "entreprise"
  | "sur_mesure";

export type PeriodiciteAbonnement = "mensuel" | "annuel";

export type OffreTarifaire = {
  cle: CodeOffreTarifaire;
  palier: number;
  nom: string;
  base: number;
  prixMensuelCentimes: number;
  prixAnnuelCentimes: number;
  comptesInclus: number;
  administrateursInclus: number | null;
  libelleComptesInclus?: string;
  /**
   * Prix par compte supplémentaire de la GÉNÉRATION PRÉCÉDENTE (par forfait).
   * Conservé pour honorer les contrats souscrits sous cette génération, jamais
   * pour en établir un nouveau — d'où le nom. Voir `COMPTES_SUPPLEMENTAIRES`.
   */
  parCompteSupHistorique: number;
  operationsIAIncluses: number;
  stockageGoInclus: number;
  resume: string;
  fonctionnalites: readonly string[];
  populaire?: boolean;
  devisObligatoire?: boolean;
};

const SOCLE = [
  "acces_dashboard",
  "acces_messagerie",
  "acces_clients",
  "acces_chantiers",
  "acces_devis",
  "acces_factures",
  "acces_facturation_avancee",
  "acces_planning",
  "acces_ia",
] as const;

const TERRAIN = [
  "acces_pointage",
  "saisir_son_pointage",
  "acces_employes",
  "demander_ses_conges",
  "saisir_ses_notes_frais",
] as const;

const GESTION = [
  "acces_achats",
  "acces_interventions",
  "acces_crm",
  "voir_devis_chantier_sans_prix",
] as const;

const PILOTAGE = [
  "acces_stock",
  "utiliser_borne_stock",
  "acces_outillage",
  "acces_flotte",
  "acces_ouvrages",
  "acces_rentabilite",
  "acces_exports",
  "consulter_sa_paie",
  "saisir_variables_paie",
  "controler_variables_paie",
] as const;

const AVANCE = [
  "acces_connecteurs",
  "acces_appels_offres",
  "acces_sous_traitants",
  "acces_paiements_bancaires",
  "gerer_paie",
  "exporter_paie",
  "parametrer_paie",
] as const;

// Grille commerciale canonique — décision validée ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1
// (2026-09). Source de vérité unique consommée par la page /tarifs, l'onboarding, la page
// abonnement et le mapping Stripe. Règle annuelle officielle : ANNUEL = 10 × MENSUEL
// (deux mois offerts), figée par tarification.test.ts. Toute nouvelle grille est une décision
// explicite, historisée (`historique_tarification`), sans effet rétroactif sur les contrats
// en cours (cf. CGV art. 4.4). Voir docs/organisation/TARIFICATION_CANONIQUE.md.
export const OFFRES_TARIFAIRES: readonly OffreTarifaire[] = [
  {
    cle: "mini",
    palier: 1,
    nom: "Mini",
    base: 79,
    prixMensuelCentimes: 7_900,
    prixAnnuelCentimes: 79_000,
    comptesInclus: 3,
    administrateursInclus: 1,
    parCompteSupHistorique: 15,
    operationsIAIncluses: 100,
    stockageGoInclus: 10,
    resume: "Le socle commercial et chantier pour démarrer avec une petite équipe.",
    // Mini facture des comptes supplémentaires (comptesInclus ci-dessus) : le
    // client doit donc pouvoir créer/gérer ces comptes. acces_employes (route /employes)
    // est la seule permission manquante pour ça — gerer_employes n'est déjà limité par
    // aucune offre (cf. permissionIncluseDansOffre) et paie/RH avancé restent hors SOCLE.
    fonctionnalites: [...SOCLE, "acces_employes"],
  },
  {
    cle: "pro",
    palier: 2,
    nom: "Pro",
    base: 249,
    prixMensuelCentimes: 24_900,
    prixAnnuelCentimes: 249_000,
    comptesInclus: 15,
    administrateursInclus: 3,
    parCompteSupHistorique: 12,
    operationsIAIncluses: 500,
    stockageGoInclus: 50,
    resume: "Toute la gestion quotidienne des équipes, du matériel et des achats.",
    fonctionnalites: [...SOCLE, ...TERRAIN, ...GESTION],
  },
  {
    cle: "business",
    palier: 3,
    nom: "Business",
    base: 449,
    prixMensuelCentimes: 44_900,
    prixAnnuelCentimes: 449_000,
    comptesInclus: 30,
    administrateursInclus: 6,
    parCompteSupHistorique: 9,
    operationsIAIncluses: 1_500,
    stockageGoInclus: 150,
    resume: "Pilotage complet, connecteurs, comptabilité et automatisations avancées.",
    fonctionnalites: [...SOCLE, ...TERRAIN, ...GESTION, ...PILOTAGE],
  },
  {
    cle: "entreprise",
    palier: 4,
    nom: "Entreprise",
    base: 599,
    prixMensuelCentimes: 59_900,
    prixAnnuelCentimes: 599_000,
    comptesInclus: 50,
    administrateursInclus: 10,
    libelleComptesInclus: "40 salariés + 10 administrateurs",
    parCompteSupHistorique: 9,
    operationsIAIncluses: 3_000,
    stockageGoInclus: 300,
    resume: "40 salariés et 10 administrateurs inclus, avec accompagnement prioritaire.",
    fonctionnalites: [...SOCLE, ...TERRAIN, ...GESTION, ...PILOTAGE, ...AVANCE],
    populaire: true,
  },
  {
    cle: "sur_mesure",
    palier: 5,
    nom: "Sur mesure",
    base: 0,
    prixMensuelCentimes: 0,
    prixAnnuelCentimes: 0,
    comptesInclus: 50,
    administrateursInclus: null,
    libelleComptesInclus: "Capacité définie sur devis",
    parCompteSupHistorique: 0,
    operationsIAIncluses: 3_000,
    stockageGoInclus: 500,
    resume: "Volumétrie, intégrations et accompagnement adaptés après cadrage.",
    fonctionnalites: [...SOCLE, ...TERRAIN, ...GESTION, ...PILOTAGE, ...AVANCE],
    devisObligatoire: true,
  },
] as const;

/* ==========================================================================
   COMPTES SUPPLÉMENTAIRES — deux générations, une seule vendable
   --------------------------------------------------------------------------
   Décision ELSATIA-TARIFICATION-DECISIONS-COMMERCIALES-V1 : le prix d'un compte
   supplémentaire dépend du RÔLE RÉEL du compte, jamais du forfait souscrit.

   La génération précédente — un prix par forfait (15/12/9/9 €) — n'est PAS
   supprimée : elle est marquée non sélectionnable. Supprimer une grille sous
   laquelle des contrats ont été signés, c'est les repricer en silence. Elle
   reste donc lisible, pour une seule raison : honorer ce qui a été souscrit.

   ⚠ CONSTAT D'AUDIT, à lire avant de toucher à ces valeurs. Le seul chemin de
   facturation par compte réellement vivant est le mécanisme « capacité personne
   active » (ELSATIA-CAPACITY-STRIPE-R2). Il ne stocke qu'une QUANTITÉ
   (`entreprises.capacite_personnes_supplementaire`) : le prix unitaire est
   relu ici à chaque affichage. Tant qu'aucune colonne ne fige le prix unitaire
   souscrit au niveau du contrat, changer une valeur de la génération précédente
   REPRICERAIT les contrats existants. C'est pourquoi ces montants sont figés et
   qu'un test le vérifie. Le figement par contrat demande une migration, hors
   périmètre de cette correction.
   ========================================================================== */

export type RoleCompteSupplementaire =
  | "terrain"
  | "chef_equipe"
  | "administratif"
  | "expert_comptable";

export const GENERATION_COMPTES_COURANTE = "COMPTES-PAR-ROLE-2026-09" as const;
export const GENERATION_COMPTES_PRECEDENTE = "COMPTES-PAR-FORFAIT-2026-07" as const;

export type GenerationComptes =
  | typeof GENERATION_COMPTES_COURANTE
  | typeof GENERATION_COMPTES_PRECEDENTE;

export type TarifCompteParRole = {
  readonly cle: RoleCompteSupplementaire;
  readonly nom: string;
  readonly mensuelCentimes: number;
  /** « à partir de » : le tarif est un plancher public, pas un prix ferme. */
  readonly aPartirDe: boolean;
};

/** Génération COURANTE — la seule vendable. Le tarif suit le rôle du compte. */
export const COMPTES_SUPPLEMENTAIRES_PAR_ROLE: readonly TarifCompteParRole[] = [
  { cle: "terrain", nom: "Compte terrain supplémentaire", mensuelCentimes: 500, aPartirDe: true },
  { cle: "chef_equipe", nom: "Compte chef d’équipe supplémentaire", mensuelCentimes: 900, aPartirDe: true },
  { cle: "administratif", nom: "Compte administratif supplémentaire", mensuelCentimes: 1_500, aPartirDe: true },
  { cle: "expert_comptable", nom: "Accès expert-comptable", mensuelCentimes: 0, aPartirDe: false },
] as const;

/** Génération PRÉCÉDENTE — lisible, jamais sélectionnable pour un nouveau contrat. */
export const COMPTES_SUPPLEMENTAIRES_PAR_FORFAIT_HISTORIQUE: readonly {
  readonly offre: CodeOffreTarifaire;
  readonly mensuelCentimes: number;
}[] = [
  { offre: "mini", mensuelCentimes: 1_500 },
  { offre: "pro", mensuelCentimes: 1_200 },
  { offre: "business", mensuelCentimes: 900 },
  { offre: "entreprise", mensuelCentimes: 900 },
] as const;

export const COMPTES_SUPPLEMENTAIRES = {
  regle: "Le tarif dépend du rôle réel du compte supplémentaire, jamais du forfait souscrit.",
  generationCourante: {
    cle: GENERATION_COMPTES_COURANTE,
    libelle: "Par rôle du compte",
    selectionnablePourNouveauContrat: true,
    roles: COMPTES_SUPPLEMENTAIRES_PAR_ROLE,
  },
  generationsPrecedentes: [
    {
      cle: GENERATION_COMPTES_PRECEDENTE,
      libelle: "Par forfait souscrit (génération précédente)",
      selectionnablePourNouveauContrat: false,
      motifRetrait:
        "Le prix ne dépendait pas du rôle réel du compte. Conservée uniquement pour honorer les contrats souscrits sous cette génération.",
      parForfait: COMPTES_SUPPLEMENTAIRES_PAR_FORFAIT_HISTORIQUE,
    },
  ],
} as const;

export function generationComptesSelectionnable(generation: GenerationComptes): boolean {
  return generation === GENERATION_COMPTES_COURANTE;
}

/** Tarif public d'un compte supplémentaire, à la génération courante. */
export function tarifCompteSupplementaireCentimes(role: RoleCompteSupplementaire): number {
  const tarif = COMPTES_SUPPLEMENTAIRES_PAR_ROLE.find((item) => item.cle === role);
  if (!tarif) throw new Error(`Rôle de compte supplémentaire inconnu : ${role}`);
  return tarif.mensuelCentimes;
}

/** Tarif de la génération précédente, pour un contrat qui en relève. */
export function tarifCompteSupplementaireHistoriqueCentimes(cleOffre: string | null | undefined): number {
  const historique = COMPTES_SUPPLEMENTAIRES_PAR_FORFAIT_HISTORIQUE.find(
    (item) => item.offre === cleOffre,
  );
  return historique?.mensuelCentimes ?? offreTarifaireParCle(cleOffre).parCompteSupHistorique * 100;
}

/**
 * Le prix effectivement applicable à UN contrat. Trois règles, dans cet ordre :
 *
 *  1. un prix unitaire figé au contrat l'emporte toujours — c'est le prix
 *     souscrit, et rien ne le remplace ;
 *  2. sinon, un contrat de la génération précédente garde le tarif de SA
 *     génération : il n'est jamais migré vers la grille par rôle ;
 *  3. sinon, la grille courante s'applique, selon le rôle.
 *
 * Aucun chemin ne fait passer un contrat existant d'une génération à l'autre.
 */
export function tarifCompteSupplementairePourContratCentimes(params: {
  generationDuContrat: GenerationComptes;
  role?: RoleCompteSupplementaire;
  cleOffre?: string | null;
  prixUnitaireContractuelCentimes?: number | null;
}): number {
  if (
    params.prixUnitaireContractuelCentimes != null &&
    Number.isFinite(params.prixUnitaireContractuelCentimes) &&
    params.prixUnitaireContractuelCentimes >= 0
  ) {
    return Math.round(params.prixUnitaireContractuelCentimes);
  }
  if (params.generationDuContrat === GENERATION_COMPTES_PRECEDENTE) {
    return tarifCompteSupplementaireHistoriqueCentimes(params.cleOffre);
  }
  if (!params.role) {
    throw new Error(
      "Génération courante : le rôle du compte supplémentaire est obligatoire — la facturation dépend du rôle réel.",
    );
  }
  return tarifCompteSupplementaireCentimes(params.role);
}

/**
 * Garde-fou d'ouverture de contrat. Un nouveau client ne peut pas être placé
 * sur une génération retirée, même par un appel interne : c'est ici que la
 * règle « empêcher sa sélection pour un nouveau client » est tenue, pas dans
 * une consigne d'interface.
 */
export function verifierGenerationPourNouveauContrat(generation: GenerationComptes): void {
  if (!generationComptesSelectionnable(generation)) {
    throw new Error(
      `Génération tarifaire ${generation} retirée : elle ne peut plus être souscrite. ` +
        `Utiliser ${GENERATION_COMPTES_COURANTE}.`,
    );
  }
}

/* ==========================================================================
   IA — un achat ponctuel et une option récurrente, jamais confondus
   ========================================================================== */

/**
 * Pack de crédits IA : ACHAT PONCTUEL. Ni « /mois », ni tarif annuel, ni
 * multiplication par 10 ou 12, ni reconduction automatique. `prixAnnuelCentimes`
 * vaut `null` et non zéro : zéro serait un prix, `null` dit qu'il n'y en a pas.
 */
export const PACK_CREDITS_IA = {
  cle: "credits_ia",
  nom: "Pack de crédits IA",
  nature: "achat_ponctuel",
  prixCentimes: 2_900,
  aPartirDe: true,
  operations: 500,
  prixAnnuelCentimes: null,
  renouvellementAutomatique: false,
} as const;

/** IA intensive : option RÉCURRENTE, distincte du pack. Jamais fusionnées. */
export const OPTION_IA_INTENSIVE = {
  cle: "ia_intensive",
  nom: "IA intensive",
  nature: "recurrente",
  mensuelCentimes: 7_900,
  annuelCentimes: 79_000,
  operations: 2_500,
} as const;

/* ==========================================================================
   MODULES FACTURABLES
   --------------------------------------------------------------------------
   Un module DÉJÀ INCLUS dans le forfait n'est jamais facturé une seconde fois :
   `moduleInclusDansOffre()` le décide à partir des permissions « porte
   d'entrée » du module et des `fonctionnalites` de l'offre — donc de la même
   matrice que celle qui ouvre réellement l'accès, jamais d'une liste parallèle.
   « Matériel et véhicules » est UN produit commercial qui couvre DEUX modules
   du catalogue : une entreprise qui active les deux paie une fois.
   ========================================================================== */

export type ModuleFacturable = {
  readonly cle: string;
  readonly nom: string;
  readonly mensuelCentimes: number;
  readonly annuelCentimes: number;
  /** Codes du catalogue `public.modules_gestion_pro` couverts par ce produit. */
  readonly codesCatalogue: readonly string[];
  readonly permissionsPorteDEntree: readonly string[];
};

export const MODULES_FACTURABLES: readonly ModuleFacturable[] = [
  { cle: "pointage", nom: "Pointage", mensuelCentimes: 2_500, annuelCentimes: 25_000, codesCatalogue: ["pointage"], permissionsPorteDEntree: ["acces_pointage"] },
  { cle: "stock", nom: "Stock", mensuelCentimes: 2_900, annuelCentimes: 29_000, codesCatalogue: ["stock"], permissionsPorteDEntree: ["acces_stock"] },
  { cle: "materiel_vehicules", nom: "Matériel et véhicules", mensuelCentimes: 1_900, annuelCentimes: 19_000, codesCatalogue: ["materiel", "vehicules"], permissionsPorteDEntree: ["acces_outillage", "acces_flotte"] },
  { cle: "notes_frais", nom: "Notes de frais", mensuelCentimes: 1_200, annuelCentimes: 12_000, codesCatalogue: ["notes_frais"], permissionsPorteDEntree: ["saisir_ses_notes_frais"] },
  { cle: "rentabilite_avancee", nom: "Rentabilité avancée", mensuelCentimes: 2_900, annuelCentimes: 29_000, codesCatalogue: ["rentabilite_avancee"], permissionsPorteDEntree: ["acces_rentabilite"] },
] as const;

export function moduleFacturableParCle(cle: string): ModuleFacturable {
  const module_ = MODULES_FACTURABLES.find((item) => item.cle === cle);
  if (!module_) throw new Error(`Module facturable inconnu : ${cle}`);
  return module_;
}

/** Vrai si le forfait ouvre déjà ce module — auquel cas il n'est jamais facturé. */
export function moduleInclusDansOffre(cleModule: string, offre: OffreTarifaire): boolean {
  const module_ = moduleFacturableParCle(cleModule);
  return module_.permissionsPorteDEntree.every((permission) =>
    offre.fonctionnalites.includes(permission),
  );
}

/** Prix d'un module pour une offre donnée : zéro s'il y est déjà compris. */
export function tarifModuleCentimes(
  cleModule: string,
  offre: OffreTarifaire,
  periodicite: PeriodiciteAbonnement = "mensuel",
): number {
  if (moduleInclusDansOffre(cleModule, offre)) return 0;
  const module_ = moduleFacturableParCle(cleModule);
  return periodicite === "annuel" ? module_.annuelCentimes : module_.mensuelCentimes;
}

/* ==========================================================================
   OPTIONS RÉCURRENTES HORS COMPTES ET MODULES
   ========================================================================== */

export const OPTIONS_TARIFAIRES = [
  ...COMPTES_SUPPLEMENTAIRES_PAR_ROLE.map((role) => ({
    cle: `compte_${role.cle}`,
    nom: role.nom,
    nature: "recurrente" as const,
    mensuelCentimes: role.mensuelCentimes,
    aPartirDe: role.aPartirDe,
  })),
  { cle: "stockage", nom: "Stockage supplémentaire", nature: "recurrente" as const, mensuelCentimes: 1_900, aPartirDe: true },
  { cle: "synchronisation_bancaire", nom: "Synchronisation bancaire", nature: "recurrente" as const, mensuelCentimes: 2_900, aPartirDe: true },
  { cle: PACK_CREDITS_IA.cle, nom: PACK_CREDITS_IA.nom, nature: PACK_CREDITS_IA.nature, mensuelCentimes: null, prixCentimes: PACK_CREDITS_IA.prixCentimes, aPartirDe: PACK_CREDITS_IA.aPartirDe },
  { cle: OPTION_IA_INTENSIVE.cle, nom: OPTION_IA_INTENSIVE.nom, nature: OPTION_IA_INTENSIVE.nature, mensuelCentimes: OPTION_IA_INTENSIVE.mensuelCentimes, aPartirDe: false },
] as const;

export const SERVICES_MISE_EN_SERVICE = [
  { cle: "forfait_standard", nom: "Forfait de mise en service standard", prixMinCentimes: 199_000, prixMaxCentimes: 199_000 },
  { cle: "installation_simple", nom: "Installation simple", prixMinCentimes: 49_000, prixMaxCentimes: 49_000 },
  { cle: "import_donnees", nom: "Import employés, clients et fournisseurs", prixMinCentimes: 69_000, prixMaxCentimes: 69_000 },
  { cle: "configuration_40", nom: "Configuration complète jusqu’à 40 employés", prixMinCentimes: 150_000, prixMaxCentimes: 250_000 },
  { cle: "formation_distance", nom: "Formation à distance — demi-journée", prixMinCentimes: 49_000, prixMaxCentimes: 49_000 },
  { cle: "formation_site", nom: "Formation sur site — journée", prixMinCentimes: 90_000, prixMaxCentimes: 120_000, horsFraisDeplacement: true },
] as const;

export function estCodeOffreTarifaire(value: unknown): value is CodeOffreTarifaire {
  return OFFRES_TARIFAIRES.some((offre) => offre.cle === value);
}

export function offreTarifaireParCle(cle: string | null | undefined): OffreTarifaire {
  return OFFRES_TARIFAIRES.find((offre) => offre.cle === cle) ?? OFFRES_TARIFAIRES[0];
}

export function prixOffreCentimes(offre: OffreTarifaire, periodicite: PeriodiciteAbonnement) {
  return periodicite === "annuel" ? offre.prixAnnuelCentimes : offre.prixMensuelCentimes;
}

export function formatMontantCentimes(centimes: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);
}

/* ==========================================================================
   CALCUL D'UN ABONNEMENT
   --------------------------------------------------------------------------
   Deux totaux, jamais mélangés : ce qui est RÉCURRENT (le forfait, les comptes,
   les modules, les options) et ce qui est PONCTUEL (les packs de crédits IA).
   Additionner les deux donnerait une « mensualité » qui contient un achat unique.

   Règle annuelle appliquée aux lignes récurrentes : ×10, comme le forfait
   (deux mois offerts) — et non ×12, qui était la règle avant la grille
   canonique et subsistait ici pour les options.
   ========================================================================== */

export type LigneTarifaire = {
  readonly cle: string;
  readonly libelle: string;
  readonly quantite: number;
  readonly unitaireCentimes: number;
  readonly totalCentimes: number;
};

export function calculerTarifAbonnement(params: {
  offre: OffreTarifaire;
  periodicite?: PeriodiciteAbonnement;
  /** Comptes supplémentaires PAR RÔLE — la facturation suit le rôle réel. */
  comptesSupplementaires?: Partial<Record<RoleCompteSupplementaire, number>>;
  /** Génération tarifaire du contrat. Un contrat existant garde la sienne. */
  generationComptes?: GenerationComptes;
  /** Prix unitaire figé au contrat, s'il en existe un : il l'emporte sur tout. */
  prixUnitaireCompteContractuelCentimes?: number | null;
  /** Clés de `MODULES_FACTURABLES` activées par l'entreprise. */
  modules?: readonly string[];
  stockageSupplementaire?: boolean;
  synchronisationBancaire?: "aucune" | "standard" | "avancee";
  iaIntensive?: boolean;
  /** Packs de crédits IA achetés — ponctuels, hors récurrent. */
  packsCreditsIA?: number;
}) {
  const periodicite = params.periodicite ?? "mensuel";
  const generation = params.generationComptes ?? GENERATION_COMPTES_COURANTE;
  const facteurAnnuel = periodicite === "annuel" ? 10 : 1;

  const lignesRecurrentes: LigneTarifaire[] = [];

  // --- Comptes supplémentaires, au tarif du rôle -------------------------
  for (const role of COMPTES_SUPPLEMENTAIRES_PAR_ROLE) {
    const quantite = Math.max(0, Math.trunc(params.comptesSupplementaires?.[role.cle] ?? 0));
    if (quantite === 0) continue;
    const unitaire = tarifCompteSupplementairePourContratCentimes({
      generationDuContrat: generation,
      role: role.cle,
      cleOffre: params.offre.cle,
      prixUnitaireContractuelCentimes: params.prixUnitaireCompteContractuelCentimes,
    });
    lignesRecurrentes.push({
      cle: `compte_${role.cle}`,
      libelle: role.nom,
      quantite,
      unitaireCentimes: unitaire * facteurAnnuel,
      totalCentimes: quantite * unitaire * facteurAnnuel,
    });
  }

  // --- Modules : jamais facturés s'ils sont déjà compris -----------------
  const modulesNonFactures: string[] = [];
  for (const cleModule of params.modules ?? []) {
    const module_ = moduleFacturableParCle(cleModule);
    if (moduleInclusDansOffre(cleModule, params.offre)) {
      modulesNonFactures.push(cleModule);
      continue;
    }
    const unitaire = periodicite === "annuel" ? module_.annuelCentimes : module_.mensuelCentimes;
    lignesRecurrentes.push({
      cle: `module_${cleModule}`,
      libelle: module_.nom,
      quantite: 1,
      unitaireCentimes: unitaire,
      totalCentimes: unitaire,
    });
  }

  // --- Autres options récurrentes ---------------------------------------
  if (params.stockageSupplementaire) {
    const unitaire = 1_900 * facteurAnnuel;
    lignesRecurrentes.push({ cle: "stockage", libelle: "Stockage supplémentaire", quantite: 1, unitaireCentimes: unitaire, totalCentimes: unitaire });
  }
  if (params.synchronisationBancaire && params.synchronisationBancaire !== "aucune") {
    const mensuel = params.synchronisationBancaire === "avancee" ? 5_900 : 2_900;
    const unitaire = mensuel * facteurAnnuel;
    lignesRecurrentes.push({ cle: "synchronisation_bancaire", libelle: "Synchronisation bancaire", quantite: 1, unitaireCentimes: unitaire, totalCentimes: unitaire });
  }
  if (params.iaIntensive) {
    const unitaire = periodicite === "annuel" ? OPTION_IA_INTENSIVE.annuelCentimes : OPTION_IA_INTENSIVE.mensuelCentimes;
    lignesRecurrentes.push({ cle: OPTION_IA_INTENSIVE.cle, libelle: OPTION_IA_INTENSIVE.nom, quantite: 1, unitaireCentimes: unitaire, totalCentimes: unitaire });
  }

  // --- Achats ponctuels : hors de tout total récurrent -------------------
  const lignesPonctuelles: LigneTarifaire[] = [];
  const packs = Math.max(0, Math.trunc(params.packsCreditsIA ?? 0));
  if (packs > 0) {
    lignesPonctuelles.push({
      cle: PACK_CREDITS_IA.cle,
      libelle: PACK_CREDITS_IA.nom,
      quantite: packs,
      unitaireCentimes: PACK_CREDITS_IA.prixCentimes,
      totalCentimes: packs * PACK_CREDITS_IA.prixCentimes,
    });
  }

  const baseCentimes = prixOffreCentimes(params.offre, periodicite);
  const optionsCentimes = lignesRecurrentes.reduce((somme, ligne) => somme + ligne.totalCentimes, 0);
  const achatsPonctuelsCentimes = lignesPonctuelles.reduce((somme, ligne) => somme + ligne.totalCentimes, 0);
  const totalCentimes = baseCentimes + optionsCentimes;

  return {
    periodicite,
    generationComptes: generation,
    baseCentimes,
    optionsCentimes,
    totalCentimes,
    equivalentMensuelCentimes: periodicite === "annuel" ? Math.round(totalCentimes / 12) : totalCentimes,
    achatsPonctuelsCentimes,
    lignesRecurrentes,
    lignesPonctuelles,
    modulesNonFactures,
  };
}

const PERMISSIONS_NON_LIMITEES = new Set(["essentiel", "premium"]);
const PERMISSIONS_MODULES_LIMITEES = new Set(
  OFFRES_TARIFAIRES.flatMap((offre) => [...offre.fonctionnalites]),
);

export function permissionIncluseDansOffre(permission: string, codeOffre: string | null | undefined) {
  if (!codeOffre || PERMISSIONS_NON_LIMITEES.has(codeOffre)) return true;
  const offre = OFFRES_TARIFAIRES.find((item) => item.cle === codeOffre);
  if (!offre) return true;
  if (permission === "acces_parametres" || permission === "gerer_parametres" || permission === "gerer_utilisateurs") {
    return true;
  }
  // Les droits fins d'une personne restent gérés par son rôle. Le plan ne filtre
  // que les portes d'entrée de modules connues afin de ne jamais élargir un droit.
  if (!PERMISSIONS_MODULES_LIMITEES.has(permission)) return true;
  return offre.fonctionnalites.includes(permission);
}

/**
 * Vrai si cette permission est réellement une porte d'entrée de module/offre
 * (donc concernée par ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1 : sans offre
 * choisie, seul l'entitlement module — achat ou essai actif — peut l'ouvrir).
 * Les permissions administratives de base (paramètres, utilisateurs) et toute
 * permission hors grille tarifaire restent hors périmètre : `permissionIncluseDansOffre`
 * les laisse déjà toujours ouvertes, offre choisie ou non, et ça ne change pas ici.
 */
export function permissionEstPorteDEntreeModule(permission: string): boolean {
  return permission !== "acces_parametres"
    && permission !== "gerer_parametres"
    && permission !== "gerer_utilisateurs"
    && PERMISSIONS_MODULES_LIMITEES.has(permission);
}

export function filtrerPermissionsSelonOffre(permissions: Iterable<string>, codeOffre: string | null | undefined) {
  return [...permissions].filter((permission) => permissionIncluseDansOffre(permission, codeOffre));
}
