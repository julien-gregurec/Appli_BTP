import Link from "next/link";
import Shell from "../../components/Shell";
import Notice from "../../components/Notice";
import { getActiveStudioWorkspace } from "../../lib/workspaces";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; error?: string }>;
}) {
  const params = await searchParams;
  const context = await getActiveStudioWorkspace(params.workspace);
  return (
    <Shell context={context} page="dashboard">
      <p className="eyebrow">TABLEAU DE BORD</p>
      <h1>
        Bienvenue dans
        <br />
        {context.workspace.name}.
      </h1>
      <p className="intro">
        Votre espace est prêt. La création vidéo arrive dans les prochains lots.
      </p>
      <Notice message={params.error} />
      <div className="cards">
        <section className="card accent">
          <span className="eyebrow">VOTRE WORKSPACE</span>
          <h2>
            {context.workspace.workspace_type === "personal"
              ? "Personnel"
              : "Professionnel"}
          </h2>
          <p>
            Votre rôle : <strong>{context.membership.role}</strong>
          </p>
          <Link href={`/settings?workspace=${context.workspace.id}`}>
            Personnaliser mon espace →
          </Link>
        </section>
        <section className="card">
          <span className="eyebrow">VOS MÉDIAS</span>
          <h2>De l’image à l’histoire.</h2>
          <p>
            Importez vos photos et vidéos dans un projet privé. Le montage et
            l’export arriveront plus tard.
          </p>
          <Link href={`/projects?workspace=${context.workspace.id}`}>
            Nouveau projet →
          </Link>
        </section>
      </div>
      <section className="card details">
        <h2>Un espace indépendant.</h2>
        <p>
          Aucune entreprise, aucun chantier et aucun abonnement Gestion Pro
          requis pour accéder à votre Studio.
        </p>
        <p className="muted">
          Identifiant de l’espace : <code>{context.workspace.id}</code>
        </p>
      </section>
    </Shell>
  );
}
