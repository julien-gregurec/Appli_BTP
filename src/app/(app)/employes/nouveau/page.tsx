import Link from "next/link";
import { EmployeForm } from "@/components/EmployeForm";
import { creerEmployeAction } from "@/app/actions/employes";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function NouvelEmployePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && !permissions.includes("gerer_employes")) redirect("/employes?error=Acc%C3%A8s%20en%20lecture%20seule");
  const supabase = await createClient();
  const { data: postes } = await supabase.from("postes").select("id, nom").eq("entreprise_id", ctx.entrepriseId).order("nom");

  return (
    <main className="p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/employes" className="text-sm text-neutral-500 hover:underline">← Employés</Link>
          <h1 className="mt-1 text-xl font-semibold">Nouvel employé</h1>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <EmployeForm action={creerEmployeAction} postes={postes ?? []} submitLabel="Créer la fiche" />
      </div>
    </main>
  );
}
