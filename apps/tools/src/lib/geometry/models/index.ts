// Registre du futur module "Tracés & Géométrie" (ENGINE-FOUNDATION-V1 §13,
// FIRST-FUNCTIONAL-LOT-V1 §1, FUNDAMENTAL-MODELS-V1 §19). Toujours volontairement limité : les
// 8 modèles internes de ce lot seulement — aucune des ~110 références décoratives, aucun
// catalogue complet. Chaque entrée est un import() paresseux par slug — jamais un import
// statique en bloc (voir audit ARCHITECTURE-AUDIT-V1 §26, performance/bundle). Ce registre
// n'est référencé par src/lib/catalog.ts nulle part : les 8 modèles restent internes/preview,
// non exposés dans le catalogue public ni sur aucune route commerciale.
// Type volontairement générique (pas typé sur un module précis) : chaque module exporte sa
// propre fonction create<Nom>Geometry, le consommateur importe et appelle l'export dont il a
// besoin.
export type TraceModelLoader = () => Promise<Record<string, unknown>>;

export const traceModelRegistry: Readonly<Record<string, TraceModelLoader>> = {
  "circle-division": () => import("./circle-division"),
  "star-5": () => import("./star"),
  "rosette-6": () => import("./rosette"),
  heart: () => import("./heart"),
  "arch-full-round": () => import("./arch-full-round"),
  "ogive-equilateral": () => import("./ogive"),
  "ellipse-pedagogical": () => import("./ellipse-pedagogical"),
  "spiral-archimedes": () => import("./spiral"),
};
