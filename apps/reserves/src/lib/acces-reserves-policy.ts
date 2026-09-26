import type { RoleApplicationReserves } from "@elsatia/application-access";

// Miroir des règles portées par `reserves_action_autorisee()` (migration 00268).
// L'AUTORITÉ RESTE LA BASE : ce module ne sert qu'à masquer les commandes qu'un rôle ne
// pourrait de toute façon pas exécuter. Il est volontairement séparé de
// `acces-reserves.ts`, qui importe `server-only`, pour rester testable tel quel.

/**
 * Un compte gratuit « intervenant » n'a aucun droit de pilotage : ni émission, ni
 * attribution, ni validation. La règle est décidée en base ; ce miroir ne sert qu'à
 * masquer les commandes qu'il ne pourrait de toute façon pas exécuter.
 */
export function estCompteIntervenant(role: RoleApplicationReserves | null): boolean {
  return role === "reserves_intervenant";
}

export function peutEmettre(role: RoleApplicationReserves | null): boolean {
  return role === "reserves_admin_organisation"
    || role === "reserves_responsable"
    || role === "reserves_emetteur";
}

export function peutValiderLevee(role: RoleApplicationReserves | null): boolean {
  return role === "reserves_admin_organisation" || role === "reserves_responsable";
}

export function peutGererChantiers(role: RoleApplicationReserves | null): boolean {
  return role === "reserves_admin_organisation" || role === "reserves_responsable";
}

export function peutInviterEntreprise(role: RoleApplicationReserves | null): boolean {
  return role === "reserves_admin_organisation";
}
