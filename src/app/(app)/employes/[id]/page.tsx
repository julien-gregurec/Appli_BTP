import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { contratEmployeLabel, formatDateFr, formatEuro, nomEmploye, statutEmploye } from "@/lib/employes";
import { StatutEmployeSelect } from "@/components/StatutEmployeSelect";

export default async function EmployeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getContexteEntreprise();
  const supabase = await createClient();

  const { data: employe } = await supabase
    .from("employes")
    .select("*")
    .eq("id", id)
    .single();

  if (!employe) notFound();

  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("id, reference_interne, nom, statut, ville")
    .eq("responsable_id", id)
    .order("created_at", { ascending: false });

  const statut = statutEmploye(employe.statut);

  const ligne = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex gap-2 text-sm">
        <span className="w-40 flex-none text-neutral-500">{label}</span>
        <span>{value}</span>
      </div>
    ) : null;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/employes" className="text-sm text-neutral-500 hover:underline">← Employés</Link>
            <h1 className="mt-1 text-xl font-semibold">{nomEmploye(employe)}</h1>
            <p className="font-mono text-xs text-neutral-500">
              {employe.reference_interne} · {contratEmployeLabel(employe.type_contrat)} · {statut.libelle}
            </p>
          </div>
          <Link href={`/employes/${id}/modifier`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            Modifier
          </Link>
        </div>

        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">Fiche</h2>
            <StatutEmployeSelect employeId={id} statut={employe.statut} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
            <span className="h-2 w-2 rounded-full" style={{ background: statut.couleur }} />
            {statut.libelle}
          </div>
          {ligne("Poste", employe.poste)}
          {ligne("Téléphone", employe.telephone)}
          {ligne("Email", employe.email)}
          {ligne("Date d'entrée", formatDateFr(employe.date_entree))}
          {ligne("Date de sortie", employe.date_sortie ? formatDateFr(employe.date_sortie) : null)}
          {ligne("Taux facturé", formatEuro(employe.taux_horaire))}
          {ligne("Coût interne", formatEuro(employe.cout_horaire))}
          {ligne("Notes", employe.notes)}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Chantiers suivis</h2>
          {!chantiers || chantiers.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucun chantier rattaché comme responsable.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <tbody>
                  {chantiers.map((chantier) => (
                    <tr key={chantier.id} className="border-t border-neutral-100 first:border-t-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">{chantier.reference_interne}</td>
                      <td className="px-4 py-2">
                        <Link href={`/chantiers/${chantier.id}`} className="font-medium hover:underline">{chantier.nom}</Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{chantier.ville ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
