export const studioRoles = ["owner", "admin", "editor", "viewer"] as const;
export type StudioRole = (typeof studioRoles)[number];
export type StudioWorkspaceType = "personal" | "professional";
export interface StudioWorkspace {
  id: string;
  name: string;
  workspace_type: StudioWorkspaceType;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface StudioWorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: StudioRole;
  created_at: string;
  updated_at: string;
}
export interface StudioUser {
  id: string;
  email: string | null;
}
/** Required boundary for every future Project, MediaAsset, RenderJob and BrandKit. */
export interface StudioScope {
  workspaceId: string;
  userId: string;
}
export interface StudioIdentityProvider {
  getCurrentUser(): Promise<StudioUser | null>;
}
export function isStudioId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function workspaceName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 1 ||
    value.trim().length > 100
  )
    throw new Error("Le nom doit contenir entre 1 et 100 caractères.");
  return value.trim();
}
export function isStudioRole(value: unknown): value is StudioRole {
  return (
    typeof value === "string" && studioRoles.some((role) => role === value)
  );
}
export function canManageWorkspace(role: StudioRole): boolean {
  return role === "owner" || role === "admin";
}
export function canManageMember(
  actor: StudioRole,
  target: StudioRole,
  next: StudioRole | null,
): boolean {
  if (!canManageWorkspace(actor) || target === "owner" || next === "owner")
    return false;
  return actor === "owner" || (target !== "admin" && next !== "admin");
}
/** Explicit unknown IDs never silently fall back to another workspace. */
export function selectWorkspace(
  workspaces: StudioWorkspace[],
  requested?: string,
): StudioWorkspace | null {
  return requested
    ? (workspaces.find((w) => w.id === requested) ?? null)
    : (workspaces[0] ?? null);
}
export function safeStudioDestination(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\/(dashboard|settings|onboarding)(\?|$)/.test(value) ||
    /[\\\r\n]/.test(value)
  )
    return "/dashboard";
  return value;
}

export * from "./media";

export * from "./projects";

export * from "./timeline";
export * from "./render";

export * from "./presentation";
export * from "./templates";

export * from "./editor";
