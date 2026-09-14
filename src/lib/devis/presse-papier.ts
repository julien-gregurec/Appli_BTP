/**
 * Presse-papier de LIGNES de devis (GP V1) — module PUR.
 *
 * Copier une ou plusieurs lignes (ligne libre, article, titre, sous-titre, commentaire, sous-total,
 * remise, vide, séparateur, saut de page, ouvrage avec ses composants) et les coller dans le même
 * devis, un autre devis ou un autre onglet. Le presse-papier transporte un document JSON versionné
 * (`elsatia/devis-lines-v1`) qui ne contient que des données métier : jamais d'identifiant technique
 * (clé de ligne, identifiant de devis, dates, auteur). Chaque élément collé reçoit une NOUVELLE clé ;
 * les sous-totaux ne sont jamais des valeurs figées (recalculés à l'affichage) et les remises de
 * section sont recalculées dans le devis cible.
 *
 * Sécurité : le presse-papier est marqué de l'entreprise d'origine ; un collage dans une autre
 * entreprise est refusé sans rien créer. Les coûts (prix d'achat, coût main-d'œuvre, coefficient)
 * ne sont copiés que si l'utilisateur voit les coûts, et retirés au collage s'il ne les voit pas —
 * la base reste l'autorité (l'enregistrement n'écrit les coûts qu'avec `gerer_couts_devis`).
 */
import type { OrigineLigneLibre } from "@/lib/devis/enregistrement-v2";
import { cleElement, insererLigne, insererOuvrage, recalculerRemisesSection, TYPES_LIGNE, type EtatElements } from "@/lib/devis/editeur-etat";
import type { InstanceOuvrage, LigneOuvrage } from "@/lib/devis/ouvrages";
import type { ElementDevis, LigneLibre } from "@/lib/devis/presentation";
import { estTypeLigne, typeDe } from "@/lib/devis/types-ligne";

export const FORMAT_PRESSE_PAPIER = "elsatia/devis-lines-v1";
export const VERSION_PRESSE_PAPIER = 1;
/** Clé de repli locale (même navigateur, tous onglets) quand l'API presse-papier n'est pas disponible. */
export const CLE_STOCKAGE_PRESSE_PAPIER = "elsatia.devis.presse-papier.v1";
export const LIMITE_ELEMENTS = 2000;

export type LigneCopiee = { type: "ligne"; ligne: Omit<LigneLibre, "cle">; origine: OrigineLigneLibre | null };
export type OuvrageCopie = { type: "ouvrage"; instance: Omit<InstanceOuvrage, "cle" | "ordre"> };
export type ElementCopie = LigneCopiee | OuvrageCopie;

export type PayloadPressePapier = {
  format: typeof FORMAT_PRESSE_PAPIER;
  version: typeof VERSION_PRESSE_PAPIER;
  entrepriseId: string;
  copieLe: string;
  elements: ElementCopie[];
};

export type ContextePressePapier = { entrepriseId: string; voirCouts: boolean };

export type PositionCollage = { type: "apres"; cle: string } | { type: "avant"; cle: string } | { type: "fin" };

const CLES_ORIGINE: ReadonlyArray<keyof OrigineLigneLibre> = ["origine", "sourceCatalogue", "sourceId", "referenceInterne", "referenceFabricant", "prixAchatHt", "famille", "fournisseur", "codeFournisseur", "coutMainOeuvreHt", "coefficient"];
const CLES_COUT_ORIGINE: ReadonlyArray<keyof OrigineLigneLibre> = ["prixAchatHt", "coutMainOeuvreHt", "coefficient"];

function origineSansCouts(origine: OrigineLigneLibre): OrigineLigneLibre {
  const copie = { ...origine };
  for (const k of CLES_COUT_ORIGINE) delete copie[k];
  return copie;
}

function ligneOuvrageSansCouts(l: LigneOuvrage): LigneOuvrage {
  return { ...l, prixAchatHt: null };
}

/** Lignes d'un ouvrage sans prix d'achat ; le modèle instantané n'en porte jamais par construction. */
function instanceSansCouts<I extends Omit<InstanceOuvrage, "cle" | "ordre">>(i: I): I {
  return { ...i, lignes: i.lignes.map(ligneOuvrageSansCouts) };
}

/**
 * Construit le presse-papier à partir des clés sélectionnées, dans l'ordre du devis. Un ouvrage est
 * copié entier (parent + composants + modèle instantané) : jamais un demi-ouvrage.
 */
