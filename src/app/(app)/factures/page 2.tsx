import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { FACTURE_STATUTS, statutFacture } from "@/lib/factures";
import { euros } from "@/lib/devis";
import { nomClient } from "@/lib/chantier-statuts";

export default async function FacturesPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  const { q = "", statut = "" } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: factures } = await supabase
    .from("factures")
    .select("id, numero, statut, date_emission, date_echeance, montant_ttc, montant_paye, client:clients(nom, prenom, societe)")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  const recherche = q.trim().toLocaleLowerCase("fr");
  const facturesFiltrees = (factures ?? []).filter((facture) => {
    if (statut && facture.statut !== statut) return false;
    if (!recherche) return true;
    const client = Array.isArray(facture.client) ? facture.client[0] : facture.client;
    return [facture.numero, client ? nomClient(client) : ""]
      .filter(Boolean)
      .some((valeur) => String(valeur).toLocaleLowerCase("fr").includes(recherche));
  });
  const totalFacture = facturesFiltrees.reduce((total, facture) => total + Number(facture.montant_ttc ?? 0), 0);
  const totalPaye = facturesFiltrees.reduce((total, facture) => total + Number(facture.montant_paye ?? 0), 0);
  const reste = Math.max(0, totalFacture - totalPaye);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Factures</h1>
          <p className="text-sm text-neutral-500">
            {facturesFiltrees.length} facture(s) affichée(s) sur {factures?.length ?? 0}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">Total facturé</div><div className="mt-1 font-mono text-xl font-semibold">{euros(totalFacture)}</div></div>
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">Total encaissé</div><div className="mt-1 font-mono text-xl font-semibold text-green-700 dark:text-green-400">{euros(totalPaye)}</div></div>
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">Reste à encaisser</div><div className="mt-1 font-mono text-xl font-semibold text-amber-700 dark:text-amber-400">{euros(reste)}</div></div>
        </div>

        <form method="get" className="flex flex-wrap gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <input name="q" defaultValue={q} placeholder="Numéro ou client" className="min-w-64 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <select name="statut" defaultValue={statut} className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
            <option value="">Tous les statuts</option>
            {FACTURE_STATUTS.map((option) => <option key={option.cle} value={option.cle}>{option.libelle}</option>)}
          </select>
          <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-200 dark:text-neutral-900">Filtrer</button>
          {(q || statut) && <Link href="/factures" className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">Réinitialiser</Link>}
        </form>

        {facturesFiltrees.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {factures?.length ? "Aucune facture ne correspond aux filtres." : "Aucune facture. Ouvre un devis accepté et clique « Créer une facture »."}
          </div>
        ) : (
          <>
          <div className="grid gap-3 md:hidden">
            {facturesFiltrees.map((facture) => {
              const st = statutFacture(facture.statut);
              const client = Array.isArray(facture.client) ? facture.client[0] : facture.client;
              const resteFacture = Math.max(0, Number(facture.montant_ttc) - Number(facture.montant_paye));
              return (
                <article key={facture.id} className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/factures/${facture.id}`} className="block truncate font-mono text-sm font-semibold hover:underline">
                        {facture.numero ?? "— brouillon —"}
                      </Link>
                      <p className="mt-1 truncate text-sm font-medium">{client ? nomClient(client) : "Client non renseigné"}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium dark:bg-neutral-800">
                      <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />{st.libelle}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-neutral-500">Émise le</dt><dd>{facture.date_emission}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Échéance</dt><dd>{facture.date_echeance ?? "—"}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Montant TTC</dt><dd className="font-mono font-semibold">{euros(facture.montant_ttc)}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Reste à encaisser</dt><dd className={`font-mono font-semibold ${resteFacture > 0 ? "text-amber-700" : "text-green-700"}`}>{euros(resteFacture)}</dd></div>
                  </dl>
                  <Link href={`/factures/${facture.id}`} className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium">
                    Ouvrir, envoyer ou télécharger la facture
                  </Link>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800 md:block">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Numéro</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 text-right font-medium">TTC</th>
                  <th className="px-4 py-2 text-right font-medium">Payé</th>
                </tr>
              </thead>
              <tbody>
                {facturesFiltrees.map((f) => {
                  const st = statutFacture(f.statut);
                  const client = Array.isArray(f.client) ? f.client[0] : f.client;
                  return (
                    <tr key={f.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2">
                        <Link href={`/factures/${f.id}`} className="font-mono text-xs font-medium hover:underline">
                          {f.numero ?? "— brouillon —"}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{client ? nomClient(client) : "—"}</td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{f.date_emission}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />
                          {st.libelle}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{euros(f.montant_ttc)}</td>
                      <td className="px-4 py-2 text-right font-mono text-neutral-500">{euros(f.montant_paye)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </main>
  );
}
