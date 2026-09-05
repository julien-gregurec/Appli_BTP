import { describe, expect, it } from "vitest";

import {
  ANTI_ENCADREMENT,
  POLITIQUE_PERMISSIONS,
  construireCspColors,
  headersSecuriteColors,
  origineAutorisee,
} from "@/lib/security/en-tetes";

const SUPABASE = "https://exemple.supabase.co";

function valeur(entetes: { key: string; value: string }[], cle: string) {
  return entetes.find((entete) => entete.key.toLowerCase() === cle.toLowerCase())?.value ?? null;
}

function csp(surcharge: Partial<Parameters<typeof construireCspColors>[0]> = {}) {
  return construireCspColors({
    nonce: "nonce-de-test",
    estDeveloppement: false,
    urlSupabase: SUPABASE,
    ...surcharge,
  });
}

/** Isole une directive pour l'inspecter jeton par jeton. */
function directive(politique: string, nom: string): string[] | null {
  const trouvee = politique
    .split("; ")
    .find((element) => element === nom || element.startsWith(`${nom} `));
  if (!trouvee) return null;
  return trouvee.split(" ").slice(1);
}

describe("en-têtes constants Colors", () => {
  it("interdit l’encadrement par deux mécanismes", () => {
    expect(valeur(headersSecuriteColors(true), "X-Frame-Options")).toBe("DENY");
    expect(ANTI_ENCADREMENT).toBe("DENY");
    expect(directive(csp(), "frame-ancestors")).toEqual(["'none'"]);
  });

  it("interdit le reniflage de type", () => {
    expect(valeur(headersSecuriteColors(false), "X-Content-Type-Options")).toBe("nosniff");
  });

  it("limite la fuite de référent aux navigations de même origine", () => {
    expect(valeur(headersSecuriteColors(false), "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
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

  it("n’émet plus la CSP en en-tête constant : elle dépend du nonce", () => {
    // Une CSP figée dans `next.config.ts` en doublon de celle du proxy ferait
    // enforcer l'intersection des deux, donc bloquerait les scripts noncés.
    expect(valeur(headersSecuriteColors(true), "Content-Security-Policy")).toBeNull();
    expect(valeur(headersSecuriteColors(false), "Content-Security-Policy")).toBeNull();
  });
});

describe("CSP Colors — socle non négociable", () => {
  it("verrouille le repli, la base, les formulaires, les greffons et les cadres", () => {
    const politique = csp();
    expect(directive(politique, "default-src")).toEqual(["'self'"]);
    expect(directive(politique, "base-uri")).toEqual(["'self'"]);
    expect(directive(politique, "form-action")).toEqual(["'self'"]);
    expect(directive(politique, "object-src")).toEqual(["'none'"]);
    expect(directive(politique, "frame-src")).toEqual(["'none'"]);
    expect(directive(politique, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("force HTTPS en production et laisse le clair en développement", () => {
    expect(csp()).toContain("upgrade-insecure-requests");
    expect(csp({ estDeveloppement: true })).not.toContain("upgrade-insecure-requests");
  });
});

describe("CSP Colors — scripts", () => {
  it("adosse les scripts au nonce de la requête", () => {
    const scripts = directive(csp({ nonce: "abc123" }), "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
  });

  it("n’autorise jamais `unsafe-inline` sur les scripts", () => {
    expect(directive(csp(), "script-src")).not.toContain("'unsafe-inline'");
    expect(directive(csp({ estDeveloppement: true }), "script-src")).not.toContain("'unsafe-inline'");
  });

  it("réserve `unsafe-eval` au développement", () => {
    // React s’en sert pour reconstruire les piles d’erreur serveur ; en
    // production ni React ni Next n’en ont besoin.
    expect(directive(csp(), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(csp({ estDeveloppement: true }), "script-src")).toContain("'unsafe-eval'");
  });
});

describe("CSP Colors — styles", () => {
  it("documente `unsafe-inline` sur les styles, et sur eux seuls", () => {
    // Exception assumée : huit attributs `style` React subsistent (barre de
    // niveau, pastilles de teinte, page global-error). Aucun nonce ne couvre un
    // attribut. Si ce test tombe, c’est que la directive a été élargie ailleurs.
    const politique = csp();
    expect(directive(politique, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    const porteuses = politique
      .split("; ")
      .filter((element) => element.includes("'unsafe-inline'"))
      .map((element) => element.split(" ")[0]);
    expect(porteuses).toEqual(["style-src"]);
  });
});

describe("CSP Colors — origines externes", () => {
  it("n’autorise que Supabase en connexion et en image", () => {
    const politique = csp();
    expect(directive(politique, "connect-src")).toEqual(["'self'", SUPABASE]);
    expect(directive(politique, "img-src")).toEqual(["'self'", "data:", SUPABASE]);
    expect(directive(politique, "font-src")).toEqual(["'self'"]);
    expect(directive(politique, "worker-src")).toEqual(["'self'"]);
    expect(directive(politique, "manifest-src")).toEqual(["'self'"]);
  });

  it("réduit une URL Supabase portant un chemin à son origine", () => {
    // La variable Production porte historiquement un suffixe `/rest/v1/`.
    const politique = csp({ urlSupabase: `${SUPABASE}/rest/v1/` });
    expect(directive(politique, "connect-src")).toEqual(["'self'", SUPABASE]);
  });

  it("n’introduit jamais de joker ni d’origine inattendue", () => {
    const politique = csp();
    expect(politique).not.toContain("*");
    expect(politique).not.toContain("http://");
    const origines = politique
      .split("; ")
      .flatMap((element) => element.split(" ").slice(1))
      .filter((jeton) => jeton.startsWith("http"));
    expect([...new Set(origines)]).toEqual([SUPABASE]);
  });

  it("ne déclare aucune origine WebSocket : Colors n’ouvre aucun canal Realtime", () => {
    expect(csp()).not.toContain("wss:");
  });

  it("se referme sur `self` si l’origine Supabase est absente ou illisible", () => {
    for (const url of [undefined, "", "pas-une-url", "ftp://exemple.test"]) {
      const politique = csp({ urlSupabase: url });
      expect(directive(politique, "connect-src")).toEqual(["'self'"]);
      expect(directive(politique, "img-src")).toEqual(["'self'", "data:"]);
    }
  });
});

describe("origineAutorisee", () => {
  it("retient l’origine HTTPS quel que soit le chemin", () => {
    expect(origineAutorisee(`${SUPABASE}/rest/v1/`, false)).toBe(SUPABASE);
  });

  it("n’accepte le texte clair qu’en développement", () => {
    expect(origineAutorisee("http://127.0.0.1:54321", true)).toBe("http://127.0.0.1:54321");
    expect(origineAutorisee("http://127.0.0.1:54321", false)).toBeNull();
  });

  it("écarte les schémas non HTTP et les valeurs illisibles", () => {
    expect(origineAutorisee("javascript:alert(1)", true)).toBeNull();
    expect(origineAutorisee("pas-une-url", true)).toBeNull();
    expect(origineAutorisee(undefined, true)).toBeNull();
  });
});
