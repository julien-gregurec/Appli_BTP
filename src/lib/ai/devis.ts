import { obtenirProviderIA } from "@/lib/ai/provider";
import { UNITES, TAUX_TVA, LIGNE_TYPES, type LigneDevis } from "@/lib/devis";
import type { PrestationCatalogue } from "@/lib/prestations";

const TYPES_CLES: readonly string[] = LIGNE_TYPES.map((t) => t.cle);

const OUTIL_PROPOSER_LIGNES = {
  nom: "proposer_lignes_devis",
  description: "Propose les lignes structurées d'un devis BTP à partir d'une description en langage naturel.",
  parametres: {
    type: "object" as const,
    properties: {
      lignes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            designation: { type: "string", description: "Nom court de la prestation" },
            description: { type: "string", description: "Détail visible sur le devis, chaîne vide si inutile" },
            type: { type: "string", enum: TYPES_CLES },
            quantite: { type: "number" },
            unite: { type: "string", enum: [...UNITES] },
            prix_unitaire_ht: {
              type: "number",
              description: "Prix unitaire HT en euros ; réutilise le prix du catalogue fourni si la prestation y figure, sinon estimation réaliste du marché français du bâtiment",
            },
            taux_tva: { type: "number", enum: [...TAUX_TVA] },
          },
          required: ["designation", "type", "quantite", "unite", "prix_unitaire_ht", "taux_tva"],
        },
      },
    },
    required: ["lignes"],
  },
};

export async function genererLignesDevisIA(
  description: string,
  catalogue: PrestationCatalogue[],
): Promise<LigneDevis[]> {
  const provider = obtenirProviderIA();

  const catalogueTexte = catalogue.length
    ? catalogue
        .map((p) => `- ${p.designation} (${p.type}, ${p.prix_unitaire_ht} €HT/${p.unite}, TVA ${p.taux_tva}%)`)
        .join("\n")
    : "(catalogue vide)";

  const { appelsOutils } = await provider.completer({
    system:
      "Tu es un assistant de chiffrage pour une entreprise du BTP en France. " +
      "À partir de la description d'un chantier, tu proposes une liste de lignes de devis réalistes et détaillées " +
      "(main-d'œuvre, fournitures, sous-traitance, déplacement, forfait). " +
      "Réutilise en priorité les prestations du catalogue fourni si elles correspondent (même désignation et même prix). " +
      "Pour les prestations absentes du catalogue, estime un prix HT réaliste au tarif du marché français du bâtiment. " +
      "Utilise des quantités et unités cohérentes avec la description. Taux de TVA : 20% par défaut (construction neuve), " +
      "10% pour rénovation d'un logement de plus de 2 ans, 5,5% pour travaux d'amélioration énergétique si le client le précise explicitement.",
    outils: [OUTIL_PROPOSER_LIGNES],
    forcerOutil: OUTIL_PROPOSER_LIGNES.nom,
    historique: [
      {
        role: "user",
        contenu: `Catalogue de prestations existant :\n${catalogueTexte}\n\nDescription du chantier à chiffrer :\n${description}`,
      },
    ],
    maxTokens: 4096,
  });

  const appel = appelsOutils.find((a) => a.nom === OUTIL_PROPOSER_LIGNES.nom);
  if (!appel) {
    throw new Error("L'IA n'a pas retourné de lignes de devis exploitables.");
  }

  const input = appel.entree as { lignes: Array<Partial<LigneDevis>> };
  if (!Array.isArray(input.lignes) || input.lignes.length === 0) {
    throw new Error("L'IA n'a proposé aucune ligne. Précise davantage la description du chantier.");
  }

  return input.lignes.map((l) => ({
    designation: String(l.designation ?? "").slice(0, 200),
    description: l.description ? String(l.description) : null,
    type: TYPES_CLES.includes(l.type as string) ? (l.type as string) : "forfait",
    quantite: Number(l.quantite) > 0 ? Number(l.quantite) : 1,
    unite: (UNITES as readonly string[]).includes(l.unite as string) ? (l.unite as string) : "u",
    prix_unitaire_ht: Math.max(0, Number(l.prix_unitaire_ht) || 0),
    remise_ligne: 0,
    taux_tva: (TAUX_TVA as readonly number[]).includes(Number(l.taux_tva)) ? Number(l.taux_tva) : 20,
  }));
}
