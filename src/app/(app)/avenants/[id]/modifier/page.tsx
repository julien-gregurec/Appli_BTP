import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { AvenantEditor } from "@/components/AvenantEditor";

export default async function ModifierAvenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: avenant } = await supabase
    .from("avenants")
    .select("id, statut, notes_client, notes_internes, chantier_id, devis:devis!avenants_devis_origine_id_fkey(id, numero, montant_ht)")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!avenant) notFound();
  if (avenant.statut !== "brouillon") redirect(`/avenants/${id}`);

  const devis = Array.isArray(avenant.devis) ? avenant.devis[0] : avenant.devis;
  if (!devis) notFound();

  const { data: lignes } = await supabase
    .from("lignes_avenants")
    .select("id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva")
    .eq("avenant_id", id)
    .order("ordre");

  return (
    <main className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link href={`/avenants/${id}`} className="text-sm text-neutral-500 hover:underline">← Avenant</Link>
          <h1 className="mt-1 text-xl font-semibold">Modifier l’avenant</h1>
        </div>
        <AvenantEditor
          devisId={devis.id}
          devisNumero={devis.numero}
          devisMontantHt={Number(devis.montant_ht)}
          chantierId={avenant.chantier_id}
          avenantInitial={{ id: avenant.id, notes_client: avenant.notes_client, notes_internes: avenant.notes_internes, lignes: lignes ?? [] }}
        />
      </div>
    </main>
  );
}
