/**
 * Filigranes des devis et factures — module PUR.
 *
 * Un filigrane dit l'état d'un document (BROUILLON, PAYÉE, DUPLICATA…) ou porte l'identité de
 * l'entreprise. Il ne doit JAMAIS masquer un montant ni une mention obligatoire, ni rendre le
 * document illisible.
 *
 * La lisibilité n'est pas laissée au goût de chacun : l'opacité est BORNÉE (au plus 15 %), et
 * une fonction mesure le contraste résultant selon la formule WCAG. Avec cette borne, quelle
 * que soit la couleur choisie, le filigrane reste pâle (contraste ≤ 1,5 sur fond blanc) et le
 * texte du document reste lisible par-dessus (contraste ≥ 4,5).
 *
 * Priorité de résolution : duplicata > valeur FIGÉE à l'émission > réglage du document >
 * réglage « brouillon » de l'entreprise > réglage par défaut de l'entreprise > aucun.
 */

export const PRESETS_FILIGRANE = [
  { cle: "BROUILLON", texte: "BROUILLON" },
  { cle: "PROVISOIRE", texte: "PROVISOIRE" },
  { cle: "A_VALIDER", texte: "À VALIDER" },
  { cle: "PAYEE", texte: "PAYÉE" },
  { cle: "DUPLICATA", texte: "DUPLICATA" },
  { cle: "ANNULEE", texte: "ANNULÉE" },
  { cle: "COPIE", texte: "COPIE" },
] as const;

export type PresetFiligrane = (typeof PRESETS_FILIGRANE)[number]["cle"];

export type TypeFiligrane = "aucun" | "logo" | "texte" | "logo_texte";

export type Filigrane = {
  type: TypeFiligrane;
  /** Préréglage ; `null` : texte libre. */
  preset: PresetFiligrane | null;
  texte: string | null;
  position: "centre" | "haut" | "bas";
  repetition: boolean;
  /** Largeur du motif en % de la largeur de page. */
  taillePct: number;
  rotationDeg: number;
  couleur: string;
  opacite: number;
  pages: "toutes" | "premiere";
};

export const OPACITE_MIN = 0.03;
export const OPACITE_MAX = 0.15;
export const TEXTE_MAX = 40;

export const FILIGRANE_AUCUN: Filigrane = {
  type: "aucun",
  preset: null,
  texte: null,
  position: "centre",
  repetition: false,
  taillePct: 60,
  rotationDeg: -30,
  couleur: "#1f2937",
  opacite: 0.08,
  pages: "toutes",
};

const borne = (x: number, min: number, max: number, defaut: number) =>
  Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : defaut;

/**
 * Filigrane assaini : bornes appliquées, texte raccourci, couleur validée. Toute valeur qui
 * sortirait des bornes est RAMENÉE dedans, jamais refusée : un réglage extrême donne le
 * filigrane le plus marqué admis, pas un document illisible.
 */
export function normaliserFiligrane(f: Partial<Filigrane> | null | undefined): Filigrane {
  if (!f) return { ...FILIGRANE_AUCUN };
  const preset = PRESETS_FILIGRANE.find((p) => p.cle === f.preset)?.cle ?? null;
  const texteLibre = (f.texte ?? "").replace(/\s+/g, " ").trim().slice(0, TEXTE_MAX) || null;
  const texte = preset ? PRESETS_FILIGRANE.find((p) => p.cle === preset)!.texte : texteLibre;
  const type: TypeFiligrane = ["aucun", "logo", "texte", "logo_texte"].includes(f.type as string) ? f.type! : "aucun";
  return {
    type: (type === "texte" || type === "logo_texte") && !texte ? (type === "logo_texte" ? "logo" : "aucun") : type,
    preset,
    texte,
    position: f.position === "haut" || f.position === "bas" ? f.position : "centre",
    repetition: f.repetition === true,
    taillePct: borne(Number(f.taillePct), 10, 80, 60),
    rotationDeg: borne(Number(f.rotationDeg), -60, 60, -30),
    couleur: /^#[0-9a-f]{6}$/i.test(f.couleur ?? "") ? f.couleur! : "#1f2937",
    opacite: borne(Number(f.opacite), OPACITE_MIN, OPACITE_MAX, 0.08),
    pages: f.pages === "premiere" ? "premiere" : "toutes",
  };
}

