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
  const client = await createStudioClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${studioOrigin()}/auth/callback` },
  });
  if (error)
    failure(
      "/signup",
      notices.signupUnavailable,
    );
  if (data.session) redirect("/onboarding");
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
