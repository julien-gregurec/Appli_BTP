import "server-only";
import { cache } from "react";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estRoleSocial, peut, type ActionSocial, type RoleSocial } from "@/lib/social/roles";

/**
 * Identité ELSATIA Social, résolue selon le modèle canonique de la plateforme :
 * auth.uid() -> plateforme_admins.utilisateur_id -> actif. L'email n'est
 * conservé que pour l'affichage et le journal, jamais comme preuve d'autorisation.
 */
export type ContexteSocial = { utilisateurId: string; email: string; role: RoleSocial; aal2: boolean };

export class AccesSocialRefuse extends Error {
  constructor(message = "Accès ELSATIA Social refusé") {
    super(message);
    this.name = "AccesSocialRefuse";
  }
}

export const MESSAGE_AAL2_REQUIS = "Authentification forte (AAL2) requise : valider votre code MFA puis recommencer.";

type LigneSession = { utilisateur_id: string; email: string | null; role: string | null; aal2: boolean | null };

/** Interprète la ligne renvoyée par la RPC social_session_courante (testable sans base). */
export function contexteDepuisSession(ligne: LigneSession | null | undefined): ContexteSocial | null {
  if (!ligne?.utilisateur_id || !estRoleSocial(ligne.role)) return null;
  return { utilisateurId: ligne.utilisateur_id, email: (ligne.email ?? "").toLowerCase(), role: ligne.role, aal2: ligne.aal2 === true };
}

/**
 * Contexte de l'utilisateur ELSATIA Social, ou null. Rôle et niveau AAL sont
 * lus par la base (social_session_courante) à partir du JWT vérifié de la
 * session Supabase réelle : jamais depuis un paramètre client. Le mode
 * prototype sans connexion n'y a pas accès.
 */
export const contexteSocial = cache(async (): Promise<ContexteSocial | null> => {
  if (isEmailLoginDisabled()) return null;
  const supabase = await createClient();
  const { data: utilisateur } = await supabase.auth.getUser();
  if (!utilisateur.user) return null;
  const { data, error } = await supabase.rpc("social_session_courante");
  if (error) return null;
  const ligne = (Array.isArray(data) ? data[0] : data) as LigneSession | null;
  const ctx = contexteDepuisSession(ligne);
  return ctx && ctx.utilisateurId === utilisateur.user.id ? ctx : null;
});

/**
 * Garde unique des actions et routes ELSATIA Social. Comme toute mutation
 * plateforme du train canonique, chaque action exige une session AAL2 :
 * connexion/déconnexion de comptes, configuration, validation, publication,
 * rôles, révocations OAuth, mais aussi rédaction et réponses.
 */
export async function exigerSocial(action: ActionSocial): Promise<ContexteSocial> {
  const ctx = await contexteSocial();
  if (!ctx) throw new AccesSocialRefuse();
  if (!ctx.aal2) throw new AccesSocialRefuse(MESSAGE_AAL2_REQUIS);
  if (!peut(ctx.role, action)) throw new AccesSocialRefuse("Votre rôle ELSATIA Social ne permet pas cette action");
  return ctx;
}

/** Client service_role : uniquement après exigerSocial(), dans le code serveur. */
export function adminSocial() {
  return createAdminClient();
}

/** Limitation de débit partagée (table social_quotas). Clés fondées sur l'UID, jamais sur l'email. */
export async function consommerQuota(cle: string, max: number, fenetreSecondes: number): Promise<boolean> {
  const { data, error } = await adminSocial().rpc("social_consommer_quota", { p_cle: cle, p_max: max, p_fenetre_secondes: fenetreSecondes });
  if (error) return false;
  return data === true;
}
