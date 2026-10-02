/**
 * Lot 10 — Estimation simplifiée (miroir des migrations 20260930001401 et 20260930001402).
 *
 * TOOLS = estimation simplifiée, HT, estimative ; GESTION PRO = chiffrage complet (prix de vente, marge, remise,
 * TVA, devis). Aucun numéro de devis, aucune facture, aucune commande, aucune signature, aucun workflow devis.
 *
 * Règles (voir le rapport Lot 10) :
 * - le quantitatif du Lot 9 reste sans prix ; un PRIX ESTIMATIF facultatif est attaché à un ouvrage de plan
 *   (couche séparée) : composantes structurées MATÉRIAU (€/unité), MAIN D'ŒUVRE (heures/unité × taux horaire),
 *   FORFAIT (montant fixe par ouvrage), AUTRE (€/unité), et un coefficient simple (0,01 à 10) ;
 * - la quantité estimée est la quantité RETENUE du quantitatif : pertes et arrondis du Lot 9 déjà appliqués,
 *   la perte n'est jamais réappliquée ;
 * - arithmétique entière (quantité 1e-3, prix 1e-4 €, heures 1e-4 h, taux et forfait 1e-2 €, coefficient 1e-4),
 *   arrondi « moitié loin de zéro » au centime PAR COMPOSANTE et par ligne ; montant de ligne = somme des
 *   composantes ; sous-totaux = sommes de lignes : aucun écart d'arrondi entre lignes et totaux ;
 * - une correction manuelle ne remplace jamais le montant automatique : elle porte le montant retenu, la raison,
 *   l'auteur et la date ; elle devient « obsolète » si le montant automatique change ;
 * - un ouvrage sans prix reste exploitable en quantitatif : il n'entre simplement pas dans le total estimé ;
 * - (1402) coefficients facultatifs : ouvrage > lot > général (le plus précis l'emporte, jamais cumulés) ; une correction
 *   mémorise sa valeur source et devient obsolète si la QUANTITÉ change ; hypothèses transmises à Gestion Pro.
 */

import type { EtatProjet, MetreEtageSource, MetreStructure, MetreSyntheseEtat } from "./metre";
import { ETAT_PROJET_LABELS, ETATS_PROJET, REVETEMENT_FAMILLE_LABELS, REVETEMENT_SUPPORT_LABELS } from "./metre";
import type { PlanEtat } from "./plan";
import {
  buildQuantitatifGpPayload, decimalString, milliText, niveauCle, OUVRAGE_CATEGORIE_LABELS, OUVRAGE_UNITE_LABELS, ouvrageCle, ouvrageLot, planQuantitatifFromJson, rdiv, scaled, toMilli,
  validateQuantitatifGpPayload,
  type OuvrageCategorie, type OuvrageRecord, type OuvrageUnite, type PlanQuantitatif, type QuantitatifGpPayload, type QuantitatifLigneDetail, type QuantitatifNiveau,
  type QuantitatifSource,
} from "./quantitatif";

// ── Énumérations (parité SQL testée) ──────────────────────────────────────────

export const PRIX_TYPES = ["materiau", "main_d_oeuvre", "forfait", "autre"] as const;
export type PrixType = (typeof PRIX_TYPES)[number];
export const PRIX_TYPE_LABELS: Record<PrixType, string> = { materiau: "Matériau", main_d_oeuvre: "Main d'œuvre", forfait: "Forfait", autre: "Autre" };

export const PRIX_LIMITS = { composantes: 12, libelle: 120, commentaire: 500, import: 2000 } as const;

export type PrixComposante =
  | { readonly type: "materiau" | "autre"; readonly libelle?: string | null; readonly prixUnitaire: number }
  | { readonly type: "main_d_oeuvre"; readonly libelle?: string | null; readonly heuresParUnite: number; readonly tauxHoraire: number }
  | { readonly type: "forfait"; readonly libelle?: string | null; readonly montant: number };

/** Prix estimatif d'un ouvrage (JSON stocké, identique au contrat SQL). HT, estimatif, sans TVA ni marge. */
export type PrixDonnees = {
  readonly composantes: readonly PrixComposante[];
  /** Coefficient simple (difficulté, accès…) appliqué à toutes les composantes ; 1 par défaut. */
  readonly coefficient?: number | null;
  readonly commentaire?: string | null;
};

export const PRIX_ISSUE_CODES = ["invalide", "cle", "composantes", "type", "libelle", "heures", "taux", "forfait", "prix_unitaire", "coefficient", "commentaire"] as const;
export type PrixIssueCode = (typeof PRIX_ISSUE_CODES)[number];
export const PRIX_ISSUE_MESSAGES: Record<PrixIssueCode, string> = {
  invalide: "Prix estimatif invalide.",
  cle: "Donnée inconnue : l'estimation Tools est simplifiée et HT (prix de vente, marge, remise, TVA et devis relèvent de Gestion Pro).",
  composantes: "Prix : 1 à 12 composantes (matériau, main d'œuvre, forfait, autre).",
  type: "Type de prix inconnu (matériau, main d'œuvre, forfait, autre).",
  libelle: "Libellé de composante : 120 caractères au plus.",
  heures: "Heures par unité : entre 0 et 10 000, quatre décimales au plus.",
  taux: "Taux horaire : entre 0 et 10 000 € HT, deux décimales au plus.",
  forfait: "Forfait : entre 0 et 100 000 000 € HT, deux décimales au plus.",
  prix_unitaire: "Prix unitaire : entre 0 et 1 000 000 € HT, quatre décimales au plus.",
  coefficient: "Coefficient : entre 0,01 et 10, quatre décimales au plus.",
  commentaire: "Commentaire : 500 caractères au plus.",
};

type Json = unknown;
const isObject = (value: Json): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);
const isPresent = (obj: Record<string, Json>, key: string) => key in obj && obj[key] !== null && obj[key] !== undefined;
function decimals(value: number): number {
  const s = decimalString(value);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}
/** Miroir de `tools_releve_qt_decimal_valide`. */
function decimalValide(value: Json, maxDecimales: number, min: number, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && decimals(value) <= maxDecimales;
}
const CLES_COMPOSANTE: Record<PrixType, readonly string[]> = {
  materiau: ["type", "libelle", "prixUnitaire"], autre: ["type", "libelle", "prixUnitaire"],
  main_d_oeuvre: ["type", "libelle", "heuresParUnite", "tauxHoraire"], forfait: ["type", "libelle", "montant"],
};

/** Miroir exact de `tools_releve_prix_anomalie` : premier défaut rencontré, `null` si le prix est valide. */
export function prixAnomalie(input: Json): PrixIssueCode | null {
  if (!isObject(input)) return "invalide";
  if (Object.keys(input).some((k) => !["composantes", "coefficient", "commentaire"].includes(k))) return "cle";
  const composantes = input.composantes;
  if (!Array.isArray(composantes) || composantes.length < 1 || composantes.length > PRIX_LIMITS.composantes) return "composantes";
  for (const c of composantes) {
    if (!isObject(c)) return "composantes";
    const t = c.type;
    if (typeof t !== "string" || !(PRIX_TYPES as readonly string[]).includes(t)) return "type";
    if (Object.keys(c).some((k) => !CLES_COMPOSANTE[t as PrixType].includes(k))) return "cle";
    if (isPresent(c, "libelle") && (typeof c.libelle !== "string" || [...c.libelle].length > PRIX_LIMITS.libelle)) return "libelle";
    if (t === "main_d_oeuvre") {
      if (!decimalValide(c.heuresParUnite, 4, 0, 10000)) return "heures";
      if (!decimalValide(c.tauxHoraire, 2, 0, 10000)) return "taux";
    } else if (t === "forfait") {
      if (!decimalValide(c.montant, 2, 0, 100000000)) return "forfait";
    } else if (!decimalValide(c.prixUnitaire, 4, 0, 1000000)) return "prix_unitaire";
  }
  if (isPresent(input, "coefficient") && !decimalValide(input.coefficient, 4, 0.01, 10)) return "coefficient";
  if (isPresent(input, "commentaire") && (typeof input.commentaire !== "string" || [...input.commentaire].length > PRIX_LIMITS.commentaire)) return "commentaire";
  return null;
}

/** Saisie rapide : un prix unitaire global simplifié, conservé comme UNE composante typée (données structurées). */
export function prixGlobal(prixUnitaire: number, type: Exclude<PrixType, "forfait" | "main_d_oeuvre"> = "autre", libelle = "Prix unitaire global"): PrixDonnees {
  return { composantes: [{ type, libelle, prixUnitaire }] };
}

// ── Arithmétique ──────────────────────────────────────────────────────────────

const N0 = BigInt(0);
const N100 = BigInt(100);
const E4 = BigInt(10000);
const E6 = BigInt(1000000);
const E8 = BigInt(100000000);
const E9 = BigInt(1000000000);
const E11 = BigInt(100000000000);

/** Coefficient d'un prix en 1e-4 (1 par défaut). */
const coefficientScaled = (donnees: PrixDonnees): bigint => scaled(donnees.coefficient ?? 1, 4);

/** Prix unitaire composite (hors forfait), 1e-4 € HT / unité, coefficient compris ; `null` sans composante unitaire. */
export function prixUnitaireComposite(donnees: PrixDonnees): bigint | null {
  const unit = donnees.composantes.filter((c) => c.type !== "forfait");
  if (unit.length === 0) return null;
  let s = N0;
  for (const c of unit) s += c.type === "main_d_oeuvre" ? scaled(c.heuresParUnite, 4) * scaled(c.tauxHoraire, 2) : scaled(c.prixUnitaire, 4) * N100;
  return rdiv(s * coefficientScaled(donnees), E6);
}
/** Montant forfaitaire d'un prix (centimes), coefficient compris. */
export function forfaitCentimes(donnees: PrixDonnees): bigint {
  const c = coefficientScaled(donnees);
  let total = N0;
  for (const comp of donnees.composantes) if (comp.type === "forfait") total += rdiv(scaled(comp.montant, 2) * c, E4);
  return total;
}

// ── Évaluation (miroir de `tools_releve_estimation_evaluer`) ──────────────────

export type EstimationNature = "quantite" | "forfait";
export type EstimationAjustementEntree = {
  readonly id: string; readonly ouvrageId: string; readonly pieceId: string | null; readonly etatProjet: EtatProjet; readonly nature?: EstimationNature;
  readonly valeurCalculee: number | null; readonly valeurRetenue: number; readonly raison: string; readonly auteurId?: string | null; readonly date?: string | null;
  /**
   * Quantité de la ligne au moment de la correction (valeur source, migration 1402). Présente : la correction devient
   * obsolète si la quantité change, même à montant automatique égal. Absente (correction antérieure) : règle du 1401.
   */
  readonly quantiteSource?: number | null;
};
export type EstimationEntree = {
  readonly ouvrages: readonly Pick<OuvrageRecord, "id" | "etatTravaux">[];
  readonly lignes: readonly { readonly ouvrageId: string; readonly pieceId: string | null; readonly etatProjet: EtatProjet; readonly unite: OuvrageUnite; readonly quantiteRetenue: number | null }[];
  readonly prix?: readonly { readonly ouvrageId: string; readonly donnees: PrixDonnees }[];
  readonly ajustements?: readonly EstimationAjustementEntree[];
};

