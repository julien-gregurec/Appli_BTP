// Registre minimal pour le futur module "Tracés & Géométrie" (ENGINE-FOUNDATION-V1 §13).
// Volontairement quasi vide : aucune des ~110 références n'est intégrée dans ce lot, aucun
// catalogue complet n'est construit ici. Chaque entrée future sera un import() paresseux par
// slug — jamais un import statique en bloc de centaines de modules (voir audit
// ARCHITECTURE-AUDIT-V1 §26, performance/bundle). Le seul module référencé ici est le
// démonstrateur technique interne, absent de src/lib/catalog.ts (donc non exposé publiquement).
// Type volontairement générique (pas typé sur un module précis) : chaque futur module
// exportera sa propre fonction create<Nom>Geometry, le consommateur importe et appelle
// l'export dont il a besoin — pas de forme imposée ici, pour ne pas figer une API avant
// qu'un second modèle réel ne confirme le bon contrat.
export type TraceModelLoader = () => Promise<Record<string, unknown>>;

export const traceModelRegistry: Readonly<Record<string, TraceModelLoader>> = {
  "demo-circle-division": () => import("./circle-division"),
};
