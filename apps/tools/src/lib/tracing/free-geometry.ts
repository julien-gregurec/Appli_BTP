/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §1/§3/§13 — géométrie libre de l'Atelier.
 *
 * ## La différence qui structure tout le lot : SOURCE contre DÉRIVÉ
 *
 * Un modèle paramétrique (Engine B) est **dérivé** : le projet n'enregistre que `modelId` et
 * les surcharges `modelParams`, et la géométrie est recalculée à chaque affichage. C'est ce
 * qui interdit d'y déplacer un point directement — il faut passer par un paramètre, et un
 * point qu'aucun paramètre ne déplace reste en lecture seule (`handle-map.ts`, classes A et B).
 *
 * La géométrie libre est l'inverse exact : elle est **la source**. Aucune formule ne la
 * produit, rien ne la recalcule, et la position d'un sommet ne « traduit » rien — elle EST la
 * donnée. C'est ce qui rend le déplacement direct légitime ici et nulle part ailleurs : c'est
 * la classe C annoncée par `handle-map.ts`, qui n'existait pas encore faute de source libre.
 *
 * Conséquence de contrat, et c'est le point à ne pas perdre : les deux ne se mélangent pas.
 * Un projet qui porterait à la fois un `modelId` et une géométrie libre aurait deux sources de
 * vérité concurrentes, et rien ne dirait laquelle exporter. `project.ts` refuse cette
 * combinaison, et `tracingProjectMode` donne le mode réel d'un projet (§2).
 *
 * ## Une seule forme d'entité
 *
 * Point, segment et polyligne ne diffèrent que par le nombre de sommets et par ce qu'on trace
 * entre eux. Les représenter par trois structures distinctes obligerait à écrire trois fois le
 * déplacement de sommet, trois fois la validation, trois fois l'historique. Ils partagent donc
 * une seule forme — un `kind` et une liste ordonnée de sommets — et l'invariant d'arité est
 * porté par la validation, en un seul endroit (§13).
 *
 * ## Unités
 *
 * Tout est en millimètres monde (§12). Aucun pixel n'entre ici et aucun n'en sort : la
 * conversion écran ↔ monde appartient au viewport (`lib/viewport/`), qui est la seule couche à
 * connaître le zoom.
 *
 * Module PUR : ni React, ni DOM, ni persistance, ni horloge.
 */

import type { BoundingBox } from "../geometry/primitives";

/**
 * Version du document de géométrie libre, imbriquée dans `TracingProject.freeGeometry`.
 *
 * Elle est distincte de `TRACING_PROJECT_SCHEMA_VERSION` à dessein : la forme des primitives
 * libres évoluera (arcs, cercles, contours fermés — §3 les exclut de ce lot) plus vite que
 * l'enveloppe du projet, et faire porter les deux rythmes par un seul numéro obligerait à
 * migrer tous les projets pour un changement qui n'en concerne qu'une partie.
 */
export const FREE_GEOMETRY_VERSION = 1;

/** Sommet monde, en millimètres. Jamais un pixel (§12). */
export type FreeVertex = { x: number; y: number };

/** §3 — primitives de la V1. Cercle, arc, ellipse, spline, texte et image sont hors lot. */
export type FreeEntityKind = "point" | "segment" | "polyline";

export const FREE_ENTITY_KINDS: readonly FreeEntityKind[] = ["point", "segment", "polyline"];

export type FreeEntity = {
  id: string;
  kind: FreeEntityKind;
  /** Sommets ordonnés, en millimètres. Arité imposée par `kind` (cf. `ARITY`). */
  points: readonly FreeVertex[];
};

export type FreeGeometry = {
  version: number;
  entities: readonly FreeEntity[];
};

/** Référence stable pour « pas encore de tracé libre » — jamais mutée. */
export const EMPTY_FREE_GEOMETRY: FreeGeometry = Object.freeze({
  version: FREE_GEOMETRY_VERSION,
  entities: Object.freeze([]) as readonly FreeEntity[],
});

export class FreeGeometryError extends Error {}