export type EstimationAjustement = {
  readonly id: string; readonly valeurCalculee: number | null; readonly valeurRetenue: number; readonly raison: string;
  readonly auteurId: string | null; readonly date: string | null;
  /** Le montant automatique OU la quantité ont changé depuis la correction : le montant retenu est à revoir. */
  readonly perime: boolean;
  /** Quantité source (présente si la correction l'a mémorisée). */
  readonly quantiteSource?: number | null;
  /** Motif d'obsolescence : la quantité a changé (prioritaire) ou le montant automatique a changé. */
  readonly motifPerime?: "quantite" | "montant" | null;
};
export type EstimationLigne = {
  readonly ouvrageId: string;
  readonly pieceId: string | null;
  readonly etatProjet: EtatProjet;
  /** `quantite` : ligne du quantitatif ; `forfait` : composantes forfaitaires de l'ouvrage (une ligne par ouvrage). */
  readonly nature: EstimationNature;
  readonly unite: OuvrageUnite;
  /** Quantité RETENUE du quantitatif (pertes du Lot 9 comprises), 3 décimales ; `null` : non calculable. */
  readonly quantite: number | null;
  readonly prixDefini: boolean;
  /** Prix unitaire composite HT (4 décimales), coefficient compris. */
  readonly prixUnitaire: number | null;
  readonly materiau: number | null;
  readonly mainOeuvre: number | null;
  readonly forfait: number | null;
  readonly autre: number | null;
  /** Heures estimées (3 décimales) : heures par unité × quantité × coefficient. */
  readonly heures: number | null;
  /** Montant automatique HT (somme des composantes arrondies au centime). */
  readonly montantCalcule: number | null;
  readonly ajustement: EstimationAjustement | null;
  /** Montant RETENU : la correction si elle existe, sinon le montant automatique. */
  readonly montantRetenu: number | null;
};

export const ESTIMATION_ANOMALIE_CODES = ["prix_invalide", "ajustement_orphelin", "quantite_non_calculable", "estimation_obsolete", "prix_absent"] as const;
export type EstimationAnomalieCode = (typeof ESTIMATION_ANOMALIE_CODES)[number];
export const ESTIMATION_ANOMALIE_LABELS: Record<EstimationAnomalieCode, string> = {
  prix_invalide: "Prix invalide", ajustement_orphelin: "Correction orpheline", quantite_non_calculable: "Quantité non calculable",
  estimation_obsolete: "Estimation obsolète", prix_absent: "Sans prix",
};
export type EstimationAnomalieGravite = "erreur" | "avertissement" | "info";
export type EstimationAnomalie = {
  readonly code: EstimationAnomalieCode; readonly gravite: EstimationAnomalieGravite; readonly ouvrageId: string; readonly pieceId: string | null;
  readonly etatProjet: EtatProjet | null; readonly nature: EstimationNature | null; readonly detail: string; readonly message: string;
};
export function estimationAnomalieMessage(code: EstimationAnomalieCode, detail: string): string {
  switch (code) {
    case "prix_invalide": return PRIX_ISSUE_MESSAGES[detail as PrixIssueCode] ?? PRIX_ISSUE_MESSAGES.invalide;
    case "prix_absent": return "Sans prix : l'ouvrage reste exploitable en quantitatif, il n'entre pas dans le total estimé.";
    case "quantite_non_calculable": return "Quantité non calculable : le coût de cette ligne ne peut pas être estimé.";
    case "estimation_obsolete": return detail === "quantite_modifiee"
      ? "Estimation obsolète : la quantité a changé depuis la correction, montant retenu à revoir."
      : "Estimation obsolète : le montant automatique a changé depuis la correction, montant retenu à revoir.";
    case "ajustement_orphelin": return "Correction sans ligne correspondante (ouvrage, pièce ou prix disparu).";
  }
}

export type EstimationParType = { readonly materiau: number; readonly main_d_oeuvre: number; readonly forfait: number; readonly autre: number };
export type EstimationTotaux = {
  readonly montant: number;
  readonly parEtat: Record<EtatProjet, number>;
  readonly parType: EstimationParType;
  /** Somme des corrections (retenu − automatique) : montant = Σ parType + écart. */
  readonly ecartAjustements: number;
  readonly heures: number;
  readonly lignes: number; readonly lignesChiffrees: number; readonly lignesSansPrix: number; readonly lignesAjustees: number;
};
export type EstimationResultat = { readonly moteur: "estimation-v1"; readonly lignes: readonly EstimationLigne[]; readonly anomalies: readonly EstimationAnomalie[]; readonly totaux: EstimationTotaux };

const cmpC = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
};
const posNullsFirst = (list: readonly string[], value: string | null) => (value === null ? -1 : list.indexOf(value));
const cents = (value: bigint | null): number | null => (value === null ? null : Number(value) / 100);

/**
 * Estimation d'un plan : lignes (ouvrage × pièce × état × nature), anomalies et totaux, dans l'ordre total du
 * serveur. Fonction pure : mêmes entrées → mêmes sorties.
 */
