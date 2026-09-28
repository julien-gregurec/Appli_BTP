import { describe, expect, it } from "vitest";
import {
  APPLICATIONS_EMAIL,
  cheminInterneStrict,
  lienApplication,
  lienAppartientA,
  origineApplication,
  resoudreEnvironnementEmail,
  type CodeApplicationEmail,
} from "./index";

const PROD = { ELSATIA_APPLICATION_ENV: "production" };
const ORIGINES_PROD = {
  ...PROD,
  NEXT_PUBLIC_APP_URL: "https://app.elsatia.fr",
  NEXT_PUBLIC_TOOLS_URL: "https://tools.elsatia.fr",
  NEXT_PUBLIC_COLORS_URL: "https://colors.elsatia.fr",
  NEXT_PUBLIC_RESERVES_URL: "https://reserves.elsatia.fr/",
  NEXT_PUBLIC_STUDIO_URL: "https://studio.elsatia.fr",
};

describe("environnement d'expédition", () => {
  it("n'est Production que sur déclaration explicite", () => {
    expect(resoudreEnvironnementEmail(PROD)).toBe("production");
    expect(resoudreEnvironnementEmail({ ELSATIA_APPLICATION_ENV: "production", VERCEL_ENV: "production" })).toBe("production");
  });

  it("classe hors Production tout indicateur absent, inconnu ou contradictoire", () => {
    expect(resoudreEnvironnementEmail({})).toBe("local");
    expect(resoudreEnvironnementEmail({ ELSATIA_APPLICATION_ENV: "prod" })).toBe("local");
    expect(resoudreEnvironnementEmail({ VERCEL_ENV: "production" })).toBe("preview");
    expect(resoudreEnvironnementEmail({ ELSATIA_APPLICATION_ENV: "production", VERCEL_ENV: "preview" })).toBe("preview");
    expect(resoudreEnvironnementEmail({ ELSATIA_APPLICATION_ENV: "local", VERCEL_ENV: "production" })).toBe("preview");
    expect(resoudreEnvironnementEmail({ NODE_ENV: "test" })).toBe("test");
  });
});

describe("domaines — une origine par application", () => {
  const attendus: Record<CodeApplicationEmail, string> = {
    gestion_pro: "https://app.elsatia.fr",
    tools: "https://tools.elsatia.fr",
    colors: "https://colors.elsatia.fr",
    reserves: "https://reserves.elsatia.fr",
    studio: "https://studio.elsatia.fr",
  };

  for (const [code, origine] of Object.entries(attendus) as [CodeApplicationEmail, string][]) {
    it(`${code} → ${origine} en Production`, () => {
      const resultat = origineApplication(code, ORIGINES_PROD);
      expect(resultat).toMatchObject({ ok: true, origine });
      const lien = lienApplication(code, "/dashboard", { environnement: ORIGINES_PROD });
      expect(lien).toEqual({ ok: true, url: `${origine}/dashboard` });
    });
  }

  it("aucune application ne partage l'origine d'une autre (pas de SiteURL unique)", () => {
    const hotes = Object.values(APPLICATIONS_EMAIL).map((a) => a.hoteProduction);
    expect(new Set(hotes).size).toBe(hotes.length);
    const variables = Object.values(APPLICATIONS_EMAIL).map((a) => a.variable);
    expect(new Set(variables).size).toBe(variables.length);
  });

  it("refuse en Production une origine d'une AUTRE application (lien croisé)", () => {
    const env = { ...ORIGINES_PROD, NEXT_PUBLIC_RESERVES_URL: "https://app.elsatia.fr" };
    expect(origineApplication("reserves", env)).toEqual({ ok: false, motif: "hote_production_inattendu" });
  });

  it("refuse en Production http, un port, un domaine Vercel, des identifiants", () => {
    for (const valeur of [
      "http://app.elsatia.fr",
      "https://app.elsatia.fr:8443",
      "https://elsatia-gp.vercel.app",
      "https://app.elsatia.fr.evil.example",
    ]) {
      expect(origineApplication("gestion_pro", { ...PROD, NEXT_PUBLIC_APP_URL: valeur }).ok).toBe(false);
    }
    expect(origineApplication("gestion_pro", { ...PROD, NEXT_PUBLIC_APP_URL: "https://u:p@app.elsatia.fr" }))
      .toEqual({ ok: false, motif: "identifiants_incorpores" });
  });

  it("refuse en Preview un hôte de Production et localhost", () => {
    const preview = { ELSATIA_APPLICATION_ENV: "preview" };
    expect(origineApplication("colors", { ...preview, NEXT_PUBLIC_COLORS_URL: "https://colors.elsatia.fr" }))
      .toEqual({ ok: false, motif: "hote_production_hors_production" });
    expect(origineApplication("colors", { ...preview, NEXT_PUBLIC_COLORS_URL: "https://localhost:3010" }))
      .toEqual({ ok: false, motif: "hote_local_hors_local" });
    expect(origineApplication("colors", { ...preview, NEXT_PUBLIC_COLORS_URL: "http://colors-preview.example" }))
      .toEqual({ ok: false, motif: "schema_interdit" });
    expect(origineApplication("colors", { ...preview, NEXT_PUBLIC_COLORS_URL: "https://colors-git-x.vercel.app" }).ok).toBe(true);
  });

  it("n'invente aucune origine quand la variable est absente", () => {
    expect(origineApplication("studio", PROD)).toEqual({ ok: false, motif: "origine_absente" });
    expect(lienApplication("studio", "/dashboard", { environnement: PROD })).toEqual({ ok: false, motif: "origine_absente" });
  });
});

