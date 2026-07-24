export type LignePanierClient = { produitId: string; nom: string; prixHt: number; tauxTva: number; quantite: number };

const CLE = "boutique_panier";
export const EVENEMENT_PANIER_MAJ = "boutique-panier-maj";

export function lirePanier(): LignePanierClient[] {
  if (typeof window === "undefined") return [];
  try {
    const valeurs = JSON.parse(window.localStorage.getItem(CLE) ?? "[]");
    return Array.isArray(valeurs) ? valeurs : [];
  } catch {
    return [];
  }
}

function ecrirePanier(lignes: LignePanierClient[]) {
  window.localStorage.setItem(CLE, JSON.stringify(lignes));
  window.dispatchEvent(new Event(EVENEMENT_PANIER_MAJ));
}

export function ajouterAuPanier(produit: { id: string; nom: string; prixHt: number; tauxTva: number }, quantite: number) {
  const lignes = lirePanier();
  const existante = lignes.find((l) => l.produitId === produit.id);
  if (existante) existante.quantite += quantite;
  else lignes.push({ produitId: produit.id, nom: produit.nom, prixHt: produit.prixHt, tauxTva: produit.tauxTva, quantite });
  ecrirePanier(lignes);
}

export function modifierQuantitePanier(produitId: string, quantite: number) {
  if (quantite <= 0) return retirerDuPanier(produitId);
  ecrirePanier(lirePanier().map((l) => (l.produitId === produitId ? { ...l, quantite } : l)));
}

export function retirerDuPanier(produitId: string) {
  ecrirePanier(lirePanier().filter((l) => l.produitId !== produitId));
}

export function viderPanier() {
  ecrirePanier([]);
}
