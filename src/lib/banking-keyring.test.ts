import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  chiffrerAvecTrousseau,
  dechiffrerAvecTrousseau,
  empreinteControleCle,
  estAJour,
  indexAveugleIban,
  lireEnteteChiffre,
  lireTrousseauBancaire,
} from "./banking-keyring";
import { ibanTest } from "@/test/banking-fixtures";

// Données de test uniquement : clés générées pour le test, IBAN fictifs (banque 99999).
const K1 = Buffer.alloc(32, 11).toString("base64");
const K2 = Buffer.alloc(32, 22).toString("hex");
const K3 = Buffer.alloc(32, 33).toString("base64");
const IBAN = ibanTest(1);

// Chiffrement d'AVANT la V1 (src/lib/banking.ts @ 53b4bc7), recopié pour prouver la compatibilité.
function chiffrerAncienCode(cleB64: string, clair: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(cleB64, "base64"), iv);
  const ct = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

describe("trousseau bancaire : configuration", () => {
  it("variable historique seule ⇒ k1 active, écriture v1 (comportement inchangé)", () => {
    const t = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEY: K1 });
    expect(t.active).toBe("k1");
    expect(t.formatEcriture).toBe("v1");
    expect(lireEnteteChiffre(chiffrerAvecTrousseau(t, IBAN))).toEqual({ format: "v1", cle: "k1", algorithme: "A256GCM" });
  });

  it("trousseau versionné ⇒ écriture v2 sous la clé active", () => {
    const t = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2},k1:${K1}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" });
    expect(t.identifiants).toEqual(["k1", "k2"]);
    const v = chiffrerAvecTrousseau(t, IBAN);
    expect(v.startsWith("v2:k2:A256GCM:")).toBe(true);
    expect(dechiffrerAvecTrousseau(t, v)).toBe(IBAN);
  });

  it("la variable historique alimente k1 si le trousseau ne la déclare pas", () => {
    const t = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEY: K1, BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" });
    expect(t.identifiants).toEqual(["k1", "k2"]);
  });

  it.each([
    [{}, "CONFIG_ABSENTE"],
    [{ BANK_DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }, "CONFIG_INVALIDE"],
    [{ BANK_DATA_ENCRYPTION_KEYS: `K2:${K2}` }, "CONFIG_INVALIDE"],
    [{ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2},k2:${K3}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" }, "CONFIG_INVALIDE"],
    [{ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2},k1:${K1}` }, "CONFIG_INVALIDE"],
    [{ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k3" }, "CONFIG_INVALIDE"],
    [{ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2},k3:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" }, "CONFIG_INVALIDE"],
    [{ BANK_DATA_ENCRYPTION_KEYS: `k1:${K3}`, BANK_DATA_ENCRYPTION_KEY: K1 }, "CONFIG_INVALIDE"],
    [{ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}`, BANK_DATA_ENCRYPTION_WRITE_FORMAT: "v1" }, "FORMAT_ECRITURE_INVALIDE"],
    [{ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}`, BANK_DATA_ENCRYPTION_WRITE_FORMAT: "v3" }, "CONFIG_INVALIDE"],
  ])("échoue fermé sur une configuration ambiguë ou invalide (%#)", (env, code) => {
    expect(() => lireTrousseauBancaire(env)).toThrowError(expect.objectContaining({ code }));
  });

  it("aucun message d'erreur de configuration ne contient une clé", () => {
    for (const env of [{ BANK_DATA_ENCRYPTION_KEYS: `k1:${K3}`, BANK_DATA_ENCRYPTION_KEY: K1 }, { BANK_DATA_ENCRYPTION_KEYS: `k2:${K2},k3:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" }, { BANK_DATA_ENCRYPTION_KEYS: `zz:${K2}` }]) {
      try {
        lireTrousseauBancaire(env);
      } catch (cause) {
        const message = (cause as Error).message;
        for (const secret of [K1, K2, K3]) expect(message).not.toContain(secret);
      }
    }
  });
});