/** Réglages d'entreprise : un défaut, et un filigrane propre aux brouillons. */
export type ReglagesFiligraneEntreprise = {
  defaut: Partial<Filigrane> | null;
  brouillon: Partial<Filigrane> | null;
};

export type ContexteFiligrane = {
  typeDocument: "devis" | "facture";
  statut: string;
  /** Filigrane figé dans l'instantané à l'émission ; `undefined` s'il n'y en a pas. */
  fige?: Partial<Filigrane> | null;
  /** Réglage propre au document ; `undefined` : hérite de l'entreprise. */
  document?: Partial<Filigrane> | null;
  entreprise?: ReglagesFiligraneEntreprise | null;
  estDuplicata?: boolean;
};

export type FiligraneResolu = Filigrane & { origine: "duplicata" | "fige" | "document" | "entreprise_brouillon" | "entreprise" | "aucun" };

const presetTexte = (cle: PresetFiligrane, base: Filigrane): Filigrane =>
  ({ ...base, type: "texte", preset: cle, texte: PRESETS_FILIGRANE.find((p) => p.cle === cle)!.texte });

export function resoudreFiligrane(c: ContexteFiligrane): FiligraneResolu {
  const brouillon = c.statut === "brouillon";
  if (c.estDuplicata && !brouillon) {
    return { ...presetTexte("DUPLICATA", normaliserFiligrane({ ...FILIGRANE_AUCUN, opacite: 0.1 })), origine: "duplicata" };
  }
  if (!brouillon && c.fige !== undefined) return { ...normaliserFiligrane(c.fige), origine: "fige" };
  if (c.document !== undefined) return { ...normaliserFiligrane(c.document), origine: "document" };
  if (brouillon && c.entreprise?.brouillon) return { ...normaliserFiligrane(c.entreprise.brouillon), origine: "entreprise_brouillon" };
  if (c.entreprise?.defaut) return { ...normaliserFiligrane(c.entreprise.defaut), origine: "entreprise" };
  return { ...FILIGRANE_AUCUN, origine: "aucun" };
}

/**
 * Le filigrane d'un document peut-il encore changer ? Seulement en brouillon : à l'émission,
 * il est figé avec le reste du document. Un duplicata ne modifie jamais l'original.
 */
export function filigraneModifiable(statut: string): boolean {
  return statut === "brouillon";
}

/** Texte accessible (propriétés du PDF, `aria-label`) ; `null` s'il n'y a pas de filigrane. */
export function descriptionAccessible(f: Filigrane): string | null {
  if (f.type === "aucun") return null;
  const morceaux = [f.type !== "texte" ? "logo de l’entreprise" : null, f.type !== "logo" ? f.texte : null].filter(Boolean);
  return `Filigrane : ${morceaux.join(" et ")}`;
}

// ── Lisibilité mesurée ───────────────────────────────────────────────────────

function composantes(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

/** Couleur perçue du filigrane posé sur du blanc. */
export function couleurSurBlanc(couleur: string, opacite: number): [number, number, number] {
  return composantes(couleur).map((c) => Math.round(c * opacite + 255 * (1 - opacite))) as [number, number, number];
}

export type Lisibilite = {
  /** Contraste filigrane / blanc : doit rester faible pour que ce soit un filigrane. */
  contrasteFiligrane: number;
  /** Contraste du texte du document posé sur le filigrane : doit rester lisible. */
  contrasteTexte: number;
  lisible: boolean;
};

export const CONTRASTE_FILIGRANE_MAX = 1.5;
export const CONTRASTE_TEXTE_MIN = 4.5;

export function lisibilite(f: Filigrane, couleurTexte = "#0d1b2a"): Lisibilite {
  const pose = couleurSurBlanc(f.couleur, f.opacite);
  const contrasteFiligrane = contraste(pose, [255, 255, 255]);
  const contrasteTexte = contraste(composantes(/^#[0-9a-f]{6}$/i.test(couleurTexte) ? couleurTexte : "#0d1b2a"), pose);
  return {
    contrasteFiligrane,
    contrasteTexte,
    lisible: f.type === "aucun" || (contrasteFiligrane <= CONTRASTE_FILIGRANE_MAX && contrasteTexte >= CONTRASTE_TEXTE_MIN),
  };
}
