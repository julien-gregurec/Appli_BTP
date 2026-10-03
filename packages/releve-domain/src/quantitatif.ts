/**
 * Lot 9 — Quantitatifs, ouvrages & takeoff automatique (miroir de la migration 20260928000810).
 *
 * Un OUVRAGE technique décrit une prestation (nom, catégorie, lot, unité) et sa RÈGLE DE QUANTITÉ :
 * une source dérivée du métré du Lot 8 (surfaces, périmètres, murs, ouvertures, objets, revêtements…)
 * transformée par une suite FERMÉE d'opérations (coefficient, entraxe, longueur / surface unitaire,
 * hauteur, épaisseur, ajout, ratio kg), puis perte % et arrondi. Aucun code n'est exécuté, aucune
 * chaîne n'est évaluée : le moteur est déterministe, testable, et identique au SQL.
 *
 * Règles (voir le rapport Lot 9) :
 * - analyse dimensionnelle : la source fixe l'unité de départ (m², ml, m³, u, forfait), chaque opération
 *   la transforme EXPLICITEMENT (entraxe : ml → u ; hauteur : ml → m² ; épaisseur : m² → m³ ; surface
 *   unitaire : m² → u ; ratio kg : → kg) ; l'unité obtenue doit être l'unité déclarée : aucune conversion
 *   implicite (m² ↛ ml…) ;
 * - arithmétique entière en micro-unités (1e-6), arrondi « moitié loin de zéro » (round() de PostgreSQL),
 *   quantité calculée à 3 décimales : aucune erreur de flottant, parité exacte avec le serveur ;
 * - la règle s'applique à CHAQUE unité source (pièce, mur, ouverture, objet, revêtement), puis les
 *   résultats sont sommés par (ouvrage, pièce, état projeté) : un arrondi supérieur (plaques, montants)
 *   se fait par mur / par pièce, jamais sur un total ;
 * - séparation EXISTANT / À DÉPOSER / NEUF / DÉPLACÉ : les sources qui portent un état (murs, ouvertures,
 *   objets, revêtements) sont filtrées par les états de l'ouvrage ; les sources de pièce (sol, murs,
 *   plafond, périmètres, volume) et les forfaits prennent l'état de travaux de l'ouvrage ;
 * - un mur ou une ouverture partagé(e) entre deux pièces est rattaché(e) à l'étage (pièce nulle) et
 *   annoté(e) « partage » : jamais compté(e) deux fois ;
 * - une quantité calculée n'est JAMAIS écrasée : un ajustement porte la quantité retenue, la raison,
 *   l'auteur et la date ; il devient « périmé » si le calcul change ;
 * - aucun prix : un ouvrage (et la bibliothèque) ne décrit que la prestation, son unité et sa règle.
 */

import type { EquipementCategorie, OuvertureType } from "./model";
import { EQUIPEMENT_CATEGORIES, OUVERTURE_TYPES } from "./model";
import { ETAT_PROJET_LABELS, ETATS_PROJET, REVETEMENT_FAMILLE_LABELS, REVETEMENT_SUPPORT_LABELS, type EtatProjet, type MetreStructure, type MetreSyntheseEtat, type PlanMetre, type RevetementSupport } from "./metre";
import type { PlanEtat } from "./plan";

// ── Énumérations (parité SQL testée) ──────────────────────────────────────────

export const OUVRAGE_CATEGORIES = [
  "cloisons", "doublages", "plafonds", "sols", "peinture", "faience", "carrelage", "plinthes", "profiles", "portes", "fenetres",
  "sanitaires", "mobilier", "electricite", "cvc", "plomberie", "demolition", "depose", "autre",
] as const;
export type OuvrageCategorie = (typeof OUVRAGE_CATEGORIES)[number];
export const OUVRAGE_CATEGORIE_LABELS: Record<OuvrageCategorie, string> = {
  cloisons: "Cloisons", doublages: "Doublages", plafonds: "Plafonds", sols: "Sols", peinture: "Peinture", faience: "Faïence",
  carrelage: "Carrelage", plinthes: "Plinthes", profiles: "Profilés", portes: "Portes", fenetres: "Fenêtres", sanitaires: "Sanitaires",
  mobilier: "Mobilier", electricite: "Électricité", cvc: "CVC", plomberie: "Plomberie", demolition: "Démolition", depose: "Dépose", autre: "Autre",
};
/** Lot de travaux proposé par défaut (modifiable ouvrage par ouvrage). */
export const OUVRAGE_LOT_PAR_CATEGORIE: Record<OuvrageCategorie, string> = {
  cloisons: "Plâtrerie – cloisons", doublages: "Plâtrerie – cloisons", plafonds: "Plafonds", sols: "Revêtements de sols",
  peinture: "Peinture", faience: "Carrelage – faïence", carrelage: "Carrelage – faïence", plinthes: "Revêtements de sols",
  profiles: "Menuiseries intérieures", portes: "Menuiseries intérieures", fenetres: "Menuiseries extérieures", sanitaires: "Plomberie – sanitaires",
  mobilier: "Agencement – mobilier", electricite: "Électricité", cvc: "CVC", plomberie: "Plomberie – sanitaires", demolition: "Démolition – dépose",
  depose: "Démolition – dépose", autre: "Divers",
};

export const OUVRAGE_UNITES = ["u", "ml", "m2", "m3", "kg", "forfait"] as const;
export type OuvrageUnite = (typeof OUVRAGE_UNITES)[number];
export const OUVRAGE_UNITE_LABELS: Record<OuvrageUnite, string> = { u: "u", ml: "ml", m2: "m²", m3: "m³", kg: "kg", forfait: "forfait" };

export const OUVRAGE_SOURCES = [
  "surface_sol", "surface_murs", "surface_plafond", "perimetre_brut", "perimetre_utile", "longueur_murs", "surface_murs_plan",
  "nombre_ouvertures", "surface_ouvertures", "volume", "nombre_equipements", "quantite_revetement", "forfait", "saisie",
] as const;
export type OuvrageSource = (typeof OUVRAGE_SOURCES)[number];
export const OUVRAGE_SOURCE_LABELS: Record<OuvrageSource, string> = {
  surface_sol: "Surface de sol", surface_murs: "Surface des murs (nette, pièce)", surface_plafond: "Surface de plafond",
  perimetre_brut: "Périmètre brut", perimetre_utile: "Périmètre utile (hors passages)", longueur_murs: "Longueur de murs (plan)",
  surface_murs_plan: "Surface de murs (longueur × hauteur du mur)", nombre_ouvertures: "Nombre d'ouvertures",
  surface_ouvertures: "Surface d'ouvertures", volume: "Volume", nombre_equipements: "Nombre d'objets / équipements",
  quantite_revetement: "Quantité de revêtement", forfait: "Forfait", saisie: "Saisie manuelle",
};
/** Sources dont chaque élément porte un état projeté (filtrées par `etats`). */
export const OUVRAGE_SOURCES_A_ETAT: readonly OuvrageSource[] = ["longueur_murs", "surface_murs_plan", "nombre_ouvertures", "surface_ouvertures", "nombre_equipements", "quantite_revetement"];
const SOURCES_PIECE: readonly OuvrageSource[] = ["surface_sol", "surface_murs", "surface_plafond", "perimetre_brut", "perimetre_utile", "volume"];

export const OUVRAGE_OPERATIONS = ["coefficient", "entraxe", "longueur_unitaire", "surface_unitaire", "hauteur", "epaisseur", "ajouter", "ratio_kg"] as const;
export type OuvrageOperationCode = (typeof OUVRAGE_OPERATIONS)[number];
export const OUVRAGE_OPERATION_LABELS: Record<OuvrageOperationCode, string> = {
  coefficient: "× coefficient", entraxe: "÷ entraxe (m) → u", longueur_unitaire: "÷ longueur unitaire (m) → u",
  surface_unitaire: "÷ surface unitaire (m²) → u", hauteur: "× hauteur (m) : ml → m²", epaisseur: "× épaisseur (m) : m² → m³",
  ajouter: "+ quantité (par unité source)", ratio_kg: "× ratio (kg par unité) → kg",
};

export const ARRONDI_MODES = ["aucun", "superieur", "inferieur", "proche"] as const;
export type ArrondiMode = (typeof ARRONDI_MODES)[number];
export const ARRONDI_MODE_LABELS: Record<ArrondiMode, string> = { aucun: "Aucun", superieur: "Supérieur", inferieur: "Inférieur", proche: "Au plus proche" };

export const OUVRAGE_LIMITS = { nom: 160, lot: 80, commentaire: 1000, operations: 8, pieces: 500, filtre: 40, import: 2000 } as const;

// ── Contrat d'un ouvrage ──────────────────────────────────────────────────────

export type OuvrageOperation = { readonly op: OuvrageOperationCode; readonly valeur: number };
export type OuvrageFiltre = {
  readonly typesOuverture?: readonly OuvertureType[];
  readonly categories?: readonly EquipementCategorie[];
  readonly objets?: readonly string[];
  readonly support?: RevetementSupport;
  readonly familles?: readonly string[];
};
export type OuvrageRegle = {
  readonly source: OuvrageSource;
  readonly filtre?: OuvrageFiltre;
  /** Saisie : quantité (unité déclarée) ; forfait : nombre de forfaits (1 par défaut). */
  readonly valeur?: number | null;
  readonly operations?: readonly OuvrageOperation[];
};
export type OuvrageArrondi = { readonly mode: ArrondiMode; readonly pas?: number | null };

