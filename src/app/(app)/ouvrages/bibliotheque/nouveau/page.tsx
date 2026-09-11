import Link from "next/link";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { chargerDroitsBibliotheque, lireSeuilTauxMarque } from "@/lib/ouvrages/droits-bibliotheque";
import { BibliothequeInactive } from "@/components/ouvrages/BibliothequeInactive";
import { OuvrageEditeur } from "@/components/ouvrages/OuvrageEditeur";

export default async function NouvelOuvragePage() {
  if (!devisV2Actif()) return <BibliothequeInactive />;
  const { ctx, peutGerer, peutVoirCouts, peutGererCouts } = await chargerDroitsBibliotheque();

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <Link href="/ouvrages/bibliotheque" className="inline-flex min-h-11 items-center text-sm text-neutral-500 hover:underline">← Bibliothèque d’ouvrages</Link>
          <h1 className="text-xl font-semibold">Nouvel ouvrage</h1>
        </div>
        {peutGerer ? (
          <OuvrageEditeur
            ouvrageId={null}
            versionInitiale={null}
            peutGerer
            peutVoirCouts={peutVoirCouts}
            peutGererCouts={peutGererCouts}
            seuilTauxMarquePct={peutVoirCouts ? await lireSeuilTauxMarque(ctx.entrepriseId) : null}
          />
        ) : (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Vous n’avez pas le droit de créer un ouvrage.</p>
        )}
      </div>
    </main>
  );
}
