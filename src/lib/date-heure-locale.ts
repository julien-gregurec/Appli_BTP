// Contrat explicite des champs `<input type="datetime-local">` (V9-01, post-V9).
//
// Un `datetime-local` transmet une heure MURALE sans fuseau (« 2026-10-02T09:00 »).
// L'ancien code l'interprétait par `new Date(valeur)` côté serveur, donc dans le fuseau du
// serveur (UTC sur Vercel) : 09:00 saisi à Paris devenait 09:00 UTC = 11:00 à Paris. Le
// rendu inverse, calculé côté serveur avec `getTimezoneOffset()`, affichait l'heure UTC.
//
// Contrat :
//   - saisie : heure murale + fuseau IANA du NAVIGATEUR, transmis dans un champ caché
//     `<nom>__fuseau` posé par le composant ChampDateHeure ;
//   - conversion : côté serveur, explicite, par `instantDepuisDateHeureLocale` ;
//   - stockage : instant UTC (ISO 8601, `timestamptz`) ;
//   - rendu : instant → heure murale DANS LE MÊME fuseau que celui renvoyé à la saisie.
// Sans JavaScript (fuseau du navigateur inconnu), saisie et rendu utilisent tous deux le
// fuseau de référence du produit, FUSEAU_REFERENCE : l'aller-retour reste cohérent.
//
// Heures ambiguës ou inexistantes (changement d'heure), règle « compatible » usuelle
// (Temporal, java.time) : une heure qui n'existe pas (ex. 02:30 le dernier dimanche de mars
// à Paris) est poussée vers l'avant de l'écart (03:30) ; une heure qui existe deux fois
// retient la première occurrence (heure d'été).

export const FUSEAU_REFERENCE = "Europe/Paris";

const MOTIF_DATE_HEURE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function fuseauValide(fuseau: unknown): fuseau is string {
  if (typeof fuseau !== "string" || !fuseau || fuseau.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(fuseau)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuseau });
    return true;
  } catch {
    return false;
  }
}

function composantesMurales(instant: number, fuseau: string) {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const valeur = (type: Intl.DateTimeFormatPartTypes) => Number(parties.find((partie) => partie.type === type)?.value);
  return { annee: valeur("year"), mois: valeur("month"), jour: valeur("day"), heure: valeur("hour"), minute: valeur("minute"), seconde: valeur("second") };
}

/** Décalage (ms) du fuseau à un instant donné : heure murale − UTC. */
function decalage(instant: number, fuseau: string): number {
  const c = composantesMurales(instant, fuseau);
  const murale = Date.UTC(c.annee, c.mois - 1, c.jour, c.heure, c.minute, c.seconde);
  return murale - Math.floor(instant / 1000) * 1000;
}

/**
 * Heure murale `AAAA-MM-JJTHH:mm[:ss]` dans `fuseau` → instant (Date), ou null si la valeur
 * est vide ou invalide (format, date impossible, fuseau inconnu).
 */
export function instantDepuisDateHeureLocale(valeur: string | null | undefined, fuseau: string): Date | null {
  const texte = (valeur ?? "").trim();
  const m = MOTIF_DATE_HEURE.exec(texte);
  if (!m || !fuseauValide(fuseau)) return null;
  const [annee, mois, jour, heure, minute, seconde] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  const murale = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);
  const verif = new Date(murale);
  if (verif.getUTCFullYear() !== annee || verif.getUTCMonth() !== mois - 1 || verif.getUTCDate() !== jour
    || verif.getUTCHours() !== heure || verif.getUTCMinutes() !== minute || verif.getUTCSeconds() !== seconde) {
    return null;
  }
  // Décalages avant / après un éventuel changement d'heure autour de cette date.
  const JOUR = 86_400_000;
  const avant = murale - decalage(murale - JOUR, fuseau);
  const apres = murale - decalage(murale + JOUR, fuseau);
  const existe = (instant: number) => decalage(instant, fuseau) === murale - instant;
  if (existe(avant) && existe(apres)) return new Date(Math.min(avant, apres)); // ambiguë : 1re occurrence
  if (existe(apres)) return new Date(apres);
  return new Date(avant); // normale, ou inexistante : décalage d'avant → heure poussée vers l'avant
}

/** Instant (ISO ou Date) → valeur `AAAA-MM-JJTHH:mm` d'un `datetime-local` dans `fuseau`. */
export function valeurDateHeureDansFuseau(valeur: string | Date | null | undefined, fuseau: string): string {
  if (!valeur) return "";
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(date.getTime()) || !fuseauValide(fuseau)) return "";
  const c = composantesMurales(date.getTime(), fuseau);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${String(c.annee).padStart(4, "0")}-${deux(c.mois)}-${deux(c.jour)}T${deux(c.heure)}:${deux(c.minute)}`;
}

export const suffixeFuseau = (nom: string) => `${nom}__fuseau`;
export const suffixeSansValeur = (nom: string) => `${nom}__aucune`;

export type LectureDateHeure =
  | { statut: "vide"; iso: null }
  | { statut: "valide"; iso: string }
  | { statut: "invalide"; iso: null };

/**
 * Lecture serveur d'un champ ChampDateHeure : heure murale + fuseau transmis (repli :
 * FUSEAU_REFERENCE). Case « sans date » cochée → vide, quelle que soit la valeur saisie
 * (contournement de Safari, qui ne permet pas de vider un `datetime-local`).
 * Une valeur non vide et invalide n'est JAMAIS confondue avec « pas de date ».
 */
export function lireDateHeureFormulaire(formData: FormData, nom: string): LectureDateHeure {
  if (formData.get(suffixeSansValeur(nom)) === "1") return { statut: "vide", iso: null };
  const brute = String(formData.get(nom) ?? "").trim();
  if (!brute) return { statut: "vide", iso: null };
  const fuseauTransmis = formData.get(suffixeFuseau(nom));
  const fuseau = fuseauValide(fuseauTransmis) ? fuseauTransmis : FUSEAU_REFERENCE;
  const instant = instantDepuisDateHeureLocale(brute, fuseau);
  return instant ? { statut: "valide", iso: instant.toISOString() } : { statut: "invalide", iso: null };
}