/** Données d'un ouvrage (JSON stocké, identique au contrat SQL). Aucun prix. */
export type OuvrageDonnees = {
  readonly nom: string;
  readonly code?: string | null;
  readonly categorie: OuvrageCategorie;
  readonly lot?: string | null;
  readonly unite: OuvrageUnite;
  readonly regle: OuvrageRegle;
  readonly pertePourcent: number;
  readonly arrondi: OuvrageArrondi;
  /** Pièces visées ; absent / null = toutes les pièces (et les éléments rattachés à l'étage). */
  readonly pieceIds?: readonly string[] | null;
  /** État projeté des quantités de pièce (sol, murs, plafond, périmètres, volume) et des forfaits. */
  readonly etatTravaux: EtatProjet;
  /** États retenus pour les sources à état (murs, ouvertures, objets, revêtements). */
  readonly etats: readonly EtatProjet[];
  readonly commentaire?: string | null;
};
export type OuvrageOrigine = "auto" | "manuelle";
/** Contrat d'un ouvrage sans identifiant ni pièces visées (bibliothèque, copie vers un autre plan). */
export function ouvrageModele(ouvrage: OuvrageDonnees & { readonly id?: string }): Omit<OuvrageDonnees, "pieceIds"> {
  const { nom, code, categorie, lot, unite, regle, pertePourcent, arrondi, etatTravaux, etats, commentaire } = ouvrage;
  return { nom, ...(code ? { code } : {}), categorie, ...(lot ? { lot } : {}), unite, regle, pertePourcent, arrondi, etatTravaux, etats, ...(commentaire ? { commentaire } : {}) };
}
export function ouvrageOrigine(donnees: Pick<OuvrageDonnees, "regle">): OuvrageOrigine {
  return donnees.regle.source === "forfait" || donnees.regle.source === "saisie" ? "manuelle" : "auto";
}

export const OUVRAGE_ISSUE_CODES = [
  "invalide", "prix", "nom", "code", "categorie", "lot", "unite", "perte", "arrondi", "etats", "pieces", "commentaire",
  "source", "filtre", "valeur", "formule_invalide", "unite_incoherente", "piece",
] as const;
export type OuvrageIssueCode = (typeof OUVRAGE_ISSUE_CODES)[number];
export const OUVRAGE_ISSUE_MESSAGES: Record<OuvrageIssueCode, string> = {
  invalide: "Ouvrage invalide.",
  prix: "Aucun prix dans Tools : un ouvrage décrit la prestation, son unité et sa règle de quantité.",
  nom: "Nom de l'ouvrage obligatoire (160 caractères au plus).",
  code: "Code d'ouvrage : lettres, chiffres, point, tiret (40 caractères au plus).",
  categorie: "Catégorie d'ouvrage inconnue.",
  lot: "Lot : 80 caractères au plus.",
  unite: "Unité inconnue (u, ml, m², m³, kg, forfait).",
  perte: "Perte entre 0 et 100 % (deux décimales au plus).",
  arrondi: "Arrondi invalide : mode inconnu ou pas absent, nul ou trop précis.",
  etats: "États projetés invalides.",
  pieces: "Pièces visées invalides.",
  commentaire: "Commentaire : 1 000 caractères au plus.",
  source: "Source de quantité inconnue.",
  filtre: "Filtre de source invalide.",
  valeur: "Valeur saisie invalide (positive, six décimales au plus).",
  formule_invalide: "Formule invalide : opération inconnue, valeur nulle, négative ou trop précise, ou plus de 8 opérations.",
  unite_incoherente: "Unité incohérente : la formule ne produit pas l'unité déclarée (aucune conversion implicite).",
  piece: "Pièce visée absente de l'étage du plan.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PRICE_KEY = /"[^"]*(prix|price|tarif|montant|cout|coût)[^"]*"\s*:/i;
const TOP_KEYS = ["nom", "code", "categorie", "lot", "unite", "regle", "pertePourcent", "arrondi", "pieceIds", "etatTravaux", "etats", "commentaire"];

type Json = unknown;
const isObject = (value: Json): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);
const isPresent = (obj: Record<string, Json>, key: string) => key in obj && obj[key] !== null && obj[key] !== undefined;

/** Représentation décimale exacte d'un nombre JSON (sans notation exponentielle). */
export function decimalString(value: number | string): string {
  const raw = typeof value === "number" ? String(value) : value.trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match || (match[2] === "" && !match[3])) throw new Error(`Nombre invalide : ${raw}`);
  const [, sign, intPart = "", fracPart = "", exp = "0"] = match;
  let digits = `${intPart}${fracPart}`;
  let point = intPart.length + Number(exp);
  if (point <= 0) { digits = `${"0".repeat(1 - point)}${digits}`; point = 1; }
  if (point > digits.length) digits = digits.padEnd(point, "0");
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const frac = digits.slice(point).replace(/0+$/, "");
  const isZero = /^0*$/.test(whole + frac);
  return `${sign === "-" && !isZero ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Nombre de décimales significatives d'un nombre JSON. */
function decimals(value: number): number {
  const s = decimalString(value);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** Miroir de `tools_releve_qt_decimal_valide`. */
function decimalValide(value: Json, maxDecimales: number, min: number, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && decimals(value) <= maxDecimales;
}

const stringList = (value: Json): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Premier défaut d'un ouvrage (ordre des contrôles identique à `tools_releve_ouvrage_anomalie`), ou `null`.
 * L'objet est contrôlé tel qu'il sera envoyé (JSON) : clés inconnues refusées, aucun prix.
 */
export function ouvrageAnomalie(input: Json): OuvrageIssueCode | null {
  if (!isObject(input)) return "invalide";
  const p = input;
  if (PRICE_KEY.test(JSON.stringify(p))) return "prix";
  if (Object.keys(p).some((key) => !TOP_KEYS.includes(key))) return "invalide";
  if (typeof p.nom !== "string" || p.nom.trim().length < 1 || [...p.nom.trim()].length > OUVRAGE_LIMITS.nom) return "nom";
  if (isPresent(p, "code") && (typeof p.code !== "string" || !/^[A-Za-z0-9._-]{1,40}$/.test(p.code))) return "code";
  if (!(OUVRAGE_CATEGORIES as readonly string[]).includes(p.categorie as string)) return "categorie";
  if (isPresent(p, "lot") && (typeof p.lot !== "string" || [...p.lot].length > OUVRAGE_LIMITS.lot)) return "lot";
  if (!(OUVRAGE_UNITES as readonly string[]).includes(p.unite as string)) return "unite";
  if (!decimalValide(p.pertePourcent, 2, 0, 100)) return "perte";
  const arrondi = p.arrondi;
  if (!isObject(arrondi) || Object.keys(arrondi).some((key) => key !== "mode" && key !== "pas")
      || !(ARRONDI_MODES as readonly string[]).includes(arrondi.mode as string)
      || (arrondi.mode !== "aucun" && !decimalValide(arrondi.pas, 6, 0.000001, 1_000_000))
      || (arrondi.mode === "aucun" && isPresent(arrondi, "pas") && !decimalValide(arrondi.pas, 6, 0.000001, 1_000_000))) return "arrondi";
  const etats = p.etats;
  if (!(ETATS_PROJET as readonly string[]).includes(p.etatTravaux as string)
      || !Array.isArray(etats) || etats.length < 1 || etats.length > 4
      || etats.some((etat) => typeof etat !== "string" || !(ETATS_PROJET as readonly string[]).includes(etat))
      || new Set(etats).size !== etats.length) return "etats";
  if (isPresent(p, "pieceIds")) {
    const ids = p.pieceIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > OUVRAGE_LIMITS.pieces || ids.some((id) => typeof id !== "string" || !UUID.test(id)) || new Set(ids).size !== ids.length) return "pieces";
  }
  if (isPresent(p, "commentaire") && (typeof p.commentaire !== "string" || [...p.commentaire].length > OUVRAGE_LIMITS.commentaire)) return "commentaire";

  const regle = p.regle;
  if (!isObject(regle) || Object.keys(regle).some((key) => !["source", "filtre", "valeur", "operations"].includes(key))) return "formule_invalide";
  const src = regle.source as OuvrageSource;
  if (!(OUVRAGE_SOURCES as readonly string[]).includes(src as string)) return "source";
  const f = isPresent(regle, "filtre") ? regle.filtre : {};
  if (!isObject(f)) return "filtre";
  for (const key of Object.keys(f)) {
    const allowed = ((src === "nombre_ouvertures" || src === "surface_ouvertures") && key === "typesOuverture")
      || (src === "nombre_equipements" && (key === "categories" || key === "objets"))
      || (src === "quantite_revetement" && (key === "support" || key === "familles"));
    if (!allowed) return "filtre";
    if (key === "support") {
      if (!["sol", "mur", "plafond", "plinthe"].includes(f.support as string)) return "filtre";
      continue;
    }
    const list = f[key];
    if (!Array.isArray(list) || list.length < 1 || list.length > OUVRAGE_LIMITS.filtre || new Set(list).size !== list.length) return "filtre";
    if (!stringList(list)) return "filtre";
    const ok = list.every((item) => key === "typesOuverture" ? (OUVERTURE_TYPES as readonly string[]).includes(item)
      : key === "categories" ? (EQUIPEMENT_CATEGORIES as readonly string[]).includes(item) : /^[a-z][a-z0-9_]{0,39}$/.test(item));
    if (!ok) return "filtre";
  }
  if (src === "quantite_revetement" && !("support" in f)) return "filtre";
  if (src === "saisie") {
    if (!decimalValide(regle.valeur, 6, 0, 1_000_000_000)) return "valeur";
  } else if (src === "forfait") {
    if (isPresent(regle, "valeur") && !decimalValide(regle.valeur, 6, 0.000001, 1_000_000)) return "valeur";
  } else if (isPresent(regle, "valeur")) {
    return "valeur";
  }

  let dim: string | null = sourceDimension(src, f as OuvrageFiltre, p.unite as OuvrageUnite);
  if (isPresent(regle, "operations")) {
    const ops = regle.operations;
    if (!Array.isArray(ops) || ops.length > OUVRAGE_LIMITS.operations) return "formule_invalide";
    for (const op of ops) {
      if (!isObject(op) || Object.keys(op).some((key) => key !== "op" && key !== "valeur") || !(OUVRAGE_OPERATIONS as readonly string[]).includes(op.op as string)) return "formule_invalide";
      if (op.op === "ajouter") {
        if (!decimalValide(op.valeur, 6, -1_000_000, 1_000_000) || op.valeur === 0) return "formule_invalide";
      } else if (!decimalValide(op.valeur, 6, 0.000001, 1_000_000)) {
        return "formule_invalide";
      }
      dim = operationDimension(op.op as OuvrageOperationCode, dim);
      if (dim === null) return "unite_incoherente";
    }
  }
  if (dim !== p.unite) return "unite_incoherente";
  return null;
}

/** Unité de départ d'une source (saisie : l'unité déclarée). */
export function sourceDimension(source: OuvrageSource, filtre: OuvrageFiltre | undefined, unite: OuvrageUnite): OuvrageUnite {
  switch (source) {
    case "surface_sol": case "surface_murs": case "surface_plafond": case "surface_murs_plan": case "surface_ouvertures": return "m2";
    case "perimetre_brut": case "perimetre_utile": case "longueur_murs": return "ml";
    case "volume": return "m3";
    case "nombre_ouvertures": case "nombre_equipements": return "u";
    case "quantite_revetement": return filtre?.support === "plinthe" ? "ml" : "m2";
    case "forfait": return "forfait";
    default: return unite;
  }
}

/** Unité après une opération, ou `null` si l'opération ne s'applique pas à cette unité. */
export function operationDimension(op: OuvrageOperationCode, dim: string | null): OuvrageUnite | null {
  if (dim === null) return null;
  switch (op) {
    case "coefficient": case "ajouter": return dim as OuvrageUnite;
    case "entraxe": case "longueur_unitaire": return dim === "ml" ? "u" : null;
    case "surface_unitaire": return dim === "m2" ? "u" : null;
    case "hauteur": return dim === "ml" ? "m2" : null;
    case "epaisseur": return dim === "m2" ? "m3" : null;
    case "ratio_kg": return ["u", "ml", "m2", "m3"].includes(dim) ? "kg" : null;
  }
}

/** Unité produite par la règle (pour guider la saisie) ; `null` si la chaîne est incohérente. */
export function regleUnite(regle: OuvrageRegle, uniteDeclaree: OuvrageUnite): OuvrageUnite | null {
  let dim: OuvrageUnite | null = sourceDimension(regle.source, regle.filtre, uniteDeclaree);
  for (const op of regle.operations ?? []) dim = operationDimension(op.op, dim);
  return dim;
}

// ── Arithmétique exacte (micro-unités BigInt) ─────────────────────────────────

/** Constantes BigInt (cible ES2017 : pas de littéraux `n`). */
const N0 = BigInt(0);
const N1 = BigInt(1);
const N2 = BigInt(2);
const N1000 = BigInt(1000);
const N10000 = BigInt(10000);
const N1000000 = BigInt(1000000);
const N1000000000000 = BigInt(1000000000000);
const MICRO = N1000000;

/** Division entière arrondie « moitié loin de zéro » (miroir de `tools_releve_qt_rdiv`). */
export function rdiv(n: bigint, d: bigint): bigint {
  const q = n / d; // troncature vers zéro, comme div()
  const r = n % d; // signe du dividende, comme mod()
  const abs = (x: bigint) => (x < N0 ? -x : x);
  if (abs(r) * N2 >= abs(d)) return q + ((n < N0) !== (d < N0) ? -N1 : N1);
  return q;
}

/** Valeur décimale × 10^scale, arrondie moitié loin de zéro (miroir de round(x * 10^scale)). */
export function scaled(value: number | string, scale: number): bigint {
  const s = decimalString(value);
  const negative = s.startsWith("-");
  const [whole, frac = ""] = (negative ? s.slice(1) : s).split(".");
  const kept = frac.slice(0, scale).padEnd(scale, "0");
  let result = BigInt(`${whole}${kept}`);
  const next = frac.charCodeAt(scale);
  if (frac.length > scale && next >= 53 /* '5' */) result += N1;
  return negative ? -result : result;
}

/** Entier de micro-unités → nombre JSON (identique au `numeric` × 0.000001 du serveur). */
const fromMicro = (value: bigint): number => Number(value) / 1e6;
const fromMilli = (value: bigint): number => Number(value) / 1e3;

/** Décimal exact « 12.345 » d'un entier de milli-unités. */
export function milliText(milli: bigint | number): string {
  const value = BigInt(milli);
  const negative = value < N0;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / N1000}.${String(abs % N1000).padStart(3, "0")}`;
}

