import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/app/actions/auth", () => ({ confirmerCompteAction: () => {} }));
vi.mock("@/components/PiedLegal", () => ({ PiedLegal: () => null }));
vi.mock("@/components/BrandWordmark", () => ({ BrandWordmark: () => null }));

import ConfirmerPage from "@/app/auth/confirm/page";

async function rendu(params: Record<string, string>, colorsUrl?: string) {
  if (colorsUrl) process.env.NEXT_PUBLIC_COLORS_URL = colorsUrl;
  else delete process.env.NEXT_PUBLIC_COLORS_URL;
  const element = await ConfirmerPage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

describe("GP /auth/confirm — relais Colors", () => {
  it("propose le relais pour une récupération quand Colors est configurée", async () => {
    const html = await rendu({ token_hash: "abcdef0123456789", type: "recovery" }, "https://colors.elsatia.fr");
    expect(html).toContain("Poursuivre sur ELSATIA Colors");
    expect(html).toContain("https://colors.elsatia.fr/auth/confirm?token_hash=abcdef0123456789&amp;type=recovery");
    expect(html).toContain("Confirmer");
  });

  it("ne propose rien pour une confirmation d’inscription", async () => {
    const html = await rendu({ token_hash: "abcdef0123456789", type: "email" }, "https://colors.elsatia.fr");
    expect(html).not.toContain("Poursuivre sur ELSATIA Colors");
    expect(html).toContain("Confirmer");
  });

  it("reste identique à l’existant quand Colors n’est pas configurée", async () => {
    const html = await rendu({ token_hash: "abcdef0123456789", type: "recovery" });
    expect(html).not.toContain("Poursuivre");
    expect(html).toContain("Confirmer");
  });
});
