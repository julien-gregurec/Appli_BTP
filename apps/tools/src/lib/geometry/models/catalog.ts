/**
 * ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §2 — catalogue typé des modèles paramétriques.
 *
 * Ce fichier ne contient AUCUNE géométrie : il décrit, pour chacun des 13 modèles du
 * registre (`./index.ts`), comment l'appeler. Chaque `build` délègue à la fonction
 * `create<Nom>Geometry` du module, qui reste l'unique source de vérité — elle-même
 * adossée à Engine B via `parametricShapeToTraceModel`. Aucun paramètre par défaut,
 * aucune borne, aucune formule n'est redéfinie ici : `parameters` est la référence
 * publiée par le modèle lui-même.
 *
 * Pourquoi ce fichier existe : la table équivalente vivait jusqu'ici en dur dans
 * `components/TracesPreviewWorkspace.tsx`, c'est-à-dire dans un composant React, donc
 * inaccessible à l'Atelier, à l'export et aux tests. Elle est remontée ici telle quelle ;
 * le composant la consomme désormais au lieu de la porter.
 *
 * Imports statiques assumés : le résolveur de l'Atelier (`lib/tracing/model-resolver.ts`)
 * est synchrone, appelé pendant le rendu et depuis l'adaptateur d'export. `traceModelRegistry`
 * (./index.ts) conserve ses `import()` paresseux pour les consommateurs sensibles au bundle ;
 * `catalog.parity.test.ts` garantit que les deux listes ne peuvent pas diverger.
 */

import { circleDivisionParameters, createCircleDivisionGeometry } from "./circle-division";
import { createStarGeometry, starParameters } from "./star";
import { createRosetteGeometry, rosetteParameters } from "./rosette";
import { createHeartGeometry, heartParameters } from "./heart";
import { archFullRoundParameters, createArchFullRoundGeometry } from "./arch-full-round";
import { createOgiveGeometry, ogiveParameters } from "./ogive";
import { createEllipsePedagogicalGeometry, ellipsePedagogicalParameters } from "./ellipse-pedagogical";
import { createSpiralGeometry, spiralParameters } from "./spiral";
import { createFlower4Geometry, flower4Parameters } from "./flower4";
import { createFlower5Geometry, flower5Parameters } from "./flower5";
import { createFlower6ElongatedGeometry, flower6ElongatedParameters } from "./flower6-elongated";
import { createTurbineGeometry, turbineParameters } from "./turbine";
import { createDoubleSGeometry, doubleSParameters } from "./double-s";
import type { TraceModel, TraceParameter } from "../trace-model";
import type { TraceModelGroup } from "./index";

/** Slug d'un modèle du registre — le seul vocabulaire accepté par `TracingProject.modelId`. */
export type TraceModelSlug =
  | "circle-division"
  | "star-5"
  | "rosette-6"
  | "heart"
  | "arch-full-round"
  | "ogive-equilateral"
  | "ellipse-pedagogical"
  | "spiral-archimedes"
  | "flower-4"
  | "flower-5"
  | "flower-6-elongated"
  | "turbine"
  | "double-s";

export type TraceModelDescriptor = {
  slug: TraceModelSlug;
  /** Libellé produit, tel qu'affiché dans le sélecteur de modèles. */
  label: string;
  group: TraceModelGroup;
  /** Contrat de paramètres publié par le modèle — jamais réécrit ici. */
  parameters: readonly TraceParameter[];
  /**
   * Appelle le générateur du modèle avec des valeurs déjà normalisées et validées par
   * l'appelant. Peut lever si les valeurs sont hors des règles internes du générateur —
   * c'est voulu : le générateur reste juge de ses propres invariants.
   */
  build: (values: Record<string, number>) => TraceModel;
};