export function evaluerEstimation(entree: EstimationEntree): EstimationResultat {
  const ouv = entree.ouvrages.map((o, idx) => ({ id: o.id, idx, etatTravaux: o.etatTravaux }));
  const ouvIdx = new Map<string, (typeof ouv)[number]>();
  for (const o of ouv) if (!ouvIdx.has(o.id)) ouvIdx.set(o.id, o);
  const pxFirst = new Map<string, { d: PrixDonnees; code: PrixIssueCode | null }>();
  for (const p of entree.prix ?? []) if (!pxFirst.has(p.ouvrageId)) pxFirst.set(p.ouvrageId, { d: p.donnees, code: prixAnomalie(p.donnees) });
  type Pxu = { coef: bigint; unit: PrixComposante[]; nMo: number; nForfait: number; pu4: bigint | null; forfait: bigint };
  const pxu = new Map<string, Pxu>();
  for (const [id, p] of pxFirst) {
    if (p.code !== null || !ouvIdx.has(id)) continue;
    const unit = p.d.composantes.filter((c) => c.type !== "forfait");
    pxu.set(id, {
      coef: coefficientScaled(p.d), unit, nMo: unit.filter((c) => c.type === "main_d_oeuvre").length, nForfait: p.d.composantes.length - unit.length,
      pu4: prixUnitaireComposite(p.d), forfait: forfaitCentimes(p.d),
    });
  }

  type L = { idx: number; nat: number; lo: number; ouvrageId: string; pieceId: string | null; etat: EtatProjet; nature: EstimationNature; unite: OuvrageUnite;
    q: bigint | null; prixDefini: boolean; pu4: bigint | null; sansMontant: boolean; mat: bigint; mo: bigint; forf: bigint; autre: bigint; mh: bigint | null; mc: bigint | null };
  const lignes: L[] = [];
  entree.lignes.forEach((l, i) => {
    const o = ouvIdx.get(l.ouvrageId);
    if (!o) return;
    const q = l.quantiteRetenue === null || l.quantiteRetenue === undefined ? null : scaled(l.quantiteRetenue, 3);
    const p = pxu.get(l.ouvrageId);
    let mat = N0; let mo = N0; let autre = N0; let mh = N0;
    if (p && q !== null) {
      for (const c of p.unit) {
        if (c.type === "main_d_oeuvre") {
          const h = scaled(c.heuresParUnite, 4); const tx = scaled(c.tauxHoraire, 2);
          mo += rdiv(q * h * tx * p.coef, E11);
          mh += rdiv(q * h * p.coef, E8);
        } else if (c.type !== "forfait") {
          const cc = rdiv(q * scaled(c.prixUnitaire, 4) * p.coef, E9);
          if (c.type === "materiau") mat += cc; else autre += cc;
        }
      }
    }
    const sansMontant = !p || (q === null && p.unit.length > 0);
    lignes.push({
      idx: o.idx, nat: 0, lo: i + 1, ouvrageId: l.ouvrageId, pieceId: l.pieceId ?? null, etat: l.etatProjet, nature: "quantite", unite: l.unite, q,
      prixDefini: !!p, pu4: p && p.unit.length > 0 ? p.pu4 : null, sansMontant, mat, mo, forf: N0, autre,
      mh: p && p.nMo > 0 && q !== null ? mh : null, mc: sansMontant ? null : mat + mo + autre,
    });
  });
  for (const o of ouv) {
    const p = pxu.get(o.id);
    if (!p || p.nForfait === 0 || ouvIdx.get(o.id) !== o) continue;
    lignes.push({
      idx: o.idx, nat: 1, lo: 0, ouvrageId: o.id, pieceId: null, etat: o.etatTravaux, nature: "forfait", unite: "forfait", q: BigInt(1000), prixDefini: true,
      pu4: p.forfait * N100, sansMontant: false, mat: N0, mo: N0, forf: p.forfait, autre: N0, mh: null, mc: p.forfait,
    });
  }
  lignes.sort((a, b) => a.idx - b.idx || a.nat - b.nat || a.lo - b.lo);

  const aj = (entree.ajustements ?? []).map((a) => {
    // Miroir de `a.value ? 'quantiteSource'` : la clé présente suffit (valeur nulle comprise).
    const suiviQte = Object.prototype.hasOwnProperty.call(a, "quantiteSource") && a.quantiteSource !== undefined;
    const qs = typeof a.quantiteSource === "number" ? scaled(a.quantiteSource, 3) : null;
    return { a, nature: a.nature ?? "quantite", pieceId: a.pieceId ?? null, suiviQte, qs };
  });
  const key = (ouvrageId: string, pieceId: string | null, etat: string, nature: string) => `${ouvrageId}\u0000${pieceId ?? "\u0001"}\u0000${etat}\u0000${nature}`;
  const ajByKey = new Map<string, (typeof aj)[number]>();
  for (const item of aj) { const k = key(item.a.ouvrageId, item.pieceId, item.a.etatProjet, item.nature); if (!ajByKey.has(k)) ajByKey.set(k, item); }
  const lineKeys = new Set(lignes.map((l) => key(l.ouvrageId, l.pieceId, l.etat, l.nature)));

  type A = { idx: number; ouvrageId: string; pieceId: string | null; etat: EtatProjet | null; nature: EstimationNature | null; code: EstimationAnomalieCode; detail: string; gravite: EstimationAnomalieGravite };
  const anomalies: A[] = [];
  for (const [id, p] of pxFirst) {
    const o = ouvIdx.get(id);
    if (o && p.code !== null) anomalies.push({ idx: o.idx, ouvrageId: id, pieceId: null, etat: null, nature: null, code: "prix_invalide", detail: p.code, gravite: "erreur" });
  }
  for (const o of ouv) if (!pxFirst.has(o.id)) anomalies.push({ idx: o.idx, ouvrageId: o.id, pieceId: null, etat: null, nature: null, code: "prix_absent", detail: "sans_prix", gravite: "info" });

  let tMontant = N0; let tMat = N0; let tMo = N0; let tForf = N0; let tAutre = N0; let tEcart = N0; let tH = N0;
  const tEtat: Record<EtatProjet, bigint> = { existant: N0, a_deposer: N0, nouveau: N0, deplace: N0 };
  let nChiffrees = 0; let nSansPrix = 0; let nAjustees = 0;
  const out: EstimationLigne[] = lignes.map((l) => {
    const match = ajByKey.get(key(l.ouvrageId, l.pieceId, l.etat, l.nature));
    const a = match?.a;
    const perimeMontant = a ? (a.valeurCalculee === null || a.valeurCalculee === undefined ? l.mc !== null : l.mc === null || scaled(a.valeurCalculee, 2) !== l.mc || !exactCents(a.valeurCalculee)) : false;
    const perimeQte = !!a && !!match?.suiviQte && match.qs !== l.q;
    const perime = perimeMontant || perimeQte;
    const mr = a ? scaled(a.valeurRetenue, 2) : l.mc;
    if (l.prixDefini && l.mc === null) anomalies.push({ idx: l.idx, ouvrageId: l.ouvrageId, pieceId: l.pieceId, etat: l.etat, nature: l.nature, code: "quantite_non_calculable", detail: "quantite", gravite: "avertissement" });
    if (a && perime) anomalies.push({ idx: l.idx, ouvrageId: l.ouvrageId, pieceId: l.pieceId, etat: l.etat, nature: l.nature, code: "estimation_obsolete", detail: perimeQte ? "quantite_modifiee" : "ajustement_perime", gravite: "avertissement" });
    if (mr !== null) { tMontant += mr; tEtat[l.etat] += mr; nChiffrees += 1; }
    if (!l.sansMontant) { tMat += l.mat; tMo += l.mo; tForf += l.forf; tAutre += l.autre; }
    if (a) { tEcart += (mr ?? N0) - (l.mc ?? N0); nAjustees += 1; } else if (!l.prixDefini) nSansPrix += 1;
    if (l.mh !== null) tH += l.mh;
    return {
      ouvrageId: l.ouvrageId, pieceId: l.pieceId, etatProjet: l.etat, nature: l.nature, unite: l.unite,
      quantite: l.q === null ? null : Number(l.q) / 1000, prixDefini: l.prixDefini, prixUnitaire: l.pu4 === null ? null : Number(l.pu4) / 10000,
      materiau: l.sansMontant ? null : cents(l.mat), mainOeuvre: l.sansMontant ? null : cents(l.mo), forfait: l.sansMontant ? null : cents(l.forf), autre: l.sansMontant ? null : cents(l.autre),
      heures: l.mh === null ? null : Number(l.mh) / 1000, montantCalcule: cents(l.mc),
      ajustement: a ? {
        id: a.id ?? null, valeurCalculee: a.valeurCalculee ?? null, valeurRetenue: a.valeurRetenue, raison: a.raison ?? null, auteurId: a.auteurId ?? null, date: a.date ?? null, perime,
        ...(match?.suiviQte ? { quantiteSource: a.quantiteSource ?? null, motifPerime: perimeQte ? "quantite" : perimeMontant ? "montant" : null } : {}),
      } as EstimationAjustement : null,
      montantRetenu: cents(mr),
    };
  });
  for (const item of aj) {
    if (lineKeys.has(key(item.a.ouvrageId, item.pieceId, item.a.etatProjet, item.nature))) continue;
    anomalies.push({ idx: ouvIdx.get(item.a.ouvrageId)?.idx ?? 2147483647, ouvrageId: item.a.ouvrageId, pieceId: item.pieceId, etat: item.a.etatProjet, nature: item.nature, code: "ajustement_orphelin", detail: "orphelin", gravite: "erreur" });
  }
  anomalies.sort((a, b) => a.idx - b.idx || cmpC(a.pieceId, b.pieceId) || posNullsFirst(ETATS_PROJET, a.etat) - posNullsFirst(ETATS_PROJET, b.etat)
    || posNullsFirst(["quantite", "forfait"], a.nature) - posNullsFirst(["quantite", "forfait"], b.nature)
    || ESTIMATION_ANOMALIE_CODES.indexOf(a.code) - ESTIMATION_ANOMALIE_CODES.indexOf(b.code) || cmpC(a.detail, b.detail));

  return {
    moteur: "estimation-v1",
    lignes: out,
    anomalies: anomalies.map((a) => ({ code: a.code, gravite: a.gravite, ouvrageId: a.ouvrageId, pieceId: a.pieceId, etatProjet: a.etat, nature: a.nature, detail: a.detail, message: estimationAnomalieMessage(a.code, a.detail) })),
    totaux: {
      montant: Number(tMontant) / 100,
      parEtat: { existant: Number(tEtat.existant) / 100, a_deposer: Number(tEtat.a_deposer) / 100, nouveau: Number(tEtat.nouveau) / 100, deplace: Number(tEtat.deplace) / 100 },
      parType: { materiau: Number(tMat) / 100, main_d_oeuvre: Number(tMo) / 100, forfait: Number(tForf) / 100, autre: Number(tAutre) / 100 },
      ecartAjustements: Number(tEcart) / 100, heures: Number(tH) / 1000,
      lignes: out.length, lignesChiffrees: nChiffrees, lignesSansPrix: nSansPrix, lignesAjustees: nAjustees,
    },
  };
}

/** Le montant automatique mémorisé est-il exactement au centime ? (sinon il ne peut égaler un montant du moteur). */
function exactCents(value: number): boolean {
  const s = decimalString(value);
  return !s.includes(".") || s.length - s.indexOf(".") - 1 <= 2;
}

// ── Coefficients et hypothèses (miroir de la migration 20260930001402) ───────
//
// Paramètres FACULTATIFS d'un relevé : coefficient général, coefficients par lot, texte d'hypothèses. PRIORITÉ (le plus
// précis l'emporte, AUCUN CUMUL) : coefficient saisi sur le prix de l'ouvrage > coefficient du lot de l'ouvrage >
// coefficient général > 1. Un coefficient n'est ni une marge ni une remise : il traduit une difficulté (accès, hauteur,
// site occupé…). Le moteur d'estimation reçoit des prix « effectifs » : son arithmétique est inchangée.

export const COEFFICIENT_SOURCES = ["ouvrage", "lot", "general", "aucun"] as const;
export type CoefficientSource = (typeof COEFFICIENT_SOURCES)[number];
export const COEFFICIENT_SOURCE_LABELS: Record<CoefficientSource, string> = { ouvrage: "ouvrage", lot: "lot", general: "général", aucun: "aucun" };
/** Ordre de priorité, du plus fort au plus faible. */
export const COEFFICIENT_PRIORITE = ["ouvrage", "lot", "general"] as const;
export const COEFFICIENT_PRIORITE_TEXTE = "Priorité : coefficient de l'ouvrage, sinon coefficient de son lot, sinon coefficient général (jamais cumulés).";

export const ESTIMATION_PARAMETRES_LIMITS = { lots: 50, lot: 80, hypotheses: 2000 } as const;
export type EstimationParametresDonnees = {
  readonly coefficientGeneral?: number | null;
  readonly coefficientsLots?: Readonly<Record<string, number>> | null;
  readonly hypotheses?: string | null;
};
export const PARAMETRES_ISSUE_CODES = ["invalide", "cle", "coefficient_general", "coefficients_lots", "lot", "coefficient_lot", "hypotheses"] as const;
export type ParametresIssueCode = (typeof PARAMETRES_ISSUE_CODES)[number];
export const PARAMETRES_ISSUE_MESSAGES: Record<ParametresIssueCode, string> = {
  invalide: "Paramètres d'estimation invalides.",
  cle: "Donnée inconnue : l'estimation Tools n'a qu'un coefficient général, des coefficients par lot et des hypothèses (marge, remise, TVA, acompte et conditions commerciales relèvent de Gestion Pro).",
  coefficient_general: "Coefficient général : entre 0,01 et 10, quatre décimales au plus.",
  coefficients_lots: "Coefficients par lot : 50 lots au plus.",
  lot: "Lot : 1 à 80 caractères, sans espace au début ni à la fin.",
  coefficient_lot: "Coefficient de lot : entre 0,01 et 10, quatre décimales au plus.",
  hypotheses: "Hypothèses : 2 000 caractères au plus.",
};

/** Miroir exact de `tools_releve_estimation_parametres_anomalie` : premier défaut, `null` si valide. */
export function parametresAnomalie(input: Json): ParametresIssueCode | null {
  if (!isObject(input)) return "invalide";
  if (Object.keys(input).some((k) => !["coefficientGeneral", "coefficientsLots", "hypotheses"].includes(k))) return "cle";
  if (isPresent(input, "coefficientGeneral") && !decimalValide(input.coefficientGeneral, 4, 0.01, 10)) return "coefficient_general";
  if (isPresent(input, "coefficientsLots")) {
    const lots = input.coefficientsLots;
    if (!isObject(lots) || Object.keys(lots).length > ESTIMATION_PARAMETRES_LIMITS.lots) return "coefficients_lots";
    if (Object.keys(lots).some((k) => { const n = [...k].length; return n < 1 || n > ESTIMATION_PARAMETRES_LIMITS.lot || k.trim() !== k; })) return "lot";
    if (Object.values(lots).some((v) => !decimalValide(v, 4, 0.01, 10))) return "coefficient_lot";
  }
  if (isPresent(input, "hypotheses") && (typeof input.hypotheses !== "string" || [...input.hypotheses].length > ESTIMATION_PARAMETRES_LIMITS.hypotheses)) return "hypotheses";
  return null;
}

/** Paramètres d'un relevé tels que lus (ou figés avec un plan). `revision` 0 : jamais enregistrés. */
export type EstimationParametres = {
  readonly donnees: EstimationParametresDonnees;
  readonly revision: number;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
  readonly priorite: readonly string[];
};
export const PARAMETRES_VIDES: EstimationParametres = { donnees: {}, revision: 0, updatedAt: null, updatedBy: null, priorite: [...COEFFICIENT_PRIORITE] };

export function estimationParametresFromJson(raw: unknown): EstimationParametres {
  if (!isObject(raw)) return PARAMETRES_VIDES;
  const d = isObject(raw.donnees) ? (raw.donnees as EstimationParametresDonnees) : {};
  return {
    donnees: d, revision: Number(raw.revision ?? 0), updatedAt: (raw.updatedAt as string | null) ?? null, updatedBy: (raw.updatedBy as string | null) ?? null,
    priorite: Array.isArray(raw.priorite) ? (raw.priorite as string[]) : [...COEFFICIENT_PRIORITE],
  };
}

