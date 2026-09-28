// Les notes de relecture juridique (commentaires HTML) restent internes ; les champs
// encore marqués LEGAL_REVIEW_REQUIRED sont publiés comme « en cours de mise à jour ».
export function preparerDocumentLegal(contenu: string) {
  return contenu
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[LEGAL_REVIEW_REQUIRED[^\]]*\]/g, "_en cours de mise à jour_")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

// Documents publiés sur le site (pages /mentions-legales, /cgv, /cgu, /confidentialite, /cookies).
export const DOCUMENTS_LEGAUX_PUBLICS = [
  "mentions-legales.md",
  "cgv.md",
  "cgu.md",
  "politique-confidentialite.md",
  "politique-cookies.md",
] as const;
