/**
 * Synonymes métier — table statique, aucune IA, aucun réseau.
 *
 * Le vocabulaire de chantier est irrégulier : on dit « placo » pour une plaque de plâtre,
 * « équerre » pour un équerrage, « vitre » pour un vitrage. La recherche locale ne peut pas
 * le deviner ; elle le lit ici.
 *
 * Chaque groupe est une classe d'équivalence : n'importe quel terme du groupe fait
 * correspondre n'importe quel autre. Les termes sont écrits **déjà normalisés**
 * (minuscules, sans accent, cf. `text.ts`) — `synonyms.test.ts` le vérifie.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["placo", "plaque de platre", "ba13", "plaque"],
  ["cloison", "doublage", "ossature"],
  ["equerre", "equerrage", "angle droit"],
  ["niveau", "laser", "horizontale", "trait de niveau"],
  ["aplomb", "vertical", "verticalite", "fil a plomb"],
  ["cote", "mesure", "releve", "dimension"],
  ["vitre", "vitrage", "verre", "glace"],
  ["cale", "calage", "cales"],
  ["cheville", "fixation", "ancrage"],
  ["porte", "bloc porte", "vantail"],
  ["dormant", "bati", "huisserie", "cadre"],
  ["silicone", "mastic", "joint souple"],
  ["etancheite", "calfeutrement", "etanche"],
  ["alu", "aluminium", "profile alu"],
  ["poncage", "poncer", "abrasif"],
  ["bande", "bande a joint", "joint de plaque"],
  ["fissure", "fissuration", "microfissure"],
  ["entraxe", "entraxes", "repartition"],
  ["cercle", "rond", "circulaire"],
  ["ellipse", "ovale"],
  ["arc", "cintre", "arche", "voute"],
  ["cordeau", "cordex", "traceur"],
  ["epi", "protection individuelle", "securite"],
  ["decoupe", "coupe", "scie"],
  ["gabarit", "patron", "calibre"],
];

const EXPANSIONS: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    for (const term of group) {
      const bucket = map.get(term) ?? new Set<string>([term]);
      for (const other of group) bucket.add(other);
      map.set(term, bucket);
    }
  }
  return new Map([...map].map(([term, set]) => [term, [...set]]));
})();

/** Toutes les formes équivalentes d'un jeton normalisé, le jeton lui-même en tête. */
export function expandSynonyms(token: string): readonly string[] {
  const expansions = EXPANSIONS.get(token);
  if (!expansions) return [token];
  return [token, ...expansions.filter((value) => value !== token)];
}

/** Exposé pour les tests d'intégrité de la table. */
export const SYNONYM_GROUPS_FOR_TEST = SYNONYM_GROUPS;
