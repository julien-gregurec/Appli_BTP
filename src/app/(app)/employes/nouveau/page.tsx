import Link from "next/link";
import { EmployeForm } from "@/components/EmployeForm";
import { creerEmployeAction } from "@/app/actions/employes";

export default async function NouvelEmployePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/employes" className="text-sm text-neutral-500 hover:underline">← Employés</Link>
          <h1 className="mt-1 text-xl font-semibold">Nouvel employé</h1>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <EmployeForm action={creerEmployeAction} submitLabel="Créer la fiche" />
      </div>
    </main>
  );
}
