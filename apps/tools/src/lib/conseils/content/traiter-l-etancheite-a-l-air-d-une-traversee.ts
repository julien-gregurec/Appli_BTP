import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (continuité à l'air au droit d'une traversée), aucune référence tierce.
 */
export const traiterLEtancheiteALAirDUneTraversee: ConseilFiche = {
  id: "cf-traiter-l-etancheite-a-l-air-d-une-traversee",
  slug: "traiter-l-etancheite-a-l-air-d-une-traversee",
  title: "Traiter l'étanchéité à l'air d'une traversée",
  shortDescription:
    "Rétablir la continuité à l'air là où une gaine, un conduit ou un boîtier perce la paroi.",
  category: "etancheite",
  subcategory: "Étanchéité à l'air",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "chef-de-chantier",
  ],
  tags: [
    "etancheite a l air",
    "traversee",
    "gaine",
    "membrane",
    "calfeutrement",
    "continuite",
    "perméabilité",
    "boitier",
  ],
  difficulty: "avance",
  estimatedMinutes: 35,
  tools: [
    "Un cutter",
    "Un maroufleur ou une spatule",
    "Une lampe",
    "Un mètre ruban",
  ],
  materials: [
    "Adhésif d'étanchéité compatible avec la membrane",
    "Manchette ou collerette de traversée",
    "Mastic de calfeutrement adapté",
  ],
  preparation: [
    "Identifier le plan d'étanchéité à l'air de la paroi : c'est lui qui doit rester continu, pas le parement.",
    "Regrouper les traversées quand c'est encore possible : chaque percement est un point faible de plus.",
    "Nettoyer et dégraisser la zone de collage : un adhésif d'étanchéité ne rattrape pas un support sale.",
  ],
  steps: [
    {
      title: "Préparer le percement",
      text: "Découper au plus juste autour de la traversée, sans déchirer la membrane au-delà du nécessaire.",
      hint: "Une découpe généreuse pour se faciliter la tâche crée un trou qu'aucune manchette ne rattrapera proprement.",
    },
    {
      title: "Poser la manchette",
      text: "Engager la collerette sur la gaine ou le conduit et la plaquer contre la membrane sans pli.",
    },
    {
      title: "Maroufler",
      text: "Maroufler l'adhésif sur tout le pourtour, en insistant sur les angles et les recouvrements.",
    },
    {
      title: "Contrôler visuellement",
      text: "Vérifier en lumière rasante l'absence de pli, de cloque et de zone non collée.",
      hint: "Chaque pli non marouflé est une fuite : le contrôle visuel se fait avant de refermer, jamais après.",
    },
  ],
  tips: [
    "Traiter les traversées au fur et à mesure : rouvrir un parement pour reprendre une manchette coûte dix fois plus cher.",
    "Photographier chaque traversée traitée avant fermeture : c'est la seule preuve exploitable ensuite.",
    "Prévoir les réservations à l'avance plutôt que de percer une membrane déjà posée.",
  ],
  commonErrors: [
    "Compter sur le parement ou l'enduit pour assurer l'étanchéité à l'air.",
    "Utiliser un adhésif générique non compatible avec la membrane.",
    "Refermer le parement sans avoir contrôlé la traversée.",
  ],
  finalCheck: [
    "La continuité est assurée sur tout le pourtour de la traversée.",
    "Aucun pli ni cloque visible en lumière rasante.",
    "La traversée est photographiée et repérée avant fermeture.",
  ],
  warnings: [
    "Une traversée mal traitée ne se voit pas et ne se corrige qu'en rouvrant l'ouvrage : c'est un point d'arrêt, pas une finition.",
  ],
  relatedToolIds: [
    "isolation",
    "surface-rectangle",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
