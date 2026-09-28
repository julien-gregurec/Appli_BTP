const CARACTERES_AMBIGUS = /[\\\u0000-\u001f\u007f]/;

export function destinationInterneSure(valeur: string | null | undefined, repli = "/") {
  if (!valeur || !valeur.startsWith("/") || valeur.startsWith("//") || CARACTERES_AMBIGUS.test(valeur)) return repli;
  try {
    let decodee = valeur;
    for (let index = 0; index < 3; index += 1) {
      const suivante = decodeURIComponent(decodee);
      if (suivante === decodee) break;
      decodee = suivante;
    }
    if (!decodee.startsWith("/") || decodee.startsWith("//") || CARACTERES_AMBIGUS.test(decodee)) return repli;
    const url = new URL(decodee, "https://interne.invalid");
    if (url.origin !== "https://interne.invalid" || url.username || url.password) return repli;
    // On ne renvoie jamais la valeur d'entrée mais la forme normalisée par
    // l'analyseur, revérifiée : `/.//evil.com`, `/..//evil.com`, `/%2e//evil.com`
    // se normalisent en `//evil.com` (protocole-relatif) une fois le pathname
    // reconstruit (REDTEAM-V2 F3).
    const destination = `${url.pathname}${url.search}${url.hash}`;
    if (destination.startsWith("//") || CARACTERES_AMBIGUS.test(destination)) return repli;
    return destination;
  } catch {
    return repli;
  }
}

export function urlExterneAutorisee(valeur: string, hotesAutorises: readonly string[]) {
  try {
    const url = new URL(valeur);
    return url.protocol === "https:" && !url.username && !url.password && hotesAutorises.includes(url.hostname);
  } catch {
    return false;
  }
}
