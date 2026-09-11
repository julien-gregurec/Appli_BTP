/**
 * Pagination A4 des devis et factures — module PUR.
 *
 * Les coupures de page sont décidées ICI, à partir des données, et non par le moteur de rendu.
 * L'aperçu de l'éditeur et le PDF Chromium dessinent ensuite exactement les mêmes pages : la
 * page 2 de l'aperçu est la page 2 du PDF, avec les mêmes lignes.
 *
 * Les hauteurs sont ESTIMÉES à partir de la taille de police, de la largeur des colonnes et de
 * la longueur des textes, avec une marge de sécurité. L'estimation est volontairement prudente :
 * une page peut finir un peu tôt, jamais déborder. Le rendu mesure malgré tout chaque page et
 * signale un débordement (« saut de page incorrect ») plutôt que de le masquer — un montant
 * tronqué ou caché ne doit jamais sortir.
 */

import type { VueDocument } from "@/lib/devis/document-modele";
import type { LigneClient } from "@/lib/devis/presentation";

export const PAGE_A4_MM = { largeur: 210, hauteur: 297 } as const;
export const MARGES_MM = { haut: 12, bas: 10, gauche: 12, droite: 12 } as const;
/** Bande réservée au pied de page (« Page x / n »). */
export const PIED_MM = 8;
export const PX_PAR_MM = 96 / 25.4;
/** Marge de sécurité appliquée à toutes les hauteurs estimées. */
export const SECURITE = 1.12;

export const CONTENU_LARGEUR_PX = (PAGE_A4_MM.largeur - MARGES_MM.gauche - MARGES_MM.droite) * PX_PAR_MM;
export const CONTENU_HAUTEUR_PX = (PAGE_A4_MM.hauteur - MARGES_MM.haut - MARGES_MM.bas - PIED_MM) * PX_PAR_MM;

/** Part de la largeur utile occupée par la colonne « Désignation ». */
export const PART_COLONNE_DESIGNATION = 0.46;

export type BlocPage =
  | { type: "entete" }
  | { type: "rappel" }
  | { type: "destinataire" }
  | { type: "tableau"; lignes: LigneClient[]; suite: boolean }
  | { type: "totaux" }
  | { type: "conditions" }
  | { type: "notes" }
  | { type: "bon_pour_accord" }
  | { type: "mentions" };

export type PageDocument = {
  numero: number;
  total: number;
  blocs: BlocPage[];
  hauteurEstimeePx: number;
  /** Un bloc indivisible plus haut qu'une page entière : à signaler, jamais à tronquer. */
  debordement: boolean;
};

// ── Estimation des hauteurs ──────────────────────────────────────────────────

const LARGEUR_CARACTERE: Record<VueDocument["style"]["police"], number> = {
  arial: 0.55,
  trebuchet: 0.55,
  georgia: 0.57,
  verdana: 0.62,
};

/** Nombre de lignes qu'occupe un texte dans une largeur donnée. */
export function lignesDeTexte(texte: string | null | undefined, largeurPx: number, policePx: number, facteur: number): number {
  if (!texte) return 0;
  const parLigne = Math.max(1, Math.floor(largeurPx / (policePx * facteur)));
  return texte.split("\n").reduce((n, paragraphe) => n + Math.max(1, Math.ceil(paragraphe.length / parLigne)), 0);
}

export type Hauteurs = {
  entete: number;
  rappel: number;
  destinataire: number;
  enTeteTableau: number;
  ligne: (l: LigneClient) => number;
  totaux: number;
  conditions: number;
  notes: number;
  bonPourAccord: number;
  mentions: number;
};

