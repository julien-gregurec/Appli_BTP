/**
 * Import générique « Stock et codes-barres » (ELSATIA-STOCK-PRIX-CONFIDENTIALITE-COLONNES-V1, D2).
 *
 * Les lignes partent vers la RPC contrôlée `importer_articles_stock` (jamais un upsert
 * PostgREST, qui relirait les prix via EXCLUDED et échouerait en 42501). Règles :
 *   * colonnes de prix mappées sans `gerer_prix_stock` → refus explicite de TOUT l'import,
 *     avant toute écriture ;
 *   * cellule de prix vide → clé absente : le prix existant reste inchangé (jamais 0) ;
 *   * prix illisible ou négatif → ligne refusée avec un message, jamais ramenée à 0.
 */

export type LigneImportStock = {
  reference: string;
  designation: string;
  unite?: string;
  seuil_alerte?: number;
  quantite?: number;
  emplacement?: string;
  marque?: string;
  code_barres?: string;
  prix_achat_ht?: number;
  prix_vente_ht?: number;
};

export const CHAMPS_TARIFAIRES_STOCK = ["prix_achat_ht", "prix_vente_ht"] as const;

export const MESSAGE_IMPORT_PRIX_REFUSE =
  "Import refusé : les colonnes « Prix d’achat HT » et « Prix de vente HT » exigent la permission « Gérer les prix du stock ». Retirez-les de la correspondance ou demandez cette permission. Aucun article n’a été modifié.";
export const MESSAGE_IMPORT_STOCK_REFUSE =
  "Import refusé : l’import du stock exige la permission « Gérer le stock ». Aucun article n’a été modifié.";

export function peutGererPrixStock(permissions: string[] | null): boolean {
  return permissions === null || permissions.includes("gerer_prix_stock");
}

export function champsTarifairesMappes(mapping: Record<string, number>): string[] {
  return CHAMPS_TARIFAIRES_STOCK.filter((cle) => (mapping[cle] ?? -1) >= 0);
}

function nombre(valeur: string): number | null {
  const n = Number(valeur.replace(/\s/g, "").replace("€", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function construireLignesImportStock({
  lignes,
  mapping,
  peutGererPrix,
}: {
  lignes: string[][];
  mapping: Record<string, number>;
  peutGererPrix: boolean;
}): { lignes: LigneImportStock[]; ignores: number; erreurs: string[]; refus: string | null } {
  if (champsTarifairesMappes(mapping).length > 0 && !peutGererPrix) {
    return { lignes: [], ignores: lignes.length, erreurs: [], refus: MESSAGE_IMPORT_PRIX_REFUSE };
  }

  const val = (ligne: string[], cle: string) => {
    const idx = mapping[cle];
    return idx === undefined || idx < 0 ? "" : String(ligne[idx] ?? "").trim();
  };
  const resultat: LigneImportStock[] = [];
  const erreurs: string[] = [];
  let ignores = 0;

  for (const [i, l] of lignes.entries()) {
    const numero = i + 2; // ligne 1 = intitulés de colonnes
    const reference = val(l, "reference");
    const designation = val(l, "designation");
    if (!reference || !designation) { ignores++; continue; }
    const ligne: LigneImportStock = { reference, designation };

    let refusee = false;
    for (const cle of CHAMPS_TARIFAIRES_STOCK) {
      const brut = val(l, cle);
      if (!brut) continue; // vide : prix existant inchangé
      const prix = nombre(brut);
      if (prix === null) { erreurs.push(`Ligne ${numero} (${reference}) : prix illisible « ${brut} », ligne ignorée.`); refusee = true; break; }
      if (prix < 0) { erreurs.push(`Ligne ${numero} (${reference}) : prix négatif refusé, ligne ignorée.`); refusee = true; break; }
      ligne[cle] = prix;
    }
    const quantiteBrute = val(l, "quantite_stock");
    if (!refusee && quantiteBrute) {
      const quantite = nombre(quantiteBrute);
      if (quantite === null) { erreurs.push(`Ligne ${numero} (${reference}) : quantité illisible « ${quantiteBrute} », ligne ignorée.`); refusee = true; }
      else ligne.quantite = quantite;
    }
    if (refusee) { ignores++; continue; }

    const seuil = nombre(val(l, "seuil_alerte"));
    if (val(l, "seuil_alerte") && seuil !== null) ligne.seuil_alerte = Math.max(0, seuil);
    for (const cle of ["unite", "emplacement", "marque", "code_barres"] as const) {
      const texte = val(l, cle);
      if (texte) ligne[cle] = texte;
    }
    resultat.push(ligne);
  }
  return { lignes: resultat, ignores, erreurs, refus: null };
}

/**
 * Message explicite pour les refus connus de `importer_articles_stock` ; `null` pour une
 * erreur inattendue, que l'appelant journalise et remplace par un repli générique.
 */
export function messageErreurImportStock(erreur: { code?: string | null; message?: string | null }): string | null {
  if (erreur.code === "42501") return MESSAGE_IMPORT_PRIX_REFUSE;
  if (erreur.message === "Accès refusé") return MESSAGE_IMPORT_STOCK_REFUSE;
  if (erreur.code === "22023" && erreur.message?.startsWith("Prix négatif")) return `${erreur.message} : aucune ligne de ce lot n’a été enregistrée.`;
  return null;
}