describe("sécurité des liens", () => {
  const dangereux = [
    "//evil.example",
    "/\\evil.example",
    "/%5Cevil.example",
    "/%2F%2Fevil.example",
    "/%252F%252Fevil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/ok\r\nSet-Cookie:x=1",
    "/%0d%0aLocation:%20https://evil.example",
    "/\u2028evil",
    "",
    "relatif",
  ];

  it.each(dangereux)("open redirect refusé : %j", (chemin) => {
    expect(cheminInterneStrict(chemin)).toBe(false);
    expect(lienApplication("gestion_pro", chemin, { environnement: ORIGINES_PROD })).toEqual({ ok: false, motif: "chemin_dangereux" });
  });

  it("accepte un chemin interne avec requête", () => {
    expect(cheminInterneStrict("/nouveau-mot-de-passe?x=1")).toBe(true);
  });

  it("host spoofing : l'origine vient de la configuration, jamais d'un en-tête", () => {
    // La fonction ne reçoit AUCUNE requête : un `Host: evil.example` n'a aucun chemin
    // jusqu'au lien. On vérifie qu'un environnement contenant des en-têtes simulés
    // n'influe pas.
    const env = { ...ORIGINES_PROD, HOST: "evil.example", HTTP_X_FORWARDED_HOST: "evil.example" };
    const lien = lienApplication("reserves", "/invitation/abc", { environnement: env });
    expect(lien).toEqual({ ok: true, url: "https://reserves.elsatia.fr/invitation/abc" });
  });

  it("jeton encodé par URLSearchParams, jamais concaténé", () => {
    const lien = lienApplication("colors", "/auth/confirm", {
      environnement: ORIGINES_PROD,
      parametres: { token_hash: "a&next=https://evil.example#x", type: "recovery" },
    });
    expect(lien.ok).toBe(true);
    const url = new URL((lien as { url: string }).url);
    expect(url.origin).toBe("https://colors.elsatia.fr");
    expect(url.searchParams.get("token_hash")).toBe("a&next=https://evil.example#x");
    expect(url.searchParams.get("next")).toBeNull();
    expect(url.hash).toBe("");
  });

  it("reset URL et invitation URL restent sur leur application", () => {
    const reset = lienApplication("gestion_pro", "/auth/confirm", { environnement: ORIGINES_PROD, parametres: { type: "recovery", token_hash: "h" } });
    const invitation = lienApplication("reserves", `/invitation/${encodeURIComponent("jeton/../x")}`, { environnement: ORIGINES_PROD });
    expect(reset.ok && lienAppartientA("gestion_pro", reset.url, ORIGINES_PROD)).toBe(true);
    expect(reset.ok && lienAppartientA("reserves", reset.url, ORIGINES_PROD)).toBe(false);
    expect(invitation.ok && lienAppartientA("reserves", invitation.url, ORIGINES_PROD)).toBe(true);
    expect(invitation.ok && invitation.url).toBe("https://reserves.elsatia.fr/invitation/jeton%2F..%2Fx");
  });

  it("cross-app : un lien Colors n'appartient pas à Gestion Pro, ni un sous-domaine piégé", () => {
    expect(lienAppartientA("gestion_pro", "https://colors.elsatia.fr/x", ORIGINES_PROD)).toBe(false);
    expect(lienAppartientA("gestion_pro", "https://app.elsatia.fr.evil.example/x", ORIGINES_PROD)).toBe(false);
    expect(lienAppartientA("gestion_pro", "https://user@app.elsatia.fr/x", ORIGINES_PROD)).toBe(false);
    expect(lienAppartientA("gestion_pro", "pas une url", ORIGINES_PROD)).toBe(false);
  });
});
