export type LigneValoriseeInventaire = {
  quantiteTheorique: number;
  quantiteComptee: number | null;
  prixAchatHt: number;
};

export type SyntheseInventaire = {
  articles: number;
  articlesComptes: number;
  articlesAvecEcart: number;
  quantiteManquante: number;
  quantiteExcedentaire: number;
  valeurTheoriqueHt: number;
  valeurCompteeHt: number;
  ecartValeurHt: number;
};

const arrondiMonetaire = (valeur: number) => Math.round((valeur + Number.EPSILON) * 100) / 100;

export function calculerSyntheseInventaire(lignes: LigneValoriseeInventaire[]): SyntheseInventaire {
  const synthese: SyntheseInventaire = {
    articles: lignes.length,
    articlesComptes: 0,
    articlesAvecEcart: 0,
    quantiteManquante: 0,
    quantiteExcedentaire: 0,
    valeurTheoriqueHt: 0,
    valeurCompteeHt: 0,
    ecartValeurHt: 0,
  };

  for (const ligne of lignes) {
    const theorique = Number(ligne.quantiteTheorique) || 0;
    const prix = Number(ligne.prixAchatHt) || 0;
    const compte = ligne.quantiteComptee === null ? null : Number(ligne.quantiteComptee) || 0;
    synthese.valeurTheoriqueHt += theorique * prix;
    if (compte === null) continue;
    synthese.articlesComptes += 1;
    synthese.valeurCompteeHt += compte * prix;
    const ecart = compte - theorique;
    if (Math.abs(ecart) > 0.00001) synthese.articlesAvecEcart += 1;
    if (ecart < 0) synthese.quantiteManquante += Math.abs(ecart);
    if (ecart > 0) synthese.quantiteExcedentaire += ecart;
  }

  synthese.valeurTheoriqueHt = arrondiMonetaire(synthese.valeurTheoriqueHt);
  synthese.valeurCompteeHt = arrondiMonetaire(synthese.valeurCompteeHt);
  synthese.ecartValeurHt = arrondiMonetaire(synthese.valeurCompteeHt - synthese.valeurTheoriqueHt);
  return synthese;
}
