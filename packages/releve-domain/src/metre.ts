/**
 * Lot 8 — Métré : dimensions, surfaces, volumes et revêtements (miroir de la migration 20260928000809).
 *
 * Le métré de référence est calculé par le SERVEUR (`tools_releve_plan_metre_calcul`) à partir de la
 * géométrie enregistrée du plan : aucune surface envoyée par le client n'est jamais crue. Ce module en est
 * le MIROIR exact (mêmes règles, mêmes arrondis, parité testée sur des valeurs fixes) : il sert à
 * l'aperçu instantané dans l'éditeur, aux synthèses, aux exports (CSV, contrat Gestion Pro) et aux tests.
 *
 * Règles (voir le rapport Lot 8) :
 * - surface brute du sol = aire du contour intérieur (nu des murs) ; surface NETTE du sol = brute (aucune
 *   déduction de sol n'est inventée : poteaux, gaines… passent par un ajustement tracé) ;
 * - plafond = sol (plafond horizontal ; plafond incliné NON pris en charge) ;
 * - périmètre brut = longueur du contour ; périmètre UTILE = brut − ouvertures franchissables au sol
 *   (porte, porte-fenêtre, passage ; baie et trémie seulement si leur allège vaut 0) ;
 * - faces : chaque arête du contour est rattachée au mur parallèle dont la face est à une demi-épaisseur de
 *   l'axe (±2 mm) ; une ouverture de ce mur compte pour la longueur qu'elle occupe sur l'arête ;
 * - hauteur de la pièce = hauteur saisie de la pièce, sinon de l'étage ; JAMAIS celle des murs (valeur par
 *   défaut de l'éditeur), jamais inventée : sans hauteur, volume et surfaces murales sont « non calculables » ;
 * - surfaces murales : brute = périmètre × hauteur ; déductions = ouvertures (largeur sur l'arête × hauteur
 *   bornée au plafond) ; option « petites ouvertures » : seuil (mm²) choisi par l'utilisateur, aucun défaut ;
 * - volume = surface brute × hauteur ;
 * - revêtements : sol → surface nette retenue, plafond → plafond retenu, murs → murs nets (tous), faces des
 *   murs choisis, ou zone (tronçon × bande, ouvertures déduites) ; linéaires → périmètre utile (corniche :
 *   périmètre brut) ; quantité avec perte = quantité × (1 + perte %).
 *
 * Unités internes : mm, mm², mm³ ; longueurs arrondies au dixième de mm, surfaces / volumes à l'unité.
 */

import type { Point2D } from "./model";
import { EQUIPEMENT_ETATS_PROJET, type EquipementEtatProjet, type OuvertureType } from "./model";
import type { PlanDocument, PlanEtat } from "./plan";
import { formatLineaire, formatLongueur, formatSurface, formatVolume, roundDecimal, toExchange, toExchangeText } from "./units";

// ── États projetés (EXISTING / TO_REMOVE / NEW / MOVED) ───────────────────────

export const ETATS_PROJET = EQUIPEMENT_ETATS_PROJET;
export type EtatProjet = EquipementEtatProjet;
export const ETAT_PROJET_LABELS: Record<EtatProjet, string> = { existant: "Existant", a_deposer: "À déposer", nouveau: "Nouveau", deplace: "Déplacé" };
/** Vocabulaire du cahier des charges → valeur persistée. */
export const ETAT_PROJET_ALIASES = { EXISTING: "existant", TO_REMOVE: "a_deposer", NEW: "nouveau", MOVED: "deplace" } as const satisfies Record<string, EtatProjet>;
export function isEtatProjet(value: unknown): value is EtatProjet {
  return typeof value === "string" && (ETATS_PROJET as readonly string[]).includes(value);
}

// ── Cotes (éléments `mesure` du plan) ─────────────────────────────────────────

export const COTE_TYPES = ["libre", "interieure", "exterieure", "cumulee", "partielle", "ouverture", "implantation", "hauteur"] as const;
export type CoteType = (typeof COTE_TYPES)[number];
export const COTE_TYPE_LABELS: Record<CoteType, string> = {
  libre: "Cote libre", interieure: "Cote intérieure", exterieure: "Cote extérieure", cumulee: "Cote cumulée", partielle: "Cote partielle",
  ouverture: "Cote d'ouverture", implantation: "Cote d'implantation", hauteur: "Hauteur ponctuelle",
};
export const COTE_SOURCES = ["calcule", "manuel", "laser"] as const;
export type CoteSource = (typeof COTE_SOURCES)[number];
export const COTE_SOURCE_LABELS: Record<CoteSource, string> = { calcule: "Calculée (plan)", manuel: "Relevée (mètre)", laser: "Relevée (laser)" };

/**
 * Cote MANUELLE posée sur le plan (les cotes automatiques ne sont pas stockées : elles se recalculent).
 * `valeurMm` = valeur retenue : la longueur a → b (source `calcule`, suit les points) ou la valeur relevée
 * sur site (source `manuel` / `laser`, jamais écrasée : l'écart au plan est signalé).
 */
export type PlanCote = {
  readonly id: string;
  readonly pieceId: string | null;
  readonly typeCote: CoteType;
  readonly a: Point2D;
  /** Absent pour une hauteur ponctuelle. */
  readonly b: Point2D | null;
  /** Décalage de la ligne de cote (mm, à gauche de a → b si positif). */
  readonly decalageMm: number | null;
  readonly valeurMm: number;
  readonly source: CoteSource;
  readonly libelle: string | null;
  readonly etatProjet?: EtatProjet;
  readonly origineId?: string | null;
  /** Date de prise de la mesure (ISO). */
  readonly priseLe: string;
};

export const COTE_ISSUE_CODES = ["type_cote", "points", "valeur", "decalage", "libelle", "etat_projet", "piece", "invalide"] as const;
export type CoteIssueCode = (typeof COTE_ISSUE_CODES)[number];
/** Messages identiques à `tools_releve_plan_cote_message`. */
export const COTE_ISSUE_MESSAGES: Record<CoteIssueCode, string> = {
  type_cote: "Type de cote inconnu.",
  points: "Cote invalide : deux points distincts du repère sont attendus.",
  valeur: "Valeur de cote invalide.",
  decalage: "Décalage de la ligne de cote invalide.",
  libelle: "Libellé de cote trop long (200 caractères au plus).",
  etat_projet: "État projeté inconnu.",
  piece: "Pièce absente de l'étage du plan.",
  invalide: "Cote invalide.",
};

const coordinate = (value: number) => Number.isFinite(value) && Math.abs(value) <= 1_000_000;
const validPoint = (point: Point2D | null | undefined) => !!point && coordinate(point.x) && coordinate(point.y);

export function coteLongueurMm(cote: Pick<PlanCote, "a" | "b">): number {
  return cote.b ? Math.hypot(cote.b.x - cote.a.x, cote.b.y - cote.a.y) : 0;
}

/** Première anomalie (même ordre que le SQL), `null` si valide. */
export function coteAnomalie(cote: PlanCote): CoteIssueCode | null {
  if (!(COTE_TYPES as readonly string[]).includes(cote.typeCote)) return "type_cote";
  if (!validPoint(cote.a)) return "points";
  if (cote.typeCote === "hauteur") {
    if (!(cote.valeurMm > 0 && cote.valeurMm <= 20_000)) return "valeur";
    if (cote.source === "calcule") return "valeur";
  } else {
    if (!validPoint(cote.b)) return "points";
    const longueur = coteLongueurMm(cote);
    if (longueur < 1) return "points";
    if (!(cote.valeurMm > 0 && cote.valeurMm <= 1_000_000)) return "valeur";
    if (cote.source === "calcule" && Math.abs(cote.valeurMm - longueur) > 1) return "valeur";
    if (cote.decalageMm === null || !Number.isFinite(cote.decalageMm) || Math.abs(cote.decalageMm) > 100_000) return "decalage";
  }
  if (!(COTE_SOURCES as readonly string[]).includes(cote.source)) return "invalide";
  if (cote.libelle !== null && cote.libelle.length > 200) return "libelle";
  if (cote.etatProjet !== undefined && !isEtatProjet(cote.etatProjet)) return "etat_projet";
  return null;
}

