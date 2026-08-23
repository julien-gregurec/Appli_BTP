import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

const { creerProviderOpenAI } = await import("./openai");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function reponseNonStreamee(usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null) {
  return { output_text: "Réponse", output: [], usage };
}

describe("provider OpenAI — usage/coût (AI-LAUNCH-V1C)", () => {
  it("extrait les jetons et calcule un coût estimé HT pour une complétion simple", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-5.1");
    create.mockResolvedValue(reponseNonStreamee({ input_tokens: 1000, output_tokens: 500, total_tokens: 1500 }));
    const provider = creerProviderOpenAI();

    const resultat = await provider.completer({ historique: [{ role: "user", contenu: "Bonjour" }] });

    expect(resultat.usage).toEqual({
      jetonsEntree: 1000,
      jetonsSortie: 500,
      jetonsTotal: 1500,
      coutEstimeHT: (1000 * 1.25 + 500 * 10) / 1_000_000,
    });
  });

  it("renvoie usage undefined si l'API ne fournit aucune donnée d'usage", async () => {
    create.mockResolvedValue(reponseNonStreamee(null));
    const provider = creerProviderOpenAI();

    const resultat = await provider.completer({ historique: [{ role: "user", contenu: "Bonjour" }] });

    expect(resultat.usage).toBeUndefined();
  });

  it("extrait aussi l'usage pour l'analyse de fichier (completerAvecFichier)", async () => {
    create.mockResolvedValue(reponseNonStreamee({ input_tokens: 800, output_tokens: 200, total_tokens: 1000 }));
    const provider = creerProviderOpenAI();

    const resultat = await provider.completerAvecFichier({
      texte: "Analyse ce document",
      fichier: { base64: "AAAA", mimeType: "application/pdf" },
    });

    expect(resultat.texte).toBe("Réponse");
    expect(resultat.usage?.jetonsTotal).toBe(1000);
  });

  it("passe un timeout de requête explicite à chaque appel (AI-LAUNCH-V1B, aucun timeout n'existait avant)", async () => {
    create.mockResolvedValue(reponseNonStreamee(null));
    const provider = creerProviderOpenAI();

    await provider.completer({ historique: [{ role: "user", contenu: "Bonjour" }] });

    expect(create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ timeout: 25_000 }));
  });
});
