// GeolocationPositionError.message est un texte brut fourni par le navigateur
// (souvent en anglais, ex. "User denied Geolocation") — jamais affiché tel
// quel côté terrain, toujours traduit à partir du code d'erreur standard.
export function messageErreurGps(code: number): string {
  if (code === 1) return "Localisation refusée. Autorisez la localisation dans les réglages du navigateur pour ce site, ou indiquez un motif ci-dessous.";
  if (code === 2) return "Position indisponible pour le moment (réseau ou GPS faible). Réessayez, ou indiquez un motif ci-dessous.";
  if (code === 3) return "La localisation a pris trop de temps à répondre. Réessayez, ou indiquez un motif ci-dessous.";
  return "Position impossible à obtenir. Autorisez la localisation dans les réglages du navigateur.";
}
