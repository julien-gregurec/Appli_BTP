import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageErreurUtilisateur } from "./erreurs-utilisateur";

describe("messageErreurUtilisateur", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renvoie le message de repli fourni, jamais le texte technique brut", () => {
    const erreurBrute = { message: 'new row violates row-level security policy for table "factures"' };
    const message = messageErreurUtilisateur("testAction", erreurBrute, "Impossible d’enregistrer ces modifications.");
    expect(message).toBe("Impossible d’enregistrer ces modifications.");
    expect(message).not.toContain("row-level security");
  });

  it("journalise l'erreur réelle côté serveur (console.error)", () => {
    const erreurBrute = { message: "duplicate key value violates unique constraint" };
    messageErreurUtilisateur("testAction", erreurBrute, "Cet élément existe déjà.");
    expect(console.error).toHaveBeenCalledWith("testAction", erreurBrute);
  });

  it("sans repli, catégorise une violation de contrainte unique comme un doublon", () => {
    expect(messageErreurUtilisateur("testAction", { code: "23505" })).toBe("Cet élément existe déjà.");
    expect(messageErreurUtilisateur("testAction", { message: "duplicate key value" })).toBe("Cet élément existe déjà.");
  });

  it("sans repli, catégorise une violation RLS comme un refus de droits, sans exposer le nom de la policy", () => {
    const message = messageErreurUtilisateur("testAction", { message: 'new row violates row-level security policy "membres factures"' });
    expect(message).toBe("Vous n’avez pas les droits nécessaires pour effectuer cette action.");
    expect(message).not.toContain("membres factures");
  });

  it("sans repli, catégorise une violation de clé étrangère en message de dépendance", () => {
    const message = messageErreurUtilisateur("testAction", { code: "23503", message: 'update or delete on table "clients" violates foreign key constraint "chantiers_client_id_fkey" on table "chantiers"' });
    expect(message).toBe("Impossible d’effectuer cette action : cet élément est utilisé ailleurs.");
    expect(message).not.toContain("chantiers_client_id_fkey");
  });

  it("sans repli, catégorise une exception métier (trigger P0001) en message de conflit", () => {
    const message = messageErreurUtilisateur("testAction", { code: "P0001", message: "Les lignes d'une facture émise ne peuvent plus être modifiées" });
    expect(message).toBe("Cette opération n’est pas possible dans l’état actuel du document.");
  });

  it("sans repli, catégorise une indisponibilité d'un service externe (Stripe/Brevo)", () => {
    expect(messageErreurUtilisateur("testAction", new Error("Stripe request failed: connection timeout"))).toBe(
      "Le service est momentanément indisponible. Réessayez dans quelques instants.",
    );
  });

  it("sans repli et sans catégorie reconnue, retombe sur le message générique serveur", () => {
    expect(messageErreurUtilisateur("testAction", { message: "quelque chose d'imprévu" })).toBe("Une erreur est survenue. Réessayez dans un instant.");
    expect(messageErreurUtilisateur("testAction", null)).toBe("Une erreur est survenue. Réessayez dans un instant.");
  });
});
