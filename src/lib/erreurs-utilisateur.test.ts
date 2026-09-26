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
    expect(message).toBe("Vous n’avez pas les droits nécessaires pour effectuer cette action.");
    spy.mockRestore();
  });

  it("traduit une violation de clé étrangère en message de dépendance", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", { code: "23503", message: "update or delete on table \"clients\" violates foreign key constraint \"chantiers_client_id_fkey\" on table \"chantiers\"" });
    expect(message).toBe("Impossible d’effectuer cette action : cet élément est utilisé ailleurs.");
    spy.mockRestore();
  });

  it("traduit une exception métier (trigger P0001) en message de conflit", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", { code: "P0001", message: "Les lignes d'une facture émise ne peuvent plus être modifiées" });
    expect(message).toBe("Cette opération n’est pas possible dans l’état actuel du document.");
    spy.mockRestore();
  });

  it("traduit une indisponibilité d'un service externe (Stripe/Brevo)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", new Error("Stripe request failed: connection timeout"));
    expect(message).toBe("Le service est momentanément indisponible. Réessayez dans quelques instants.");
    spy.mockRestore();
  });

  it("traduit une ressource introuvable (PGRST116)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    expect(message).toBe("Élément introuvable.");
    spy.mockRestore();
  });

  it("retombe sur le message générique serveur pour une erreur inconnue", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = messageErreurUtilisateur("test", new Error("something completely unexpected happened"));
    expect(message).toBe("Une erreur est survenue. Réessayez dans un instant.");
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
