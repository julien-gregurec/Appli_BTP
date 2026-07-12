import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { CommandeEditor } from "@/components/CommandeEditor";

export default async function NouvelleCommandePage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: fournisseurs } = await supabase
    .from("fournisseurs")
    .select("id, nom")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("actif", true)
    .order("nom");

  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("id, nom")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/commandes" className="text-sm text-neutral-500 hover:underline">← Commandes</Link>
          <h1 className="mt-1 text-xl font-semibold">Nouvelle commande fournisseur</h1>
        </div>
        <CommandeEditor
          fournisseurs={(fournisseurs ?? []).map((f) => ({ id: f.id, label: f.nom }))}
          chantiers={(chantiers ?? []).map((c) => ({ id: c.id, label: c.nom }))}
        />
      </div>
    </main>
  );
}
