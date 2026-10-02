import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ibanTest } from "@/test/banking-fixtures";
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
    const iban = ibanTest(4);
    const chiffre = chiffrerDonneeBancaire(iban);
    expect(chiffre).not.toContain(iban);
    expect(dechiffrerDonneeBancaire(chiffre)).toBe(iban);
    expect(empreinteIban(iban)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("clé historique seule : écriture v1 et empreinte SHA-256 inchangées (retour arrière du code possible)", () => {
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const iban = ibanTest(1);
    expect(chiffrerDonneeBancaire(iban).startsWith("v1:")).toBe(true);
    expect(empreinteIban(iban)).toBe(createHash("sha256").update(iban).digest("hex"));
  });

  it("après rotation de l'environnement, les valeurs v1 restent lisibles et les écritures passent en v2/k2", () => {
    const k1 = Buffer.alloc(32, 7).toString("base64");
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEY", k1);
    const iban = ibanTest(2);
    const ancien = chiffrerDonneeBancaire(iban);
    const empreinteAncienne = empreinteIban(iban);
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEYS", `k2:${Buffer.alloc(32, 9).toString("base64")}`);
    vi.stubEnv("BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID", "k2");
    expect(dechiffrerDonneeBancaire(ancien)).toBe(iban);
    const nouveau = chiffrerDonneeBancaire(iban);
    expect(nouveau.startsWith("v2:k2:A256GCM:")).toBe(true);
    expect(dechiffrerDonneeBancaire(nouveau)).toBe(iban);
    expect(empreinteIban(iban)).not.toBe(empreinteAncienne);
    expect(empreinteIban(iban)).not.toBe(createHash("sha256").update(iban).digest("hex"));
  });

  it("sans aucune clé : chiffrement refusé (échec fermé)", () => {
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEY", "");
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEYS", "");
    expect(() => chiffrerDonneeBancaire(ibanTest(3))).toThrow(/Aucune clé bancaire/);
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

  it("état de paiement : clé dédiée prioritaire, états déjà émis avec l'ancien secret encore acceptés", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T20:00:00Z"));
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    vi.stubEnv("BANK_OAUTH_STATE_HMAC_KEY", "");
    const ancien = creerEtatPaiementBancaire("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    vi.stubEnv("BANK_OAUTH_STATE_HMAC_KEY", "cle-hmac-de-test-uniquement");
    const nouveau = creerEtatPaiementBancaire("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    expect(nouveau).not.toBe(ancien);
    expect(verifierEtatPaiementBancaire(ancien)?.lotId).toBe("11111111-1111-4111-8111-111111111111");
    expect(verifierEtatPaiementBancaire(nouveau)?.lotId).toBe("11111111-1111-4111-8111-111111111111");
    // La rotation de la clé de chiffrement n'invalide pas un état signé par la clé dédiée.
    vi.stubEnv("BANK_DATA_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(verifierEtatPaiementBancaire(nouveau)?.lotId).toBe("11111111-1111-4111-8111-111111111111");
    expect(verifierEtatPaiementBancaire(ancien)).toBeNull();
  });
});
