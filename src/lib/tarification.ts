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
  parCompteSup: number;
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

export const OFFRES_TARIFAIRES: readonly OffreTarifaire[] = [
  {
    cle: "mini",
    palier: 1,
    nom: "Mini",
    base: 79,
    prixMensuelCentimes: 7_900,
    prixAnnuelCentimes: 94_800,
    comptesInclus: 3,
    administrateursInclus: 1,
    parCompteSup: 15,
    operationsIAIncluses: 100,
    stockageGoInclus: 10,
    resume: "Le socle commercial et chantier pour démarrer avec une petite équipe.",
    fonctionnalites: SOCLE,
  },
  {
    cle: "pro",
    palier: 2,
    nom: "Pro",
    base: 249,
    prixMensuelCentimes: 24_900,
    prixAnnuelCentimes: 298_800,
    comptesInclus: 15,
    administrateursInclus: 3,
    parCompteSup: 12,
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
    prixAnnuelCentimes: 538_800,
    comptesInclus: 30,
    administrateursInclus: 6,
    parCompteSup: 9,
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
    prixAnnuelCentimes: 646_800,
    comptesInclus: 50,
    administrateursInclus: 10,
    parCompteSup: 9,
    operationsIAIncluses: 3_000,
    stockageGoInclus: 300,
    resume: "40 collaborateurs et 10 administrateurs, avec accompagnement prioritaire.",
    fonctionnalites: [...SOCLE, ...TERRAIN, ...GESTION, ...PILOTAGE, ...AVANCE],
    populaire: true,
  },
  {
    cle: "sur_mesure",
    palier: 5,
    nom: "Sur mesure",
    base: 699,
    prixMensuelCentimes: 69_900,
    prixAnnuelCentimes: 838_800,
    comptesInclus: 50,
    administrateursInclus: null,
    parCompteSup: 0,
    operationsIAIncluses: 3_000,
    stockageGoInclus: 500,
    resume: "Volumétrie, intégrations et accompagnement adaptés après cadrage.",
    fonctionnalites: [...SOCLE, ...TERRAIN, ...GESTION, ...PILOTAGE, ...AVANCE],
    devisObligatoire: true,
  },
] as const;

export const OPTIONS_TARIFAIRES = [
  { cle: "compte_terrain", nom: "Compte terrain supplémentaire", prixMensuelCentimes: 500 },
  { cle: "compte_chef_equipe", nom: "Compte chef d'équipe supplémentaire", prixMensuelCentimes: 900 },
  { cle: "compte_administratif", nom: "Compte administratif supplémentaire", prixMensuelCentimes: 1_500 },
  { cle: "expert_comptable", nom: "Accès expert-comptable", prixMensuelCentimes: 0 },
  { cle: "stockage", nom: "Stockage supplémentaire", prixMensuelCentimes: 1_900 },
  { cle: "synchronisation_bancaire", nom: "Synchronisation bancaire", prixMensuelCentimes: 2_900 },
  { cle: "credits_ia", nom: "Pack de crédits IA", prixMensuelCentimes: 2_900 },
  { cle: "ia_intensive", nom: "IA intensive", prixMensuelCentimes: 7_900 },
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

export function calculerTarifAbonnement(params: {
  offre: OffreTarifaire;
  periodicite?: PeriodiciteAbonnement;
  comptesTerrainSupplementaires?: number;
  comptesChefEquipeSupplementaires?: number;
  comptesAdministratifsSupplementaires?: number;
  stockageSupplementaire?: boolean;
  synchronisationBancaire?: "aucune" | "standard" | "avancee";
  creditsIA?: boolean;
  iaIntensive?: boolean;
}) {
  const periodicite = params.periodicite ?? "mensuel";
  const baseMensuelle = params.offre.prixMensuelCentimes;
  const optionsMensuelles =
    Math.max(0, params.comptesTerrainSupplementaires ?? 0) * 500 +
    Math.max(0, params.comptesChefEquipeSupplementaires ?? 0) * 900 +
    Math.max(0, params.comptesAdministratifsSupplementaires ?? 0) * 1_500 +
    (params.stockageSupplementaire ? 1_900 : 0) +
    (params.synchronisationBancaire === "avancee" ? 5_900 : params.synchronisationBancaire === "standard" ? 2_900 : 0) +
    (params.creditsIA ? 2_900 : 0) +
    (params.iaIntensive ? 7_900 : 0);
  const basePeriode = periodicite === "annuel" ? params.offre.prixAnnuelCentimes : baseMensuelle;
  const optionsPeriode = optionsMensuelles * (periodicite === "annuel" ? 12 : 1);
  return {
    baseCentimes: basePeriode,
    optionsCentimes: optionsPeriode,
    totalCentimes: basePeriode + optionsPeriode,
    equivalentMensuelCentimes: periodicite === "annuel"
      ? Math.round((basePeriode + optionsPeriode) / 12)
      : basePeriode + optionsPeriode,
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

export function filtrerPermissionsSelonOffre(permissions: Iterable<string>, codeOffre: string | null | undefined) {
  return [...permissions].filter((permission) => permissionIncluseDansOffre(permission, codeOffre));
}