/**
 * §13 — limites. Elles existent pour qu'un document corrompu ou un geste répété en boucle ne
 * puisse pas rendre l'application inutilisable, PAS pour rationner le travail : un plafond de
 * chantier détaillé tient largement sous 1 000 entités, et une polyligne de relevé sous 500
 * sommets. Le repère de charge du lot (100 points, 100 segments, une polyligne de 100 sommets)
 * est très en deçà (§16).
 */
export const MAX_FREE_ENTITIES = 1000;
export const MAX_FREE_POLYLINE_VERTICES = 500;
export const MAX_FREE_VERTICES = 5000;

/**
 * Étendue admissible d'une coordonnée, en millimètres : ±1 km. Même ordre de grandeur que la
 * borne des dimensions de pièce (`optionalDimension`, 1 000 000 mm), ce qui évite qu'un tracé
 * accepté ici soit refusé par l'enveloppe du projet.
 */
export const FREE_COORDINATE_LIMIT_MM = 1_000_000;

/**
 * Deux sommets plus proches que ceci sont le même endroit. Sert à refuser un segment de
 * longueur nulle et à absorber le second clic d'un double-clic de fin de polyligne (§4) :
 * l'un et l'autre sont le même problème — un sommet qui ne dit rien de neuf.
 */
export const FREE_VERTEX_EPSILON_MM = 1e-3;

type Arity = { min: number; max: number; label: string };

const ARITY: Readonly<Record<FreeEntityKind, Arity>> = {
  point: { min: 1, max: 1, label: "Un point libre porte exactement un sommet." },
  segment: { min: 2, max: 2, label: "Un segment libre porte exactement deux sommets." },
  polyline: { min: 2, max: MAX_FREE_POLYLINE_VERTICES, label: "Une polyligne libre porte au moins deux sommets." },
};

const KIND_LABELS: Readonly<Record<FreeEntityKind, string>> = {
  point: "Point libre",
  segment: "Segment libre",
  polyline: "Polyligne libre",
};

/** Préfixe d'identifiant par nature — court, lisible dans un export DXF ou un tableau de report. */
const ID_PREFIX: Readonly<Record<FreeEntityKind, string>> = {
  point: "pt",
  segment: "sg",
  polyline: "pl",
};

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/;

export function freeEntityKindLabel(kind: FreeEntityKind): string {
  return KIND_LABELS[kind];
}

export function freeEntityLabel(entity: FreeEntity): string {
  return `${KIND_LABELS[entity.kind]} ${entity.id}`;
}

/** Deux sommets confondus à `FREE_VERTEX_EPSILON_MM` près. */
export function sameFreeVertex(a: FreeVertex, b: FreeVertex): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= FREE_VERTEX_EPSILON_MM;
}

/**
 * §13 — un sommet valide : deux nombres FINIS et bornés. `Number.isFinite` écarte à la fois
 * `NaN` et les deux infinis, qui sont exactement les valeurs qu'un calcul d'accrochage
 * dégénéré pourrait produire et qu'aucune couche en aval ne saurait dessiner.
 */
export function validateFreeVertex(raw: unknown, label: string): FreeVertex {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new FreeGeometryError(`${label} n'est pas un sommet valide.`);
  }
  const value = raw as Record<string, unknown>;
  for (const axis of ["x", "y"] as const) {
    const component = value[axis];
    if (typeof component !== "number" || !Number.isFinite(component)) {
      throw new FreeGeometryError(`${label} : la coordonnée ${axis.toUpperCase()} doit être un nombre fini.`);
    }
    if (Math.abs(component) > FREE_COORDINATE_LIMIT_MM) {
      throw new FreeGeometryError(`${label} : la coordonnée ${axis.toUpperCase()} sort des limites du tracé (±1 km).`);
    }
  }
  return { x: value.x as number, y: value.y as number };
}

