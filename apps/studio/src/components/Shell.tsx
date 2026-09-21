import Link from "next/link";
import { logout } from "../app/actions";
import type { getActiveStudioWorkspace } from "../lib/workspaces";
export default function Shell({
  context,
  page,
  children,
}: {
  context: Awaited<ReturnType<typeof getActiveStudioWorkspace>>;
  page: "dashboard" | "settings" | "members" | "projects";
  children: React.ReactNode;
}) {
  const { user, workspace, workspaces, membership } = context;
  const suffix = `?workspace=${workspace.id}`;
  return (
    <div className="shell">
      <aside>
        <Link className="brand" href={`/dashboard${suffix}`}>
          ELSATIA
          <span>
            Studio<span className="brand-dot">.</span>
          </span>
        </Link>
        <p className="eyebrow">VOTRE ESPACE CRÉATIF</p>
        <nav aria-label="Navigation Studio">
          <Link
            aria-current={page === "dashboard" ? "page" : undefined}
            href={`/dashboard${suffix}`}
          >
            Tableau de bord
          </Link>
          <Link
            href={`/projects${suffix}`}
            aria-current={page === "projects" ? "page" : undefined}
          >
            Projets
          </Link>
          <span>
            Templates <small>À venir</small>
          </span>
          <span>
            Brand Kit <small>À venir</small>
          </span>
          <Link
            aria-current={page === "settings" ? "page" : undefined}
            href={`/settings${suffix}`}
          >
            Paramètres
          </Link>
          <Link
            aria-current={page === "members" ? "page" : undefined}
            href={`/settings/members${suffix}`}
          >
            Membres
          </Link>
        </nav>
        <div className="aside-foot">
          Vos images. Votre histoire.
          <br />
          <small>Bibliothèque privée</small>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <form
            className="switcher"
            action={page === "members" ? "/settings/members" : `/${page}`}
          >
            <label htmlFor="workspace-switch">Espace actif</label>
            <select
              id="workspace-switch"
              name="workspace"
              defaultValue={workspace.id}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button className="secondary">Ouvrir</button>
          </form>
          <div className="account">
            <span>
              {user.email}
              <small>{membership.role}</small>
            </span>
            <form action={logout}>
              <button className="text-button">Déconnexion</button>
            </form>
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
