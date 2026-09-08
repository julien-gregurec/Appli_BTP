import { env as serverEnvironment } from "node:process";

type FeatureEnvironment = Record<string, string | undefined>;

function estActive(valeur: string | undefined): boolean {
  return valeur?.trim().toLowerCase() !== "false";
}

// FAIL-CLOSED (P0 de l'audit Boutique). La Boutique est une surface COMMERCIALE :
// elle expose un catalogue, un panier, un paiement et un webhook. Elle s'appuyait
// jusqu'ici sur `estActive()`, dont la règle est « tout sauf false vaut actif » —
// si bien qu'une variable absente, vide, mal orthographiée ou perdue au cours d'un
// déploiement OUVRAIT la boutique au lieu de la fermer. C'est l'inverse de ce que
// doit faire un drapeau qui garde un encaissement.
//
// Désormais, seule la valeur explicite « true » active la Boutique. Absente, vide
// ou invalide, elle est fermée — en Production comme ailleurs : il n'existe aucun
// chemin qui l'ouvre sans que quelqu'un ait écrit `FEATURE_BOUTIQUE_ENABLED=true`.
export function boutiqueEstActive(environnement: FeatureEnvironment = serverEnvironment): boolean {
  return environnement.FEATURE_BOUTIQUE_ENABLED?.trim().toLowerCase() === "true";
}

// Fail-closed, contrairement a estActive() ci-dessus : une fonctionnalite commerciale
// desactivable ne doit jamais s'activer par defaut si la variable est absente (ex. variable
// oubliee lors d'un deploiement). AI-LAUNCH-V1B — variable absente = IA indisponible.
export function iaEstActive(environnement: FeatureEnvironment = serverEnvironment): boolean {
  return environnement.FEATURE_AI_ENABLED?.trim().toLowerCase() === "true";
}

export function cronsSontActifs(environnement: FeatureEnvironment = serverEnvironment): boolean {
  return estActive(environnement.FEATURE_CRONS_ENABLED);
}

// Sous-flag de FEATURE_AI_ENABLED (IA-DEVIS-V1) : fail-closed comme iaEstActive() ci-dessus,
// pour permettre de couper uniquement la génération assistée de devis sans désactiver le
// reste de l'assistant IA (rollback isolé). Les deux flags sont vérifiés indépendamment à
// chaque couche qui peut écrire — voir docs/ia/IA_DEVIS_V1.md.
export function iaDevisEstActive(environnement: FeatureEnvironment = serverEnvironment): boolean {
  return environnement.FEATURE_AI_DEVIS_ENABLED?.trim().toLowerCase() === "true";
}

// RELANCES-AUTO-V1 §78 : fail-closed, ne couvre QUE l'envoi automatique (cron). La relance
// manuelle reste disponible indépendamment de ce flag — seule l'automatisation est gardée
// (permet de déployer le code avec l'auto coupée, activer après recette, ou couper l'auto
// seule en cas d'anomalie sans retirer le bouton "Relancer maintenant").
export function relancesAutoEstActive(environnement: FeatureEnvironment = serverEnvironment): boolean {
  return environnement.FEATURE_RELANCES_AUTO_ENABLED?.trim().toLowerCase() === "true";
}

export const MESSAGE_BOUTIQUE_INDISPONIBLE = "La boutique est indisponible dans cet environnement.";
export const MESSAGE_IA_INDISPONIBLE = "Les fonctionnalités IA sont désactivées dans cet environnement.";
