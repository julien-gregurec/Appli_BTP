import { describe, expect, it } from "vitest";
import { isProvenProduction, mayEmail } from "../src/lib/mail-recipients";

const preview = { ELSATIA_APPLICATION_ENV: "preview", VERCEL_ENV: "preview" };

describe("Studio e-mail recipients", () => {
  it("Preview without allowlist serves nobody", () => {
    expect(mayEmail("client@example.com", preview)).toBe(false);
  });
  it("Preview serves exact addresses and exact domains only", () => {
    const env = { ...preview, EMAIL_PREVIEW_ALLOWLIST: "qa@example.com, @elsatia.fr" };
    expect(mayEmail("QA@example.com", env)).toBe(true);
    expect(mayEmail("recette@elsatia.fr", env)).toBe(true);
    expect(mayEmail("x@sous.elsatia.fr", env)).toBe(false);
    expect(mayEmail("x@elsatia.fr.example", env)).toBe(false);
    expect(mayEmail("client@example.com", env)).toBe(false);
  });
  it("wildcards are ignored", () => {
    expect(mayEmail("a@b.fr", { ...preview, EMAIL_PREVIEW_ALLOWLIST: "*, @*" })).toBe(false);
  });
  it("a Preview that inherited the production flag stays a Preview", () => {
    expect(isProvenProduction({ ELSATIA_APPLICATION_ENV: "production", VERCEL_ENV: "preview" })).toBe(false);
    expect(mayEmail("client@example.com", { ELSATIA_APPLICATION_ENV: "production", VERCEL_ENV: "preview" })).toBe(false);
  });
  it("proven production serves any well-formed address, never an injection", () => {
    const prod = { ELSATIA_APPLICATION_ENV: "production", VERCEL_ENV: "production" };
    expect(mayEmail("client@example.com", prod)).toBe(true);
    expect(mayEmail("a@b.fr,c@d.fr", prod)).toBe(false);
    expect(mayEmail("a@b.fr\nBcc: c@d.fr", prod)).toBe(false);
  });
  it("missing environment flag is not production", () => {
    expect(mayEmail("client@example.com", {})).toBe(false);
  });
});