/** Nombre JSON à au plus 3 décimales → milli-unités exactes. */
export const toMilli = (value: number): bigint => scaled(value, 3);

/**
 * Applique la règle à UNE unité source (micro-unités). Miroir de `tools_releve_qt_appliquer` :
 * opérations → perte → arrondi → 3 décimales. Retour : [brute, avec perte (micro), calculée (milli)].
 */
export function appliquerRegle(base: bigint | null, donnees: Pick<OuvrageDonnees, "regle" | "pertePourcent" | "arrondi">): [bigint, bigint, bigint] | null {
  if (base === null) return null;
  let q = base;
  for (const op of donnees.regle.operations ?? []) {
    const k = scaled(op.valeur, 6);
    switch (op.op) {
      case "coefficient": case "hauteur": case "epaisseur": case "ratio_kg": q = rdiv(q * k, MICRO); break;
      case "entraxe": case "longueur_unitaire": case "surface_unitaire": q = rdiv(q * MICRO, k); break;
      case "ajouter": q = q + k; break;
    }
  }
  const q2 = rdiv(q * (N10000 + scaled(donnees.pertePourcent, 2)), N10000);
  let c = q2;
  const mode = donnees.arrondi?.mode ?? "aucun";
  if (mode !== "aucun") {
    const s = scaled(donnees.arrondi.pas as number, 6);
    const div = q2 / s; const mod = q2 % s;
    if (mode === "superieur") c = (div + (mod > N0 ? N1 : N0)) * s;
    else if (mode === "inferieur") c = (div - (mod < N0 ? N1 : N0)) * s;
    else c = rdiv(q2, s) * s;
  }
  return [q, q2, rdiv(c, N1000)];
}

// ── Évaluation (miroir de `tools_releve_quantitatif_evaluer`) ─────────────────

export type OuvrageRecord = OuvrageDonnees & { readonly id: string };

export type QuantitatifAjustementEntree = {
  readonly id: string; readonly ouvrageId: string; readonly pieceId: string | null; readonly etatProjet: EtatProjet;
  readonly valeurCalculee: number | null; readonly valeurRetenue: number; readonly raison: string; readonly auteurId?: string | null; readonly date?: string | null;
};
export type QuantitatifMurEntree = { readonly id: string; readonly longueurMm: number; readonly hauteurMm: number | null; readonly etatProjet: EtatProjet };

export type QuantitatifEntree = {
  readonly metre: Pick<PlanMetre, "pieces" | "ouvertures" | "equipements" | "revetements">;
  readonly ouvrages: readonly OuvrageRecord[];
  readonly ajustements?: readonly QuantitatifAjustementEntree[];
  readonly murs?: readonly QuantitatifMurEntree[];
  readonly piecesSupprimees?: readonly string[];
};

export type QuantitatifAjustement = {
  readonly id: string; readonly valeurCalculee: number | null; readonly valeurRetenue: number; readonly raison: string;
  readonly auteurId: string | null; readonly date: string | null;
  /** Le calcul a changé depuis l'ajustement : la quantité retenue est à revoir. */
  readonly perime: boolean;
};
export type QuantitatifAnnotation = "partage" | "hors_piece";
export type QuantitatifLigne = {
  readonly ouvrageId: string;
  /** Pièce de la ligne ; `null` : étage (élément partagé entre pièces, hors pièce, ou forfait global). */
  readonly pieceId: string | null;
  readonly etatProjet: EtatProjet;
  readonly source: OuvrageSource;
  readonly uniteSource: OuvrageUnite;
  readonly unite: OuvrageUnite;
  /** Unités sources (pièces, murs, ouvertures, objets…) de la ligne, dont non calculables. */
  readonly elements: number;
  readonly nonCalculables: number;
  /** Quantité source (unité de la source), 6 décimales ; `null` : non calculable. */
  readonly base: number | null;
  readonly quantiteBrute: number | null;
  readonly quantiteAvecPerte: number | null;
  /** Quantité calculée (après perte et arrondi), 3 décimales ; `null` : non calculable. */
  readonly quantiteCalculee: number | null;
  readonly ajustement: QuantitatifAjustement | null;
  /** Quantité RETENUE : l'ajustement s'il existe, sinon la quantité calculée. */
  readonly quantiteRetenue: number | null;
  readonly annotations: readonly QuantitatifAnnotation[];
};

export const QUANTITATIF_ANOMALIE_CODES = ["formule_invalide", "unite_incoherente", "objet_supprime", "source_absente", "surface_impossible", "quantite_negative", "metre_obsolete"] as const;
export type QuantitatifAnomalieCode = (typeof QUANTITATIF_ANOMALIE_CODES)[number];
export const QUANTITATIF_ANOMALIE_LABELS: Record<QuantitatifAnomalieCode, string> = {
  formule_invalide: "Formule invalide", unite_incoherente: "Unité incohérente", objet_supprime: "Objet supprimé", source_absente: "Source absente",
  surface_impossible: "Surface impossible", quantite_negative: "Quantité négative", metre_obsolete: "Métré obsolète",
};
export type QuantitatifAnomalieGravite = "erreur" | "avertissement";
export type QuantitatifAnomalie = {
  readonly code: QuantitatifAnomalieCode;
  readonly gravite: QuantitatifAnomalieGravite;
  readonly ouvrageId: string;
  readonly pieceId: string | null;
  readonly etatProjet: EtatProjet | null;
  readonly detail: string;
  readonly message: string;
};

/** Miroir de `tools_releve_quantitatif_anomalie_message`. */
export function quantitatifAnomalieMessage(code: QuantitatifAnomalieCode, detail: string): string {
  switch (code) {
    case "formule_invalide": case "unite_incoherente": return OUVRAGE_ISSUE_MESSAGES[detail as OuvrageIssueCode] ?? OUVRAGE_ISSUE_MESSAGES.invalide;
    case "quantite_negative": return "Quantité négative : vérifiez la formule (ajout négatif ?).";
    case "surface_impossible": return "Surface impossible (nulle, négative ou démesurée) : vérifiez le contour, les ouvertures ou la saisie.";
    case "source_absente":
      if (detail === "aucune_donnee") return "Source absente : aucune donnée du plan ne correspond à cet ouvrage.";
      if (detail === "piece_sans_contour") return "Source absente : pièce visée sans contour sur ce plan.";
      return "Source absente : quantité non calculable pour certains éléments (hauteur inconnue, pièce sans contour…).";
    case "objet_supprime":
      return detail === "piece_supprimee" ? "Objet supprimé : pièce visée supprimée." : "Objet supprimé : ajustement sans ligne correspondante (élément ou pièce disparu).";
    case "metre_obsolete":
      return detail === "ajustement_perime" ? "Métré obsolète : le calcul a changé depuis l'ajustement, quantité retenue à revoir." : "Métré obsolète : la valeur source porte un ajustement de métré périmé.";
  }
}

