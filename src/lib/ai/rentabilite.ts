import { obtenirProviderIA } from "@/lib/ai/provider";

export type DonneesRentabiliteChantier = {
  chantierNom: string;
  budgetHt: number;
  factureHt: number;
  heures: number;
  coutMainOeuvre: number;
  coutAchats: number;
  coutStock: number;
  coutNotesFrais: number;
  coutSousTraitance: number;
  coutIndemnitesPaie: number;
  marge: number;
  taux: number | null;
  heuresPrevues: number | null;
  ecartHeures: number | null;
};

export async function analyserRentabilite(donnees: DonneesRentabiliteChantier): Promise<string> {
  const provider = obtenirProviderIA();

  const { texte } = await provider.completer({
    system:
      "Tu es un assistant qui aide un dirigeant d'entreprise du BTP à comprendre la rentabilité d'un chantier. " +
      "On te donne les chiffres déjà calculés (ne recalcule rien, ne devine aucun chiffre absent). " +
      "Le coût de main-d'œuvre prévu, les achats prévus et la marge prévue ne sont pas fournis : ELSATIA ne les calcule pas encore " +
      "de façon fiable (une ligne de devis porte un prix de vente, pas un coût interne). Ne les invente jamais, ne les estime pas toi-même. " +
      "Explique en 3 à 5 puces courtes, en français : le niveau de marge, le poste de coût le plus lourd, " +
      "si le budget devisé a été dépassé ou respecté, et si des heures prévues au devis sont fournies, si elles ont été dépassées. " +
      "Reste factuel, pas de recommandation générique creuse.",
    historique: [
      {
        role: "user",
        contenu: `Chantier « ${donnees.chantierNom} »
Budget devisé HT : ${donnees.budgetHt} €
Facturé HT : ${donnees.factureHt} €
Heures prévues au devis (main-d'œuvre facturée à l'heure) : ${donnees.heuresPrevues === null ? "non renseignées" : `${donnees.heuresPrevues} h`}
Heures pointées : ${donnees.heures} h${donnees.ecartHeures === null ? "" : ` (écart vs prévu : ${donnees.ecartHeures >= 0 ? "+" : ""}${donnees.ecartHeures} h)`}
Coût main-d'œuvre : ${donnees.coutMainOeuvre} €
Achats/charges : ${donnees.coutAchats} €
Stock consommé : ${donnees.coutStock} €
Notes de frais rattachées au chantier : ${donnees.coutNotesFrais} €
Sous-traitance : ${donnees.coutSousTraitance} €
Indemnités de paie (trajet/panier/grand déplacement) : ${donnees.coutIndemnitesPaie} €
Marge : ${donnees.marge} €
Taux de marge : ${donnees.taux === null ? "non calculable (pas de facturation)" : `${donnees.taux.toFixed(1)} %`}
Coût main-d'œuvre prévu, achats prévus, marge prévue : non disponibles dans ELSATIA aujourd'hui.`,
      },
    ],
    maxTokens: 600,
  });

  if (!texte.trim()) throw new Error("L'IA n'a pas pu analyser ce chantier.");
  return texte;
}