export function copierElements(etat: EtatElements, cles: readonly string[], ctx: ContextePressePapier, maintenant: Date = new Date()): PayloadPressePapier {
  const voulues = new Set(cles);
  const elements = [...etat.elements]
    .sort((a, b) => a.ordre - b.ordre)
    .filter((e) => voulues.has(cleElement(e)))
    .map((e): ElementCopie => {
      if (e.type === "ligne") {
        const ligne: Partial<LigneLibre> = { ...e.ligne };
        delete ligne.cle;
        const origine = etat.origines[e.ligne.cle] ?? null;
        return { type: "ligne", ligne: ligne as Omit<LigneLibre, "cle">, origine: origine ? (ctx.voirCouts ? { ...origine } : origineSansCouts(origine)) : null };
      }
      const instance: Partial<InstanceOuvrage> = { ...e.instance, modele: { ...e.instance.modele, auteur: null } };
      delete instance.cle;
      delete instance.ordre;
      const copie = instance as Omit<InstanceOuvrage, "cle" | "ordre">;
      return { type: "ouvrage", instance: ctx.voirCouts ? copie : instanceSansCouts(copie) };
    });
  return { format: FORMAT_PRESSE_PAPIER, version: VERSION_PRESSE_PAPIER, entrepriseId: ctx.entrepriseId, copieLe: maintenant.toISOString(), elements };
}

export function serialiserPressePapier(payload: PayloadPressePapier): string {
  return JSON.stringify(payload);
}

/** Vrai si ce texte ressemble à un presse-papier de lignes (sans le valider). */
export function ressembleAPressePapier(texte: unknown): boolean {
  return typeof texte === "string" && texte.trimStart().startsWith("{") && texte.includes(FORMAT_PRESSE_PAPIER);
}

export type MotifRefus = "format" | "entreprise" | "invalide" | "vide";
export type LecturePressePapier = { ok: true; payload: PayloadPressePapier } | { ok: false; motif: MotifRefus };

const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const estTexte = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const texteOuNul = (v: unknown, max: number): string | null | undefined => (v === null || v === undefined ? null : estTexte(v, max) ? v : undefined);
const nombreOuNul = (v: unknown): number | null | undefined => (v === null || v === undefined ? null : estNombre(v) ? v : undefined);
const NATURES = new Set(["article", "prestation", "main_oeuvre", "location", "materiel", "sous_traitance", "libre"]);
const ORIGINES_OUVRAGE = new Set(["modele", "ajout_manuel", "ajustement"]);
const MODES = new Set(["regroupe", "semi_detaille", "eclate", "personnalise"]);

function lireLigne(brut: unknown): LigneCopiee | null {
  if (!brut || typeof brut !== "object") return null;
  const b = brut as Record<string, unknown>;
  const l = b.ligne as Record<string, unknown> | undefined;
  if (!l || typeof l !== "object") return null;
  if (!estTexte(l.designation, 1000)) return null;
  const description = texteOuNul(l.description, 5000); if (description === undefined) return null;
  if (!TYPES_LIGNE.includes(l.type as never)) return null;
  if (!estNombre(l.quantite) || !estNombre(l.prixUnitaireHt) || !estNombre(l.remiseLignePct) || !estNombre(l.tauxTva)) return null;
  if (l.remiseLignePct < 0 || l.remiseLignePct > 100 || l.tauxTva < 0 || l.tauxTva > 100) return null;
  if (l.typeLigne !== undefined && l.typeLigne !== null && !estTypeLigne(l.typeLigne)) return null;
  const remiseSectionPct = nombreOuNul(l.remiseSectionPct); if (remiseSectionPct === undefined) return null;
  const commentaireInterne = texteOuNul(l.commentaireInterne, 2000); if (commentaireInterne === undefined) return null;
  const referenceInterne = texteOuNul(l.referenceInterne, 120); if (referenceInterne === undefined) return null;
  const ligne: Omit<LigneLibre, "cle"> = {
    designation: l.designation, description, type: l.type as LigneLibre["type"], quantite: l.quantite, unite: estTexte(l.unite, 40) ? l.unite : "u",
    prixUnitaireHt: l.prixUnitaireHt, remiseLignePct: l.remiseLignePct, tauxTva: l.tauxTva,
    typeLigne: (l.typeLigne ?? null) as LigneLibre["typeLigne"], remiseSectionPct, commentaireInterne, referenceInterne,
  };
  let origine: OrigineLigneLibre | null = null;
  if (b.origine !== null && b.origine !== undefined) {
    if (typeof b.origine !== "object") return null;
    const o = b.origine as Record<string, unknown>;
    origine = {};
    for (const k of CLES_ORIGINE) {
      const v = o[k];
      if (v === undefined || v === null) continue;
      if (k === "origine") { if (!["saisie", "catalogue", "ia", "modele"].includes(String(v))) return null; origine.origine = v as OrigineLigneLibre["origine"]; continue; }
      if (k === "sourceCatalogue") { if (!["prestation", "article"].includes(String(v))) return null; origine.sourceCatalogue = v as "prestation" | "article"; continue; }
      if (["prixAchatHt", "coutMainOeuvreHt", "coefficient"].includes(k)) { if (!estNombre(v)) return null; (origine as Record<string, unknown>)[k] = v; continue; }
      if (!estTexte(v, 250)) return null;
      (origine as Record<string, unknown>)[k] = v;
    }
  }
  return { type: "ligne", ligne, origine };
}

