import { describe, expect, it } from "vitest";
import { construireCsp, entetesSecurite } from "./entetes";

const NONCE = "abc123";

function csp(surcharge: Partial<Parameters<typeof construireCsp>[0]> = {}) {
  return construireCsp({
    nonce: NONCE,
    developpement: false,
    origineSecurisee: true,
    supabaseUrl: "https://projet.supabase.co",
    ...surcharge,
  });
}

function directive(politique: string, nom: string): string {
  const trouvee = politique.split("; ").find((d) => d === nom || d.startsWith(`${nom} `));
  return trouvee ?? "";
}

describe("politique de contenu", () => {
  it("interdit l'encadrement : la page d'acceptation d'invitation est un clic irréversible", () => {
    expect(csp()).toContain("frame-ancestors 'none'");
  });

  it("n'autorise aucun script inline : le nonce et lui seul", () => {
    const politique = csp();
    expect(directive(politique, "script-src")).toContain(`'nonce-${NONCE}'`);
    expect(directive(politique, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("n'autorise 'unsafe-eval' qu'en développement", () => {
    expect(directive(csp({ developpement: true }), "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp(), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("ouvre connect-src sur le seul Supabase configuré, en https et en wss", () => {
    const connect = directive(csp(), "connect-src");
    expect(connect).toContain("https://projet.supabase.co");
    expect(connect).toContain("wss://projet.supabase.co");
    expect(connect).not.toContain("*");
  });

  it("refuse une origine distante en clair, même en développement", () => {
    // C'est ici que la sévérité compte : une variable mal renseignée pointant sur un
    // hôte tiers en http relâcherait la politique sans que rien ne le signale.
    for (const developpement of [true, false]) {
      const connect = directive(
        csp({ supabaseUrl: "http://supabase.exemple.fr", developpement }), "connect-src");
      expect(connect).toBe("connect-src 'self'");
    }
  });

  it("accepte le Supabase de la boucle locale, y compris sous un build de production", () => {
    // La recette exécute `next start` — donc NODE_ENV=production — contre un Supabase
    // local en clair. Refuser cette origine rendait la recette aveugle au binaire déployé.
    for (const developpement of [true, false]) {
      const connect = directive(
        csp({ supabaseUrl: "http://127.0.0.1:54321", developpement }), "connect-src");
      expect(connect).toContain("http://127.0.0.1:54321");
      expect(connect).toContain("ws://127.0.0.1:54321");
    }
  });

  it("ne se brise pas sur une URL Supabase absente ou illisible", () => {
    expect(directive(csp({ supabaseUrl: undefined }), "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp({ supabaseUrl: "pas une url" }), "connect-src")).toBe("connect-src 'self'");
  });

  it("autorise le service worker hors-ligne, et rien d'autre comme worker", () => {
    expect(csp()).toContain("worker-src 'self'");
  });

  it("laisse passer les aperçus locaux (blob) et les URL signées (https)", () => {
    expect(directive(csp(), "img-src")).toContain("blob:");
    expect(directive(csp(), "img-src")).toContain("https:");
  });

  it("nomme l'origine Supabase dans img-src, y compris en clair sur la boucle locale", () => {
    // Régression mesurée en recette : sans cette origine, les photos du document
    // imprimable étaient bloquées et le PDF sortait sans ses preuves.
    const img = directive(csp({ supabaseUrl: "http://127.0.0.1:57321" }), "img-src");
    expect(img).toContain("http://127.0.0.1:57321");
  });

  it("ferme les objets, la base et les cibles de formulaire", () => {
    const politique = csp();
    expect(politique).toContain("object-src 'none'");
    expect(politique).toContain("base-uri 'self'");
    expect(politique).toContain("form-action 'self'");
  });

  it("ne force https que si l'application est elle-même servie en https", () => {
    // Sur une origine en clair, WebKit applique la directive à la lettre et n'atteint
    // plus rien : la recette mobile tombait entièrement, connexion comprise.
    expect(csp({ origineSecurisee: true })).toContain("upgrade-insecure-requests");
    expect(csp({ origineSecurisee: false })).not.toContain("upgrade-insecure-requests");
    // Et le mode de construction n'y change rien : seule l'origine servie décide.
    expect(csp({ origineSecurisee: true, developpement: true }))
      .toContain("upgrade-insecure-requests");
  });
});

describe("en-têtes complémentaires", () => {
  const carte = (origineSecurisee: boolean) =>
    new Map(entetesSecurite(origineSecurisee).map(({ cle, valeur }) => [cle, valeur]));

  it("empêche la fuite du jeton d'invitation par le Referer", () => {
    // `/invitation/<jeton>` a le secret dans son CHEMIN : seule l'origine doit sortir.
    expect(carte(true).get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("refuse le sniffing de type et l'encadrement", () => {
    expect(carte(true).get("X-Content-Type-Options")).toBe("nosniff");
    expect(carte(true).get("X-Frame-Options")).toBe("DENY");
  });

  it("n'exige HSTS que sur une origine déjà sûre", () => {
    expect(carte(true).get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(carte(false).has("Strict-Transport-Security")).toBe(false);
  });

  it("laisse l'appareil photo, ferme la géolocalisation", () => {
    // La capture de terrain ouvre l'appareil photo ; aucun écran ne demande la position.
    const permissions = carte(true).get("Permissions-Policy") ?? "";
    expect(permissions).toContain("camera=(self)");
    expect(permissions).toContain("geolocation=()");
    expect(permissions).toContain("microphone=()");
  });
});