export type QuantitatifResultat = { readonly moteur: "quantitatif-v1"; readonly lignes: readonly QuantitatifLigne[]; readonly anomalies: readonly QuantitatifAnomalie[] };

const cmpC = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return 1; // nulls last
  if (b === null) return -1;
  return a < b ? -1 : 1;
};
const etatPos = (etat: string | null) => (etat === null ? -1 : ETATS_PROJET.indexOf(etat as EtatProjet));

type Unit = { kind: "piece" | "global" | "mur" | "ouverture" | "equipement" | "revetement"; pieceId: string | null; etat: EtatProjet | null; m: Record<string, Json>; annot: QuantitatifAnnotation | null };

const roundInt = (value: Json): bigint | null => (value === null || value === undefined ? null : scaled(value as number, 0));
const toNumberOrNull = (value: Json): number | null => (value === null || value === undefined ? null : Number(value));

/**
 * Quantitatif d'un plan : lignes (ouvrage × pièce × état) et anomalies, dans l'ordre total du serveur.
 * Fonction pure : mêmes entrées → mêmes sorties, octet pour octet (hors notation des nombres).
 */
export function evaluerQuantitatif(entree: QuantitatifEntree): QuantitatifResultat {
  const ouvAll = entree.ouvrages.map((o, idx) => {
    const { id, ...donnees } = o;
    return { o, idx, id, code: ouvrageAnomalie(donnees) };
  });
  const ouv = ouvAll.filter((item) => item.code === null);
  const rooms = entree.metre.pieces.map((r) => ({ r, pid: r.pieceId }));
  const roomOuv = new Map<string, { n: number; pid: string }>();
  for (const { r, pid } of rooms) for (const o of r.ouvertures ?? []) {
    const cur = roomOuv.get(o.id);
    roomOuv.set(o.id, cur ? { n: cur.n + 1, pid: cur.pid < pid ? cur.pid : pid } : { n: 1, pid });
  }
  const roomMurSets = new Map<string, Set<string>>();
  for (const { r, pid } of rooms) for (const f of r.faces ?? []) if (f.murId) {
    const set = roomMurSets.get(f.murId) ?? new Set<string>(); set.add(pid); roomMurSets.set(f.murId, set);
  }
  const attr = (n: number | undefined, pid: string | undefined): { pieceId: string | null; annot: QuantitatifAnnotation | null } =>
    n === undefined ? { pieceId: null, annot: "hors_piece" } : n > 1 ? { pieceId: null, annot: "partage" } : { pieceId: pid ?? null, annot: null };

  const units: Unit[] = [];
  for (const { r, pid } of rooms) units.push({ kind: "piece", pieceId: pid, etat: null, m: r as unknown as Record<string, Json>, annot: null });
  units.push({ kind: "global", pieceId: null, etat: null, m: {}, annot: null });
  for (const w of entree.murs ?? []) {
    const set = roomMurSets.get(w.id);
    const a = attr(set?.size, set ? [...set][0] : undefined);
    units.push({ kind: "mur", pieceId: a.pieceId, etat: w.etatProjet ?? "existant", m: w as unknown as Record<string, Json>, annot: a.annot });
  }
  for (const o of entree.metre.ouvertures ?? []) {
    const c = roomOuv.get(o.id);
    const a = attr(c?.n, c?.pid);
    units.push({ kind: "ouverture", pieceId: a.pieceId, etat: o.etatProjet ?? "existant", m: o as unknown as Record<string, Json>, annot: a.annot });
  }
  for (const e of entree.metre.equipements ?? []) {
    units.push({ kind: "equipement", pieceId: e.pieceId ?? null, etat: e.etatProjet ?? "existant", m: e as unknown as Record<string, Json>, annot: e.pieceId ? null : "hors_piece" });
  }
  for (const r of entree.metre.revetements ?? []) {
    units.push({ kind: "revetement", pieceId: r.pieceId, etat: r.etatProjet ?? "existant", m: r as unknown as Record<string, Json>, annot: null });
  }
  const unitsByKind = new Map<Unit["kind"], Unit[]>();
  for (const unit of units) unitsByKind.set(unit.kind, [...(unitsByKind.get(unit.kind) ?? []), unit]);

  type Acc = { idx: number; ouvrageId: string; pieceId: string | null; etat: EtatProjet; src: OuvrageSource; elements: number; nc: number;
    base: bigint | null; q1: bigint | null; q2: bigint | null; milli: bigint | null; perime: boolean; impossibles: number; annots: Set<QuantitatifAnnotation> };
  const acc = new Map<string, Acc>();
  const add = (a: bigint | null, b: bigint | null) => (b === null ? a : a === null ? b : a + b);

  for (const { o, idx, id } of ouv) {
    const src = o.regle.source;
    const f: OuvrageFiltre = o.regle.filtre ?? {};
    const scope = o.pieceIds ?? null;
    const kind: Unit["kind"] = SOURCES_PIECE.includes(src) ? "piece"
      : src === "longueur_murs" || src === "surface_murs_plan" ? "mur"
      : src === "nombre_ouvertures" || src === "surface_ouvertures" ? "ouverture"
      : src === "nombre_equipements" ? "equipement"
      : src === "quantite_revetement" ? "revetement"
      : scope === null ? "global" : "piece";
    const surface = ["surface_sol", "surface_murs", "surface_plafond", "surface_murs_plan", "surface_ouvertures"].includes(src) || (src === "quantite_revetement" && f.support !== "plinthe");
    for (const u of unitsByKind.get(kind) ?? []) {
      if (scope !== null && (u.pieceId === null || !scope.includes(u.pieceId))) continue;
      if (u.etat !== null && !o.etats.includes(u.etat)) continue;
      if (f.typesOuverture && !f.typesOuverture.includes(u.m.typeOuverture as OuvertureType)) continue;
      if (f.categories && !(f.categories as readonly string[]).includes(u.m.categorie as string)) continue;
      if (f.objets && !f.objets.includes(u.m.objet as string)) continue;
      if (f.support && u.m.categorie !== f.support) continue;
      if (f.familles && !f.familles.includes(u.m.revetement as string)) continue;
      const retenu = (u.m.retenu ?? {}) as Record<string, Json>;
      let base: bigint | null;
      switch (src) {
        case "surface_sol": case "surface_murs": case "surface_plafond": base = roundInt(retenu[src]); break;
        case "perimetre_brut": case "perimetre_utile": base = retenu[src] === null || retenu[src] === undefined ? null : scaled(retenu[src] as number, 3); break;
        case "volume": { const v = roundInt(retenu.volume); base = v === null ? null : rdiv(v, N1000); break; }
        case "longueur_murs": base = scaled(u.m.longueurMm as number, 3); break;
        case "surface_murs_plan": base = typeof u.m.hauteurMm === "number" ? scaled(decimalProduct(u.m.longueurMm as number, u.m.hauteurMm), 0) : null; break;
        case "nombre_ouvertures": case "nombre_equipements": base = MICRO; break;
        case "surface_ouvertures": base = roundInt(u.m.surfaceMm2); break;
        case "quantite_revetement": base = u.m.quantite === null || u.m.quantite === undefined ? null
          : u.m.unite === "ml" ? scaled(u.m.quantite as number, 3) : roundInt(u.m.quantite); break;
        case "forfait": base = scaled(o.regle.valeur ?? 1, 6); break;
        case "saisie": base = scaled(o.regle.valeur as number, 6); break;
      }
      let perime = false;
      if (SOURCES_PIECE.includes(src)) perime = ((u.m.ajustements ?? []) as { grandeur: string; perime: boolean }[]).some((a) => a.grandeur === src && a.perime);
      else if (src === "quantite_revetement") perime = !!(u.m.ajustement as { perime?: boolean } | null)?.perime;
      const etat = (u.etat ?? o.etatTravaux) as EtatProjet;
      const r = appliquerRegle(base, o);
      const key = `${idx}\u0000${u.pieceId ?? ""}\u0000${etat}`;
      const line = acc.get(key) ?? { idx, ouvrageId: id, pieceId: u.pieceId, etat, src, elements: 0, nc: 0, base: null, q1: null, q2: null, milli: null, perime: false, impossibles: 0, annots: new Set() };
      line.elements += 1;
      if (base === null) line.nc += 1;
      line.base = add(line.base, base); line.q1 = add(line.q1, r?.[0] ?? null); line.q2 = add(line.q2, r?.[1] ?? null); line.milli = add(line.milli, r?.[2] ?? null);
      line.perime ||= perime;
      if (surface && base !== null && (base <= N0 || base > N1000000000000)) line.impossibles += 1;
      if (u.annot) line.annots.add(u.annot);
      acc.set(key, line);
    }
  }

  const ajustements = entree.ajustements ?? [];
  const ajByKey = new Map(ajustements.map((a) => [`${a.ouvrageId}\u0000${a.pieceId ?? ""}\u0000${a.etatProjet}`, a]));
  const ouvById = new Map(ouvAll.map((item) => [item.id, item]));
  const sorted = [...acc.values()].sort((a, b) => a.idx - b.idx || cmpC(a.pieceId, b.pieceId) || etatPos(a.etat) - etatPos(b.etat));
  const lignes: QuantitatifLigne[] = [];
  const lf: (Acc & { calculee: number | null; aj: QuantitatifAjustementEntree | null; ajPerime: boolean })[] = [];
  for (const l of sorted) {
    const o = ouvById.get(l.ouvrageId)!.o;
    const calculee = l.nc < l.elements && l.milli !== null ? fromMilli(l.milli) : null;
    const a = ajByKey.get(`${l.ouvrageId}\u0000${l.pieceId ?? ""}\u0000${l.etat}`) ?? null;
    const valeurCalculee = a ? toNumberOrNull(a.valeurCalculee) : null;
    const ajPerime = a !== null && valeurCalculee !== calculee;
    lf.push({ ...l, calculee, aj: a, ajPerime });
    lignes.push({
      ouvrageId: l.ouvrageId, pieceId: l.pieceId, etatProjet: l.etat, source: l.src,
      uniteSource: sourceDimension(o.regle.source, o.regle.filtre, o.unite), unite: o.unite,
      elements: l.elements, nonCalculables: l.nc,
      base: l.base === null ? null : fromMicro(l.base), quantiteBrute: l.q1 === null ? null : fromMicro(l.q1), quantiteAvecPerte: l.q2 === null ? null : fromMicro(l.q2),
      quantiteCalculee: calculee,
      ajustement: a ? { id: a.id, valeurCalculee, valeurRetenue: Number(a.valeurRetenue), raison: a.raison, auteurId: a.auteurId ?? null, date: a.date ?? null, perime: ajPerime } : null,
      quantiteRetenue: a ? Number(a.valeurRetenue) : calculee,
      annotations: [...l.annots].sort((x, y) => cmpC(x, y)),
    });
  }

  type A = { idx: number; ouvrageId: string; pieceId: string | null; etat: EtatProjet | null; code: QuantitatifAnomalieCode; detail: string; gravite: QuantitatifAnomalieGravite };
  const anomalies: A[] = [];
  const roomIds = new Set(rooms.map((room) => room.pid));
  const supprimees = new Set(entree.piecesSupprimees ?? []);
  for (const item of ouvAll) if (item.code !== null) {
    anomalies.push({ idx: item.idx, ouvrageId: item.id, pieceId: null, etat: null, code: item.code === "unite_incoherente" || item.code === "unite" ? "unite_incoherente" : "formule_invalide", detail: item.code, gravite: "erreur" });
  }
  for (const item of ouv) for (const pid of item.o.pieceIds ?? []) if (!roomIds.has(pid)) {
    const deleted = supprimees.has(pid);
    anomalies.push({ idx: item.idx, ouvrageId: item.id, pieceId: pid, etat: null, code: deleted ? "objet_supprime" : "source_absente", detail: deleted ? "piece_supprimee" : "piece_sans_contour", gravite: deleted ? "erreur" : "avertissement" });
  }
  const withLines = new Set(lf.map((l) => l.ouvrageId));
  for (const item of ouv) if (!withLines.has(item.id)) anomalies.push({ idx: item.idx, ouvrageId: item.id, pieceId: null, etat: null, code: "source_absente", detail: "aucune_donnee", gravite: "avertissement" });
  for (const l of lf) {
    const base = { idx: l.idx, ouvrageId: l.ouvrageId, pieceId: l.pieceId, etat: l.etat };
    if (l.nc > 0) anomalies.push({ ...base, code: "source_absente", detail: "non_calculable", gravite: "avertissement" });
    if (l.calculee !== null && l.calculee < 0) anomalies.push({ ...base, code: "quantite_negative", detail: "negative", gravite: "erreur" });
    if (l.impossibles > 0) anomalies.push({ ...base, code: "surface_impossible", detail: "surface", gravite: "erreur" });
    if (l.perime) anomalies.push({ ...base, code: "metre_obsolete", detail: "source_perimee", gravite: "avertissement" });
    if (l.aj && l.ajPerime) anomalies.push({ ...base, code: "metre_obsolete", detail: "ajustement_perime", gravite: "avertissement" });
  }
  const lineKeys = new Set(lf.map((l) => `${l.ouvrageId}\u0000${l.pieceId ?? ""}\u0000${l.etat}`));
  for (const a of ajustements) if (!lineKeys.has(`${a.ouvrageId}\u0000${a.pieceId ?? ""}\u0000${a.etatProjet}`)) {
    anomalies.push({ idx: ouvById.get(a.ouvrageId)?.idx ?? 2147483647, ouvrageId: a.ouvrageId, pieceId: a.pieceId ?? null, etat: a.etatProjet, code: "objet_supprime", detail: "ajustement_orphelin", gravite: "erreur" });
  }
  anomalies.sort((a, b) => a.idx - b.idx || cmpC(a.pieceId, b.pieceId) || etatPos(a.etat) - etatPos(b.etat)
    || QUANTITATIF_ANOMALIE_CODES.indexOf(a.code) - QUANTITATIF_ANOMALIE_CODES.indexOf(b.code) || cmpC(a.detail, b.detail));

  return {
    moteur: "quantitatif-v1",
    lignes,
    anomalies: anomalies.map((a) => ({ code: a.code, gravite: a.gravite, ouvrageId: a.ouvrageId, pieceId: a.pieceId, etatProjet: a.etat, detail: a.detail, message: quantitatifAnomalieMessage(a.code, a.detail) })),
  };
}

