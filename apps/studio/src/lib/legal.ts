/**
 * Technical surfaces for the legal documents. The texts are PLACEHOLDERS: LEGAL REVIEW REQUIRED.
 * No definitive legal wording is invented here; only factual technical descriptions and blanks to fill.
 */
export const legalSlugs = ["mentions", "confidentialite", "cgu", "cgv"] as const;
export type LegalSlug = (typeof legalSlugs)[number];
export const legalTitles: Record<LegalSlug, string> = {
  mentions: "Mentions légales",
  confidentialite: "Politique de confidentialité",
  cgu: "Conditions générales d’utilisation",
  cgv: "Conditions générales de vente",
};
const blank = "[À COMPLÉTER — LEGAL REVIEW REQUIRED]";
export const legalSections: Record<LegalSlug, { heading: string; body: string }[]> = {
  mentions: [
    { heading: "Éditeur du service", body: blank },
    { heading: "Directeur de la publication", body: blank },
    { heading: "Hébergeur", body: blank },
    { heading: "Contact", body: blank },
  ],
  confidentialite: [
    { heading: "Responsable de traitement", body: blank },
    {
      heading: "Données traitées (description technique)",
      body: "Adresse e-mail et identifiant de compte ; espaces de travail, membres et rôles ; projets ; médias importés (photos, vidéos, musique) et leurs métadonnées techniques ; montages et vidéos exportées ; liens de partage (empreinte du secret seulement) ; identité de marque ; compteurs d’usage. Texte à valider.",
    },
    { heading: "Finalités et bases légales", body: blank },
    { heading: "Durées de conservation", body: blank },
    {
      heading: "Vos droits",
      body: "La suppression du compte et de ses espaces est disponible dans Paramètres. Les modalités d’exercice des autres droits sont à compléter : " + blank,
    },
    { heading: "Sous-traitants et transferts", body: blank },
  ],
  cgu: [
    { heading: "Objet et accès au service", body: blank },
    { heading: "Compte et sécurité", body: blank },
    { heading: "Contenus importés, droits sur la musique et responsabilité", body: blank },
    { heading: "Liens de partage", body: blank },
    { heading: "Suspension et résiliation", body: blank },
  ],
  cgv: [
    { heading: "Offres et prix", body: "Aucune offre commerciale n’est ouverte : " + blank },
    { heading: "Paiement, facturation et rétractation", body: blank },
  ],
};
export const legalPublished = () => process.env.STUDIO_LEGAL_PUBLISHED === "1";
export const legalVersion = () => process.env.STUDIO_LEGAL_TEXT_VERSION || "provisoire";
