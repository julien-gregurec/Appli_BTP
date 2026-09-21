import { afterEach, describe, expect, it, vi } from "vitest";

const creerProviderOpenAI = vi.fn();
vi.mock("@/lib/ai/providers/openai", () => ({ creerProviderOpenAI }));

const { obtenirProviderIA } = await import("./provider");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("garde-fou IA global", () => {
  it("bloque avant l'instanciation du provider OpenAI", () => {
    vi.stubEnv("FEATURE_AI_ENABLED", "false");
    expect(() => obtenirProviderIA()).toThrow(/désactivées/);
    expect(creerProviderOpenAI).not.toHaveBeenCalled();
  });

  it("bloque aussi quand la variable est absente (fail-closed, AI-LAUNCH-V1B)", () => {
    expect(() => obtenirProviderIA()).toThrow(/désactivées/);
    expect(creerProviderOpenAI).not.toHaveBeenCalled();
  });
});
