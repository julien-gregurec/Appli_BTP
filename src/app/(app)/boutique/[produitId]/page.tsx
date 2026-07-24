import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { euros } from "@/lib/devis";
import { AjouterAuPanierBouton } from "@/components/boutique/AjouterAuPanierBouton";

export default async function ProduitBoutiquePage({ params }: { params: Promise<{ produitId: string }> }) {
  const { produitId } = await params;
  const supabase = await createClient();
  const { data: produit } = await supabase
    .from("boutique_produits")
    .select("id,sku,nom,description,categorie,prix_ht,taux_tva,image_url,stock_disponible")
    .eq("id", produitId).eq("actif", true).maybeSingle();
  if (!produit) notFound();

  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/boutique" className="text-sm text-neutral-500 hover:underline">← Boutique</Link>
    <div className="grid gap-6 sm:grid-cols-2">
      {produit.image_url
        ? <img src={produit.image_url} alt={produit.nom} className="w-full rounded-lg object-cover" />
        : <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-neutral-100 text-sm text-neutral-400 dark:bg-neutral-900">Sans photo</div>}
      <div className="space-y-4">
        <div><h1 className="text-xl font-semibold">{produit.nom}</h1><p className="text-xs text-neutral-500">Réf. {produit.sku}</p></div>
        {produit.description && <p className="text-sm text-neutral-600">{produit.description}</p>}
        <div><strong className="font-mono text-2xl">{euros(produit.prix_ht)}</strong><span className="ml-1 text-sm text-neutral-500">HT · TVA {(Number(produit.taux_tva) * 100).toFixed(0)} %</span></div>
        <p className="text-xs text-neutral-500">{produit.stock_disponible > 0 ? `${produit.stock_disponible} en stock` : "Rupture de stock"}</p>
        <AjouterAuPanierBouton produit={{ id: produit.id, nom: produit.nom, prixHt: Number(produit.prix_ht), tauxTva: Number(produit.taux_tva), stockDisponible: produit.stock_disponible }} />
      </div>
    </div>
  </div></main>;
}
