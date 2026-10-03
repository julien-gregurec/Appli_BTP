import { sha256 } from "@/lib/social/crypto";

export type ContenuEmpreinte = {
  titre: string;
  contenu_principal: string;
  contenu_facebook: string | null;
  contenu_instagram: string | null;
  contenu_linkedin: string | null;
  lien_url: string | null;
  reseaux: string[];
  mediaIds: string[];
};

/** Empreinte du contenu exact validé : toute différence invalide la validation. */
export function empreinteContenu(p: ContenuEmpreinte): string {
  return sha256(
    JSON.stringify([
      p.titre,
      p.contenu_principal,
      p.contenu_facebook ?? "",
      p.contenu_instagram ?? "",
      p.contenu_linkedin ?? "",
      p.lien_url ?? "",
      [...p.reseaux].sort(),
      p.mediaIds,
    ]),
  );
}
