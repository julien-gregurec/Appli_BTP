import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Simule un en-tête d'hôte spoofé par l'attaquant.
const enTetesSpoofes = new Headers({
  origin: "https://evil.example",
  "x-forwarded-host": "evil.example",
  host: "evil.example",
});

vi.mock("next/headers", () => ({
  headers: async () => enTetesSpoofes,
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

import { origineApplication } from "@/app/actions/auth";

describe("origineApplication (anti host-spoofing)", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { process.env.NEXT_PUBLIC_APP_URL = original; });

  it("ignore les en-têtes spoofés quand NEXT_PUBLIC_APP_URL est configuré (production)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.liria.example/";
    const origine = await origineApplication();
    expect(origine).toBe("https://app.liria.example");
    expect(origine).not.toContain("evil.example");
  });

  it("ne retombe sur les en-têtes qu'en l'absence de configuration (développement local)", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const origine = await origineApplication();
    expect(origine).toBe("https://evil.example");
  });
});
