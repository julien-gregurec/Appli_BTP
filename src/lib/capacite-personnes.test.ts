import { describe, expect, it } from "vitest";

import {
  CODE_ERREUR_CAPACITE_PERSONNES,
  estErreurCapacitePersonnes,
  messageErreurUtilisateur,
} from "@/lib/erreurs-utilisateur";

describe("contrat d'erreur du plafond de personnes actives", () => {
  it("expose un code stable", () => {
    expect(CODE_ERREUR_CAPACITE_PERSONNES).toBe("CAPACITE_PERSONNES_ATTEINTE");
  });

  it("reconnaît l'erreur du trigger Postgres (message = code)", () => {
    const erreur = { code: "P0001", message: "CAPACITE_PERSONNES_ATTEINTE" };
    expect(estErreurCapacitePersonnes(erreur)).toBe(true);
  });

  it("reconnaît l'erreur portée par le champ details JSON", () => {
    const erreur = {
      code: "P0001",
      message: "raise exception",
      details: '{"code":"CAPACITE_PERSONNES_ATTEINTE","actives":10,"capacite":10}',
    };
    expect(estErreurCapacitePersonnes(erreur)).toBe(true);
  });

  it("reconnaît une simple chaîne", () => {
    expect(estErreurCapacitePersonnes("… CAPACITE_PERSONNES_ATTEINTE …")).toBe(true);
  });

  it("ne se déclenche pas sur une autre erreur métier", () => {
    expect(estErreurCapacitePersonnes({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(estErreurCapacitePersonnes(null)).toBe(false);
    expect(estErreurCapacitePersonnes(undefined)).toBe(false);
  });

  it("messageErreurUtilisateur renvoie le message capacité dédié, sans détail technique", () => {
    const message = messageErreurUtilisateur("creerEmployeAction", {
      code: "P0001",
      message: "CAPACITE_PERSONNES_ATTEINTE",
    });
    expect(message).toContain("personnes actives");
    expect(message.toLowerCase()).toContain("capacité");
    expect(message).not.toContain("CAPACITE_PERSONNES_ATTEINTE");
    expect(message).not.toContain("P0001");
  });

  it("le message capacité prime sur le repli générique de l'appelant", () => {
    const message = messageErreurUtilisateur(
      "creerEmployeAction",
      { code: "P0001", message: "CAPACITE_PERSONNES_ATTEINTE" },
      "Impossible de créer l’employé.",
    );
    expect(message).toContain("personnes actives");
    expect(message).not.toBe("Impossible de créer l’employé.");
  });

  it("pour une erreur non liée à la capacité, le repli explicite reste prioritaire (inchangé)", () => {
    const message = messageErreurUtilisateur(
      "action",
      { code: "23505", message: "duplicate key" },
      "Message spécifique appelant",
    );
    expect(message).toBe("Message spécifique appelant");
  });
});
