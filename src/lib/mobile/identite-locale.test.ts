import { describe, expect, it } from "vitest";
import { cleLocale, estCleGestionPro, identiteValide, prefixeIdentite } from "@/lib/mobile/identite-locale";

const A = { entrepriseId: "ent-a", utilisateurId: "usr-1" };
const B = { entrepriseId: "ent-b", utilisateurId: "usr-1" };
const C = { entrepriseId: "ent-a", utilisateurId: "usr-2" };

describe("clé de stockage local", () => {
  it("sépare deux entreprises pour un même utilisateur", () => {
    // Le cas réel : un intérimaire déclaré chez deux sociétés du même groupe.
    expect(cleLocale(A, "brouillon:note")).not.toBe(cleLocale(B, "brouillon:note"));
  });

  it("sépare deux utilisateurs d'une même entreprise", () => {
    // Le cas réel : le téléphone de chantier que deux salariés se passent.
    expect(cleLocale(A, "brouillon:note")).not.toBe(cleLocale(C, "brouillon:note"));
  });

  it("est stable pour une même identité et un même usage", () => {
    expect(cleLocale(A, "file")).toBe(cleLocale({ ...A }, "file"));
  });

  it("refuse de fabriquer une clé sans identité complète", () => {
    // Point central : on renvoie `null` plutôt qu'une clé « anonyme », qui serait
    // partagée par tous les comptes de l'appareil — exactement ce qu'on veut empêcher.
    expect(cleLocale(null, "file")).toBeNull();
    expect(cleLocale({ entrepriseId: "ent-a" }, "file")).toBeNull();
    expect(cleLocale({ utilisateurId: "usr-1" }, "file")).toBeNull();
    expect(cleLocale({ entrepriseId: "", utilisateurId: "usr-1" }, "file")).toBeNull();
  });

  it("reconnaît une identité complète", () => {
    expect(identiteValide(A)).toBe(true);
    expect(identiteValide({ entrepriseId: "x" })).toBe(false);
  });

  it("préfixe une identité de manière à ne viser qu'elle", () => {
    const prefixe = prefixeIdentite(A);
    expect(cleLocale(A, "file")!.startsWith(prefixe)).toBe(true);
    expect(cleLocale(B, "file")!.startsWith(prefixe)).toBe(false);
    expect(cleLocale(C, "file")!.startsWith(prefixe)).toBe(false);
  });
});

describe("reconnaissance des clés de Gestion Pro", () => {
  it("reconnaît ses propres clés, historique comprise", () => {
    expect(estCleGestionPro(cleLocale(A, "brouillon:note")!)).toBe(true);
    expect(estCleGestionPro("elsatia-dashboard-masques")).toBe(true);
    expect(estCleGestionPro("liria-dashboard-masques")).toBe(true);
  });

  it("ne revendique pas les clés qui ne sont pas les siennes", () => {
    // La même origine héberge d'autres applications ELSATIA : les effacer ferait perdre
    // à l'utilisateur un travail sans rapport avec la session qu'il ferme.
    expect(estCleGestionPro("elsatia:reserves:ent-a:usr-1:file")).toBe(false);
    expect(estCleGestionPro("sb-projet-auth-token")).toBe(false);
    expect(estCleGestionPro("theme")).toBe(false);
  });
});
