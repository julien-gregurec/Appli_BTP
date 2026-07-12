import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { DevisEditor } from "@/components/DevisEditor";
import { nomClient } from "@/lib/chantier-statuts";

export default async function NouveauDevisPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; chantier?: string }>;
}) {
  const { client: clientPreselect, chantier: chantierPreselect } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, nom, prenom, societe")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("id, nom, client_id")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  const { data: prestations } = await supabase
    .from("prestations_catalogue")
    .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("actif", true)
    .order("designation");

  const optionsClients = (clients ?? []).map((c) => ({ id: c.id, label: nomClient(c) }));
  const optionsChantiers = (chantiers ?? []).map((c) => ({ id: c.id, label: c.nom, client_id: c.client_id }));

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/devis" className="text-sm text-neutral-500 hover:underline">← Devis</Link>
          <h1 className="mt-1 text-xl font-semibold">Nouveau devis</h1>
        </div>

        <DevisEditor
          clients={optionsClients}
          chantiers={optionsChantiers}
          prestations={prestations ?? []}
          clientPreselect={clientPreselect}
          chantierPreselect={chantierPreselect}
        />
      </div>
    </main>
  );
}
