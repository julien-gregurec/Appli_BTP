"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  parseBrandKitInput,
  canManageWorkspace,
  isStudioId,
  isStudioRole,
  safeStudioDestination,
  workspaceName,
} from "@elsatia/studio-domain";
import { createStudioClient } from "../lib/supabase";
import { studioOrigin } from "../lib/config";
import { notices } from "../lib/notices";
import { registrationGate } from "../lib/entitlement";
import { legalVersion } from "../lib/legal";
import {
  InvitationError,
  acceptInvitation as acceptInvitationRpc,
  inviteMember as inviteMemberRpc,
  revokeInvitation as revokeInvitationRpc,
} from "../lib/invitations";
import { executeAccountDeletion } from "../lib/account-deletion";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../lib/config";
import { getCurrentStudioUser } from "../lib/workspaces";
import {
  createPersonalStudioWorkspace,
  createStudioWorkspace,
  getActiveStudioWorkspace,
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
  const email = field(form, "email").trim();
  const password = field(form, "password");
  if (!email || email.length > 254 || password.length > 256)
    failure("/login", notices.invalidCredentials);
  const client = await createStudioClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error)
    failure(
      "/login",
      notices.loginFailed,
    );
  redirect(safeStudioDestination(field(form, "next")));
}
export async function signup(form: FormData) {
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
      notices.signupInvalid,
    );
  if (field(form, "terms") !== "on") failure("/signup", notices.consentRequired);
  if (!(await registrationGate.canSignUp(email)))
    failure("/signup", notices.signupClosed);
  const next = safeStudioDestination(field(form, "next"));
  const client = await createStudioClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${studioOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      // Consent record (version of the texts accepted); LEGAL REVIEW REQUIRED for the final wording.
      data: { terms_version: legalVersion(), terms_accepted_at: new Date().toISOString() },
    },
  });
  if (error)
    failure(
      "/signup",
      notices.signupUnavailable,
    );
  if (data.session) redirect(next.startsWith("/invitations/") ? next : "/onboarding");
  redirect("/login?notice=confirmation");
}
export async function logout() {
  const client = await createStudioClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) failure("/dashboard", notices.logoutFailed);
  redirect("/login");
}
export async function onboarding() {
  let id: string;
  try {
    id = await createPersonalStudioWorkspace();
  } catch {
    failure(
      "/onboarding",
      notices.onboardingFailed,
    );
  }
  redirect(`/dashboard?workspace=${id}`);
}
export async function createProfessional(form: FormData) {
  let id: string;
  try {
    id = await createStudioWorkspace(field(form, "name"), "professional");
  } catch {
    failure(
      "/settings",
      notices.workspaceCreateFailed,
    );
  }
  redirect(`/dashboard?workspace=${id}`);
}
export async function renameWorkspace(form: FormData) {
  const { workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings?workspace=${workspace.id}`;
  if (!canManageWorkspace(membership.role)) failure(path, notices.denied);
  let name: string;
  try {
    name = workspaceName(field(form, "name"));
  } catch {
    failure(path, notices.invalidName);
  }
  const client = await createStudioClient();
  const { error } = await client.rpc("studio_rename_workspace", {
    p_workspace_id: workspace.id,
    p_name: name,
  });
  if (error) failure(path, notices.renameFailed);
  revalidatePath("/", "layout");
  redirect(path);
}
export async function archiveWorkspace(form: FormData) {
  const { workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings?workspace=${workspace.id}`;
  if (membership.role !== "owner" || field(form, "confirm") !== workspace.name)
    failure(path, notices.archiveConfirm);
  const client = await createStudioClient();
  const { error } = await client.rpc("studio_archive_workspace", {
    p_workspace_id: workspace.id,
  });
  if (error) failure(path, notices.archiveFailed);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
export async function changeMember(form: FormData) {
  const { workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings/members?workspace=${workspace.id}`;
  const userId = field(form, "user");
  const role = field(form, "role");
  if (
    !canManageWorkspace(membership.role) ||
    !isStudioId(userId) ||
    (role !== "remove" && !isStudioRole(role))
  )
    failure(path, notices.memberDenied);
  const client = await createStudioClient();
  const { error } = await client.rpc("studio_set_member", {
    p_workspace_id: workspace.id,
    p_user_id: userId,
    p_role: role === "remove" ? null : role,
  });
  if (error)
    failure(
      path,
      notices.memberFailed,
    );
  revalidatePath("/", "layout");
  redirect(path);
}
export async function requestPasswordReset(form: FormData) {
  const email = field(form, "email").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    failure("/forgot-password", notices.resetInvalid);
  const client = await createStudioClient();
  // The outcome is deliberately ignored: the answer never reveals whether an account exists.
  await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${studioOrigin()}/auth/recovery`,
  });
  redirect("/forgot-password?notice=sent");
}
export async function updatePassword(form: FormData) {
  const password = field(form, "password");
  if (password.length < 12 || password.length > 256)
    failure("/reset-password", notices.passwordInvalid);
  if (password !== field(form, "confirm"))
    failure("/reset-password", notices.passwordMismatch);
  const client = await createStudioClient();
  const { data } = await client.auth.getUser();
  if (!data.user) failure("/login", notices.invalidLink);
  const { error } = await client.auth.updateUser({ password });
  if (error) failure("/reset-password", notices.passwordFailed);
  redirect("/dashboard");
}
export async function saveBrandKit(form: FormData) {
  const { workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/brand-kit?workspace=${workspace.id}`;
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
  if (!canManageWorkspace(membership.role)) failure(path, notices.denied);
  try {
    const result = await inviteMemberRpc(
      workspace.id,
      workspace.name,
      user.email,
      field(form, "email"),
      field(form, "role"),
    );
    revalidatePath("/settings/members");
    // The link is shown once so it can be copied when no mail provider is configured.
    redirect(
      `${path}&invited=${result.emailed ? "sent" : "link"}&link=${encodeURIComponent(result.emailed ? "" : result.url)}`,
    );
  } catch (error) {
    if (error instanceof InvitationError) failure(path, notices.inviteInvalid);
    throw error;
  }
}
export async function revokeInvitation(form: FormData) {
  const { workspace, membership } = await getActiveStudioWorkspace(field(form, "workspace"));
  const path = `/settings/members?workspace=${workspace.id}`;
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
  let workspace: string;
  try {
    workspace = await acceptInvitationRpc(token);
  } catch (error) {
    redirect(
      `/invitations/${encodeURIComponent(token)}?error=${encodeURIComponent(error instanceof Error ? error.message : "Invitation invalide ou expirée.")}`,
    );
  }
  revalidatePath("/", "layout");
  redirect(`/dashboard?workspace=${workspace}`);
}
export async function deleteAccount(form: FormData) {
  const user = await getCurrentStudioUser();
  const typed = field(form, "confirm_email").trim().toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase() || field(form, "acknowledge") !== "on")
    failure("/settings", notices.deleteConfirm);
  // Strong confirmation: the password is verified again against Auth, never trusted from the session alone.
  const { url, key } = supabaseConfig();
  const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = await verifier.auth.signInWithPassword({ email: user.email, password: field(form, "password") });
  if (check.error) failure("/settings", notices.deleteConfirm);
  let outcome: Awaited<ReturnType<typeof executeAccountDeletion>>;
  try {
    outcome = await executeAccountDeletion(user.id);
  } catch {
    failure("/settings", notices.deleteFailed);
  }
  if (outcome.blocked) failure("/settings", notices.deleteBlocked);
  const client = await createStudioClient();
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login?notice=account-deleted");
}
