/**
 * Adaptateur d'affichage pour `ProfilePlanCard` (§7).
 *
 * `planProfiles` de `@/lib/chantier` fait tout le calcul (longueur commerciale, marge,
 * nombre de barres, chute). Ici : capture d'erreur et sélection des lignes à afficher
 * « lorsque disponible ».
 */

import { planProfiles, type PlanProfilesInput, type ProfilePlan } from "../../../lib/chantier";

export type ProfilePlanCardProps = {
  plan?: ProfilePlan;
  input?: PlanProfilesInput;
};

export type ProfilePlanViewModel =
  | { ok: true; plan: ProfilePlan | null }
  | { ok: false; error: string };

export function buildProfilePlanViewModel(props: ProfilePlanCardProps): ProfilePlanViewModel {
  if (props.plan) return { ok: true, plan: props.plan };
  if (!props.input) return { ok: true, plan: null };
  try {
    return { ok: true, plan: planProfiles(props.input) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erreur de plan de profils.",
    };
  }
}
