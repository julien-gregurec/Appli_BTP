export type TypeRessourceQr = "employe" | "article" | "chantier" | "vehicule" | "outil";
export type CibleScanQr = TypeRessourceQr | "auto";

// "ancien" = préfixe LGP (marque Liria) encore présent sur les étiquettes physiques
// imprimées avant le renommage ; "actuel" = préfixe ELS (marque ELSATIA) désormais
// généré et stocké en base. Les deux formes doivent être reconnues à la lecture.
const PREFIXES: Array<{ ancien: string; actuel: string; type: TypeRessourceQr }> = [
  { ancien: "LGP-EMP-", actuel: "ELS-EMP-", type: "employe" },
  { ancien: "LGP-ART-", actuel: "ELS-ART-", type: "article" },
  { ancien: "LGP-CH-", actuel: "ELS-CH-", type: "chantier" },
  { ancien: "LGP-VEH-", actuel: "ELS-VEH-", type: "vehicule" },
  { ancien: "LGP-OUT-", actuel: "ELS-OUT-", type: "outil" },
];

function trouverPrefixe(codeBrut: string) {
  const code = codeBrut.trim().toUpperCase();
  return PREFIXES.find(({ ancien, actuel }) => code.startsWith(ancien) || code.startsWith(actuel));
}

export function classifierCodeScanne(codeBrut: string, cible: CibleScanQr = "auto"): TypeRessourceQr {
  const reconnu = trouverPrefixe(codeBrut);
  if (reconnu) return reconnu.type;
  // Un EAN, un code-barres fournisseur ou une référence sans préfixe LGP/ELS est un article.
  if (cible === "auto") return "article";
  return cible;
}

// Une étiquette imprimée avant la migration de préfixe reste au format LGP-* alors que la
// base ne stocke désormais que des codes ELS-*. Convertir systématiquement le code scanné
// vers sa forme actuelle avant toute recherche permet à ces étiquettes de continuer à
// fonctionner sans réimpression. Sans préfixe reconnu, le code est renvoyé inchangé (EAN,
// code-barres fournisseur, référence article, identifiant salarié personnel…).
export function normaliserCodeIdentification(codeBrut: string): string {
  const code = codeBrut.trim().toUpperCase();
  const reconnu = PREFIXES.find(({ ancien }) => code.startsWith(ancien));
  return reconnu ? reconnu.actuel + code.slice(reconnu.ancien.length) : code;
}

export function libelleTypeQr(type: TypeRessourceQr): string {
  return ({ employe: "salarié", article: "article", chantier: "chantier", vehicule: "véhicule", outil: "outil / matériel" })[type];
}