export function estimerHauteurs(vue: VueDocument): Hauteurs {
  const f = vue.style.taillePolice;
  const c = LARGEUR_CARACTERE[vue.style.police];
  const hl = (px: number) => px * 1.45;
  const s = (h: number) => Math.ceil(h * SECURITE);
  const largeurTexte = CONTENU_LARGEUR_PX * 0.6;
  const e = vue.emetteur;

  const lignesEmetteur = 1 + [e.raisonSociale, e.adresse || e.ville, e.siret].filter(Boolean).length
    + lignesDeTexte(e.texteEntete, largeurTexte, f, c);
  const entete = Math.max(vue.style.afficherLogo && e.logoUrl ? 64 : 0, 26 + lignesEmetteur * hl(f), 110) + 40;

  const d = vue.destinataire;
  const destinataire = 16 + (1 + (d.adresse || d.ville ? 1 : 0) + (d.siret ? 1 : 0)) * hl(f) + 24;

  const policeTableau = f - 1;
  const policeDescription = f - 2;
  const largeurDesignation = CONTENU_LARGEUR_PX * PART_COLONNE_DESIGNATION - 16;

  const ligne = (l: LigneClient) => {
    const largeur = l.niveau === 1 ? largeurDesignation - 14 : largeurDesignation;
    const nDesignation = lignesDeTexte(l.designation, largeur, policeTableau, c) || 1;
    const nDescription = vue.style.afficherDescriptions ? lignesDeTexte(l.description, largeur, policeDescription, c) : 0;
    const mention = l.mentionTva ? hl(policeDescription) : 0;
    return s(14 + nDesignation * hl(policeTableau) + nDescription * hl(policeDescription) + mention + 1);
  };

  const t = vue.totaux;
  const lignesTotaux = 1 + (t.remiseGlobaleHt ? 2 : 0) + (t.ventilation.length > 1 ? t.ventilation.length : 0) + 2;
  const texte = (x: string | null) => (x ? s(30 + lignesDeTexte(x, CONTENU_LARGEUR_PX - 24, f, c) * hl(f)) : 0);
  const mentions = vue.mentions.length + 1;

  return {
    entete: s(entete),
    rappel: s(30),
    destinataire: s(destinataire),
    enTeteTableau: s(14 + hl(10)),
    ligne,
    totaux: s(20 + lignesTotaux * 24 + (vue.ecartTotaux ? 20 : 0)),
    conditions: texte(vue.conditions),
    notes: texte(vue.notes),
    bonPourAccord: vue.bonPourAccord ? s(118) : 0,
    mentions: s(20 + mentions * 15 + (vue.duplicata ? 15 : 0)),
  };
}

// ── Découpage ────────────────────────────────────────────────────────────────

/**
 * Découpe le document en pages A4.
 *
 * - l'en-tête complet et le destinataire ouvrent la page 1 ; les suivantes portent un rappel ;
 * - l'en-tête du tableau est répété sur chaque page qui contient des lignes ;
 * - l'en-tête d'un ouvrage n'est jamais laissé seul en bas de page : il part avec son premier
 *   composant ;
 * - les totaux, les conditions, les notes, le « bon pour accord » et les mentions sont
 *   indivisibles ;
 * - chaque ligne apparaît exactement une fois, dans l'ordre.
 */
export function paginer(vue: VueDocument, hauteurs: Hauteurs = estimerHauteurs(vue), hauteurUtile = CONTENU_HAUTEUR_PX): PageDocument[] {
  const pages: Array<Omit<PageDocument, "total">> = [];
  let page: Omit<PageDocument, "total"> = { numero: 1, blocs: [], hauteurEstimeePx: 0, debordement: false };
  let tableau: Extract<BlocPage, { type: "tableau" }> | null = null;
  let lignesDejaPosees = false;

  const nouvellePage = () => {
    pages.push(page);
    page = { numero: pages.length + 1, blocs: [{ type: "rappel" }], hauteurEstimeePx: hauteurs.rappel, debordement: false };
    tableau = null;
  };
  const tient = (h: number) => page.hauteurEstimeePx + h <= hauteurUtile;
  const poser = (bloc: BlocPage, h: number) => {
    // Un bloc plus haut qu'une page vide est posé seul et signalé.
    if (!tient(h) && page.blocs.some((b) => b.type !== "rappel")) nouvellePage();
    if (!tient(h)) page.debordement = true;
    page.blocs.push(bloc);
    page.hauteurEstimeePx += h;
  };

  poser({ type: "entete" }, hauteurs.entete);
  poser({ type: "destinataire" }, hauteurs.destinataire);

  vue.lignes.forEach((ligne, i) => {
    const suivante = vue.lignes[i + 1];
    let besoin = hauteurs.ligne(ligne);
    if (ligne.enTeteOuvrage && suivante?.niveau === 1) besoin += hauteurs.ligne(suivante);
    if (!tableau) besoin += hauteurs.enTeteTableau;
    if (!tient(besoin) && page.blocs.some((b) => b.type === "tableau" || b.type === "destinataire")) {
      nouvellePage();
    }
    if (!tableau) {
      tableau = { type: "tableau", lignes: [], suite: lignesDejaPosees };
      page.blocs.push(tableau);
      page.hauteurEstimeePx += hauteurs.enTeteTableau;
    }
    const h = hauteurs.ligne(ligne);
    if (!tient(h)) page.debordement = true;
    tableau.lignes.push(ligne);
    page.hauteurEstimeePx += h;
    lignesDejaPosees = true;
  });

  poser({ type: "totaux" }, hauteurs.totaux);
  if (hauteurs.conditions) poser({ type: "conditions" }, hauteurs.conditions);
  if (hauteurs.notes) poser({ type: "notes" }, hauteurs.notes);
  if (hauteurs.bonPourAccord) poser({ type: "bon_pour_accord" }, hauteurs.bonPourAccord);
  poser({ type: "mentions" }, hauteurs.mentions);
  pages.push(page);

  return pages.map((p) => ({ ...p, total: pages.length }));
}
