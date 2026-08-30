import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { tentativeMfaAutorisee } from "@/lib/rate-limit-mfa";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RATE_LIMIT_HMAC_KEY", "secret-de-test");
  vi.stubEnv("NODE_ENV", "test");
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { autorise: true, reessayer_apres: 0 }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tentativeMfaAutorisee — limiteur MFA Colors (HMAC)", () => {
  it("autorise quand la RPC répond autorise=true et cible la bonne politique", async () => {
    await expect(tentativeMfaAutorisee("user-1")).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "consommer_rate_limit",
      expect.objectContaining({ p_cle: "colors:mfa", p_fenetre_secondes: 300, p_maximum: 5 }),
    );
  });

  it("transmet un condensat HMAC (jamais l’identifiant en clair ni un simple SHA-256)", async () => {
    await tentativeMfaAutorisee("user-1");
    const { p_identifiant_hash: hash } = mocks.rpc.mock.calls[0][1] as { p_identifiant_hash: string };
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("user-1");
    const sha256Nu = createHash("sha256").update("utilisateur:colors:mfa:user-1").digest("hex");
    expect(hash).not.toBe(sha256Nu);
  });

  it("refuse quand la limite est atteinte", async () => {
    mocks.rpc.mockResolvedValue({ data: { autorise: false, reessayer_apres: 42 }, error: null });
    await expect(tentativeMfaAutorisee("user-1")).resolves.toBe(false);
  });

  it("échoue fermé quand la RPC renvoie une erreur", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    await expect(tentativeMfaAutorisee("user-1")).resolves.toBe(false);
  });

  it("échoue fermé quand le client admin lève", async () => {
    mocks.createAdminClient.mockImplementation(() => {
      throw new Error("config absente");
    });
    await expect(tentativeMfaAutorisee("user-1")).resolves.toBe(false);
  });

  it("échoue fermé sans secret HMAC en production, sans appeler la RPC", async () => {
    vi.stubEnv("RATE_LIMIT_HMAC_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(tentativeMfaAutorisee("user-1")).resolves.toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
