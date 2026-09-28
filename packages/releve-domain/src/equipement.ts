/**
 * Lot 7 — Objets du plan : mobilier, sanitaire, cuisine, équipements techniques (miroir de la
 * migration 20260928000701 dans le train V7, 20260928001101 sur sa branche).
 *
 * Un objet de plan est un élément Relevé de type `equipement` rattaché à un plan (`plan_id`) : il
 * appartient donc à l'état documenté de ce plan (INITIAL / CORRECTED / PROJECTED / AS_BUILT), il
 * est copié dans un plan dérivé (lignée `origineId`) et il est IMMUABLE dès que le plan est figé.
 *
 * Ce module porte le catalogue, les calques, les règles (miroir exact des contrôles SQL, messages
 * identiques) et la correspondance avec les éléments. Aucun calcul géométrique au-delà des bornes :
 * accrochage, liaison au mur et association à une pièce sont faits par le moteur de Tools.
 *
 * Conventions : millimètres, repère étage X droite / Y haut ; `position` = CENTRE de l'objet ;
 * `rotationRad` = rotation trigonométrique de l'objet autour de son centre ; largeur le long de son
 * axe local X, profondeur le long de son axe local Y (le dos de l'objet est du côté −Y local).
 */

import {
  EQUIPEMENT_CATEGORIES, EQUIPEMENT_ETATS_PROJET, EQUIPEMENT_FACES, RELEVE_COORDINATE_LIMIT_MM,
  type EquipementCategorie, type EquipementEtatProjet, type EquipementFace, type Point2D, type ReleveElement,
} from "./model";

// ── Catalogue ─────────────────────────────────────────────────────────────────

export type EquipementCatalogueEntry = {
  readonly objet: string;
  readonly categorie: EquipementCategorie;
  readonly libelle: string;
  readonly largeurMm: number;
  readonly profondeurMm: number;
  readonly hauteurMm: number | null;
  /** Cote de pose par défaut (mm au-dessus du sol fini). */
  readonly niveauMm: number;
  /** Objet posé contre un mur (radiateur, meuble haut, prise…) : accroché et lié au mur par défaut. */
  readonly mural: boolean;
};

const entry = (objet: string, categorie: EquipementCategorie, libelle: string, largeurMm: number, profondeurMm: number, hauteurMm: number | null, niveauMm = 0, mural = false): EquipementCatalogueEntry =>
  ({ objet, categorie, libelle, largeurMm, profondeurMm, hauteurMm, niveauMm, mural });

