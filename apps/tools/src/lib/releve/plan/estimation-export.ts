/**
 * Lot 10 — Préparation des pièces jointes du contrat `elsatia.tools.estimation` : photos (références de stockage,
 * légende, pièce) et annotations (texte, forme, pièce, cible). Aucun octet n'est copié : Gestion Pro relira les
 * fichiers par leur chemin de stockage.
 */
import type { EstimationGpAnnotation, EstimationGpPhoto, PhotoMedia, ReleveElement } from "@elsatia/releve-domain";

type AnyAncre = { kind: string; ref?: { kind: string; id: string } };
const pieceDe = (element: ReleveElement): string | null => {
  if (element.pieceId) return element.pieceId as string;
  const ancre = (element.donnees as { ancre?: AnyAncre }).ancre;
  return ancre?.kind === "entite" && ancre.ref?.kind === "piece" ? ancre.ref.id : null;
};

export function estimationPiecesJointes(medias: readonly PhotoMedia[], elements: readonly ReleveElement[]): { photos: EstimationGpPhoto[]; annotations: EstimationGpAnnotation[] } {
  const ancres = new Map<string, ReleveElement>();
  for (const element of elements) {
    if (element.type !== "photo_anchor") continue;
    const mediaId = (element.donnees as { mediaId?: string }).mediaId;
    if (mediaId && !ancres.has(mediaId)) ancres.set(mediaId, element);
  }
  const photos = medias.filter((m) => !m.deletedAt).map((m) => {
    const ancre = ancres.get(m.id as string);
    const legende = (ancre?.donnees as { legende?: string | null } | undefined)?.legende ?? m.commentaire ?? null;
    return {
      ref: m.id as string, storagePath: m.storagePath, mimeType: m.mimeType, legende, pieceRef: ancre ? pieceDe(ancre) : null,
      etatDocumente: m.etatDocumente ?? null, priseLe: (m.metadata as { priseLe?: string | null }).priseLe ?? null,
    };
  });
  const annotations = elements.filter((e) => e.type === "annotation").map((e) => {
    const d = e.donnees as { texte?: string; forme?: string; ancre?: AnyAncre };
    return {
      ref: e.id as string, texte: d.texte ?? "", forme: d.forme ?? "texte", pieceRef: pieceDe(e),
      cible: d.ancre?.kind === "entite" && d.ancre.ref ? { kind: d.ancre.ref.kind, ref: d.ancre.ref.id } : null,
    };
  });
  return { photos, annotations };
}