export function validateFreeEntity(raw: unknown): FreeEntity {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new FreeGeometryError("Une entité de tracé libre n'est pas un objet valide.");
  }
  const value = raw as Record<string, unknown>;

  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) {
    throw new FreeGeometryError("L'identifiant d'une entité de tracé libre est invalide.");
  }
  const kind = value.kind;
  if (!FREE_ENTITY_KINDS.includes(kind as FreeEntityKind)) {
    throw new FreeGeometryError(`La nature « ${String(kind)} » n'existe pas dans le tracé libre de cette version.`);
  }
  if (!Array.isArray(value.points)) {
    throw new FreeGeometryError(`${KIND_LABELS[kind as FreeEntityKind]} ${value.id} n'a pas de liste de sommets.`);
  }

  const arity = ARITY[kind as FreeEntityKind];
  if (value.points.length < arity.min || value.points.length > arity.max) {
    // Sur une arité FIXE (point, segment), trop et pas assez sont le même défaut, et le dire
    // deux fois différemment n'aiderait personne : la règle énoncée suffit. Seule une arité
    // ouverte (polyligne) a un plafond dont le dépassement mérite son propre message.
    const exceedsOpenArity = arity.min !== arity.max && value.points.length > arity.max;
    throw new FreeGeometryError(
      exceedsOpenArity
        ? `${KIND_LABELS[kind as FreeEntityKind]} ${value.id} dépasse ${arity.max} sommets.`
        : `${arity.label} (${value.id})`,
    );
  }

  const points = value.points.map((vertex, index) =>
    validateFreeVertex(vertex, `${KIND_LABELS[kind as FreeEntityKind]} ${value.id}, sommet ${index + 1}`),
  );

  // Un segment de longueur nulle n'est pas dessinable et ne se sélectionne pas : il naîtrait
  // d'un double-clic mal interprété, et resterait invisible sur le plan jusqu'à l'export.
  if (kind === "segment" && sameFreeVertex(points[0], points[1])) {
    throw new FreeGeometryError(`Le segment libre ${value.id} a une longueur nulle.`);
  }

  return { id: value.id, kind: kind as FreeEntityKind, points };
}

/**
 * Lecture stricte d'un document de géométrie libre. Refuse plutôt que de corriger : une
 * entité invalide signale un document abîmé, et la réparer en silence ferait disparaître du
 * travail sans que personne ne le sache.
 */
export function validateFreeGeometry(raw: unknown): FreeGeometry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new FreeGeometryError("Le tracé libre n'est pas un objet valide.");
  }
  const value = raw as Record<string, unknown>;

  const version = value.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new FreeGeometryError("La version du tracé libre est absente ou illisible.");
  }
  if (version > FREE_GEOMETRY_VERSION) {
    throw new FreeGeometryError("Ce tracé libre a été créé avec une version plus récente de l'Atelier.");
  }
  if (!Array.isArray(value.entities)) {
    throw new FreeGeometryError("Le tracé libre n'a pas de liste d'entités.");
  }
  if (value.entities.length > MAX_FREE_ENTITIES) {
    throw new FreeGeometryError(`Le tracé libre dépasse ${MAX_FREE_ENTITIES} entités.`);
  }

  const entities = value.entities.map(validateFreeEntity);

  const ids = new Set<string>();
  let vertices = 0;
  for (const entity of entities) {
    if (ids.has(entity.id)) throw new FreeGeometryError(`Le tracé libre contient deux entités « ${entity.id} ».`);
    ids.add(entity.id);
    vertices += entity.points.length;
  }
  if (vertices > MAX_FREE_VERTICES) {
    throw new FreeGeometryError(`Le tracé libre dépasse ${MAX_FREE_VERTICES} sommets au total.`);
  }

  return { version: FREE_GEOMETRY_VERSION, entities };
}

export function freeGeometryIsEmpty(geometry: FreeGeometry | undefined | null): boolean {
  return !geometry || geometry.entities.length === 0;
}

export function countFreeVertices(geometry: FreeGeometry): number {
  return geometry.entities.reduce((total, entity) => total + entity.points.length, 0);
}

export function findFreeEntity(geometry: FreeGeometry, entityId: string): FreeEntity | null {
  return geometry.entities.find((entity) => entity.id === entityId) ?? null;
}

export function freeEntityVertex(geometry: FreeGeometry, entityId: string, index: number): FreeVertex | null {
  const entity = findFreeEntity(geometry, entityId);
  if (!entity) return null;
  return entity.points[index] ?? null;
}

