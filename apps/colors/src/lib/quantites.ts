import type { ModeQuantite, UniteQuantite } from "@/lib/colors-types";

export type SaisieQuantite = { mode: ModeQuantite; unite: UniteQuantite; nominale?: number | null; restante?: number | null; pourcentage?: number | null };

export function validerQuantite(saisie: SaisieQuantite): string | null {
  if (saisie.mode === "pourcentage") {
    if (saisie.unite !== "pourcent") return "L’unité doit être le pourcentage";
    if (saisie.pourcentage == null || saisie.pourcentage < 0 || saisie.pourcentage > 100) return "Le pourcentage doit être compris entre 0 et 100";
    return null;
  }
  const unites = saisie.mode === "volume" ? ["l", "ml"] : ["kg", "g"];
  if (!unites.includes(saisie.unite)) return "L’unité ne correspond pas au mode de saisie";
  if (saisie.nominale == null || saisie.nominale <= 0) return "La quantité nominale doit être positive";
  if (saisie.restante == null || saisie.restante < 0) return "La quantité restante ne peut pas être négative";
  if (saisie.restante > saisie.nominale) return "La quantité restante dépasse le nominal";
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
