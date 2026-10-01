import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { chiffrerAvecTrousseau, dechiffrerAvecTrousseau, empreinteControleCle, indexAveugleIban, lireEnteteChiffre, lireTrousseauBancaire } from "./banking-keyring";
import { controlerTrousseau, executerRechiffrement, verifierDechiffrement } from "./banking-rotation";
import { ibanTest, MagasinMemoire, outilsTrousseau as outils } from "@/test/banking-fixtures";

// Données de test uniquement : clés générées pour le test, IBAN fictifs (banque 99999).
const K1 = Buffer.alloc(32, 41).toString("base64");
const K2 = Buffer.alloc(32, 42).toString("base64");
const K3 = Buffer.alloc(32, 43).toString("base64");
const KFAUX = Buffer.alloc(32, 44).toString("base64");
const BIC = "TESTFRPPXXX";

const envHistorique = { BANK_DATA_ENCRYPTION_KEY: K1 };
const envK2 = { BANK_DATA_ENCRYPTION_KEYS: `k1:${K1},k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" };

// Code d'AVANT la V1 (src/lib/banking.ts @ 53b4bc7) : écriture et lecture v1.
function chiffrerAncien(clair: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(K1, "base64"), iv);
  const ct = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}
function dechiffrerAncien(valeur: string) {
  const [version, iv, tag, contenu] = valeur.split(":");
  if (version !== "v1" || !iv || !tag || !contenu) throw new Error("Donnée bancaire chiffrée invalide");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(K1, "base64"), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(contenu, "base64url")), d.final()]).toString("utf8");
}

const IBAN_PAR_ID = new Map<string, string>();
const uuid = (prefixe: string, n: number) => `${prefixe}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** 40 RIB (20 avec BIC) + 20 ordres (10 avec BIC) = 90 valeurs v1 historiques + 2 illisibles. */
function base() {
  const m = new MagasinMemoire();
  for (let i = 1; i <= 40; i += 1) {
    const iban = ibanTest(i);
    const id = uuid("c0000000", i);
    IBAN_PAR_ID.set(id, iban);
    m.ajouter({ ressource: "coordonnees_bancaires", id, iban_chiffre: chiffrerAncien(iban), bic_chiffre: i % 2 ? chiffrerAncien(BIC) : null, iban_hash: createHash("sha256").update(iban).digest("hex") });
  }
  for (let i = 1; i <= 20; i += 1) {
    const iban = ibanTest(i);
    const id = uuid("d0000000", i);
    IBAN_PAR_ID.set(id, iban);
    m.ajouter({ ressource: "ordres_virements", id, iban_chiffre: chiffrerAncien(iban), bic_chiffre: i % 2 ? chiffrerAncien(BIC) : null });
  }
  m.ajouter({ ressource: "coordonnees_bancaires", id: uuid("e0000000", 1), iban_chiffre: `DEMO_NON_DECHIFFRABLE_${"a".repeat(40)}`, bic_chiffre: null });
  return m;
}

function preparerK2(m: MagasinMemoire) {
  const t = lireTrousseauBancaire(envK2);
  m.enregistrer("k1", empreinteControleCle(t, "k1"));
  m.enregistrer("k2", empreinteControleCle(t, "k2"));
  m.activer("k2");
  return t;
}

function exigerToutLisible(m: MagasinMemoire, t = lireTrousseauBancaire(envK2)) {
  for (const s of m.sources()) {
    if (s.chiffre.startsWith("DEMO_")) continue;
    const attendu = s.colonne === "bic_chiffre" ? BIC : IBAN_PAR_ID.get(s.id);
    expect(dechiffrerAvecTrousseau(t, s.chiffre)).toBe(attendu);
  }
}

const compte = (m: MagasinMemoire, pred: (cle: string, format: string) => boolean) =>
  m.sources().filter((s) => { try { const e = lireEnteteChiffre(s.chiffre); return pred(e.cle, e.format); } catch { return false; } }).length;

describe("rotation K1 → K2", () => {
  it("nouvelles écritures sous K2, anciennes lisibles avec K1, puis rechiffrement complet", async () => {
    const m = base();
    const t = preparerK2(m);
    // Nouvelle écriture après activation : v2/k2.
    const nouvelle = chiffrerAvecTrousseau(t, ibanTest(99));
    expect(lireEnteteChiffre(nouvelle)).toMatchObject({ format: "v2", cle: "k2" });
    // Anciennes données toujours lisibles avant tout rechiffrement.
    exigerToutLisible(m, t);

    const r = await executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9 });
    expect(r).toMatchObject({ statut: "termine", cible: "k2", format: "v2", rechiffres: 90, conflits: 0, restants: 0, echecs: [] });
    expect(r.lots).toBe(10);
    expect(compte(m, (c, f) => c === "k2" && f === "v2")).toBe(90);
    exigerToutLisible(m, t);
    // Index aveugle recalculé sous k2.
    const rib = m.lignes.find((l) => l.id === uuid("c0000000", 7))!;
    expect(rib.iban_hash).toBe(indexAveugleIban(t, ibanTest(7), "k2"));
    // K1 n'est plus nécessaire : le trousseau K2 seul lit tout.
    exigerToutLisible(m, lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}` }));
    // Une relance est idempotente.
    const again = await executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9 });
    expect(again).toMatchObject({ statut: "termine", rechiffres: 0, lots: 0 });
  });

  it.each([[1, 10], [5, 50], [9, 90]])("interruption après %i lot(s) (%i %%) : tout reste lisible et la reprise termine", async (lots, pourcent) => {
    const m = base();
    const t = preparerK2(m);
    const r1 = await executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9, maxLots: lots });
    expect(r1.statut).toBe("interrompu");
    expect(r1.rechiffres).toBe(lots * 9);
    expect(Math.round((r1.rechiffres / 90) * 100)).toBe(pourcent);
    expect(r1.restants).toBe(90 - lots * 9);
    expect(compte(m, (c) => c === "k1")).toBe(90 - lots * 9);
    exigerToutLisible(m, t);
    const verif = await verifierDechiffrement({ magasin: m, trousseau: t, outils });
    expect(verif).toMatchObject({ ok: true, total: 91, dechiffrables: 90, illisibles: 1 });
    expect(verif.parCle).toEqual({ k1: 90 - lots * 9, k2: lots * 9 });

    const r2 = await executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9 });
    expect(r2).toMatchObject({ statut: "termine", rechiffres: 90 - lots * 9, restants: 0 });
    exigerToutLisible(m, t);
  });

  it.each([[2, "avant"], [6, "apres"]] as const)("panne au lot %i (%s validation) : lisible, reprenable, aucun double chiffrement", async (numero, moment) => {
    const m = base();
    const t = preparerK2(m);
    m.panne = (quand, n) => { if (quand === moment && n === numero) throw new Error("panne simulée"); };
    await expect(executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9 })).rejects.toThrow("panne simulée");
    const deja = moment === "avant" ? (numero - 1) * 9 : numero * 9;
    expect(compte(m, (c) => c === "k2")).toBe(deja);
    exigerToutLisible(m, t);
    m.panne = undefined;
    const r = await executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9 });
    expect(r).toMatchObject({ statut: "termine", rechiffres: 90 - deja, restants: 0 });
    exigerToutLisible(m, t);
  });

  it("écriture concurrente pendant un lot : conflit, ligne intacte, reprise à la passe suivante", async () => {
    const m = base();
    const t = preparerK2(m);
    const cible = uuid("c0000000", 3);
    const nouvelIban = ibanTest(303);
    let fait = false;
    const appliquer = m.appliquer.bind(m);
    m.appliquer = async (c, f, lot) => {
      if (!fait) {
        // Un autre processus réécrit la ligne (sous K1 encore, ancien pod) entre lecture et écriture.
        fait = true;
        const l = m.lignes.find((x) => x.id === cible)!;
        l.iban_chiffre = chiffrerAncien(nouvelIban);
        IBAN_PAR_ID.set(cible, nouvelIban);
      }
      return appliquer(c, f, lot);
    };
    const r = await executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9 });
    expect(r.conflits).toBe(1);
    expect(r).toMatchObject({ statut: "termine", restants: 0 });
    expect(dechiffrerAvecTrousseau(t, m.lignes.find((x) => x.id === cible)!.iban_chiffre)).toBe(nouvelIban);
    IBAN_PAR_ID.set(cible, ibanTest(3));
  });

  it("deux exécutions simultanées convergent sans corruption", async () => {
    const m = base();
    const t = preparerK2(m);
    const [a, b] = await Promise.all([
      executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 7 }),
      executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 11 }),
    ]);
    expect(a.rechiffres + b.rechiffres).toBe(90);
    expect(compte(m, (c, f) => c === "k2" && f === "v2")).toBe(90);
    exigerToutLisible(m, t);
  });
});

describe("mauvaise clé et clé manquante : échec fermé", () => {
  it("clé K2 de l'environnement différente de celle enregistrée : refus, rien n'est écrit", async () => {
    const m = base();
    preparerK2(m);
    const avant = JSON.stringify(m.lignes);
    const faux = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k1:${K1},k2:${KFAUX}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" });
    await expect(executerRechiffrement({ magasin: m, trousseau: faux, outils })).rejects.toMatchObject({ code: "TROUSSEAU_REFUSE" });
    expect(JSON.stringify(m.lignes)).toBe(avant);
  });

  it("K1 non attestée mais fausse : les valeurs ne sont jamais réécrites, run « incomplet »", async () => {
    const m = base();
    const fauxK1 = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k1:${KFAUX},k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" });
    m.enregistrer("k2", empreinteControleCle(fauxK1, "k2"));
    m.activer("k2");
    const avant = JSON.stringify(m.lignes);
    const r = await executerRechiffrement({ magasin: m, trousseau: fauxK1, outils, tailleLot: 9 });
    expect(r.statut).toBe("incomplet");
    expect(r.rechiffres).toBe(0);
    expect(r.echecs).toHaveLength(90);
    expect(new Set(r.echecs.map((e) => e.motif))).toEqual(new Set(["AUTHENTIFICATION_ECHOUEE"]));
    expect(JSON.stringify(m.lignes)).toBe(avant);
  });

  it("restauration sans la clé K1 : détectée (CLE_MANQUANTE) et vérification négative", async () => {
    const m = base();
    preparerK2(m);
    const sansK1 = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}` });
    const c = controlerTrousseau(await m.etat(), sansK1, outils);
    expect(c.ok).toBe(false);
    expect(c.erreurs.join()).toContain("CLE_MANQUANTE : k1");
    const v = await verifierDechiffrement({ magasin: m, trousseau: sansK1, outils });
    expect(v.ok).toBe(false);
    expect(v.echecs).toHaveLength(90);
    expect(v.echecs[0].motif).toBe("CLE_INCONNUE");
  });

  it("restauration avec une mauvaise clé K1 attestée : EMPREINTE_DIFFERENTE", async () => {
    const m = base();
    preparerK2(m);
    const faux = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k1:${KFAUX},k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" });
    const c = controlerTrousseau(await m.etat(), faux, outils);
    expect(c.erreurs.join()).toContain("EMPREINTE_DIFFERENTE : la clé k1");
  });

  it("clé active de l'environnement ≠ registre : refus", async () => {
    const m = base();
    preparerK2(m);
    const c = controlerTrousseau(await m.etat(), lireTrousseauBancaire(envHistorique), outils);
    expect(c.erreurs.join()).toContain("ACTIVE_DIVERGENTE");
  });
});