/**
 * Identifiant suivant pour une nature donnée — DÉTERMINISTE, jamais tiré au hasard.
 *
 * Deux raisons : un test doit pouvoir prédire l'identifiant de l'entité qu'il vient de créer,
 * et un identifiant lisible (`sg-3`) reste utilisable tel quel dans un export DXF ou une table
 * de report, là où un UUID ne dirait rien à personne sur le chantier.
 *
 * Le numéro est le plus grand DÉJÀ pris dans le document, plus un — donc il est réattribué
 * après une suppression (supprimer `sg-2` puis tracer un segment redonne `sg-2`). C'est sans
 * danger, et il vaut la peine de dire pourquoi : l'historique est linéaire et se dépile en
 * dernier-entré-premier-sorti (`pushFreeHistory` invalide le futur à chaque nouvelle action).
 * Une création qui a repris un identifiant libéré est donc toujours annulée AVANT la
 * suppression qui l'a libéré, et les deux entités homonymes ne peuvent jamais coexister. Si
 * une telle collision survenait malgré tout, `insertFreeEntities` la refuserait plutôt que de
 * produire un document à identifiants dupliqués.
 */
export function nextFreeEntityId(geometry: FreeGeometry, kind: FreeEntityKind): string {
  const prefix = ID_PREFIX[kind];
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = 0;
  for (const entity of geometry.entities) {
    const found = pattern.exec(entity.id);
    if (found) highest = Math.max(highest, Number(found[1]));
  }
  return `${prefix}-${highest + 1}`;
}

/** Crée une entité validée, sans l'insérer. L'identifiant est fourni par l'appelant (§13). */
export function createFreeEntity(kind: FreeEntityKind, points: readonly FreeVertex[], id: string): FreeEntity {
  return validateFreeEntity({ id, kind, points: points.map((vertex) => ({ x: vertex.x, y: vertex.y })) });
}

/** Ajoute une entité en fin de liste. Refuse un identifiant déjà pris et le dépassement des limites. */
export function addFreeEntity(geometry: FreeGeometry, entity: FreeEntity): FreeGeometry {
  const validated = validateFreeEntity(entity);
  if (findFreeEntity(geometry, validated.id)) {
    throw new FreeGeometryError(`Une entité « ${validated.id} » existe déjà dans ce tracé libre.`);
  }
  if (geometry.entities.length + 1 > MAX_FREE_ENTITIES) {
    throw new FreeGeometryError(`Le tracé libre est plein (${MAX_FREE_ENTITIES} entités).`);
  }
  if (countFreeVertices(geometry) + validated.points.length > MAX_FREE_VERTICES) {
    throw new FreeGeometryError(`Le tracé libre est plein (${MAX_FREE_VERTICES} sommets).`);
  }
  return { version: FREE_GEOMETRY_VERSION, entities: [...geometry.entities, validated] };
}

/** Entité retirée, avec son RANG : c'est lui qui permet de la remettre où elle était (§9). */
export type FreeEntityRemoval = { index: number; entity: FreeEntity };

export type FreeRemovalResult = { geometry: FreeGeometry; removed: readonly FreeEntityRemoval[] };

/**
 * §8 — retire des entités libres. Les identifiants inconnus sont ignorés : une sélection peut
 * contenir des entités d'un modèle paramétrique ou des entités déjà supprimées, et c'est
 * précisément la garantie recherchée — cette fonction ne sait supprimer QUE du tracé libre,
 * donc elle ne peut pas toucher une primitive dérivée d'Engine B.
 */
export function removeFreeEntities(geometry: FreeGeometry, entityIds: readonly string[]): FreeRemovalResult {
  const targets = new Set(entityIds);
  const removed: FreeEntityRemoval[] = [];
  const entities: FreeEntity[] = [];
  geometry.entities.forEach((entity, index) => {
    if (targets.has(entity.id)) removed.push({ index, entity });
    else entities.push(entity);
  });
  if (!removed.length) return { geometry, removed };
  return { geometry: { version: FREE_GEOMETRY_VERSION, entities }, removed };
}

