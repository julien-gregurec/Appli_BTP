import { describe, expect, it } from "vitest";

import {
  ANTI_ENCADREMENT,
  POLITIQUE_CONTENU_COLORS,
  POLITIQUE_PERMISSIONS,
  headersSecuriteColors,
} from "@/lib/security/en-tetes";

function valeur(entetes: { key: string; value: string }[], cle: string) {
  return entetes.find((entete) => entete.key.toLowerCase() === cle.toLowerCase())?.value ?? null;
}

describe("en-têtes de sécurité Colors", () => {
  it("interdit l’encadrement par deux mécanismes", () => {
    const entetes = headersSecuriteColors(true);
    expect(valeur(entetes, "X-Frame-Options")).toBe("DENY");
    expect(ANTI_ENCADREMENT).toBe("DENY");
    expect(valeur(entetes, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("interdit le reniflage de type", () => {
    expect(valeur(headersSecuriteColors(false), "X-Content-Type-Options")).toBe("nosniff");
  });

  it("limite la fuite de référent aux navigations de même origine", () => {
    expect(valeur(headersSecuriteColors(false), "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("verrouille la base, les formulaires et les greffons", () => {
    expect(POLITIQUE_CONTENU_COLORS).toContain("base-uri 'self'");
    expect(POLITIQUE_CONTENU_COLORS).toContain("form-action 'self'");
    expect(POLITIQUE_CONTENU_COLORS).toContain("object-src 'none'");
  });

  it("n’émet aucune directive de script ou de style tant que la CSP complète n’est pas livrée", () => {
    // Une directive script-src/style-src/default-src recopiée de Gestion Pro
    // casserait le bootstrap de Next, qui n’a pas de nonce dans Colors.
    expect(POLITIQUE_CONTENU_COLORS).not.toContain("script-src");
    expect(POLITIQUE_CONTENU_COLORS).not.toContain("style-src");
    expect(POLITIQUE_CONTENU_COLORS).not.toContain("default-src");
  });

  it("laisse l’appareil photo à l’application et refuse les autres capacités", () => {
    expect(POLITIQUE_PERMISSIONS).toContain("camera=(self)");
    expect(POLITIQUE_PERMISSIONS).toContain("microphone=()");
    expect(POLITIQUE_PERMISSIONS).toContain("geolocation=()");
    expect(valeur(headersSecuriteColors(false), "Permissions-Policy")).toBe(POLITIQUE_PERMISSIONS);
  });

  it("n’épingle HSTS qu’en production", () => {
    expect(valeur(headersSecuriteColors(true), "Strict-Transport-Security")).toContain("max-age=");
    expect(valeur(headersSecuriteColors(false), "Strict-Transport-Security")).toBeNull();
  });

  it("isole l’application des ouvertures et intégrations tierces", () => {
    const entetes = headersSecuriteColors(true);
    expect(valeur(entetes, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(valeur(entetes, "Cross-Origin-Resource-Policy")).toBe("same-origin");
  });
});
