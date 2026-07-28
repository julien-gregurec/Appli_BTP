import Link from "next/link";
import { notFound } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { formatDateVersion, informationsVersion } from "@/lib/version";

export default async function VersionPage() {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && !permissions.includes("acces_parametres")) notFound();

  const version = informationsVersion();
  const lignes = [
    ["Version de l’application", version.version],
    ["Commit Git", version.commit],
    ["Date du build", formatDateVersion(version.dateBuild)],
    ["Environnement", version.environnement],
    ["Date du déploiement", formatDateVersion(version.dateDeploiement)],
    ["Domaine du déploiement", version.urlDeploiement || "indisponible"],
  ];

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500 hover:underline">← Paramètres</Link>
          <h1 className="mt-2 text-xl font-semibold">Version déployée</h1>
          <p className="text-sm text-neutral-500">
            Ces informations permettent au support de vérifier précisément le code exécuté.
          </p>
        </div>
        <section className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <dl className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {lignes.map(([libelle, valeur]) => (
              <div key={libelle} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
                <dt className="text-sm font-medium">{libelle}</dt>
                <dd className="break-all font-mono text-sm text-neutral-600 dark:text-neutral-300">{valeur}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
          Aucune clé, aucun jeton et aucune variable confidentielle ne sont affichés sur cette page.
        </p>
      </div>
    </main>
  );
}
