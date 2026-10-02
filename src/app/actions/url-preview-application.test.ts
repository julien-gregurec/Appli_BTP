import { beforeEach, describe, expect, it, vi } from "vitest";

// A-11 (ELSATIA_SATELLITES_PREVIEW_READINESS_V2) — url_preview administrable depuis
// /plateforme/applications par le SEUL propriétaire plateforme. La base reste l'autorité
// (RPC plateforme_definir_url_preview_application : propriétaire + AAL2 + origine stricte) ;
// l'action refuse en amont et ne transmet jamais une URL invalide.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  proprietaire: vi.fn(async () => true),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/multi-app-server", () => ({
  estAdministrateurPlateformeMultiApp: async () => true,
  estProprietairePlateforme: mocks.proprietaire,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

const { definirUrlPreviewApplicationAction } = await import("./multi-app");
const { normaliserUrlPreview } = await import("@/lib/multi-app");

const definir = (code: string, url: string) => {
  const formData = new FormData();
  formData.set("url_preview", url);
  return definirUrlPreviewApplicationAction(code, formData);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.proprietaire.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: "https://colors-git-main.vercel.app", error: null });
});

describe("A-11 — normalisation identique à la base", () => {
  it("accepte une origine https://<projet>.vercel.app, normalisée", () => {
    expect(normaliserUrlPreview("  HTTPS://Colors-Git-Main.vercel.app/ ")).toEqual({ ok: true, url: "https://colors-git-main.vercel.app" });
    expect(normaliserUrlPreview("")).toEqual({ ok: true, url: null });
  });
  it.each([
    "http://colors-git-main.vercel.app",
    "javascript:alert(1)",
    "data:text/html,x",
    "https://evil.example.com",
    "https://colors.elsatia.fr",
    "https://colors-git-main.vercel.app.evil.com",
    "https://colors-git-main.vercel.app/login?next=https://evil.example.com",
    "https://u:p@colors-git-main.vercel.app",
    "//colors-git-main.vercel.app",
    "https://colors-git-main.vercel.app:8443",
  ])("refuse %s", (brute) => {
    expect(normaliserUrlPreview(brute).ok).toBe(false);
  });
});

describe("A-11 — action propriétaire", () => {
  it("un non-propriétaire (admin plateforme délégué, admin entreprise) est renvoyé sans appel RPC", async () => {
    mocks.proprietaire.mockResolvedValue(false);
    await expect(definir("colors", "https://colors-git-main.vercel.app")).rejects.toThrow("REDIRECT:/plateforme/applications?error=");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("une URL invalide n'atteint jamais la base", async () => {
    await expect(definir("colors", "https://colors.elsatia.fr")).rejects.toThrow("REDIRECT:/plateforme/applications?error=");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("un code d'application invalide est refusé", async () => {
    await expect(definir("../colors", "https://colors-git-main.vercel.app")).rejects.toThrow("REDIRECT:/plateforme/applications?error=");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("une URL valide est transmise normalisée à la RPC propriétaire", async () => {
    await expect(definir("colors", "HTTPS://Colors-Git-Main.vercel.app/")).rejects.toThrow("REDIRECT:/plateforme/applications?succes=");
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_definir_url_preview_application", {
      p_code: "colors",
      p_url: "https://colors-git-main.vercel.app",
    });
  });

  it("le refus de la base (AAL2, rôle) est rapporté, pas masqué", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Authentification forte AAL2 requise" } });
    await expect(definir("colors", "https://colors-git-main.vercel.app")).rejects.toThrow(/REDIRECT:\/plateforme\/applications\?error=.*AAL2/);
  });
});
