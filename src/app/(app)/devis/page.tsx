import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { DEVIS_STATUTS, statutDevis, euros } from "@/lib/devis";
import { nomClient } from "@/lib/chantier-statuts";
import { Lien as Link } from "@/components/Lien";

type LigneDevis = {
  id: string; numero: string | null; statut: string; date_emission: string; montant_ttc: number;
  client_nom: string | null; client_prenom: string | null; client_societe: string | null;
  chantier_nom: string | null;
};

const TAILLE_PAGE = 25;

export default async function DevisPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; page?: string }> }) {
  const { q = "", statut = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data } = await supabase.rpc("devis_liste_paginee", {
    p_entreprise_id: ctx.entrepriseId,
    p_recherche: q,
    p_statut: statut,
    p_page: page,
    p_taille: TAILLE_PAGE,
  });
  const resultat = (data ?? {}) as {
    lignes?: LigneDevis[]; total?: number; montant_filtre?: number; montant_accepte?: number; pages?: number;
  };
  const devisFiltres = resultat.lignes ?? [];
  const total = resultat.total ?? 0;
  const montantFiltre = resultat.montant_filtre ?? 0;
  const montantAccepte = resultat.montant_accepte ?? 0;
  const nbPages = resultat.pages ?? 1;

  const parametresPage = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (statut) sp.set("statut", statut);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/devis?${s}` : "/devis";
  };

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Devis</h1>
            <p className="text-sm text-neutral-500">{total} devis correspondant(s){nbPages > 1 ? ` — page ${page}/${nbPages}` : ""}</p>
          </div>
          <Link href="/devis/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            + Nouveau devis
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">Devis correspondants</div><div className="mt-1 text-xl font-semibold">{total}</div></div>
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">Montant filtré</div><div className="mt-1 font-mono text-xl font-semibold">{euros(montantFiltre)}</div></div>
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
            {total === 0 && !q && !statut ? "Aucun devis pour l’instant." : "Aucun devis ne correspond aux filtres."}
          </div>
        ) : (
          <>
          <div className="grid gap-3 md:hidden">
            {devisFiltres.map((item) => {
              const st = statutDevis(item.statut);
              const client = { nom: item.client_nom, prenom: item.client_prenom, societe: item.client_societe };
              return (
                <article key={item.id} className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/devis/${item.id}`} className="block truncate font-mono text-sm font-semibold hover:underline">
                        {item.numero ?? "— brouillon —"}
                      </Link>
                      <p className="mt-1 truncate text-sm font-medium">{item.client_nom || item.client_societe ? nomClient(client) : "Client non renseigné"}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium dark:bg-neutral-800">
                      <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />{st.libelle}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-neutral-500">Date d’émission</dt><dd>{item.date_emission}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Montant TTC</dt><dd className="font-mono font-semibold">{euros(item.montant_ttc)}</dd></div>
                    <div className="col-span-2"><dt className="text-xs text-neutral-500">Chantier</dt><dd>{item.chantier_nom ?? "Sans chantier"}</dd></div>
                  </dl>
                  <Link href={`/devis/${item.id}`} className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium">
                    Ouvrir, envoyer ou télécharger le devis
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
                  <th className="px-4 py-2 text-right font-medium">Montant TTC</th>
                </tr>
              </thead>
              <tbody>
                {devisFiltres.map((d) => {
                  const st = statutDevis(d.statut);
                  const client = { nom: d.client_nom, prenom: d.client_prenom, societe: d.client_societe };
                  return (
                    <tr key={d.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2">
                        <Link href={`/devis/${d.id}`} className="font-mono text-xs font-medium hover:underline">
                          {d.numero ?? "— brouillon —"}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{d.client_nom || d.client_societe ? nomClient(client) : "—"}</td>
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
          </>
        )}

        {nbPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={parametresPage(page - 1)} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">← Page précédente</Link>
            ) : <span />}
            <span className="text-neutral-500">Page {page} sur {nbPages}</span>
            {page < nbPages ? (
              <Link href={parametresPage(page + 1)} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">Page suivante →</Link>
            ) : <span />}
          </div>
        )}
      </div>
    </main>
  );
}
