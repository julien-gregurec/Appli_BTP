import Link from "next/link";
import { PrestationForm } from "@/components/PrestationForm";
import { creerPrestationAction } from "@/app/actions/prestations";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { chargerOptionsCatalogueV2 } from "@/lib/prestations-catalogue-v2-serveur";

export default async function NouvellePrestationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const catalogueV2 = devisV2Actif() ? await chargerOptionsCatalogueV2(null) : undefined;
  return <main className="p-8"><div className="mx-auto max-w-2xl space-y-6"><div><Link href="/prestations" className="text-sm text-neutral-500 hover:underline">← Prestations</Link><h1 className="mt-1 text-xl font-semibold">Nouvelle prestation</h1></div>{error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<PrestationForm action={creerPrestationAction} submitLabel="Créer la prestation" catalogueV2={catalogueV2} /></div></main>;
}