const TYPE_MESURE_DE_COTE: Record<CoteType, "longueur" | "largeur" | "diagonale" | "distance" | "hauteur"> = {
  libre: "longueur", interieure: "longueur", exterieure: "longueur", cumulee: "distance", partielle: "longueur", ouverture: "largeur",
  implantation: "distance", hauteur: "hauteur",
};

/** Charge `donnees` de l'élément `mesure` (clés stables). */
export function coteDonnees(cote: PlanCote, etageId: string): Record<string, unknown> {
  const donnees: Record<string, unknown> = {
    cible: { kind: "etage", id: etageId }, typeMesure: TYPE_MESURE_DE_COTE[cote.typeCote], valeur: cote.valeurMm, unite: "mm",
    source: cote.source, precisionMm: null, priseLe: cote.priseLe, typeCote: cote.typeCote, a: { x: cote.a.x, y: cote.a.y },
    b: cote.b ? { x: cote.b.x, y: cote.b.y } : null, decalageMm: cote.decalageMm,
  };
  if (cote.libelle) donnees.libelle = cote.libelle;
  if (cote.etatProjet !== undefined) donnees.etatProjet = cote.etatProjet;
  if (cote.origineId) donnees.origineId = cote.origineId;
  return donnees;
}

function readPoint(value: unknown): Point2D | null {
  const point = value as { x?: unknown; y?: unknown } | null | undefined;
  if (!point || typeof point !== "object") return null;
  return { x: Number(point.x ?? 0), y: Number(point.y ?? 0) };
}

export function coteFromElement(element: { id: string; pieceId: string | null; donnees: Record<string, unknown> }): PlanCote {
  const d = element.donnees;
  const cote: PlanCote = {
    id: element.id, pieceId: element.pieceId, typeCote: d.typeCote as CoteType, a: readPoint(d.a) ?? { x: 0, y: 0 }, b: readPoint(d.b),
    decalageMm: typeof d.decalageMm === "number" ? d.decalageMm : null, valeurMm: Number(d.valeur), source: d.source as CoteSource,
    libelle: typeof d.libelle === "string" ? d.libelle : null,
    priseLe: typeof d.priseLe === "string" ? d.priseLe : new Date(0).toISOString(),
    ...(typeof d.origineId === "string" ? { origineId: d.origineId } : {}),
  };
  return isEtatProjet(d.etatProjet) ? { ...cote, etatProjet: d.etatProjet } : cote;
}

/** Nouvelle cote manuelle entre deux points (calculée : valeur = longueur, arrondie au dixième de mm). */
export function newPlanCote(id: string, a: Point2D, b: Point2D | null, options: Partial<Omit<PlanCote, "id" | "a" | "b">> = {}): PlanCote {
  const base: PlanCote = {
    id, pieceId: null, typeCote: b ? "libre" : "hauteur", a, b, decalageMm: b ? 300 : null,
    valeurMm: b ? roundDecimal(Math.hypot(b.x - a.x, b.y - a.y), 1) : 0, source: b ? "calcule" : "manuel", libelle: null,
    priseLe: new Date().toISOString(), ...options,
  };
  return base;
}

/** Écart entre la valeur relevée et la longueur du plan (cote relevée) — `null` pour une cote calculée. */
export function coteEcartMm(cote: PlanCote): number | null {
  if (cote.source === "calcule" || !cote.b) return null;
  return roundDecimal(cote.valeurMm - coteLongueurMm(cote), 1);
}

// ── Revêtements (éléments `materiau` du plan) ─────────────────────────────────

export const REVETEMENT_SUPPORTS = ["sol", "mur", "plafond", "plinthe"] as const;
export type RevetementSupport = (typeof REVETEMENT_SUPPORTS)[number];
export const REVETEMENT_SUPPORT_LABELS: Record<RevetementSupport, string> = { sol: "Sol", mur: "Murs", plafond: "Plafond", plinthe: "Linéaires (plinthes…)" };
/** Familles par support (miroir de `tools_releve_plan_revetement_anomalie`). */
export const REVETEMENT_FAMILLES: Record<RevetementSupport, readonly string[]> = {
  sol: ["carrelage", "parquet", "stratifie", "pvc", "moquette", "resine", "beton", "autre"],
  mur: ["peinture", "papier_peint", "faience", "carrelage", "panneau_decoratif", "enduit", "autre"],
  plafond: ["peinture", "dalle", "ba13", "acoustique", "panneau", "autre"],
  plinthe: ["plinthe", "corniche", "profile", "barriere", "bande_peripherique", "autre"],
};
export const REVETEMENT_FAMILLE_LABELS: Record<string, string> = {
  carrelage: "Carrelage", parquet: "Parquet", stratifie: "Stratifié", pvc: "PVC", moquette: "Moquette", resine: "Résine", beton: "Béton",
  peinture: "Peinture", papier_peint: "Papier peint", faience: "Faïence", panneau_decoratif: "Panneau décoratif", enduit: "Enduit",
  dalle: "Dalle", ba13: "BA13", acoustique: "Acoustique", panneau: "Panneau",
  plinthe: "Plinthe", corniche: "Corniche", profile: "Profilé", barriere: "Barrière", bande_peripherique: "Bande périphérique", autre: "Autre",
};
export type RevetementApplication =
  | { readonly mode: "tous" }
  | { readonly mode: "murs"; readonly murIds: readonly string[] }
  /** Zone de mur : tronçon [début, fin] le long de l'axe (depuis A) × bande [bas, haut] au-dessus du sol. */
  | { readonly mode: "zone"; readonly murId: string; readonly debutMm: number; readonly finMm: number; readonly basMm: number; readonly hautMm: number };
export const REVETEMENT_APPLICATION_LABELS: Record<RevetementApplication["mode"], string> = { tous: "Tous les murs", murs: "Murs choisis", zone: "Zone de mur" };

export type PlanRevetement = {
  readonly id: string;
  readonly pieceId: string;
  readonly support: RevetementSupport;
  readonly famille: string;
  readonly libelle: string;
  /** Perte (%), configurable, 0–100, deux décimales au plus. */
  readonly pertePourcent: number;
  readonly application: RevetementApplication;
  readonly sensPose: string | null;
  readonly format: string | null;
  readonly commentaire: string | null;
  readonly etatProjet?: EtatProjet;
  readonly origineId?: string | null;
};

export const REVETEMENT_ISSUE_CODES = ["categorie", "famille", "unite", "perte", "application", "texte", "etat_projet", "mur_absent", "piece", "invalide"] as const;
export type RevetementIssueCode = (typeof REVETEMENT_ISSUE_CODES)[number];
/** Messages identiques à `tools_releve_plan_revetement_message`. */
export const REVETEMENT_ISSUE_MESSAGES: Record<RevetementIssueCode, string> = {
  categorie: "Support de revêtement inconnu (sol, murs, plafond, linéaire).",
  famille: "Famille de revêtement inconnue pour ce support.",
  unite: "Unité incohérente : m² pour une surface, ml pour un linéaire.",
  perte: "Perte entre 0 et 100 % (deux décimales au plus).",
  application: "Application invalide : tous les murs, des murs choisis ou une zone de mur.",
  texte: "Libellé obligatoire ; libellé, sens de pose, format ou commentaire trop long.",
  etat_projet: "État projeté inconnu.",
  mur_absent: "Le revêtement vise un mur absent du plan.",
  piece: "Un revêtement appartient à une pièce de l'étage du plan.",
  invalide: "Revêtement invalide.",
};

export function revetementUnite(support: RevetementSupport): "m2" | "ml" {
  return support === "plinthe" ? "ml" : "m2";
}

/** Première anomalie (ordre du SQL). `murIds` : murs actifs du plan (contrôle « mur absent »). */
export function revetementAnomalie(revetement: PlanRevetement, murIds?: ReadonlySet<string>): RevetementIssueCode | null {
  if (!(REVETEMENT_SUPPORTS as readonly string[]).includes(revetement.support)) return "categorie";
  if (!REVETEMENT_FAMILLES[revetement.support].includes(revetement.famille)) return "famille";
  const perte = revetement.pertePourcent;
  if (!Number.isFinite(perte) || perte < 0 || perte > 100 || roundDecimal(perte, 2) !== perte) return "perte";
  const app = revetement.application;
  if (!app || !["tous", "murs", "zone"].includes(app.mode) || (revetement.support !== "mur" && app.mode !== "tous")) return "application";
  if (app.mode === "murs" && (app.murIds.length < 1 || app.murIds.length > 200)) return "application";
  if (app.mode === "zone" && !(app.debutMm >= 0 && app.finMm > app.debutMm && app.finMm <= 1_000_000 && app.basMm >= 0 && app.hautMm > app.basMm && app.hautMm <= 20_000)) return "application";
  if (!revetement.libelle.trim() || revetement.libelle.length > 200 || (revetement.sensPose?.length ?? 0) > 100 || (revetement.format?.length ?? 0) > 100
    || (revetement.commentaire?.length ?? 0) > 2000) return "texte";
  if (revetement.etatProjet !== undefined && !isEtatProjet(revetement.etatProjet)) return "etat_projet";
  if (murIds) {
    const targets = app.mode === "murs" ? app.murIds : app.mode === "zone" ? [app.murId] : [];
    if (targets.some((id) => !murIds.has(id))) return "mur_absent";
  }
  return null;
}

