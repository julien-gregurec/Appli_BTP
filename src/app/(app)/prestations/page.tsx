import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { typePrestationLabel } from "@/lib/prestations";
import { changerActivationPrestationAction } from "@/app/actions/prestations";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export default async function PrestationsPage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: prestations } = await supabase
    .from("prestations_catalogue")
    .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva, actif")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("actif", { ascending: false })
    .order("designation");

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-semibold">Prestations</h1><p className="text-sm text-neutral-500">Catalogue réutilisable dans les devis</p></div>
          <Link href="/prestations/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">+ Nouvelle prestation</Link>
        </div>
        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-2">Prestation</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Prix HT</th><th className="px-4 py-2">TVA</th><th className="px-4 py-2">État</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {(prestations ?? []).map((p) => (
                <tr key={p.id} className={`border-t border-neutral-100 dark:border-neutral-800 ${p.actif ? "" : "opacity-50"}`}>
                  <td className="px-4 py-3"><div className="font-medium">{p.designation}</div>{p.description && <div className="mt-0.5 max-w-md truncate text-xs text-neutral-500">{p.description}</div>}</td>
                  <td className="px-4 py-3">{typePrestationLabel(p.type)}</td>
                  <td className="px-4 py-3 font-mono">{euros(Number(p.prix_unitaire_ht))} / {p.unite}</td>
                  <td className="px-4 py-3">{Number(p.taux_tva)} %</td>
                  <td className="px-4 py-3">{p.actif ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-3"><Link href={`/prestations/${p.id}/modifier`} className="hover:underline">Modifier</Link><form action={changerActivationPrestationAction.bind(null, p.id, !p.actif)}><ConfirmSubmitButton message={p.actif ? `Désactiver « ${p.designation} » ?` : `Réactiver « ${p.designation} » ?`} className="text-neutral-500 hover:underline">{p.actif ? "Désactiver" : "Réactiver"}</ConfirmSubmitButton></form></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
