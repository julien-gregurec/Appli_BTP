import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (reprise de charge en cloison légère), aucune référence tierce.
 */
export const fixerUneChargeEnCloisonDePlaques: ConseilFiche = {
  id: "cf-fixer-une-charge-en-cloison-de-plaques",
  slug: "fixer-une-charge-en-cloison-de-plaques",
  title: "Fixer une charge en cloison de plaques",
  shortDescription:
    "Accrocher un meuble ou un équipement sur une cloison légère sans arracher le parement.",
  category: "fixation",
  subcategory: "Cloisons légères",
  trades: [
    "tous",
    "plaquiste",
    "platrier",
    "menuisier",
    "agenceur",
  ],
  tags: [
    "fixation",
    "cloison",
    "placo",
    "renfort",
    "charge",
    "meuble",
    "montant",
    "porte serviette",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 35,
  tools: [
    "Un détecteur de montants",
    "Une perceuse",
    "Un niveau",
    "Un mètre ruban",
  ],
  materials: [
    "Chevilles pour plaque ou fixations sur montant",
    "Renfort bois ou métallique si la charge le justifie",
  ],
  preparation: [
    "Estimer le poids et le porte-à-faux : une charge éloignée du mur sollicite bien plus qu'un poids équivalent plaqué.",
    "Repérer les montants d'ossature et leur entraxe.",
    "Vérifier l'absence de gaine ou de canalisation dans la cloison avant de percer.",
  ],
  steps: [
    {
      title: "Choisir la stratégie",
      text: "Charge légère : chevilles pour plaque. Charge significative ou en porte-à-faux : ancrage dans les montants ou sur un renfort.",
      hint: "Une cheville pour plaque tient une charge, pas un levier : c'est le porte-à-faux qui arrache, pas le poids seul.",
    },
    {
      title: "Repérer et tracer",
      text: "Localiser les montants, tracer les points de fixation de niveau et vérifier leur écartement par rapport à l'objet.",
    },
    {
      title: "Percer et poser",
      text: "Percer au diamètre exact et poser les fixations sans sur-serrer : un serrage excessif écrase le plâtre.",
    },
    {
      title: "Contrôler sous charge",
      text: "Charger progressivement et vérifier l'absence de mouvement du parement au droit des fixations.",
    },
  ],
  tips: [
    "Un renfort posé avant fermeture de la cloison coûte quelques minutes ; ajouté après, il impose de rouvrir le parement.",
    "Répartir la charge sur plusieurs points plutôt que de la concentrer sur deux.",
    "Signaler par écrit les renforts posés : personne ne les devinera derrière le parement.",
  ],
  commonErrors: [
    "Fixer une charge lourde en pleine plaque sans renfort ni ancrage sur montant.",
    "Sur-serrer une cheville pour plaque jusqu'à écraser le parement.",
    "Percer sans repérage et traverser une canalisation.",
  ],
  finalCheck: [
    "La stratégie retenue correspond au poids et au porte-à-faux réels.",
    "Aucun mouvement ni fissure au droit des fixations sous charge.",
    "Les points de fixation sont de niveau et correctement espacés.",
  ],
  warnings: [
    "Les charges suspendues au-dessus d'un lit, d'un poste de travail ou d'un passage exigent une reprise sur ossature ou sur renfort, sans exception.",
  ],
  relatedToolIds: [
    "fixations",
    "calcul-plaques",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
