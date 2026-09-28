// Validation stricte des URL de redirection internes.
//
// Contexte sécurité : plusieurs points d'entrée (callbacks d'authentification,
// actions serveur) reçoivent un paramètre `next`/`retour` fourni par le client et
// s'en servent pour une redirection. Le contrôle historique
// `valeur.startsWith("/") && !valeur.startsWith("//")` est insuffisant : le parseur
// URL WHATWG traite les antislashs comme des slashs pour les schémas http(s), donc
// des valeurs comme `/\evil.com` ou `/\t/evil.com` sont normalisées en
// `https://evil.com/` — une redirection ouverte exploitable pour le phishing.
//
// `cheminInterneSur` résout la valeur contre une origine sentinelle et n'accepte le
// chemin que si l'origine résultante n'a pas changé : toute tentative de faire
// pointer la redirection vers un hôte externe retombe sur le chemin de secours.

const ORIGINE_SENTINELLE = "https://interne.invalide";

export function cheminInterneSur(valeur: string | null | undefined, secours: string): string {
  if (typeof valeur !== "string" || valeur.length === 0 || valeur[0] !== "/") {
    return secours;
  }
  // Rejet explicite des formes qui expriment une autorité (`//host`, `/\host`).
  // Le parseur URL neutralise déjà ces cas via le contrôle d'origine ci-dessous,
  // mais un rejet précoce évite de dépendre uniquement de son comportement.
  if (valeur[1] === "/" || valeur[1] === "\\") {
    return secours;
  }
  try {
    const resolu = new URL(valeur, ORIGINE_SENTINELLE);
    if (resolu.origin !== ORIGINE_SENTINELLE) {
      return secours;
    }
    return `${resolu.pathname}${resolu.search}${resolu.hash}`;
  } catch {
    return secours;
  }
}
