import type { ConseilFiche } from "../types";

/**
 * Fiche de démonstration ELSATIA — contenu original.
 * Sujet générique (centre d'un rectangle par les diagonales), aucune référence tierce.
 */
export const trouverLeCentreDUnRectangle: ConseilFiche = {
  id: "cf-trouver-le-centre-d-un-rectangle",
  slug: "trouver-le-centre-d-un-rectangle",
  title: "Trouver le centre d'un rectangle",
  shortDescription:
    "Positionner l'axe d'un lustre, d'un spot central ou d'une trappe en croisant les diagonales.",
  category: "implantation",
  subcategory: "Axes",
  trades: ["tous", "plaquiste", "menuisier", "agenceur"],
  tags: ["centre", "diagonales", "axe", "plafond", "spot", "implantation", "milieu"],
  difficulty: "facile",
  estimatedMinutes: 10,
  tools: [
    "Un cordeau à tracer ou une règle longue",
    "Un mètre ruban",
    "Un crayon",
  ],
  materials: [],
  preparation: [
    "Vérifier que la zone est bien un rectangle (côtés opposés égaux, angles droits).",
    "Dégager les quatre coins pour pouvoir y accrocher un cordeau.",
    "Si la surface est irrégulière, se ramener au rectangle enveloppe des quatre coins utiles.",
  ],
  steps: [
    {
      title: "Tracer la première diagonale",
      text: "Relier deux coins opposés au cordeau et marquer la ligne complète.",
    },
    {
      title: "Tracer la seconde diagonale",
      text: "Relier les deux autres coins opposés. Le point d'intersection des deux diagonales est le centre.",
      hint: "Les diagonales d'un rectangle se coupent toujours en leur milieu exact.",
    },
    {
      title: "Vérifier par les milieux",
      text: "Mesurer le milieu de deux côtés opposés et les relier : cette médiane doit passer par le point trouvé.",
    },
    {
      title: "Matérialiser le centre",
      text: "Marquer une croix franche et reporter, si besoin, les distances aux deux murs de référence.",
    },
  ],
  tips: [
    "Pas d'accès aux coins ? Tracer les deux médianes (milieu à milieu) : elles se croisent au même centre.",
    "Prolonger légèrement la croix au-delà du point pour qu'elle reste visible après pose de l'appareil.",
    "Photographier le repère avec le mètre en place avant de fermer le plafond.",
  ],
  commonErrors: [
    "Prendre un quadrilatère quelconque pour un rectangle : les diagonales ne se croisent alors plus au milieu.",
    "Se fier à une seule diagonale et estimer « le milieu à vue ».",
    "Oublier de vérifier l'équerrage : un parallélogramme fausse le centrage perçu.",
  ],
  finalCheck: [
    "Les deux diagonales se coupent en un seul point net.",
    "La distance de ce point à deux coins opposés est identique.",
    "La médiane milieu-à-milieu passe bien par ce point.",
  ],
  warnings: [
    "Le centre géométrique n'est pas toujours le centre visuel : tenir compte d'un faux plafond décalé ou d'un mobilier fixe.",
  ],
  relatedToolIds: ["diagonale-rectangle", "plafond-circulaire", "surface-rectangle"],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
