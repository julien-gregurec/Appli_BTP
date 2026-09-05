// Registre du futur module "Tracés & Géométrie" (ENGINE-FOUNDATION-V1 §13,
// FIRST-FUNCTIONAL-LOT-V1 §1, FUNDAMENTAL-MODELS-V1 §19, DECORATIVE-FAMILIES-V1 §17).
// Toujours volontairement limité : 13 modèles internes après ce lot — aucune des ~110
// références décoratives intégrée, aucun catalogue complet. Chaque entrée est un import()
// paresseux par slug — jamais un import statique en bloc (voir audit ARCHITECTURE-AUDIT-V1 §26,
// performance/bundle). Ce registre n'est référencé par src/lib/catalog.ts nulle part : les 13
// modèles restent internes/preview, non exposés dans le catalogue public ni sur aucune route
// commerciale.
// Type volontairement générique (pas typé sur un module précis) : chaque module exporte sa
// propre fonction create<Nom>Geometry, le consommateur importe et appelle l'export dont il a
// besoin.
export type TraceModelLoader = () => Promise<Record<string, unknown>>;
export type TraceModelGroup = "fondamentaux" | "decoratifs";

export const traceModelRegistry: Readonly<Record<string, TraceModelLoader>> = {
  // Fondamentaux
  "circle-division": () => import("./circle-division"),
  "star-5": () => import("./star"),
  "rosette-6": () => import("./rosette"),
  heart: () => import("./heart"),
  "arch-full-round": () => import("./arch-full-round"),
  "ogive-equilateral": () => import("./ogive"),
  "ellipse-pedagogical": () => import("./ellipse-pedagogical"),
  "spiral-archimedes": () => import("./spiral"),
  // Familles décoratives
  "flower-4": () => import("./flower4"),
  "flower-5": () => import("./flower5"),
  "flower-6-elongated": () => import("./flower6-elongated"),
  turbine: () => import("./turbine"),
  "double-s": () => import("./double-s"),
};

export const traceModelGroups: Readonly<Record<string, TraceModelGroup>> = {
  "circle-division": "fondamentaux",
  "star-5": "fondamentaux",
  "rosette-6": "fondamentaux",
  heart: "fondamentaux",
  "arch-full-round": "fondamentaux",
  "ogive-equilateral": "fondamentaux",
  "ellipse-pedagogical": "fondamentaux",
  "spiral-archimedes": "fondamentaux",
  "flower-4": "decoratifs",
  "flower-5": "decoratifs",
  "flower-6-elongated": "decoratifs",
  turbine: "decoratifs",
  "double-s": "decoratifs",
};
