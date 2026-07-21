import Anthropic from "@anthropic-ai/sdk";

export type DonneesRentabiliteChantier = {
  chantierNom: string;
  budgetHt: number;
  factureHt: number;
  heures: number;
  coutMainOeuvre: number;
  coutAchats: number;
  coutSousTraitance: number;
  marge: number;
  taux: number | null;
};

export async function analyserRentabilite(donnees: DonneesRentabiliteChantier): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 600,
    system:
      "Tu es un assistant qui aide un dirigeant d'entreprise du BTP à comprendre la rentabilité d'un chantier. " +
      "On te donne les chiffres déjà calculés (ne recalcule rien, ne devine aucun chiffre absent). " +
      "Explique en 3 à 5 puces courtes, en français : le niveau de marge, le poste de coût le plus lourd, " +
      "et si le budget devisé a été dépassé ou respecté. Reste factuel, pas de recommandation générique creuse.",
    messages: [
      {
        role: "user",
        content: `Chantier « ${donnees.chantierNom} »
Budget devisé HT : ${donnees.budgetHt} €
Facturé HT : ${donnees.factureHt} €
Heures pointées : ${donnees.heures} h
Coût main-d'œuvre : ${donnees.coutMainOeuvre} €
Achats/charges : ${donnees.coutAchats} €
Sous-traitance : ${donnees.coutSousTraitance} €
Marge : ${donnees.marge} €
Taux de marge : ${donnees.taux === null ? "non calculable (pas de facturation)" : `${donnees.taux.toFixed(1)} %`}`,
      },
    ],
  });

  const texte = message.content.find((b) => b.type === "text");
  if (!texte || texte.type !== "text") throw new Error("L'IA n'a pas pu analyser ce chantier.");
  return texte.text;
}
