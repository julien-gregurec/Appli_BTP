import { degToRad, radToDeg } from "./angles";
import { circleCircleIntersection } from "./intersections";
import { createLeaf } from "./petals";
import { createRadialPattern } from "./radial-pattern";
import { boundsFromPoints, distance, mergeBounds } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ConstructionStep, type ParametricShape } from "./model";
import { assertFinitePositive, type Circle2D, type Point2D } from "./types";

export type RosetteParameters = {
  centre?: Point2D;
  outerDiameter: number;
  /**
   * Diamètre intérieur de l'anneau où vivent les éléments. Optionnel (C4-LOT3-V1 §2) : absent,
   * la rosace utilise la construction "classique" à cercles superposés — chaque élément est à
   * une distance de O égale à son propre rayon, donc passe exactement par O (ex. rosace à 6
   * pétales, fleurs à 4/5 pétales). Fourni, les éléments sont répartis dans l'anneau
   * [innerDiameter/2, outerDiameter/2], tangents entre eux (comportement historique inchangé).
   */
  innerDiameter?: number;
  count: number;
  rotationDegrees?: number;
  elementType?: "circle" | "petal";
  elementWidth?: number;
  /**
   * Calculer et nommer les "pointes" (T1..TN, deuxième intersection de chaque élément-cercle
   * avec son voisin) en mode classique. Optionnel, défaut `false` (C4-LOT3-V1 §2/§6) : les
   * pointes ne sont une notion pédagogique pertinente que pour les motifs où le recouvrement
   * entre cercles voisins EST le sujet du tracé (ex. rosace à 6 pétales, où il définit
   * l'encombrement réel du motif) — pas pour les fleurs à petits pétales inscrits, où seuls les
   * N cercles eux-mêmes comptent et où des pointes non demandées ajouteraient un point sans
   * signification pédagogique connue de l'utilisateur.
   */
  computeTips?: boolean;
  /**
   * Cercle central décoratif, exprimé en fraction du rayon directeur (0 < ratio < 1). Optionnel,
   * mode classique uniquement (C5-CLEANUP-V1 §2) : en mode anneau, le cercle central EST déjà le
   * diamètre intérieur et possède son étape dédiée. Fourni, `createRosette` produit à la fois le
   * cercle (primitive de rôle "shape") ET son étape de construction, insérée juste avant l'étape
   * de contrôle — un modèle n'a donc jamais à recomposer un `SiteStep` à la main après coup.
   * Exprimé en ratio et non en valeur absolue pour que l'appelant n'ait pas à redériver
   * lui-même le rayon directeur (ce serait une seconde formule géométrique hors moteur) ; le
   * rayon résolu est republié dans `metadata.centralCircleRadius`.
   */
  centralCircleRatio?: number;
};

