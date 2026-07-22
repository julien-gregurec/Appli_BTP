import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { CHANTIER_STATUTS, statutChantier, nomClient } from "@/lib/chantier-statuts";
import { permissionsUtilisateur } from "@/lib/permissions";
import { Lien as Link } from "@/components/Lien";

const TAILLE_PAGE = 25;

type LigneChantier = {
  id: string; reference_interne: string | null; nom: string; ville: string | null; statut: string;
  client_nom: string | null; client_prenom: string | null; client_societe: string | null;
};

export default async function ChantiersPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; error?: string; page?: string }> }) {
  const { q = "", statut = "", error, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_chantiers");
  const vueChantiersAffectes = permissions !== null
    && !permissions.includes("acces_chantiers")
    && permissions.includes("voir_chantiers_assignes");

  const { data } = await supabase.rpc("chantiers_liste_paginee", {
    p_entreprise_id: ctx.entrepriseId, p_recherche: q, p_statut: statut, p_page: page, p_taille: TAILLE_PAGE,
  });
  const resultat = (data ?? {}) as { lignes?: LigneChantier[]; total?: number; pages?: number };
  const chantiersFiltres = resultat.lignes ?? [];
  const total = resultat.total ?? 0;
  const nbPages = resultat.pages ?? 1;

  const parametresPage = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (statut) sp.set("statut", statut);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/chantiers?${s}` : "/chantiers";
  };

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Chantiers</h1>
            <p className="text-sm text-neutral-500">{total} chantier(s) correspondant(s){nbPages > 1 ? ` — page ${page}/${nbPages}` : ""}</p>
          </div>
          {peutGerer&&<Link href="/chantiers/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            + Nouveau chantier
          </Link>}
        </div>

        {error&&<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {vueChantiersAffectes&&<p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Votre poste affiche uniquement les chantiers auxquels vous êtes affecté. L’administrateur peut modifier ce choix dans les droits du poste.</p>}

        <form method="get" className="flex flex-wrap gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <input name="q" defaultValue={q} placeholder="Référence, chantier, client ou ville" className="min-w-64 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <select name="statut" defaultValue={statut} className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"><option value="">Tous les statuts</option>{CHANTIER_STATUTS.map((option) => <option key={option.cle} value={option.cle}>{option.libelle}</option>)}</select>
          <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-200 dark:text-neutral-900">Filtrer</button>
          {(q || statut) && <Link href="/chantiers" className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">Réinitialiser</Link>}
        </form>

        {chantiersFiltres.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {total === 0 && !q && !statut ? "Aucun chantier pour l’instant." : "Aucun chantier ne correspond aux filtres."}
          </div>
        ) : (
          <>
          <div className="grid gap-3 md:hidden">
            {chantiersFiltres.map((chantier) => {
              const st = statutChantier(chantier.statut);
              const client = { nom: chantier.client_nom, prenom: chantier.client_prenom, societe: chantier.client_societe };
              return (
                <article key={chantier.id} className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/chantiers/${chantier.id}`} className="block truncate font-semibold hover:underline">{chantier.nom}</Link>
                      <p className="mt-0.5 font-mono text-xs text-neutral-500">{chantier.reference_interne}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium dark:bg-neutral-800">
                      <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />{st.libelle}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-neutral-500">Client</dt><dd className="font-medium">{chantier.client_nom || chantier.client_societe ? nomClient(client) : "—"}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Ville</dt><dd>{chantier.ville ?? "—"}</dd></div>
                  </dl>
                  <div className="flex gap-2">
                    <Link href={`/chantiers/${chantier.id}`} className="inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium">
                      Voir le chantier et son suivi
                    </Link>
                    {peutGerer && <Link href={`/chantiers/${chantier.id}/localisation`} className="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium" title="Position GPS (suivi de zone)">📍</Link>}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800 md:block">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Réf.</th>
                  <th className="px-4 py-2 font-medium">Chantier</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  {peutGerer && <th className="px-4 py-2 font-medium">GPS</th>}
                </tr>
              </thead>
              <tbody>
                {chantiersFiltres.map((ch) => {
                  const st = statutChantier(ch.statut);
                  const client = { nom: ch.client_nom, prenom: ch.client_prenom, societe: ch.client_societe };
                  return (
                    <tr key={ch.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">{ch.reference_interne}</td>
                      <td className="px-4 py-2">
                        <Link href={`/chantiers/${ch.id}`} className="font-medium hover:underline">{ch.nom}</Link>
                        {ch.ville && <span className="ml-2 text-xs text-neutral-500">{ch.ville}</span>}
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{ch.client_nom || ch.client_societe ? nomClient(client) : "—"}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />
                          {st.libelle}
                        </span>
                      </td>
                      {peutGerer && <td className="px-4 py-2"><Link href={`/chantiers/${ch.id}/localisation`} className="text-xs text-blue-700 hover:underline">📍 Position</Link></td>}
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
