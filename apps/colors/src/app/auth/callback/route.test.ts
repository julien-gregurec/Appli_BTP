import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "@/app/auth/callback/route";

const ORIGINE = "https://colors.elsatia.fr";

function client() {
  return { auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) } };
}

/** Reproduit l'appel réel : le navigateur envoie `next` encodé dans l'URL. */
async function localisation(nextEncode: string) {
  const reponse = await GET(new Request(`${ORIGINE}/auth/callback?code=abc&next=${nextEncode}`));
  return reponse.headers.get("location");
}

describe("/auth/callback — destination de retour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(client());
  });

  it("suit une destination locale", async () => {
    await expect(localisation("%2Finventaire")).resolves.toBe(`${ORIGINE}/inventaire`);
  });

  it("replie sur le tableau de bord sans paramètre `next`", async () => {
    const reponse = await GET(new Request(`${ORIGINE}/auth/callback?code=abc`));
    expect(reponse.headers.get("location")).toBe(`${ORIGINE}/dashboard`);
  });

  it.each([
    ["barre oblique inverse encodée", "/%5Cevil.example.com"],
    ["tabulation encodée", "/%09/evil.example.com"],
    ["chemin relatif au protocole", "%2F%2Fevil.example.com"],
    ["schéma absolu", "https%3A%2F%2Fevil.example.com"],
    ["injection CRLF", "/%0d%0aLocation:https://evil.example.com"],
    ["schéma javascript", "javascript%3Aalert(1)"],
    ["schéma data", "data%3Atext%2Fhtml%2Ctest"],
    ["valeur malformée", "%2F%"],
  ])("n’émet jamais de Location externe (%s)", async (_cas, charge) => {
    const cible = await localisation(charge);
    expect(cible).toBe(`${ORIGINE}/dashboard`);
    expect(cible).not.toMatch(/evil\.example\.com/);
    expect(new URL(cible!).origin).toBe(ORIGINE);
  });
});
