const CARACTERES_AMBIGUS = /[\\\u0000-\u001f\u007f]/;

export function destinationInterneSure(valeur: string | null | undefined, repli = "/") {
  if (!valeur || !valeur.startsWith("/") || valeur.startsWith("//") || CARACTERES_AMBIGUS.test(valeur)) return repli;
  try {
    const decodee = decodeURIComponent(valeur);
    if (!decodee.startsWith("/") || decodee.startsWith("//") || CARACTERES_AMBIGUS.test(decodee)) return repli;
    const url = new URL(decodee, "https://interne.invalid");
    if (url.origin !== "https://interne.invalid" || url.username || url.password) return repli;
    return `${url.pathname}${url.search}${url.hash}`;
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
