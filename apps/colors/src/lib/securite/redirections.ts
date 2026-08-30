// Validation centralisée des destinations de redirection internes.
//
// Objectif : n'accepter qu'un chemin relatif à la racine du domaine Colors,
// sans possibilité d'évasion vers une origine externe. Toute valeur ambiguë
// retombe sur le repli (`/dashboard` par défaut).
//
// Rejette notamment :
//   - URL absolue / origine externe (`https://evil.com`)
//   - protocole relatif (`//evil.com`)
//   - antislash brut ou encodé (`/\evil.com`, `/%5Cevil.com`)
//   - séparateur encodé (`/%2Fevil.com`), y compris doublement encodé
//   - caractères de contrôle / tabulation / saut de ligne, bruts ou encodés
//   - identifiants dans l'URL (`user:pass@`)
//   - décodage invalide (`%` mal formé) ou destination ambiguë
// Conserve les chemins internes légitimes avec query et hash.

const SEQUENCE_ENCODEE_INTERDITE = /%(?:2f|5c|00|09|0a|0d)/i;

function contientCaractereAmbigu(valeur: string): boolean {
  if (valeur.includes("\\")) return true;
  for (let index = 0; index < valeur.length; index += 1) {
    const code = valeur.charCodeAt(index);
    // Caractères de contrôle C0 (dont tabulation 0x09, LF 0x0A, CR 0x0D) et DEL.
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function estCheminInterneAcceptable(valeur: string): boolean {
  return valeur.startsWith("/") && !valeur.startsWith("//") && !contientCaractereAmbigu(valeur);
}

export function destinationInterneSure(
  valeur: string | null | undefined,
  repli = "/dashboard",
): string {
  if (typeof valeur !== "string" || valeur.length === 0) return repli;
  if (!estCheminInterneAcceptable(valeur)) return repli;
  if (SEQUENCE_ENCODEE_INTERDITE.test(valeur)) return repli;

  // Décodage répété : une valeur simplement ou doublement encodée qui révèle
  // un antislash, un double slash ou un caractère de contrôle est rejetée.
  let courant = valeur;
  for (let index = 0; index < 3; index += 1) {
    let decode: string;
    try {
      decode = decodeURIComponent(courant);
    } catch {
      return repli;
    }
    if (decode === courant) break;
    courant = decode;
    if (!estCheminInterneAcceptable(courant) || SEQUENCE_ENCODEE_INTERDITE.test(courant)) {
      return repli;
    }
  }

  try {
    const url = new URL(valeur, "https://interne.invalide");
    if (url.origin !== "https://interne.invalide") return repli;
    if (url.username || url.password) return repli;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return repli;
  }
}
