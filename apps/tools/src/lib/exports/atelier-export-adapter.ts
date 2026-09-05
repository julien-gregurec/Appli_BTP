/**
 * Adaptateur `TracingProject → ChantierExportDocument` (lot intégration Atelier/Export).
 *
 * Assemble uniquement à partir des contrats publics déjà livrés — `tracing/project.ts`,
 * `tracing/vectorization.ts`, `chantier/*` — et NE RECALCULE JAMAIS de géométrie : le
 * moteur géométrique (`geometry/engine`, `geometry/models`) reste l'unique source de
 * vérité. Deux cas :
 *
 *   - une géométrie déjà résolue par le moteur (`resolved.geometry`) est utilisée telle
 *     quelle ;
 *   - à défaut, si le projet contient un tracé manuel/photo (`project.shapes`), une
 *     `ShapeGeometry` minimale est assemblée à partir des sommets déjà calculés par
 *     `contourToGeometricShape` (aucune formule géométrique nouvelle : simple sérialisation
 *     dans les champs additifs `polylines`/`polygons` de `ShapeGeometry`) ;
 *   - sinon, `geometry` reste `undefined` — les sections qui en dépendent disparaissent
 *     (§3 : ne jamais inventer une donnée manquante).
 *
 * `runPreExportChecks` et `planMosaic` restent les seuls juges de leur domaine : cet
 * adaptateur leur fournit des entrées assemblées depuis le projet réel, il ne contourne
 * ni ne duplique leur logique.
 */

import type { Point, Polygon, Polyline } from "../geometry/primitives";
import { validateShapeGeometry, type ShapeGeometry } from "../geometry/shape-model";
import {
  lightingExportRows,
  planMosaic,
  runPreExportChecks,
  witnessDimension,
  type CheckShape,
  type LedPlan,
  type MosaicPlan,
  type PreExportInput,
  type PreExportReport,
  type ProfilePlan,
} from "../chantier";
import type { ReportTable } from "../chantier/report-table";
import { boundsFromPoints } from "../tracing/geometry-port";
import { combineOrigins, type MeasurementOrigin } from "../tracing/measurement-origin";
import type { TracingProject } from "../tracing/project";
import type { GeometricShape } from "../tracing/vectorization";
import {
  validateChantierExportDocument,
  type ChantierConstructionStep,
  type ChantierExportDocument,
  type ChantierExportProjectMeta,
  type ChantierReferenceImageMeta,
} from "./chantier-document";

/**
 * Données que l'adaptateur ne peut pas déduire seul du `TracingProject` d'aujourd'hui
 * (le moteur paramétrique et le calcul LED/profils vivent dans d'autres lots). Fournir
 * ce qui est disponible ; ce qui manque reste `undefined` — jamais un faux chiffre (§3).
 */
export type ResolvedAtelierGeometry = {
  /** Géométrie déjà résolue par le moteur (modèle paramétrique). Jamais recalculée ici. */
  geometry?: ShapeGeometry;
  /** Table de report déjà construite (`buildReportTable`), si des points le permettent. */
  report?: ReportTable;
  /** Plan LED déjà calculé (`planLed`) — TracingProject ne stocke pas encore de segments LED. */
  ledSummary?: LedPlan;
  /** Plans de profils déjà calculés (`planProfiles`). */
  profiles?: readonly ProfilePlan[];
  /** Contrôle pré-export déjà calculé ; sinon l'adaptateur le calcule via `runPreExportChecks`. */
  preExport?: PreExportReport;
  /** Plan de mosaïque déjà calculé ; sinon l'adaptateur en construit un par défaut si possible. */
  mosaic?: MosaicPlan;
};

function toPrimitivePoints(shape: GeometricShape): Point[] {
  return shape.vertices.map((vertex, index) => ({ id: `${shape.id}-v${index}`, x: vertex.x, y: vertex.y }));
}

/**
 * Assemble une `ShapeGeometry` minimale à partir des formes déjà vectorisées du projet
 * (`contourToGeometricShape`). Aucune primitive géométrique nouvelle : les sommets sont
 * sérialisés tels quels dans les champs additifs `polylines`/`polygons`.
 */