export function revetementDonnees(revetement: PlanRevetement): Record<string, unknown> {
  const donnees: Record<string, unknown> = {
    libelle: revetement.libelle, categorie: revetement.support, unite: revetementUnite(revetement.support), pertePourcent: revetement.pertePourcent,
    gpPrestationRef: null, revetement: revetement.famille, application: revetement.application,
  };
  if (revetement.sensPose) donnees.sensPose = revetement.sensPose;
  if (revetement.format) donnees.format = revetement.format;
  if (revetement.commentaire) donnees.commentaire = revetement.commentaire;
  if (revetement.etatProjet !== undefined) donnees.etatProjet = revetement.etatProjet;
  if (revetement.origineId) donnees.origineId = revetement.origineId;
  return donnees;
}

export function revetementFromElement(element: { id: string; pieceId: string | null; donnees: Record<string, unknown> }): PlanRevetement {
  const d = element.donnees;
  const revetement: PlanRevetement = {
    id: element.id, pieceId: element.pieceId ?? "", support: d.categorie as RevetementSupport, famille: String(d.revetement ?? "autre"),
    libelle: String(d.libelle ?? ""), pertePourcent: Number(d.pertePourcent ?? 0),
    application: (d.application as RevetementApplication | undefined) ?? { mode: "tous" },
    sensPose: typeof d.sensPose === "string" ? d.sensPose : null, format: typeof d.format === "string" ? d.format : null,
    commentaire: typeof d.commentaire === "string" ? d.commentaire : null, origineId: typeof d.origineId === "string" ? d.origineId : null,
  };
  return isEtatProjet(d.etatProjet) ? { ...revetement, etatProjet: d.etatProjet } : revetement;
}

// ── Ajustements ───────────────────────────────────────────────────────────────

export const METRE_GRANDEURS = ["surface_sol", "surface_plafond", "perimetre_brut", "perimetre_utile", "surface_murs", "volume", "quantite"] as const;
export type MetreGrandeur = (typeof METRE_GRANDEURS)[number];
export type PieceGrandeur = Exclude<MetreGrandeur, "quantite">;
export const METRE_GRANDEUR_LABELS: Record<MetreGrandeur, string> = {
  surface_sol: "Surface de sol", surface_plafond: "Surface de plafond", perimetre_brut: "Périmètre brut", perimetre_utile: "Périmètre utile",
  surface_murs: "Surface murale nette", volume: "Volume", quantite: "Quantité du revêtement",
};
export function grandeurKind(grandeur: MetreGrandeur, unite?: "m2" | "ml"): "surface" | "longueur" | "volume" {
  if (grandeur === "perimetre_brut" || grandeur === "perimetre_utile") return "longueur";
  if (grandeur === "volume") return "volume";
  if (grandeur === "quantite") return unite === "ml" ? "longueur" : "surface";
  return "surface";
}

/** Ajustement tel que stocké (`tools_releves_metre_ajustements`). */
export type MetreAjustementRow = {
  readonly id: string;
  readonly pieceId: string | null;
  readonly revetementId: string | null;
  readonly grandeur: MetreGrandeur;
  readonly unite: "mm" | "mm2" | "mm3";
  readonly valeurCalculee: number | null;
  readonly valeurRetenue: number;
  readonly raison: string;
  readonly auteurId: string | null;
  readonly date: string;
};

// ── Résultat du métré (forme JSON du serveur) ─────────────────────────────────

export type MetreFace = {
  readonly index: number;
  readonly murId: string | null;
  readonly longueurMm: number;
  readonly debutMm: number | null;
  readonly finMm: number | null;
  readonly surfaceBruteMm2: number | null;
  readonly deductionsMm2: number;
  readonly surfaceNetteMm2: number | null;
};
export type MetreOuverturePiece = {
  readonly id: string; readonly murId: string; readonly typeOuverture: OuvertureType; readonly largeurMm: number; readonly hauteurMm: number;
  readonly allegeMm: number | null; readonly surfaceMm2: number; readonly deduite: boolean; readonly franchissable: boolean;
  readonly etatProjet: EtatProjet; readonly longueurDansPieceMm: number; readonly deductionMm2: number;
};
export type MetreAjustement = {
  readonly id: string; readonly grandeur: MetreGrandeur; readonly unite: string; readonly valeurCalculee: number | null; readonly valeurRetenue: number;
  readonly raison: string; readonly auteurId: string | null; readonly date: string;
  /** Le calcul a changé depuis l'ajustement : la valeur retenue est à revoir. */
  readonly perime: boolean;
};
export type MetreRetenu = Record<PieceGrandeur, number | null>;
export type MetrePiece = {
  readonly pieceId: string;
  readonly hauteurMm: number | null;
  readonly hauteurSource: "piece" | "etage" | null;
  readonly surfaceSolBruteMm2: number;
  readonly surfaceSolNetteMm2: number;
  readonly surfacePlafondMm2: number;
  readonly perimetreBrutMm: number;
  readonly perimetreUtileMm: number;
  readonly surfaceMursBruteMm2: number | null;
  readonly deductionsMm2: number;
  readonly surfaceMursNetteMm2: number | null;
  readonly volumeMm3: number | null;
  readonly faces: readonly MetreFace[];
  readonly ouvertures: readonly MetreOuverturePiece[];
  readonly hauteursPonctuelles: readonly { readonly id: string; readonly valeurMm: number; readonly point: Point2D }[];
  readonly ajustements: readonly MetreAjustement[];
  readonly retenu: MetreRetenu;
};
export type MetreRevetement = {
  readonly id: string; readonly pieceId: string; readonly categorie: RevetementSupport; readonly revetement: string; readonly libelle: string;
  readonly unite: "m2" | "ml"; readonly application: RevetementApplication; readonly pertePourcent: number; readonly etatProjet: EtatProjet;
  readonly calculable: boolean; readonly raison: "piece_sans_contour" | "hauteur_inconnue" | null;
  readonly quantiteCalculee: number | null;
  readonly ajustement: Omit<MetreAjustement, "grandeur" | "unite"> | null;
  readonly quantite: number | null;
  readonly quantiteAvecPerte: number | null;
};
export type MetreOuverture = {
  readonly id: string; readonly murId: string; readonly typeOuverture: OuvertureType; readonly largeurMm: number; readonly hauteurMm: number;
  readonly allegeMm: number | null; readonly surfaceMm2: number; readonly etatProjet: EtatProjet;
};
export type MetreTravaux = {
  readonly murs: Partial<Record<EtatProjet, { readonly nombre: number; readonly longueurMm: number; readonly surfaceMm2: number; readonly sansHauteur: number }>>;
  readonly ouvertures: Partial<Record<EtatProjet, { readonly nombre: number; readonly surfaceMm2: number }>>;
  readonly equipements: Partial<Record<EtatProjet, { readonly nombre: number }>>;
};
export type PlanMetre = {
  readonly version: 1;
  readonly planId: string;
  readonly etageId: string;
  readonly etat: PlanEtat;
  readonly numero: number;
  readonly seuilDeductionMm2: number | null;
  readonly hauteurEtageMm: number | null;
  readonly pieces: readonly MetrePiece[];
  readonly revetements: readonly MetreRevetement[];
  readonly ouvertures: readonly MetreOuverture[];
  readonly equipements: readonly { readonly id: string; readonly objet: string; readonly categorie: string; readonly libelle: string; readonly pieceId: string | null; readonly etatProjet: EtatProjet }[];
  readonly travaux: MetreTravaux;
  /** Lecture : métré figé avec le plan (`gel`), calculé (`calcul`), ou recalculé pour un plan figé avant le Lot 8. */
  readonly fige?: boolean;
  readonly source?: "gel" | "calcul" | "recalcul_plan_fige_avant_lot8" | "apercu";
  readonly figeLe?: string | null;
  readonly calculeLe?: string;
  readonly revision?: number;
};

