/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §5/§6/§7/§8 — mesures d'un contour libre.
 *
 * ## Ce que ce module ajoute au contrat, et ce qu'il n'y ajoute pas
 *
 * `free-geometry.ts` porte la SOURCE — des sommets, et les invariants structurels qui font
 * qu'un document est lisible. Ce module porte le JUGEMENT sur la forme que ces sommets
 * dessinent : quelle aire elle enferme, quel périmètre elle développe, dans quel sens elle
 * tourne, et si elle est seulement exploitable.
 *
 * La frontière entre les deux est celle-ci, et elle décide de tout le reste :
 *
 * - un contour à deux sommets, un côté de longueur nulle, une coordonnée hors limites sont des
 *   documents ABÎMÉS. `validateFreeEntity` les refuse, et le tracé ne les contient jamais ;
 * - un contour auto-intersecté, ou d'aire quasi nulle, est un document PARFAITEMENT LISIBLE
 *   dont la surface ne veut rien dire. Le refuser ferait disparaître le travail de
 *   l'utilisateur sous ses yeux — alors qu'il vient peut-être de croiser deux côtés d'un geste,
 *   et qu'il lui suffit de déplacer un sommet pour que la forme redevienne mesurable.
 *
 * D'où la règle du lot, qui est la seule qui compte : **le contour reste, la surface se tait**.
 * `areaMm2` vaut `null` quand elle n'est pas démontrable, et jamais `0` — un zéro serait lu
 * comme une mesure, et « ce mur fait 0 m² » est plus dangereux que « surface non exploitable ».
 *
 * ## Ce qui n'est pas recalculé ici
 *
 * Ni la formule du lacet, ni le prédicat de croisement de deux segments : le moteur les
 * possède, et `geometry-port.ts` les rend disponibles (§34). Ce module les ORCHESTRE.
 *
 * Module PUR : ni React, ni DOM, ni horloge. Aucun arrondi — l'unité de travail est le
 * millimètre, et la mise en forme appartient à l'affichage (§6 : « pas d'arrondi dans la
 * source »).
 */

import {
  freeEntityEdges,
  MIN_FREE_CONTOUR_VERTICES,
  type FreeEntity,
  type FreeGeometry,
  type FreeVertex,
} from "./free-geometry";
import { segmentSegmentIntersection, signedPolygonArea } from "./geometry-port";

/**
 * Aire, en mm², en deçà de laquelle un contour n'enferme rien d'exploitable : 1 mm².
 *
 * Le seuil est celui de la plus petite surface qu'un chantier puisse vouloir nommer, pas une
 * tolérance numérique. Trois sommets alignés à un dixième de millimètre près produisent une
 * aire minuscule mais non nulle ; l'annoncer comme une mesure serait exact au sens du calcul et
 * faux au sens du métier — la forme est un trait, pas une surface.
 */
export const FREE_CONTOUR_MIN_AREA_MM2 = 1;

/** Sens de parcours des sommets, déduit du SIGNE de l'aire — jamais d'une convention posée. */
export type FreeContourOrientation = "counter-clockwise" | "clockwise" | "indeterminate";

/**
 * Pourquoi la surface d'un contour n'est pas exploitable, ou `"valid"` si elle l'est.
 *
 * Deux motifs, et deux seulement, parce que ce sont les deux seuls que la géométrie permet de
 * démontrer sans rien savoir de ce que le contour représente :
 *
 * - `self-intersecting` — deux côtés non adjacents se croisent. La formule du lacet répond
 *   quand même, mais ce qu'elle rend est une aire ALGÉBRIQUE où les lobes de sens contraire se
 *   soustraient : un « nœud papillon » parfait rend zéro. Le chiffre existe, il ne mesure rien ;
 * - `degenerate` — l'aire est sous `FREE_CONTOUR_MIN_AREA_MM2`. Sommets alignés, ou contour
 *   replié sur lui-même.
 */
export type FreeContourStatus = "valid" | "self-intersecting" | "degenerate";

