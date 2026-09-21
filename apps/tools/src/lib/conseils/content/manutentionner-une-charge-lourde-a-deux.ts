import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (manutention à deux opérateurs), aucune référence tierce.
 */
export const manutentionnerUneChargeLourdeADeux: ConseilFiche = {
  id: "cf-manutentionner-une-charge-lourde-a-deux",
  slug: "manutentionner-une-charge-lourde-a-deux",
  title: "Manutentionner une charge lourde à deux",
  shortDescription:
    "Organiser un portage à deux pour éviter le geste qui bloque le dos ou écrase une main.",
  category: "securite",
  subcategory: "Manutention",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "menuisier",
    "vitrier",
    "metallier",
    "chef-de-chantier",
  ],
  tags: [
    "manutention",
    "securite",
    "charge",
    "portage",
    "dos",
    "epi",
    "levage",
    "binome",
  ],
  difficulty: "facile",
  estimatedMinutes: 15,
  tools: [
    "Des gants adaptés à la charge",
    "Des chaussures de sécurité",
    "Des sangles ou poignées de portage si disponibles",
  ],
  materials: [
    "Cales de dépose",
  ],
  preparation: [
    "Estimer le poids réel et décider si le portage à deux est adapté ou s'il faut un moyen mécanique.",
    "Reconnaître le trajet complet : largeur, marches, seuils, portes, éclairage.",
    "Désigner qui commande la manœuvre : une seule voix, décidée avant de soulever.",
  ],
  steps: [
    {
      title: "Préparer la prise",
      text: "Se placer de part et d'autre, prises symétriques, pieds décalés et stables, dos droit.",
      hint: "La prise se règle au sol : une prise mal placée ne se corrige plus une fois la charge levée.",
    },
    {
      title: "Lever au signal",
      text: "Lever ensemble sur annonce, en poussant sur les jambes, charge proche du corps.",
    },
    {
      title: "Se déplacer",
      text: "Avancer à petits pas, sans torsion du tronc, celui qui recule étant guidé par l'autre.",
      hint: "Tourner se fait avec les pieds, jamais en pivotant le buste sous charge.",
    },
    {
      title: "Déposer au signal",
      text: "Annoncer la dépose, poser sur cales en gardant les doigts hors de la zone d'écrasement.",
    },
  ],
  tips: [
    "Faire une pause plutôt que de finir un trajet trop long d'un seul tenant.",
    "Poser sur cales systématiquement : la reprise de charge est le moment le plus risqué.",
    "Refuser une manœuvre mal préparée est plus rapide qu'un arrêt de travail.",
  ],
  commonErrors: [
    "Soulever sans annonce ni synchronisation.",
    "Pivoter le buste sous charge pour changer de direction.",
    "Poser la charge directement au sol, doigts sous l'arête.",
  ],
  finalCheck: [
    "Le trajet a été reconnu et dégagé avant le levage.",
    "Une seule personne commande la manœuvre.",
    "La charge est déposée sur cales et stabilisée.",
  ],
  warnings: [
    "Au-delà d'un poids raisonnable pour deux opérateurs, ou sur un trajet contraint, le portage manuel n'est plus la bonne réponse : recourir à un moyen de manutention.",
  ],
  relatedToolIds: [
    "poids-vitrage",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