/** Normalise le JSON serveur (nombres `numeric` éventuellement sérialisés en chaîne). */
export function planMetreFromJson(raw: unknown): PlanMetre {
  const json = raw as PlanMetre;
  const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    ...json,
    seuilDeductionMm2: n(json.seuilDeductionMm2), hauteurEtageMm: n(json.hauteurEtageMm),
    pieces: (json.pieces ?? []).map((piece) => ({
      ...piece, hauteurMm: n(piece.hauteurMm),
      faces: piece.faces ?? [], ouvertures: piece.ouvertures ?? [], hauteursPonctuelles: piece.hauteursPonctuelles ?? [], ajustements: piece.ajustements ?? [],
    })),
    revetements: json.revetements ?? [], ouvertures: json.ouvertures ?? [], equipements: json.equipements ?? [],
    travaux: json.travaux ?? { murs: {}, ouvertures: {}, equipements: {} },
  };
}

// ── Calcul (miroir de `tools_releve_plan_metre_calcul`) ───────────────────────

export type MetreInput = {
  readonly planId: string;
  readonly etageId: string;
  readonly etat: PlanEtat;
  readonly numero: number;
  readonly document: Pick<PlanDocument, "murs" | "ouvertures" | "contours" | "equipements" | "reglages"> & { readonly cotes?: readonly PlanCote[] };
  readonly revetements: readonly PlanRevetement[];
  /** Pièces de l'étage (hauteur saisie, suppression). */
  readonly pieces: readonly { readonly id: string; readonly hauteurSousPlafondMm: number | null; readonly deletedAt?: string | null }[];
  readonly etageHauteurMm: number | null;
  readonly ajustements?: readonly MetreAjustementRow[];
};

const round1 = (value: number) => roundDecimal(value, 1);
const round0 = (value: number) => roundDecimal(value, 0);
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Aire du contour, comme `tools_releve_plan_surface` (arrondie au dixième) puis à l'unité. */
export function contourSurfaceMm2(points: readonly Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i]; const b = points[(i + 1) % points.length]; sum += a.x * b.y - b.x * a.y; }
  return round0(round1(Math.abs(sum) / 2));
}

/** Ouverture franchissable au sol (déduite du périmètre utile). */
export function ouvertureFranchissable(type: string, allegeMm: number | null): boolean {
  return type === "porte" || type === "porte_fenetre" || type === "passage" || ((type === "baie" || type === "tremie") && allegeMm === 0);
}

export function metreSeuil(reglages: PlanDocument["reglages"]): number | null {
  const seuil = (reglages as { metre?: { seuilDeductionMm2?: unknown } }).metre?.seuilDeductionMm2;
  return typeof seuil === "number" && Number.isFinite(seuil) ? seuil : null;
}

