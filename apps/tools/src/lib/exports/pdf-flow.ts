/**
 * §5 — Flux paginé pour le dossier PDF chantier.
 *
 * Le lot P0 dessinait chaque section à un `y` libre, sans jamais vérifier le bas de page :
 * la table de report s'interrompait silencieusement (`break`) au-delà d'une quarantaine de
 * lignes, et les sections Construction / Quantités écrivaient hors page. Pour un document
 * destiné au chantier, une ligne de report perdue sans avertissement est un défaut de
 * fiabilité, pas un défaut esthétique.
 *
 * `PdfFlow` centralise le curseur vertical et la rupture de page : toute écriture passe par
 * `ensure(hauteur)`, qui ajoute une page dès que le contenu ne tient plus dans la zone utile.
 * Aucun contenu n'est donc tronqué.
 *
 * L'en-tête et le pied de page ne sont volontairement PAS dessinés pendant le flux : le
 * nombre total de pages n'est connu qu'à la fin. `stampPages` les appose en seconde passe
 * (`pdf.setPage`), ce qui garantit une pagination « Page X / Y » exacte.
 */

import type { jsPDF } from "jspdf";

export type PdfFlowOptions = {
  /** Ordonnée de la première ligne de contenu, sous l'en-tête. */
  top?: number;
  /** Marge basse réservée au pied de page. */
  bottom?: number;
  left?: number;
  right?: number;
};

export const DEFAULT_FLOW_TOP = 26;
export const DEFAULT_FLOW_BOTTOM = 16;
export const DEFAULT_FLOW_SIDE = 10;

export class PdfFlow {
  readonly pdf: jsPDF;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  y: number;
  /** Callback invoqué après chaque rupture de page (répétition d'un en-tête de tableau…). */
  onPageBreak?: (flow: PdfFlow) => void;

  constructor(pdf: jsPDF, options: PdfFlowOptions = {}) {
    this.pdf = pdf;
    this.top = options.top ?? DEFAULT_FLOW_TOP;
    this.bottom = options.bottom ?? DEFAULT_FLOW_BOTTOM;
    this.left = options.left ?? DEFAULT_FLOW_SIDE;
    this.right = options.right ?? DEFAULT_FLOW_SIDE;
    this.y = this.top;
  }

  get pageWidth(): number {
    return this.pdf.internal.pageSize.getWidth();
  }

  get pageHeight(): number {
    return this.pdf.internal.pageSize.getHeight();
  }

  /** Largeur réellement écrivable entre les marges latérales. */
  get contentWidth(): number {
    return this.pageWidth - this.left - this.right;
  }

  /** Ordonnée maximale utilisable avant d'empiéter sur le pied de page. */
  get limit(): number {
    return this.pageHeight - this.bottom;
  }

  /** Espace vertical restant sur la page courante. */
  get remaining(): number {
    return this.limit - this.y;
  }

  /** True si rien n'a encore été écrit sur la page courante. */
  get isPageEmpty(): boolean {
    return this.y <= this.top;
  }

  /**
   * Garantit `height` millimètres disponibles ; ajoute une page sinon.
   * Retourne true si une rupture de page a eu lieu.
   */
  ensure(height: number): boolean {
    if (!Number.isFinite(height) || height < 0) throw new Error("La hauteur réservée doit être un nombre positif.");
    if (this.y + height <= this.limit) return false;
    this.addPage();
    return true;
  }

  addPage(): void {
    this.pdf.addPage(undefined, "portrait");
    this.y = this.top;
    this.onPageBreak?.(this);
  }

  /** Démarre une page neuve seulement si la page courante porte déjà du contenu. */
  startPage(): void {
    if (!this.isPageEmpty) this.addPage();
  }

  advance(height: number): void {
    this.y += height;
  }
}

/**
 * Appose en-tête et pied de page sur toutes les pages, une fois le flux terminé et le
 * nombre total de pages connu. C'est la seule façon d'imprimer un « Page X / Y » exact.
 */
export function stampPages(pdf: jsPDF, drawHeader: (page: number, total: number) => void, drawFooter: (page: number, total: number) => void): void {
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    drawHeader(page, total);
    drawFooter(page, total);
  }
}
