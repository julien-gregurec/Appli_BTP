import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { CHANTIER_STATUTS, statutChantier, nomClient } from "@/lib/chantier-statuts";
import { permissionsUtilisateur } from "@/lib/permissions";
import { Lien as Link } from "@/components/Lien";

export default async function ChantiersPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; error?: string }> }) {
  const { q = "", statut = "", error } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_chantiers");
  const vueChantiersAffectes = permissions !== null
    && !permissions.includes("acces_chantiers")
    && permissions.includes("voir_chantiers_assignes");

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
            {chantiers?.length ? "Aucun chantier ne correspond aux filtres." : "Aucun chantier pour l’instant."}
          </div>
        ) : (
          <>
          <div className="grid gap-3 md:hidden">
            {chantiersFiltres.map((chantier) => {
              const st = statutChantier(chantier.statut);
              const client = Array.isArray(chantier.client) ? chantier.client[0] : chantier.client;
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
                    <div><dt className="text-xs text-neutral-500">Client</dt><dd className="font-medium">{client ? nomClient(client) : "—"}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Ville</dt><dd>{chantier.ville ?? "—"}</dd></div>
                  </dl>
                  <Link href={`/chantiers/${chantier.id}`} className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium">
                    Voir le chantier et son suivi
                  </Link>
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
          </>
        )}
      </div>
    </main>
  );
}
