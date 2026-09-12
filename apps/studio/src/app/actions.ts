"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  canManageWorkspace,
  isStudioId,
  isStudioRole,
  safeStudioDestination,
  workspaceName,
} from "@elsatia/studio-domain";
import { createStudioClient } from "../lib/supabase";
import { studioOrigin } from "../lib/config";
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
  } catch {
    failure(
      "/onboarding",
      "Création impossible. Réessayez dans quelques instants.",
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
      "Création impossible : nom de 1 à 100 caractères et 20 espaces maximum.",
    );
  }
  redirect(`/dashboard?workspace=${id}`);
}
export async function renameWorkspace(form: FormData) {
  const { workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings?workspace=${workspace.id}`;
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
  const { workspace, membership } = await getActiveStudioWorkspace(
    field(form, "workspace"),
  );
  const path = `/settings?workspace=${workspace.id}`;
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
