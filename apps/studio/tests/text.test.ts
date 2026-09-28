import { describe, expect, it } from "vitest";
import { boundedText, renderableText } from "@elsatia/studio-domain";

describe("renderable overlay text", () => {
  it.each([
    "Chantier Strasbourg rénové",
    "Été 2026 — Croatie",
    "Ça, c’est « l’après » : 12,5 % · 1 200 €",
    "Ремонт квартиры",
    "Tiếng Việt: Hà Nội",
    "Marque™",
  ])("accepts %s", (text) =>
    expect(renderableText(text)).toBe(boundedText(text)),
  );
  it.each(["Plage 😀", "日本語", "Flèche → suite", "✔ Terminé", "α β γ"])(
    "rejects %s with a specific message",
    (text) => {
      expect(() => renderableText(text)).toThrow(/non pris en charge/);
      // Stored legacy text still loads: only the write path is strict.
      expect(() => boundedText(text)).not.toThrow();
    },
  );
  it("still enforces the length and control-character bounds", () => {
    expect(() => renderableText("a".repeat(501))).toThrow(/Texte invalide/);
    expect(() => renderableText(`a${String.fromCharCode(0)}b`)).toThrow(
      /Texte invalide/,
    );
  });
});
