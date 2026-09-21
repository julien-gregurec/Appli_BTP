import type { ModeQuantite, UniteQuantite } from "@/lib/colors-types";
import {
  CODE_QUANTITE_NOMINALE_INVALIDE,
  CODE_QUANTITE_POURCENTAGE_HORS_BORNES,
  CODE_QUANTITE_RESTANTE_DEPASSE,
  CODE_QUANTITE_RESTANTE_NEGATIVE,
  CODE_QUANTITE_UNITE_INCOHERENTE,
  CODE_QUANTITE_UNITE_POURCENTAGE,
} from "@/lib/messages-metier";

export type SaisieQuantite = { mode: ModeQuantite; unite: UniteQuantite; nominale?: number | null; restante?: number | null; pourcentage?: number | null };

/**
 * Renvoie le code d'erreur de validation, ou `null` si la saisie est valide.
 *
 * Les règles sont inchangées ; seule leur restitution l'est. Un code appartient
 * au jeu fermé de `messages-metier.ts` et peut donc traverser une URL sans
 * qu'aucun texte ne soit rendu depuis la barre d'adresse.
 */
export function validerQuantite(saisie: SaisieQuantite): string | null {
  if (saisie.mode === "pourcentage") {
    if (saisie.unite !== "pourcent") return CODE_QUANTITE_UNITE_POURCENTAGE;
    if (saisie.pourcentage == null || saisie.pourcentage < 0 || saisie.pourcentage > 100) return CODE_QUANTITE_POURCENTAGE_HORS_BORNES;
    return null;
  }
  const unites = saisie.mode === "volume" ? ["l", "ml"] : ["kg", "g"];
  if (!unites.includes(saisie.unite)) return CODE_QUANTITE_UNITE_INCOHERENTE;
  if (saisie.nominale == null || saisie.nominale <= 0) return CODE_QUANTITE_NOMINALE_INVALIDE;
  if (saisie.restante == null || saisie.restante < 0) return CODE_QUANTITE_RESTANTE_NEGATIVE;
  if (saisie.restante > saisie.nominale) return CODE_QUANTITE_RESTANTE_DEPASSE;
  return null;
}

export function calculerPourcentage(saisie: SaisieQuantite): number | null {
  if (validerQuantite(saisie)) return null;
  if (saisie.mode === "pourcentage") return Math.round((saisie.pourcentage ?? 0) * 100) / 100;
  return Math.round((((saisie.restante ?? 0) / (saisie.nominale ?? 1)) * 100) * 100) / 100;
}

export function formaterQuantite(saisie: SaisieQuantite) {
  if (saisie.mode === "pourcentage") return `${saisie.pourcentage ?? 0} %`;
  return `${saisie.restante ?? 0} ${saisie.unite} sur ${saisie.nominale ?? 0} ${saisie.unite}`;
}
