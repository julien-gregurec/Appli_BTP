export type ChampOcr = { valeur: string; confiance: number | null };
export type PropositionOcrColors = { statut:"a_confirmer"; champs: Partial<Record<"marque"|"produit"|"reference"|"teinte"|"teinteReference"|"volumeNominal",ChampOcr>> };
export interface FournisseurOcrColors { analyser(image:{mime:string;bytes:Uint8Array}):Promise<PropositionOcrColors>; }
export async function analyserEtiquetteColors(fournisseur:FournisseurOcrColors,image:{mime:string;bytes:Uint8Array}){
  if(!["image/jpeg","image/png","image/webp"].includes(image.mime))throw new Error("Format OCR non pris en charge");
  if(!image.bytes.length)throw new Error("Image vide");
  const resultat=await fournisseur.analyser(image);
  return {...resultat,statut:"a_confirmer" as const};
}
