/**
 * Vocabulaire des modèles de tracés autorisés dans `ConseilFiche.relatedTraceIds`.
 *
 * Cette liste est **recopiée volontairement** du registre géométrique
 * (`lib/geometry/models/catalog.ts`, `TraceModelSlug`) au lieu d'être importée : le module
 * Conseils doit rester indépendant du moteur « Tracés & Géométrie » (cf.
 * docs/conseils-techniques.md) et ne rien embarquer de sa géométrie dans le bundle.
 *
 * La divergence est impossible sans échec de test : `trace-models.test.ts` compare cette
 * liste au catalogue réel. Aucun slug inventé ne peut donc entrer dans une fiche.
 */
export const CONSEIL_TRACE_MODEL_IDS = [
  "circle-division",
  "star-5",
  "rosette-6",
  "heart",
  "arch-full-round",
  "ogive-equilateral",
  "ellipse-pedagogical",
  "spiral-archimedes",
  "flower-4",
  "flower-5",
  "flower-6-elongated",
  "turbine",
  "double-s",
] as const;

export type ConseilTraceModelId = (typeof CONSEIL_TRACE_MODEL_IDS)[number];

const KNOWN = new Set<string>(CONSEIL_TRACE_MODEL_IDS);

/** `true` si le slug appartient au registre réel des 13 modèles paramétriques. */
export function isConseilTraceModelId(value: string): value is ConseilTraceModelId {
  return KNOWN.has(value);
}