/** Produit exact de deux décimaux (chaîne décimale), pour round(l × h) du serveur. */
function decimalProduct(a: number, b: number): string {
  const sa = decimalString(a); const sb = decimalString(b);
  const da = sa.includes(".") ? sa.length - sa.indexOf(".") - 1 : 0;
  const db = sb.includes(".") ? sb.length - sb.indexOf(".") - 1 : 0;
  const product = BigInt(sa.replace(".", "")) * BigInt(sb.replace(".", ""));
  const negative = product < N0;
  const digits = (negative ? -product : product).toString().padStart(da + db + 1, "0");
  const point = digits.length - (da + db);
  return `${negative ? "-" : ""}${digits.slice(0, point)}${da + db ? `.${digits.slice(point)}` : ""}`;
}

// ── Quantitatif d'un plan (forme JSON du serveur) ─────────────────────────────

export type OuvrageAudit = {
  readonly id: string; readonly bibliothequeId: string | null; readonly origineOuvrageId: string | null; readonly origine: OuvrageOrigine;
  readonly revision: number; readonly createdAt: string; readonly createdBy: string | null; readonly updatedAt: string; readonly updatedBy: string | null;
};
export type PlanQuantitatif = QuantitatifResultat & {
  readonly version: 1;
  readonly planId: string;
  readonly etageId: string;
  readonly etat: PlanEtat;
  readonly numero: number;
  readonly ouvrages: readonly OuvrageRecord[];
  readonly fige?: boolean;
  readonly source?: "gel" | "calcul" | "recalcul_plan_fige_avant_lot9";
  readonly figeLe?: string | null;
  readonly calculeLe?: string;
  readonly revision?: number;
  readonly audit?: readonly OuvrageAudit[];
};

const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/** Normalise le JSON serveur (nombres `numeric` éventuellement sérialisés en chaîne). */
export function planQuantitatifFromJson(raw: unknown): PlanQuantitatif {
  const json = raw as PlanQuantitatif;
  return {
    ...json,
    numero: Number(json.numero),
    ouvrages: json.ouvrages ?? [],
    lignes: (json.lignes ?? []).map((l) => ({
      ...l, elements: Number(l.elements), nonCalculables: Number(l.nonCalculables), base: num(l.base), quantiteBrute: num(l.quantiteBrute),
      quantiteAvecPerte: num(l.quantiteAvecPerte), quantiteCalculee: num(l.quantiteCalculee), quantiteRetenue: num(l.quantiteRetenue),
      ajustement: l.ajustement ? { ...l.ajustement, valeurCalculee: num(l.ajustement.valeurCalculee), valeurRetenue: Number(l.ajustement.valeurRetenue) } : null,
      annotations: l.annotations ?? [],
    })),
    anomalies: json.anomalies ?? [],
  };
}

// ── Formule lisible ───────────────────────────────────────────────────────────

const frNumber = (value: number) => decimalString(value).replace(".", ",");

/** Formule en clair : « Surface des murs (nette, pièce) × 2 ÷ 3 m² (u) + perte 10 % → arrondi supérieur (1) ». */
export function formuleTexte(donnees: Pick<OuvrageDonnees, "regle" | "pertePourcent" | "arrondi" | "unite">): string {
  const { regle } = donnees;
  const parts: string[] = [];
  let source = OUVRAGE_SOURCE_LABELS[regle.source];
  const f = regle.filtre;
  if (f?.typesOuverture?.length) source += ` [${f.typesOuverture.join(", ")}]`;
  if (f?.categories?.length) source += ` [${f.categories.join(", ")}]`;
  if (f?.objets?.length) source += ` [${f.objets.join(", ")}]`;
  if (f?.support) source += ` [${REVETEMENT_SUPPORT_LABELS[f.support]}${f.familles?.length ? ` : ${f.familles.map((x) => REVETEMENT_FAMILLE_LABELS[x] ?? x).join(", ")}` : ""}]`;
  if (regle.source === "saisie") source = `${frNumber(regle.valeur ?? 0)} ${OUVRAGE_UNITE_LABELS[donnees.unite]} (saisie)`;
  if (regle.source === "forfait") source = `${frNumber(regle.valeur ?? 1)} forfait`;
  parts.push(source);
  for (const op of regle.operations ?? []) {
    const v = frNumber(op.valeur);
    switch (op.op) {
      case "coefficient": parts.push(`× ${v}`); break;
      case "entraxe": parts.push(`÷ entraxe ${v} m`); break;
      case "longueur_unitaire": parts.push(`÷ ${v} m / u`); break;
      case "surface_unitaire": parts.push(`÷ ${v} m² / u`); break;
      case "hauteur": parts.push(`× hauteur ${v} m`); break;
      case "epaisseur": parts.push(`× épaisseur ${v} m`); break;
      case "ajouter": parts.push(op.valeur < 0 ? `− ${frNumber(-op.valeur)}` : `+ ${v}`); break;
      case "ratio_kg": parts.push(`× ${v} kg`); break;
    }
  }
  if (donnees.pertePourcent > 0) parts.push(`+ perte ${frNumber(donnees.pertePourcent)} %`);
  if (donnees.arrondi.mode !== "aucun") parts.push(`→ arrondi ${ARRONDI_MODE_LABELS[donnees.arrondi.mode].toLowerCase()} (${frNumber(donnees.arrondi.pas ?? 1)})`);
  return `${parts.join(" ")} = ${OUVRAGE_UNITE_LABELS[donnees.unite]}`;
}

// ── Catalogue standard (bibliothèque de départ, sans prix) ────────────────────

