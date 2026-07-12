import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { DEVIS_STATUTS, statutDevis, euros } from "@/lib/devis";
import { nomClient } from "@/lib/chantier-statuts";

export default async function DevisPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  const { q = "", statut = "" } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: devis } = await supabase
    .from("devis")
    .select("id, numero, statut, date_emission, montant_ttc, client:clients(nom, prenom, societe), chantier:chantiers(nom)")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  const recherche = q.trim().toLocaleLowerCase("fr");
  const devisFiltres = (devis ?? []).filter((item) => {
    if (statut && item.statut !== statut) return false;
    if (!recherche) return true;
    const client = Array.isArray(item.client) ? item.client[0] : item.client;
    const chantier = Array.isArray(item.chantier) ? item.chantier[0] : item.chantier;
    return [item.numero, client ? nomClient(client) : "", chantier?.nom]
      .filter(Boolean)
      .some((valeur) => String(valeur).toLocaleLowerCase("fr").includes(recherche));
  });
  const montantFiltre = devisFiltres.reduce((total, item) => total + Number(item.montant_ttc ?? 0), 0);
  const montantAccepte = (devis ?? []).filter((item) => item.statut === "accepte").reduce((total, item) => total + Number(item.montant_ttc ?? 0), 0);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Devis</h1>
            <p className="text-sm text-neutral-500">{devisFiltres.length} devis affiché(s) sur {devis?.length ?? 0}</p>
          </div>
          <Link href="/devis/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            + Nouveau devis
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">Devis affichés</div><div className="mt-1 text-xl font-semibold">{devisFiltres.length}</div></div>
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">Montant affiché</div><div className="mt-1 font-mono text-xl font-semibold">{euros(montantFiltre)}</div></div>
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">Devis acceptés</div><div className="mt-1 font-mono text-xl font-semibold">{euros(montantAccepte)}</div></div>
        </div>

        <form method="get" className="flex flex-wrap gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <input name="q" defaultValue={q} placeholder="Numéro, client ou chantier" className="min-w-64 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <select name="statut" defaultValue={statut} className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
            <option value="">Tous les statuts</option>
            {DEVIS_STATUTS.map((option) => <option key={option.cle} value={option.cle}>{option.libelle}</option>)}
          </select>
          <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-200 dark:text-neutral-900">Filtrer</button>
          {(q || statut) && <Link href="/devis" className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">Réinitialiser</Link>}
        </form>

        {devisFiltres.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {devis?.length ? "Aucun devis ne correspond aux filtres." : "Aucun devis pour l’instant."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Numéro</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 text-right font-medium">Montant TTC</th>
                </tr>
              </thead>
              <tbody>
                {devisFiltres.map((d) => {
                  const st = statutDevis(d.statut);
                  const client = Array.isArray(d.client) ? d.client[0] : d.client;
                  return (
                    <tr key={d.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2">
                        <Link href={`/devis/${d.id}`} className="font-mono text-xs font-medium hover:underline">
                          {d.numero ?? "— brouillon —"}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{client ? nomClient(client) : "—"}</td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{d.date_emission}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />
                          {st.libelle}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{euros(d.montant_ttc)}</td>
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
