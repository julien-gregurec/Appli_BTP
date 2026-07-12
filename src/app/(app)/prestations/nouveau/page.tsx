import Link from "next/link";
import { PrestationForm } from "@/components/PrestationForm";
import { creerPrestationAction } from "@/app/actions/prestations";

export default async function NouvellePrestationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="p-8"><div className="mx-auto max-w-2xl space-y-6"><div><Link href="/prestations" className="text-sm text-neutral-500 hover:underline">← Prestations</Link><h1 className="mt-1 text-xl font-semibold">Nouvelle prestation</h1></div>{error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<PrestationForm action={creerPrestationAction} submitLabel="Créer la prestation" /></div></main>;
}
