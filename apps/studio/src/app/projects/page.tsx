import Link from "next/link";
import Shell from "../../components/Shell";
import ProjectCreate from "../../components/ProjectCreate";
import ProjectCards from "../../components/ProjectCards";
import { getActiveStudioWorkspace } from "../../lib/workspaces";
import { listStudioProjects } from "../../lib/projects";
import { writable } from "../../lib/media-contract";
import { projectTypes } from "@elsatia/studio-domain";
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams,
    context = await getActiveStudioWorkspace(params.workspace);
  const result = await listStudioProjects(context.workspace.id, params);
  const offset = Number(params.offset ?? 0);
  function pagination(n: number) {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries({
      ...params,
      workspace: context.workspace.id,
      offset: String(n),
    }))
      if (value) q.set(key, value);
    return `/projects?${q}`;
  }
  return (
    <Shell context={context} page="projects">
      <p className="eyebrow">BIBLIOTHÈQUE STUDIO</p>
      <h1>Vos projets.</h1>
      <p>Vos histoires, vos images et leurs informations essentielles.</p>
      {writable(context.membership.role) && (
        <section className="card" id="nouveau-projet">
          <h2>Nouveau projet</h2>
          <ProjectCreate workspace={context.workspace.id} />
        </section>
      )}
      <form className="card filters" method="get">
        <input type="hidden" name="workspace" value={context.workspace.id} />
        <label>
          Rechercher un projet
          <input
            name="q"
            maxLength={100}
            defaultValue={params.q}
            placeholder="Nom ou description"
          />
        </label>
        <label>
          Filtrer par type
          <select name="type" defaultValue={params.type ?? ""}>
            <option value="">Tous les types</option>
            {Object.entries(projectTypes).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtrer par statut
          <select name="status" defaultValue={params.status ?? "active"}>
            <option value="active">Projets actifs</option>
            <option value="all">Tous</option>
            <option value="draft">Brouillons</option>
            <option value="ready">Prêts</option>
            <option value="archived">Archives</option>
          </select>
        </label>
        <label>
          Modifié depuis
          <input type="date" name="since" defaultValue={params.since} />
        </label>
        <label>
          Trier les projets
          <select name="sort" defaultValue={params.sort ?? "updated"}>
            <option value="updated">Dernière modification</option>
            <option value="newest">Plus récent</option>
            <option value="oldest">Plus ancien</option>
            <option value="name">Nom A–Z</option>
          </select>
        </label>
        <button>Appliquer les filtres</button>
        <Link href={`/projects?workspace=${context.workspace.id}`}>
          Réinitialiser
        </Link>
      </form>
      <p>{result.total} projets trouvés</p>
      <ProjectCards projects={result.projects} role={context.membership.role} />
      {!result.total && (
        <section className="card">
          <h2>Aucun projet à afficher.</h2>
          <p>Créez votre premier projet ou ajustez les filtres.</p>
        </section>
      )}
      <nav className="project-actions" aria-label="Pagination projets">
        {offset > 0 && (
          <Link href={pagination(Math.max(0, offset - 24))}>Précédent</Link>
        )}
        {offset + 24 < result.total && (
          <Link href={pagination(offset + 24)}>Suivant</Link>
        )}
      </nav>
    </Shell>
  );
}
