import { describe, expect, it } from "vitest";
import { construirePromptSystemeAssistant } from "@/lib/ai/assistant";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import { OUTILS_COPILOTE } from "@/lib/ai/copilote";

const ANCIENNES_MENTIONS = /Liria(?: Gestion Pro| Concept)?|LIRIA(?: CONCEPT)?/i;

describe("identite de l'assistant IA", () => {
  it("utilise la nouvelle identite dans les descriptions transmises au modele", () => {
    const descriptions = JSON.stringify(OUTILS_COPILOTE);

    expect(descriptions).toContain(BRAND_NAME);
    expect(descriptions).toContain(PRODUCT_NAME);
    expect(descriptions).not.toMatch(ANCIENNES_MENTIONS);
  });

  it("construit le prompt systeme avec le produit et la marque centralises", () => {
    const prompt = construirePromptSystemeAssistant({
      entrepriseNom: "Entreprise Exemple",
      aujourdhui: "1 août 2026",
      descriptionUtilisateur: "Tu parles avec Camille. ",
      consigneAffectation: "Vérifie les droits de planning. ",
      consigneDevis: "Vérifie les droits de devis. ",
    });

    expect(prompt).toContain(`assistant intégré de ${PRODUCT_NAME}`);
    expect(prompt).toContain(`support ${BRAND_NAME}`);
    expect(prompt).toContain(`abonnement ${PRODUCT_NAME}`);
    expect(prompt).not.toMatch(ANCIENNES_MENTIONS);
  });
});
