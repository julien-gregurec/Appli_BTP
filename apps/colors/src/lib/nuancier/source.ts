import "server-only";
import { readFileSync } from "node:fs";
import { analyserNuancier, type EtatNuancier } from "@/lib/nuancier/contrat";

/**
 * Chargement du nuancier de l'installation.
 *
 * Le fichier est désigné par `COLORS_NUANCIER_FICHIER`. Cette variable n'est
 * délibérément PAS publique : le nuancier reste une donnée serveur, jamais
 * inscrite dans le bundle navigateur. Un nuancier fabricant communiqué par
 * contrat n'a aucune raison d'être servi en clair à tous les visiteurs.
 *
 * La lecture est faite une fois et mémorisée pour la durée du processus : un
 * nuancier ne change pas en cours d'exécution, et relire le fichier à chaque
 * affichage de fiche coûterait une entrée-sortie par requête.
 *
 * Aucune erreur ne remonte : un nuancier absent ou mal formé est un état normal
 * de l'application — c'est même l'état par défaut — et il doit produire un écran
 * qui l'explique, jamais une page en erreur.
 */

export const VARIABLE_NUANCIER = "COLORS_NUANCIER_FICHIER";

/** Taille au-delà de laquelle le fichier est refusé sans être analysé (5 Mio). */
export const TAILLE_MAXIMALE_NUANCIER = 5 * 1024 * 1024;

let memoire: EtatNuancier | null = null;

/** Lecture directe, sans mémoire : réservée aux tests et au diagnostic. */
export function lireNuancier(chemin: string | undefined): EtatNuancier {
  if (!chemin || chemin.trim() === "") return { disponible: false, raison: "non_configure" };
  let brut: string;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch (erreur) {
    const code = (erreur as NodeJS.ErrnoException)?.code;
    return { disponible: false, raison: code === "ENOENT" ? "introuvable" : "illisible" };
  }
  if (brut.length > TAILLE_MAXIMALE_NUANCIER) return { disponible: false, raison: "illisible" };
  try {
    return analyserNuancier(JSON.parse(brut));
  } catch {
    return { disponible: false, raison: "format_invalide" };
  }
}

export function nuancierColors(): EtatNuancier {
  if (memoire === null) memoire = lireNuancier(process.env[VARIABLE_NUANCIER]);
  return memoire;
}

/** Réinitialise la mémoire de processus. Uniquement utile aux tests. */
export function oublierNuancierColors() {
  memoire = null;
}