describe("trousseau bancaire : chiffrement", () => {
  const t1 = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEY: K1 });
  const t12 = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k1:${K1},k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" });

  it("lit les données écrites par le code d'avant la V1", () => {
    const ancien = chiffrerAncienCode(K1, IBAN);
    expect(dechiffrerAvecTrousseau(t1, ancien)).toBe(IBAN);
    expect(dechiffrerAvecTrousseau(t12, ancien)).toBe(IBAN);
  });

  it("chaque valeur porte version, clé, algorithme, iv et tag, sans le secret", () => {
    const v = chiffrerAvecTrousseau(t12, IBAN);
    const [format, cle, algo, iv, tag, ct] = v.split(":");
    expect([format, cle, algo]).toEqual(["v2", "k2", "A256GCM"]);
    expect(Buffer.from(iv, "base64url")).toHaveLength(12);
    expect(Buffer.from(tag, "base64url")).toHaveLength(16);
    expect(ct.length).toBeGreaterThan(0);
    expect(v).not.toContain(IBAN);
    expect(v).not.toContain(K2);
  });

  it("deux chiffrements du même IBAN diffèrent (iv aléatoire)", () => {
    expect(chiffrerAvecTrousseau(t12, IBAN)).not.toBe(chiffrerAvecTrousseau(t12, IBAN));
  });

  it("mauvaise clé : échec fermé, jamais de clair", () => {
    const v = chiffrerAvecTrousseau(t12, IBAN);
    const faux = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k1:${K1},k2:${K3}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" });
    expect(() => dechiffrerAvecTrousseau(faux, v)).toThrowError(expect.objectContaining({ code: "AUTHENTIFICATION_ECHOUEE" }));
    const ancien = chiffrerAncienCode(K1, IBAN);
    const fauxK1 = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEY: K3 });
    expect(() => dechiffrerAvecTrousseau(fauxK1, ancien)).toThrowError(expect.objectContaining({ code: "AUTHENTIFICATION_ECHOUEE" }));
  });

  it("clé absente du trousseau : échec fermé", () => {
    const v = chiffrerAvecTrousseau(t12, IBAN);
    expect(() => dechiffrerAvecTrousseau(t1, v)).toThrowError(expect.objectContaining({ code: "CLE_INCONNUE" }));
  });

  it("toute altération (en-tête, iv, tag, contenu) est détectée", () => {
    const v = chiffrerAvecTrousseau(t12, IBAN);
    const p = v.split(":");
    const muter = (s: string) => (s[0] === "A" ? `B${s.slice(1)}` : `A${s.slice(1)}`);
    const variantes = [
      [p[0], "k1", ...p.slice(2)].join(":"), // en-tête : autre clé (AAD)
      [...p.slice(0, 3), muter(p[3]), ...p.slice(4)].join(":"),
      [...p.slice(0, 4), muter(p[4]), p[5]].join(":"),
      [...p.slice(0, 5), muter(p[5])].join(":"),
      ["v1", ...p.slice(3)].join(":"), // rétrogradation de format
    ];
    for (const altere of variantes) expect(() => dechiffrerAvecTrousseau(t12, altere)).toThrow();
  });

  it.each(["", "v2", "v3:x:y:z", "v2:k2:A128GCM:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:Q0", "DEMO_NON_DECHIFFRABLE_abc", "v1:AA:BB:CC"])("format invalide refusé : %s", (valeur) => {
    expect(() => dechiffrerAvecTrousseau(t12, valeur)).toThrowError(expect.objectContaining({ code: "FORMAT_INVALIDE" }));
  });

  it("empreinte de contrôle : stable, propre à la clé, sans la révéler", () => {
    const e = empreinteControleCle(t12, "k2");
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(e).toBe(empreinteControleCle(lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}` }), "k2"));
    expect(e).not.toBe(empreinteControleCle(t12, "k1"));
    expect(e).not.toContain(K2);
  });

  it("index aveugle IBAN : HMAC versionné, différent du SHA-256 historique", () => {
    const h2 = indexAveugleIban(t12, IBAN, "k2");
    expect(h2).toMatch(/^[0-9a-f]{64}$/);
    expect(h2).toBe(indexAveugleIban(t12, IBAN, "k2"));
    expect(h2).not.toBe(indexAveugleIban(t12, IBAN, "k1"));
    expect(h2).not.toBe(indexAveugleIban(t12, ibanTest(2), "k2"));
  });

  it("estAJour : clé active ET format d'écriture", () => {
    expect(estAJour(t12, chiffrerAvecTrousseau(t12, IBAN))).toBe(true);
    expect(estAJour(t12, chiffrerAncienCode(K1, IBAN))).toBe(false);
    expect(estAJour(t12, chiffrerAvecTrousseau(t12, IBAN, { cle: "k1" }))).toBe(false);
  });
});
