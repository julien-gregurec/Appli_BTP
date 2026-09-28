// Identité légale et de contact portée par TOUS les e-mails ELSATIA.
//
// Règles :
//   * l'éditeur est une entreprise individuelle : nom, forme, RCS — rien de plus. L'adresse
//     postale de l'exploitant (domicile) n'est JAMAIS reprise dans un e-mail : elle reste
//     cantonnée aux mentions légales, où la loi l'impose ;
//   * l'adresse de contact n'est pas une constante : elle vient de `SUPPORT_EMAIL`
//     (configuration). Tant qu'elle n'est pas configurée, aucun e-mail n'en affiche une —
//     on n'invente pas une boîte qui n'est peut-être pas relevée.

export const MARQUE_ELSATIA = "ELSATIA";

export const IDENTITE_LEGALE_ELSATIA = Object.freeze({
  marque: MARQUE_ELSATIA,
  editeur: "Julien GREGUREC",
  forme: "EI",
  rcs: "850 559 873 R.C.S. Strasbourg",
});

type Env = Record<string, string | undefined>;

const ADRESSE_SIMPLE = /^[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[^\s@,;<>"'()]+$/;

/** Adresse de contact configurée, ou `null` si absente ou mal formée. */
export function adresseContact(environnement: Env = process.env): string | null {
  const valeur = environnement.SUPPORT_EMAIL?.trim();
  return valeur && ADRESSE_SIMPLE.test(valeur) ? valeur : null;
}

/** Ligne légale en texte brut, identique dans tous les gabarits. */
export function ligneLegale(): string {
  const i = IDENTITE_LEGALE_ELSATIA;
  return `${i.marque} — édité par ${i.editeur}, ${i.forme}, ${i.rcs}.`;
}
