import { env as serverEnvironment } from "node:process";

type FeatureEnvironment = Record<string, string | undefined>;

function estActive(valeur: string | undefined): boolean {
  return valeur?.trim().toLowerCase() !== "false";
}

export function boutiqueEstActive(environnement: FeatureEnvironment = serverEnvironment): boolean {
  return estActive(environnement.FEATURE_BOUTIQUE_ENABLED);
}

export function iaEstActive(environnement: FeatureEnvironment = serverEnvironment): boolean {
  return estActive(environnement.FEATURE_AI_ENABLED);
}

export function cronsSontActifs(environnement: FeatureEnvironment = serverEnvironment): boolean {
  return estActive(environnement.FEATURE_CRONS_ENABLED);
}

export const MESSAGE_BOUTIQUE_INDISPONIBLE = "La boutique est indisponible dans cet environnement.";
export const MESSAGE_IA_INDISPONIBLE = "Les fonctionnalités IA sont désactivées dans cet environnement.";
