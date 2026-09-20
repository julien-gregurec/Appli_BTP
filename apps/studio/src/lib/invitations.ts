import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { isStudioId, isStudioRole } from "@elsatia/studio-domain";
import { studioOrigin } from "./config";
import { sendMail } from "./mailer";
import { createStudioClient } from "./supabase";
import { storageAdmin } from "./storage-admin";
const tokenFormat = /^[A-Za-z0-9_-]{43}$/;
export const invitationToken = () => randomBytes(32).toString("base64url");
/** Only the hash is stored: the secret exists solely in the e-mailed / copied URL. */
export const hashInvitationToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export interface Invitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}
export async function listInvitations(workspaceId: string): Promise<Invitation[]> {
  const client = await createStudioClient();
  const r = await client.rpc("studio_list_invitations", { p_workspace: workspaceId });
  return r.error ? [] : ((r.data as Invitation[] | null) ?? []);
}
export class InvitationError extends Error {}
export async function inviteMember(
  workspaceId: string,
  workspaceName: string,
  inviterEmail: string | null,
  email: string,
  role: string,
) {
  if (!isStudioId(workspaceId) || !isStudioRole(role) || role === "owner")
    throw new InvitationError("Invitation invalide.");
  const token = invitationToken();
  const client = await createStudioClient();
  const r = await client.rpc("studio_invite_member", {
    p_workspace: workspaceId,
    p_email: email,
    p_role: role,
    p_token_hash: hashInvitationToken(token),
    p_days: 7,
  });
  if (r.error)
    throw new InvitationError(
      r.error.code === "22023" || r.error.code === "42501"
        ? r.error.message
        : "Invitation impossible.",
    );
  const url = `${studioOrigin()}/invitations/${token}`;
  const emailed = await sendMail({
    to: email.trim().toLowerCase(),
    subject: `Invitation à rejoindre « ${workspaceName} » sur ELSATIA Studio`,
    text: `${inviterEmail ?? "Un membre"} vous invite à rejoindre l'espace « ${workspaceName} » sur ELSATIA Studio.\n\nOuvrez ce lien (valable 7 jours, à usage unique, réservé à cette adresse) :\n${url}\n\nSi vous ne connaissez pas cette personne, ignorez ce message.`,
  });
  return { url, emailed };
}
export async function revokeInvitation(invitationId: string) {
  if (!isStudioId(invitationId)) throw new InvitationError("Invitation invalide.");
  const client = await createStudioClient();
  const r = await client.rpc("studio_revoke_invitation", { p_invitation: invitationId });
  if (r.error) throw new InvitationError("Révocation refusée.");
}
/** Public lookup for the acceptance page: what the invitee may see before signing in. */
export async function resolveInvitation(token: string) {
  if (!tokenFormat.test(token)) return null;
  const r = await storageAdmin().rpc("studio_resolve_invitation", {
    p_token_hash: hashInvitationToken(token),
  });
  return r.error
    ? null
    : (r.data as {
        workspace_name: string;
        role: string;
        email: string;
        expires_at: string;
        status: string;
      } | null);
}
export async function acceptInvitation(token: string): Promise<string> {
  if (!tokenFormat.test(token)) throw new InvitationError("Invitation invalide ou expirée.");
  const client = await createStudioClient();
  const r = await client.rpc("studio_accept_invitation", {
    p_token_hash: hashInvitationToken(token),
  });
  if (r.error || typeof r.data !== "string")
    throw new InvitationError(
      r.error?.code === "42501" ? r.error.message : "Invitation invalide ou expirée.",
    );
  return r.data;
}
/** True when a live invitation exists for this address (lets an invitee sign up while registration is closed). */
export async function hasPendingInvitation(email: string): Promise<boolean> {
  const r = await storageAdmin().rpc("studio_pending_invitation_for", {
    p_email: email.trim().toLowerCase(),
  });
  return r.data === true;
}
