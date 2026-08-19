import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { AvenantEditor } from "@/components/AvenantEditor";

export default async function NouvelAvenantPage({ searchParams }: { searchParams: Promise<{ devis?: string }> }) {
  const { devis: devisId } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!devisId) notFound();

  const { data: devis } = await supabase
    .from("devis")
    .select("id, numero, statut, montant_ht, chantier_id")
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!devis) notFound();
  if (devis.statut !== "accepte" || !devis.chantier_id) {
    return (
      <main className="p-8">
        <div className="mx-auto max-w-xl">
          <p className="text-sm text-red-600">Un avenant ne peut être créé que sur un devis accepté et rattaché à un chantier.</p>
          <Link href={`/devis/${devisId}`} className="mt-2 inline-block text-sm text-neutral-500 hover:underline">← Retour au devis</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link href={`/devis/${devisId}`} className="text-sm text-neutral-500 hover:underline">← Devis {devis.numero}</Link>
          <h1 className="mt-1 text-xl font-semibold">Nouvel avenant</h1>
        </div>
        <AvenantEditor devisId={devis.id} devisNumero={devis.numero} devisMontantHt={Number(devis.montant_ht)} chantierId={devis.chantier_id} />
      </div>
    </main>
  );
}