/** Catalogue minimal (ordre d'affichage). Codes identiques à la liste SQL (parité testée). */
export const EQUIPEMENT_CATALOGUE: readonly EquipementCatalogueEntry[] = [
  // Mobilier
  entry("bureau", "mobilier", "Bureau", 1400, 700, 750),
  entry("chaise", "mobilier", "Chaise", 450, 500, 900),
  entry("table", "mobilier", "Table", 1600, 900, 750),
  entry("armoire", "mobilier", "Armoire", 1000, 600, 2000, 0, true),
  entry("etagere", "mobilier", "Étagère", 800, 350, 1800, 0, true),
  entry("lit", "mobilier", "Lit", 1400, 2000, 500),
  entry("canape", "mobilier", "Canapé", 2000, 900, 850),
  entry("meuble", "mobilier", "Meuble", 1200, 450, 900, 0, true),
  // Rangement
  entry("placard", "rangement", "Placard", 1200, 600, 2400, 0, true),
  entry("dressing", "rangement", "Dressing", 2000, 600, 2400, 0, true),
  // Sanitaire
  entry("wc", "sanitaire", "WC", 380, 650, 800, 0, true),
  entry("lavabo", "sanitaire", "Lavabo", 600, 450, 200, 850, true),
  entry("douche", "sanitaire", "Douche", 900, 900, 2000),
  entry("baignoire", "sanitaire", "Baignoire", 1700, 750, 600, 0, true),
  entry("urinoir", "sanitaire", "Urinoir", 400, 350, 600, 600, true),
  entry("lave_mains", "sanitaire", "Lave-mains", 400, 250, 150, 850, true),
  // Cuisine
  entry("evier", "cuisine", "Évier", 1200, 600, 900, 0, true),
  entry("meuble_bas", "cuisine", "Meuble bas", 600, 600, 870, 0, true),
  entry("meuble_haut", "cuisine", "Meuble haut", 600, 350, 700, 1400, true),
  entry("plan_travail", "cuisine", "Plan de travail", 2400, 650, 40, 870, true),
  entry("refrigerateur", "cuisine", "Réfrigérateur", 600, 650, 1850, 0, true),
  entry("four", "cuisine", "Four", 600, 600, 600, 0, true),
  entry("plaque", "cuisine", "Plaque de cuisson", 600, 520, 60, 900, true),
  // Électricité
  entry("tableau_electrique", "electricite", "Tableau électrique", 500, 150, 900, 1000, true),
  entry("prise", "electricite", "Prise", 80, 40, 80, 300, true),
  entry("interrupteur", "electricite", "Interrupteur", 80, 40, 80, 1100, true),
  // CVC
  entry("radiateur", "cvc", "Radiateur", 1000, 100, 600, 150, true),
  entry("climatiseur", "cvc", "Climatiseur", 900, 250, 300, 2000, true),
  entry("vmc", "cvc", "Bouche VMC", 150, 150, null, 2400),
  // Plomberie
  entry("chauffe_eau", "plomberie", "Chauffe-eau", 550, 550, 1500, 0, true),
  entry("vanne", "plomberie", "Vanne d'arrêt", 100, 100, null, 300, true),
  // Sécurité
  entry("extincteur", "securite", "Extincteur", 250, 200, 600, 1000, true),
  entry("detecteur_fumee", "securite", "Détecteur de fumée", 120, 120, null, 2400),
  entry("baes", "securite", "BAES (bloc de secours)", 350, 100, 150, 2100, true),
  // Technique
  entry("chaudiere", "technique", "Chaudière", 450, 350, 750, 900, true),
  entry("compteur", "technique", "Compteur", 300, 150, 400, 1000, true),
  // Éclairage (catégorie du Lot 2)
  entry("luminaire", "eclairage", "Luminaire", 300, 300, null, 2400),
  // Autre
  entry("objet", "autre", "Objet", 600, 600, null),
];

export const EQUIPEMENT_OBJETS = EQUIPEMENT_CATALOGUE.map((item) => item.objet);
const CATALOGUE_BY_OBJET = new Map(EQUIPEMENT_CATALOGUE.map((item) => [item.objet, item]));
export function catalogueEntry(objet: string | undefined | null): EquipementCatalogueEntry {
  return CATALOGUE_BY_OBJET.get(objet ?? "") ?? CATALOGUE_BY_OBJET.get("objet")!;
}

export const EQUIPEMENT_CATEGORIE_LABELS: Record<EquipementCategorie, string> = {
  mobilier: "Mobilier", sanitaire: "Sanitaire", cuisine: "Cuisine", electricite: "Électricité", cvc: "CVC", plomberie: "Plomberie",
  securite: "Sécurité", rangement: "Rangement", technique: "Technique", eclairage: "Éclairage", autre: "Autre",
};
/** Ordre d'affichage des groupes (catégories demandées par le cahier des charges, puis Éclairage du Lot 2). */
export const EQUIPEMENT_GROUPES: readonly EquipementCategorie[] = [
  "mobilier", "sanitaire", "cuisine", "electricite", "cvc", "plomberie", "securite", "rangement", "technique", "autre", "eclairage",
];
export const EQUIPEMENT_ETAT_PROJET_LABELS: Record<EquipementEtatProjet, string> = {
  existant: "Existant", a_deposer: "À déposer", nouveau: "Nouveau", deplace: "Déplacé",
};

// ── Calques ───────────────────────────────────────────────────────────────────

export const PLAN_CALQUES = ["structure", "ouvertures", "mobilier", "sanitaire", "cuisine", "technique", "photos", "annotations", "cotations"] as const;
export type PlanCalque = (typeof PLAN_CALQUES)[number];
export const PLAN_CALQUE_LABELS: Record<PlanCalque, string> = {
  structure: "Structure", ouvertures: "Ouvertures", mobilier: "Mobilier", sanitaire: "Sanitaire", cuisine: "Cuisine",
  technique: "Technique", photos: "Photos", annotations: "Annotations", cotations: "Cotations",
};
export type PlanCalqueEtat = { readonly visible: boolean; readonly verrouille: boolean };
export type PlanCalques = Readonly<Record<PlanCalque, PlanCalqueEtat>>;

