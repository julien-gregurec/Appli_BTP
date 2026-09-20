import Link from "next/link";
import { canManageWorkspace } from "@elsatia/studio-domain";
import Shell from "../../components/Shell";
import Notice from "../../components/Notice";
import Submit from "../../components/Submit";
import { getActiveStudioWorkspace } from "../../lib/workspaces";
import { createStudioClient } from "../../lib/supabase";
import { bytes } from "../../lib/media-contract";
import {
  renameWorkspace,
  createProfessional,
  archiveWorkspace,
} from "../actions";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; error?: string }>;
}) {
  const params = await searchParams;
  const context = await getActiveStudioWorkspace(params.workspace);
  const { workspace, membership } = context;
  const usage = canManageWorkspace(membership.role)
    ? await createStudioClient()
        .then((client) =>
          client.rpc("studio_workspace_usage", { p_workspace: workspace.id }),
        )
        .then((r) => r.data)
        .catch(() => null)
    : null;
  return (
    <Shell context={context} page="settings">
      <p className="eyebrow">PARAMÈTRES</p>
      <h1>
        Votre espace,
        <br />
        vos repères.
      </h1>
      <Notice message={params.error} />
      <div className="cards">
        <section className="card">
          <h2>Informations de l’espace</h2>
          {canManageWorkspace(membership.role) ? (
            <form action={renameWorkspace}>
              <input type="hidden" name="workspace" value={workspace.id} />
              <label>
                Nom de l’espace
                <input
                  name="name"
                  defaultValue={workspace.name}
                  required
                  maxLength={100}
                />
              </label>
              <Submit>Enregistrer</Submit>
            </form>
          ) : (
            <p>
              Nom : {workspace.name}. Seuls le propriétaire et les
              administrateurs peuvent le modifier.
            </p>
          )}
          <p>
            <Link href={`/settings/members?workspace=${workspace.id}`}>
              Voir les membres et leurs rôles →
            </Link>
          </p>
        </section>
        {usage && (
          <section className="card" aria-label="Utilisation">
            <h2>Utilisation ce mois-ci</h2>
            <p>
              {usage.exports} vidéo{usage.exports > 1 ? "s" : ""} exportée
              {usage.exports > 1 ? "s" : ""} ·{" "}
              {Math.round(usage.render_seconds / 60)} min de rendu
            </p>
            <p>
              Médias stockés : {bytes(usage.media_bytes)} · Vidéos rendues :{" "}
              {bytes(usage.render_bytes)}
            </p>
          </section>
        )}
        <section className="card">
          <h2>Un nouvel espace professionnel</h2>
          <p>
            Séparez vos projets dans un nouvel espace dont vous serez
            propriétaire. Aucun rattachement à Gestion Pro.
          </p>
          <form action={createProfessional}>
            <label>
              Nom du nouvel espace
              <input
                name="name"
                required
                maxLength={100}
                placeholder="Mon atelier créatif"
              />
            </label>
            <Submit>Créer l’espace</Submit>
          </form>
        </section>
      </div>
      {membership.role === "owner" && (
        <section className="card danger">
          <h2>Supprimer cet espace</h2>
          <p>
            L’espace sera archivé et deviendra inaccessible à ses membres. Votre
            compte ELSATIA et les autres espaces sont conservés.
          </p>
          <form action={archiveWorkspace}>
            <input type="hidden" name="workspace" value={workspace.id} />
            <label>
              Recopiez « {workspace.name} » pour confirmer
              <input name="confirm" required autoComplete="off" />
            </label>
            <Submit>Supprimer l’espace</Submit>
          </form>
        </section>
      )}
    </Shell>
  );
}