export function computePlanMetre(input: MetreInput): PlanMetre {
  const { document } = input;
  const seuil = metreSeuil(document.reglages);
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const ouverturesParMur = new Map<string, (typeof document.ouvertures)[number][]>();
  for (const o of [...document.ouvertures].sort(byId)) ouverturesParMur.set(o.murId, [...(ouverturesParMur.get(o.murId) ?? []), o]);
  const etatOf = (value: unknown): EtatProjet => (isEtatProjet(value) ? value : "existant");
  const ouvertures: MetreOuverture[] = [...document.ouvertures].sort(byId).map((o) => ({
    id: o.id, murId: o.murId, typeOuverture: o.typeOuverture, largeurMm: o.largeurMm, hauteurMm: o.hauteurMm, allegeMm: o.allegeMm,
    surfaceMm2: round0(o.largeurMm * o.hauteurMm), etatProjet: etatOf((o as { etatProjet?: unknown }).etatProjet),
  }));
  const pieces = new Map(input.pieces.map((piece) => [piece.id, piece]));
  const ajustements = [...(input.ajustements ?? [])];
  const rooms: MetrePiece[] = [];
  const roomMap = new Map<string, MetrePiece>();

  for (const contour of document.contours) {
    const piece = pieces.get(contour.pieceId);
    if (!piece || piece.deletedAt) continue;
    const h = piece.hauteurSousPlafondMm ?? input.etageHauteurMm;
    const hauteurSource = piece.hauteurSousPlafondMm !== null ? "piece" : input.etageHauteurMm !== null ? "etage" : null;
    const pts = contour.points; const n = pts.length;
    const surface = contourSurfaceMm2(pts);
    let perim = 0; let perimDed = 0; let ded = 0;
    const faces: MetreFace[] = [];
    const roomOuv = new Map<string, MetreOuverturePiece>();
    for (let i = 0; i < n; i++) {
      const p = pts[i]; const q = pts[(i + 1) % n];
      const dx = q.x - p.x; const dy = q.y - p.y; const l = Math.hypot(dx, dy);
      if (l < 0.5) continue;
      perim += l;
      let best: string | null = null; let bestScore: number | null = null; let bestT0 = 0; let bestT1 = 0;
      for (const murId of contour.murIds) {
        const w = murs.get(murId);
        if (!w) continue;
        const wl = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        if (wl === 0) continue;
        const ux = (w.b.x - w.a.x) / wl; const uy = (w.b.y - w.a.y) / wl;
        if (Math.abs((ux * dy) / l - (uy * dx) / l) > 0.01) continue;
        const e = w.epaisseurMm;
        const d = Math.abs(ux * ((p.y + q.y) / 2 - w.a.y) - uy * ((p.x + q.x) / 2 - w.a.x));
        if (d > e / 2 + 2) continue;
        const ta = ux * (p.x - w.a.x) + uy * (p.y - w.a.y); const tb = ux * (q.x - w.a.x) + uy * (q.y - w.a.y);
        const t0 = Math.min(ta, tb); const t1 = Math.max(ta, tb);
        if (t1 < -e || t0 > wl + e) continue;
        const score = Math.abs(d - e / 2);
        if (bestScore === null || score < bestScore) { best = murId; bestScore = score; bestT0 = t0; bestT1 = t1; }
      }
      let faceDed = 0;
      if (best !== null) {
        for (const o of ouverturesParMur.get(best) ?? []) {
          const ol = Math.min(o.decalageMm + o.largeurMm, bestT1) - Math.max(o.decalageMm, bestT0);
          if (ol <= 1) continue;
          const allege = o.allegeMm ?? 0;
          const heff = h === null ? o.hauteurMm : Math.max(0, Math.min(allege + o.hauteurMm, h) - allege);
          const osurf = o.largeurMm * o.hauteurMm;
          const deduite = seuil === null || osurf >= seuil;
          const franchi = ouvertureFranchissable(o.typeOuverture, o.allegeMm);
          if (deduite) faceDed += ol * heff;
          if (franchi) perimDed += ol;
          const previous = roomOuv.get(o.id);
          roomOuv.set(o.id, {
            id: o.id, murId: o.murId, typeOuverture: o.typeOuverture, largeurMm: o.largeurMm, hauteurMm: o.hauteurMm, allegeMm: o.allegeMm,
            surfaceMm2: round0(osurf), deduite, franchissable: franchi, etatProjet: etatOf((o as { etatProjet?: unknown }).etatProjet),
            longueurDansPieceMm: round1((previous?.longueurDansPieceMm ?? 0) + ol),
            deductionMm2: round0((previous?.deductionMm2 ?? 0) + (deduite ? ol * heff : 0)),
          });
        }
      }
      ded += faceDed;
      faces.push({
        index: i, murId: best, longueurMm: round1(l), debutMm: best !== null ? round1(bestT0) : null, finMm: best !== null ? round1(bestT1) : null,
        surfaceBruteMm2: h !== null ? round0(l * h) : null, deductionsMm2: round0(faceDed), surfaceNetteMm2: h !== null ? round0(l * h) - round0(faceDed) : null,
      });
    }
    const brute = h !== null ? round0(perim * h) : null;
    const room: Omit<MetrePiece, "ajustements" | "retenu"> = {
      pieceId: contour.pieceId, hauteurMm: h, hauteurSource,
      surfaceSolBruteMm2: surface, surfaceSolNetteMm2: surface, surfacePlafondMm2: surface,
      perimetreBrutMm: round1(perim), perimetreUtileMm: round1(Math.max(0, perim - perimDed)),
      surfaceMursBruteMm2: brute, deductionsMm2: round0(ded), surfaceMursNetteMm2: brute !== null ? brute - round0(ded) : null,
      volumeMm3: h !== null ? round0(surface * h) : null,
      faces,
      ouvertures: [...roomOuv.values()].sort(byId),
      hauteursPonctuelles: (document.cotes ?? []).filter((cote) => cote.pieceId === contour.pieceId && cote.typeCote === "hauteur")
        .sort(byId).map((cote) => ({ id: cote.id, valeurMm: cote.valeurMm, point: cote.a })),
    };
    const retenu: MetreRetenu = {
      surface_sol: room.surfaceSolNetteMm2, surface_plafond: room.surfacePlafondMm2, perimetre_brut: room.perimetreBrutMm,
      perimetre_utile: room.perimetreUtileMm, surface_murs: room.surfaceMursNetteMm2, volume: room.volumeMm3,
    };
    const calcule = { ...retenu };
    const liste: MetreAjustement[] = [];
    for (const aj of ajustements.filter((item) => item.pieceId === contour.pieceId && item.revetementId === null).sort((a, b) => (a.grandeur < b.grandeur ? -1 : a.grandeur > b.grandeur ? 1 : 0))) {
      const grandeur = aj.grandeur as PieceGrandeur;
      liste.push({ id: aj.id, grandeur, unite: aj.unite, valeurCalculee: aj.valeurCalculee, valeurRetenue: aj.valeurRetenue, raison: aj.raison, auteurId: aj.auteurId, date: aj.date,
        perime: aj.valeurCalculee !== calcule[grandeur] });
      retenu[grandeur] = aj.valeurRetenue;
    }
    const full: MetrePiece = { ...room, ajustements: liste, retenu };
    rooms.push(full);
    roomMap.set(contour.pieceId, full);
  }

  const revetements: MetreRevetement[] = [];
  for (const rev of [...input.revetements].sort(byId)) {
    const room = roomMap.get(rev.pieceId);
    const app = rev.application ?? { mode: "tous" as const };
    let q: number | null = null; let calculable = true; let raison: MetreRevetement["raison"] = null;
    if (!room) { calculable = false; raison = "piece_sans_contour"; }
    else if (rev.support === "sol") q = room.retenu.surface_sol;
    else if (rev.support === "plafond") q = room.retenu.surface_plafond;
    else if (rev.support === "plinthe") q = rev.famille === "corniche" ? room.retenu.perimetre_brut : room.retenu.perimetre_utile;
    else if (app.mode === "tous") { q = room.retenu.surface_murs; if (q === null) { calculable = false; raison = "hauteur_inconnue"; } }
    else if (app.mode === "murs") {
      if (room.hauteurMm === null) { calculable = false; raison = "hauteur_inconnue"; }
      else q = room.faces.filter((face) => face.murId !== null && app.murIds.includes(face.murId)).reduce((sum, face) => sum + (face.surfaceNetteMm2 ?? 0), 0);
    } else {
      const zh = room.hauteurMm !== null ? Math.min(app.hautMm, room.hauteurMm) : app.hautMm;
      let total = 0;
      for (const face of room.faces.filter((item) => item.murId === app.murId)) {
        const ox = Math.min(app.finMm, face.finMm ?? 0) - Math.max(app.debutMm, face.debutMm ?? 0);
        if (ox <= 0 || zh <= app.basMm) continue;
        total += ox * (zh - app.basMm);
        for (const o of ouverturesParMur.get(app.murId) ?? []) {
          if (!(seuil === null || o.largeurMm * o.hauteurMm >= seuil)) continue;
          const oxx = Math.min(o.decalageMm + o.largeurMm, face.finMm ?? 0, app.finMm) - Math.max(o.decalageMm, face.debutMm ?? 0, app.debutMm);
          const allege = o.allegeMm ?? 0;
          const oy = Math.min(allege + o.hauteurMm, zh) - Math.max(allege, app.basMm);
          if (oxx > 0 && oy > 0) total -= oxx * oy;
        }
      }
      q = round0(Math.max(0, total));
    }
    const aj = ajustements.find((item) => item.revetementId === rev.id) ?? null;
    const quantite = aj ? aj.valeurRetenue : q;
    revetements.push({
      id: rev.id, pieceId: rev.pieceId, categorie: rev.support, revetement: rev.famille, libelle: rev.libelle, unite: revetementUnite(rev.support),
      application: app, pertePourcent: rev.pertePourcent, etatProjet: rev.etatProjet ?? "existant",
      calculable: calculable || aj !== null, raison: aj ? null : raison, quantiteCalculee: q,
      ajustement: aj ? { id: aj.id, valeurCalculee: aj.valeurCalculee, valeurRetenue: aj.valeurRetenue, raison: aj.raison, auteurId: aj.auteurId, date: aj.date, perime: aj.valeurCalculee !== q } : null,
      quantite, quantiteAvecPerte: quantite !== null ? round0((quantite * (100 + rev.pertePourcent)) / 100) : null,
    });
  }

  const travaux: { murs: Record<string, { nombre: number; longueurMm: number; surfaceMm2: number; sansHauteur: number }>; ouvertures: Record<string, { nombre: number; surfaceMm2: number }>; equipements: Record<string, { nombre: number }> } = { murs: {}, ouvertures: {}, equipements: {} };
  const murAcc: Record<string, { nombre: number; l: number; s: number; sansHauteur: number }> = {};
  for (const mur of document.murs) {
    const etat = etatOf((mur as { etatProjet?: unknown }).etatProjet);
    const acc = (murAcc[etat] ??= { nombre: 0, l: 0, s: 0, sansHauteur: 0 });
    const l = Math.hypot(mur.b.x - mur.a.x, mur.b.y - mur.a.y);
    acc.nombre += 1; acc.l += l;
    if (mur.hauteurMm !== null) acc.s += mur.hauteurMm * l; else acc.sansHauteur += 1;
  }
  for (const [etat, acc] of Object.entries(murAcc)) travaux.murs[etat] = { nombre: acc.nombre, longueurMm: round1(acc.l), surfaceMm2: round0(acc.s), sansHauteur: acc.sansHauteur };
  for (const o of ouvertures) {
    const acc = (travaux.ouvertures[o.etatProjet] ??= { nombre: 0, surfaceMm2: 0 });
    acc.nombre += 1; acc.surfaceMm2 += o.surfaceMm2;
  }
  for (const objet of document.equipements ?? []) {
    const acc = (travaux.equipements[objet.etatProjet ?? "existant"] ??= { nombre: 0 });
    acc.nombre += 1;
  }

  return {
    version: 1, planId: input.planId, etageId: input.etageId, etat: input.etat, numero: input.numero, seuilDeductionMm2: seuil, hauteurEtageMm: input.etageHauteurMm,
    pieces: rooms, revetements, ouvertures,
    equipements: [...(document.equipements ?? [])].sort(byId).map((objet) => ({ id: objet.id, objet: objet.objet, categorie: objet.categorie, libelle: objet.libelle, pieceId: objet.pieceId, etatProjet: objet.etatProjet ?? "existant" })),
    travaux: travaux as MetreTravaux,
  };
}

// ── Synthèse par chantier / bâtiment / étage / zone / pièce ───────────────────

export const METRE_SYNTHESE_ETATS = ["existant", "projete", "as_built"] as const;
export type MetreSyntheseEtat = (typeof METRE_SYNTHESE_ETATS)[number];
export const METRE_SYNTHESE_ETAT_LABELS: Record<MetreSyntheseEtat, string> = { existant: "Existant (initial / corrigé)", projete: "Projeté", as_built: "Tel que construit" };

