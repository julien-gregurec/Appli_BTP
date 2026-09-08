import {
  OFFRES_TARIFAIRES,
  OPTIONS_TARIFAIRES,
  SERVICES_MISE_EN_SERVICE,
  offreTarifaireParCle,
  type CodeOffreTarifaire,
  type OffreTarifaire,
  type PeriodiciteAbonnement,
} from "@/lib/tarification";
import { MODULES_GESTION_PRO_CODES, type ModuleGestionProCode } from "@/lib/modules-gestion-pro-codes";

/**
 * SOURCE CANONIQUE COMMERCIALE — ELSATIA Gestion Pro (§17 du lot
 * ELSATIA-GP-SUBSCRIPTIONS-MODULES-DISCOUNTS-CANONICAL-V1).
 *
 * Ce fichier NE REDÉFINIT AUCUN PRIX DE FORFAIT : la grille publique reste
 * `src/lib/tarification.ts` / `tarification.canonical.json` (décision
 * ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1, version `CANONICAL-V3-2026-09`).
 * Il ajoute uniquement ce qui manquait pour vendre à la carte : le prix des
 * modules, le modèle de comptes, les blocs de stockage, l'IA, et le statut
 * commercial de chaque montant.
 *
 * Aucune de ces valeurs n'est inventée : chacune porte un `statutPrix` qui dit
 * d'où elle vient et ce qu'elle vaut juridiquement.
 *
 *  - `valide`     : décision commerciale actée, déjà câblée ailleurs (doc
 *                   TARIFICATION_CANONIQUE.md, migration, Stripe).
 *  - `recommande` : proposition argumentée d'une étude ELSATIA, cohérente avec
 *                   le reste, en attente d'arbitrage.
 *  - `provisoire` : montant de travail, non figé (étude
 *                   ELSATIA_MODULES_COMMERCIAL_PRICING_V1, §36).
 *  - `divergent`  : DEUX valeurs incompatibles coexistent dans le dépôt. Le
 *                   moteur n'en choisit jamais une silencieusement.
 *  - `a_definir`  : pas de prix ; interdit à la vente.
 *
 * Règle absolue : le tarif public ne change JAMAIS pour avantager un client.
 * Un avantage individuel est une remise (`src/lib/commercial/remises.ts`),
 * jamais une modification de ce catalogue.
 */

export type StatutPrix = "valide" | "recommande" | "provisoire" | "divergent" | "a_definir";

export type Devise = "eur";
export const DEVISE: Devise = "eur";

/** Version du catalogue commercial, distincte de la version de la grille publique. */
export const VERSION_CATALOGUE_COMMERCIAL = "GP-COMMERCIAL-V1-2026-09";
export const VERSION_GRILLE_PUBLIQUE = "CANONICAL-V3-2026-09";

export type CodeForfaitVendable = "mini" | "pro" | "business" | "entreprise";
export const FORFAITS_VENDABLES: readonly CodeForfaitVendable[] = ["mini", "pro", "business", "entreprise"] as const;

export function estForfaitVendable(valeur: unknown): valeur is CodeForfaitVendable {
  return (FORFAITS_VENDABLES as readonly unknown[]).includes(valeur);
}

export { OFFRES_TARIFAIRES, offreTarifaireParCle };
export type { CodeOffreTarifaire, OffreTarifaire, PeriodiciteAbonnement };

// ─────────────────────────────────────────────────────────────────────────────
// 1. Règle annuelle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * « ANNUEL = 10 × MENSUEL — 2 mois offerts » est la règle CANONIQUE du forfait,
 * figée par `tarification.test.ts` et par `verify:stripe-prices`.
 *
 * Elle n'a jamais été tranchée pour les LIGNES OPTIONNELLES : le dépôt contient
 * aujourd'hui deux comportements contradictoires —
 *   - `plateforme.prixAbonnementMensuel` : `totalAnnuel = prixAnnuelFixe + sup × parCompteSup × 12`
 *   - `tarification.calculerTarifAbonnement` : `optionsPeriode = optionsMensuelles × 12`
 * soit ×12 pour les options alors que le forfait est à ×10.
 *
 * Le moteur reproduit l'état actuel par défaut (×12) pour ne pas modifier
 * silencieusement une facturation existante, et expose la valeur recommandée
 * (×10, cohérente avec la promesse publique « 2 mois offerts ») comme une
 * décision à prendre — cf. §11 du rapport et `MULTIPLICATEURS_ANNUELS`.
 */