describe("retour arrière", () => {
  it("K2 → K1 puis format v1 : le code d'avant la V1 relit tout", async () => {
    const m = base();
    const t2 = preparerK2(m);
    await executerRechiffrement({ magasin: m, trousseau: t2, outils, tailleLot: 25 });
    expect(compte(m, (c) => c === "k2")).toBe(90);

    // 1. Réactivation de K1 (statut « déchiffrement ») et rechiffrement inverse, en v2.
    m.activer("k1");
    const t1v2 = lireTrousseauBancaire({ ...envK2, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k1" });
    expect(t1v2.formatEcriture).toBe("v2");
    expect(await executerRechiffrement({ magasin: m, trousseau: t1v2, outils, tailleLot: 25 })).toMatchObject({ statut: "termine", rechiffres: 90 });
    expect(compte(m, (c, f) => c === "k1" && f === "v2")).toBe(90);

    // 2. Retour au format v1 (sans identifiant) : seule forme lisible par l'ancien code.
    const t1v1 = lireTrousseauBancaire({ ...envK2, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k1", BANK_DATA_ENCRYPTION_WRITE_FORMAT: "v1" });
    expect(await executerRechiffrement({ magasin: m, trousseau: t1v1, outils, tailleLot: 25 })).toMatchObject({ statut: "termine", rechiffres: 90 });
    for (const s of m.sources()) {
      if (s.chiffre.startsWith("DEMO_")) continue;
      expect(dechiffrerAncien(s.chiffre)).toBe(s.colonne === "bic_chiffre" ? BIC : IBAN_PAR_ID.get(s.id));
    }
    // Index historique restauré (SHA-256) pour l'ancien code.
    expect(m.lignes.find((l) => l.id === uuid("c0000000", 5))!.iban_hash).toBe(createHash("sha256").update(ibanTest(5)).digest("hex"));
  });
});

describe("compromission", () => {
  it("K1 compromise : plus d'écriture sous K1, rechiffrement, retrait seulement à zéro", async () => {
    const m = base();
    const t = preparerK2(m);
    m.compromettre("k1");
    expect(() => m.ajouter({ ressource: "ordres_virements", id: uuid("f0000000", 1), iban_chiffre: chiffrerAncien(ibanTest(1)), bic_chiffre: null })).toThrow(/non inscriptible/);
    expect(() => m.retirer("k1")).toThrow(/BANK_KEY_STILL_IN_USE/);
    const c = controlerTrousseau(await m.etat(), t, outils);
    expect(c.avertissements.join()).toContain("COMPROMISE_ENCORE_PRESENTE : k1");
    expect(await executerRechiffrement({ magasin: m, trousseau: t, outils })).toMatchObject({ statut: "termine", restants: 0 });
    m.retirer("k1");
    // K1 retirée : le trousseau sans K1 suffit et le contrôle est vert.
    const sansK1 = lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}` });
    expect(controlerTrousseau(await m.etat(), sansK1, outils).ok).toBe(true);
  });
});

describe("journaux : aucun secret", () => {
  it("rapports, progression et console ne contiennent ni clé, ni IBAN, ni chiffré", async () => {
    const m = base();
    const t = preparerK2(m);
    const chiffresAvant = m.sources().map((s) => s.chiffre);
    const espions = (["log", "info", "warn", "error", "debug"] as const).map((n) => vi.spyOn(console, n));
    const traces: unknown[] = [];
    const r1 = await executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9, maxLots: 3, surLot: (p) => traces.push(p) });
    const r2 = await executerRechiffrement({ magasin: m, trousseau: t, outils, tailleLot: 9, surLot: (p) => traces.push(p) });
    const v = await verifierDechiffrement({ magasin: m, trousseau: lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k2:${KFAUX}` }), outils });
    const c = controlerTrousseau(await m.etat(), lireTrousseauBancaire({ BANK_DATA_ENCRYPTION_KEYS: `k1:${KFAUX},k2:${K3}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" }), outils);
    const journal = JSON.stringify([r1, r2, v, c, traces, m.journal, espions.map((e) => e.mock.calls)]);
    espions.forEach((e) => e.mockRestore());
    for (const secret of [K1, K2, K3, KFAUX, Buffer.from(K1, "base64").toString("hex"), BIC]) expect(journal).not.toContain(secret);
    for (let i = 1; i <= 40; i += 1) expect(journal).not.toContain(ibanTest(i));
    for (const ch of [...chiffresAvant, ...m.sources().map((s) => s.chiffre)]) expect(journal).not.toContain(ch.split(":").at(-1)!);
    expect(journal).not.toMatch(/v[12]:[A-Za-z0-9_-]{16}|A256GCM:/);
  });
});