export type PrixEffectif = {
  readonly ouvrageId: string;
  /** Prix transmis au moteur : coefficient du lot ou général injecté si le prix n'en porte pas. */
  readonly donnees: PrixDonnees;
  /** Coefficient réellement appliqué (`null` : prix invalide, signalé par le moteur). */
  readonly coefficientApplique: number | null;
  readonly coefficientSource: CoefficientSource | null;
};

/**
 * Miroir exact de `tools_releve_estimation_prix_effectifs` (fonction pure). Même ordre que `prix`. Paramètres invalides :
 * ignorés (aucun coefficient de lot ni général).
 */
export function prixEffectifs(
  ouvrages: readonly (Pick<OuvrageRecord, "id" | "categorie"> & { readonly lot?: string | null })[],
  prix: readonly { readonly ouvrageId: string; readonly donnees: PrixDonnees }[],
  parametres: EstimationParametresDonnees | null | undefined,
): PrixEffectif[] {
  const par: EstimationParametresDonnees = parametres && parametresAnomalie(parametres) === null ? parametres : {};
  const lots = new Map<string, string>();
  for (const o of ouvrages) if (!lots.has(o.id)) lots.set(o.id, ouvrageLot({ lot: typeof o.lot === "string" ? o.lot : undefined, categorie: o.categorie }));
  const general = par.coefficientGeneral ?? null;
  return prix.map((p) => {
    if (prixAnomalie(p.donnees) !== null) return { ouvrageId: p.ouvrageId, donnees: p.donnees, coefficientApplique: null, coefficientSource: null };
    if (p.donnees.coefficient !== null && p.donnees.coefficient !== undefined) {
      return { ouvrageId: p.ouvrageId, donnees: p.donnees, coefficientApplique: p.donnees.coefficient, coefficientSource: "ouvrage" };
    }
    const lot = lots.get(p.ouvrageId);
    const coefLot = lot !== undefined && par.coefficientsLots && Object.prototype.hasOwnProperty.call(par.coefficientsLots, lot) ? par.coefficientsLots[lot] : null;
    if (coefLot !== null && coefLot !== undefined) return { ouvrageId: p.ouvrageId, donnees: { ...p.donnees, coefficient: coefLot }, coefficientApplique: coefLot, coefficientSource: "lot" };
    if (general !== null) return { ouvrageId: p.ouvrageId, donnees: { ...p.donnees, coefficient: general }, coefficientApplique: general, coefficientSource: "general" };
    return { ouvrageId: p.ouvrageId, donnees: p.donnees, coefficientApplique: 1, coefficientSource: "aucun" };
  });
}

/** Estimation avec paramètres : résolution des coefficients, puis moteur (miroir du calcul d'un plan côté serveur). */
export function evaluerEstimationAvecParametres(
  entree: Omit<EstimationEntree, "ouvrages"> & { readonly ouvrages: readonly (Pick<OuvrageRecord, "id" | "etatTravaux" | "categorie"> & { readonly lot?: string | null })[] },
  parametres: EstimationParametresDonnees | null | undefined,
): EstimationResultat & { readonly prixEffectifs: PrixEffectif[] } {
  const effectifs = prixEffectifs(entree.ouvrages, entree.prix ?? [], parametres);
  return { ...evaluerEstimation({ ...entree, prix: effectifs }), prixEffectifs: effectifs };
}

/** Lots présents sur un ensemble d'ouvrages (ordre de première apparition) : proposés pour les coefficients par lot. */
export function lotsDesOuvrages(ouvrages: readonly Pick<OuvrageRecord, "lot" | "categorie">[]): string[] {
  const out: string[] = [];
  for (const o of ouvrages) { const lot = ouvrageLot(o); if (!out.includes(lot)) out.push(lot); }
  return out;
}

/** Estimation séparée des travaux : seules les lignes des états projetés demandés (ex. à créer, à déposer, à déplacer). */
export function filtrerParEtats<T extends { readonly ligne: { readonly etatProjet: EtatProjet } }>(details: readonly T[], etats: readonly EtatProjet[]): T[] {
  if (etats.length === 0 || etats.length === ETATS_PROJET.length) return [...details];
  const set = new Set(etats);
  return details.filter((d) => set.has(d.ligne.etatProjet));
}

// ── Estimation d'un plan (forme JSON du serveur) ──────────────────────────────

export type PrixOrigine = "saisie" | "bibliotheque" | "copie";
export type PrixOuvrage = {
  readonly ouvrageId: string; readonly donnees: PrixDonnees; readonly origine: PrixOrigine; readonly bibliothequeId: string | null;
  readonly revision: number; readonly updatedAt: string | null; readonly updatedBy: string | null;
  /** Coefficient appliqué et sa provenance (migration 1402 ; absent d'une estimation figée avant elle : prix seul). */
  readonly coefficientApplique: number | null;
  readonly coefficientSource: CoefficientSource | null;
};
export type PlanEstimation = EstimationResultat & {
  readonly version: 1;
  readonly planId: string;
  readonly etageId: string;
  readonly etat: PlanEtat;
  readonly numero: number;
  readonly base: "HT";
  readonly devise: "EUR";
  readonly prix: readonly PrixOuvrage[];
  /** Paramètres du relevé utilisés pour ce calcul (figés avec le plan au gel). */
  readonly parametres: EstimationParametres;
  readonly fige?: boolean;
  readonly source?: "gel" | "calcul" | "recalcul_plan_fige_avant_lot10";
  readonly figeLe?: string | null;
  readonly calculeLe?: string;
  readonly revision?: number;
};

const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const numOr0 = (value: unknown): number => Number(value ?? 0);

/** Normalise le JSON serveur (nombres `numeric` éventuellement sérialisés en chaîne). */
export function planEstimationFromJson(raw: unknown): PlanEstimation {
  const json = raw as PlanEstimation;
  const t = (json.totaux ?? {}) as Partial<EstimationTotaux>;
  return {
    ...json,
    numero: Number(json.numero),
    prix: (json.prix ?? []).map((p) => {
      // Estimation figée avant la migration 1402 : le coefficient appliqué est celui du prix (aucun paramètre de relevé).
      const avant1402 = p.coefficientSource === undefined;
      const explicite = p.donnees?.coefficient !== null && p.donnees?.coefficient !== undefined;
      return {
        ...p, revision: Number(p.revision), bibliothequeId: p.bibliothequeId ?? null, updatedAt: p.updatedAt ?? null, updatedBy: p.updatedBy ?? null,
        coefficientApplique: avant1402 ? (prixAnomalie(p.donnees) === null ? Number(p.donnees.coefficient ?? 1) : null) : num(p.coefficientApplique),
        coefficientSource: avant1402 ? (prixAnomalie(p.donnees) === null ? (explicite ? "ouvrage" : "aucun") : null) : (p.coefficientSource ?? null),
      };
    }),
    parametres: estimationParametresFromJson((json as { parametres?: unknown }).parametres),
    lignes: (json.lignes ?? []).map((l) => ({
      ...l, quantite: num(l.quantite), prixUnitaire: num(l.prixUnitaire), materiau: num(l.materiau), mainOeuvre: num(l.mainOeuvre), forfait: num(l.forfait),
      autre: num(l.autre), heures: num(l.heures), montantCalcule: num(l.montantCalcule), montantRetenu: num(l.montantRetenu),
      ajustement: l.ajustement ? {
        ...l.ajustement, valeurCalculee: num(l.ajustement.valeurCalculee), valeurRetenue: Number(l.ajustement.valeurRetenue),
        ...(l.ajustement.quantiteSource !== undefined ? { quantiteSource: num(l.ajustement.quantiteSource) } : {}),
      } : null,
    })),
    anomalies: json.anomalies ?? [],
    totaux: {
      montant: numOr0(t.montant), heures: numOr0(t.heures), ecartAjustements: numOr0(t.ecartAjustements),
      parEtat: { existant: numOr0(t.parEtat?.existant), a_deposer: numOr0(t.parEtat?.a_deposer), nouveau: numOr0(t.parEtat?.nouveau), deplace: numOr0(t.parEtat?.deplace) },
      parType: { materiau: numOr0(t.parType?.materiau), main_d_oeuvre: numOr0(t.parType?.main_d_oeuvre), forfait: numOr0(t.parType?.forfait), autre: numOr0(t.parType?.autre) },
      lignes: numOr0(t.lignes), lignesChiffrees: numOr0(t.lignesChiffrees), lignesSansPrix: numOr0(t.lignesSansPrix), lignesAjustees: numOr0(t.lignesAjustees),
    },
  };
}

/** Plan d'un relevé avec son quantitatif et son estimation (synthèse serveur). */
export type EstimationSource = QuantitatifSource & { readonly libelle: string | null; readonly estimation: PlanEstimation };

export function estimationSourceFromJson(row: { etageId: string; planId: string; numero: number | string; etat: PlanEtat; figeLe: string | null; libelle?: string | null; quantitatif: unknown; estimation: unknown }): EstimationSource {
  return {
    etageId: row.etageId, planId: row.planId, numero: Number(row.numero), etat: row.etat, figeLe: row.figeLe, libelle: row.libelle ?? null,
    quantitatif: planQuantitatifFromJson(row.quantitatif) as PlanQuantitatif, estimation: planEstimationFromJson(row.estimation),
  };
}

// ── Détail, agrégations, totaux ───────────────────────────────────────────────

type Ref = { readonly id: string; readonly nom: string } | null;
export type EstimationParTypeCentimes = { materiau: bigint; main_d_oeuvre: bigint; forfait: bigint; autre: bigint };
const emptyParType = (): EstimationParTypeCentimes => ({ materiau: N0, main_d_oeuvre: N0, forfait: N0, autre: N0 });
export type EstimationParEtatCentimes = Record<EtatProjet, bigint>;
const emptyParEtat = (): EstimationParEtatCentimes => ({ existant: N0, a_deposer: N0, nouveau: N0, deplace: N0 });

/** Ligne enrichie : emplacement, ouvrage, prix. Montants en CENTIMES exacts (bigint), quantités en milli-unités. */
export type EstimationLigneDetail = {
  readonly ref: string;
  readonly planId: string;
  readonly ligne: EstimationLigne;
  readonly ouvrage: OuvrageRecord;
  readonly prix: PrixOuvrage | null;
  readonly cle: string;
  readonly lot: string;
  readonly chantier: Ref; readonly batiment: Ref; readonly etage: Ref; readonly zone: Ref; readonly piece: Ref;
  readonly quantiteMilli: bigint | null;
  readonly calculeCentimes: bigint | null;
  readonly retenuCentimes: bigint | null;
  readonly parType: EstimationParTypeCentimes;
  readonly heuresMilli: bigint;
  readonly anomalies: readonly EstimationAnomalie[];
};