/** Totaux d'un nœud (valeurs RETENUES ; `inconnus` = pièces sans hauteur pour volume et murs). */
export type MetreTotaux = {
  pieces: number;
  surfaceSolMm2: number;
  surfacePlafondMm2: number;
  perimetreBrutMm: number;
  perimetreUtileMm: number;
  surfaceMursMm2: number;
  volumeMm3: number;
  /** Pièces dont volume / murs ne sont pas calculables (hauteur inconnue, sans ajustement). */
  sansHauteur: number;
  ouvertures: number;
  ajustements: number;
};
export function emptyTotaux(): MetreTotaux {
  return { pieces: 0, surfaceSolMm2: 0, surfacePlafondMm2: 0, perimetreBrutMm: 0, perimetreUtileMm: 0, surfaceMursMm2: 0, volumeMm3: 0, sansHauteur: 0, ouvertures: 0, ajustements: 0 };
}
export function addPieceToTotaux(totaux: MetreTotaux, piece: MetrePiece): MetreTotaux {
  totaux.pieces += 1;
  totaux.surfaceSolMm2 += piece.retenu.surface_sol ?? 0;
  totaux.surfacePlafondMm2 += piece.retenu.surface_plafond ?? 0;
  totaux.perimetreBrutMm = round1(totaux.perimetreBrutMm + (piece.retenu.perimetre_brut ?? 0));
  totaux.perimetreUtileMm = round1(totaux.perimetreUtileMm + (piece.retenu.perimetre_utile ?? 0));
  totaux.surfaceMursMm2 += piece.retenu.surface_murs ?? 0;
  totaux.volumeMm3 += piece.retenu.volume ?? 0;
  if (piece.retenu.volume === null || piece.retenu.surface_murs === null) totaux.sansHauteur += 1;
  totaux.ouvertures += piece.ouvertures.length;
  totaux.ajustements += piece.ajustements.length;
  return totaux;
}
function mergeTotaux(target: MetreTotaux, source: MetreTotaux): MetreTotaux {
  target.pieces += source.pieces; target.surfaceSolMm2 += source.surfaceSolMm2; target.surfacePlafondMm2 += source.surfacePlafondMm2;
  target.perimetreBrutMm = round1(target.perimetreBrutMm + source.perimetreBrutMm); target.perimetreUtileMm = round1(target.perimetreUtileMm + source.perimetreUtileMm);
  target.surfaceMursMm2 += source.surfaceMursMm2; target.volumeMm3 += source.volumeMm3; target.sansHauteur += source.sansHauteur;
  target.ouvertures += source.ouvertures; target.ajustements += source.ajustements;
  return target;
}

/** Quantités par famille de revêtement (m² sol, m² peinture murs, m² plafond, ml plinthe…). */
export type RevetementTotal = { support: RevetementSupport; famille: string; unite: "m2" | "ml"; etatProjet: EtatProjet; quantite: number; quantiteAvecPerte: number; lignes: number; nonCalculables: number };
export function revetementTotaux(revetements: readonly MetreRevetement[]): RevetementTotal[] {
  const map = new Map<string, RevetementTotal>();
  for (const rev of revetements) {
    const key = `${rev.categorie}|${rev.revetement}|${rev.etatProjet}`;
    const total = map.get(key) ?? { support: rev.categorie, famille: rev.revetement, unite: rev.unite, etatProjet: rev.etatProjet, quantite: 0, quantiteAvecPerte: 0, lignes: 0, nonCalculables: 0 };
    total.lignes += 1;
    if (rev.quantite === null) total.nonCalculables += 1;
    else { total.quantite = rev.unite === "ml" ? round1(total.quantite + rev.quantite) : total.quantite + rev.quantite; total.quantiteAvecPerte += rev.quantiteAvecPerte ?? 0; }
    map.set(key, total);
  }
  return [...map.values()].sort((a, b) => REVETEMENT_SUPPORTS.indexOf(a.support) - REVETEMENT_SUPPORTS.indexOf(b.support) || a.famille.localeCompare(b.famille) || a.etatProjet.localeCompare(b.etatProjet));
}

export type MetreStructure = {
  readonly chantiers: readonly { readonly id: string; readonly nom: string; readonly ordre: number; readonly deletedAt: string | null }[];
  readonly batiments: readonly { readonly id: string; readonly chantierId: string; readonly nom: string; readonly ordre: number; readonly deletedAt: string | null }[];
  readonly etages: readonly { readonly id: string; readonly batimentId: string; readonly nom: string; readonly niveau: number; readonly ordre: number; readonly deletedAt: string | null }[];
  readonly zones: readonly { readonly id: string; readonly etageId: string; readonly nom: string; readonly ordre: number; readonly deletedAt: string | null }[];
  readonly pieces: readonly { readonly id: string; readonly etageId: string; readonly zoneId: string | null; readonly nom: string; readonly ordre: number; readonly deletedAt: string | null }[];
};
export type MetreEtageSource = { readonly etageId: string; readonly planId: string; readonly numero: number; readonly etat: PlanEtat; readonly figeLe: string | null; readonly metre: PlanMetre };

export type MetreNodeKind = "releve" | "chantier" | "batiment" | "etage" | "zone" | "piece";
export type MetreNode = {
  readonly kind: MetreNodeKind;
  readonly id: string;
  readonly nom: string;
  readonly totaux: MetreTotaux;
  readonly children: MetreNode[];
  /** Nœud pièce : son métré ; nœud étage : le plan source. */
  readonly piece?: MetrePiece;
  readonly plan?: Omit<MetreEtageSource, "metre">;
  readonly revetements: MetreRevetement[];
};

const byOrdre = <T extends { ordre: number; nom: string }>(a: T, b: T) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr");

/**
 * Arbre de synthèse : relevé → chantier → bâtiment → étage → zone → pièce, totaux cumulés à chaque
 * niveau. Une pièce sans contour sur le plan de l'étage n'a pas de métré : elle est omise (le nombre de
 * pièces sans contour est rendu à part par {@link piecesSansMetre}).
 */
export function buildMetreTree(structure: MetreStructure, sources: readonly MetreEtageSource[], releve: { id: string; nom: string }): MetreNode {
  const byEtage = new Map(sources.map((source) => [source.etageId, source]));
  const node = (kind: MetreNodeKind, id: string, nom: string): MetreNode => ({ kind, id, nom, totaux: emptyTotaux(), children: [], revetements: [] });
  const root = node("releve", releve.id, releve.nom);
  for (const chantier of [...structure.chantiers].filter((c) => !c.deletedAt).sort(byOrdre)) {
    const cNode = node("chantier", chantier.id, chantier.nom);
    for (const batiment of structure.batiments.filter((b) => b.chantierId === chantier.id && !b.deletedAt).sort(byOrdre)) {
      const bNode = node("batiment", batiment.id, batiment.nom);
      for (const etage of structure.etages.filter((e) => e.batimentId === batiment.id && !e.deletedAt).sort((a, b) => a.niveau - b.niveau || byOrdre(a, b))) {
        const source = byEtage.get(etage.id);
        const eNode: MetreNode = { ...node("etage", etage.id, etage.nom), ...(source ? { plan: { etageId: source.etageId, planId: source.planId, numero: source.numero, etat: source.etat, figeLe: source.figeLe } } : {}) };
        if (source) {
          const metreByPiece = new Map(source.metre.pieces.map((piece) => [piece.pieceId, piece]));
          const revByPiece = new Map<string, MetreRevetement[]>();
          for (const rev of source.metre.revetements) revByPiece.set(rev.pieceId, [...(revByPiece.get(rev.pieceId) ?? []), rev]);
          const pieceNode = (piece: MetreStructure["pieces"][number]): MetreNode | null => {
            const metre = metreByPiece.get(piece.id);
            if (!metre) return null;
            return { ...node("piece", piece.id, piece.nom), piece: metre, totaux: addPieceToTotaux(emptyTotaux(), metre), revetements: revByPiece.get(piece.id) ?? [] };
          };
          const piecesEtage = structure.pieces.filter((p) => p.etageId === etage.id && !p.deletedAt).sort(byOrdre);
          for (const zone of structure.zones.filter((z) => z.etageId === etage.id && !z.deletedAt).sort(byOrdre)) {
            const zNode = node("zone", zone.id, zone.nom);
            for (const piece of piecesEtage.filter((p) => p.zoneId === zone.id)) { const pn = pieceNode(piece); if (pn) zNode.children.push(pn); }
            if (zNode.children.length) eNode.children.push(zNode);
          }
          for (const piece of piecesEtage.filter((p) => p.zoneId === null || !structure.zones.some((z) => z.id === p.zoneId && !z.deletedAt))) {
            const pn = pieceNode(piece); if (pn) eNode.children.push(pn);
          }
        }
        bNode.children.push(eNode);
      }
      cNode.children.push(bNode);
    }
    root.children.push(cNode);
  }
  // Totaux et revêtements cumulés, des feuilles vers la racine.
  const roll = (current: MetreNode): void => {
    if (current.kind === "piece") return;
    for (const child of current.children) {
      roll(child);
      mergeTotaux(current.totaux, child.totaux);
      current.revetements.push(...child.revetements);
    }
  };
  roll(root);
  return root;
}