/** Générateur générique de rosace : N éléments répartis régulièrement autour d'un centre. */
export function createRosette(params: RosetteParameters): ParametricShape<RosetteParameters> {
  if (!Number.isInteger(params.count) || params.count < 2) throw new Error("Une rosace exige au moins 2 éléments.");
  const outerRadius = assertFinitePositive(params.outerDiameter, "Le diamètre extérieur") / 2;
  const hasInner = params.innerDiameter !== undefined;
  const innerRadius = hasInner ? assertFinitePositive(params.innerDiameter as number, "Le diamètre intérieur") / 2 : 0;
  if (hasInner && innerRadius >= outerRadius) throw new Error("Le diamètre intérieur doit être inférieur au diamètre extérieur.");
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? -90);
  const elementType = params.elementType ?? "circle";
  const directorRadius = hasInner ? (outerRadius + innerRadius) / 2 : outerRadius;
  const centralCircleRadius = resolveCentralCircleRadius(params.centralCircleRatio, directorRadius, hasInner);
  const sectorDegrees = 360 / params.count;
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  let bounds = boundsFromPoints([centre], Math.max(20, outerRadius * 0.1));
  let elementSummary: { kind: "circle"; radius: number } | { kind: "petal"; width: number; height: number };
  let tipDistance: number | undefined;
  const centreIds: string[] = Array.from({ length: params.count }, (_, i) => `C${i + 1}`);
  const tipIds: string[] = Array.from({ length: params.count }, (_, i) => `T${i + 1}`);
  // Géométrie des N éléments eux-mêmes (avant l'ajout éventuel du cercle central) : sert à la
  // fois de primitives finales et de référence exacte pour l'étape "Tracer les éléments"
  // (jamais le cercle central, qui a sa propre étape dédiée).
  const elementStepGeometry: ConstructionStep["geometry"] = [];
  if (elementType === "circle") {
    const elementRadius = hasInner ? (outerRadius - innerRadius) / 2 : outerRadius;
    const source: Circle2D = { centre: { x: centre.x + directorRadius, y: centre.y }, radius: elementRadius };
    const pattern = createRadialPattern({ source, centre, count: params.count, startAngleDegrees: radToDeg(rotation) });
    primitives.circles.push(...pattern.primitives.circles);
    // Centres secondaires nommés (C4-LOT3-V1 §2) : `createRadialPattern` ne nomme pas les centres
    // des cercles qu'il répète — indispensable pour référencer chaque centre individuellement
    // (steps, cotations, contrôles), comme le fait tout modèle historique à rosace/fleur.
    pattern.primitives.circles.forEach((c, i) => { primitives.points[centreIds[i]] = c.centre; });
    elementStepGeometry.push(...pattern.primitives.circles.map((circle) => ({ kind: "circle" as const, circle })));
    if (hasInner) primitives.circles.push({ centre, radius: innerRadius });
    else if (params.computeTips) {
      // Pointes des pétales (C4-LOT3-V1 §2/§6), sur demande explicite uniquement : seconde
      // intersection de chaque cercle avec son voisin immédiat, calculée via la primitive
      // d'intersection d'Engine B sur les cercles réellement produits (aucune formule dupliquée).
      // Sert aussi à exposer l'encombrement géométrique réel du motif (pointe à pointe), distinct
      // du diamètre directeur saisi par l'utilisateur.
      const circles = pattern.primitives.circles;
      const tips = circles.map((circle, i) => {
        const neighbour = circles[(i + 1) % circles.length];
        const result = circleCircleIntersection(circle, neighbour);
        const candidate = result.points.find((p) => distance(p, centre) > elementRadius / 2);
        return candidate ?? null;
      });
      if (tips.every((t): t is Point2D => t !== null)) {
        tips.forEach((tip, i) => { primitives.points[tipIds[i]] = tip; });
        tipDistance = distance(tips[0], centre);
      }
    }
    bounds = mergeBounds(bounds, pattern.boundingBox);
    elementSummary = { kind: "circle", radius: elementRadius };
  } else {
    const height = hasInner ? outerRadius - innerRadius : outerRadius;
    const width = params.elementWidth ?? 2 * directorRadius * Math.sin(Math.PI / params.count) * 0.85;
    const elementCentre = { x: centre.x + directorRadius, y: centre.y };
    const petalRotation = radToDeg(rotation) + 90;
    const petalArcs = buildLocalPetalArcs(width, height, elementCentre, petalRotation);
    const pattern = createRadialPattern({ source: petalArcs, centre, count: params.count, startAngleDegrees: radToDeg(rotation) });
    primitives.arcs.push(...pattern.primitives.arcs);
    elementStepGeometry.push(...pattern.primitives.arcs.map((arc) => ({ kind: "arc" as const, arc })));
    if (hasInner) primitives.circles.push({ centre, radius: innerRadius });
    bounds = mergeBounds(bounds, pattern.boundingBox);
    elementSummary = { kind: "petal", width, height };
  }
  // Cercle central décoratif (mode classique) : primitive finale du motif, poussée avant la
  // construction des étapes pour que l'étape dédiée ci-dessous la résolve par valeur plutôt que
  // de la matérialiser une seconde fois côté adaptateur.
  if (centralCircleRadius !== undefined) primitives.circles.push({ centre, radius: centralCircleRadius, role: "shape" });
  const directorCircle: Circle2D = { centre, radius: directorRadius };
  const steps: ConstructionStep[] = [
    { id: "step-centre", title: "Repérer le centre", instruction: "Matérialiser le centre O.", geometry: [{ kind: "point", id: "O" }] },
    { id: "step-director-circle", title: "Tracer le cercle directeur", instruction: `Tracer le cercle directeur de rayon ${directorRadius.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: directorCircle }] },
    { id: "step-divide", title: `Diviser en ${params.count}`, instruction: `Diviser en ${params.count} secteurs de ${sectorDegrees.toFixed(2)}°.`, geometry: elementType === "circle" ? centreIds.map((id) => ({ kind: "point" as const, id })) : [] },
    { id: "step-elements", title: "Tracer les éléments", instruction: `Tracer un élément (${elementType}) sur chaque division.`, geometry: elementStepGeometry },
  ];
  if (hasInner) {
    steps.push({ id: "step-centre-circle", title: "Tracer le cercle central", instruction: `Tracer le cercle central de rayon ${innerRadius.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: { centre, radius: innerRadius } }] });
  } else {
    if (centralCircleRadius !== undefined) {
      steps.push({
        id: "step-centre-circle",
        title: "Tracer le cercle central",
        instruction: `Tracer le cercle central de rayon ${centralCircleRadius.toFixed(1)} mm.`,
        geometry: [{ kind: "point", id: "O" }, { kind: "circle", circle: { centre, radius: centralCircleRadius } }],
      });
    }
    const hasTips = tipDistance !== undefined;
    steps.push({
      id: "step-check",
      title: "Contrôler",
      instruction: hasTips
        ? "Contrôler que chaque élément passe exactement par le centre O, et que les pointes du motif sont à égale distance de O."
        : "Contrôler que chaque élément passe exactement par le centre O.",
      geometry: [{ kind: "point", id: "O" }, ...(hasTips ? tipIds.map((id) => ({ kind: "point" as const, id })) : [])],
    });
  }
  return {
    id: `rosette-${params.count}`,
    type: "rosette",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { count: params.count, element: elementSummary, directorRadius, tipDistance, centralCircleRadius },
    constructionSteps: steps,
    quality: "exact",
  };
}

/**
 * Résout `centralCircleRatio` en rayon absolu. Mode classique uniquement : en mode anneau le
 * cercle central est déjà porté par `innerDiameter`, deux sources concurrentes pour la même
 * entité seraient une ambiguïté, pas une option.
 */
function resolveCentralCircleRadius(ratio: number | undefined, directorRadius: number, hasInner: boolean): number | undefined {
  if (ratio === undefined) return undefined;
  if (hasInner) throw new Error("Le cercle central décoratif est incompatible avec un diamètre intérieur : ce dernier définit déjà le cercle central.");
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) throw new Error("La fraction du cercle central doit être strictement comprise entre 0 et 1.");
  return directorRadius * ratio;
}

function buildLocalPetalArcs(width: number, height: number, elementCentre: Point2D, rotationDegrees: number) {
  // Réutilise la construction de la feuille (deux arcs symétriques) centrée sur l'élément.
  return createLeaf({ width, height, centre: elementCentre, rotationDegrees }).primitives.arcs;
}

registerShapeGenerator<RosetteParameters>("rosette", createRosette);