export const TRACE_MODEL_CATALOG: Readonly<Record<TraceModelSlug, TraceModelDescriptor>> = {
  "circle-division": {
    slug: "circle-division",
    label: "Cercle divisé",
    group: "fondamentaux",
    parameters: circleDivisionParameters,
    build: (v) => createCircleDivisionGeometry({ diameter: v.diameter, divisions: v.divisions, startAngle: v.startAngle }),
  },
  "star-5": {
    slug: "star-5",
    label: "Étoile 5 branches",
    group: "fondamentaux",
    parameters: starParameters,
    build: (v) => createStarGeometry({ outerDiameter: v.outerDiameter, innerRatio: v.innerRatio, rotation: v.rotation }),
  },
  "rosette-6": {
    slug: "rosette-6",
    label: "Rosace 6 pétales simple",
    group: "fondamentaux",
    parameters: rosetteParameters,
    build: (v) => createRosetteGeometry({ diameter: v.diameter, rotation: v.rotation }),
  },
  heart: {
    slug: "heart",
    label: "Cœur géométrique",
    group: "fondamentaux",
    parameters: heartParameters,
    build: (v) => createHeartGeometry({ width: v.width, height: v.height }),
  },
  "arch-full-round": {
    slug: "arch-full-round",
    label: "Arche plein cintre",
    group: "fondamentaux",
    parameters: archFullRoundParameters,
    build: (v) => createArchFullRoundGeometry({ width: v.width }),
  },
  "ogive-equilateral": {
    slug: "ogive-equilateral",
    label: "Ogive équilatérale à deux centres",
    group: "fondamentaux",
    parameters: ogiveParameters,
    build: (v) => createOgiveGeometry({ width: v.width }),
  },
  "ellipse-pedagogical": {
    slug: "ellipse-pedagogical",
    label: "Ellipse pédagogique",
    group: "fondamentaux",
    parameters: ellipsePedagogicalParameters,
    build: (v) => createEllipsePedagogicalGeometry({ width: v.width, height: v.height }),
  },
  "spiral-archimedes": {
    slug: "spiral-archimedes",
    label: "Spirale d'Archimède",
    group: "fondamentaux",
    parameters: spiralParameters,
    build: (v) => createSpiralGeometry({ startRadius: v.startRadius, endRadius: v.endRadius, turns: v.turns, rotation: v.rotation }),
  },
  "flower-4": {
    slug: "flower-4",
    label: "Fleur 4 pétales",
    group: "decoratifs",
    parameters: flower4Parameters,
    build: (v) => createFlower4Geometry({ diameter: v.diameter, rotation: v.rotation }),
  },
  "flower-5": {
    slug: "flower-5",
    label: "Fleur 5 pétales",
    group: "decoratifs",
    parameters: flower5Parameters,
    build: (v) => createFlower5Geometry({ diameter: v.diameter, rotation: v.rotation }),
  },
  "flower-6-elongated": {
    slug: "flower-6-elongated",
    label: "Fleur 6 pétales allongés",
    group: "decoratifs",
    parameters: flower6ElongatedParameters,
    build: (v) => createFlower6ElongatedGeometry({ diameter: v.diameter, rotation: v.rotation }),
  },
  turbine: {
    slug: "turbine",
    label: "Rosace tournante (turbine)",
    group: "decoratifs",
    parameters: turbineParameters,
    build: (v) => createTurbineGeometry({ diameter: v.diameter, branches: v.branches, twist: v.twist, rotation: v.rotation }),
  },
  "double-s": {
    slug: "double-s",
    label: "Composition double-S",
    group: "decoratifs",
    parameters: doubleSParameters,
    build: (v) => createDoubleSGeometry({ width: v.width, height: v.height, waistRatio: v.waistRatio }),
  },
};

export const TRACE_MODEL_SLUGS = Object.keys(TRACE_MODEL_CATALOG) as TraceModelSlug[];

/**
 * Index de résolution. Une `Map` — et non un accès indexé sur l'objet littéral — parce que
 * le slug interrogé vient d'un projet persisté : `TRACE_MODEL_CATALOG["constructor"]`
 * renverrait un membre de `Object.prototype`, jamais un modèle.
 */
const DESCRIPTOR_BY_SLUG: ReadonlyMap<string, TraceModelDescriptor> = new Map(
  Object.values(TRACE_MODEL_CATALOG).map((descriptor) => [descriptor.slug, descriptor]),
);

/** `undefined` — jamais un modèle de repli — quand le slug n'appartient pas au registre (§3). */
export function findTraceModelDescriptor(slug: string | undefined | null): TraceModelDescriptor | undefined {
  if (!slug) return undefined;
  return DESCRIPTOR_BY_SLUG.get(slug);
}

/** Valeurs par défaut publiées par le modèle — la seule source de défauts (§4). */
export function traceModelDefaults(descriptor: TraceModelDescriptor): Record<string, number> {
  return Object.fromEntries(descriptor.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
}
