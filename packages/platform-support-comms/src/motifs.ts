/**
 * Motifs d'ouverture d'une session d'assistance.
 *
 * Deux textes distincts par catégorie, et c'est le point important :
 *   * `libellePublic` — ce que l'entreprise assistée voit dans sa notification et son
 *     centre de sécurité. Il ne doit jamais révéler qu'un signalement, une fraude
 *     présumée ou une investigation de sécurité est en cours.
 *   * `libelleInterne` — ce que la plateforme voit. Le détail libre saisi par
 *     l'opérateur reste lui aussi strictement interne.
 */

export type CategorieMotifAssistance =
  | "demande_client"
  | "erreur_configuration"
  | "incident_technique"
  | "controle_signalement"
  | "recuperation_correction"
  | "securite"
  | "autre";

export type DefinitionMotif = {
  cle: CategorieMotifAssistance;
  libelleInterne: string;
  libellePublic: string;
  /** Un détail libre est obligatoire (motif « autre », et tout motif non explicite). */
  detailRequis: boolean;
  /** Le détail libre ne doit jamais être publié au client pour ces catégories. */
  detailStrictementInterne: boolean;
};

export const MOTIFS_ASSISTANCE: readonly DefinitionMotif[] = [
  {
    cle: "demande_client",
    libelleInterne: "Assistance demandée par le client",
    libellePublic: "une demande d’assistance de votre part",
    detailRequis: false,
    detailStrictementInterne: false,
  },
  {
    cle: "erreur_configuration",
    libelleInterne: "Erreur de configuration",
    libellePublic: "la correction d’un paramétrage",
    detailRequis: false,
    detailStrictementInterne: false,
  },
  {
    cle: "incident_technique",
    libelleInterne: "Incident technique",
    libellePublic: "un incident technique",
    detailRequis: false,
    detailStrictementInterne: false,
  },
  {
    cle: "controle_signalement",
    libelleInterne: "Contrôle après signalement",
    // Volontairement neutre : un signalement ne s'annonce pas à la personne contrôlée.
    libellePublic: "une vérification de conformité de la plateforme",
    detailRequis: true,
    detailStrictementInterne: true,
  },
  {
    cle: "recuperation_correction",
    libelleInterne: "Récupération ou correction autorisée",
    libellePublic: "une récupération ou une correction de données autorisée",
    detailRequis: true,
    detailStrictementInterne: false,
  },
  {
    cle: "securite",
    libelleInterne: "Sécurité",
    // Idem : le détail d'une investigation de sécurité n'est jamais publié.
    libellePublic: "un contrôle de sécurité de la plateforme",
    detailRequis: true,
    detailStrictementInterne: true,
  },
  {
    cle: "autre",
    libelleInterne: "Autre motif",
    libellePublic: "une intervention de l’assistance ELSATIA",
    detailRequis: true,
    detailStrictementInterne: false,
  },
];

export const LONGUEUR_MINIMALE_DETAIL_MOTIF = 10;
export const LONGUEUR_MAXIMALE_DETAIL_MOTIF = 500;

export function definitionMotif(cle: string): DefinitionMotif | null {
  return MOTIFS_ASSISTANCE.find((m) => m.cle === cle) ?? null;
}

export type ResultatValidationMotif =
  | { valide: true; categorie: CategorieMotifAssistance; detail: string | null }
  | { valide: false; erreur: string };

/**
 * Le motif est OBLIGATOIRE : une catégorie connue, et un détail lisible dès que la
 * catégorie l'exige. Un détail réduit à des espaces ou à « ok » est refusé — un motif
 * qui n'explique rien ne protège personne.
 */
export function validerMotifAssistance(entree: {
  categorie: string;
  detail?: string | null;
}): ResultatValidationMotif {
  const definition = definitionMotif(entree.categorie);
  if (!definition) return { valide: false, erreur: "Catégorie de motif inconnue" };

  const detail = (entree.detail ?? "").trim();
  if (definition.detailRequis && detail.length < LONGUEUR_MINIMALE_DETAIL_MOTIF) {
    return {
      valide: false,
      erreur: `Détaillez le motif (${LONGUEUR_MINIMALE_DETAIL_MOTIF} caractères minimum)`,
    };
  }
  if (detail.length > LONGUEUR_MAXIMALE_DETAIL_MOTIF) {
    return {
      valide: false,
      erreur: `Motif trop long (${LONGUEUR_MAXIMALE_DETAIL_MOTIF} caractères maximum)`,
    };
  }
  return { valide: true, categorie: definition.cle, detail: detail === "" ? null : detail };
}

/** Texte affiché au client. Le détail interne n'y figure que s'il est publiable. */
export function motifPublic(categorie: CategorieMotifAssistance): string {
  return definitionMotif(categorie)?.libellePublic ?? "une intervention de l’assistance ELSATIA";
}

export function motifInterne(categorie: CategorieMotifAssistance, detail: string | null): string {
  const definition = definitionMotif(categorie);
  const base = definition?.libelleInterne ?? "Autre motif";
  return detail ? `${base} — ${detail}` : base;
}
