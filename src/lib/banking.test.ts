import { afterEach, describe, expect, it, vi } from "vitest";
import { bicEstValide, chiffrerDonneeBancaire, creerEtatPaiementBancaire, dechiffrerDonneeBancaire, empreinteIban, finIban, ibanEstValide, normaliserIban, verifierEtatPaiementBancaire } from "./banking";

describe("coordonnées bancaires", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("valide et normalise un IBAN", () => {
    expect(normaliserIban("FR76 3000 6000 0112 3456 7890 189")).toBe("FR7630006000011234567890189");
    expect(ibanEstValide("FR76 3000 6000 0112 3456 7890 189")).toBe(true);
    expect(ibanEstValide("FR76 3000 6000 0112 3456 7890 188")).toBe(false);
    expect(finIban("FR76 3000 6000 0112 3456 7890 189")).toBe("0189");
  });

  it("valide un BIC", () => {
    expect(bicEstValide("AGRIFRPPXXX")).toBe(true);
    expect(bicEstValide("INVALID")).toBe(false);
  });

  it("chiffre les IBAN avec authentification", () => {
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const iban = "FR7630006000011234567890189";
    const chiffre = chiffrerDonneeBancaire(iban);
    expect(chiffre).not.toContain(iban);
    expect(dechiffrerDonneeBancaire(chiffre)).toBe(iban);
    expect(empreinteIban(iban)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signe le retour du prestataire et refuse une altération", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T20:00:00Z"));
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    const etat = creerEtatPaiementBancaire("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    expect(verifierEtatPaiementBancaire(etat)?.lotId).toBe("11111111-1111-4111-8111-111111111111");
    expect(verifierEtatPaiementBancaire(`${etat}x`)).toBeNull();
    vi.useRealTimers();
  });
});