const toCentimes = (value: number | null): bigint | null => (value === null ? null : scaled(value, 2));

export function estimationDetails(structure: MetreStructure, sources: readonly EstimationSource[]): EstimationLigneDetail[] {
  const etages = new Map(structure.etages.map((e) => [e.id as string, e]));
  const batiments = new Map(structure.batiments.map((b) => [b.id as string, b]));
  const chantiers = new Map(structure.chantiers.map((c) => [c.id as string, c]));
  const zones = new Map(structure.zones.map((z) => [z.id as string, z]));
  const pieces = new Map(structure.pieces.map((p) => [p.id as string, p]));
  const out: EstimationLigneDetail[] = [];
  for (const source of sources) {
    const ouvrages = new Map(source.quantitatif.ouvrages.map((o) => [o.id, o]));
    const prix = new Map(source.estimation.prix.map((p) => [p.ouvrageId, p]));
    const etage = etages.get(source.etageId);
    const batiment = etage ? batiments.get(etage.batimentId) : undefined;
    const chantier = batiment?.chantierId ? chantiers.get(batiment.chantierId) : undefined;
    const anomaliesByKey = new Map<string, EstimationAnomalie[]>();
    for (const a of source.estimation.anomalies) {
      const k = `${a.ouvrageId}\u0000${a.pieceId ?? ""}\u0000${a.etatProjet ?? ""}\u0000${a.nature ?? ""}`;
      anomaliesByKey.set(k, [...(anomaliesByKey.get(k) ?? []), a]);
    }
    for (const ligne of source.estimation.lignes) {
      const ouvrage = ouvrages.get(ligne.ouvrageId);
      if (!ouvrage) continue;
      const piece = ligne.pieceId ? pieces.get(ligne.pieceId) : undefined;
      const zone = piece?.zoneId ? zones.get(piece.zoneId) : undefined;
      const sans = ligne.montantCalcule === null;
      out.push({
        ref: `${source.planId}:${ligne.ouvrageId}:${ligne.pieceId ?? `etage-${source.etageId}`}:${ligne.etatProjet}:${ligne.nature}`,
        planId: source.planId, ligne, ouvrage, prix: prix.get(ligne.ouvrageId) ?? null, cle: ouvrageCle(ouvrage), lot: ouvrageLot(ouvrage),
        chantier: chantier ? { id: chantier.id, nom: chantier.nom } : null,
        batiment: batiment ? { id: batiment.id, nom: batiment.nom } : null,
        etage: etage ? { id: etage.id, nom: etage.nom } : null,
        zone: zone && !zone.deletedAt ? { id: zone.id, nom: zone.nom } : null,
        piece: piece ? { id: piece.id, nom: piece.nom } : null,
        quantiteMilli: ligne.quantite === null ? null : toMilli(ligne.quantite),
        calculeCentimes: toCentimes(ligne.montantCalcule), retenuCentimes: toCentimes(ligne.montantRetenu),
        parType: sans ? emptyParType() : { materiau: toCentimes(ligne.materiau) ?? N0, main_d_oeuvre: toCentimes(ligne.mainOeuvre) ?? N0, forfait: toCentimes(ligne.forfait) ?? N0, autre: toCentimes(ligne.autre) ?? N0 },
        heuresMilli: ligne.heures === null ? N0 : toMilli(ligne.heures),
        anomalies: [
          ...(anomaliesByKey.get(`${ligne.ouvrageId}\u0000${ligne.pieceId ?? ""}\u0000${ligne.etatProjet}\u0000${ligne.nature}`) ?? []),
        ],
      });
    }
  }
  return out;
}

/** Total d'un ensemble de lignes : montants exacts (centimes), par état, par type, heures, compteurs. */
export type EstimationTotal = {
  montant: bigint; parEtat: EstimationParEtatCentimes; parType: EstimationParTypeCentimes; ecart: bigint; heures: bigint;
  lignes: number; chiffrees: number; sansPrix: number; nonCalculables: number; ajustees: number;
};
export const emptyEstimationTotal = (): EstimationTotal => ({ montant: N0, parEtat: emptyParEtat(), parType: emptyParType(), ecart: N0, heures: N0, lignes: 0, chiffrees: 0, sansPrix: 0, nonCalculables: 0, ajustees: 0 });

export function ajouterAuTotal(total: EstimationTotal, d: EstimationLigneDetail): void {
  total.lignes += 1;
  if (d.retenuCentimes !== null) { total.montant += d.retenuCentimes; total.parEtat[d.ligne.etatProjet] += d.retenuCentimes; total.chiffrees += 1; }
  total.parType.materiau += d.parType.materiau; total.parType.main_d_oeuvre += d.parType.main_d_oeuvre; total.parType.forfait += d.parType.forfait; total.parType.autre += d.parType.autre;
  total.heures += d.heuresMilli;
  if (d.ligne.ajustement) { total.ajustees += 1; total.ecart += (d.retenuCentimes ?? N0) - (d.calculeCentimes ?? N0); }
  else if (!d.ligne.prixDefini) total.sansPrix += 1;
  else if (d.calculeCentimes === null) total.nonCalculables += 1;
}

/** Total chantier (toutes lignes) : Σ lignes, exact. */
export function totalEstimation(details: readonly EstimationLigneDetail[]): EstimationTotal {
  const total = emptyEstimationTotal();
  for (const d of details) ajouterAuTotal(total, d);
  return total;
}

/** Sous-total d'un ouvrage dans un groupe : quantité (même unité) et montant. */
export type EstimationOuvrageTotal = {
  readonly cle: string; readonly nom: string; readonly categorie: OuvrageCategorie; readonly lot: string; readonly unite: OuvrageUnite;
  quantite: bigint; forfait: bigint; readonly total: EstimationTotal; prixUnitaire: number | null;
};
export type EstimationGroupe = { readonly cle: string; readonly libelle: string; readonly chemin: readonly string[]; readonly total: EstimationTotal; readonly ouvrages: EstimationOuvrageTotal[] };

/**
 * Agrégation par niveau (chantier, bâtiment, étage, zone, pièce, lot, ouvrage) : sous-total exact de chaque
 * groupe, puis par ouvrage (clé + unité). Ordre : première apparition.
 */
export function agregerEstimation(details: readonly EstimationLigneDetail[], niveau: QuantitatifNiveau): EstimationGroupe[] {
  const groupes = new Map<string, EstimationGroupe & { index: Map<string, EstimationOuvrageTotal> }>();
  for (const d of details) {
    const { cle, libelle, chemin } = niveauCle(d, niveau);
    let groupe = groupes.get(cle);
    if (!groupe) { groupe = { cle, libelle, chemin, total: emptyEstimationTotal(), ouvrages: [], index: new Map() }; groupes.set(cle, groupe); }
    ajouterAuTotal(groupe.total, d);
    let o = groupe.index.get(d.cle);
    if (!o) {
      o = { cle: d.cle, nom: d.ouvrage.nom, categorie: d.ouvrage.categorie, lot: d.lot, unite: d.ouvrage.unite, quantite: N0, forfait: N0, total: emptyEstimationTotal(), prixUnitaire: null };
      groupe.index.set(d.cle, o); groupe.ouvrages.push(o);
    }
    ajouterAuTotal(o.total, d);
    if (d.ligne.nature === "quantite" && d.quantiteMilli !== null) o.quantite += d.quantiteMilli;
    if (d.ligne.nature === "forfait") o.forfait += d.retenuCentimes ?? N0;
    if (d.ligne.nature === "quantite" && d.ligne.prixUnitaire !== null) o.prixUnitaire = d.ligne.prixUnitaire;
  }
  return [...groupes.values()].map(({ cle, libelle, chemin, total, ouvrages }) => ({ cle, libelle, chemin, total, ouvrages }));
}

/** Coût dépose / neuf / déplacement / travaux sur existant / total projet. */
export function syntheseCouts(total: Pick<EstimationTotal, "parEtat" | "montant">): { depose: bigint; neuf: bigint; deplacement: bigint; existant: bigint; total: bigint } {
  return { depose: total.parEtat.a_deposer, neuf: total.parEtat.nouveau, deplacement: total.parEtat.deplace, existant: total.parEtat.existant, total: total.montant };
}

// ── Multi-scénario (préparation) : solution A / solution B = deux estimations ──

export type EstimationComparaisonLigne = { readonly cle: string; readonly libelle: string; readonly a: bigint; readonly b: bigint; readonly ecart: bigint };
export type EstimationComparaison = {
  readonly parLot: readonly EstimationComparaisonLigne[];
  readonly parEtat: readonly EstimationComparaisonLigne[];
  readonly total: EstimationComparaisonLigne;
  readonly heures: { readonly a: bigint; readonly b: bigint };
};
/** Compare deux ensembles de lignes (ex. deux plans projetés d'un même étage) : écart B − A par lot, par état, total. */
export function comparerEstimations(a: readonly EstimationLigneDetail[], b: readonly EstimationLigneDetail[]): EstimationComparaison {
  const ta = totalEstimation(a); const tb = totalEstimation(b);
  const lots = new Map<string, { a: bigint; b: bigint }>();
  for (const [list, side] of [[a, "a"], [b, "b"]] as const) {
    for (const d of list) {
      const row = lots.get(d.lot) ?? { a: N0, b: N0 };
      row[side] += d.retenuCentimes ?? N0;
      lots.set(d.lot, row);
    }
  }
  return {
    parLot: [...lots.entries()].map(([lot, v]) => ({ cle: lot, libelle: lot, a: v.a, b: v.b, ecart: v.b - v.a })),
    parEtat: ETATS_PROJET.map((etat) => ({ cle: etat, libelle: ETAT_PROJET_LABELS[etat], a: ta.parEtat[etat], b: tb.parEtat[etat], ecart: tb.parEtat[etat] - ta.parEtat[etat] })),
    total: { cle: "total", libelle: "Total HT", a: ta.montant, b: tb.montant, ecart: tb.montant - ta.montant },
    heures: { a: ta.heures, b: tb.heures },
  };
}

// ── Formats ───────────────────────────────────────────────────────────────────

