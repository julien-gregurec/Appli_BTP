import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Garde-fous sur les fichiers d'association d'application.
 *
 * `apple-app-site-association` et `assetlinks.json` sont récupérés par des ROBOTS SANS
 * SESSION — la CDN d'Apple, celle de Google. S'ils passaient par le proxy d'authentification,
 * ils recevraient une redirection vers /login, et l'association échouerait sans message
 * exploitable. Apple met en outre le résultat en cache, ce qui rend le symptôme durable.
 *
 * Ce défaut a été introduit puis corrigé pendant ce lot. Le test est là pour qu'il ne
 * revienne pas au prochain remaniement du `matcher`.
 */
const PROXY = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
const AASA = readFileSync(new URL("../../../public/.well-known/apple-app-site-association", import.meta.url), "utf8");
const ASSETLINKS = readFileSync(new URL("../../../public/.well-known/assetlinks.json", import.meta.url), "utf8");

describe("association d'application", () => {
  it("laisse .well-known hors du proxy d'authentification", () => {
    const matcher = PROXY.slice(PROXY.indexOf("matcher:"));
    expect(matcher).toContain(".well-known/");
  });

  it("expose des gabarits valides en JSON", () => {
    // Un fichier mal formé est mis en cache par Apple aussi sûrement qu'un fichier correct.
    expect(() => JSON.parse(AASA)).not.toThrow();
    expect(() => JSON.parse(ASSETLINKS)).not.toThrow();
  });

  it("porte le même identifiant d'application que la coque", () => {
    expect(AASA).toContain("fr.elsatia.gestionpro");
    expect(ASSETLINKS).toContain("fr.elsatia.gestionpro");
  });

  it("signale clairement ce qui reste à renseigner par un humain", () => {
    // Tant que ces marqueurs sont là, les liens profonds ne fonctionnent pas — et c'est
    // préférable à une association mal formée qui « marcherait presque ».
    expect(AASA).toContain("REMPLACER_PAR_TEAM_ID");
    expect(ASSETLINKS).toContain("REMPLACER_PAR_EMPREINTE_SHA256");
  });
});
