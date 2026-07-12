import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { CHANTIER_STATUTS, statutChantier, nomClient } from "@/lib/chantier-statuts";

export default async function ChantiersPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  const { q = "", statut = "" } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("id, reference_interne, nom, ville, statut, client:clients(nom, prenom, societe)")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  const recherche = q.trim().toLocaleLowerCase("fr");
  const chantiersFiltres = (chantiers ?? []).filter((chantier) => {
    if (statut && chantier.statut !== statut) return false;
    if (!recherche) return true;
    const client = Array.isArray(chantier.client) ? chantier.client[0] : chantier.client;
    return [chantier.reference_interne, chantier.nom, chantier.ville, client ? nomClient(client) : ""].filter(Boolean).some((valeur) => String(valeur).toLocaleLowerCase("fr").includes(recherche));
  });

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Chantiers</h1>
            <p className="text-sm text-neutral-500">{chantiersFiltres.length} chantier(s) affiché(s) sur {chantiers?.length ?? 0}</p>
          </div>
          <Link href="/chantiers/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            + Nouveau chantier
          </Link>
        </div>

        <form method="get" className="flex flex-wrap gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <input name="q" defaultValue={q} placeholder="Référence, chantier, client ou ville" className="min-w-64 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <select name="statut" defaultValue={statut} className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"><option value="">Tous les statuts</option>{CHANTIER_STATUTS.map((option) => <option key={option.cle} value={option.cle}>{option.libelle}</option>)}</select>
          <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-200 dark:text-neutral-900">Filtrer</button>
          {(q || statut) && <Link href="/chantiers" className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">Réinitialiser</Link>}
        </form>

        {chantiersFiltres.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {chantiers?.length ? "Aucun chantier ne correspond aux filtres." : "Aucun chantier pour l’instant."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Réf.</th>
                  <th className="px-4 py-2 font-medium">Chantier</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {chantiersFiltres.map((ch) => {
                  const st = statutChantier(ch.statut);
                  const client = Array.isArray(ch.client) ? ch.client[0] : ch.client;
                  return (
                    <tr key={ch.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">{ch.reference_interne}</td>
                      <td className="px-4 py-2">
                        <Link href={`/chantiers/${ch.id}`} className="font-medium hover:underline">{ch.nom}</Link>
                        {ch.ville && <span className="ml-2 text-xs text-neutral-500">{ch.ville}</span>}
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{client ? nomClient(client) : "—"}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />
                          {st.libelle}
                        </span>
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
