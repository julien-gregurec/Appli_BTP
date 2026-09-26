/**
 * Parcours de première utilisation d'ELSATIA Colors.
 *
 * Une organisation qui vient d'être habilitée arrivait jusqu'ici sur un tableau
 * de bord affichant quatre zéros et trois liens, sans rien indiquer de l'ordre
 * dans lequel s'y prendre. Ce n'est pas un écran vide accidentel : c'est l'état
 * normal du premier jour, et c'est exactement le moment où un pilote se perd.
 *
 * Les étapes ci-dessous ne sont pas une liste décorative : chacune est déduite
 * d'un fait déjà présent en base — un emplacement existe ou non, un seau existe
 * ou non, une photo est rattachée ou non, un seuil a été enregistré ou non.
 * Aucun état de progression n'est stocké, donc rien ne peut se désynchroniser
 * de la réalité, et aucune migration n'est nécessaire.
 *
 * L'ordre est celui du terrain : on range avant de remplir, on remplit avant de
 * photographier, on règle les alertes une fois qu'il y a quelque chose à
 * surveiller.
 */

export type EtapeDemarrage = {
  cle: "emplacement" | "seau" | "photo" | "seuil";
  titre: string;
  description: string;
  href: string;
  libelleAction: string;
  faite: boolean;
  /** L'étape ne peut pas être entreprise tant que la précédente n'est pas faite. */
  accessible: boolean;
};

export type FaitsDemarrageColors = {
  emplacements: number;
  seaux: number;
  seauxAvecPhoto: number;
  seuilEnregistre: boolean;
};

export type EtatDemarrageColors = {
  etapes: EtapeDemarrage[];
  faites: number;
  restantes: number;
  /** Toutes les étapes sont franchies : le bandeau de démarrage disparaît. */
  termine: boolean;
};

const DEFINITIONS: readonly Omit<EtapeDemarrage, "faite" | "accessible">[] = [
  {
    cle: "emplacement",
    titre: "Créer un premier emplacement",
    description: "Un dépôt, un véhicule ou un chantier : c'est là que les seaux seront rangés.",
    href: "/depots",
    libelleAction: "Ouvrir les emplacements",
  },
  {
    cle: "seau",
    titre: "Ajouter un premier seau",
    description: "Marque, produit, quantité et emplacement suffisent pour commencer.",
    href: "/inventaire",
    libelleAction: "Ouvrir l'inventaire",
  },
  {
    cle: "photo",
    titre: "Photographier un seau",
    description: "La photo de l'étiquette rend la fiche reconnaissable sur le terrain.",
    href: "/ajout-photo",
    libelleAction: "Voir la marche à suivre",
  },
  {
    cle: "seuil",
    titre: "Régler le seuil de stock faible",
    description: "En dessous de ce niveau, un seau est signalé comme à réapprovisionner.",
    href: "/parametres",
    libelleAction: "Ouvrir les paramètres",
  },
] as const;

export function etatDemarrageColors(faits: FaitsDemarrageColors): EtatDemarrageColors {
  const franchies: Record<EtapeDemarrage["cle"], boolean> = {
    emplacement: faits.emplacements > 0,
    seau: faits.seaux > 0,
    photo: faits.seauxAvecPhoto > 0,
    seuil: faits.seuilEnregistre,
  };

  let precedenteFaite = true;
  const etapes = DEFINITIONS.map((definition) => {
    const faite = franchies[definition.cle];
    // Une étape reste proposable dès qu'elle est déjà faite, même si une étape
    // antérieure a été défaite entre-temps : on ne masque jamais un acquis.
    const etape = { ...definition, faite, accessible: faite || precedenteFaite };
    precedenteFaite = faite;
    return etape;
  });

  const faites = etapes.filter((etape) => etape.faite).length;
  return { etapes, faites, restantes: etapes.length - faites, termine: faites === etapes.length };
}
