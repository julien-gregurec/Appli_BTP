"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  parseBrandKitInput,
  canManageWorkspace,
  isStudioId,
  isStudioRole,
  isStudioSignupAllowlisted,
  safeStudioDestination,
  studioLegalPublished,
  studioSignupMode,
  workspaceName,
} from "@elsatia/studio-domain";
import { createStudioClient } from "../lib/supabase";
import { studioOrigin } from "../lib/config";
import { notices } from "../lib/notices";
import {
  InvitationError,
  acceptInvitation as acceptInvitationRpc,
  inviteMember as inviteMemberRpc,
  revokeInvitation as revokeInvitationRpc,
} from "../lib/invitations";
import { canWrite, identityMode, READ_ONLY_MESSAGE } from "../lib/identity-policy";
import {
  createPersonalStudioWorkspace,
  createStudioWorkspace,
  getActiveStudioWorkspace,
  requireWritableStudioUser,
  StudioReadOnlyError,
} from "../lib/workspaces";
const field = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};
function failure(path: string, message: string): never {
  redirect(
    `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`,
  );
}
export async function login(form: FormData) {
  // Projet dédié : aucune connexion par mot de passe, uniquement le pont d'identité ELSATIA.
  if (identityMode() === "elsatia") redirect("/auth/elsatia/start");
  const email = field(form, "email").trim();
  const password = field(form, "password");
  if (!email || email.length > 254 || password.length > 256)
    failure("/login", "Identifiants invalides.");
  const client = await createStudioClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error)
    failure(
      "/login",
      "Connexion impossible. Vérifiez vos identifiants et la confirmation de votre email.",
    );
  redirect(safeStudioDestination(field(form, "next")));
}
export async function signup(form: FormData) {
  if (identityMode() === "elsatia") redirect("/login");
  const email = field(form, "email").trim();
  const password = field(form, "password");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 12 ||
    password.length > 256
  )
    failure(
      "/signup",
      "Indiquez un email valide et un mot de passe de 12 caractères minimum.",
    );
  // Server-only gate: enforced on every signup submission regardless of the client.
  // Both branches use the same message so the response never reveals which gate closed.
  if (!studioLegalPublished(process.env.STUDIO_LEGAL_PUBLISHED))
    failure("/signup", "Inscription indisponible pour le moment.");
  const signupMode = studioSignupMode(process.env.STUDIO_SIGNUP_MODE);
  if (
    signupMode === "closed" ||
    (signupMode === "allowlist" &&
      !isStudioSignupAllowlisted(email, process.env.STUDIO_SIGNUP_ALLOWLIST))
  )
    failure("/signup", "Inscription indisponible pour le moment.");
  const client = await createStudioClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${studioOrigin()}/auth/callback` },
  });
  if (error)
    failure(
      "/signup",
      "Inscription indisponible. Réessayez ou connectez-vous avec votre compte ELSATIA.",
    );
  if (data.session) redirect("/onboarding");
  redirect("/login?notice=confirmation");
}
export async function logout() {
  const client = await createStudioClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) failure("/dashboard", "Déconnexion impossible. Réessayez.");
  redirect("/login");
}
export async function onboarding() {
  let id: string;
  try {
    id = await createPersonalStudioWorkspace();
  } catch (error) {
    failure(
      "/onboarding",
      error instanceof StudioReadOnlyError
        ? READ_ONLY_MESSAGE
        : "Création impossible. Réessayez dans quelques instants.",
    );
  }
  redirect(`/dashboard?workspace=${id}`);
}
export async function createProfessional(form: FormData) {
  let id: string;
  try {
    id = await createStudioWorkspace(field(form, "name"), "professional");
  } catch (error) {
    failure(
      "/settings",
      error instanceof StudioReadOnlyError
        ? READ_ONLY_MESSAGE
        : "Création impossible : nom de 1 à 100 caractères et 20 espaces maximum.",
    );
  }
  redirect(`/dashboard?workspace=${id}`);
}
export async function renameWorkspace(form: FormData) {
  const { user, workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings?workspace=${workspace.id}`;
  if (!canWrite(user.access)) failure(path, READ_ONLY_MESSAGE);
  if (!canManageWorkspace(membership.role)) failure(path, "Accès refusé.");
  let name: string;
  try {
    name = workspaceName(field(form, "name"));
  } catch {
    failure(path, "Nom invalide.");
  }
  const client = await createStudioClient();
  const { error } = await client.rpc("studio_rename_workspace", {
    p_workspace_id: workspace.id,
    p_name: name,
  });
  if (error) failure(path, "Modification refusée ou espace indisponible.");
  revalidatePath("/", "layout");
  redirect(path);
}
export async function archiveWorkspace(form: FormData) {
  const { user, workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings?workspace=${workspace.id}`;
  if (!canWrite(user.access)) failure(path, READ_ONLY_MESSAGE);
  if (membership.role !== "owner" || field(form, "confirm") !== workspace.name)
    failure(path, "Saisissez le nom exact de l’espace pour confirmer.");
  const client = await createStudioClient();
  const { error } = await client.rpc("studio_archive_workspace", {
    p_workspace_id: workspace.id,
  });
  if (error) failure(path, "Suppression refusée ou espace indisponible.");
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
export async function changeMember(form: FormData) {
  const { user, workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings/members?workspace=${workspace.id}`;
  if (!canWrite(user.access)) failure(path, READ_ONLY_MESSAGE);
  const userId = field(form, "user");
  const role = field(form, "role");
  if (
    !canManageWorkspace(membership.role) ||
    !isStudioId(userId) ||
    (role !== "remove" && !isStudioRole(role))
  )
    failure(path, "Modification refusée.");
  const client = await createStudioClient();
  const { error } = await client.rpc("studio_set_member", {
    p_workspace_id: workspace.id,
    p_user_id: userId,
    p_role: role === "remove" ? null : role,
  });
  if (error)
    failure(
      path,
      "Modification refusée : rôle protégé ou membre indisponible.",
    );
  revalidatePath("/", "layout");
  redirect(path);
}
// Lot post-H (porté) : identité de marque et invitations. Même garde que les autres écritures :
// lecture seule (droit retiré, compte désactivé) refusée ici, puis par la base (studio_guard).
export async function saveBrandKit(form: FormData) {
  const { user, workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/brand-kit?workspace=${workspace.id}`;
  if (!canWrite(user.access)) failure(path, READ_ONLY_MESSAGE);
  if (!canManageWorkspace(membership.role)) failure(path, notices.denied);
  let data: ReturnType<typeof parseBrandKitInput>;
  try {
    data = parseBrandKitInput({
      company_name: field(form, "company_name"),
      tagline: field(form, "tagline"),
      phone: field(form, "phone"),
      website: field(form, "website"),
      email: "",
      logo_asset_id: field(form, "logo") || null,
    });
  } catch {
    failure(path, notices.brandInvalid);
  }
  const revision = Number(field(form, "revision"));
  const client = await createStudioClient();
  const { error } = await client.rpc("studio_save_brand_kit", {
    p_workspace: workspace.id,
    p_data: data,
    p_revision: Number.isInteger(revision) && revision > 0 ? revision : null,
  });
  if (error)
    failure(
      path,
      error.code === "40001"
        ? notices.brandConflict
        : error.code === "22023" && /Logo/.test(error.message)
          ? notices.brandLogoInvalid
          : error.code === "22023"
            ? notices.brandInvalid
            : notices.brandFailed,
    );
  revalidatePath("/", "layout");
  redirect(`${path}&saved=1`);
}
export async function inviteMember(form: FormData) {
  const { workspace, membership, user } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings/members?workspace=${workspace.id}`;
  if (!canWrite(user.access)) failure(path, READ_ONLY_MESSAGE);
  if (!canManageWorkspace(membership.role)) failure(path, notices.denied);
  let result: Awaited<ReturnType<typeof inviteMemberRpc>>;
  try {
    result = await inviteMemberRpc(
      workspace.id,
      workspace.name,
      user.email,
      field(form, "email"),
      field(form, "role"),
    );
  } catch (error) {
    if (error instanceof InvitationError) failure(path, notices.inviteInvalid);
    throw error;
  }
  revalidatePath("/settings/members");
  // Sans fournisseur d'e-mail, le lien est affiché une fois pour être copié.
  redirect(
    `${path}&invited=${result.emailed ? "sent" : "link"}&link=${encodeURIComponent(result.emailed ? "" : result.url)}`,
  );
}
export async function revokeInvitation(form: FormData) {
  const { user, workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings/members?workspace=${workspace.id}`;
  if (!canWrite(user.access)) failure(path, READ_ONLY_MESSAGE);
  if (!canManageWorkspace(membership.role)) failure(path, notices.denied);
  try {
    await revokeInvitationRpc(field(form, "invitation"));
  } catch {
    failure(path, notices.inviteFailed);
  }
  revalidatePath("/settings/members");
  redirect(path);
}
export async function acceptInvitation(form: FormData) {
  const token = field(form, "token");
  const back = `/invitations/${encodeURIComponent(token)}`;
  let workspace: string;
  try {
    await requireWritableStudioUser();
    workspace = await acceptInvitationRpc(token);
  } catch (error) {
    failure(
      back,
      error instanceof StudioReadOnlyError
        ? READ_ONLY_MESSAGE
        : error instanceof InvitationError
          ? error.message
          : "Invitation invalide ou expirée.",
    );
  }
  revalidatePath("/", "layout");
  redirect(`/dashboard?workspace=${workspace}`);
}
