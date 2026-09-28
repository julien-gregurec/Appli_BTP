import { describe, expect, it } from "vitest";
import { renderRefusal } from "../src/lib/render-refusal";

describe("render admission refusals", () => {
  it.each([
    ["RENDER_LIMIT_ACTIVE", 429],
    ["RENDER_LIMIT_RATE", 429],
    ["RENDER_ADMISSION_CLOSED", 503],
    ["ASSET_MISSING", 400],
    ["TIMELINE_INVALID", 400],
  ])("%s keeps a fixed French message and status %i", (message, status) => {
    const r = renderRefusal({ code: "22023", message });
    expect(r.status).toBe(status);
    expect(r.message).not.toContain(message);
    expect(r.message).toMatch(/[a-zé]{4}/);
  });
  it("keeps genuine authorization and conflict statuses", () => {
    expect(renderRefusal({ code: "42501", message: "x" }).status).toBe(403);
    expect(renderRefusal({ code: "40001", message: "x" }).status).toBe(409);
  });
  it("passes curated validation sentences and hides unexpected internals", () => {
    expect(
      renderRefusal({ code: "22023", message: "Profil invalide" }).message,
    ).toBe("Profil invalide");
    const hidden = renderRefusal({
      code: "XX000",
      message: "relation studio_render_jobs does not exist",
    });
    expect(hidden.message).toBe("Création du rendu refusée.");
    expect(hidden.status).toBe(400);
  });
});