type CatalogueEntry = OuvrageDonnees & { readonly code: string };
const TOUS_ETATS: readonly EtatProjet[] = ["existant", "a_deposer", "nouveau", "deplace"];
const std = (code: string, nom: string, categorie: OuvrageCategorie, unite: OuvrageUnite, regle: OuvrageRegle,
  options: { perte?: number; arrondi?: OuvrageArrondi; etatTravaux?: EtatProjet; etats?: readonly EtatProjet[]; commentaire?: string } = {}): CatalogueEntry => ({
  code, nom, categorie, lot: OUVRAGE_LOT_PAR_CATEGORIE[categorie], unite, regle, pertePourcent: options.perte ?? 0,
  arrondi: options.arrondi ?? { mode: "aucun" }, etatTravaux: options.etatTravaux ?? "nouveau", etats: options.etats ?? ["nouveau"],
  ...(options.commentaire ? { commentaire: options.commentaire } : {}),
});
const SUP1: OuvrageArrondi = { mode: "superieur", pas: 1 };

/**
 * Catalogue standard : ouvrages courants prêts à l'emploi (cas réels du cahier des charges). Chaque
 * entrée est un contrat valide (testé) ; l'utilisateur l'adapte, l'enregistre dans la bibliothèque de
 * son entreprise ou l'ajoute à un plan. Aucune entrée ne porte de prix.
 */
export const OUVRAGE_CATALOGUE_STANDARD: readonly CatalogueEntry[] = [
  std("PEI-MUR", "Peinture murs (2 couches)", "peinture", "m2", { source: "surface_murs" }, { perte: 5 }),
  std("PEI-PLA", "Peinture plafonds", "peinture", "m2", { source: "surface_plafond" }, { perte: 5 }),
  std("PLI-ML", "Plinthes", "plinthes", "ml", { source: "perimetre_utile" }, { perte: 5 }),
  std("PLI-BAR", "Plinthes (barres de 2,40 m)", "plinthes", "u", { source: "perimetre_utile", operations: [{ op: "longueur_unitaire", valeur: 2.4 }] }, { perte: 10, arrondi: SUP1 }),
  std("SOL-STR", "Sol stratifié", "sols", "m2", { source: "surface_sol" }, { perte: 7, arrondi: { mode: "superieur", pas: 0.01 } }),
  std("SOL-SOUS", "Sous-couche acoustique", "sols", "m2", { source: "surface_sol" }, { perte: 5 }),
  std("CAR-SOL", "Carrelage sol", "carrelage", "m2", { source: "surface_sol" }, { perte: 10 }),
  std("FAI-MUR", "Faïence (zones saisies au métré)", "faience", "m2", { source: "quantite_revetement", filtre: { support: "mur", familles: ["faience"] } }, { perte: 10, etats: ["nouveau"] }),
  std("PAN-DEC", "Panneaux décoratifs 1,20 × 0,60 m", "doublages", "u", { source: "quantite_revetement", filtre: { support: "mur", familles: ["panneau_decoratif"] }, operations: [{ op: "surface_unitaire", valeur: 0.72 }] }, { perte: 5, arrondi: SUP1 }),
  std("CLO-M2", "Cloisons (surface)", "cloisons", "m2", { source: "surface_murs_plan" }, { etats: ["nouveau"] }),
  std("CLO-MON", "Montants de cloison (entraxe 0,60 m)", "cloisons", "u", { source: "longueur_murs", operations: [{ op: "entraxe", valeur: 0.6 }, { op: "ajouter", valeur: 1 }] }, { arrondi: SUP1, etats: ["nouveau"], commentaire: "Un montant par entraxe, plus un par mur ; arrondi par mur." }),
  std("CLO-RAIL", "Rails de cloison (haut et bas)", "cloisons", "ml", { source: "longueur_murs", operations: [{ op: "coefficient", valeur: 2 }] }, { perte: 5, etats: ["nouveau"] }),
  std("CLO-BA13", "Plaques BA13 2,50 × 1,20 m (2 faces)", "cloisons", "u", { source: "surface_murs_plan", operations: [{ op: "coefficient", valeur: 2 }, { op: "surface_unitaire", valeur: 3 }] }, { perte: 10, arrondi: SUP1, etats: ["nouveau"] }),
  std("CLO-BPH", "Barrière phonique en plénum (h 0,50 m)", "cloisons", "m2", { source: "longueur_murs", operations: [{ op: "hauteur", valeur: 0.5 }] }, { perte: 5, etats: ["nouveau"] }),
  std("DOU-MUR", "Doublage des murs", "doublages", "m2", { source: "surface_murs" }, { perte: 5 }),
  std("PLA-FP", "Faux plafond", "plafonds", "m2", { source: "surface_plafond" }, { perte: 5 }),
  std("POR-U", "Portes (bloc-porte)", "portes", "u", { source: "nombre_ouvertures", filtre: { typesOuverture: ["porte"] } }),
  std("FEN-U", "Fenêtres et portes-fenêtres", "fenetres", "u", { source: "nombre_ouvertures", filtre: { typesOuverture: ["fenetre", "porte_fenetre", "baie"] } }),
  std("PRO-SEU", "Profilés de seuil", "profiles", "u", { source: "nombre_ouvertures", filtre: { typesOuverture: ["porte", "passage"] } }),
  std("SAN-U", "Appareils sanitaires", "sanitaires", "u", { source: "nombre_equipements", filtre: { categories: ["sanitaire"] } }),
  std("ELE-PRI", "Prises de courant", "electricite", "u", { source: "nombre_equipements", filtre: { objets: ["prise"] } }),
  std("CVC-RAD", "Radiateurs", "cvc", "u", { source: "nombre_equipements", filtre: { objets: ["radiateur"] } }),
  std("CVC-VOL", "Volume à traiter (CVC)", "cvc", "m3", { source: "volume" }),
  std("MOB-U", "Mobilier", "mobilier", "u", { source: "nombre_equipements", filtre: { categories: ["mobilier"] } }),
  std("PLO-U", "Équipements de plomberie", "plomberie", "u", { source: "nombre_equipements", filtre: { categories: ["plomberie"] } }),
  std("SOL-RAG", "Ragréage (4,5 kg/m² pour 3 mm)", "sols", "kg", { source: "surface_sol", operations: [{ op: "ratio_kg", valeur: 4.5 }] }, { arrondi: { mode: "superieur", pas: 25 }, commentaire: "Arrondi au sac de 25 kg, par pièce." }),
  std("DEM-CLO", "Démolition de cloisons", "demolition", "m2", { source: "surface_murs_plan" }, { etatTravaux: "a_deposer", etats: ["a_deposer"] }),
  std("DEP-POR", "Dépose de portes", "depose", "u", { source: "nombre_ouvertures", filtre: { typesOuverture: ["porte"] } }, { etatTravaux: "a_deposer", etats: ["a_deposer"] }),
  std("DEP-MOQ", "Dépose de moquette", "depose", "m2", { source: "quantite_revetement", filtre: { support: "sol", familles: ["moquette"] } }, { etatTravaux: "a_deposer", etats: ["a_deposer"] }),
  std("DEP-EQU", "Dépose d'équipements", "depose", "u", { source: "nombre_equipements" }, { etatTravaux: "a_deposer", etats: ["a_deposer", "deplace"] }),
  std("DIV-NET", "Nettoyage de fin de chantier", "autre", "forfait", { source: "forfait" }),
];
export const OUVRAGE_ETATS_TOUS = TOUS_ETATS;

// ── Synthèse par chantier / bâtiment / étage / zone / pièce / lot / ouvrage ───

export const QUANTITATIF_NIVEAUX = ["chantier", "batiment", "etage", "zone", "piece", "lot", "ouvrage"] as const;
export type QuantitatifNiveau = (typeof QUANTITATIF_NIVEAUX)[number];
export const QUANTITATIF_NIVEAU_LABELS: Record<QuantitatifNiveau, string> = {
  chantier: "Chantier", batiment: "Bâtiment", etage: "Étage", zone: "Zone", piece: "Pièce", lot: "Lot", ouvrage: "Ouvrage",
};

export type QuantitatifSource = { readonly etageId: string; readonly planId: string; readonly numero: number; readonly etat: PlanEtat; readonly figeLe: string | null; readonly quantitatif: PlanQuantitatif };

type Ref = { readonly id: string; readonly nom: string } | null;
/** Ligne enrichie : emplacement (chantier → pièce), ouvrage, plan. Quantités en milli-unités exactes. */
export type QuantitatifLigneDetail = {
  readonly ref: string;
  readonly planId: string;
  readonly ligne: QuantitatifLigne;
  readonly ouvrage: OuvrageRecord;
  /** Clé de regroupement d'ouvrage entre étages : code (sinon nom) + unité — jamais deux unités sommées. */
  readonly cle: string;
  readonly lot: string;
  readonly chantier: Ref; readonly batiment: Ref; readonly etage: Ref; readonly zone: Ref; readonly piece: Ref;
  readonly retenueMilli: bigint | null;
  readonly calculeeMilli: bigint | null;
  readonly anomalies: readonly QuantitatifAnomalie[];
};

export function ouvrageCle(ouvrage: Pick<OuvrageDonnees, "code" | "nom" | "unite">): string {
  return `${(ouvrage.code ?? ouvrage.nom).trim().toLocaleLowerCase("fr")}|${ouvrage.unite}`;
}
export function ouvrageLot(ouvrage: Pick<OuvrageDonnees, "lot" | "categorie">): string {
  return ouvrage.lot?.trim() || OUVRAGE_LOT_PAR_CATEGORIE[ouvrage.categorie];
}

