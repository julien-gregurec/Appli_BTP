import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { StockKioskForm } from "@/components/StockKioskForm";

export default async function BorneStockPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: chantiers } = await supabase.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).in("statut", ["a_planifier", "planifie", "en_cours"]).order("nom");
  return <main className="min-h-screen bg-neutral-50 p-3 dark:bg-neutral-950 sm:p-8"><div className="mx-auto max-w-2xl space-y-5">
    <div><Link href="/stock" className="text-sm text-neutral-500 hover:underline">← Stock</Link><h1 className="mt-2 text-2xl font-semibold">Borne stock sécurisée</h1><p className="mt-1 text-sm text-neutral-500">Cette borne peut rester connectée au dépôt. Chaque entrée ou sortie exige cependant le numéro et le mot de passe stock personnels du salarié.</p></div>
    {messages.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
    {messages.succes && <p className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700">✓ {messages.succes}</p>}
    <StockKioskForm chantiers={chantiers ?? []} />
  </div></main>;
}
