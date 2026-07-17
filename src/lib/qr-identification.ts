export type TypeRessourceQr = "employe" | "article" | "chantier" | "vehicule" | "outil";
export type CibleScanQr = TypeRessourceQr | "auto";

const PREFIXES: Array<{ prefixe: string; type: TypeRessourceQr }> = [
  { prefixe: "LGP-EMP-", type: "employe" },
  { prefixe: "LGP-ART-", type: "article" },
  { prefixe: "LGP-CH-", type: "chantier" },
  { prefixe: "LGP-VEH-", type: "vehicule" },
  { prefixe: "LGP-OUT-", type: "outil" },
];

export function classifierCodeScanne(codeBrut: string, cible: CibleScanQr = "auto"): TypeRessourceQr {
  const code = codeBrut.trim().toUpperCase();
  const reconnu = PREFIXES.find(({ prefixe }) => code.startsWith(prefixe));
  if (reconnu) return reconnu.type;
  // Un EAN, un code-barres fournisseur ou une référence sans préfixe LGP est un article.
  if (cible === "auto") return "article";
  return cible;
}

export function libelleTypeQr(type: TypeRessourceQr): string {
  return ({ employe: "salarié", article: "article", chantier: "chantier", vehicule: "véhicule", outil: "outil / matériel" })[type];
}
