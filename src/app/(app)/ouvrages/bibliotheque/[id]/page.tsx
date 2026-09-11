import Link from "next/link";
import { notFound } from "next/navigation";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { chargerOuvrageAction } from "@/app/actions/devis-v2";
import { chargerDroitsBibliotheque, lireSeuilTauxMarque } from "@/lib/ouvrages/droits-bibliotheque";
import { retirerCouts } from "@/lib/ouvrages/editeur-ouvrage";
import { BibliothequeInactive } from "@/components/ouvrages/BibliothequeInactive";
import { OuvrageEditeur } from "@/components/ouvrages/OuvrageEditeur";

const INTROUVABLE = new Set(["Ouvrage introuvable.", "Version d’ouvrage introuvable."]);

export default async function OuvragePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ publie?: string }>;
}) {
  const [{ id }, { publie }] = await Promise.all([params, searchParams]);
  if (!devisV2Actif()) return <BibliothequeInactive />;
  const { ctx, peutGerer, peutVoirCouts, peutGererCouts } = await chargerDroitsBibliotheque();

  const r = await chargerOuvrageAction(id);
  if ("error" in r && INTROUVABLE.has(r.error)) notFound();

  const retour = (
    <Link href="/ouvrages/bibliotheque" className="inline-flex min-h-11 items-center text-sm text-neutral-500 hover:underline">← Bibliothèque d’ouvrages</Link>
  );
  if ("error" in r) {
    return (
      <main className="p-4 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-4">
          {retour}
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{r.error}</p>
        </div>
      </main>
    );
  }

  // `chargerOuvrageAction` ne lit déjà aucun coût sans voir_couts_devis ; on le garantit une seconde
  // fois ici, AVANT que la version ne parte vers le navigateur.
  const version = peutVoirCouts ? r.version : retirerCouts(r.version);

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          {retour}
          <h1 className="text-xl font-semibold">
            {version.referenceInterne && <span className="mr-2 font-mono text-base text-neutral-500">{version.referenceInterne}</span>}
            {version.nom}
          </h1>
          <p className="text-sm text-neutral-500">
            Version {version.version}
            {version.statut === "archive" && <span className="ml-2 rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">Archivé</span>}
          </p>
        </div>
        {publie && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Version {version.version} publiée.</p>}
        <OuvrageEditeur
          key={`${id}-${version.version}`}
          ouvrageId={id}
          versionInitiale={version}
          peutGerer={peutGerer}
          peutVoirCouts={peutVoirCouts}
          peutGererCouts={peutGererCouts}
          seuilTauxMarquePct={peutVoirCouts ? await lireSeuilTauxMarque(ctx.entrepriseId) : null}
        />
      </div>
    </main>
  );
}
