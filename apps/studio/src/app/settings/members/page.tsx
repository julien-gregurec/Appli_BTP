import { canManageMember, canManageWorkspace } from "@elsatia/studio-domain";
import Shell from "../../../components/Shell";
import Notice from "../../../components/Notice";
import Submit from "../../../components/Submit";
import {
  getActiveStudioWorkspace,
  getStudioWorkspaceMembers,
} from "../../../lib/workspaces";
import { changeMember } from "../../actions";
export default async function Members({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; error?: string }>;
}) {
  const params = await searchParams;
  const context = await getActiveStudioWorkspace(params.workspace);
  const members = await getStudioWorkspaceMembers(context.workspace.id);
  return (
    <Shell context={context} page="members">
      <p className="eyebrow">MEMBRES</p>
      <h1>Chacun sa place.</h1>
      <p>
        Le propriétaire est protégé. Le transfert de propriété et les
        invitations par email viendront dans un prochain lot.
      </p>
      <Notice message={params.error} />
      <section className="card">
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.id}>
              <div>
                <strong>
                  {member.user_id === context.user.id
                    ? "Vous"
                    : "Compte ELSATIA"}
                </strong>
                <code>{member.user_id}</code>
                <span>{member.role}</span>
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
