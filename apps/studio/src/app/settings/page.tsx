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
  deleteAccount,
} from "../actions";
import { getDeletionPlan } from "../../lib/account-deletion";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; error?: string }>;
}) {
  const params = await searchParams;
  const context = await getActiveStudioWorkspace(params.workspace);
  const { workspace, membership } = context;
  const plan = await getDeletionPlan();
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
    <section className="card" aria-label="Suppression du compte">
        <h2>Supprimer mon compte</h2>
        <p>
          Cette action est définitive. Elle supprime votre compte Studio et les
          données décrites ci-dessous.
        </p>
        {plan && (
          <>
            <h3>Supprimé définitivement</h3>
            {plan.purge.length === 0 ? (
              <p>Aucun espace ne vous appartient seul.</p>
            ) : (
              <ul>
                {plan.purge.map((w) => (
                  <li key={w.id}>
                    « {w.name} » : {w.projects} projet(s), {w.assets} média(s),{" "}
                    {w.renders} vidéo(s) exportée(s), {w.shares} lien(s) de
                    partage, identité de marque et invitations, avec les
                    fichiers stockés.
                  </li>
                ))}
              </ul>
            )}
            {plan.leave.length > 0 && (
              <>
                <h3>Espaces que vous quittez</h3>
                <ul>
                  {plan.leave.map((w) => (
                    <li key={w.id}>
                      « {w.name} » : vos {w.contributions} contribution(s) sont
                      conservées pour cet espace, rattachées à son propriétaire
                      (sans lien avec votre compte).
                    </li>
                  ))}
                </ul>
              </>
            )}
            {plan.blocked.length > 0 && (
              <div role="alert">
                <strong>Suppression impossible pour le moment.</strong> Vous
                êtes propriétaire d’espaces partagés (
                {plan.blocked.map((w) => `« ${w.name} » : ${w.members} autre(s) membre(s)`).join(", ")}
                ). Retirez les autres membres ou archivez l’espace, puis
                revenez ici.
              </div>
            )}
          </>
        )}
        <p>
          <small>
            Durées de conservation légales : à définir (LEGAL REVIEW
            REQUIRED). Aucune donnée personnelle n’est conservée au-delà d’une
            trace d’audit sans identité (empreinte du compte et compteurs).
          </small>
        </p>
        {(!plan || plan.blocked.length === 0) && (
          <form action={deleteAccount}>
            <label>
              Saisissez votre adresse e-mail ({context.user.email}) pour confirmer
              <input name="confirm_email" type="email" autoComplete="off" required />
            </label>
            <label>
              Mot de passe
              <input name="password" type="password" autoComplete="current-password" required maxLength={256} />
            </label>
            <label className="consent">
              <input type="checkbox" name="acknowledge" required />
              <span>Je comprends que cette suppression est irréversible.</span>
            </label>
            <Submit>Supprimer définitivement mon compte</Submit>
          </form>
        )}
      </section>
    </Shell>
  );
}
