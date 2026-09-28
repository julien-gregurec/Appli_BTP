import { describe, expect, it } from "vitest";
import {
  CODE_HOTE_SUSPENDU, MOTIF_FILE_HORS_LIGNE, commandesReserve, estRefusHoteSuspendu,
  motifRefusMutation,
} from "./suspension-hote";

// Erreur telle que PostgREST la rend pour `raise exception using hint = …` (SQLSTATE 42501).
const refusHote = {
  code: "42501",
  message: "Organisation hôte suspendue : cette réserve est en lecture seule.",
  hint: CODE_HOTE_SUSPENDU,
  details: "Les réserves restent consultables ; …",
};

describe("D-01 — hôte suspendu : lecture seule", () => {
  it("reconnaît le refus par son indice stable", () => {
    expect(estRefusHoteSuspendu(refusHote)).toBe(true);
    expect(estRefusHoteSuspendu({ ...refusHote, message: "autre texte" })).toBe(true);
  });

  it("reconnaît le refus par son message si l'indice n'est pas relayé", () => {
    expect(estRefusHoteSuspendu({ message: refusHote.message, hint: null })).toBe(true);
  });

  it("ne confond pas les autres refus avec la suspension de l'hôte", () => {
    expect(estRefusHoteSuspendu({ message: "Commentaire non autorisé", hint: null })).toBe(false);
    expect(estRefusHoteSuspendu({ message: "Action non autorisée sur cette réserve" })).toBe(false);
    expect(estRefusHoteSuspendu({ code: "42501", message: "permission denied for table reserves" })).toBe(false);
    expect(estRefusHoteSuspendu(null)).toBe(false);
    expect(estRefusHoteSuspendu(undefined)).toBe(false);
  });

  it("donne à la file hors-ligne un motif qui dit que la saisie est conservée", () => {
    expect(motifRefusMutation(refusHote, "x")).toBe(MOTIF_FILE_HORS_LIGNE);
    expect(MOTIF_FILE_HORS_LIGNE).toMatch(/lecture seule/);
    expect(MOTIF_FILE_HORS_LIGNE).toMatch(/reste sur cet appareil/);
  });

  it("laisse passer tel quel le motif des autres refus", () => {
    expect(motifRefusMutation({ message: "Photo obligatoire" }, "x")).toBe("Photo obligatoire");
    expect(motifRefusMutation(null, "Rejeu impossible.")).toBe("Rejeu impossible.");
    expect(motifRefusMutation({ message: "" }, "Rejeu impossible.")).toBe("Rejeu impossible.");
  });

  it("masque toutes les commandes d'écriture en lecture seule", () => {
    expect(Object.values(commandesReserve(true)).every((v) => v === false)).toBe(true);
  });

  it("ne masque rien quand l'hôte est actif", () => {
    expect(Object.values(commandesReserve(false)).every((v) => v === true)).toBe(true);
  });

  it("couvre exactement les écritures bloquées par la base", () => {
    expect(Object.keys(commandesReserve(false)).sort()).toEqual([
      "commenter", "demanderLevee", "joindrePhoto", "repondreResponsabilite", "retirerPhoto",
    ]);
  });
});
