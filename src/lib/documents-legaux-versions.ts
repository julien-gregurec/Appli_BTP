// ELSATIA-LEGAL-CONSENT-COMMERCIALIZATION-PACK-V1 — versions des documents contractuels.
//
// Registre des versions EN VIGUEUR des documents que l'on fait ACCEPTER (CGU, CGV, DPA).
// La politique de confidentialité et les mentions légales ne sont pas « acceptées » :
// ce sont des informations (RGPD art. 13, LCEN), pas un contrat — elles n'apparaissent
// donc pas ici.
//
// Chaque version porte l'empreinte SHA-256 du fichier `docs/juridique/<fichier>` tel
// qu'il est publié. La base (`platform.documents_legaux_versions`, migration
// 20261002000901) porte les mêmes valeurs et refuse toute acceptation dont la version ou
// l'empreinte ne correspond pas à la version en vigueur : la preuve désigne le texte exact.
//
// Modifier un de ces fichiers SANS nouvelle version fait échouer
// `documents-legaux-versions.test.ts`. Pour publier une nouvelle version :
//   1. modifier le fichier ;
//   2. ajouter une migration qui insère la nouvelle ligne dans
//      `platform.documents_legaux_versions` (avec `reacceptation_requise` selon la
//      décision du propriétaire) ;
//   3. reporter version + empreinte ici.

export const CODES_DOCUMENTS_A_ACCEPTER = ["cgu", "cgv", "dpa"] as const;
export type CodeDocumentAAccepter = (typeof CODES_DOCUMENTS_A_ACCEPTER)[number];

/** `utilisateur` : chaque personne accepte ; `entreprise` : accepté pour le compte de l'entreprise cliente. */
export type PorteeAcceptation = "utilisateur" | "entreprise";

export type VersionDocumentLegal = Readonly<{
  code: CodeDocumentAAccepter;
  version: string;
  fichier: string;
  libelle: string;
  chemin: string;
  portee: PorteeAcceptation;
  empreinteSha256: string;
}>;

export const VERSIONS_DOCUMENTS_LEGAUX: Readonly<Record<CodeDocumentAAccepter, VersionDocumentLegal>> = Object.freeze({
  cgu: Object.freeze({
    code: "cgu",
    version: "1.0",
    fichier: "cgu.md",
    libelle: "Conditions Générales d'Utilisation",
    chemin: "/cgu",
    portee: "utilisateur",
    empreinteSha256: "736ff027db0329f54b05f00d352ef9286264514fad50545cc5043fa2a7123876",
  }),
  cgv: Object.freeze({
    code: "cgv",
    version: "1.0",
    fichier: "cgv.md",
    libelle: "Conditions Générales de Vente",
    chemin: "/cgv",
    portee: "entreprise",
    empreinteSha256: "3c1a468c0a79148bcf618a508990e8421813bcaf8bb54b4c3376a7bb7980b7de",
  }),
  dpa: Object.freeze({
    code: "dpa",
    version: "2026-08-24",
    fichier: "dpa-entreprises-clientes.md",
    libelle: "Accord de traitement des données (DPA)",
    chemin: "/dpa",
    portee: "entreprise",
    empreinteSha256: "7d9c73842c7b657b9d53291e6ece5375794020a136f05d466a3e0a5f4e563217",
  }),
});

/** Charge utile transmise à la RPC `accepter_documents_legaux` : code + version + empreinte. */
export function documentsEnVigueurPourAcceptation() {
  return CODES_DOCUMENTS_A_ACCEPTER.map((code) => {
    const v = VERSIONS_DOCUMENTS_LEGAUX[code];
    return { code: v.code, version: v.version, empreinte: v.empreinteSha256 };
  });
}

export const CHAMP_ACCEPTATION = "acceptation_conditions";
export const CHAMP_ACCEPTATION_VERSIONS = "acceptation_conditions_versions";

/** Valeur du champ caché qui fige, dans le formulaire, les versions affichées à l'utilisateur. */
export function versionsAfficheesSerialisees() {
  return CODES_DOCUMENTS_A_ACCEPTER.map((code) => `${code}@${VERSIONS_DOCUMENTS_LEGAUX[code].version}`).join(",");
}

export type LectureAcceptation =
  | { ok: true; documents: ReturnType<typeof documentsEnVigueurPourAcceptation> }
  | { ok: false; raison: "non_cochee" | "versions_perimees" };

export const MESSAGE_ACCEPTATION_MANQUANTE =
  "Vous devez lire et accepter les CGU, les CGV et l'accord de traitement des données pour continuer.";
export const MESSAGE_VERSIONS_PERIMEES =
  "Les conditions ont été mises à jour pendant votre saisie. Relisez la nouvelle version puis acceptez-la.";

/**
 * Lit la case d'acceptation d'un formulaire. La case n'est JAMAIS pré-cochée : seule la
 * valeur `on` envoyée par le navigateur après un clic vaut acceptation. Les versions
 * affichées doivent être celles en vigueur au moment de l'envoi.
 */
export function lireAcceptationFormulaire(formData: FormData): LectureAcceptation {
  if (formData.get(CHAMP_ACCEPTATION) !== "on") return { ok: false, raison: "non_cochee" };
  if (String(formData.get(CHAMP_ACCEPTATION_VERSIONS) ?? "") !== versionsAfficheesSerialisees()) {
    return { ok: false, raison: "versions_perimees" };
  }
  return { ok: true, documents: documentsEnVigueurPourAcceptation() };
}

export function messageLectureAcceptation(lecture: Extract<LectureAcceptation, { ok: false }>) {
  return lecture.raison === "non_cochee" ? MESSAGE_ACCEPTATION_MANQUANTE : MESSAGE_VERSIONS_PERIMEES;
}
