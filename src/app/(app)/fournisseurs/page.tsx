import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { creerFournisseurAction, changerActivationFournisseurAction } from "@/app/actions/commandes";
import { Lien as Link } from "@/components/Lien";
import { DELAIS_PAIEMENT_FOURNISSEUR, libelleDelaiPaiementFournisseur } from "@/lib/echeances-fournisseurs";

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function FournisseursPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: fournisseurs } = await supabase
    .from("fournisseurs")
    .select("id, reference, nom, contact_nom, email, telephone, ville, actif")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("nom");

  return (
    <main className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Fournisseurs</h1>
            <p className="text-sm text-neutral-500">Carnet des fournisseurs et sous-traitants matériels.</p>
          </div>
          <div className="flex items-center gap-2"><Link href="/connecteurs" className="rounded-md border px-3 py-2 text-sm font-medium">Connecter mes comptes</Link><Link href="/commandes" className="text-sm text-neutral-500 hover:underline">Commandes →</Link></div>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <form action={creerFournisseurAction} className="space-y-3 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/50">
          <div className="text-sm font-medium">Nouveau fournisseur</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <input name="nom" placeholder="Nom / raison sociale *" className={input} required />
            <input name="contact_nom" placeholder="Contact" className={input} />
            <input name="telephone" placeholder="Téléphone" className={input} />
            <input name="email" placeholder="Email" className={input} />
            <input name="ville" placeholder="Ville" className={input} />
            <input name="siret" placeholder="SIRET" className={input} />
            <select name="delai_paiement_jours" defaultValue="30" className={input}>{DELAIS_PAIEMENT_FOURNISSEUR.map((delai) => <option key={delai} value={delai}>{libelleDelaiPaiementFournisseur(delai)}</option>)}</select>
          </div>
          <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            Ajouter le fournisseur
          </button>
        </form>

        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Réf.</th>
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Ville</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(fournisseurs ?? []).map((f) => (
                <tr key={f.id} className={`border-t border-neutral-100 dark:border-neutral-800 ${!f.actif ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{f.reference}</td>
                  <td className="px-3 py-2">
                    <Link href={`/fournisseurs/${f.id}`} className="font-medium hover:underline">{f.nom}</Link>
                    {f.email && <div className="text-xs text-neutral-500">{f.email}</div>}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">
                    {f.contact_nom || "—"}
                    {f.telephone && <div className="text-xs text-neutral-500">{f.telephone}</div>}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">{f.ville || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-3"><Link href={`/fournisseurs/${f.id}`} className="text-xs text-blue-700 hover:underline">Gérer</Link><form action={changerActivationFournisseurAction.bind(null, f.id, !f.actif)}>
                      <button type="submit" className="text-xs text-neutral-400 hover:underline">
                        {f.actif ? "Désactiver" : "Réactiver"}
                      </button>
                    </form></div>
                  </td>
                </tr>
              ))}
              {(!fournisseurs || fournisseurs.length === 0) && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-neutral-500">Aucun fournisseur pour l’instant.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
