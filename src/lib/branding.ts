/**
 * Source unique des assets de marque de l'application.
 *
 * Migration ELSATIA Branding V2 : les références visuelles officielles n'ont pas
 * encore été déposées dans le dépôt (voir
 * docs/qualification/ELSATIA_BRANDING_V2_MIGRATION.md). Les chemins pointent donc
 * toujours vers les assets Liria actuels. Une fois `npm run branding:icones`
 * exécuté sur le fichier maître officiel, il suffit de basculer ces chemins vers
 * `/branding/...` : tous les écrans, le manifeste PWA et les métadonnées suivent.
 */
export const MARQUE = {
  nom: "Liria Gestion Pro",
  nomCourt: "Liria Pro",
  nomVersion: "Liria Gestion Pro V3",
  couleurFond: "#0d1b2a",
  couleurAccent: "#c9a24a",
} as const;

export const ASSETS_MARQUE = {
  logo: "/liria-gestion-pro-logo-v5.png",
  icone192: "/icons/liria-gestion-pro-v3-192.png",
  icone512: "/icons/liria-gestion-pro-v3-512.png",
  iconeMaskable512: "/icons/liria-gestion-pro-v3-512.png",
  appleTouch: "/icons/liria-gestion-pro-v3-apple-touch.png",
} as const;
