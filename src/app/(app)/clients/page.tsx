import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient, CLIENT_TYPES, CLIENT_STATUTS } from "@/lib/chantier-statuts";
import { Lien as Link } from "@/components/Lien";

const TAILLE_PAGE = 25;

type LigneClient = {
  id: string; reference_interne: string | null; type: string; nom: string | null; prenom: string | null;
  societe: string | null; ville: string | null; statut: string;
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; statut?: string; page?: string }> }) {
  const { q = "", type = "", statut = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data } = await supabase.rpc("clients_liste_paginee", {
    p_entreprise_id: ctx.entrepriseId, p_recherche: q, p_type: type, p_statut: statut, p_page: page, p_taille: TAILLE_PAGE,
  });
  const resultat = (data ?? {}) as { lignes?: LigneClient[]; total?: number; pages?: number };
  const clientsFiltres = resultat.lignes ?? [];
  const total = resultat.total ?? 0;
  const nbPages = resultat.pages ?? 1;

  const typeLabel = (c: string) => CLIENT_TYPES.find((t) => t.cle === c)?.libelle ?? c;
  const statutLabel = (s: string) => CLIENT_STATUTS.find((t) => t.cle === s)?.libelle ?? s;

  const parametresPage = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (type) sp.set("type", type);
    if (statut) sp.set("statut", statut);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/clients?${s}` : "/clients";
  };

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Clients</h1>
            <p className="text-sm text-neutral-500">{total} client(s) correspondant(s){nbPages > 1 ? ` — page ${page}/${nbPages}` : ""}</p>
          </div>
          <Link href="/clients/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            + Nouveau client
          </Link>
        </div>

        <form method="get" className="flex flex-wrap gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <input name="q" defaultValue={q} placeholder="Référence, nom ou ville" className="min-w-56 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <select name="type" defaultValue={type} className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"><option value="">Tous les types</option>{CLIENT_TYPES.map((option) => <option key={option.cle} value={option.cle}>{option.libelle}</option>)}</select>
          <select name="statut" defaultValue={statut} className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"><option value="">Tous les statuts</option>{CLIENT_STATUTS.map((option) => <option key={option.cle} value={option.cle}>{option.libelle}</option>)}</select>
          <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-200 dark:text-neutral-900">Filtrer</button>
          {(q || type || statut) && <Link href="/clients" className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">Réinitialiser</Link>}
        </form>

        {clientsFiltres.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {total === 0 && !q && !type && !statut ? "Aucun client pour l’instant. Crée ton premier client." : "Aucun client ne correspond aux filtres."}
          </div>
        ) : (
          <>
          <div className="grid gap-3 md:hidden">
            {clientsFiltres.map((client) => (
              <article key={client.id} className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/clients/${client.id}`} className="block truncate font-semibold hover:underline">
                      {nomClient(client)}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-neutral-500">{client.reference_interne}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {statutLabel(client.statut)}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-neutral-500">Type</dt><dd>{typeLabel(client.type)}</dd></div>
                  <div><dt className="text-xs text-neutral-500">Ville</dt><dd>{client.ville ?? "—"}</dd></div>
                </dl>
                <Link href={`/clients/${client.id}`} className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium">
                  Voir la fiche, les devis et les factures
                </Link>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800 md:block">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Réf.</th>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Ville</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {clientsFiltres.map((c) => (
                  <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                    <td className="px-4 py-2 font-mono text-xs text-neutral-500">{c.reference_interne}</td>
                    <td className="px-4 py-2">
                      <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                        {nomClient(c)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{typeLabel(c.type)}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{c.ville ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{statutLabel(c.statut)}</td>
                  </tr>
                ))}
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