function lireLigneOuvrage(brut: unknown): LigneOuvrage | null {
  if (!brut || typeof brut !== "object") return null;
  const l = brut as Record<string, unknown>;
  if (!estTexte(l.cle, 120) || !estTexte(l.designation, 1000) || !estTexte(l.unite, 40)) return null;
  if (!ORIGINES_OUVRAGE.has(String(l.origine)) || !NATURES.has(String(l.nature)) || !TYPES_LIGNE.includes(l.type as never)) return null;
  if (!estNombre(l.quantite) || !estNombre(l.prixVenteHt) || !estNombre(l.tauxTva) || !estNombre(l.remiseLignePct) || !estNombre(l.ordre) || !estNombre(l.pertePct)) return null;
  const prixAchatHt = nombreOuNul(l.prixAchatHt); if (prixAchatHt === undefined) return null;
  return { ...(l as unknown as LigneOuvrage), prixAchatHt };
}

function lireOuvrage(brut: unknown): OuvrageCopie | null {
  if (!brut || typeof brut !== "object") return null;
  const i = (brut as Record<string, unknown>).instance as Record<string, unknown> | undefined;
  if (!i || typeof i !== "object") return null;
  if (!estTexte(i.ouvrageId, 64) || !estNombre(i.version) || !estTexte(i.nom, 200) || !estTexte(i.unitePrincipale, 40) || !estNombre(i.quantitePrincipale) || i.quantitePrincipale <= 0) return null;
  if (!estTexte(i.libelleClient, 1000) || !MODES.has(String(i.mode)) || !Array.isArray(i.lignes) || !Array.isArray(i.options) || !i.modele || typeof i.modele !== "object") return null;
  const lignes: LigneOuvrage[] = [];
  for (const l of i.lignes) { const lu = lireLigneOuvrage(l); if (!lu) return null; lignes.push(lu); }
  const instance = { ...(i as unknown as Omit<InstanceOuvrage, "cle" | "ordre">), lignes, options: i.options.filter((o): o is string => typeof o === "string") };
  return { type: "ouvrage", instance };
}

/**
 * Lit et VALIDE strictement un presse-papier. Un texte qui n'est pas un presse-papier de lignes rend
 * `format` (le collage de texte ordinaire suit son cours) ; un presse-papier d'une autre entreprise
 * rend `entreprise` ; un document corrompu rend `invalide`. Les coûts sont retirés si l'utilisateur
 * ne les voit pas.
 */