/** Lignes détaillées d'un relevé : chaque ligne situe sa quantité dans la hiérarchie et sur son ouvrage. */
export function quantitatifDetails(structure: MetreStructure, sources: readonly QuantitatifSource[]): QuantitatifLigneDetail[] {
  const etages = new Map(structure.etages.map((e) => [e.id, e]));
  const batiments = new Map(structure.batiments.map((b) => [b.id, b]));
  const chantiers = new Map(structure.chantiers.map((c) => [c.id, c]));
  const zones = new Map(structure.zones.map((z) => [z.id, z]));
  const pieces = new Map(structure.pieces.map((p) => [p.id, p]));
  const out: QuantitatifLigneDetail[] = [];
  for (const source of sources) {
    const q = source.quantitatif;
    const ouvrages = new Map(q.ouvrages.map((o) => [o.id, o]));
    const etage = etages.get(source.etageId);
    const batiment = etage ? batiments.get(etage.batimentId) : undefined;
    const chantier = batiment ? chantiers.get(batiment.chantierId) : undefined;
    const anomaliesByKey = new Map<string, QuantitatifAnomalie[]>();
    for (const a of q.anomalies) {
      const key = `${a.ouvrageId}\u0000${a.pieceId ?? ""}\u0000${a.etatProjet ?? ""}`;
      anomaliesByKey.set(key, [...(anomaliesByKey.get(key) ?? []), a]);
    }
    for (const ligne of q.lignes) {
      const ouvrage = ouvrages.get(ligne.ouvrageId);
      if (!ouvrage) continue;
      const piece = ligne.pieceId ? pieces.get(ligne.pieceId) : undefined;
      const zone = piece?.zoneId ? zones.get(piece.zoneId) : undefined;
      out.push({
        ref: `${source.planId}:${ligne.ouvrageId}:${ligne.pieceId ?? `etage-${source.etageId}`}:${ligne.etatProjet}`,
        planId: source.planId, ligne, ouvrage, cle: ouvrageCle(ouvrage), lot: ouvrageLot(ouvrage),
        chantier: chantier ? { id: chantier.id, nom: chantier.nom } : null,
        batiment: batiment ? { id: batiment.id, nom: batiment.nom } : null,
        etage: etage ? { id: etage.id, nom: etage.nom } : null,
        zone: zone && !zone.deletedAt ? { id: zone.id, nom: zone.nom } : null,
        piece: piece ? { id: piece.id, nom: piece.nom } : null,
        retenueMilli: ligne.quantiteRetenue === null ? null : toMilli(ligne.quantiteRetenue),
        calculeeMilli: ligne.quantiteCalculee === null ? null : toMilli(ligne.quantiteCalculee),
        anomalies: anomaliesByKey.get(`${ligne.ouvrageId}\u0000${ligne.pieceId ?? ""}\u0000${ligne.etatProjet}`) ?? [],
      });
    }
  }
  return out;
}

export type QuantitatifParEtat = Record<EtatProjet, bigint>;
const emptyParEtat = (): QuantitatifParEtat => ({ existant: N0, a_deposer: N0, nouveau: N0, deplace: N0 });

/** Total d'un ouvrage (même clé, même unité) dans un groupe, par état projeté (milli-unités). */
export type QuantitatifTotal = {
  readonly cle: string; readonly nom: string; readonly categorie: OuvrageCategorie; readonly lot: string; readonly unite: OuvrageUnite;
  readonly parEtat: QuantitatifParEtat; total: bigint; lignes: number; ajustees: number; nonCalculables: number; erreurs: number; avertissements: number;
};
export type QuantitatifGroupe = { readonly cle: string; readonly libelle: string; readonly chemin: readonly string[]; readonly totaux: QuantitatifTotal[]; lignes: number };

/** Clé et libellé d'une ligne pour un niveau d'agrégation (l'étage porte les éléments partagés). */
function niveauCle(detail: QuantitatifLigneDetail, niveau: QuantitatifNiveau): { cle: string; libelle: string; chemin: string[] } {
  const c = detail.chantier?.nom ?? "—"; const b = detail.batiment?.nom ?? "—"; const e = detail.etage?.nom ?? "—";
  switch (niveau) {
    case "chantier": return { cle: detail.chantier?.id ?? "-", libelle: c, chemin: [c] };
    case "batiment": return { cle: detail.batiment?.id ?? "-", libelle: b, chemin: [c, b] };
    case "etage": return { cle: detail.etage?.id ?? "-", libelle: e, chemin: [c, b, e] };
    case "zone": return detail.zone
      ? { cle: detail.zone.id, libelle: detail.zone.nom, chemin: [c, b, e, detail.zone.nom] }
      : { cle: `hors-zone:${detail.etage?.id ?? "-"}`, libelle: `${e} · hors zone`, chemin: [c, b, e] };
    case "piece": return detail.piece
      ? { cle: detail.piece.id, libelle: detail.piece.nom, chemin: [c, b, e, ...(detail.zone ? [detail.zone.nom] : []), detail.piece.nom] }
      : { cle: `etage:${detail.etage?.id ?? "-"}`, libelle: `${e} · éléments d'étage`, chemin: [c, b, e] };
    case "lot": return { cle: detail.lot, libelle: detail.lot, chemin: [detail.lot] };
    case "ouvrage": return { cle: detail.cle, libelle: `${detail.ouvrage.nom} (${OUVRAGE_UNITE_LABELS[detail.ouvrage.unite]})`, chemin: [detail.ouvrage.nom] };
  }
}

/**
 * Agrégation par niveau (chantier, bâtiment, étage, zone, pièce, lot, ouvrage) : dans chaque groupe, un
 * total par ouvrage (clé + unité) et par état projeté, en milli-unités EXACTES (aucune somme flottante).
 * Quantités RETENUES (ajustements compris). Ordre : première apparition (ordre des plans et des lignes).
 */
export function agregerQuantitatif(details: readonly QuantitatifLigneDetail[], niveau: QuantitatifNiveau): QuantitatifGroupe[] {
  const groupes = new Map<string, QuantitatifGroupe & { index: Map<string, QuantitatifTotal> }>();
  for (const detail of details) {
    const { cle, libelle, chemin } = niveauCle(detail, niveau);
    const groupe = groupes.get(cle) ?? { cle, libelle, chemin, totaux: [] as QuantitatifTotal[], lignes: 0, index: new Map<string, QuantitatifTotal>() };
    groupe.lignes += 1;
    let total = groupe.index.get(detail.cle);
    if (!total) {
      total = { cle: detail.cle, nom: detail.ouvrage.nom, categorie: detail.ouvrage.categorie, lot: detail.lot, unite: detail.ouvrage.unite,
        parEtat: emptyParEtat(), total: N0, lignes: 0, ajustees: 0, nonCalculables: 0, erreurs: 0, avertissements: 0 };
      groupe.index.set(detail.cle, total); groupe.totaux.push(total);
    }
    total.lignes += 1;
    if (detail.ligne.ajustement) total.ajustees += 1;
    if (detail.retenueMilli === null) total.nonCalculables += 1;
    else { total.parEtat[detail.ligne.etatProjet] += detail.retenueMilli; total.total += detail.retenueMilli; }
    for (const a of detail.anomalies) { if (a.gravite === "erreur") total.erreurs += 1; else total.avertissements += 1; }
    groupes.set(cle, groupe);
  }
  return [...groupes.values()].map((groupe) => ({ cle: groupe.cle, libelle: groupe.libelle, chemin: groupe.chemin, totaux: groupe.totaux, lignes: groupe.lignes }));
}

/** Existant conservé / à déposer / à créer / déplacé d'un total. */
export function syntheseTravaux(total: Pick<QuantitatifTotal, "parEtat">): { conservee: bigint; aDeposer: bigint; aCreer: bigint; deplacee: bigint } {
  return { conservee: total.parEtat.existant, aDeposer: total.parEtat.a_deposer, aCreer: total.parEtat.nouveau, deplacee: total.parEtat.deplace };
}