/** Pièces actives d'un étage mesuré qui n'ont pas de contour sur le plan (donc pas de métré). */
export function piecesSansMetre(structure: MetreStructure, sources: readonly MetreEtageSource[]): string[] {
  const out: string[] = [];
  for (const source of sources) {
    const measured = new Set(source.metre.pieces.map((piece) => piece.pieceId));
    for (const piece of structure.pieces) if (piece.etageId === source.etageId && !piece.deletedAt && !measured.has(piece.id)) out.push(piece.id);
  }
  return out;
}

// ── Lignes de quantités (vue Métré, CSV, contrat GP) ──────────────────────────

export type MetreLigne = {
  readonly chemin: readonly string[];
  readonly pieceId: string;
  readonly designation: string;
  readonly grandeur: MetreGrandeur | "ouvertures" | "hauteur";
  readonly kind: "surface" | "longueur" | "volume" | "nombre";
  /** Valeur retenue (mm, mm², mm³ ou nombre). `null` : non calculable. */
  readonly quantite: number | null;
  readonly unite: "m2" | "ml" | "m3" | "u" | "m";
  readonly quantiteAvecPerte: number | null;
  readonly valeurCalculee: number | null;
  readonly ajustee: boolean;
  readonly raison: string | null;
  readonly revetementId?: string;
  readonly etatProjet?: EtatProjet;
};

/** Lignes de quantités d'un arbre de synthèse (une section par pièce, puis ses revêtements). */
export function metreLignes(root: MetreNode): MetreLigne[] {
  const lignes: MetreLigne[] = [];
  const walk = (current: MetreNode, chemin: string[]) => {
    const here = current.kind === "releve" ? chemin : [...chemin, current.nom];
    if (current.kind === "piece" && current.piece) {
      const p = current.piece;
      const aj = new Map(p.ajustements.map((item) => [item.grandeur, item]));
      const base = { chemin: here, pieceId: p.pieceId };
      const push = (grandeur: PieceGrandeur, designation: string, kind: "surface" | "longueur" | "volume", unite: MetreLigne["unite"], calcule: number | null) => {
        const a = aj.get(grandeur);
        lignes.push({ ...base, designation, grandeur, kind, quantite: p.retenu[grandeur], unite, quantiteAvecPerte: null, valeurCalculee: calcule, ajustee: !!a, raison: a?.raison ?? null });
      };
      push("surface_sol", "Surface de sol", "surface", "m2", p.surfaceSolNetteMm2);
      push("surface_plafond", "Surface de plafond", "surface", "m2", p.surfacePlafondMm2);
      push("perimetre_brut", "Périmètre brut", "longueur", "ml", p.perimetreBrutMm);
      push("perimetre_utile", "Périmètre utile (plinthes)", "longueur", "ml", p.perimetreUtileMm);
      push("surface_murs", "Surface murale nette", "surface", "m2", p.surfaceMursNetteMm2);
      push("volume", "Volume", "volume", "m3", p.volumeMm3);
      lignes.push({ ...base, designation: "Hauteur sous plafond", grandeur: "hauteur", kind: "longueur", quantite: p.hauteurMm, unite: "m", quantiteAvecPerte: null, valeurCalculee: p.hauteurMm, ajustee: false, raison: null });
      lignes.push({ ...base, designation: "Ouvertures", grandeur: "ouvertures", kind: "nombre", quantite: p.ouvertures.length, unite: "u", quantiteAvecPerte: null, valeurCalculee: p.ouvertures.length, ajustee: false, raison: null });
      for (const rev of current.revetements) {
        lignes.push({
          ...base, designation: `${REVETEMENT_SUPPORT_LABELS[rev.categorie]} · ${REVETEMENT_FAMILLE_LABELS[rev.revetement] ?? rev.revetement} · ${rev.libelle}`,
          grandeur: "quantite", kind: rev.unite === "ml" ? "longueur" : "surface", quantite: rev.quantite, unite: rev.unite, quantiteAvecPerte: rev.quantiteAvecPerte,
          valeurCalculee: rev.quantiteCalculee, ajustee: !!rev.ajustement, raison: rev.ajustement?.raison ?? (rev.raison ? (rev.raison === "hauteur_inconnue" ? "Hauteur inconnue" : "Pièce sans contour") : null),
          revetementId: rev.id, etatProjet: rev.etatProjet,
        });
      }
      return;
    }
    for (const child of current.children) walk(child, here);
  };
  walk(root, []);
  return lignes;
}

function exchangeText(value: number | null, kind: MetreLigne["kind"]): string {
  if (value === null) return "";
  if (kind === "nombre") return String(value);
  return toExchangeText(value, kind, kind === "longueur" ? 2 : kind === "surface" ? 2 : 3);
}

