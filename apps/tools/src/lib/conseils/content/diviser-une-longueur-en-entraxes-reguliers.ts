import type { ConseilFiche } from "../types";

/**
 * Fiche de démonstration ELSATIA — contenu original.
 * Sujet générique (répartition en entraxes réguliers), aucune référence tierce.
 */
export const diviserUneLongueurEnEntraxesReguliers: ConseilFiche = {
  id: "cf-diviser-une-longueur-en-entraxes-reguliers",
  slug: "diviser-une-longueur-en-entraxes-reguliers",
  title: "Diviser une longueur en entraxes réguliers",
  shortDescription:
    "Répartir montants, suspentes ou fixations à pas constant sans jamais dépasser un entraxe maximum.",
  category: "implantation",
  subcategory: "Répartition",
  trades: ["tous", "platrier", "plaquiste", "metallier", "chef-de-chantier"],
  tags: ["entraxe", "repartition", "montants", "suspentes", "fixations", "pas", "espacement"],
  difficulty: "intermediaire",
  estimatedMinutes: 20,
  tools: [
    "Un mètre ruban ou un télémètre",
    "Une calculatrice (ou l'outil Répartir des entraxes)",
    "Un crayon et un cordeau à tracer",
  ],
  materials: [],
  preparation: [
    "Mesurer la longueur nette à équiper, entre les deux appuis d'extrémité.",
    "Fixer l'entraxe maximum admissible (donné par la fiche technique du produit posé).",
    "Décider si les éléments d'extrémité sont posés sur les appuis ou en retrait.",
  ],
  steps: [
    {
      title: "Compter les intervalles",
      text: "Diviser la longueur par l'entraxe maximum, puis arrondir au nombre entier supérieur : c'est le nombre d'intervalles.",
      hint: "Exemple : 4,20 m ÷ 0,60 m = 7 → arrondi à 7 intervalles (ici déjà entier, on garde 7).",
    },
    {
      title: "Calculer l'entraxe réel",
      text: "Diviser la longueur par ce nombre d'intervalles. Le résultat est l'entraxe réel, toujours ≤ au maximum.",
      hint: "4,20 m ÷ 7 = 0,60 m exactement. Si la longueur était 4,50 m : 4,50 ÷ 8 = 0,5625 m.",
    },
    {
      title: "Reporter les positions",
      text: "Cumuler l'entraxe réel depuis l'origine : 0, e, 2e, 3e… jusqu'à la dernière position égale à la longueur.",
    },
    {
      title: "Tracer et contrôler",
      text: "Marquer chaque position, puis vérifier que la dernière retombe pile sur l'appui d'extrémité.",
      hint: "Un écart en fin de ligne signale une erreur de cumul ou une longueur mal relevée.",
    },
  ],
  tips: [
    "Travailler en positions cumulées depuis l'origine plutôt qu'en reports successifs : les erreurs ne s'additionnent pas.",
    "Nombre de pièces = nombre d'intervalles + 1 quand on pose un élément à chaque extrémité.",
    "Garder l'entraxe réel écrit sur le support : il resservira pour les fixations secondaires.",
  ],
  commonErrors: [
    "Arrondir le nombre d'intervalles vers le bas : l'entraxe réel dépasse alors le maximum autorisé.",
    "Confondre nombre d'éléments et nombre d'intervalles.",
    "Reporter l'entraxe de proche en proche au mètre : les petits écarts se cumulent jusqu'à un décalage visible.",
  ],
  finalCheck: [
    "L'entraxe réel est inférieur ou égal à l'entraxe maximum.",
    "La dernière position cumulée est égale à la longueur nette mesurée.",
    "Le nombre de repères tracés correspond au nombre d'éléments attendu.",
  ],
  warnings: [
    "L'entraxe maximum dépend du produit et de sa portée : se référer à l'avis technique, cette méthode ne fait que le répartir.",
  ],
  relatedToolIds: ["entraxes", "repartition", "fixations", "repartition-vitrages"],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