/**
 * Remet des entités retirées à leur rang d'origine — chemin d'annulation d'une suppression.
 *
 * Les rangs sont rejoués du plus petit au plus grand : insérer d'abord le rang 5 puis le rang
 * 2 décalerait le premier, et l'ordre restauré ne serait pas celui d'avant la suppression.
 */
export function insertFreeEntities(geometry: FreeGeometry, removals: readonly FreeEntityRemoval[]): FreeGeometry {
  const entities = [...geometry.entities];
  for (const removal of [...removals].sort((a, b) => a.index - b.index)) {
    entities.splice(Math.min(Math.max(removal.index, 0), entities.length), 0, removal.entity);
  }
  return validateFreeGeometry({ version: FREE_GEOMETRY_VERSION, entities });
}

/**
 * §7 — déplace UN sommet. C'est ici, et nulle part ailleurs, que la géométrie libre change de
 * forme : la nouvelle position est écrite telle quelle, sans traduction ni inversion, parce
 * que la position EST la source de vérité.
 */
export function moveFreeVertex(
  geometry: FreeGeometry,
  entityId: string,
  index: number,
  position: FreeVertex,
): FreeGeometry {
  const entity = findFreeEntity(geometry, entityId);
  if (!entity) throw new FreeGeometryError(`Le tracé libre ne contient pas d'entité « ${entityId} ».`);
  if (index < 0 || index >= entity.points.length) {
    throw new FreeGeometryError(`Le sommet ${index + 1} n'existe pas sur ${freeEntityLabel(entity)}.`);
  }
  const target = validateFreeVertex(position, `${freeEntityLabel(entity)}, sommet ${index + 1}`);
  const points = entity.points.map((vertex, at) => (at === index ? target : vertex));
  const moved = validateFreeEntity({ ...entity, points });
  return {
    version: FREE_GEOMETRY_VERSION,
    entities: geometry.entities.map((candidate) => (candidate.id === entityId ? moved : candidate)),
  };
}

/** Bornes du tracé libre, ou `null` s'il est vide — jamais des bornes inventées (§13). */
export function freeGeometryBounds(geometry: FreeGeometry): BoundingBox | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const entity of geometry.entities) {
    for (const vertex of entity.points) {
      minX = Math.min(minX, vertex.x);
      minY = Math.min(minY, vertex.y);
      maxX = Math.max(maxX, vertex.x);
      maxY = Math.max(maxY, vertex.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Longueur développée d'une entité — 0 pour un point, qui n'en a pas (§11). */
export function freeEntityLength(entity: FreeEntity): number {
  let total = 0;
  for (let index = 1; index < entity.points.length; index += 1) {
    total += Math.hypot(
      entity.points[index].x - entity.points[index - 1].x,
      entity.points[index].y - entity.points[index - 1].y,
    );
  }
  return total;
}

/** Longueur cumulée de tout le tracé libre — chiffre du report (§11). */
export function freeGeometryLength(geometry: FreeGeometry): number {
  return geometry.entities.reduce((total, entity) => total + freeEntityLength(entity), 0);
}

/** Répartition par nature, dans l'ordre de `FREE_ENTITY_KINDS` — sert au report et à l'UI. */
export function countFreeEntitiesByKind(geometry: FreeGeometry): Record<FreeEntityKind, number> {
  const counts: Record<FreeEntityKind, number> = { point: 0, segment: 0, polyline: 0 };
  for (const entity of geometry.entities) counts[entity.kind] += 1;
  return counts;
}

/**
 * §8 — sous-ensemble d'une sélection qui appartient réellement au tracé libre.
 *
 * C'est le garde-fou qui empêche la touche Suppr de toucher une primitive dérivée d'Engine B :
 * la sélection est une liste d'identifiants de SCÈNE, qui peut mêler les deux origines, et
 * seule l'appartenance au document libre autorise la suppression.
 */
export function deletableFreeEntityIds(geometry: FreeGeometry, entityIds: readonly string[]): readonly string[] {
  const known = new Set(geometry.entities.map((entity) => entity.id));
  return entityIds.filter((id) => known.has(id));
}
