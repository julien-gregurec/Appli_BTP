import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { contratEmployeLabel, formatEuro, nomEmploye, statutEmploye } from "@/lib/employes";

export default async function EmployesPage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: employes } = await supabase
    .from("employes")
    .select("id, reference_interne, numero_inscription, utilisateur_id, prenom, nom, poste, type_contrat, statut, telephone, email, cout_horaire")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("nom", { ascending: true });

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Employés</h1>
            <p className="text-sm text-neutral-500">{employes?.length ?? 0} fiche(s)</p>
          </div>
          <Link href="/employes/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            + Nouvel employé
          </Link>
        </div>

        {!employes || employes.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Aucun employé pour l&apos;instant. Crée la première fiche.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Réf.</th>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Poste</th>
                  <th className="px-4 py-2 font-medium">Contrat</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Coût</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 font-medium">Application</th>
                </tr>
              </thead>
              <tbody>
                {employes.map((employe) => {
                  const statut = statutEmploye(employe.statut);
                  return (
                    <tr key={employe.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">{employe.reference_interne}</td>
                      <td className="px-4 py-2">
                        <Link href={`/employes/${employe.id}`} className="font-medium hover:underline">
                          {nomEmploye(employe)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{employe.poste ?? "—"}</td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{contratEmployeLabel(employe.type_contrat)}</td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{employe.telephone ?? employe.email ?? "—"}</td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{formatEuro(employe.cout_horaire)}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          <span className="h-2 w-2 rounded-full" style={{ background: statut.couleur }} />
                          {statut.libelle}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className={`rounded-full px-2 py-1 ${employe.utilisateur_id ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{employe.utilisateur_id ? "Activé" : "À inviter"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
