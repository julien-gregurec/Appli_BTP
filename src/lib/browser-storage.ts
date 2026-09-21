export type StockageNavigateur = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function lireEtMigrerCleStockage(
  stockage: StockageNavigateur,
  nouvelleCle: string,
  ancienneCle: string,
): string | null {
  const valeurActuelle = stockage.getItem(nouvelleCle);
  if (valeurActuelle !== null) return valeurActuelle;

  const valeurHistorique = stockage.getItem(ancienneCle);
  if (valeurHistorique === null) return null;

  try {
    stockage.setItem(nouvelleCle, valeurHistorique);
    if (stockage.getItem(nouvelleCle) === valeurHistorique) {
      stockage.removeItem(ancienneCle);
    }
  } catch {
    return valeurHistorique;
  }

  return valeurHistorique;
}
