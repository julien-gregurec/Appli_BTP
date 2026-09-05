// Registre du futur module "Tracés & Géométrie" (ENGINE-FOUNDATION-V1 §13,
// FIRST-FUNCTIONAL-LOT-V1 §1). Toujours volontairement limité : les 3 modèles réels de ce lot
// seulement — aucune des ~110 références, aucun catalogue complet. Chaque entrée est un
// import() paresseux par slug — jamais un import statique en bloc (voir audit
// ARCHITECTURE-AUDIT-V1 §26, performance/bundle). Ce registre n'est référencé par
// src/lib/catalog.ts nulle part : les 3 modèles restent internes/preview, non exposés dans le
// catalogue public ni sur aucune route commerciale.
// Type volontairement générique (pas typé sur un module précis) : chaque module exporte sa
// propre fonction create<Nom>Geometry, le consommateur importe et appelle l'export dont il a
// besoin.
export type TraceModelLoader = () => Promise<Record<string, unknown>>;

export const traceModelRegistry: Readonly<Record<string, TraceModelLoader>> = {
  "circle-division": () => import("./circle-division"),
  "star-5": () => import("./star"),
  "rosette-6": () => import("./rosette"),
};
