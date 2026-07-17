import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { statutCommande } from "@/lib/commandes";
import { Lien as Link } from "@/components/Lien";

export default async function CommandesPage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: commandes } = await supabase
    .from("commandes_fournisseurs")
    .select("id, numero, statut, date_commande, montant_ttc, fournisseur:fournisseurs(nom), chantier:chantiers(nom)")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("date_commande", { ascending: false });

  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Commandes fournisseurs</h1>
            <p className="text-sm text-neutral-500">Bons de commande matériel et sous-traitance.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/fournisseurs" className="text-sm text-neutral-500 hover:underline">Fournisseurs</Link>
            <Link href="/commandes/nouveau" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
              Nouvelle commande
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Fournisseur</th>
                <th className="px-3 py-2 font-medium">Chantier</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 text-right font-medium">Montant TTC</th>
              </tr>
            </thead>
            <tbody>
              {(commandes ?? []).map((c) => {
                const st = statutCommande(c.statut);
                const fournisseur = un(c.fournisseur as { nom: string } | { nom: string }[] | null);
                const chantier = un(c.chantier as { nom: string } | { nom: string }[] | null);
                return (
                  <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/50">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/commandes/${c.id}`} className="hover:underline">{c.numero}</Link>
                    </td>
                    <td className="px-3 py-2">{fournisseur?.nom ?? "—"}</td>
                    <td className="px-3 py-2 text-neutral-500">{chantier?.nom ?? "—"}</td>
                    <td className="px-3 py-2 text-neutral-500">{c.date_commande}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />{st.libelle}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{euros(c.montant_ttc)}</td>
                  </tr>
                );
              })}
              {(!commandes || commandes.length === 0) && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-neutral-500">Aucune commande. Créez-en une pour commencer.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
