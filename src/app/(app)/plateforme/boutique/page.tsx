import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { creerProduitBoutiqueAction, modifierProduitBoutiqueAction } from "@/app/actions/boutique";

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const CATEGORIES = [
  ["imprimante_code_barres", "Imprimante code-barres/QR"],
  ["plastifieuse", "Plastifieuse"],
  ["consommable_plastification", "Consommable de plastification"],
  ["etiquette_aimantee", "Étiquette aimantée"],
] as const;

type Produit = { id: string; sku: string; nom: string; categorie: string; prix_ht: number; stock_disponible: number; seuil_alerte_stock: number; actif: boolean };

export default async function PlateformeBoutiquePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  if (!(await estPlateformeAdmin())) notFound();
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("boutique_produits")
    .select("id,sku,nom,categorie,prix_ht,stock_disponible,seuil_alerte_stock,actif")
    .order("categorie").order("nom");
  const produits = (data ?? []) as Produit[];

  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-xl font-semibold">Catalogue boutique Liria</h1><p className="text-sm text-neutral-500">Gestion réservée à la plateforme : produits, prix et stock vendus aux entreprises clientes.</p></div>
    {params.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}
    {params.success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{params.success}</p>}

    <form action={creerProduitBoutiqueAction} className="grid gap-3 rounded-md border p-4 sm:grid-cols-3">
      <h2 className="font-semibold sm:col-span-3">Nouveau produit</h2>
      <input name="sku" required placeholder="Référence (SKU)" className={input} />
      <input name="nom" required placeholder="Nom" className={`${input} sm:col-span-2`} />
      <select name="categorie" required className={input}>{CATEGORIES.map(([cle, label]) => <option key={cle} value={cle}>{label}</option>)}</select>
      <input name="prix_ht" type="number" min="0" step="0.01" required placeholder="Prix HT" className={input} />
      <input name="taux_tva" type="number" min="0" max="1" step="0.001" defaultValue="0.20" placeholder="Taux TVA" className={input} />
      <input name="stock_disponible" type="number" min="0" step="1" defaultValue="0" placeholder="Stock" className={input} />
      <input name="seuil_alerte_stock" type="number" min="0" step="1" defaultValue="0" placeholder="Seuil d’alerte" className={input} />
      <input name="image_url" placeholder="URL image (facultatif)" className={`${input} sm:col-span-2`} />
      <input name="description" placeholder="Description (facultatif)" className={`${input} sm:col-span-3`} />
      <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white sm:col-span-3">Créer le produit</button>
    </form>

    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="px-3 py-2">Produit</th><th>Catégorie</th><th className="text-right">Prix HT</th><th className="text-right">Stock</th><th className="text-right">Seuil</th><th>Actif</th><th></th></tr></thead>
        <tbody>
          {produits.map((produit) => <tr key={produit.id} className="border-t">
            <td className="px-3 py-2"><p className="font-medium">{produit.nom}</p><p className="text-xs text-neutral-400">{produit.sku}</p></td>
            <td>{CATEGORIES.find(([cle]) => cle === produit.categorie)?.[1] ?? produit.categorie}</td>
            <td colSpan={5} className="p-0">
              <form action={modifierProduitBoutiqueAction.bind(null, produit.id)} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <input name="prix_ht" type="number" min="0" step="0.01" defaultValue={produit.prix_ht} className={`${input} w-24`} />
                <input name="stock_disponible" type="number" min="0" step="1" defaultValue={produit.stock_disponible} className={`${input} w-20`} />
                <input name="seuil_alerte_stock" type="number" min="0" step="1" defaultValue={produit.seuil_alerte_stock} className={`${input} w-20`} />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="actif" defaultChecked={produit.actif} /> Actif</label>
                <button className="rounded-md border px-3 py-1.5 text-xs font-medium">Enregistrer</button>
              </form>
            </td>
          </tr>)}
          {!produits.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-neutral-500">Aucun produit dans le catalogue.</td></tr>}
        </tbody>
      </table>
    </div>
  </div></main>;
}
