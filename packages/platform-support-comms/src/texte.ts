/**
 * Assainissement du texte d'une communication (§15 : XSS, HTML arbitraire).
 *
 * Choix assumé : le contenu d'une communication est du TEXTE, jamais du HTML. Aucune
 * balise n'est « nettoyée » — elles sont refusées à la saisie. Un assainisseur HTML est
 * une surface d'attaque permanente à maintenir ; un champ texte n'en est pas une. Le
 * rendu applique ensuite l'échappement natif de JSX, sans jamais
 * `dangerouslySetInnerHTML`.
 *
 * Les plages interdites sont exprimées en points de code numériques plutôt qu'en
 * littéraux : un caractère invisible dans le code source serait, ici précisément,
 * illisible en relecture.
 */

/** C0/C1, tabulation (9) et sauts de ligne (10, 13) exceptés. */
const PLAGES_CONTROLE: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
];

/** Largeurs nulles, marques de direction et isolants bidirectionnels. */
const PLAGES_INVISIBLES: readonly (readonly [number, number])[] = [
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

function contient(valeur: string, plages: readonly (readonly [number, number])[]): boolean {
  for (const caractere of valeur) {
    const point = caractere.codePointAt(0);
    if (point === undefined) continue;
    for (const [debut, fin] of plages) {
      if (point >= debut && point <= fin) return true;
    }
  }
  return false;
}

export function contientCaractereDeControle(valeur: string): boolean {
  return contient(valeur, PLAGES_CONTROLE);
}

export function contientCaractereInvisible(valeur: string): boolean {
  return contient(valeur, PLAGES_INVISIBLES);
}

export type ResultatTexte =
  | { valide: true; texte: string }
  | { valide: false; erreur: RaisonTexteRefuse; message: string };

export type RaisonTexteRefuse =
  | "vide"
  | "trop_long"
  | "html_interdit"
  | "caracteres_de_controle"
  | "caracteres_invisibles";

export function validerTexteCommunication(
  brut: string | null | undefined,
  options: { min?: number; max: number; champ: string },
): ResultatTexte {
  const valeur = (brut ?? "").trim();
  const min = options.min ?? 1;
  if (valeur.length < min) {
    return { valide: false, erreur: "vide", message: `${options.champ} : ${min} caractère(s) minimum` };
  }
  if (valeur.length > options.max) {
    return { valide: false, erreur: "trop_long", message: `${options.champ} : ${options.max} caractères maximum` };
  }
  if (/[<>]/.test(valeur)) {
    return {
      valide: false,
      erreur: "html_interdit",
      message: `${options.champ} : les balises HTML ne sont pas acceptées`,
    };
  }
  if (contientCaractereDeControle(valeur)) {
    return {
      valide: false,
      erreur: "caracteres_de_controle",
      message: `${options.champ} : caractères de contrôle interdits`,
    };
  }
  if (contientCaractereInvisible(valeur)) {
    return {
      valide: false,
      erreur: "caracteres_invisibles",
      message: `${options.champ} : caractères invisibles interdits`,
    };
  }
  return { valide: true, texte: valeur };
}
