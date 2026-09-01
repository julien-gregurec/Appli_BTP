import { describe, expect, it } from "vitest";
import { traduireErreurAuth } from "./auth-erreurs";

describe("traduireErreurAuth", () => {
  it("traduit les messages Supabase Auth connus", () => {
    expect(traduireErreurAuth("User already registered")).toBe("Un compte existe déjà avec cette adresse email.");
    expect(traduireErreurAuth("Invalid login credentials")).toBe("Adresse email ou mot de passe incorrect.");
    expect(traduireErreurAuth("Email not confirmed")).toBe("Confirmez votre adresse email avant de vous connecter.");
  });

  it("traduit le refus de changement de mot de passe lié au second facteur (MFA/AAL2)", () => {
    const attendu = "Vérification en deux étapes requise pour changer le mot de passe.";
    for (const brut of [
      "AAL2 required to change password",
      "insufficient_aal",
      "A reauthentication is needed to update the user's password",
      "Password update requires MFA verification",
    ]) {
      expect(traduireErreurAuth(brut)).toBe(attendu);
    }
  });

  it("ne renvoie jamais le texte technique brut pour un message inconnu", () => {
    const brut = "duplicate key value violates unique constraint \"utilisateurs_pkey\"";
    expect(traduireErreurAuth(brut)).not.toContain("constraint");
    expect(traduireErreurAuth(null)).not.toBe(null);
    expect(traduireErreurAuth(undefined)).toMatch(/erreur/i);
  });
});