// Injection de formule (Excel / LibreOffice) : une cellule TEXTE commençant par = + - @
// tabulation ou retour chariot est neutralisée par une apostrophe de tête, puis citée.
// Les nombres au format d'échange (« -1,25 », « 1 250,5 ») restent tels quels.
const NOMBRE_CSV = /^-?\d[\d\u00a0\u202f ]*(?:,\d+)?$/;
const csvCell = (value: string) => {
  if (/^[=+\-@\t\r]/.test(value) && !NOMBRE_CSV.test(value)) return `"'${value.replace(/"/g, '""')}"`;
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

export const METRE_CSV_COLUMNS = ["Chantier", "Bâtiment", "Étage", "Zone", "Pièce", "Désignation", "Quantité", "Unité", "Quantité avec perte", "Valeur calculée", "Ajustée", "Raison", "État projeté"] as const;

/**
 * CSV (Excel FR : séparateur `;`, décimale virgule, BOM UTF-8). Quantités RETENUES ; la valeur
 * calculée est toujours rappelée à côté. Colonnes hiérarchiques fixes (zone vide si la pièce n'en a pas).
 */
export function metreToCsv(root: MetreNode): string {
  const lignes = metreLignes(root);
  const rows = [METRE_CSV_COLUMNS.join(";")];
  for (const ligne of lignes) {
    const [chantier = "", batiment = "", etage = "", ...rest] = ligne.chemin;
    const piece = rest[rest.length - 1] ?? "";
    const zone = rest.length > 1 ? rest[0] : "";
    const unite = ligne.unite === "m2" ? "m²" : ligne.unite === "m3" ? "m³" : ligne.unite;
    rows.push([chantier, batiment, etage, zone, piece, ligne.designation, exchangeText(ligne.quantite, ligne.kind), unite,
      exchangeText(ligne.quantiteAvecPerte, ligne.kind), exchangeText(ligne.valeurCalculee, ligne.kind), ligne.ajustee ? "oui" : "non",
      ligne.raison ?? (ligne.quantite === null ? "Non calculable" : ""), ligne.etatProjet ? ETAT_PROJET_LABELS[ligne.etatProjet] : ""].map(csvCell).join(";"));
  }
  return `﻿${rows.join("\r\n")}\r\n`;
}

// ── Affichage ─────────────────────────────────────────────────────────────────

export function formatQuantite(value: number | null, unite: MetreLigne["unite"] | "mm" | "cm"): string {
  if (value === null) return "non calculable";
  switch (unite) {
    case "m2": return formatSurface(value);
    case "m3": return formatVolume(value);
    case "ml": return formatLineaire(value);
    case "m": return formatLongueur(value, "m");
    case "mm": return formatLongueur(value, "mm");
    case "cm": return formatLongueur(value, "cm");
    default: return `${value} u`;
  }
}

// ── Contrat Gestion Pro (métré) ───────────────────────────────────────────────

export const METRE_GP_CONTRACT_VERSION = 1 as const;
/** Préparé, non branché : aucune écriture GP (voir `GP_SYNC_READINESS`), aucun devis généré. */
export const METRE_GP_READINESS = { status: "contract-only", devis: "not-generated" } as const;

export type MetreGpPayload = {
  readonly contractVersion: typeof METRE_GP_CONTRACT_VERSION;
  readonly kind: "releve-metre/metre";
  readonly idempotencyKey: string;
  readonly source: { readonly releveId: string; readonly etat: MetreSyntheseEtat; readonly plans: readonly { readonly etageId: string; readonly planId: string; readonly numero: number; readonly fige: boolean }[] };
  /** Unités d'échange : m, m², m³ (3 décimales, `numeric(12,3)` côté GP). */
  readonly pieces: readonly {
    readonly ref: string; readonly nom: string; readonly chemin: readonly string[]; readonly hauteurM: number | null;
    readonly surfaceSolM2: number; readonly surfacePlafondM2: number; readonly perimetreBrutM: number; readonly perimetreUtileM: number;
    readonly surfaceMursNetteM2: number | null; readonly volumeM3: number | null; readonly ajustements: number;
  }[];
  readonly revetements: readonly {
    readonly ref: string; readonly pieceRef: string; readonly support: RevetementSupport; readonly famille: string; readonly libelle: string;
    readonly unite: "m²" | "ml"; readonly quantite: number | null; readonly pertePourcent: number; readonly quantiteAvecPerte: number | null; readonly etatProjet: EtatProjet;
  }[];
  readonly ouvertures: readonly { readonly ref: string; readonly pieceRefs: readonly string[]; readonly type: OuvertureType; readonly largeurM: number; readonly hauteurM: number; readonly surfaceM2: number; readonly etatProjet: EtatProjet }[];
  readonly longueurs: readonly { readonly pieceRef: string; readonly designation: string; readonly quantiteM: number }[];
  readonly volumes: readonly { readonly pieceRef: string; readonly quantiteM3: number }[];
  /** Quantités agrégées par famille (lignes de métré GP, sans prix). */
  readonly quantites: readonly { readonly designation: string; readonly unite: "m²" | "ml" | "m³" | "u"; readonly quantite: number; readonly quantiteAvecPerte: number | null }[];
};

export function buildMetreGpPayload(root: MetreNode, sources: readonly MetreEtageSource[], etat: MetreSyntheseEtat): MetreGpPayload {
  const pieces: MetreGpPayload["pieces"][number][] = [];
  const revetements: MetreGpPayload["revetements"][number][] = [];
  const longueurs: MetreGpPayload["longueurs"][number][] = [];
  const volumes: MetreGpPayload["volumes"][number][] = [];
  const walk = (current: MetreNode, chemin: string[]) => {
    const here = current.kind === "releve" ? chemin : [...chemin, current.nom];
    if (current.kind === "piece" && current.piece) {
      const p = current.piece;
      pieces.push({
        ref: p.pieceId, nom: current.nom, chemin: here, hauteurM: p.hauteurMm === null ? null : toExchange(p.hauteurMm, "longueur"),
        surfaceSolM2: toExchange(p.retenu.surface_sol ?? 0, "surface"), surfacePlafondM2: toExchange(p.retenu.surface_plafond ?? 0, "surface"),
        perimetreBrutM: toExchange(p.retenu.perimetre_brut ?? 0, "longueur"), perimetreUtileM: toExchange(p.retenu.perimetre_utile ?? 0, "longueur"),
        surfaceMursNetteM2: p.retenu.surface_murs === null ? null : toExchange(p.retenu.surface_murs, "surface"),
        volumeM3: p.retenu.volume === null ? null : toExchange(p.retenu.volume, "volume"), ajustements: p.ajustements.length,
      });
      longueurs.push({ pieceRef: p.pieceId, designation: "Périmètre utile", quantiteM: toExchange(p.retenu.perimetre_utile ?? 0, "longueur") });
      if (p.retenu.volume !== null) volumes.push({ pieceRef: p.pieceId, quantiteM3: toExchange(p.retenu.volume, "volume") });
      for (const rev of current.revetements) {
        const kind = rev.unite === "ml" ? "longueur" : "surface";
        revetements.push({
          ref: rev.id, pieceRef: rev.pieceId, support: rev.categorie, famille: rev.revetement, libelle: rev.libelle, unite: rev.unite === "ml" ? "ml" : "m²",
          quantite: rev.quantite === null ? null : toExchange(rev.quantite, kind), pertePourcent: rev.pertePourcent,
          quantiteAvecPerte: rev.quantiteAvecPerte === null ? null : toExchange(rev.quantiteAvecPerte, kind), etatProjet: rev.etatProjet,
        });
      }
      return;
    }
    for (const child of current.children) walk(child, here);
  };
  walk(root, []);
  const ouvertureRefs = new Map<string, { o: MetreOuverture; pieces: Set<string> }>();
  for (const source of sources) {
    for (const o of source.metre.ouvertures) ouvertureRefs.set(o.id, { o, pieces: new Set() });
    for (const piece of source.metre.pieces) for (const o of piece.ouvertures) ouvertureRefs.get(o.id)?.pieces.add(piece.pieceId);
  }
  const ouvertures = [...ouvertureRefs.values()].map(({ o, pieces: refs }) => ({
    ref: o.id, pieceRefs: [...refs].sort(), type: o.typeOuverture, largeurM: toExchange(o.largeurMm, "longueur"), hauteurM: toExchange(o.hauteurMm, "longueur"),
    surfaceM2: toExchange(o.surfaceMm2, "surface"), etatProjet: o.etatProjet,
  }));
  const quantites: MetreGpPayload["quantites"][number][] = [
    { designation: "Surface de sol", unite: "m²", quantite: toExchange(root.totaux.surfaceSolMm2, "surface"), quantiteAvecPerte: null },
    { designation: "Surface de plafond", unite: "m²", quantite: toExchange(root.totaux.surfacePlafondMm2, "surface"), quantiteAvecPerte: null },
    { designation: "Surface murale nette", unite: "m²", quantite: toExchange(root.totaux.surfaceMursMm2, "surface"), quantiteAvecPerte: null },
    { designation: "Périmètre utile (plinthes)", unite: "ml", quantite: toExchange(root.totaux.perimetreUtileMm, "longueur"), quantiteAvecPerte: null },
    { designation: "Volume", unite: "m³", quantite: toExchange(root.totaux.volumeMm3, "volume"), quantiteAvecPerte: null },
    { designation: "Ouvertures", unite: "u", quantite: ouvertures.length, quantiteAvecPerte: null },
    ...revetementTotaux(root.revetements).map((total) => ({
      designation: `${REVETEMENT_SUPPORT_LABELS[total.support]} · ${REVETEMENT_FAMILLE_LABELS[total.famille] ?? total.famille}${total.etatProjet !== "existant" ? ` (${ETAT_PROJET_LABELS[total.etatProjet]})` : ""}`,
      unite: total.unite === "ml" ? "ml" as const : "m²" as const,
      quantite: toExchange(total.quantite, total.unite === "ml" ? "longueur" : "surface"),
      quantiteAvecPerte: toExchange(total.quantiteAvecPerte, total.unite === "ml" ? "longueur" : "surface"),
    })),
  ];
  const plans = sources.map((source) => ({ etageId: source.etageId, planId: source.planId, numero: source.numero, fige: source.figeLe !== null }));
  return {
    contractVersion: METRE_GP_CONTRACT_VERSION, kind: "releve-metre/metre",
    idempotencyKey: `${root.id}:${etat}:${plans.map((plan) => `${plan.planId}#${plan.numero}${plan.fige ? "F" : ""}`).sort().join(",")}`,
    source: { releveId: root.id, etat, plans }, pieces, revetements, ouvertures, longueurs, volumes, quantites,
  };
}

// ── Port de persistance ───────────────────────────────────────────────────────

export interface ReleveMetreRepository {
  planMetre(planId: string): Promise<PlanMetre>;
  synthese(releveId: string, etat: MetreSyntheseEtat): Promise<MetreEtageSource[]>;
  listRevetements(planId: string): Promise<PlanRevetement[]>;
  saveRevetement(planId: string, revetement: PlanRevetement): Promise<void>;
  deleteRevetement(planId: string, id: string): Promise<void>;
  ajuster(planId: string, cible: { pieceId: string | null; revetementId: string | null; grandeur: MetreGrandeur }, valeurRetenue: number, raison: string): Promise<void>;
  retirerAjustement(id: string, raison: string | null): Promise<void>;
  reglerSeuil(planId: string, revision: number, seuilMm2: number | null): Promise<number>;
}
