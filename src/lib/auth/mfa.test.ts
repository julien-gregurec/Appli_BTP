import { describe, expect, it } from "vitest";
import type { Factor } from "@supabase/supabase-js";
import { avecDelai, codeTotpValide, decisionGardeMfa, facteurTotpPourChallenge, facteursTotp, facteursTotpVerifies, peutSupprimerFacteur } from "./mfa";

function facteur(id: string, status: "verified" | "unverified" = "verified", type: "totp" | "phone" = "totp"): Factor {
  return { id, status, factor_type: type, created_at: "2026-09-02", updated_at: "2026-09-02" } as Factor;
}

describe("politique MFA ELSATIA", () => {
  it("reconnaît l’absence de facteur", () => expect(facteursTotp([])).toEqual([]));
  it("conserve un facteur d’enrôlement TOTP", () => expect(facteursTotp([facteur("e", "unverified")])).toHaveLength(1));
  it("distingue un facteur non vérifié", () => expect(facteursTotpVerifies([facteur("u", "unverified")])).toEqual([]));
  it("valide la forme d’un code correct", () => expect(codeTotpValide("123456")).toBe(true));
  it("refuse la forme d’un code incorrect", () => expect(codeTotpValide("12345x")).toBe(false));
  it("reconnaît un facteur vérifié", () => expect(facteursTotpVerifies([facteur("v")])).toHaveLength(1));
  it("redirige AAL1 avec facteur vers le challenge", () => expect(decisionGardeMfa({ currentLevel: "aal1", nextLevel: "aal2" })).toBe("challenge"));
  it("autorise une session AAL2", () => expect(decisionGardeMfa({ currentLevel: "aal2", nextLevel: "aal2" })).toBe("autoriser"));
  it("oriente AAL1 sans facteur vers l’enrôlement", () => expect(decisionGardeMfa({ currentLevel: "aal1", nextLevel: "aal1" })).toBe("enroler"));
  it("échoue fermé sur erreur AAL", () => expect(decisionGardeMfa({ currentLevel: "aal2", nextLevel: "aal2" }, true)).toBe("refuser"));
  it("échoue fermé sur réponse AAL absente", () => expect(decisionGardeMfa(null)).toBe("refuser"));
  it("autorise le nettoyage d’un facteur incomplet", () => expect(peutSupprimerFacteur({ facteur: facteur("u", "unverified"), facteurs: [facteur("u", "unverified")], aalActuel: "aal1", rolePlateforme: "total", nombreAdminsTotalActifs: 1 }).autorise).toBe(true));
  it("refuse le désenrôlement vérifié en AAL1", () => expect(peutSupprimerFacteur({ facteur: facteur("v"), facteurs: [facteur("v")], aalActuel: "aal1", rolePlateforme: null, nombreAdminsTotalActifs: null }).autorise).toBe(false));
  it("autorise le désenrôlement vérifié en AAL2", () => expect(peutSupprimerFacteur({ facteur: facteur("v"), facteurs: [facteur("v")], aalActuel: "aal2", rolePlateforme: null, nombreAdminsTotalActifs: null }).autorise).toBe(true));
  it("protège le dernier facteur du seul administrateur total", () => expect(peutSupprimerFacteur({ facteur: facteur("v"), facteurs: [facteur("v")], aalActuel: "aal2", rolePlateforme: "total", nombreAdminsTotalActifs: 1 }).autorise).toBe(false));
  it("tolère plusieurs facteurs et sélectionne celui demandé", () => expect(facteurTotpPourChallenge([facteur("a"), facteur("b")], "b")?.id).toBe("b"));
  it("ignore les facteurs non TOTP pour le challenge", () => expect(facteurTotpPourChallenge([facteur("p", "verified", "phone")])).toBeNull());
  it("autorise le retrait d’un facteur quand un autre facteur vérifié reste", () => expect(peutSupprimerFacteur({ facteur: facteur("a"), facteurs: [facteur("a"), facteur("b")], aalActuel: "aal2", rolePlateforme: "total", nombreAdminsTotalActifs: 1 }).autorise).toBe(true));
  it("échoue fermé quand une opération MFA dépasse le délai", async () => {
    await expect(avecDelai(new Promise(() => undefined), 1)).rejects.toThrow("MFA_TIMEOUT");
  });
});
