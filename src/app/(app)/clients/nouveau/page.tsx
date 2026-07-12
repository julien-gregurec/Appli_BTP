import Link from "next/link";
import { ClientForm } from "@/components/ClientForm";
import { creerClientAction } from "@/app/actions/clients";

export default async function NouveauClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/clients" className="text-sm text-neutral-500 hover:underline">← Clients</Link>
          <h1 className="mt-1 text-xl font-semibold">Nouveau client</h1>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <ClientForm action={creerClientAction} submitLabel="Créer le client" />
      </div>
    </main>
  );
}