export function lirePressePapier(texte: unknown, ctx: ContextePressePapier): LecturePressePapier {
  if (!ressembleAPressePapier(texte)) return { ok: false, motif: "format" };
  let brut: unknown;
  try { brut = JSON.parse(texte as string); } catch { return { ok: false, motif: "invalide" }; }
  if (!brut || typeof brut !== "object") return { ok: false, motif: "invalide" };
  const p = brut as Record<string, unknown>;
  if (p.format !== FORMAT_PRESSE_PAPIER || p.version !== VERSION_PRESSE_PAPIER) return { ok: false, motif: "invalide" };
  if (!estTexte(p.entrepriseId, 64) || !Array.isArray(p.elements)) return { ok: false, motif: "invalide" };
  if (p.entrepriseId !== ctx.entrepriseId) return { ok: false, motif: "entreprise" };
  if (p.elements.length === 0) return { ok: false, motif: "vide" };
  if (p.elements.length > LIMITE_ELEMENTS) return { ok: false, motif: "invalide" };
  const elements: ElementCopie[] = [];
  for (const e of p.elements) {
    const type = (e as Record<string, unknown> | null)?.type;
    const lu = type === "ligne" ? lireLigne(e) : type === "ouvrage" ? lireOuvrage(e) : null;
    if (!lu) return { ok: false, motif: "invalide" };
    if (!ctx.voirCouts) {
      if (lu.type === "ligne" && lu.origine) lu.origine = origineSansCouts(lu.origine);
      if (lu.type === "ouvrage") lu.instance = instanceSansCouts(lu.instance);
    }
    elements.push(lu);
  }
  return { ok: true, payload: { format: FORMAT_PRESSE_PAPIER, version: VERSION_PRESSE_PAPIER, entrepriseId: p.entrepriseId, copieLe: estTexte(p.copieLe, 40) ? p.copieLe : "", elements } };
}

/**
 * Colle les éléments à la position demandée. Chaque élément reçoit une nouvelle clé, son origine est
 * recopiée sous cette clé, les remises de section sont recalculées. L'état reçu n'est jamais modifié.
 */
export function collerElements(etat: EtatElements, elements: readonly ElementCopie[], position: PositionCollage, genererCle: () => string): { etat: EtatElements; clesAjoutees: string[] } {
  const tries = [...etat.elements].sort((a, b) => a.ordre - b.ordre);
  const cles = tries.map(cleElement);
  let apres: string | null;
  if (position.type === "fin") apres = null;
  else if (position.type === "apres") apres = position.cle;
  else { const i = cles.indexOf(position.cle); apres = i > 0 ? cles[i - 1] : "__debut__"; }
  let courant: EtatElements = etat;
  const clesAjoutees: string[] = [];
  for (const e of elements) {
    const cle = genererCle();
    clesAjoutees.push(cle);
    if (e.type === "ligne") {
      courant = insererLigne(courant, cle, typeDe(e.ligne), apres === "__debut__" ? null : apres, { ...e.ligne, cle });
      // L'origine (références, coûts autorisés) est recopiée sous la nouvelle clé, après l'insertion qui pose « saisie ».
      if (e.origine) courant = { ...courant, origines: { ...courant.origines, [cle]: { ...e.origine } } };
      if (apres === "__debut__") courant = placerEnTete(courant, cle);
    } else {
      const instance: InstanceOuvrage = { ...e.instance, cle, ordre: 0 };
      courant = insererOuvrage(courant, instance, apres === "__debut__" ? null : apres);
      if (apres === "__debut__") courant = placerEnTete(courant, cle);
    }
    apres = cle;
  }
  return { etat: recalculerRemisesSection(courant), clesAjoutees };
}

/** `insererLigne(…, null)` ajoute en fin ; pour « avant la première ligne » on remonte l'élément en tête. */
function placerEnTete(etat: EtatElements, cle: string): EtatElements {
  const tries = [...etat.elements].sort((a, b) => a.ordre - b.ordre);
  const element = tries.find((e) => cleElement(e) === cle);
  if (!element) return etat;
  const autres = tries.filter((e) => cleElement(e) !== cle);
  const elements: ElementDevis[] = [element, ...autres].map((e, i) => ({ ...e, ordre: i + 1 }));
  return { ...etat, elements };
}

export function nombreDeLignes(elements: readonly ElementCopie[]): number {
  return elements.length;
}

export function libelleCopie(n: number): string {
  return n === 1 ? "1 ligne copiée" : `${n} lignes copiées`;
}

export function libelleCollage(n: number): string {
  return n === 1 ? "1 ligne ajoutée au devis" : `${n} lignes ajoutées au devis`;
}

export function messageRefus(motif: MotifRefus): string {
  switch (motif) {
    case "entreprise": return "Ce presse-papier vient d’une autre entreprise : collage refusé, rien n’a été créé.";
    case "invalide": return "Presse-papier illisible ou corrompu : collage refusé, rien n’a été créé.";
    case "vide": return "Le presse-papier ne contient aucune ligne.";
    case "format": return "Le presse-papier ne contient pas de lignes de devis.";
  }
}