export type FreeContourMeasures = {
  entityId: string;
  vertexCount: number;
  /** Périmètre en millimètres, côté de fermeture COMPRIS. Toujours mesurable (§7). */
  perimeterMm: number;
  /**
   * Aire ALGÉBRIQUE en mm² — c'est elle qui porte l'orientation dans son signe (§8).
   *
   * Publiée même quand le statut n'est pas `valid` : c'est la donnée brute, et un appelant qui
   * la lit sait ce qu'il fait. C'est `areaMm2` qui applique la règle du lot.
   */
  signedAreaMm2: number;
  /** Aire en mm², ou `null` si elle n'est pas exploitable. JAMAIS `0` en guise de mesure (§13). */
  areaMm2: number | null;
  /** Aire en m² — même règle, même `null`. Simple conversion, sans arrondi (§6). */
  areaM2: number | null;
  orientation: FreeContourOrientation;
  status: FreeContourStatus;
  /** Phrase affichable expliquant un statut non valide, ou `null`. Jamais un code brut. */
  reason: string | null;
};

const STATUS_REASONS: Readonly<Record<Exclude<FreeContourStatus, "valid">, string>> = {
  "self-intersecting":
    "Ce contour se croise lui-même : sa surface n’est pas exploitable tant que les côtés se recoupent.",
  degenerate: "Ce contour n’enferme aucune surface mesurable : ses sommets sont alignés ou confondus.",
};

/** `true` si l'entité est un contour fermé — garde de lecture pour les appelants génériques. */
export function isFreeContour(entity: FreeEntity): boolean {
  return entity.kind === "polygon";
}

/**
 * §5 — auto-intersection : deux côtés NON ADJACENTS qui se croisent.
 *
 * ## Pourquoi une boucle ici plutôt que `hasSelfIntersection` du moteur
 *
 * Le prédicat de croisement reste celui du moteur — `segmentSegmentIntersection`, appelée
 * telle quelle : il n'y a pas deux façons de décider si deux segments se coupent, et ce lot
 * n'en introduit pas une seconde. Ce qui change est le PARCOURS.
 *
 * `hasSelfIntersection` teste les n²/2 paires sans filtre. Sur un contour de relevé de 500
 * sommets, cela fait 125 000 appels — supportables une fois, pas soixante fois par seconde. Or
 * cette fonction est appelée pendant un GLISSEMENT de sommet : la fiche propriétés recalcule le
 * statut à chaque trame, et c'est précisément là qu'un freeze se verrait (§20).
 *
 * Le rejet par boîtes englobantes qui suit règle cela sans toucher au prédicat : deux côtés
 * dont les rectangles ne se recouvrent pas ne se croisent pas, et quatre comparaisons de
 * flottants suffisent à le dire. Sur une forme d'ouvrage — dont les côtés sont locaux — il
 * écarte la quasi-totalité des paires avant tout calcul. Sur une forme pathologique, on
 * retombe sur le coût d'origine, qui est le bon coût.
 *
 * `free-contour.test.ts` vérifie l'accord des deux fonctions sur une batterie de formes : le
 * filtre doit accélérer la réponse, jamais la changer.
 */
export function freeContourSelfIntersects(entity: FreeEntity): boolean {
  const edges = freeEntityEdges(entity);
  const count = edges.length;
  if (count < 4) return false; // Un triangle n'a que des côtés adjacents : rien à croiser.

  // Boîtes englobantes précalculées : les recalculer dans la boucle interne les reconstruirait
  // n fois chacune, ce qui coûterait plus cher que le filtre ne rapporte.
  const boxes = edges.map(([from, to]) => ({
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxY: Math.max(from.y, to.y),
  }));

  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      // Les côtés voisins partagent un sommet : ils se « croisent » toujours en ce point, et
      // c'est la fermeture du contour, pas un défaut. Le premier et le dernier sont voisins eux
      // aussi — c'est ce que la fermeture implicite veut dire.
      if (j === i + 1 || (i === 0 && j === count - 1)) continue;

      const a = boxes[i];
      const b = boxes[j];
      if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue;

      const [aStart, aEnd] = edges[i];
      const [bStart, bEnd] = edges[j];
      if (segmentSegmentIntersection({ start: aStart, end: aEnd }, { start: bStart, end: bEnd }).kind !== "none") {
        return true;
      }
    }
  }
  return false;
}

/** §7 — périmètre d'une liste de sommets fermée, côté de fermeture compris. */
function closedPerimeter(points: readonly FreeVertex[]): number {
  const count = points.length;
  if (count < 2) return 0;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % count];
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return total;
}

