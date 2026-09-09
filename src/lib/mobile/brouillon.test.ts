import { beforeEach, describe, expect, it } from "vitest";
import { effacerBrouillon, enregistrerBrouillon, lireBrouillon, PEREMPTION_MS } from "@/lib/mobile/brouillon";

/** Stockage clé/valeur en mémoire, avec possibilité de simuler un quota atteint. */
function stockageFactice({ quota = Infinity }: { quota?: number } = {}) {
  const donnees = new Map<string, string>();
  return {
    donnees,
    getItem: (c: string) => donnees.get(c) ?? null,
    setItem: (c: string, v: string) => {
      if (v.length > quota) throw new DOMException("quota", "QuotaExceededError");
      donnees.set(c, v);
    },
    removeItem: (c: string) => { donnees.delete(c); },
  };
}

const A = { entrepriseId: "ent-a", utilisateurId: "usr-1" };
const B = { entrepriseId: "ent-a", utilisateurId: "usr-2" };

describe("brouillon de formulaire", () => {
  let stockage: ReturnType<typeof stockageFactice>;
  beforeEach(() => { stockage = stockageFactice(); });

  it("restitue la saisie interrompue", () => {
    enregistrerBrouillon(stockage, A, "note-frais", { montant: "42,50", fournisseur: "Point P" });
    expect(lireBrouillon(stockage, A, "note-frais")).toEqual({ montant: "42,50", fournisseur: "Point P" });
  });

  it("ne montre jamais le brouillon d'un autre utilisateur du même appareil", () => {
    // Le défaut que ce module existe pour empêcher : le chef d'équipe qui prend le
    // téléphone l'après-midi ne doit pas retrouver la saisie du matin.
    enregistrerBrouillon(stockage, A, "note-frais", { montant: "42,50" });
    expect(lireBrouillon(stockage, B, "note-frais")).toBeNull();
  });

  it("n'écrit rien sans identité", () => {
    expect(enregistrerBrouillon(stockage, null, "note-frais", { montant: "42,50" })).toBe(false);
    expect(stockage.donnees.size).toBe(0);
  });

  it("oublie un brouillon périmé et le retire du stockage", () => {
    const depart = 1_000_000;
    enregistrerBrouillon(stockage, A, "note-frais", { montant: "42,50" }, depart);
    // Une seconde avant l'échéance, il est encore là.
    expect(lireBrouillon(stockage, A, "note-frais", depart + PEREMPTION_MS - 1000)).not.toBeNull();
    // Une seconde après, il a disparu — et le stockage a été nettoyé au passage.
    expect(lireBrouillon(stockage, A, "note-frais", depart + PEREMPTION_MS + 1000)).toBeNull();
    expect(stockage.donnees.size).toBe(0);
  });

  it("refuse une valeur non sérialisable plutôt que d'écrire un brouillon tronqué", () => {
    const circulaire: Record<string, unknown> = {};
    circulaire.soi = circulaire;
    expect(enregistrerBrouillon(stockage, A, "note-frais", circulaire)).toBe(false);
    expect(stockage.donnees.size).toBe(0);
  });

  it("renonce sans lever quand le quota est atteint", () => {
    // Perdre un brouillon est désagréable ; faire échouer la saisie en cours le serait plus.
    const etroit = stockageFactice({ quota: 10 });
    expect(() => enregistrerBrouillon(etroit, A, "note-frais", { montant: "x".repeat(500) })).not.toThrow();
    expect(enregistrerBrouillon(etroit, A, "note-frais", { montant: "x".repeat(500) })).toBe(false);
  });

  it("refuse une charge trop grosse : un brouillon ne transporte pas un document", () => {
    const enorme = { photo: "x".repeat(100_000) };
    expect(enregistrerBrouillon(stockage, A, "note-frais", enorme)).toBe(false);
  });

  it("écarte un contenu corrompu au lieu de le rendre au formulaire", () => {
    enregistrerBrouillon(stockage, A, "note-frais", { montant: "1" });
    const cle = [...stockage.donnees.keys()][0];
    stockage.donnees.set(cle, "{ ceci n'est pas du JSON");
    expect(lireBrouillon(stockage, A, "note-frais")).toBeNull();
    expect(stockage.donnees.size).toBe(0);
  });

  it("écarte un contenu de forme inattendue", () => {
    enregistrerBrouillon(stockage, A, "note-frais", { montant: "1" });
    const cle = [...stockage.donnees.keys()][0];
    stockage.donnees.set(cle, JSON.stringify({ autre: "chose" }));
    expect(lireBrouillon(stockage, A, "note-frais")).toBeNull();
  });

  it("efface à la demande", () => {
    enregistrerBrouillon(stockage, A, "note-frais", { montant: "1" });
    effacerBrouillon(stockage, A, "note-frais");
    expect(lireBrouillon(stockage, A, "note-frais")).toBeNull();
  });

  it("distingue deux formulaires de la même identité", () => {
    enregistrerBrouillon(stockage, A, "note-frais", { a: 1 });
    enregistrerBrouillon(stockage, A, "compte-rendu", { b: 2 });
    expect(lireBrouillon(stockage, A, "note-frais")).toEqual({ a: 1 });
    expect(lireBrouillon(stockage, A, "compte-rendu")).toEqual({ b: 2 });
  });
});
