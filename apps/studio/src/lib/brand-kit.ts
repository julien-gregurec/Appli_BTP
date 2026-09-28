import "server-only";
import { isStudioId, type StudioBrandKit } from "@elsatia/studio-domain";
import { createStudioClient } from "./supabase";
export interface LogoCandidate {
  id: string;
  original_filename: string;
  project_id: string;
  project_name: string;
}
export async function getBrandKit(
  workspaceId: string,
): Promise<StudioBrandKit | null> {
  if (!isStudioId(workspaceId)) return null;
  const client = await createStudioClient();
  const { data, error } = await client.rpc("studio_get_brand_kit", {
    p_workspace: workspaceId,
  });
  if (error) throw new Error("Identité de marque indisponible.");
  return (data as StudioBrandKit | null) ?? null;
}
export async function listLogoCandidates(
  workspaceId: string,
): Promise<LogoCandidate[]> {
  const client = await createStudioClient();
  const { data, error } = await client.rpc("studio_list_brand_logo_candidates", {
    p_workspace: workspaceId,
  });
  if (error) throw new Error("Logos indisponibles.");
  return (data as LogoCandidate[]) ?? [];
}
