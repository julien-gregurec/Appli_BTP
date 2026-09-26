import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession },
  })),
}));

import { GET } from "./route";

describe("callback Supabase Auth", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("échange le code PKCE puis redirige vers le nouveau mot de passe", async () => {
    const response = await GET(new NextRequest(
      "https://preview.example.invalid/auth/callback?code=code-test&next=%2Fnouveau-mot-de-passe",
    ));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("code-test");
    expect(response.headers.get("location")).toBe("https://preview.example.invalid/nouveau-mot-de-passe");
  });

  it.each([
    "https%3A%2F%2Fevil.example",
    "%2F%2Fevil.example",
    "%2F%252f%252fevil.example",
  ])("remplace un paramètre next externe ou ambigu par la destination sûre", async (next) => {
    const response = await GET(new NextRequest(
      `https://preview.example.invalid/auth/callback?code=code-test&next=${next}`,
    ));

    expect(response.headers.get("location")).toBe("https://preview.example.invalid/dashboard");
  });
});
