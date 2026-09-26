import { describe, expect, it } from "vitest";

import { DESTINATION_INTERNE_PAR_DEFAUT, cheminInterneSur } from "@/lib/redirection-sure";

const REPLI = DESTINATION_INTERNE_PAR_DEFAUT;

describe("cheminInterneSur — navigations locales acceptées", () => {
  it.each([
    ["/", "/"],
    ["/dashboard", "/dashboard"],
    ["/profil", "/profil"],
    ["/login?x=1", "/login?x=1"],
    ["/foo#bar", "/foo#bar"],
    ["/inventaire/9f1c2b3a-0000-4000-8000-000000000001", "/inventaire/9f1c2b3a-0000-4000-8000-000000000001"],
    ["/inventaire?etat=ouvert&depot=hall%201", "/inventaire?etat=ouvert&depot=hall%201"],
  ])("accepte %s", (entree, attendu) => {
    expect(cheminInterneSur(entree)).toBe(attendu);
  });
});

describe("cheminInterneSur — destinations externes refusées", () => {
  it.each([
    ["schéma absolu https", "https://evil.example.com"],
    ["schéma absolu http", "http://evil.example.com"],
    ["chemin relatif au protocole", "//evil.example.com"],
    ["barre oblique inverse littérale", "/\\evil.example.com"],
    ["barre oblique inverse encodée", "/%5Cevil.example.com"],
    ["tabulation encodée", "/%09/evil.example.com"],
    ["tabulation littérale", "/\t/evil.example.com"],
    ["injection CRLF encodée", "/%0d%0aLocation:https://evil.example.com"],
    ["injection CRLF littérale", "/\r\nLocation:https://evil.example.com"],
    ["schéma javascript", "javascript:alert(1)"],
    ["schéma data", "data:text/html,test"],
    ["schéma javascript encodé en casse mixte", "JaVaScRiPt:alert(1)"],
    ["hôte externe avec identifiants", "https://colors.elsatia.fr@evil.example.com/"],
    ["barre oblique inverse doublement encodée", "/%255Cevil.example.com"],
    ["blanc de tête", " //evil.example.com"],
    ["retour à la ligne de tête", "\n//evil.example.com"],
    ["caractère nul encodé", "/%00//evil.example.com"],
    ["chemin relatif", "dashboard"],
    ["chemin remontant relatif", "../../evil"],
  ])("refuse %s", (_cas, entree) => {
    expect(cheminInterneSur(entree)).toBe(REPLI);
  });
});

describe("cheminInterneSur — valeurs absentes ou malformées", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["chaîne vide", ""],
    ["tableau (searchParams répété)", ["/dashboard", "/inventaire"]],
    ["nombre", 42],
    ["objet", { toString: () => "/inventaire" }],
  ])("replie sur la destination interne pour %s", (_cas, entree) => {
    expect(cheminInterneSur(entree)).toBe(REPLI);
  });

  it.each([
    ["pourcentage isolé", "/%"],
    ["séquence pourcent incomplète", "/foo%E0%A4"],
    ["séquence pourcent invalide", "/foo%zz"],
  ])("ne lève jamais sur %s", (_cas, entree) => {
    expect(() => cheminInterneSur(entree)).not.toThrow();
    expect(cheminInterneSur(entree)).toBe(REPLI);
  });
});

describe("cheminInterneSur — repli explicite", () => {
  it("respecte le repli fourni par l’appelant", () => {
    expect(cheminInterneSur("https://evil.example.com", "/login")).toBe("/login");
  });

  it("n’utilise pas le repli quand la destination est locale", () => {
    expect(cheminInterneSur("/inventaire", "/login")).toBe("/inventaire");
  });
});
