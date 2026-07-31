const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARQUE_VEHICULE = /^[\p{L}\p{N}][\p{L}\p{N} .&'’()+\-/]{1,79}$/u;

export function estUuid(valeur: unknown): valeur is string {
  return typeof valeur === "string" && UUID.test(valeur);
}

export function lireMarqueVehicule(valeur: string | null | undefined) {
  const marque = valeur?.trim();
  if (!marque || !MARQUE_VEHICULE.test(marque)) throw new Error("Marque invalide");
  return marque;
}

export function verifierTailleRequete(headers: Headers, maximumOctets: number) {
  const valeur = headers.get("content-length");
  if (valeur === null) return true;
  const taille = Number(valeur);
  return Number.isSafeInteger(taille) && taille >= 0 && taille <= maximumOctets;
}

export function erreurPublique(_erreur: unknown, messageNeutre = "Une erreur est survenue") {
  return messageNeutre;
}