/** Décimal exact « 1234.56 » d'un montant en centimes. */
export function centimesText(value: bigint | number): string {
  const v = BigInt(value);
  const negative = v < N0;
  const abs = negative ? -v : v;
  return `${negative ? "-" : ""}${abs / N100}.${String(abs % N100).padStart(2, "0")}`;
}
/** « 1 234,56 € » (espace fine insécable absente : espace simple, stable pour les tests et l'impression). */
export function formatMontant(value: bigint | number | null): string {
  if (value === null) return "—";
  const [whole, frac] = centimesText(value).split(".");
  const negative = whole.startsWith("-");
  const grouped = (negative ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "-" : ""}${grouped},${frac} €`;
}
/** Prix unitaire (4 décimales au plus, 2 au moins) : « 16,225 € ». */
export function formatPrixUnitaire(value: number | null): string {
  if (value === null) return "—";
  const s = decimalString(value);
  const [whole, frac = ""] = s.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped},${frac.padEnd(2, "0")} €`;
}
export function formatHeures(milli: bigint | number): string {
  const text = milliText(milli);
  const [whole, frac] = text.split(".");
  const d = frac.replace(/0+$/, "");
  return `${whole}${d ? `,${d}` : ""} h`;
}

/** Libellé lisible d'un prix : « Matériau 3,50 € + MO 0,25 h × 45,00 € + forfait 120,00 € · × 1,1 ». */
export function prixTexte(donnees: PrixDonnees, unite: OuvrageUnite): string {
  const u = OUVRAGE_UNITE_LABELS[unite];
  const fr = (v: number) => decimalString(v).replace(".", ",");
  const parts = donnees.composantes.map((c) => {
    const label = c.libelle ? ` (${c.libelle})` : "";
    switch (c.type) {
      case "main_d_oeuvre": return `Main d'œuvre ${fr(c.heuresParUnite)} h/${u} × ${formatPrixUnitaire(c.tauxHoraire)}/h${label}`;
      case "forfait": return `Forfait ${formatPrixUnitaire(c.montant)}${label}`;
      default: return `${PRIX_TYPE_LABELS[c.type]} ${formatPrixUnitaire(c.prixUnitaire)}/${u}${label}`;
    }
  });
  const coef = donnees.coefficient ?? 1;
  return `${parts.join(" + ")}${coef !== 1 ? ` · coefficient × ${fr(coef)}` : ""} (HT)`;
}

// ── Exports : CSV et contrat Gestion Pro ──────────────────────────────────────

