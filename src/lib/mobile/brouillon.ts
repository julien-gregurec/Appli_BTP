/**
 * Conservation d'un brouillon de formulaire en cas d'interruption.
 *
 * Le cas visé est banal sur un chantier : un salarié saisit une note de frais, un appel
 * arrive, il bascule d'application, l'onglet est évincé de la mémoire par le système. En
 * revenant, il retrouve un formulaire vide et vingt secondes de saisie perdues — la
 * troisième fois, il cesse de saisir sur le téléphone.
 *
 * Ce module est PUR : il ne touche ni au DOM, ni à React. Il prend un stockage en paramètre,
 * ce qui le rend testable sans navigateur et permet de le brancher indifféremment sur
 * `sessionStorage` ou `localStorage`.
 *
 * Ce qu'il ne fait PAS, volontairement :
 *   — il ne conserve aucun fichier ni image (une photo de justificatif se recapture, et
 *     l'écrire en base64 dans le stockage clé/valeur ferait exploser le quota) ;
 *   — il ne conserve rien sans identité (voir `identite-locale.ts`) ;
 *   — il ne remplace pas la file hors ligne : un brouillon est un travail EN COURS, pas une
 *     mutation soumise. Les deux ne doivent pas être confondus, sans quoi on finirait par
 *     envoyer au serveur une saisie que l'utilisateur n'a jamais validée.
 */
import { cleLocale, type IdentiteLocale } from "@/lib/mobile/identite-locale";

export type StockageCleValeur = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Au-delà, on refuse d'écrire : un brouillon n'a pas vocation à transporter un document. */
const TAILLE_MAX_OCTETS = 64 * 1024;

/** Un brouillon plus vieux que ça n'est plus un travail interrompu, c'est un résidu. */
export const PEREMPTION_MS = 24 * 60 * 60 * 1000;

export type Brouillon<T> = { valeurs: T; enregistreA: number };

function estBrouillon(valeur: unknown): valeur is Brouillon<unknown> {
  return typeof valeur === "object" && valeur !== null
    && "valeurs" in valeur && "enregistreA" in valeur
    && typeof (valeur as { enregistreA: unknown }).enregistreA === "number";
}

export function enregistrerBrouillon<T>(
  stockage: StockageCleValeur,
  identite: IdentiteLocale | null,
  formulaire: string,
  valeurs: T,
  maintenant = Date.now(),
): boolean {
  const cle = cleLocale(identite, `brouillon:${formulaire}`);
  if (!cle) return false;
  let charge: string;
  try {
    charge = JSON.stringify({ valeurs, enregistreA: maintenant } satisfies Brouillon<T>);
  } catch {
    // Valeurs non sérialisables (un File, une référence circulaire) : on ne conserve rien
    // plutôt que d'écrire un brouillon tronqué qui se relirait en formulaire à moitié rempli.
    return false;
  }
  if (charge.length > TAILLE_MAX_OCTETS) return false;
  try {
    stockage.setItem(cle, charge);
    return true;
  } catch {
    // Quota dépassé, ou stockage refusé (navigation privée, réglage du navigateur).
    // Perdre un brouillon est désagréable ; faire échouer la saisie en cours le serait plus.
    return false;
  }
}

export function lireBrouillon<T>(
  stockage: StockageCleValeur,
  identite: IdentiteLocale | null,
  formulaire: string,
  maintenant = Date.now(),
): T | null {
  const cle = cleLocale(identite, `brouillon:${formulaire}`);
  if (!cle) return null;
  let brut: string | null;
  try { brut = stockage.getItem(cle); } catch { return null; }
  if (!brut) return null;

  let analyse: unknown;
  try { analyse = JSON.parse(brut); } catch { effacerBrouillon(stockage, identite, formulaire); return null; }
  if (!estBrouillon(analyse)) { effacerBrouillon(stockage, identite, formulaire); return null; }

  if (maintenant - analyse.enregistreA > PEREMPTION_MS) {
    effacerBrouillon(stockage, identite, formulaire);
    return null;
  }
  return analyse.valeurs as T;
}

export function effacerBrouillon(
  stockage: StockageCleValeur,
  identite: IdentiteLocale | null,
  formulaire: string,
): void {
  const cle = cleLocale(identite, `brouillon:${formulaire}`);
  if (!cle) return;
  try { stockage.removeItem(cle); } catch { /* rien à faire : le brouillon expirera seul */ }
}