/** Calque d'une catégorie d'objet. */
export const CALQUE_DES_CATEGORIES: Record<EquipementCategorie, PlanCalque> = {
  mobilier: "mobilier", rangement: "mobilier", autre: "mobilier",
  sanitaire: "sanitaire",
  cuisine: "cuisine",
  electricite: "technique", cvc: "technique", plomberie: "technique", securite: "technique", technique: "technique", eclairage: "technique",
};

/** État effectif des calques (absent = visible, non verrouillé). */
export function calquesEffectifs(stored: Partial<Record<string, Partial<PlanCalqueEtat>>> | null | undefined): PlanCalques {
  const out = {} as Record<PlanCalque, PlanCalqueEtat>;
  for (const calque of PLAN_CALQUES) {
    const value = stored?.[calque];
    out[calque] = { visible: value?.visible !== false, verrouille: value?.verrouille === true };
  }
  return out;
}

// ── Objet de plan ─────────────────────────────────────────────────────────────

export type PlanEquipement = {
  readonly id: string;
  /** Pièce métier (Lot 3) où se trouve l'objet. */
  readonly pieceId: string | null;
  readonly categorie: EquipementCategorie;
  readonly objet: string;
  readonly libelle: string;
  /** Centre de l'objet (mm). */
  readonly position: Point2D;
  readonly rotationRad: number;
  readonly largeurMm: number;
  readonly profondeurMm: number;
  readonly hauteurMm: number | null;
  /** Cote de pose au-dessus du sol fini (mm). L'étage (niveau du bâtiment) est celui du plan. */
  readonly niveauMm: number | null;
  readonly commentaire: string | null;
  readonly visible: boolean;
  readonly verrouille: boolean;
  /** Pièce déduite de la position (suit les déplacements) ou choisie à la main. */
  readonly pieceAuto: boolean;
  /** Liaison au mur (objets muraux) : l'objet suit son mur. */
  readonly murId: string | null;
  readonly face: EquipementFace | null;
  /** Position de l'axe de l'objet le long du mur, depuis A (mm). */
  readonly decalageMm: number | null;
  /** Plan projeté : existant, à déposer, nouveau, déplacé (absent = existant). */
  readonly etatProjet?: EquipementEtatProjet;
  readonly origineId?: string | null;
};

export const EQUIPEMENT_LIMITS = {
  dimensionMaxMm: 50_000,
  hauteurMaxMm: 20_000,
  niveauMaxMm: 20_000,
  libelle: 200,
  commentaire: 2_000,
  /** |rotation| ≤ 2π (arrondi SQL : 6,2832). */
  rotationMax: 6.2832,
} as const;

/** Codes des anomalies d'objet (miroir de `tools_releve_plan_equipement_anomalie` et de l'enregistrement). */
export const EQUIPMENT_ISSUE_CODES = [
  "categorie", "objet", "libelle", "position", "dimensions", "rotation", "niveau", "commentaire", "etat_projet", "mur_absent", "verrouille", "piece", "invalide",
] as const;
export type EquipmentIssueCode = (typeof EQUIPMENT_ISSUE_CODES)[number];

/** Messages (identiques côté serveur : `tools_releve_plan_equipement_message`). */
export const EQUIPMENT_ISSUE_MESSAGES: Record<EquipmentIssueCode, string> = {
  categorie: "Catégorie d'objet inconnue.",
  objet: "Type d'objet inconnu.",
  libelle: "Un objet porte un libellé (200 caractères au plus).",
  position: "Position de l'objet hors du repère.",
  dimensions: "Dimensions de l'objet invalides : largeur et profondeur positives.",
  rotation: "Rotation de l'objet invalide.",
  niveau: "Niveau de pose invalide (0 à 20 m).",
  commentaire: "Commentaire trop long (2 000 caractères au plus).",
  etat_projet: "État projeté inconnu.",
  mur_absent: "L'objet est lié à un mur absent du plan.",
  verrouille: "Objet verrouillé : déverrouillez-le d'abord.",
  piece: "Pièce absente de l'étage du plan.",
  invalide: "Objet invalide.",
};

