import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient } from "@/lib/chantier-statuts";
import { DevisEditor } from "@/components/DevisEditor";

export default async function ModifierDevisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const [{ data: devis }, { data: lignes }, { data: clients }, { data: chantiers }, { data: prestations }] = await Promise.all([
    supabase.from("devis").select("id, client_id, chantier_id, date_validite, remise_globale, notes_client, statut").eq("id", id).eq("entreprise_id", ctx.entrepriseId).single(),
    supabase.from("lignes_devis").select("id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva").eq("devis_id", id).order("ordre"),
    supabase.from("clients").select("id, nom, prenom, societe").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("chantiers").select("id, nom, client_id").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("prestations_catalogue").select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva").eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("designation"),
  ]);

  if (!devis) notFound();
  if (devis.statut !== "brouillon") redirect(`/devis/${id}`);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div><Link href={`/devis/${id}`} className="text-sm text-neutral-500 hover:underline">← Devis</Link><h1 className="mt-1 text-xl font-semibold">Modifier le devis brouillon</h1></div>
        <DevisEditor
          clients={(clients ?? []).map((client) => ({ id: client.id, label: nomClient(client) }))}
          chantiers={(chantiers ?? []).map((chantier) => ({ id: chantier.id, label: chantier.nom, client_id: chantier.client_id }))}
          prestations={prestations ?? []}
          devisInitial={{
            id: devis.id,
            client_id: devis.client_id,
            chantier_id: devis.chantier_id,
            date_validite: devis.date_validite,
            remise_globale: Number(devis.remise_globale),
            notes_client: devis.notes_client,
            lignes: (lignes ?? []).map((ligne) => ({ ...ligne, quantite: Number(ligne.quantite), prix_unitaire_ht: Number(ligne.prix_unitaire_ht), remise_ligne: Number(ligne.remise_ligne), taux_tva: Number(ligne.taux_tva) })),
          }}
        />
      </div>
    </main>
  );
}
