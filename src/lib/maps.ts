// Lien de recherche Google Maps à partir d'un texte libre (nom de lieu ou adresse complète) —
// pas besoin de géocodage, la recherche Maps gère très bien le texte approximatif.
export function lienMaps(lieu: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`;
}
