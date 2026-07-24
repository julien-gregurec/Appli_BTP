"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ajouterAuPanier } from "@/components/boutique/panier";

export function AjouterAuPanierBouton({ produit }: { produit: { id: string; nom: string; prixHt: number; tauxTva: number; stockDisponible: number } }) {
  const [quantite, setQuantite] = useState(1);
  const router = useRouter();
  const rupture = produit.stockDisponible <= 0;
  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        min={1}
        max={produit.stockDisponible}
        value={quantite}
        onChange={(e) => setQuantite(Math.max(1, Math.min(produit.stockDisponible, Number(e.target.value) || 1)))}
        disabled={rupture}
        className="w-20 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="button"
        disabled={rupture}
        onClick={() => {
          ajouterAuPanier({ id: produit.id, nom: produit.nom, prixHt: produit.prixHt, tauxTva: produit.tauxTva }, quantite);
          router.push("/boutique/panier");
        }}
        className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {rupture ? "Rupture de stock" : "Ajouter au panier"}
      </button>
    </div>
  );
}
