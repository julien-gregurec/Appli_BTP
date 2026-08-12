import { describe, expect, it, vi } from "vitest";
import { messageErreurUtilisateur } from "./erreurs-utilisateur";

describe("messageErreurUtilisateur", () => {
  it("traduit un code Postgres de doublon", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", { code: "23505", message: "duplicate key value violates unique constraint \"clients_pkey\"" });
    expect(message).toBe("Cet élément existe déjà.");
    spy.mockRestore();
  });

  it("traduit une violation RLS en message de droits", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", new Error("new row violates row-level security policy for table \"clients\""));
    expect(message).toBe("Vous n’avez pas les droits nécessaires pour cette action.");
    spy.mockRestore();
  });

  it("ne renvoie jamais le texte technique brut", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", new Error("null value in column \"entreprise_id\" violates not-null constraint"));
    expect(message).not.toContain("entreprise_id");
    expect(message).not.toContain("constraint");
    spy.mockRestore();
  });

  it("journalise l'erreur réelle côté serveur", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    messageErreurUtilisateur("creerClientAction", new Error("boom"));
    expect(spy).toHaveBeenCalledWith("creerClientAction", expect.any(Error));
    spy.mockRestore();
  });

  it("préfère un message de repli explicite au message générique par catégorie", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", new Error("boom"), "Impossible d’enregistrer ce client. Vérifiez les informations saisies.");
    expect(message).toBe("Impossible d’enregistrer ce client. Vérifiez les informations saisies.");
    spy.mockRestore();
  });
});
