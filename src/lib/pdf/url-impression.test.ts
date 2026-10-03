import { describe, expect, it } from "vitest";
import { urlImpressionInterne } from "./url-impression";

describe("urlImpressionInterne", () => {
  it("compose l'URL sur l'origine configurée", () => {
    expect(urlImpressionInterne("/imprimer/devis/abc", "https://app.elsatia.fr")).toBe("https://app.elsatia.fr/imprimer/devis/abc");
  });

  it("refuse de composer sans origine configurée", () => {
    expect(urlImpressionInterne("/imprimer/devis/abc", null)).toBeNull();
  });

  it("ne sort jamais de l'origine configurée", () => {
    expect(urlImpressionInterne("//evil.example/x", "https://app.elsatia.fr")).toBeNull();
    expect(urlImpressionInterne("https://evil.example/x", "https://app.elsatia.fr")).toBeNull();
    expect(urlImpressionInterne("/\\evil.example/x", "https://app.elsatia.fr")).toBeNull();
  });
});