export function geometryFromTracingShapes(shapes: readonly GeometricShape[]): ShapeGeometry | undefined {
  const withVertices = shapes.filter((shape) => shape.vertices.length > 0);
  if (!withVertices.length) return undefined;

  let bounds;
  try {
    bounds = boundsFromPoints(withVertices.flatMap((shape) => shape.vertices));
  } catch {
    return undefined;
  }

  const polylines: Polyline[] = withVertices.filter((shape) => !shape.closed).map((shape) => ({ id: shape.id, points: toPrimitivePoints(shape) }));
  const polygons: Polygon[] = withVertices.filter((shape) => shape.closed).map((shape) => ({ id: shape.id, points: toPrimitivePoints(shape) }));

  const model: ShapeGeometry = {
    id: "atelier-trace",
    name: "Tracé atelier",
    bounds,
    referenceFrame: { unit: "mm", origin: { id: "O", x: 0, y: 0 }, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points: [],
    segments: [],
    arcs: [],
    circles: [],
    ellipses: [],
    constructionLines: [],
    dimensions: [],
    controls: [],
    quantities: [],
    steps: [],
    polylines: polylines.length ? polylines : undefined,
    polygons: polygons.length ? polygons : undefined,
  };

  try {
    validateShapeGeometry(model);
  } catch {
    return undefined;
  }
  return model;
}

/** Origine de mesure combinée (§28) des formes du projet — `undefined` si aucune forme. */
export function combinedOriginFromProject(project: TracingProject): MeasurementOrigin | undefined {
  if (!project.shapes.length) return undefined;
  return combineOrigins(...project.shapes.map((shape) => shape.origin));
}

/**
 * Assemble les entrées de `runPreExportChecks` depuis l'état réel du projet. Ne contourne
 * ni ne duplique les règles de contrôle : cette fonction ne fait qu'assembler les faits.
 */
export function buildPreExportInputFromProject(
  project: TracingProject,
  geometry?: ShapeGeometry,
  /**
   * Vrai quand `geometry` vient du moteur (modèle résolu depuis `modelId`), et non des
   * formes vectorisées du projet. Un modèle est construit en millimètres exacts : son
   * échelle est définie par construction, et son tracé n'est pas vide même si le projet ne
   * porte aucune `shape` (ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §7).
   */
  hasResolvedModelGeometry = false,
): PreExportInput {
  const shapes: CheckShape[] = project.shapes.map((shape) => ({ id: shape.id, vertices: shape.vertices, closed: shape.closed, origin: shape.origin }));
  const usesReferenceImage = project.referenceImages.length > 0;
  const imageCalibrated = usesReferenceImage && project.referenceImages.every((image) => image.calibration.status === "calibrated");
  return {
    roomWidthMm: project.roomWidthMm,
    roomHeightMm: project.roomHeightMm,
    scaleDefined: project.scaleStatus === "defined" || hasResolvedModelGeometry,
    usesReferenceImage,
    imageCalibrated,
    shapes,
    hasResolvedModelGeometry,
    dimensionsCount: geometry?.dimensions.length,
  };
}

function buildDefaultMosaic(project: TracingProject, geometry: ShapeGeometry): MosaicPlan | undefined {
  const contentWidthMm = geometry.bounds.maxX - geometry.bounds.minX;
  const contentHeightMm = geometry.bounds.maxY - geometry.bounds.minY;
  if (!(contentWidthMm > 0) || !(contentHeightMm > 0)) return undefined;
  try {
    return planMosaic({
      contentWidthMm,
      contentHeightMm,
      format: project.exportSettings.paperFormat,
      orientation: project.exportSettings.paperOrientation,
      marginMm: project.exportSettings.marginMm,
      overlapMm: project.exportSettings.overlapMm,
      witnessMm: project.exportSettings.witnessMm,
    });
  } catch {
    return undefined;
  }
}

function buildReferenceImageMeta(project: TracingProject): ChantierReferenceImageMeta | undefined {
  const primary = project.referenceImages[0];
  if (!primary) return undefined;
  return { name: primary.name, source: primary.source, calibrated: primary.calibration.status === "calibrated" };
}

/**
 * Point d'entrée de l'adaptateur. `resolved` porte tout ce que le projet seul ne peut
 * pas fournir aujourd'hui (géométrie moteur, report, LED, profils, contrôle pré-export,
 * mosaïque déjà négociée avec l'utilisateur) — chaque champ absent laisse la section
 * d'export correspondante optionnelle plutôt que d'inventer une valeur.
 */
export function tracingProjectToChantierExportDocument(project: TracingProject, resolved: ResolvedAtelierGeometry = {}): ChantierExportDocument {
  // Distinguer les deux origines possibles de la géométrie : le moteur (modèle résolu) ou
  // les formes déjà vectorisées du projet. Le contrôle pré-export ne juge pas de la même
  // façon un tracé paramétrique exact et un relevé photo (§7).
  const modelGeometry = resolved.geometry;
  const geometry = modelGeometry ?? geometryFromTracingShapes(project.shapes);
  const preExport = resolved.preExport ?? runPreExportChecks(buildPreExportInputFromProject(project, geometry, Boolean(modelGeometry)));
  const mosaic = resolved.mosaic ?? (geometry ? buildDefaultMosaic(project, geometry) : undefined);

  const projectMeta: ChantierExportProjectMeta = {
    id: project.id,
    name: project.name,
    ouvrageType: project.type,
    units: project.units,
    roomWidthMm: project.roomWidthMm,
    roomHeightMm: project.roomHeightMm,
    measurementOrigin: combinedOriginFromProject(project),
    generatedAt: new Date().toISOString(),
  };

  const constructionSteps: ChantierConstructionStep[] | undefined = project.constructionSteps.length
    ? project.constructionSteps.map((step) => ({ id: step.id, title: step.title, instruction: step.instruction }))
    : undefined;

  return validateChantierExportDocument({
    project: projectMeta,
    geometry,
    report: resolved.report,
    constructionSteps,
    nomenclature: project.materials.length ? project.materials : undefined,
    ledSummary: resolved.ledSummary,
    profiles: resolved.profiles,
    lightingRows: project.lighting.length ? lightingExportRows(project.lighting) : undefined,
    witness: witnessDimension(project.exportSettings.witnessMm),
    preExport,
    mosaic,
    referenceImage: buildReferenceImageMeta(project),
  });
}
