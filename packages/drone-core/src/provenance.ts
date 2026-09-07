/**
 * Provenance des grandeurs — doctrine reprise de
 * `apps/tools/src/lib/tracing/measurement-origin.ts` (§4 du modèle de données).
 *
 * Trois propriétés sont conservées telles quelles, parce qu'elles sont la raison d'être du
 * module d'origine :
 *
 * 1. une échelle **ordonnée** de confiance ;
 * 2. une combinaison **par le maillon le plus faible** — une surface calculée à partir d'un
 *    pan issu d'une reconstruction non calibrée ne devient pas fiable parce qu'un humain a
 *    cliqué proprement ;
 * 3. un avertissement automatique pour toute valeur non fiable, porté jusqu'au PDF client.
 *
 * Un seul écart, documenté au §4 du modèle de données : Drone ajoute le niveau
 * `field_controlled` (contrôle terrain RTK / points de calage), absent de Tools parce que
 * Tools ne va jamais sur le chantier. Ce niveau domine `exact` : « exact » qualifie une
 * géométrie exacte dans son propre repère, `field_controlled` qualifie une géométrie
 * recalée sur des coordonnées connues du monde réel, ce qui est strictement plus fort pour
 * un métré.
 *
 * Le fichier de Tools n'est **pas** modifié par ce lot. Le point de convergence
 * (`packages/mesure-provenance`) est une dette assumée, à ouvrir le jour où deux applications
 * consomment réellement la même échelle.
 */

export type MeasurementOrigin =
  | "field_controlled"
  | "exact"
  | "manual"
  | "calibrated"
  | "imported"
  | "approximated";

/** Échelle par confiance décroissante. */
export const MEASUREMENT_ORIGINS: readonly MeasurementOrigin[] = [
  "field_controlled",
  "exact",
  "manual",
  "calibrated",
  "imported",
  "approximated",
];

const TRUST_RANK: Record<MeasurementOrigin, number> = {
  field_controlled: 5,
  exact: 4,
  manual: 3,
  calibrated: 2,
  imported: 1,
  approximated: 0,
};

export function estMeasurementOrigin(value: unknown): value is MeasurementOrigin {
  return typeof value === "string" && (MEASUREMENT_ORIGINS as readonly string[]).includes(value);
}

/** Vrai si la valeur peut être présentée comme une dimension chantier réelle. */
export function isRealWorldTrusted(origin: MeasurementOrigin): boolean {
  return TRUST_RANK[origin] >= TRUST_RANK.calibrated;
}

/** Combine plusieurs origines : le maillon le plus faible l'emporte. */
export function combineOrigins(...origins: readonly MeasurementOrigin[]): MeasurementOrigin {
  if (origins.length === 0) return "approximated";
  return origins.reduce((weakest, current) =>
    TRUST_RANK[current] < TRUST_RANK[weakest] ? current : weakest,
  );
}

const LABELS: Record<MeasurementOrigin, string> = {
  field_controlled: "Contrôlé sur le terrain (RTK / points de calage)",
  exact: "Exact (géométrie)",
  manual: "Saisie manuelle",
  calibrated: "Modèle calibré",
  imported: "Importé",
  approximated: "Approximation",
};

export function describeOrigin(origin: MeasurementOrigin): string {
  return LABELS[origin];
}

/** Mention à porter à côté d'une grandeur non fiable, sinon chaîne vide. */
export function originWarning(origin: MeasurementOrigin): string {
  return isRealWorldTrusted(origin) ? "" : "Valeur indicative — non vérifiée sur le chantier.";
}

/**
 * §77 — toute frame extraite d'une vidéo est marquée `degraded_source`, et le marquage se
 * propage jusqu'à la mesure. Une chaîne dégradée plafonne la confiance à `approximated`,
 * quelle que soit la qualité du clic de l'opérateur.
 */
export function applyDegradedSource(
  origin: MeasurementOrigin,
  degradedSource: boolean,
): MeasurementOrigin {
  return degradedSource ? combineOrigins(origin, "approximated") : origin;
}

/**
 * Résout la confiance d'une grandeur dérivée : combine toutes les origines de sa chaîne, puis
 * applique le plafond de source dégradée. C'est la seule fonction que la couche métier doit
 * appeler ; recomposer la règle ailleurs, c'est la perdre.
 */
export function resolveMeasurementTrust(input: {
  readonly origins: readonly MeasurementOrigin[];
  readonly degraded_source: boolean;
}): { readonly origin: MeasurementOrigin; readonly trusted: boolean; readonly warning: string } {
  const origin = applyDegradedSource(combineOrigins(...input.origins), input.degraded_source);
  return { origin, trusted: isRealWorldTrusted(origin), warning: originWarning(origin) };
}
