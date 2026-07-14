import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { EmployeForm } from "@/components/EmployeForm";
import { modifierEmployeAction } from "@/app/actions/employes";
import { nomEmploye } from "@/lib/employes";
import { permissionsUtilisateur } from "@/lib/permissions";

export default async function ModifierEmployePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && !permissions.includes("gerer_employes")) redirect(`/employes/${id}?error=Acc%C3%A8s%20en%20lecture%20seule`);
  const supabase = await createClient();

  const [{ data: employe }, { data: postes }] = await Promise.all([
    supabase.from("employes").select("*").eq("id", id).eq("entreprise_id", ctx.entrepriseId).single(),
    supabase.from("postes").select("id, nom").eq("entreprise_id", ctx.entrepriseId).order("nom"),
  ]);
  if (!employe) notFound();

  const action = modifierEmployeAction.bind(null, id);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href={`/employes/${id}`} className="text-sm text-neutral-500 hover:underline">← {nomEmploye(employe)}</Link>
          <h1 className="mt-1 text-xl font-semibold">Modifier l&apos;employé</h1>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <EmployeForm action={action} initial={employe} postes={postes ?? []} submitLabel="Enregistrer" />
      </div>
    </main>
  );
}
