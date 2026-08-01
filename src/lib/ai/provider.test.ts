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
});
