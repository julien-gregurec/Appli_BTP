/**
 * Sécurité des liens portés par une communication (§15).
 *
 * Deux risques distincts :
 *   * le lien lui-même (schéma `javascript:`, `data:`, redirection ouverte) ;
 *   * la destination (un domaine tiers arbitraire présenté comme ELSATIA).
 *
 * La politique retenue : HTTPS uniquement, hôtes ELSATIA par défaut, et une liste
 * d'exception explicite tenue par la plateforme. Un lien relatif interne est accepté
 * s'il commence par « / » sans double barre (ce qui exclut `//evil.example`).
 */

export const HOTES_ELSATIA_PAR_DEFAUT: readonly string[] = [
  "elsatia.fr",
  "app.elsatia.fr",
  "colors.elsatia.fr",
  "outils.elsatia.fr",
  "reserves.elsatia.fr",
];

export type ResultatLien =
  | { valide: true; href: string; interne: boolean }
  | { valide: false; erreur: RaisonLienRefuse; message: string };

export type RaisonLienRefuse =
  | "vide"
  | "schema_interdit"
  | "redirection_ouverte"
  | "hote_non_autorise"
  | "identifiants_incorpores"
  | "url_invalide";

const SCHEMAS_AUTORISES = new Set(["https:"]);

function hoteAutorise(hote: string, autorises: readonly string[]): boolean {
  const h = hote.toLowerCase();
  return autorises.some((a) => h === a.toLowerCase() || h.endsWith(`.${a.toLowerCase()}`));
}

export function validerLienCommunication(
  brut: string | null | undefined,
  hotesAutorises: readonly string[] = HOTES_ELSATIA_PAR_DEFAUT,
): ResultatLien {
  const valeur = (brut ?? "").trim();
  if (valeur === "") return { valide: false, erreur: "vide", message: "Lien vide" };

  // Lien interne : une seule barre initiale. « //hote » est une URL protocol-relative,
  // donc une redirection ouverte déguisée, et doit être refusée.
  if (valeur.startsWith("/")) {
    if (valeur.startsWith("//") || valeur.startsWith("/\\")) {
      return {
        valide: false,
        erreur: "redirection_ouverte",
        message: "Lien relatif ambigu (redirection ouverte)",
      };
    }
    return { valide: true, href: valeur, interne: true };
  }

  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return { valide: false, erreur: "url_invalide", message: "Lien invalide" };
  }
  if (!SCHEMAS_AUTORISES.has(url.protocol)) {
    return {
      valide: false,
      erreur: "schema_interdit",
      message: "Seuls les liens https sont acceptés",
    };
  }
  if (url.username !== "" || url.password !== "") {
    return {
      valide: false,
      erreur: "identifiants_incorpores",
      message: "Un lien ne peut pas contenir d’identifiants",
    };
  }
  if (!hoteAutorise(url.hostname, hotesAutorises)) {
    return {
      valide: false,
      erreur: "hote_non_autorise",
      message: `Domaine non autorisé : ${url.hostname}`,
    };
  }
  // Un paramètre de redirection pointant hors des hôtes autorisés transforme un lien
  // légitime en redirection ouverte : on le refuse plutôt que de le nettoyer en silence.
  for (const [, v] of url.searchParams) {
    const candidat = v.trim();
    if (!candidat.startsWith("http://") && !candidat.startsWith("https://")) continue;
    try {
      const cible = new URL(candidat);
      if (!hoteAutorise(cible.hostname, hotesAutorises)) {
        return {
          valide: false,
          erreur: "redirection_ouverte",
          message: "Le lien contient une redirection vers un domaine non autorisé",
        };
      }
    } catch {
      return { valide: false, erreur: "url_invalide", message: "Lien invalide" };
    }
  }
  return { valide: true, href: url.toString(), interne: false };
}

export const LONGUEUR_MAXIMALE_LIBELLE_BOUTON = 40;

export type ResultatLibelleBouton =
  | { valide: true; libelle: string }
  | { valide: false; erreur: string };

export function validerLibelleBouton(brut: string | null | undefined): ResultatLibelleBouton {
  const valeur = (brut ?? "").trim();
  if (valeur === "") return { valide: false, erreur: "Libellé de bouton vide" };
  if (valeur.length > LONGUEUR_MAXIMALE_LIBELLE_BOUTON) {
    return {
      valide: false,
      erreur: `Libellé trop long (${LONGUEUR_MAXIMALE_LIBELLE_BOUTON} caractères maximum)`,
    };
  }
  return { valide: true, libelle: valeur };
}
