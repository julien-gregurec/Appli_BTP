/**
 * Mode du flag `ELSATIA_GP_ACCES_APP` (décision D1 : Gestion Pro exige une habilitation `gestion_pro`,
 * mais jamais d'enforcement direct sur les utilisateurs existants).
 *
 * Deux modes seulement existent AUJOURD'HUI :
 *  - `off` (défaut) : rien n'est calculé, rien n'est journalisé ;
 *  - `observe` : la décision `decision_acces_application('gestion_pro')` est calculée en arrière-plan et
 *    comparée à la décision actuelle de GP ; l'écart est journalisé, personne n'est bloqué.
 *
 * `enforce` est RECONNU pour ne pas surprendre un opérateur qui l'écrirait, mais il est RÉTROGRADÉ en
 * `observe` avec un avertissement : l'enforcement n'existe pas dans ce lot et ne peut pas être fusionné
 * sans preuve que le backfill couvre les utilisateurs existants (voir l'annexe D1).
 */

export type ModeAccesGp = "off" | "observe";

export type LectureModeAccesGp = {
  mode: ModeAccesGp;
  /** Message à journaliser UNE fois par processus (mode demandé inconnu ou rétrogradé) ; null sinon. */
  avertissement: string | null;
};

export const AVERTISSEMENT_ENFORCE_NON_IMPLEMENTE =
  "enforcement non implémenté : qualification du backfill requise";

/** Échantillonnage par défaut : 1 % des requêtes éligibles paient l'appel supplémentaire à la base. */
export const ECHANTILLON_PAR_DEFAUT = 0.01;

/**
 * Lecture STRICTEMENT défensive : variable absente, vide, ou valeur inconnue → `off`. Une faute de frappe
 * ne doit jamais activer quoi que ce soit.
 */
export function lireModeAccesGp(valeur: string | null | undefined): LectureModeAccesGp {
  const brut = typeof valeur === "string" ? valeur.trim().toLowerCase() : "";
  if (brut === "" || brut === "off") return { mode: "off", avertissement: null };
  if (brut === "observe") return { mode: "observe", avertissement: null };
  if (brut === "enforce") {
    return { mode: "observe", avertissement: AVERTISSEMENT_ENFORCE_NON_IMPLEMENTE };
  }
  return {
    mode: "off",
    avertissement: `ELSATIA_GP_ACCES_APP : valeur inconnue « ${brut.slice(0, 20)} », mode off conservé`,
  };
}

/** Borné à [0, 1] ; absent, vide ou non numérique → défaut 1 %. `0` est valide (observation muette). */
export function lireEchantillonAccesGp(valeur: string | null | undefined): number {
  if (typeof valeur !== "string" || valeur.trim() === "") return ECHANTILLON_PAR_DEFAUT;
  const n = Number(valeur.trim().replace(",", "."));
  if (!Number.isFinite(n)) return ECHANTILLON_PAR_DEFAUT;
  return Math.min(1, Math.max(0, n));
}