/** « 31,164 m² », « 29,68 m² », « 8 u » : exact (3 décimales au plus), sans flottant. */
export function formatQuantiteOuvrage(milli: bigint | number | null, unite: OuvrageUnite): string {
  if (milli === null) return "non calculable";
  const text = milliText(milli);
  const [whole, frac] = text.split(".");
  const negative = whole.startsWith("-");
  const grouped = (negative ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  let decimalsText = frac.replace(/0+$/, "");
  if (unite !== "u" && unite !== "forfait" && decimalsText.length < 2) decimalsText = decimalsText.padEnd(2, "0");
  return `${negative ? "-" : ""}${grouped}${decimalsText ? `,${decimalsText}` : ""} ${OUVRAGE_UNITE_LABELS[unite]}`;
}

// ── Exports : CSV et contrat Gestion Pro ──────────────────────────────────────

// Injection de formule (Excel / LibreOffice) : une cellule TEXTE commençant par = + - @
// tabulation ou retour chariot est neutralisée par une apostrophe de tête, puis citée.
// Les nombres au format d'échange (« -1,25 », « 1 250,5 ») restent tels quels.
const NOMBRE_CSV = /^-?\d[\d\u00a0\u202f ]*(?:,\d+)?$/;
const csvCell = (value: string) => {
  if (/^[=+\-@\t\r]/.test(value) && !NOMBRE_CSV.test(value)) return `"'${value.replace(/"/g, '""')}"`;
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};
const csvNumber = (milli: bigint | null) => (milli === null ? "" : milliText(milli).replace(".", ","));

export const QUANTITATIF_CSV_COLUMNS = [
  "Chantier", "Bâtiment", "Étage", "Zone", "Pièce", "Lot", "Catégorie", "Code", "Ouvrage", "Unité", "Quantité retenue", "Quantité calculée",
  "Ajustée", "Raison de l'ajustement", "Source", "Formule", "État projeté", "Origine", "Annotations", "Anomalies",
] as const;

/** CSV (Excel FR : `;`, décimale virgule, BOM UTF-8) : une ligne par (ouvrage, pièce, état), quantités exactes. */
export function quantitatifToCsv(details: readonly QuantitatifLigneDetail[]): string {
  const rows = [QUANTITATIF_CSV_COLUMNS.join(";")];
  for (const d of details) {
    const l = d.ligne;
    rows.push([
      d.chantier?.nom ?? "", d.batiment?.nom ?? "", d.etage?.nom ?? "", d.zone?.nom ?? "", d.piece?.nom ?? (l.annotations.includes("partage") ? "(partagé entre pièces)" : "(étage)"),
      d.lot, OUVRAGE_CATEGORIE_LABELS[d.ouvrage.categorie], d.ouvrage.code ?? "", d.ouvrage.nom, OUVRAGE_UNITE_LABELS[d.ouvrage.unite],
      csvNumber(d.retenueMilli), csvNumber(d.calculeeMilli), l.ajustement ? "oui" : "non", l.ajustement?.raison ?? (d.retenueMilli === null ? "Non calculable" : ""),
      OUVRAGE_SOURCE_LABELS[l.source], formuleTexte(d.ouvrage), ETAT_PROJET_LABELS[l.etatProjet], ouvrageOrigine(d.ouvrage) === "auto" ? "Automatique" : "Manuelle",
      l.annotations.join(", "), d.anomalies.map((a) => QUANTITATIF_ANOMALIE_LABELS[a.code]).join(", "),
    ].map(csvCell).join(";"));
  }
  return `﻿${rows.join("\r\n")}\r\n`;
}

/** Contrat de transfert des quantités vers Gestion Pro — version EXPLICITE, semver. */
export const QUANTITATIF_GP_CONTRACT = { name: "elsatia.tools.quantitatif", version: "1.0.0" } as const;
/** Préparé, non branché : aucune écriture GP, aucun devis créé automatiquement. */
export const QUANTITATIF_GP_READINESS = { status: "contract-only", devis: "not-generated" } as const;

export type QuantitatifGpPayload = {
  readonly contract: typeof QUANTITATIF_GP_CONTRACT;
  readonly kind: "releve-metre/quantitatif";
  readonly readiness: typeof QUANTITATIF_GP_READINESS;
  /** Même relevé, même état, mêmes plans (numéro, gel) et mêmes ouvrages / ajustements → même clé. */
  readonly idempotencyKey: string;
  readonly source: {
    readonly releveId: string; readonly etat: MetreSyntheseEtat; readonly moteur: "quantitatif-v1";
    readonly plans: readonly { readonly etageId: string; readonly planId: string; readonly numero: number; readonly fige: boolean; readonly source: string }[];
  };
  /** Unités d'échange : aucune conversion côté GP (les quantités sont déjà dans l'unité de l'ouvrage). */
  readonly unites: readonly OuvrageUnite[];
  readonly ouvrages: readonly {
    readonly ref: string; readonly planRef: string; readonly cle: string; readonly code: string | null; readonly nom: string; readonly categorie: OuvrageCategorie;
    readonly lot: string; readonly unite: OuvrageUnite; readonly source: OuvrageSource; readonly formule: string; readonly pertePourcent: string;
    readonly arrondi: OuvrageArrondi; readonly origine: OuvrageOrigine; readonly commentaire: string | null;
  }[];
  /** Quantités en décimal EXACT (chaîne, 3 décimales) : GP ne recalcule aucune géométrie. */
  readonly lignes: readonly {
    readonly ref: string; readonly ouvrageRef: string; readonly unite: OuvrageUnite; readonly quantite: string | null; readonly quantiteCalculee: string | null;
    readonly ajustee: boolean; readonly raisonAjustement: string | null; readonly source: OuvrageSource; readonly etatProjet: EtatProjet;
    readonly emplacement: { readonly chantier: Ref; readonly batiment: Ref; readonly etage: Ref; readonly zone: Ref; readonly piece: Ref };
    readonly annotations: readonly string[];
  }[];
  readonly totaux: readonly { readonly cle: string; readonly nom: string; readonly lot: string; readonly unite: OuvrageUnite; readonly parEtat: Record<EtatProjet, string>; readonly total: string }[];
  readonly anomalies: readonly { readonly code: QuantitatifAnomalieCode; readonly gravite: QuantitatifAnomalieGravite; readonly ouvrageRef: string; readonly pieceRef: string | null; readonly etatProjet: EtatProjet | null; readonly message: string }[];
};

export function buildQuantitatifGpPayload(releveId: string, etat: MetreSyntheseEtat, sources: readonly QuantitatifSource[], details: readonly QuantitatifLigneDetail[]): QuantitatifGpPayload {
  const ouvrages = sources.flatMap((source) => source.quantitatif.ouvrages.map((o) => ({
    ref: o.id, planRef: source.planId, cle: ouvrageCle(o), code: o.code ?? null, nom: o.nom, categorie: o.categorie, lot: ouvrageLot(o), unite: o.unite,
    source: o.regle.source, formule: formuleTexte(o), pertePourcent: decimalString(o.pertePourcent), arrondi: o.arrondi, origine: ouvrageOrigine(o), commentaire: o.commentaire ?? null,
  })));
  const lignes = details.map((d) => ({
    ref: d.ref, ouvrageRef: d.ouvrage.id, unite: d.ouvrage.unite, quantite: d.retenueMilli === null ? null : milliText(d.retenueMilli),
    quantiteCalculee: d.calculeeMilli === null ? null : milliText(d.calculeeMilli), ajustee: !!d.ligne.ajustement, raisonAjustement: d.ligne.ajustement?.raison ?? null,
    source: d.ligne.source, etatProjet: d.ligne.etatProjet,
    emplacement: { chantier: d.chantier, batiment: d.batiment, etage: d.etage, zone: d.zone, piece: d.piece }, annotations: [...d.ligne.annotations],
  }));
  const totaux = (agregerQuantitatif(details, "ouvrage")).flatMap((groupe) => groupe.totaux.map((t) => ({
    cle: t.cle, nom: t.nom, lot: t.lot, unite: t.unite, total: milliText(t.total),
    parEtat: { existant: milliText(t.parEtat.existant), a_deposer: milliText(t.parEtat.a_deposer), nouveau: milliText(t.parEtat.nouveau), deplace: milliText(t.parEtat.deplace) },
  })));
  const anomalies = sources.flatMap((source) => source.quantitatif.anomalies.map((a) => ({
    code: a.code, gravite: a.gravite, ouvrageRef: a.ouvrageId, pieceRef: a.pieceId, etatProjet: a.etatProjet, message: a.message,
  })));
  const plans = sources.map((source) => ({ etageId: source.etageId, planId: source.planId, numero: source.numero, fige: source.figeLe !== null, source: source.quantitatif.source ?? "calcul" }));
  // Empreinte stable du contenu transmis (quantités retenues comprises) : un nouvel ajustement change la clé.
  const empreinte = fnv1a(JSON.stringify(lignes.map((l) => [l.ref, l.quantite])));
  return {
    contract: QUANTITATIF_GP_CONTRACT, kind: "releve-metre/quantitatif", readiness: QUANTITATIF_GP_READINESS,
    idempotencyKey: `${releveId}:${etat}:${plans.map((plan) => `${plan.planId}#${plan.numero}${plan.fige ? "F" : ""}`).sort().join(",")}:${empreinte}`,
    source: { releveId, etat, moteur: "quantitatif-v1", plans }, unites: OUVRAGE_UNITES, ouvrages, lignes, totaux, anomalies,
  };
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Contrôle d'un contrat reçu (côté Gestion Pro) : version majeure 1, unités connues, quantités en
 * décimal exact, références résolues, AUCUN prix. Retourne la liste des défauts (vide = recevable).
 */
export function validateQuantitatifGpPayload(payload: unknown): string[] {
  const issues: string[] = [];
  if (!isObject(payload)) return ["contrat absent"];
  const p = payload as Record<string, Json>;
  const contract = p.contract as Record<string, Json> | undefined;
  if (!isObject(contract) || contract.name !== QUANTITATIF_GP_CONTRACT.name || typeof contract.version !== "string" || !/^1\.\d+\.\d+$/.test(contract.version)) issues.push("version de contrat non prise en charge");
  if (PRICE_KEY.test(JSON.stringify(payload))) issues.push("prix interdit dans le contrat");
  const ouvrages = Array.isArray(p.ouvrages) ? (p.ouvrages as Record<string, Json>[]) : [];
  const refs = new Set(ouvrages.map((o) => o.ref));
  if (refs.size !== ouvrages.length) issues.push("références d'ouvrage non uniques");
  const lignes = Array.isArray(p.lignes) ? (p.lignes as Record<string, Json>[]) : [];
  const lineRefs = new Set<unknown>();
  for (const l of lignes) {
    if (lineRefs.has(l.ref)) issues.push(`ligne en double : ${String(l.ref)}`);
    lineRefs.add(l.ref);
    if (!refs.has(l.ouvrageRef)) issues.push(`ligne ${String(l.ref)} : ouvrage inconnu`);
    if (!(OUVRAGE_UNITES as readonly string[]).includes(l.unite as string)) issues.push(`ligne ${String(l.ref)} : unité inconnue`);
    if (l.quantite !== null && (typeof l.quantite !== "string" || !/^-?\d+\.\d{3}$/.test(l.quantite))) issues.push(`ligne ${String(l.ref)} : quantité non décimale`);
    if (!(ETATS_PROJET as readonly string[]).includes(l.etatProjet as string)) issues.push(`ligne ${String(l.ref)} : état projeté inconnu`);
  }
  if (!isObject(p.readiness) || (p.readiness as Record<string, Json>).devis !== "not-generated") issues.push("aucun devis ne doit être généré par le contrat");
  return issues;
}

// ── Port de persistance ───────────────────────────────────────────────────────

export type BibliothequeOuvrage = { readonly id: string; readonly donnees: Omit<OuvrageDonnees, "pieceIds">; readonly revision: number; readonly updatedAt?: string };

export interface ReleveQuantitatifRepository {
  planQuantitatif(planId: string): Promise<PlanQuantitatif>;
  synthese(releveId: string, etat: MetreSyntheseEtat): Promise<QuantitatifSource[]>;
  saveOuvrage(planId: string, id: string, donnees: OuvrageDonnees, bibliothequeId?: string | null): Promise<void>;
  importOuvrages(planId: string, ouvrages: readonly { id: string; donnees: OuvrageDonnees; bibliothequeId?: string | null }[]): Promise<number>;
  deleteOuvrage(planId: string, id: string): Promise<void>;
  ajuster(planId: string, cible: { ouvrageId: string; pieceId: string | null; etatProjet: EtatProjet }, valeurRetenue: number, raison: string): Promise<void>;
  retirerAjustement(id: string, raison: string | null): Promise<void>;
  bibliotheque(releveId: string): Promise<BibliothequeOuvrage[]>;
  saveBibliotheque(releveId: string, id: string, donnees: Omit<OuvrageDonnees, "pieceIds">): Promise<void>;
  deleteBibliotheque(releveId: string, id: string): Promise<void>;
}
