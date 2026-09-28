import { canManageMember, canManageWorkspace } from "@elsatia/studio-domain";
import Shell from "../../../components/Shell";
import Notice from "../../../components/Notice";
import Submit from "../../../components/Submit";
import {
  getActiveStudioWorkspace,
  getStudioWorkspaceMembers,
} from "../../../lib/workspaces";
import { changeMember, inviteMember, revokeInvitation } from "../../actions";
import { listInvitations } from "../../../lib/invitations";
const roleLabels: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  editor: "Éditeur",
  viewer: "Lecteur",
};
export default async function Members({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string;
    error?: string;
    invited?: string;
    link?: string;
  }>;
}) {
  const params = await searchParams;
  const context = await getActiveStudioWorkspace(params.workspace);
  const members = await getStudioWorkspaceMembers(context.workspace.id);
  const invitations = canManageWorkspace(context.membership.role)
    ? await listInvitations(context.workspace.id)
    : [];
  const statusLabels: Record<string, string> = {
    pending: "En attente",
    accepted: "Acceptée",
    revoked: "Révoquée",
    expired: "Expirée",
  };
  return (
    <Shell context={context} page="members">
      <p className="eyebrow">MEMBRES</p>
      <h1>Chacun sa place.</h1>
      <p>
        Le propriétaire est protégé. Pour ajouter quelqu’un, demandez-lui son
        identifiant de compte (affiché ci-dessous sur sa propre page).
      </p>
      <Notice message={params.error} />
      <section className="card">
        <h2>Votre identifiant de compte</h2>
        <p>Communiquez-le à l’administrateur d’un espace pour être ajouté.</p>
        <code data-testid="own-account-id">{context.user.id}</code>
      </section>
      <section className="card">
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.id}>
              <div>
                <strong>
                  {member.user_id === context.user.id
                    ? "Vous"
                    : `Compte ELSATIA ${member.user_id.slice(0, 8)}`}
                </strong>
                <code>{member.user_id}</code>
                <span>{roleLabels[member.role] ?? member.role}</span>
              </div>
              {canManageMember(
                context.membership.role,
                member.role,
                "viewer",
              ) && (
                <form action={changeMember}>
                  <input
                    type="hidden"
                    name="workspace"
                    value={context.workspace.id}
                  />
                  <input type="hidden" name="user" value={member.user_id} />
                  <label>
                    Rôle
                    <select name="role" defaultValue={member.role}>
                      {context.membership.role === "owner" && (
                        <option value="admin">Admin</option>
                      )}
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                      <option value="remove">Retirer de l’espace</option>
                    </select>
                  </label>
                  <Submit>Appliquer</Submit>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
      {canManageWorkspace(context.membership.role) && (
        <section className="card" aria-label="Invitations">
          <h2>Inviter par e-mail</h2>
          <p>
            La personne reçoit un lien valable 7 jours, à usage unique, réservé
            à son adresse e-mail. Elle crée ou utilise son compte Studio puis
            rejoint l’espace avec le rôle choisi.
          </p>
          {params.invited === "sent" && (
            <p role="status" className="notice">
              Invitation envoyée par e-mail.
            </p>
          )}
          {params.invited === "link" && params.link && (
            <p role="status" className="notice">
              L’envoi d’e-mail n’est pas configuré : transmettez ce lien à la
              personne (il n’est affiché qu’une fois) :{" "}
              <input readOnly value={params.link} aria-label="Lien d’invitation" />
            </p>
          )}
          <form action={inviteMember}>
            <input type="hidden" name="workspace" value={context.workspace.id} />
            <label>
              Adresse e-mail
              <input name="email" type="email" required maxLength={254} autoComplete="off" />
            </label>
            <label>
              Rôle
              <select name="role" defaultValue="editor">
                {context.membership.role === "owner" && (
                  <option value="admin">Administrateur</option>
                )}
                <option value="editor">Éditeur</option>
                <option value="viewer">Lecteur</option>
              </select>
            </label>
            <Submit>Envoyer l’invitation</Submit>
          </form>
          {invitations.length > 0 && (
            <ul className="member-list" aria-label="Invitations envoyées">
              {invitations.map((i) => (
                <li key={i.id} data-invitation={i.id}>
                  <div>
                    <strong>{i.email}</strong>
                    <span>
                      {roleLabels[i.role] ?? i.role} · {statusLabels[i.status]}
                    </span>
                  </div>
                  {i.status === "pending" && (
                    <form action={revokeInvitation}>
                      <input type="hidden" name="workspace" value={context.workspace.id} />
                      <input type="hidden" name="invitation" value={i.id} />
                      <Submit>Révoquer</Submit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {canManageWorkspace(context.membership.role) && (
        <section className="card">
          <h2>Ajouter un compte existant</h2>
          <p>
            Utilisez l’identifiant fourni par la personne. Aucun email n’est
            envoyé et aucun nouveau compte n’est créé.
          </p>
          <form action={changeMember}>
            <input
              type="hidden"
              name="workspace"
              value={context.workspace.id}
            />
            <label>
              Identifiant utilisateur ELSATIA
              <input name="user" required placeholder="UUID du compte" />
            </label>
            <label>
              Rôle
              <select name="role" defaultValue="viewer">
                {context.membership.role === "owner" && (
                  <option value="admin">Admin</option>
                )}
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <Submit>Ajouter le membre</Submit>
          </form>
        </section>
      )}
    </Shell>
  );
}
