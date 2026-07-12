import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ClientForm } from "@/components/ClientForm";
import { modifierClientAction } from "@/app/actions/clients";
import { nomClient } from "@/lib/chantier-statuts";

export default async function ModifierClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await getContexteEntreprise();
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).single();
  if (!client) notFound();

  const action = modifierClientAction.bind(null, id);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href={`/clients/${id}`} className="text-sm text-neutral-500 hover:underline">← {nomClient(client)}</Link>
          <h1 className="mt-1 text-xl font-semibold">Modifier le client</h1>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <ClientForm action={action} initial={client} submitLabel="Enregistrer" />
      </div>
    </main>
  );
}