/**
 * §6/§7/§8 — mesures complètes d'un contour.
 *
 * L'ordre d'évaluation des statuts n'est pas indifférent : l'auto-intersection est testée
 * AVANT la dégénérescence, parce qu'un nœud papillon symétrique a une aire algébrique nulle et
 * serait autrement annoncé « sommets alignés » — un diagnostic faux, qui enverrait
 * l'utilisateur chercher un défaut là où il n'y en a pas.
 */
export function freeContourMeasures(entity: FreeEntity): FreeContourMeasures {
  const points = entity.points;
  const signedAreaMm2 = signedPolygonArea(points);
  const perimeterMm = closedPerimeter(points);

  const status: FreeContourStatus =
    points.length < MIN_FREE_CONTOUR_VERTICES
      ? "degenerate"
      : freeContourSelfIntersects(entity)
        ? "self-intersecting"
        : Math.abs(signedAreaMm2) < FREE_CONTOUR_MIN_AREA_MM2
          ? "degenerate"
          : "valid";

  const areaMm2 = status === "valid" ? Math.abs(signedAreaMm2) : null;

  return {
    entityId: entity.id,
    vertexCount: points.length,
    perimeterMm,
    signedAreaMm2,
    areaMm2,
    status,
    // La conversion vit ici et pas dans l'affichage : un mm² est un millionième de m², et
    // laisser chaque écran refaire la division finirait par produire deux chiffres différents.
    areaM2: areaMm2 === null ? null : areaMm2 / 1_000_000,
    /*
     * §8 — l'orientation est LUE, jamais imposée.
     *
     * Le repère du tracé libre a Y vers le haut (`referenceFrame.yOrientation`), donc une aire
     * signée positive est un parcours trigonométrique — antihoraire. Rien ici ne réordonne les
     * sommets : le sens de parcours est une donnée que l'utilisateur a produite en cliquant, et
     * la retourner en silence ferait mentir le report et le DXF sur l'ordre réel du tracé.
     *
     * Une aire nulle ne dit rien d'un sens : `indeterminate` est alors la réponse honnête.
     */
    orientation:
      Math.abs(signedAreaMm2) < FREE_CONTOUR_MIN_AREA_MM2
        ? "indeterminate"
        : signedAreaMm2 > 0
          ? "counter-clockwise"
          : "clockwise",
    reason: status === "valid" ? null : STATUS_REASONS[status],
  };
}

/** Mesures de TOUS les contours d'un tracé, dans l'ordre du document. Vide s'il n'y en a aucun. */
export function freeGeometryContourMeasures(geometry: FreeGeometry): readonly FreeContourMeasures[] {
  return geometry.entities.filter(isFreeContour).map(freeContourMeasures);
}

/**
 * §14 — surface cumulée des contours EXPLOITABLES, en mm², ou `null` s'il n'y en a aucun.
 *
 * Les contours non exploitables sont exclus du total plutôt que comptés pour zéro : les
 * additionner à zéro donnerait un total d'apparence complète alors qu'il manque une pièce, et
 * personne ne verrait ce qui manque. `exploitableCount` / `contourCount` disent l'écart.
 */
export type FreeContourTotals = {
  contourCount: number;
  exploitableCount: number;
  /** Somme des aires exploitables, en mm². `null` si aucune ne l'est. */
  areaMm2: number | null;
  areaM2: number | null;
  /** Somme des périmètres de TOUS les contours : un périmètre est toujours mesurable (§7). */
  perimeterMm: number;
};

export function freeContourTotals(geometry: FreeGeometry): FreeContourTotals {
  const measures = freeGeometryContourMeasures(geometry);
  const exploitable = measures.filter((measure) => measure.areaMm2 !== null);
  const areaMm2 = exploitable.length
    ? exploitable.reduce((total, measure) => total + (measure.areaMm2 ?? 0), 0)
    : null;
  return {
    contourCount: measures.length,
    exploitableCount: exploitable.length,
    areaMm2,
    areaM2: areaMm2 === null ? null : areaMm2 / 1_000_000,
    perimeterMm: measures.reduce((total, measure) => total + measure.perimeterMm, 0),
  };
}
