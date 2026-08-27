import { describe, expect, it } from "vitest";
import { evaluerAccesColors } from "@/lib/acces-colors-policy";

describe("décision d’accès au shell Colors", () => {
  it("demande la connexion à un utilisateur non authentifié", () => {
    expect(evaluerAccesColors({ authentifie: false, organisationAutorisee: true, utilisateurHabilite: true })).toBe("connexion");
  });

  it("demande un abonnement quand l’organisation n’a pas Colors", () => {
    expect(evaluerAccesColors({ authentifie: true, organisationAutorisee: false, utilisateurHabilite: true })).toBe("abonnement");
  });

  it("refuse un utilisateur non habilité dans une organisation Colors", () => {
    expect(evaluerAccesColors({ authentifie: true, organisationAutorisee: true, utilisateurHabilite: false })).toBe("habilitation");
  });

  it("autorise Colors sans exiger Gestion Pro", () => {
    expect(evaluerAccesColors({ authentifie: true, organisationAutorisee: true, utilisateurHabilite: true })).toBe("autorise");
  });
});
