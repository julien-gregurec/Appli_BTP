/**
 * Politique de conservation des données d'ELSATIA Colors.
 *
 * ### Ce que ce module fait, et surtout ce qu'il ne fait pas
 *
 * Il **ne supprime rien**. Il calcule ce qui *serait* concerné par une purge,
 * à partir d'une durée que quelqu'un doit avoir configurée. Sans durée
 * configurée, il ne désigne rien : c'est la position fermée, et c'est le défaut.
 *
 * Ce choix n'est pas de la prudence décorative. Une durée de conservation est
 * une décision juridique et contractuelle — elle dépend de ce qui a été annoncé
 * aux personnes, de la nature des données et des obligations de l'exploitant.
 * Aucune valeur ne peut être devinée par le produit, et une valeur devinée qui
 * effacerait les photos de chantier d'un client serait une perte de données
 * irréversible commise par défaut.
 *
 * Le fail-closed va donc dans le sens de la CONSERVATION : sans consigne, on ne
 * détruit rien. C'est l'inverse du fail-closed d'un contrôle d'accès, et c'est
 * volontaire — le risque n'est pas le même de part et d'autre.
 *
 * ### Catégories
 *
 * Les quatre catégories ci-dessous ne se confondent pas : elles n'ont ni le
 * même contenu, ni les mêmes destinataires, ni les mêmes raisons d'exister.
 * Une purge qui les traiterait ensemble serait soit trop large, soit trop
 * étroite.
 */

export const CATEGORIES = ["photo_metier", "rendu_transforme", "metadonnees_photo", "resultat_ocr"] as const;
export type CategorieDonnee = (typeof CATEGORIES)[number];

export type DescriptionCategorie = {
  libelle: string;
  /** Où la donnée vit réellement, tel que relevé dans le code. */
  emplacement: string;
  /** Ce qu'elle contient, sans euphémisme. */
  contenu: string;
  /** Pourquoi elle existe : une purge doit savoir ce qu'elle détruirait. */
  raison: string;
};

export const DESCRIPTIONS: Record<CategorieDonnee, DescriptionCategorie> = {
  photo_metier: {
    libelle: "Photo du seau",
    emplacement: "Bucket privé `colors-seaux`, chemin `<entreprise>/<seau>/<uuid>.<ext>`",
    contenu:
      "L'image décodée, redressée selon son orientation d'origine, puis réencodée. Elle ne porte "
      + "AUCUNE métadonnée : ni coordonnées GPS, ni modèle d'appareil, ni date de prise de vue, ni "
      + "miniature intégrée. Le fichier reçu n'est jamais conservé (décision D2).",
    raison: "Reconnaître un seau sur le terrain et lire son étiquette sans le déplacer.",
  },
  rendu_transforme: {
    libelle: "Rendu transformé",
    emplacement: "Généré à la volée par Supabase Storage à chaque lien signé (900×900, `contain`)",
    contenu: "Une réduction de la photo métier. ELSATIA n'en conserve aucune copie.",
    raison: "Afficher la fiche sans transférer l'original de 10 Mo à chaque ouverture.",
  },
  metadonnees_photo: {
    libelle: "Métadonnées de rattachement",
    emplacement: "`colors_seaux.photo_principale_path`, `colors_nettoyages_photos`, journal `colors_mouvements`",
    contenu:
      "Le chemin de la photo courante, le suivi des suppressions de stockage non abouties, et — "
      + "dans le journal — le seul nom terminal du fichier, jamais le chemin complet.",
    raison: "Rattacher une photo à un seau et garantir qu'aucune photo remplacée ne reste orpheline.",
  },
  resultat_ocr: {
    libelle: "Résultat de lecture d'étiquette",
    emplacement: "`colors_analyses_ocr`",
    contenu:
      "Les champs proposés par le prestataire, son identifiant, le statut de la proposition et "
      + "l'auteur de sa confirmation. Jamais l'image elle-même.",
    raison: "Tracer ce qui a été proposé par une machine et ce qu'une personne a retenu.",
  },
};

export type DureesConservation = Partial<Record<CategorieDonnee, number | null>>;

export type DecisionPurge = {
  categorie: CategorieDonnee;
  /** `false` tant qu'aucune durée n'est configurée pour cette catégorie. */
  purgeable: boolean;
  /** Ancienneté au-delà de laquelle un élément serait concerné, en jours. */
  dureeJours: number | null;
  /** Date de coupure calculée, ou `null` si rien n'est purgeable. */
  avant: Date | null;
  /** Pourquoi rien ne sera purgé, quand c'est le cas. Toujours affichable. */
  motif: string | null;
};

export const MOTIF_NON_CONFIGURE =
  "Aucune durée de conservation n’est configurée pour cette catégorie : rien n’est supprimé.";
export const MOTIF_DUREE_INVALIDE =
  "La durée de conservation configurée n’est pas un nombre de jours strictement positif : rien n’est supprimé.";

/**
 * Ce qui serait purgé, catégorie par catégorie, à une date donnée.
 *
 * `maintenant` est un paramètre et non `new Date()` : une politique de
 * conservation qui dépend de l'horloge du serveur ne se teste pas.
 */
export function decisionsPurge(durees: DureesConservation, maintenant: Date): DecisionPurge[] {
  return CATEGORIES.map((categorie) => {
    const duree = durees[categorie];
    if (duree === undefined || duree === null) {
      return { categorie, purgeable: false, dureeJours: null, avant: null, motif: MOTIF_NON_CONFIGURE };
    }
    if (!Number.isFinite(duree) || duree <= 0) {
      return { categorie, purgeable: false, dureeJours: null, avant: null, motif: MOTIF_DUREE_INVALIDE };
    }
    const avant = new Date(maintenant.getTime() - duree * 24 * 60 * 60 * 1000);
    return { categorie, purgeable: true, dureeJours: duree, avant, motif: null };
  });
}

/**
 * Lecture des durées depuis l'environnement serveur.
 *
 * Quatre variables distinctes, une par catégorie : une variable unique
 * obligerait à traiter une photo de chantier et une proposition d'OCR de la
 * même façon, alors qu'elles n'ont ni la même sensibilité ni la même utilité
 * dans le temps.
 *
 * Une valeur illisible ne vaut jamais « pas de limite » : elle vaut « ne rien
 * purger », et le motif le dit. Une faute de frappe ne doit pas se traduire par
 * une destruction.
 */
export const VARIABLES_CONSERVATION: Record<CategorieDonnee, string> = {
  photo_metier: "COLORS_CONSERVATION_PHOTO_JOURS",
  rendu_transforme: "COLORS_CONSERVATION_RENDU_JOURS",
  metadonnees_photo: "COLORS_CONSERVATION_METADONNEES_JOURS",
  resultat_ocr: "COLORS_CONSERVATION_OCR_JOURS",
};

export function dureesConfigurees(env: Partial<Record<string, string | undefined>>): DureesConservation {
  const durees: DureesConservation = {};
  for (const categorie of CATEGORIES) {
    const brut = env[VARIABLES_CONSERVATION[categorie]];
    if (brut === undefined || brut.trim() === "") continue;
    const valeur = Number(brut.trim());
    durees[categorie] = Number.isFinite(valeur) ? valeur : Number.NaN;
  }
  return durees;
}

/** Vrai si au moins une catégorie serait effectivement purgée. */
export function purgeActive(decisions: readonly DecisionPurge[]): boolean {
  return decisions.some((decision) => decision.purgeable);
}
