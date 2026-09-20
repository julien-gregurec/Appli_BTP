import { describe, expect, it } from "vitest";
import {
  downloadFileName,
  renderErrorMessage,
  renderProfileLabel,
  renderStatusLabel,
} from "../src/lib/render-labels";

describe("render labels", () => {
  it.each([
    ["queued", "En attente"],
    ["completed", "Terminé"],
    ["failed", "Échec"],
    ["cancelled", "Annulé"],
  ])("labels %s in French", (status, label) =>
    expect(renderStatusLabel(status)).toBe(label),
  );
  it("never shows an internal error code, only a curated sentence", () => {
    for (const code of [
      "ASSET_MISSING",
      "RENDER_TIMEOUT",
      "TEXT_UNSUPPORTED",
      "WORKER_LOST",
      "HEARTBEAT_LOST",
      "CANCELLED",
      "SOMETHING_NEW",
      null,
    ])
      expect(renderErrorMessage(code)).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
    expect(renderErrorMessage("SOMETHING_NEW")).toMatch(/échoué/);
  });
  it("distinguishes previews from final exports", () => {
    expect(renderProfileLabel("preview", 540, 960)).toBe("Aperçu 540×960");
    expect(renderProfileLabel("standard", 1080, 1080)).toBe(
      "Vidéo finale 1080×1080",
    );
    expect(renderProfileLabel("hd720", 1280, 720)).toBe("Vidéo finale 1280×720");
  });
});

describe("download file name", () => {
  it("is a safe ASCII slug with the resolution", () => {
    expect(downloadFileName("Chantier Strasbourg — Été 2026", 1080, 1920)).toBe(
      "chantier-strasbourg-ete-2026-1080x1920.mp4",
    );
    expect(downloadFileName('a"b\r\nSet-Cookie: x=y', 720, 1280)).toBe(
      "a-b-set-cookie-x-y-720x1280.mp4",
    );
    expect(downloadFileName("日本語", 1280, 720)).toBe("video-1280x720.mp4");
    expect(downloadFileName("x".repeat(200), 1, 1).length).toBeLessThan(80);
  });
});
