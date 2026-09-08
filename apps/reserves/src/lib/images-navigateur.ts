import { COTE_MAX_PHOTO, QUALITE_PHOTO, dimensionsCompressees } from "./images";

/**
 * Compression d'une photo de chantier, côté navigateur.
 *
 * Extraite de `ChampPhoto` pour être partagée avec la saisie HORS LIGNE, qui ne
 * l'appliquait pas. L'écart était double, et les deux moitiés comptent :
 *
 *   • VOLUME. Une photo d'iPhone brute pèse 8 à 20 Mo. La file hors-ligne la conservait
 *     telle quelle dans IndexedDB, puis la renvoyait telle quelle. Vingt constats dans un
 *     sous-sol suffisaient à saturer le quota du navigateur — le message d'échec arrivant
 *     après que l'utilisateur a cru enregistrer — et le retour au réseau imposait de
 *     téléverser des centaines de mégaoctets sur le lien le plus fragile du parcours.
 *
 *   • MÉTADONNÉES. Le passage par un canvas ne recopie que les PIXELS : les métadonnées
 *     EXIF — au premier rang desquelles les coordonnées GPS, que les téléphones inscrivent
 *     par défaut — ne survivent pas. Le chemin en ligne les retirait donc déjà, sans que
 *     ce soit dit ; le chemin hors ligne, lui, les téléversait intactes. La position
 *     précise du porteur du téléphone finissait ainsi dans le bucket, à disposition de
 *     l'organisation hôte, alors qu'aucun écran ne la demande ni ne l'affiche.
 *
 * L'orientation est traitée par `createImageBitmap({ imageOrientation: "from-image" })` :
 * sans cela, retirer l'EXIF coucherait les photos prises en portrait.
 *
 * En cas d'échec (navigateur sans `createImageBitmap`, image illisible), on rend le
 * fichier d'origine : refuser une preuve prise sur le terrain serait pire que l'envoyer
 * lourde. Le serveur la validera de toute façon.
 */
export async function compresserPhoto(fichier: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
    const { largeur, hauteur } = dimensionsCompressees(
      bitmap.width, bitmap.height, COTE_MAX_PHOTO,
    );
    const toile = document.createElement("canvas");
    toile.width = largeur;
    toile.height = hauteur;
    const ctx = toile.getContext("2d");
    if (!ctx) { bitmap.close(); return fichier; }
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resoudre) =>
      toile.toBlob(resoudre, "image/jpeg", QUALITE_PHOTO),
    );
    if (!blob) return fichier;
    const base = fichier.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return fichier;
  }
}
