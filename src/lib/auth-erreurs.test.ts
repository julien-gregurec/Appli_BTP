import { describe, expect, it } from "vitest";
import { traduireErreurAuth } from "./auth-erreurs";

describe("traduireErreurAuth", () => {
  it("traduit les messages Supabase Auth connus", () => {
    expect(traduireErreurAuth("User already registered")).toBe("Un compte existe déjà avec cette adresse email.");
    expect(traduireErreurAuth("Invalid login credentials")).toBe("Adresse email ou mot de passe incorrect.");
    expect(traduireErreurAuth("Email not confirmed")).toBe("Confirmez votre adresse email avant de vous connecter.");
  });

  it("ne renvoie jamais le texte technique brut pour un message inconnu", () => {
    const brut = "duplicate key value violates unique constraint \"utilisateurs_pkey\"";
    expect(traduireErreurAuth(brut)).not.toContain("constraint");
    expect(traduireErreurAuth(null)).not.toBe(null);
    expect(traduireErreurAuth(undefined)).toMatch(/erreur/i);
  });
});
