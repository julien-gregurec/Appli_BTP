// Module partagé navigateur/serveur : aucune dépendance Node.
import type { Reseau } from "@/lib/social/types";

// Règles de contenu par réseau (limites documentées par les plateformes).
export const LIMITES = {
  facebook: { caracteres: 63206, medias: 10 },
  instagram: { caracteres: 2200, hashtags: 30, mentions: 20, medias: 10 },
  linkedin: { caracteres: 3000, medias: 20 },
} as const;

export type MediaResume = {
  type: "image" | "video";
  mimeType: string;
  tailleOctets: number;
  largeur: number | null;
  hauteur: number | null;
  dureeSecondes: number | null;
};

export function compterHashtags(texte: string) {
  return (texte.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function compterMentions(texte: string) {
  return (texte.match(/(^|\s)@[\w.]+/g) ?? []).length;
}

// Longueur perçue par les plateformes (points de code, pas unités UTF-16).
export function longueur(texte: string) {
  return [...texte].length;
}

export function validerContenu(
  reseau: Reseau,
  contenu: { texte: string; lienUrl: string | null; medias: MediaResume[] },
): { erreurs: string[]; avertissements: string[] } {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const { texte, medias } = contenu;
  const images = medias.filter((m) => m.type === "image");
  const videos = medias.filter((m) => m.type === "video");

  if (!texte.trim() && medias.length === 0) erreurs.push("Texte ou média obligatoire.");
  if (longueur(texte) > LIMITES[reseau].caracteres) erreurs.push(`Texte trop long : ${longueur(texte)} / ${LIMITES[reseau].caracteres} caractères.`);
  if (medias.length > LIMITES[reseau].medias) erreurs.push(`Trop de médias : ${medias.length} / ${LIMITES[reseau].medias}.`);
  if (videos.length > 1) erreurs.push("Une seule vidéo par publication.");
  if (videos.length === 1 && images.length > 0) erreurs.push("Combiner images et vidéo dans une même publication n’est pas pris en charge en V1.");
  if (images.length > 1) erreurs.push("Plusieurs images (carrousel) : prévu en V2, une seule image en V1.");

  if (reseau === "instagram") {
    if (medias.length === 0) erreurs.push("Instagram exige une image ou une vidéo : les publications texte seul n’existent pas.");
    if (compterHashtags(texte) > LIMITES.instagram.hashtags) erreurs.push(`Instagram limite à ${LIMITES.instagram.hashtags} hashtags.`);
    if (compterMentions(texte) > LIMITES.instagram.mentions) erreurs.push(`Instagram limite à ${LIMITES.instagram.mentions} mentions.`);
    if (contenu.lienUrl) avertissements.push("Les liens ne sont pas cliquables dans une légende Instagram.");
    for (const image of images) {
      if (image.mimeType !== "image/jpeg") erreurs.push("Instagram n’accepte que le JPEG (conversion automatique au téléversement).");
      if (image.tailleOctets > 8 * 1024 * 1024) erreurs.push("Image Instagram : 8 Mo maximum.");
      if (image.largeur && image.hauteur) {
        const ratio = image.largeur / image.hauteur;
        if (ratio < 0.8 || ratio > 1.91) erreurs.push("Image Instagram : rapport largeur/hauteur entre 4:5 et 1,91:1.");
      }
    }
    for (const video of videos) {
      if (video.dureeSecondes && (video.dureeSecondes < 3 || video.dureeSecondes > 15 * 60)) erreurs.push("Reel Instagram : durée entre 3 secondes et 15 minutes.");
      if (video.tailleOctets > 300 * 1024 * 1024) erreurs.push("Reel Instagram : 300 Mo maximum.");
      if (video.largeur && video.hauteur && Math.abs(video.largeur / video.hauteur - 9 / 16) > 0.05) avertissements.push("Reel : le format vertical 9:16 est recommandé.");
    }
  }

  if (reseau === "linkedin") {
    for (const video of videos) {
      if (video.dureeSecondes && (video.dureeSecondes < 3 || video.dureeSecondes > 30 * 60)) erreurs.push("Vidéo LinkedIn : durée entre 3 secondes et 30 minutes.");
    }
    if (contenu.lienUrl && medias.length > 0) avertissements.push("LinkedIn : avec un média, le lien est conservé dans le texte mais pas affiché en aperçu d’article.");
  }

  if (reseau === "facebook") {
    if (images.some((i) => i.tailleOctets > 10 * 1024 * 1024)) erreurs.push("Image Facebook : 10 Mo maximum.");
  }

  return { erreurs, avertissements };
}

export function texteDuReseau(
  p: { contenu_principal: string; contenu_facebook: string | null; contenu_instagram: string | null; contenu_linkedin: string | null },
  reseau: Reseau,
): string {
  const specifique = reseau === "facebook" ? p.contenu_facebook : reseau === "instagram" ? p.contenu_instagram : p.contenu_linkedin;
  return (specifique ?? "").trim() || p.contenu_principal.trim();
}
