import Link from "next/link";
import { notFound } from "next/navigation";
import { chargerCatalogueApplications, chargerHistoriqueApplications, estAdministrateurPlateformeMultiApp } from "@/lib/multi-app-server";
import { environnementApplications } from "@/lib/multi-app";

const STATUTS_PRODUIT: Record<string, string> = {
  disponible: "Disponible",
  bientot: "Bientôt disponible",
  interne: "Interne",
};

export default async function ApplicationsPlateformePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; succes?: string }>;
}) {
  if (!(await estAdministrateurPlateformeMultiApp())) notFound();
  const [applications, historique, messages] = await Promise.all([
    chargerCatalogueApplications(),
    chargerHistoriqueApplications(),
    searchParams,
  ]);
  const environnement = environnementApplications();

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6a1f]">Administration ELSATIA</p>
            <h1 className="mt-1 text-2xl font-semibold">Applications</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Catalogue central dynamique et usages actifs. Les applications futures apparaissent ici sans modification du composant.
            </p>
          </div>
          <Link href="/plateforme" className="rounded-md border px-3 py-2 text-sm font-medium">← Entreprises</Link>
        </header>

        {messages.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
        {messages.succes && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-700">{messages.succes}</p>}

        <section aria-labelledby="catalogue-applications" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="catalogue-applications" className="font-semibold">Catalogue des applications</h2>
              <p className="text-xs text-neutral-500">URL affichée pour l’environnement <strong>{environnement}</strong>.</p>
            </div>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs dark:bg-neutral-800">{applications.length} application(s)</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {applications.map((application) => {
              const url = environnement === "production"
                ? application.url_production
                : environnement === "preview"
                  ? application.url_preview
                  : application.url_locale;
              return (
                <article key={application.code} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{application.nom}</h3>
                        <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800">{application.code}</code>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">{application.description ?? "Aucune description"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${application.actif ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-600"}`}>
                      {application.actif ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-[10px] uppercase text-neutral-500">Produit</dt><dd className="mt-1 font-medium">{STATUTS_PRODUIT[application.statut_produit] ?? application.statut_produit}</dd></div>
                    <div><dt className="text-[10px] uppercase text-neutral-500">Entreprises</dt><dd className="mt-1 text-lg font-semibold">{application.entreprisesAutorisees}</dd></div>
                    <div><dt className="text-[10px] uppercase text-neutral-500">Utilisateurs</dt><dd className="mt-1 text-lg font-semibold">{application.utilisateursHabilites}</dd></div>
                    <div><dt className="text-[10px] uppercase text-neutral-500">Ordre</dt><dd className="mt-1 font-medium">{application.ordre}</dd></div>
                  </dl>
                  <div className="mt-4 rounded-md bg-neutral-50 p-3 text-xs dark:bg-neutral-900">
                    <span className="block text-[10px] uppercase text-neutral-500">URL {environnement}</span>
                    {url ? <a href={url} className="mt-1 block truncate font-mono text-blue-700 underline dark:text-blue-300">{url}</a> : <span className="mt-1 block text-amber-700">Non configurée</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="historique-applications" className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 id="historique-applications" className="font-semibold">Historique des accès</h2>
          <p className="mt-1 text-xs text-neutral-500">Lecture seule. Les changements sont écrits exclusivement par les RPC canoniques.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b text-neutral-500"><tr><th className="p-2">Date</th><th className="p-2">Application</th><th className="p-2">Cible</th><th className="p-2">Action</th><th className="p-2">Auteur</th></tr></thead>
              <tbody>
                {historique.map((entree) => <tr key={entree.id} className="border-b border-neutral-100 dark:border-neutral-800"><td className="p-2">{new Date(entree.created_at).toLocaleString("fr-FR")}</td><td className="p-2 font-mono">{entree.application_code}</td><td className="p-2">{entree.cible_type}</td><td className="p-2">{entree.action}</td><td className="p-2">{entree.auteur_email ?? "—"}</td></tr>)}
                {!historique.length && <tr><td colSpan={5} className="p-6 text-center text-neutral-500">Aucune opération journalisée.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