const coordinate = (value: number) => Number.isFinite(value) && Math.abs(value) <= RELEVE_COORDINATE_LIMIT_MM;
const positive = (value: number, max: number) => Number.isFinite(value) && value > 0 && value <= max;

/** Première anomalie d'un objet (même ordre de contrôle que le SQL), `null` si valide. */
export function equipementAnomalie(objet: PlanEquipement): EquipmentIssueCode | null {
  if (!(EQUIPEMENT_CATEGORIES as readonly string[]).includes(objet.categorie)) return "categorie";
  if (!CATALOGUE_BY_OBJET.has(objet.objet)) return "objet";
  if (typeof objet.libelle !== "string" || !objet.libelle.trim() || objet.libelle.length > EQUIPEMENT_LIMITS.libelle) return "libelle";
  if (!objet.position || !coordinate(objet.position.x) || !coordinate(objet.position.y)) return "position";
  if (!positive(objet.largeurMm, EQUIPEMENT_LIMITS.dimensionMaxMm) || !positive(objet.profondeurMm, EQUIPEMENT_LIMITS.dimensionMaxMm)) return "dimensions";
  if (objet.hauteurMm !== null && !positive(objet.hauteurMm, EQUIPEMENT_LIMITS.hauteurMaxMm)) return "dimensions";
  if (!Number.isFinite(objet.rotationRad) || Math.abs(objet.rotationRad) > EQUIPEMENT_LIMITS.rotationMax) return "rotation";
  if (objet.niveauMm !== null && !(Number.isFinite(objet.niveauMm) && objet.niveauMm >= 0 && objet.niveauMm <= EQUIPEMENT_LIMITS.niveauMaxMm)) return "niveau";
  if (objet.commentaire !== null && objet.commentaire.length > EQUIPEMENT_LIMITS.commentaire) return "commentaire";
  if (objet.etatProjet !== undefined && !(EQUIPEMENT_ETATS_PROJET as readonly string[]).includes(objet.etatProjet)) return "etat_projet";
  if (objet.face !== null && !(EQUIPEMENT_FACES as readonly string[]).includes(objet.face)) return "invalide";
  if (objet.decalageMm !== null && !(Number.isFinite(objet.decalageMm) && objet.decalageMm >= 0)) return "invalide";
  return null;
}

export type EquipmentIssue = { readonly equipementId: string; readonly code: EquipmentIssueCode; readonly message: string };

/** Anomalies d'objets d'un document : contrôle unitaire + liaison à un mur absent du plan. */
export function validatePlanEquipements(equipements: readonly PlanEquipement[], murIds: ReadonlySet<string>): EquipmentIssue[] {
  const issues: EquipmentIssue[] = [];
  for (const objet of equipements) {
    const code = equipementAnomalie(objet) ?? (objet.murId !== null && !murIds.has(objet.murId) ? "mur_absent" : null);
    if (code) issues.push({ equipementId: objet.id, code, message: EQUIPMENT_ISSUE_MESSAGES[code] });
  }
  return issues;
}

/** Normalisation de la rotation dans ]−π, π] (toujours dans les bornes serveur). */
export function normalizeRotation(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  let value = radians % (2 * Math.PI);
  if (value > Math.PI) value -= 2 * Math.PI;
  if (value <= -Math.PI) value += 2 * Math.PI;
  return Math.round(value * 1e6) / 1e6 + 0;
}

/** Nouvel objet à partir du catalogue. */
export function newPlanEquipement(objet: string, id: string, position: Point2D, overrides: Partial<Omit<PlanEquipement, "id">> = {}): PlanEquipement {
  const item = catalogueEntry(objet);
  return {
    id, pieceId: null, categorie: item.categorie, objet: item.objet, libelle: item.libelle, position, rotationRad: 0,
    largeurMm: item.largeurMm, profondeurMm: item.profondeurMm, hauteurMm: item.hauteurMm, niveauMm: item.niveauMm, commentaire: null,
    visible: true, verrouille: false, pieceAuto: true, murId: null, face: null, decalageMm: null, ...overrides,
  };
}

// ── Correspondance avec les éléments Relevé ───────────────────────────────────

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Élément `equipement` → objet de plan. Tolère un équipement du Lot 2 (sans objet ni dimensions) :
 * valeurs du catalogue (« Objet ») par défaut.
 */
