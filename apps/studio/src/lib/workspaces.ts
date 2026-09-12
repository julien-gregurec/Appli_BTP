import { verifiedUser } from "./verified-user";
import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import {
  isStudioId,
  selectWorkspace,
  workspaceName,
  type StudioWorkspaceType,
} from "@elsatia/studio-domain";
import { createStudioClient } from "./supabase";
export const getCurrentStudioUser = cache(async () => {
  const client = await createStudioClient();
  const user = await verifiedUser(() => client.auth.getUser());
  if (!user) redirect("/login");
  return { id: user.id, email: user.email ?? null };
});
export async function getUserStudioWorkspaces() {
  await getCurrentStudioUser();
  const client = await createStudioClient();
  const { data, error } = await client
    .from("studio_workspaces")
    .select("*")
    .order("created_at")
    .order("id");
  if (error)
    throw new Error("Les espaces Studio sont temporairement indisponibles.");
  return data ?? [];
}
export async function getActiveStudioWorkspace(requested?: string) {
  const user = await getCurrentStudioUser();
  if (requested !== undefined && !isStudioId(requested)) notFound();
  const workspaces = await getUserStudioWorkspaces();
  const workspace = selectWorkspace(workspaces, requested);
  if (!workspace) {
    if (requested) notFound();
    redirect("/onboarding");
  }
  const client = await createStudioClient();
  const { data: membership, error } = await client
    .from("studio_workspace_members")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Appartenance Studio indisponible.");
  if (!membership) notFound();
  return { user, workspace, workspaces, membership };
}
export async function createStudioWorkspace(
  name: string,
  type: StudioWorkspaceType,
) {
  await getCurrentStudioUser();
  const client = await createStudioClient();
  const { data, error } = await client.rpc("studio_create_workspace", {
    p_name: workspaceName(name),
    p_type: type,
  });
  if (error || !isStudioId(data))
    throw new Error(
      "La création de l’espace a échoué. Vérifiez votre limite de 20 espaces puis réessayez.",
    );
  return data;
}
export async function createPersonalStudioWorkspace() {
  return createStudioWorkspace("Mon Studio", "personal");
}
export async function getStudioWorkspaceMembers(workspaceId: string) {
  await getActiveStudioWorkspace(workspaceId);
  const client = await createStudioClient();
  const { data, error } = await client
    .from("studio_workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw new Error("La liste des membres est indisponible.");
  return data ?? [];
}
