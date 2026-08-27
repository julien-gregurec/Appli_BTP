/**
 * Point d’entrée d’instrumentation propre à Colors.
 *
 * Il empêche l’application sœur de charger implicitement l’instrumentation de
 * Gestion Pro depuis la racine du monorepo. Les hooks Colors seront ajoutés ici
 * lorsqu’ils auront été définis explicitement.
 */
export function register() {}