export function equipementFromElement(element: Pick<ReleveElement<"equipement">, "id" | "pieceId" | "donnees">): PlanEquipement {
  const d = element.donnees;
  const item = catalogueEntry(d.objet);
  const position = d.position as { x?: unknown; y?: unknown } | null;
  const objet: PlanEquipement = {
    id: element.id, pieceId: element.pieceId, categorie: d.categorie, objet: d.objet ?? item.objet, libelle: d.libelle,
    position: { x: num(position?.x, 0), y: num(position?.y, 0) }, rotationRad: num(d.rotationRad, 0),
    largeurMm: numOrNull(d.largeurMm) ?? item.largeurMm, profondeurMm: numOrNull(d.profondeurMm) ?? item.profondeurMm,
    hauteurMm: numOrNull(d.hauteurMm), niveauMm: numOrNull(d.niveauMm), commentaire: d.commentaire ?? null,
    visible: d.visible !== false, verrouille: d.verrouille === true, pieceAuto: d.pieceAuto !== false,
    murId: d.murId ?? null, face: d.face ?? null, decalageMm: numOrNull(d.decalageMm), origineId: d.origineId ?? null,
  };
  return d.etatProjet !== undefined ? { ...objet, etatProjet: d.etatProjet } : objet;
}

/** Charge `donnees` telle qu'enregistrée (clés stables : l'égalité serveur évite les réécritures). */
export function equipementDonnees(objet: PlanEquipement): Record<string, unknown> {
  const donnees: Record<string, unknown> = {
    categorie: objet.categorie, objet: objet.objet, libelle: objet.libelle, position: { x: objet.position.x, y: objet.position.y },
    rotationRad: objet.rotationRad, largeurMm: objet.largeurMm, profondeurMm: objet.profondeurMm, hauteurMm: objet.hauteurMm,
    niveauMm: objet.niveauMm, visible: objet.visible, verrouille: objet.verrouille, pieceAuto: objet.pieceAuto,
  };
  if (objet.commentaire !== null && objet.commentaire !== "") donnees.commentaire = objet.commentaire;
  if (objet.murId) { donnees.murId = objet.murId; donnees.face = objet.face; donnees.decalageMm = objet.decalageMm; }
  if (objet.etatProjet !== undefined) donnees.etatProjet = objet.etatProjet;
  if (objet.origineId) donnees.origineId = objet.origineId;
  return donnees;
}

// ── Fiche pièce ───────────────────────────────────────────────────────────────

export type PieceEquipementRow = { readonly id: string; readonly planId: string | null; readonly pieceId: string | null; readonly donnees: ReleveElement<"equipement">["donnees"] };

/**
 * Équipements présents dans une pièce, pour la fiche pièce : ceux du PLAN DE RÉFÉRENCE de l'étage
 * (le plus récent non supprimé — les plans antérieurs portent des copies du même objet) et ceux
 * saisis hors plan (Lot 2). Compteur réel : aucun objet compté deux fois.
 */
export function equipementsDeLaPiece(
  rows: readonly PieceEquipementRow[],
  plans: readonly { readonly id: string; readonly numero: number; readonly deletedAt: string | null }[],
  pieceId: string,
): PlanEquipement[] {
  const reference = plans.filter((plan) => plan.deletedAt === null).sort((x, y) => y.numero - x.numero)[0]?.id ?? null;
  return rows
    .filter((row) => row.pieceId === pieceId && (row.planId === null || row.planId === reference))
    .map((row) => equipementFromElement({ id: row.id as never, pieceId: row.pieceId as never, donnees: row.donnees }))
    .sort((x, y) => EQUIPEMENT_GROUPES.indexOf(x.categorie) - EQUIPEMENT_GROUPES.indexOf(y.categorie) || x.libelle.localeCompare(y.libelle, "fr"));
}

/** Comptage par catégorie (fiche pièce, panneau des calques). */
export function countByCategorie(objets: readonly Pick<PlanEquipement, "categorie">[]): Partial<Record<EquipementCategorie, number>> {
  const counts: Partial<Record<EquipementCategorie, number>> = {};
  for (const objet of objets) counts[objet.categorie] = (counts[objet.categorie] ?? 0) + 1;
  return counts;
}
