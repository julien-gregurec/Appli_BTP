import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { euros } from "@/lib/devis";
import { BRAND_NAME } from "@/lib/brand";

type Produit = { id: string; sku: string; nom: string; description: string | null; categorie: string; prix_ht: number; taux_tva: number; image_url: string | null; stock_disponible: number };

const LABEL_CATEGORIE: Record<string, string> = {
  imprimante_code_barres: "Imprimantes codes-barres & QR",
  plastifieuse: "Plastifieuses",
  consommable_plastification: "Consommables de plastification",
  etiquette_aimantee: "Étiquettes aimantées",
};
const ORDRE_CATEGORIE = Object.keys(LABEL_CATEGORIE);

export default async function BoutiquePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("boutique_produits")
    .select("id,sku,nom,description,categorie,prix_ht,taux_tva,image_url,stock_disponible")
    .eq("actif", true)
    .order("nom");
  const produits = (data ?? []) as Produit[];
  const parCategorie = ORDRE_CATEGORIE
    .map((categorie) => ({ categorie, produits: produits.filter((p) => p.categorie === categorie) }))
    .filter((groupe) => groupe.produits.length > 0);

  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Boutique {BRAND_NAME}</h1><p className="text-sm text-neutral-500">Imprimantes codes-barres/QR, plastifieuses et étiquettes aimantées, livrées par {BRAND_NAME}.</p></div>
      <Link href="/boutique/panier" className="rounded-md border px-4 py-2 text-sm font-medium">Voir mon panier</Link>
    </div>
    {params.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}
    {params.success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{params.success}</p>}

    {!parCategorie.length && <p className="rounded-md border border-dashed p-6 text-center text-sm text-neutral-500">Aucun produit disponible pour le moment.</p>}

    {parCategorie.map((groupe) => <section key={groupe.categorie} className="space-y-3">
      <h2 className="font-semibold">{LABEL_CATEGORIE[groupe.categorie]}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groupe.produits.map((produit) => <Link key={produit.id} href={`/boutique/${produit.id}`} className="block space-y-2 rounded-lg border p-4 hover:border-[#c9a24a]">
          {produit.image_url
            ? <img src={produit.image_url} alt={produit.nom} className="h-32 w-full rounded-md object-cover" />
            : <div className="flex h-32 w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-900">Sans photo</div>}
          <p className="font-medium">{produit.nom}</p>
          {produit.description && <p className="line-clamp-2 text-xs text-neutral-500">{produit.description}</p>}
          <div className="flex items-center justify-between"><strong className="font-mono">{euros(produit.prix_ht)} HT</strong>{produit.stock_disponible <= 0 && <span className="text-xs font-medium text-red-600">Rupture</span>}</div>
        </Link>)}
      </div>
    </section>)}
  </div></main>;
}