export const MULTIPLICATEUR_ANNUEL_FORFAIT = 10;

export type FamilleLigne = "forfait" | "comptes" | "modules" | "stockage" | "ia" | "prestation";

export const MULTIPLICATEURS_ANNUELS: Record<FamilleLigne, { valeur: number; statut: StatutPrix; recommande: number }> = {
  forfait: { valeur: 10, statut: "valide", recommande: 10 },
  comptes: { valeur: 12, statut: "divergent", recommande: 10 },
  modules: { valeur: 10, statut: "recommande", recommande: 10 },
  stockage: { valeur: 12, statut: "divergent", recommande: 10 },
  ia: { valeur: 12, statut: "divergent", recommande: 10 },
  prestation: { valeur: 1, statut: "valide", recommande: 1 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Comptes et salariés — DEUX MODÈLES COEXISTANTS, aucun choisi arbitrairement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4 du lot. Le dépôt porte deux modèles incompatibles de facturation des accès :
 *
 * A. `capacite_personnes` — prix PLAT par « personne active » et par forfait
 *    (Mini 15 € · Pro 12 € · Business 9 € · Entreprise 9 €). C'est le modèle
 *    RÉELLEMENT IMPLÉMENTÉ de bout en bout : `tarification.canonical.json`,
 *    `OffreTarifaire.parCompteSup`, migration 20260903000256 (trigger de
 *    capacité), Price Stripe `STRIPE_PRICE_COMPTE_SUP_*`, page `/abonnement`.
 *    → statut `valide`.
 *
 * B. `par_type_de_compte` — prix par RÔLE (terrain 5 € · chef d'équipe 9 € ·
 *    administratif 15 € · expert-comptable 0 €). Présent uniquement de façon
 *    DÉCLARATIVE dans `OPTIONS_TARIFAIRES`, plus des constantes dupliquées en
 *    dur dans `calculerTarifAbonnement`. Rien côté base ni côté Stripe ne
 *    distingue un compte terrain d'un compte administratif.
 *    → statut `divergent` : c'est le modèle demandé au §4 du lot, mais il n'est
 *      pas encore une décision actée ni une capacité technique.
 *
 * Le moteur sait calculer les deux. Le défaut reste A (l'existant facturé).
 */
export type ModeleComptes = "capacite_personnes" | "par_type_de_compte";
export const MODELE_COMPTES_PAR_DEFAUT: ModeleComptes = "capacite_personnes";

export type TypeCompte = "terrain" | "chef_equipe" | "administratif" | "expert_comptable";

export type DefinitionTypeCompte = {
  cle: TypeCompte;
  nom: string;
  /** Peut se connecter à l'application. Un salarié sans compte ne coûte rien. */
  connexion: boolean;
  /** Compte facturé au titre de la capacité « personnes actives » (modèle A). */
  compteDansCapacite: boolean;
  prixMensuelCentimes: number;
  statutPrix: StatutPrix;
  origine: string;
};

/**
 * Modèle B — prix par type de compte. Repris à l'identique d'`OPTIONS_TARIFAIRES`
 * (aucun montant modifié ici : §4 « ne pas les modifier arbitrairement »).
 */
export const TYPES_COMPTE: readonly DefinitionTypeCompte[] = [
  {
    cle: "terrain",
    nom: "Compte terrain supplémentaire",
    connexion: true,
    compteDansCapacite: true,
    prixMensuelCentimes: 500,
    statutPrix: "divergent",
    origine: "OPTIONS_TARIFAIRES.compte_terrain — jamais facturé (aucun Price Stripe, aucune distinction en base)",
  },
  {
    cle: "chef_equipe",
    nom: "Compte chef d'équipe supplémentaire",
    connexion: true,
    compteDansCapacite: true,
    prixMensuelCentimes: 900,
    statutPrix: "divergent",
    origine: "OPTIONS_TARIFAIRES.compte_chef_equipe — idem",
  },
  {
    cle: "administratif",
    nom: "Compte administratif supplémentaire",
    connexion: true,
    compteDansCapacite: true,
    prixMensuelCentimes: 1_500,
    statutPrix: "divergent",
    origine: "OPTIONS_TARIFAIRES.compte_administratif — idem ; égale par coïncidence le parCompteSup Mini (15 €)",
  },
  {
    cle: "expert_comptable",
    nom: "Accès expert-comptable",
    connexion: true,
    compteDansCapacite: false,
    prixMensuelCentimes: 0,
    statutPrix: "recommande",
    origine: "OPTIONS_TARIFAIRES.expert_comptable — gratuit, hors capacité facturée (intervenant externe)",
  },
] as const;

export function typeCompteParCle(cle: string): DefinitionTypeCompte | null {
  return TYPES_COMPTE.find((type) => type.cle === cle) ?? null;
}

/** Modèle A — prix plat de la personne active supplémentaire, par forfait. */
export function prixPersonneSupplementaireCentimes(forfait: CodeOffreTarifaire): number {
  return Math.round(offreTarifaireParCle(forfait).parCompteSup * 100);
}

/**
 * Un SALARIÉ enregistré dans Gestion Pro n'est pas un COMPTE. La capacité
 * facturée compte les personnes actives — fiche `employes` non sortie ET compte
 * applicatif non fermé (contrat de `compter_personnes_actives_entreprise`,
 * migration 20260903000256). Une entreprise peut donc enregistrer 5 salariés et
 * n'ouvrir que 3 comptes : elle ne paie que 3.
 */
export const CONTRAT_PERSONNE_ACTIVE =
  "fiche employé avec statut <> 'sorti' ET compte applicatif <> 'fermé' — SQL compter_personnes_actives_entreprise";

// ─────────────────────────────────────────────────────────────────────────────
// 3. Catalogue commercial des modules
// ─────────────────────────────────────────────────────────────────────────────

export type StatutCatalogueModule = "actif" | "bientot" | "interne" | "non_vendable";
export type FamilleModule = "socle" | "terrain" | "gestion" | "finance" | "integration" | "infra";

export type DefinitionModuleCommercial = {
  /** Clé commerciale. Peut regrouper plusieurs codes techniques R3. */
  cle: string;
  nom: string;
  /** Codes `modules_gestion_pro.code` couverts (migration 20260903000257). */
  codesTechniques: readonly ModuleGestionProCode[];
  famille: FamilleModule;
  /** Repris tel quel du seed R3 : jamais de prix ni d'achat si <> "actif". */
  statutCatalogue: StatutCatalogueModule;
  /** Forfaits qui l'incluent sans supplément (source : `plans_inclus` R3). */
  inclusDansForfaits: readonly CodeForfaitVendable[];
  /**
   * Prix à la carte HT/mois par forfait de départ, en centimes.
   * `null` = non proposé à ce niveau. Absent = inclus (donc 0).
   */
  prixCarteCentimes: Partial<Record<CodeForfaitVendable, number | null>>;
  statutPrix: StatutPrix;
  /** Le module a une consommation facturée en sus (crédits, pages, signatures). */
  consommation: boolean;
  /** Vendable séparément aujourd'hui (statut actif ET prix exploitable). */
  vendableALaCarte: boolean;
  note?: string;
};

/**
 * Prix issus de l'étude `ELSATIA_MODULES_COMMERCIAL_PRICING_V1` (§22/§36-A),
 * branche `docs/elsatia-modules-commercial-pricing-v1`. Ils y sont explicitement
 * qualifiés de « propositions de travail destinées à l'arbitrage de Julien » :
 * ils sont donc `provisoire` ici, et le configurateur les affiche comme tels.
 * Les inclusions `inclusDansForfaits` sont, elles, la copie exacte de
 * `plans_inclus` du seed R3 (migration 20260903000257) — donc `valide`.
 */
export const MODULES_COMMERCIAUX: readonly DefinitionModuleCommercial[] = [
  {
    cle: "chantier",
    nom: "Suivi de chantier",
    codesTechniques: ["chantier"],
    famille: "socle",
    statutCatalogue: "actif",
    inclusDansForfaits: ["mini", "pro", "business", "entreprise"],
    prixCarteCentimes: {},
    statutPrix: "valide",
    consommation: false,
    vendableALaCarte: false,
    note: "Socle intangible : inclus partout, jamais vendu séparément.",
  },
  {
    cle: "ia",
    nom: "Assistant IA",
    codesTechniques: ["ia"],
    famille: "gestion",
    statutCatalogue: "actif",
    inclusDansForfaits: ["mini", "pro", "business", "entreprise"],
    prixCarteCentimes: {},
    statutPrix: "valide",
    consommation: true,
    vendableALaCarte: false,
    note: "Droit d'accès inclus partout. La monétisation IA passe par le quota du forfait, les packs de crédits et l'option IA intensive — jamais par un second abonnement.",
  },
  {
    cle: "pointage",
    nom: "Pointage",
    codesTechniques: ["pointage"],
    famille: "terrain",
    statutCatalogue: "actif",
    inclusDansForfaits: ["pro", "business", "entreprise"],
    prixCarteCentimes: { mini: 2_500 },
    statutPrix: "provisoire",
    consommation: false,
    vendableALaCarte: true,
  },
  {
    cle: "notes_frais",
    nom: "Notes de frais",
    codesTechniques: ["notes_frais"],
    famille: "gestion",
    statutCatalogue: "actif",
    inclusDansForfaits: ["pro", "business", "entreprise"],
    prixCarteCentimes: { mini: 1_200 },
    statutPrix: "provisoire",
    consommation: false,
    vendableALaCarte: true,
    note: "L'étude recommande (§9b) de l'inclure aussi dans Mini. Non appliqué ici : ce serait modifier `plans_inclus` sans arbitrage. Décision D4 du rapport.",
  },
  {
    cle: "materiel_vehicules",
    nom: "Matériel & véhicules",
    codesTechniques: ["materiel", "vehicules"],
    famille: "gestion",
    statutCatalogue: "actif",
    inclusDansForfaits: ["business", "entreprise"],
    prixCarteCentimes: { mini: 1_900, pro: 1_500 },
    statutPrix: "provisoire",
    consommation: false,
    vendableALaCarte: true,
    note: "Regroupement commercial des deux codes techniques R3 (`materiel` + `vehicules`) : la valeur client perçue est « gérer mon parc ». Les codes restent séparés en base.",
  },
  {
    cle: "stock",
    nom: "Stock & dépôt",
    codesTechniques: ["stock"],
    famille: "terrain",
    statutCatalogue: "actif",
    inclusDansForfaits: ["business", "entreprise"],
    prixCarteCentimes: { mini: 2_900, pro: 2_400 },
    statutPrix: "provisoire",
    consommation: false,
    vendableALaCarte: true,
  },
  {
    cle: "rentabilite_avancee",
    nom: "Rentabilité avancée",
    codesTechniques: ["rentabilite_avancee"],
    famille: "finance",
    statutCatalogue: "actif",
    inclusDansForfaits: ["business", "entreprise"],
    prixCarteCentimes: { mini: null, pro: 2_900 },
    statutPrix: "provisoire",
    consommation: false,
    vendableALaCarte: true,
    note: "Les indicateurs de marge de base restent inclus dans tous les forfaits ; seul l'analytique avancé est le module.",
  },
  {
    cle: "safety",
    nom: "Sécurité & prévention",
    codesTechniques: ["safety"],
    famille: "terrain",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: { mini: 2_400, pro: 1_900 },
    statutPrix: "provisoire",
    consommation: false,
    vendableALaCarte: false,
  },
  {
    cle: "forms",
    nom: "Formulaires terrain",
    codesTechniques: ["forms"],
    famille: "terrain",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: { mini: 1_900, pro: 1_500 },
    statutPrix: "provisoire",
    consommation: false,
    vendableALaCarte: false,
  },
  {
    cle: "connect",
    nom: "Connecteurs & API",
    codesTechniques: ["connect"],
    famille: "integration",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: { mini: null, pro: 3_900 },
    statutPrix: "provisoire",
    consommation: false,
    vendableALaCarte: false,
  },
  {
    cle: "automations",
    nom: "Automatisations",
    codesTechniques: ["automations"],
    famille: "gestion",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: { mini: null, pro: 2_900 },
    statutPrix: "provisoire",
    consommation: true,
    vendableALaCarte: false,
  },
  {
    cle: "planning_avance",
    nom: "Planning avancé",
    codesTechniques: ["planning_avance"],
    famille: "terrain",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: {},
    statutPrix: "a_definir",
    consommation: false,
    vendableALaCarte: false,
    note: "Le delta avec le planning de base (inclus partout) n'est pas spécifié : aucun prix tant que la fonction n'existe pas.",
  },
  {
    cle: "scan_ocr",
    nom: "Scan & OCR",
    codesTechniques: ["scan_ocr"],
    famille: "terrain",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: {},
    statutPrix: "a_definir",
    consommation: true,
    vendableALaCarte: false,
    note: "Modèle module + quota de pages + dépassement à la page. Prix impossible à figer avant choix du fournisseur OCR.",
  },
  {
    cle: "signature",
    nom: "Signature électronique",
    codesTechniques: ["signature"],
    famille: "gestion",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: {},
    statutPrix: "a_definir",
    consommation: true,
    vendableALaCarte: false,
    note: "Coût eIDAS à l'acte : prix impossible à figer avant contrat fournisseur.",
  },
  {
    cle: "maintenance",
    nom: "Maintenance",
    codesTechniques: ["maintenance"],
    famille: "gestion",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: {},
    statutPrix: "a_definir",
    consommation: false,
    vendableALaCarte: false,
  },
  {
    cle: "facturation_electronique",
    nom: "Facturation électronique",
    codesTechniques: ["facturation_electronique"],
    famille: "finance",
    statutCatalogue: "bientot",
    inclusDansForfaits: [],
    prixCarteCentimes: {},
    statutPrix: "a_definir",
    consommation: true,
    vendableALaCarte: false,
    note: "Dépend d'une PDP partenaire (réforme e-invoicing). Ne pas commercialiser avant intégration réelle.",
  },
  {
    cle: "stockage_supplementaire",
    nom: "Stockage supplémentaire",
    codesTechniques: ["stockage_supplementaire"],
    famille: "infra",
    statutCatalogue: "interne",
    inclusDansForfaits: [],
    prixCarteCentimes: {},
    statutPrix: "valide",
    consommation: true,
    vendableALaCarte: false,
    note: "CAPACITÉ, pas module : facturée par blocs (voir BLOC_STOCKAGE) et par dépassement au Go.",
  },
  {
    cle: "sauvegarde_renforcee",
    nom: "Sauvegarde renforcée",
    codesTechniques: ["sauvegarde_renforcee"],
    famille: "infra",
    statutCatalogue: "non_vendable",
    inclusDansForfaits: [],
    prixCarteCentimes: {},
    statutPrix: "a_definir",
    consommation: false,
    vendableALaCarte: false,
    note: "Le service n'existe pas (rétention étendue, copie hors-région, RTO/RPO, restore self-service, runbook éprouvé). Ne rien promettre.",
  },
] as const;

export function moduleCommercialParCle(cle: string): DefinitionModuleCommercial | null {
  return MODULES_COMMERCIAUX.find((definition) => definition.cle === cle) ?? null;
}

/** Modules réellement achetables aujourd'hui pour ce forfait de départ. */
export function modulesAchetablesPour(forfait: CodeForfaitVendable): readonly DefinitionModuleCommercial[] {
  return MODULES_COMMERCIAUX.filter(
    (definition) =>
      definition.vendableALaCarte
      && !definition.inclusDansForfaits.includes(forfait)
      && typeof definition.prixCarteCentimes[forfait] === "number",
  );
}

export function moduleInclusDansForfait(cle: string, forfait: CodeForfaitVendable): boolean {
  return moduleCommercialParCle(cle)?.inclusDansForfaits.includes(forfait) ?? false;
}

/**
 * Prix à la carte du module pour ce forfait, en centimes.
 * `0` si inclus dans le forfait. `null` si non proposé / non vendable.
 */
export function prixModuleCentimes(cle: string, forfait: CodeForfaitVendable): number | null {
  const definition = moduleCommercialParCle(cle);
  if (!definition) return null;
  if (definition.inclusDansForfaits.includes(forfait)) return 0;
  if (!definition.vendableALaCarte) return null;
  const prix = definition.prixCarteCentimes[forfait];
  return typeof prix === "number" ? prix : null;
}

/** Tout code technique R3 doit être couvert exactement une fois par le catalogue commercial. */
export function codesTechniquesCouverts(): readonly ModuleGestionProCode[] {
  return MODULES_COMMERCIAUX.flatMap((definition) => definition.codesTechniques);
}

export { MODULES_GESTION_PRO_CODES };
export type { ModuleGestionProCode };

// ─────────────────────────────────────────────────────────────────────────────
// 4. Stockage et IA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bloc de stockage supplémentaire. `OPTIONS_TARIFAIRES.stockage` porte déjà
 * 19 €/mois ; l'étude propose des blocs de +50 Go dans une fourchette 19–25 €.
 * On retient la borne basse, déjà présente dans le dépôt (aucun montant inventé).
 */
export const BLOC_STOCKAGE = {
  cle: "stockage",
  nom: "Bloc de stockage supplémentaire",
  goParBloc: 50,
  prixMensuelCentimes: 1_900,
  statutPrix: "provisoire" as StatutPrix,
  origine: "OPTIONS_TARIFAIRES.stockage (19 €) + étude §20 (blocs de 50 Go, 19–25 €)",
};

/** Dépassement de quota déjà facturé aujourd'hui (`calculerFacturationStockage`). */
export const DEPASSEMENT_STOCKAGE_CENTIMES_PAR_GO = 50;

export type OptionIA = {
  cle: "aucune" | "credits" | "intensive";
  nom: string;
  prixMensuelCentimes: number;
  statutPrix: StatutPrix;
};

/**
 * L'IA est un DROIT inclus dans tous les forfaits, avec un quota par forfait
 * (`operationsIAIncluses`). Les options ne font qu'ajouter de la consommation.
 * Choisir « aucune » ne retire pas l'IA du produit : c'est le quota du forfait.
 */
export const OPTIONS_IA: readonly OptionIA[] = [
  { cle: "aucune", nom: "Quota du forfait uniquement", prixMensuelCentimes: 0, statutPrix: "valide" },
  { cle: "credits", nom: "Pack de crédits IA", prixMensuelCentimes: 2_900, statutPrix: "provisoire" },
  { cle: "intensive", nom: "IA intensive", prixMensuelCentimes: 7_900, statutPrix: "provisoire" },
] as const;

export function optionIAParCle(cle: string): OptionIA {
  return OPTIONS_IA.find((option) => option.cle === cle) ?? OPTIONS_IA[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. TVA
// ─────────────────────────────────────────────────────────────────────────────

/** Taux normal France métropolitaine. 0 = autoliquidation / hors champ. */
export const TAUX_TVA_PAR_DEFAUT = 20;

// ─────────────────────────────────────────────────────────────────────────────
// 6. Prestations ponctuelles (non récurrentes) — inchangées
// ─────────────────────────────────────────────────────────────────────────────

export { SERVICES_MISE_EN_SERVICE, OPTIONS_TARIFAIRES };

/**
 * Applications ELSATIA distinctes : elles ne sont JAMAIS des modules Gestion Pro
 * et n'entrent jamais dans ce catalogue ni dans `modules_gestion_pro`.
 */
export const APPLICATIONS_HORS_CATALOGUE_GP = ["tools", "colors", "reserves", "drone", "market", "boutique"] as const;
