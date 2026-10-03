import "server-only";
import { cache } from "react";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estRoleSocial, peut, type ActionSocial, type RoleSocial } from "@/lib/social/roles";

export type ContexteSocial = { email: string; role: RoleSocial };

export class AccesSocialRefuse extends Error {
  constructor(message = "Accès ELSATIA Social refusé") {
    super(message);
    this.name = "AccesSocialRefuse";
  }
}

/**
 * Contexte de l'utilisateur ELSATIA Social, ou null. Le rôle est résolu par la
 * base (social_role_courant) à partir de la session Supabase réelle : jamais
 * depuis un paramètre client. Le mode prototype sans connexion n'y a pas accès.
 */
export const contexteSocial = cache(async (): Promise<ContexteSocial | null> => {
  if (isEmailLoginDisabled()) return null;
  const supabase = await createClient();
  const { data: utilisateur } = await supabase.auth.getUser();
  const email = utilisateur.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: role } = await supabase.rpc("social_role_courant");
  return estRoleSocial(role) ? { email, role } : null;
});

export async function exigerSocial(action: ActionSocial): Promise<ContexteSocial> {
  const ctx = await contexteSocial();
  if (!ctx) throw new AccesSocialRefuse();
  if (!peut(ctx.role, action)) throw new AccesSocialRefuse("Votre rôle ELSATIA Social ne permet pas cette action");
  return ctx;
}

/** Client service_role : uniquement après exigerSocial(), dans le code serveur. */
export function adminSocial() {
  return createAdminClient();
}

/** Limitation de débit partagée (table social_quotas). */
export async function consommerQuota(cle: string, max: number, fenetreSecondes: number): Promise<boolean> {
  const { data, error } = await adminSocial().rpc("social_consommer_quota", { p_cle: cle, p_max: max, p_fenetre_secondes: fenetreSecondes });
  if (error) return false;
  return data === true;
}