const csvCell = (value: string) => (/[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const csvMoney = (c: bigint | null) => (c === null ? "" : centimesText(c).replace(".", ","));
const csvMilli = (m: bigint | null) => (m === null ? "" : milliText(m).replace(".", ","));

export const ESTIMATION_CSV_COLUMNS = [
  "Chantier", "Bâtiment", "Étage", "Zone", "Pièce", "Lot", "Catégorie", "Code", "Ouvrage", "Nature", "État projeté", "Unité", "Quantité retenue",
  "PU HT", "Matériau HT", "Main d'œuvre HT", "Forfait HT", "Autre HT", "Heures", "Montant automatique HT", "Montant retenu HT", "Corrigé",
  "Raison de la correction", "Anomalies", "Coefficient appliqué", "Origine du coefficient", "Quantité source (correction)", "Correction obsolète",
] as const;

/** CSV (Excel FR : `;`, décimale virgule, BOM UTF-8), montants HT exacts ; dernière ligne : total chantier. */
export function estimationToCsv(details: readonly EstimationLigneDetail[]): string {
  const rows = [ESTIMATION_CSV_COLUMNS.join(";")];
  for (const d of details) {
    const l = d.ligne;
    rows.push([
      d.chantier?.nom ?? "", d.batiment?.nom ?? "", d.etage?.nom ?? "", d.zone?.nom ?? "", d.piece?.nom ?? "(étage)", d.lot,
      OUVRAGE_CATEGORIE_LABELS[d.ouvrage.categorie], d.ouvrage.code ?? "", d.ouvrage.nom, l.nature === "forfait" ? "Forfait" : "Quantité",
      ETAT_PROJET_LABELS[l.etatProjet], OUVRAGE_UNITE_LABELS[l.unite], csvMilli(d.quantiteMilli),
      l.prixUnitaire === null ? "" : decimalString(l.prixUnitaire).replace(".", ","),
      csvMoney(l.materiau === null ? null : d.parType.materiau), csvMoney(l.mainOeuvre === null ? null : d.parType.main_d_oeuvre),
      csvMoney(l.forfait === null ? null : d.parType.forfait), csvMoney(l.autre === null ? null : d.parType.autre),
      l.heures === null ? "" : csvMilli(d.heuresMilli), csvMoney(d.calculeCentimes), csvMoney(d.retenuCentimes), l.ajustement ? "oui" : "non",
      l.ajustement?.raison ?? (l.prixDefini ? (d.calculeCentimes === null ? "Quantité non calculable" : "") : "Sans prix"),
      d.anomalies.map((a) => ESTIMATION_ANOMALIE_LABELS[a.code]).join(", "),
      d.prix?.coefficientApplique === null || d.prix?.coefficientApplique === undefined ? "" : decimalString(d.prix.coefficientApplique).replace(".", ","),
      d.prix?.coefficientSource ? COEFFICIENT_SOURCE_LABELS[d.prix.coefficientSource] : "",
      l.ajustement?.quantiteSource === null || l.ajustement?.quantiteSource === undefined ? "" : csvMilli(toMilli(l.ajustement.quantiteSource)),
      l.ajustement ? (l.ajustement.perime ? (l.ajustement.motifPerime === "quantite" ? "oui (quantité modifiée)" : "oui (montant modifié)") : "non") : "",
    ].map(csvCell).join(";"));
  }
  const total = totalEstimation(details);
  rows.push(["Total chantier HT (estimation)", "", "", "", "", "", "", "", "", "", "", "", "", "",
    csvMoney(total.parType.materiau), csvMoney(total.parType.main_d_oeuvre), csvMoney(total.parType.forfait), csvMoney(total.parType.autre),
    csvMilli(total.heures), "", csvMoney(total.montant), "", "", "", "", "", "", ""].map(csvCell).join(";"));
  return `﻿${rows.join("\r\n")}\r\n`;
}

/** Contrat de transfert de l'estimation vers Gestion Pro — version EXPLICITE, semver. */
export const ESTIMATION_GP_CONTRACT = { name: "elsatia.tools.estimation", version: "1.1.0" } as const;
/** Préparé, non branché : aucune écriture GP, aucun devis, aucun document commercial. */
export const ESTIMATION_GP_READINESS = { status: "contract-only", devis: "not-generated", documentsCommerciaux: "none" } as const;
/** Ce que Gestion Pro décide à partir de l'estimation (Tools ne les calcule jamais). */
export const ESTIMATION_GP_DECIDE_PAR_GESTION_PRO = ["prix_de_vente", "marge", "remise", "tva", "devis_final"] as const;

export type EstimationGpPhoto = { readonly ref: string; readonly storagePath: string; readonly mimeType: string; readonly legende: string | null; readonly pieceRef: string | null; readonly etatDocumente: string | null; readonly priseLe: string | null };
export type EstimationGpAnnotation = { readonly ref: string; readonly texte: string; readonly forme: string; readonly pieceRef: string | null; readonly cible: { readonly kind: string; readonly ref: string } | null };

type Money = string;
export type EstimationGpPayload = {
  readonly contract: typeof ESTIMATION_GP_CONTRACT;
  readonly kind: "releve-metre/estimation";
  readonly readiness: typeof ESTIMATION_GP_READINESS;
  /** Gestion Pro reste libre de refaire tout le chiffrage : l'estimation Tools n'est qu'une base de travail. */
  readonly perimetre: { readonly tools: "estimation-simplifiee"; readonly decideParGestionPro: typeof ESTIMATION_GP_DECIDE_PAR_GESTION_PRO; readonly gestionProLibreDeRechiffrer: true };
  readonly montants: { readonly devise: "EUR"; readonly base: "HT"; readonly nature: "estimative" };
  /** Même relevé, même état, mêmes plans (numéro, gel), mêmes quantités et mêmes montants retenus → même clé. */
  readonly idempotencyKey: string;
  readonly source: {
    /** Métadonnées de source (1.1.0) : application, module, date d'export. */
    readonly application: "elsatia-tools"; readonly module: "releve-metre"; readonly exporteLe: string;
    readonly releveId: string; readonly etat: MetreSyntheseEtat; readonly moteurs: { readonly quantitatif: "quantitatif-v1"; readonly estimation: "estimation-v1" };
    readonly plans: readonly { readonly etageId: string; readonly planId: string; readonly numero: number; readonly etat: PlanEtat; readonly libelle: string | null; readonly fige: boolean; readonly source: string }[];
  };
  /** Plans, ouvrages et quantités : contrat `elsatia.tools.quantitatif` 1.0.0 imbriqué (sans prix, inchangé). */
  readonly quantitatif: QuantitatifGpPayload;
  readonly pieces: readonly { readonly ref: string; readonly nom: string; readonly chemin: readonly string[]; readonly usage: string; readonly hauteurSousPlafondM: number | null; readonly surfaceSolM2: string | null; readonly perimetreUtileM: string | null }[];
  /** Prix estimatifs structurés par ouvrage (référence `quantitatif.ouvrages[].ref`). */
  /** Hypothèses et coefficients (1.1.0), par plan : paramètres du relevé utilisés (figés avec un plan figé). */
  readonly hypotheses: {
    readonly priorite: readonly string[]; readonly regle: string;
    readonly plans: readonly { readonly planRef: string; readonly coefficientGeneral: string | null; readonly coefficientsLots: readonly { readonly lot: string; readonly coefficient: string }[];
      readonly texte: string | null; readonly revision: number; readonly modifieLe: string | null; readonly modifiePar: string | null }[];
  };
  /** `coefficient` : coefficient APPLIQUÉ ; `coefficientSaisi` : celui du prix de l'ouvrage (1.1.0) ; `coefficientSource` : ouvrage / lot / général / aucun. */
  readonly prix: readonly { readonly ouvrageRef: string; readonly origine: PrixOrigine; readonly coefficient: string; readonly coefficientSaisi: string | null; readonly coefficientSource: CoefficientSource | null;
    readonly prixUnitaire: string | null; readonly forfait: Money;
    readonly composantes: readonly { readonly type: PrixType; readonly libelle: string | null; readonly prixUnitaire: string | null; readonly heuresParUnite: string | null; readonly tauxHoraire: string | null; readonly montant: string | null }[] }[];
  readonly lignes: readonly {
    readonly ref: string; readonly ouvrageRef: string; readonly quantiteRef: string | null; readonly nature: EstimationNature; readonly etatProjet: EtatProjet; readonly unite: OuvrageUnite;
    readonly quantite: string | null; readonly prixUnitaire: string | null;
    readonly montants: { readonly materiau: Money | null; readonly mainOeuvre: Money | null; readonly forfait: Money | null; readonly autre: Money | null };
    readonly heures: string | null; readonly montantCalcule: Money | null; readonly montantRetenu: Money | null;
    readonly correction: { readonly raison: string; readonly auteurRef: string | null; readonly date: string | null; readonly montantCalcule: Money | null;
      /** Valeur source (1.1.0) : quantité au moment de la correction ; `obsolete` si la quantité ou le montant automatique ont changé. */
      readonly quantiteSource: string | null; readonly obsolete: boolean; readonly motifObsolescence: "quantite" | "montant" | null } | null;
    readonly emplacement: { readonly chantier: Ref; readonly batiment: Ref; readonly etage: Ref; readonly zone: Ref; readonly piece: Ref };
  }[];
  readonly totaux: {
    readonly total: Money; readonly parEtat: Record<EtatProjet, Money>; readonly parType: Record<PrixType, Money>; readonly ecartCorrections: Money; readonly heures: string;
    readonly parLot: readonly { readonly lot: string; readonly montant: Money }[];
    readonly lignes: number; readonly lignesSansPrix: number; readonly correctionsObsoletes: number;
  };
  /** États projetés : coût dépose / neuf / déplacement / travaux sur existant. */
  readonly etatsProjetes: { readonly depose: Money; readonly neuf: Money; readonly deplacement: Money; readonly existant: Money; readonly total: Money };
  readonly revetements: readonly { readonly ref: string; readonly pieceRef: string; readonly support: string; readonly famille: string; readonly libelle: string; readonly unite: "m²" | "ml"; readonly quantite: string | null; readonly etatProjet: EtatProjet }[];
  readonly photos: readonly EstimationGpPhoto[];
  readonly annotations: readonly EstimationGpAnnotation[];
  readonly anomalies: readonly { readonly code: EstimationAnomalieCode; readonly gravite: EstimationAnomalieGravite; readonly ouvrageRef: string; readonly pieceRef: string | null; readonly message: string }[];
};

const d4 = (v: number | null | undefined) => (v === null || v === undefined ? null : decimalString(v));
const mm2ToM2Text = (mm2: number | null | undefined) => (mm2 === null || mm2 === undefined ? null : milliText(rdiv(scaled(mm2, 0), BigInt(1000))));
const mmToMText = (mm: number | null | undefined) => (mm === null || mm === undefined ? null : milliText(scaled(mm, 0)));

export function buildEstimationGpPayload(input: {
  readonly releveId: string; readonly etat: MetreSyntheseEtat; readonly structure: MetreStructure; readonly sources: readonly EstimationSource[];
  readonly details: readonly EstimationLigneDetail[]; readonly metre?: readonly MetreEtageSource[];
  readonly photos?: readonly EstimationGpPhoto[]; readonly annotations?: readonly EstimationGpAnnotation[];
  /** Horodatage d'export (ISO) ; par défaut maintenant. */
  readonly exporteLe?: string;
}): EstimationGpPayload {
  const { releveId, etat, structure, sources, details } = input;
  const qDetails: QuantitatifLigneDetail[] = [];
  // Détails du quantitatif (sans prix) reconstruits depuis les sources : contrat 1.0.0 inchangé.
  const qSources: QuantitatifSource[] = sources.map((s) => ({ etageId: s.etageId, planId: s.planId, numero: s.numero, etat: s.etat, figeLe: s.figeLe, quantitatif: s.quantitatif }));
  const qRef = new Map<string, string>();
  for (const d of details) if (d.ligne.nature === "quantite") qRef.set(d.ref, d.ref.replace(/:quantite$/, ""));
  const qIndex = new Map<string, PlanQuantitatif["lignes"][number]>();
  for (const s of sources) for (const l of s.quantitatif.lignes) qIndex.set(`${s.planId}\u0000${l.ouvrageId}\u0000${l.pieceId ?? ""}\u0000${l.etatProjet}`, l);
  for (const d of details) {
    if (d.ligne.nature !== "quantite") continue;
    const ql = qIndex.get(`${d.planId}\u0000${d.ligne.ouvrageId}\u0000${d.ligne.pieceId ?? ""}\u0000${d.ligne.etatProjet}`);
    if (!ql) continue;
    qDetails.push({
      ref: qRef.get(d.ref) as string, planId: d.planId, ligne: ql, ouvrage: d.ouvrage, cle: d.cle, lot: d.lot, chantier: d.chantier, batiment: d.batiment, etage: d.etage,
      zone: d.zone, piece: d.piece, retenueMilli: ql.quantiteRetenue === null ? null : toMilli(ql.quantiteRetenue), calculeeMilli: ql.quantiteCalculee === null ? null : toMilli(ql.quantiteCalculee), anomalies: [],
    });
  }
  const quantitatif = buildQuantitatifGpPayload(releveId, etat, qSources, qDetails);
  const metrePieces = new Map((input.metre ?? []).flatMap((m) => m.metre.pieces.map((p) => [p.pieceId, p] as const)));
  const zones = new Map(structure.zones.map((z) => [z.id, z]));
  const etageIds = new Set(sources.map((s) => s.etageId));
  const pieces = structure.pieces.filter((p) => !p.deletedAt && etageIds.has(p.etageId)).map((p: MetreStructure["pieces"][number] & { readonly usage?: string; readonly hauteurSousPlafondMm?: number | null }) => {
    const etage = structure.etages.find((e) => e.id === p.etageId);
    const batiment = etage ? structure.batiments.find((b) => b.id === etage.batimentId) : undefined;
    const zone = p.zoneId ? zones.get(p.zoneId) : undefined;
    const m = metrePieces.get(p.id);
    return {
      ref: p.id, nom: p.nom, chemin: [batiment?.nom, etage?.nom, zone?.nom, p.nom].filter((x): x is string => !!x), usage: p.usage ?? "autre",
      hauteurSousPlafondM: p.hauteurSousPlafondMm === null || p.hauteurSousPlafondMm === undefined ? null : p.hauteurSousPlafondMm / 1000,
      surfaceSolM2: m ? mm2ToM2Text(m.retenu.surface_sol ?? null) : null, perimetreUtileM: m ? mmToMText(m.retenu.perimetre_utile ?? null) : null,
    };
  });
  const prix = sources.flatMap((s) => { const ids = new Set(s.quantitatif.ouvrages.map((o) => o.id)); return s.estimation.prix.filter((p) => ids.has(p.ouvrageId)); }).map((p) => {
    // PU et forfait AVEC le coefficient appliqué (celui du moteur), coefficient saisi conservé à part.
    const applique = p.coefficientApplique ?? p.donnees.coefficient ?? 1;
    const effectif: PrixDonnees = { ...p.donnees, coefficient: applique };
    const pu = prixUnitaireComposite(effectif);
    return {
      ouvrageRef: p.ouvrageId, origine: p.origine, coefficient: decimalString(applique),
      coefficientSaisi: p.donnees.coefficient === null || p.donnees.coefficient === undefined ? null : decimalString(p.donnees.coefficient),
      coefficientSource: p.coefficientSource ?? null,
      prixUnitaire: pu === null ? null : decimalString(Number(pu) / 10000),
      forfait: centimesText(forfaitCentimes(effectif)),
      composantes: p.donnees.composantes.map((c) => ({
        type: c.type, libelle: c.libelle ?? null,
        prixUnitaire: c.type === "materiau" || c.type === "autre" ? decimalString(c.prixUnitaire) : null,
        heuresParUnite: c.type === "main_d_oeuvre" ? decimalString(c.heuresParUnite) : null, tauxHoraire: c.type === "main_d_oeuvre" ? decimalString(c.tauxHoraire) : null,
        montant: c.type === "forfait" ? decimalString(c.montant) : null,
      })),
    };
  });
  const m2 = (c: bigint | null) => (c === null ? null : centimesText(c));
  const lignes = details.map((d) => {
    const l = d.ligne;
    return {
      ref: d.ref, ouvrageRef: l.ouvrageId, quantiteRef: qRef.get(d.ref) ?? null, nature: l.nature, etatProjet: l.etatProjet, unite: l.unite,
      quantite: d.quantiteMilli === null ? null : milliText(d.quantiteMilli), prixUnitaire: d4(l.prixUnitaire),
      montants: {
        materiau: l.materiau === null ? null : centimesText(d.parType.materiau), mainOeuvre: l.mainOeuvre === null ? null : centimesText(d.parType.main_d_oeuvre),
        forfait: l.forfait === null ? null : centimesText(d.parType.forfait), autre: l.autre === null ? null : centimesText(d.parType.autre),
      },
      heures: l.heures === null ? null : milliText(d.heuresMilli), montantCalcule: m2(d.calculeCentimes), montantRetenu: m2(d.retenuCentimes),
      correction: l.ajustement ? {
        raison: l.ajustement.raison, auteurRef: l.ajustement.auteurId, date: l.ajustement.date,
        montantCalcule: l.ajustement.valeurCalculee === null ? null : centimesText(scaled(l.ajustement.valeurCalculee, 2)),
        quantiteSource: l.ajustement.quantiteSource === null || l.ajustement.quantiteSource === undefined ? null : milliText(toMilli(l.ajustement.quantiteSource)),
        obsolete: l.ajustement.perime, motifObsolescence: l.ajustement.perime ? (l.ajustement.motifPerime ?? "montant") : null,
      } : null,
      emplacement: { chantier: d.chantier, batiment: d.batiment, etage: d.etage, zone: d.zone, piece: d.piece },
    };
  });
  const total = totalEstimation(details);
  const parLot = agregerEstimation(details, "lot").map((g) => ({ lot: g.libelle, montant: centimesText(g.total.montant) }));
  const couts = syntheseCouts(total);
  const revetements = (input.metre ?? []).flatMap((m) => m.metre.revetements.map((r) => ({
    ref: r.id, pieceRef: r.pieceId, support: REVETEMENT_SUPPORT_LABELS[r.categorie], famille: REVETEMENT_FAMILLE_LABELS[r.revetement] ?? r.revetement, libelle: r.libelle,
    unite: r.unite === "ml" ? "ml" as const : "m²" as const,
    quantite: r.quantite === null ? null : r.unite === "ml" ? mmToMText(r.quantite) : mm2ToM2Text(r.quantite), etatProjet: r.etatProjet,
  })));
  const plans = sources.map((s) => ({ etageId: s.etageId, planId: s.planId, numero: s.numero, etat: s.etat, libelle: s.libelle, fige: s.figeLe !== null, source: s.estimation.source ?? "calcul" }));
  const hypotheses = {
    priorite: [...COEFFICIENT_PRIORITE], regle: COEFFICIENT_PRIORITE_TEXTE,
    plans: sources.map((s) => {
      const par = s.estimation.parametres ?? PARAMETRES_VIDES;
      const d = par.donnees;
      return {
        planRef: s.planId, coefficientGeneral: d.coefficientGeneral === null || d.coefficientGeneral === undefined ? null : decimalString(d.coefficientGeneral),
        coefficientsLots: Object.entries(d.coefficientsLots ?? {}).map(([lot, coefficient]) => ({ lot, coefficient: decimalString(coefficient) })),
        texte: d.hypotheses ?? null, revision: par.revision, modifieLe: par.updatedAt, modifiePar: par.updatedBy,
      };
    }),
  };
  // Hypothèses comprises : un texte ou un coefficient modifié donne une nouvelle clé (nouvelle version côté GP).
  const empreinte = fnv1a(JSON.stringify([lignes.map((l) => [l.ref, l.quantite, l.montantRetenu]), hypotheses.plans.map((h) => [h.planRef, h.coefficientGeneral, h.coefficientsLots, h.texte])]));
  return {
    contract: ESTIMATION_GP_CONTRACT, kind: "releve-metre/estimation", readiness: ESTIMATION_GP_READINESS,
    perimetre: { tools: "estimation-simplifiee", decideParGestionPro: ESTIMATION_GP_DECIDE_PAR_GESTION_PRO, gestionProLibreDeRechiffrer: true },
    montants: { devise: "EUR", base: "HT", nature: "estimative" },
    idempotencyKey: `${releveId}:${etat}:${plans.map((plan) => `${plan.planId}#${plan.numero}${plan.fige ? "F" : ""}`).sort().join(",")}:${empreinte}`,
    source: { application: "elsatia-tools", module: "releve-metre", exporteLe: input.exporteLe ?? new Date().toISOString(), releveId, etat, moteurs: { quantitatif: "quantitatif-v1", estimation: "estimation-v1" }, plans },
    hypotheses, quantitatif, pieces, prix, lignes,
    totaux: {
      total: centimesText(total.montant), ecartCorrections: centimesText(total.ecart), heures: milliText(total.heures),
      parEtat: { existant: centimesText(total.parEtat.existant), a_deposer: centimesText(total.parEtat.a_deposer), nouveau: centimesText(total.parEtat.nouveau), deplace: centimesText(total.parEtat.deplace) },
      parType: { materiau: centimesText(total.parType.materiau), main_d_oeuvre: centimesText(total.parType.main_d_oeuvre), forfait: centimesText(total.parType.forfait), autre: centimesText(total.parType.autre) },
      parLot, lignes: total.lignes, lignesSansPrix: total.sansPrix, correctionsObsoletes: details.filter((d) => d.ligne.ajustement?.perime).length,
    },
    etatsProjetes: { depose: centimesText(couts.depose), neuf: centimesText(couts.neuf), deplacement: centimesText(couts.deplacement), existant: centimesText(couts.existant), total: centimesText(couts.total) },
    revetements, photos: [...(input.photos ?? [])], annotations: [...(input.annotations ?? [])],
    anomalies: sources.flatMap((s) => s.estimation.anomalies.filter((a) => a.gravite !== "info").map((a) => ({ code: a.code, gravite: a.gravite, ouvrageRef: a.ouvrageId, pieceRef: a.pieceId, message: a.message }))),
  };
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Clés interdites dans le contrat : Tools ne produit ni devis (numérotation, statut), ni facture, ni commande, ni prix de
 * vente, ni TVA, ni marge, ni remise, ni acompte, ni conditions commerciales, ni signature client.
 */
const COMMERCIAL_KEY = /"[^"]*(numeroDevis|devisNumero|numeroFacture|facture|commande|signature|marge|remise|prixVente|prix_vente|tauxTva|tva|ttc|statutDevis|accepte|refuse|acompte|conditionsCommerciales|conditionsPaiement|conditionsReglement|escompte|echeancier)[^"]*"\s*:/i;

/**
 * Contrôle d'un contrat reçu (côté Gestion Pro) : version majeure 1, montants HT décimaux exacts, références
 * résolues, contrat quantitatif imbriqué recevable (sans prix), AUCUNE donnée commerciale. Retourne les défauts.
 */
export function validateEstimationGpPayload(payload: unknown): string[] {
  const issues: string[] = [];
  if (!isObject(payload)) return ["contrat absent"];
  const p = payload as Record<string, Json>;
  const contract = p.contract as Record<string, Json> | undefined;
  if (!isObject(contract) || contract.name !== ESTIMATION_GP_CONTRACT.name || typeof contract.version !== "string" || !/^1\.\d+\.\d+$/.test(contract.version)) issues.push("version de contrat non prise en charge");
  if (COMMERCIAL_KEY.test(JSON.stringify(payload))) issues.push("donnée commerciale interdite (devis, facture, commande, marge, remise, TVA, acompte, conditions commerciales, prix de vente)");
  if (!isObject(p.readiness) || (p.readiness as Record<string, Json>).devis !== "not-generated") issues.push("aucun devis ne doit être généré par le contrat");
  if (!isObject(p.montants) || (p.montants as Record<string, Json>).base !== "HT") issues.push("montants HT attendus");
  const q = p.quantitatif;
  for (const issue of validateQuantitatifGpPayload(q)) issues.push(`quantitatif : ${issue}`);
  const ouvrageRefs = new Set(isObject(q) && Array.isArray(q.ouvrages) ? (q.ouvrages as Record<string, Json>[]).map((o) => o.ref) : []);
  const quantiteRefs = new Set(isObject(q) && Array.isArray(q.lignes) ? (q.lignes as Record<string, Json>[]).map((l) => l.ref) : []);
  const money = (v: Json) => v === null || (typeof v === "string" && /^-?\d+\.\d{2}$/.test(v));
  const lignes = Array.isArray(p.lignes) ? (p.lignes as Record<string, Json>[]) : [];
  const refs = new Set<unknown>();
  for (const l of lignes) {
    if (refs.has(l.ref)) issues.push(`ligne en double : ${String(l.ref)}`);
    refs.add(l.ref);
    if (!ouvrageRefs.has(l.ouvrageRef)) issues.push(`ligne ${String(l.ref)} : ouvrage inconnu`);
    if (l.quantiteRef !== null && !quantiteRefs.has(l.quantiteRef)) issues.push(`ligne ${String(l.ref)} : quantité inconnue`);
    if (!money(l.montantRetenu) || !money(l.montantCalcule)) issues.push(`ligne ${String(l.ref)} : montant non décimal`);
    if (!(ETATS_PROJET as readonly string[]).includes(l.etatProjet as string)) issues.push(`ligne ${String(l.ref)} : état projeté inconnu`);
  }
  const prix = Array.isArray(p.prix) ? (p.prix as Record<string, Json>[]) : [];
  const coef = (v: Json) => typeof v === "string" && /^\d+(\.\d{1,4})?$/.test(v) && Number(v) >= 0.01 && Number(v) <= 10;
  for (const x of prix) {
    if (!ouvrageRefs.has(x.ouvrageRef)) issues.push(`prix : ouvrage inconnu ${String(x.ouvrageRef)}`);
    if (!coef(x.coefficient)) issues.push(`prix ${String(x.ouvrageRef)} : coefficient invalide`);
  }
  // 1.1.0 : hypothèses facultatives pour un contrat 1.0.x ; si présentes, plans connus et coefficients bornés.
  if (p.hypotheses !== undefined) {
    const h = p.hypotheses as Record<string, Json>;
    const planRefs = new Set(isObject(p.source) && Array.isArray((p.source as Record<string, Json>).plans) ? ((p.source as Record<string, Json>).plans as Record<string, Json>[]).map((x) => x.planId) : []);
    if (!isObject(h) || !Array.isArray(h.plans)) issues.push("hypothèses invalides");
    else for (const x of h.plans as Record<string, Json>[]) {
      if (!planRefs.has(x.planRef)) issues.push(`hypothèses : plan inconnu ${String(x.planRef)}`);
      if (x.coefficientGeneral !== null && !coef(x.coefficientGeneral)) issues.push(`hypothèses ${String(x.planRef)} : coefficient général invalide`);
      for (const l of Array.isArray(x.coefficientsLots) ? (x.coefficientsLots as Record<string, Json>[]) : []) if (!coef(l.coefficient)) issues.push(`hypothèses ${String(x.planRef)} : coefficient du lot ${String(l.lot)} invalide`);
    }
  }
  if (!isObject(p.totaux) || !money((p.totaux as Record<string, Json>).total)) issues.push("total non décimal");
  return issues;
}

// ── Port de persistance ───────────────────────────────────────────────────────

export type BibliothequePrix = { readonly bibliothequeId: string; readonly donnees: PrixDonnees; readonly revision: number; readonly updatedAt?: string };
export type EstimationCorrection = {
  readonly id: string; readonly ouvrageId: string; readonly pieceId: string | null; readonly etatProjet: EtatProjet; readonly nature: EstimationNature;
  readonly valeurCalculee: number | null; readonly valeurRetenue: number; readonly raison: string; readonly auteurId: string | null; readonly date: string;
  readonly retireLe: string | null; readonly retirePar: string | null; readonly raisonRetrait: string | null;
  /** Valeur source figée à la correction (1402) : quantité, unité, PU, montant automatique, coefficient et sa provenance. */
  readonly valeurSource: {
    readonly quantite: number | null; readonly unite: OuvrageUnite; readonly prixUnitaire: number | null; readonly montantCalcule: number | null;
    readonly coefficient: number | null; readonly coefficientSource: CoefficientSource | null;
  } | null;
};
export type EstimationCible = { readonly ouvrageId: string; readonly pieceId: string | null; readonly etatProjet: EtatProjet; readonly nature: EstimationNature };

export interface ReleveEstimationRepository {
  synthese(releveId: string, etat: MetreSyntheseEtat): Promise<EstimationSource[]>;
  planEstimation(planId: string): Promise<{ quantitatif: PlanQuantitatif; estimation: PlanEstimation }>;
  plansEtage(etageId: string): Promise<{ planId: string; numero: number; etat: PlanEtat; libelle: string | null; figeLe: string | null; planBaseId: string | null }[]>;
  savePrix(planId: string, ouvrageId: string, donnees: PrixDonnees): Promise<void>;
  importPrix(planId: string, prix: readonly { ouvrageId: string; donnees: PrixDonnees }[]): Promise<number>;
  deletePrix(planId: string, ouvrageId: string): Promise<void>;
  appliquerBibliotheque(planId: string, remplacer: boolean): Promise<number>;
  corriger(planId: string, cible: EstimationCible, valeurRetenue: number, raison: string): Promise<void>;
  retirerCorrection(id: string, raison: string | null): Promise<void>;
  corrections(planId: string): Promise<EstimationCorrection[]>;
  bibliothequePrix(releveId: string): Promise<BibliothequePrix[]>;
  saveBibliothequePrix(releveId: string, bibliothequeId: string, donnees: PrixDonnees): Promise<void>;
  deleteBibliothequePrix(releveId: string, bibliothequeId: string): Promise<void>;
  /** Coefficients et hypothèses du relevé (lecture ; `revision` 0 : jamais enregistrés). */
  parametres(releveId: string): Promise<EstimationParametres>;
  /** Enregistre les paramètres ; `revision` : celle lue (refus PT409 si modifiés ailleurs). */
  saveParametres(releveId: string, donnees: EstimationParametresDonnees, revision: number): Promise<EstimationParametres>;
}
