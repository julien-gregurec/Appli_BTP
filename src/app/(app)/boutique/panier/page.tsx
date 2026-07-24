"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { lirePanier, modifierQuantitePanier, retirerDuPanier, viderPanier, EVENEMENT_PANIER_MAJ, type LignePanierClient } from "@/components/boutique/panier";
import { passerCommandeAction } from "@/app/actions/boutique";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

export default function PanierBoutiquePage() {
  const searchParams = useSearchParams();
  const [lignes, setLignes] = useState<LignePanierClient[]>([]);

  useEffect(() => {
    const actualiser = () => setLignes(lirePanier());
    actualiser();
    window.addEventListener(EVENEMENT_PANIER_MAJ, actualiser);
    return () => window.removeEventListener(EVENEMENT_PANIER_MAJ, actualiser);
  }, []);

  const totalHt = lignes.reduce((total, l) => total + l.prixHt * l.quantite, 0);
  const totalTtc = lignes.reduce((total, l) => total + l.prixHt * l.quantite * (1 + l.tauxTva), 0);

  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/boutique" className="text-sm text-neutral-500 hover:underline">← Boutique</Link>
    <h1 className="text-xl font-semibold">Mon panier</h1>
    {searchParams.get("error") && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.get("error")}</p>}

    {!lignes.length && <p className="rounded-md border border-dashed p-6 text-center text-sm text-neutral-500">Votre panier est vide.</p>}

    {lignes.length > 0 && <>
      <div className="divide-y rounded-md border">
        {lignes.map((ligne) => <div key={ligne.produitId} className="flex items-center gap-3 p-3">
          <div className="flex-1"><p className="font-medium">{ligne.nom}</p><p className="text-xs text-neutral-500">{euros(ligne.prixHt)} HT / unité</p></div>
          <input
            type="number" min={1} value={ligne.quantite}
            onChange={(e) => { const q = Math.max(1, Number(e.target.value) || 1); modifierQuantitePanier(ligne.produitId, q); setLignes(lirePanier()); }}
            className="w-20 rounded-md border px-2 py-1 text-sm"
          />
          <button type="button" onClick={() => { retirerDuPanier(ligne.produitId); setLignes(lirePanier()); }} className="text-xs text-red-600 hover:underline">Retirer</button>
        </div>)}
      </div>

      <div className="rounded-md border p-4 text-sm">
        <div className="flex justify-between"><span>Total HT</span><strong className="font-mono">{euros(totalHt)}</strong></div>
        <div className="mt-1 flex justify-between text-neutral-500"><span>Total TTC estimé</span><strong className="font-mono">{euros(totalTtc)}</strong></div>
      </div>

      <form action={passerCommandeAction} onSubmit={() => viderPanier()} className="space-y-3 rounded-md border p-4">
        <input type="hidden" name="panier" value={JSON.stringify(lignes.map((l) => ({ produitId: l.produitId, quantite: l.quantite })))} />
        <h2 className="font-semibold">Livraison</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="nom_destinataire" placeholder="Destinataire" className={input} />
          <input name="telephone" placeholder="Téléphone" className={input} />
          <input name="adresse_livraison" placeholder="Adresse" className={`${input} sm:col-span-2`} />
          <input name="code_postal" placeholder="Code postal" className={input} />
          <input name="ville" placeholder="Ville" className={input} />
        </div>
        <button className="w-full rounded-md bg-[#0d1b2a] px-4 py-3 text-sm font-semibold text-white">Passer commande et payer</button>
      </form>
    </>}
  </div></main>;
}
