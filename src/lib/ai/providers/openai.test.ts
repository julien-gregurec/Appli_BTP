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

describe("provider OpenAI — rétention RGPD (ELSATIA-OPENAI-RGPD-V1)", () => {
  it("completer : transmet store:false (aucune conservation de l'objet Response côté OpenAI)", async () => {
    create.mockResolvedValue(reponseNonStreamee(null));
    const provider = creerProviderOpenAI();

    await provider.completer({ historique: [{ role: "user", contenu: "Bonjour" }] });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ store: false }), expect.anything());
  });

  it("completerAvecFichier : transmet store:false", async () => {
    create.mockResolvedValue(reponseNonStreamee(null));
    const provider = creerProviderOpenAI();

    await provider.completerAvecFichier({
      texte: "Analyse",
      fichier: { base64: "AAAA", mimeType: "application/pdf" },
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ store: false }), expect.anything());
  });

  it("streamer : transmet store:false en même temps que stream:true", async () => {
    create.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "response.output_text.delta", delta: "Ré" };
        yield { type: "response.completed", response: { output_text: "Réponse", usage: null } };
      },
    });
    const provider = creerProviderOpenAI();

    const flux = provider.streamer({ historique: [{ role: "user", contenu: "Bonjour" }] });
    while (!(await flux.next()).done) { /* consomme le flux */ }

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ store: false, stream: true }),
      expect.anything(),
    );
  });

  it("aucun appel du provider ne dépend de previous_response_id / response_id (l'historique est reconstruit)", async () => {
    create.mockResolvedValue(reponseNonStreamee(null));
    const provider = creerProviderOpenAI();

    await provider.completer({
      historique: [
        { role: "user", contenu: "Bonjour" },
        { role: "assistant", contenu: "Bonjour, comment puis-je aider ?" },
        { role: "user", contenu: "Fais un devis" },
      ],
    });

    const [corps] = create.mock.calls[0];
    expect(corps).not.toHaveProperty("previous_response_id");
    expect(corps).not.toHaveProperty("response_id");
    // Tout le contexte est renvoyé à chaque appel : 3 messages d'historique.
    expect(corps.input).toHaveLength(3);
  });
});
