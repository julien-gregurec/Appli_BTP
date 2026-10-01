import { describe, expect, it } from "vitest";
import { borner, ecrireCurseur, filtreApresCurseur, lireCurseur, lirePageCroissante, lirePageCurseur, lirePageParNom } from "@/lib/fiches-agregats";

// ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — pagination par curseur et listes
// bornées (exactitude prouvée sur PostgREST réel par gp-residuel.postgrest.test.ts).

const ID = "0f0e0d0c-0b0a-4908-8706-050403020100";

/** Constructeur de requête factice : mémorise les appels, rend `lignes`. */
function requete<T>(lignes: T[]) {
  const appels: { methode: string; args: unknown[] }[] = [];
  const q = {
    appels,
    or(...args: unknown[]) { appels.push({ methode: "or", args }); return q; },
    gt(...args: unknown[]) { appels.push({ methode: "gt", args }); return q; },
    order(...args: unknown[]) { appels.push({ methode: "order", args }); return q; },
    limit(n: number) { appels.push({ methode: "limit", args: [n] }); return Promise.resolve({ data: lignes.slice(0, n), error: null }); },
  };
  return q;
}

describe("curseurs", () => {
  it("aller-retour date + id, et NULL", () => {
    expect(lireCurseur(ecrireCurseur("2026-03-01", ID))).toEqual({ date: "2026-03-01", id: ID });
    expect(lireCurseur(ecrireCurseur("2025-01-01T23:23:00+00:00", ID))).toEqual({ date: "2025-01-01T23:23:00+00:00", id: ID });
    expect(lireCurseur(ecrireCurseur(null, ID))).toEqual({ date: null, id: ID });
  });

  it("refuse un curseur forgé", () => {
    expect(lireCurseur("pas-une-date_" + ID)).toBeNull();
    expect(lireCurseur("2026-03-01_pas-un-uuid")).toBeNull();
    expect(lireCurseur("2026-03-01_" + ID + ",id.gt.0")).toBeNull();
    expect(lireCurseur(undefined)).toBeNull();
  });

  it("filtre « après le curseur » pour un ordre DESC (NULL en tête)", () => {
    expect(filtreApresCurseur("date_piece", { date: "2026-03-01", id: ID })).toBe(`date_piece.lt."2026-03-01",and(date_piece.eq."2026-03-01",id.lt.${ID})`);
    expect(filtreApresCurseur("date_piece", { date: null, id: ID })).toBe(`and(date_piece.is.null,id.lt.${ID}),date_piece.not.is.null`);
  });
});

describe("lirePageCurseur", () => {
  const lignes = Array.from({ length: 5 }, (_, i) => ({ id: `${ID.slice(0, -1)}${i}`, date_piece: `2026-03-0${9 - i}` }));

  it("demande taille + 1 lignes et rend le curseur suivant", async () => {
    const q = requete(lignes);
    const page = await lirePageCurseur<{ id: string; date_piece: string }>(q as never, "date_piece", 3, null);
    expect(page.lignes).toHaveLength(3);
    expect(page.suivant).toBe(ecrireCurseur(lignes[2].date_piece, lignes[2].id));
    expect(q.appels.find((a) => a.methode === "limit")?.args).toEqual([4]);
    expect(q.appels.filter((a) => a.methode === "order").map((a) => a.args)).toEqual([["date_piece", { ascending: false, nullsFirst: true }], ["id", { ascending: false }]]);
  });

  it("dernière page : pas de curseur suivant ; le curseur reçu devient un filtre", async () => {
    const q = requete(lignes.slice(0, 2));
    const page = await lirePageCurseur<{ id: string; date_piece: string }>(q as never, "date_piece", 3, { date: "2026-03-09", id: ID });
    expect(page.suivant).toBeNull();
    expect(q.appels[0]).toEqual({ methode: "or", args: [filtreApresCurseur("date_piece", { date: "2026-03-09", id: ID })] });
  });

  it("une erreur de lecture est levée, jamais une liste partielle", async () => {
    const q = { or: () => q, order: () => q, limit: () => Promise.resolve({ data: null, error: { message: "boom" } }) };
    await expect(lirePageCurseur<{ id: string; date_piece: string }>(q as never, "date_piece", 3, null)).rejects.toThrow(/boom/);
  });
});

describe("lirePageCroissante et lirePageParNom", () => {
  it("croissante : curseur = dernière valeur de la colonne unique", async () => {
    const q = requete([{ id: "1", reference: "A" }, { id: "2", reference: "B" }, { id: "3", reference: "C" }]);
    const page = await lirePageCroissante(q, "reference", 2, null);
    expect(page).toEqual({ lignes: [{ id: "1", reference: "A" }, { id: "2", reference: "B" }], suivant: "B" });
    const q2 = requete([{ id: "3", reference: "C" }]);
    await lirePageCroissante(q2, "reference", 2, "B");
    expect(q2.appels[0]).toEqual({ methode: "gt", args: ["reference", "B"] });
  });

  it("par nom : curseur opaque (nom, id), guillemets échappés dans le filtre", async () => {
    const q = requete([{ id: ID, nom: 'Dupont "et fils", SARL' }, { id: ID, nom: "Z" }]);
    const page = await lirePageParNom<{ id: string; nom: string }>(q, 1, null);
    expect(page.suivant).not.toBeNull();
    const q2 = requete<{ id: string; nom: string }>([]);
    await lirePageParNom(q2, 1, page.suivant);
    expect(q2.appels[0].methode).toBe("or");
    expect(q2.appels[0].args[0]).toBe(`nom.gt."Dupont \\"et fils\\", SARL",and(nom.eq."Dupont \\"et fils\\", SARL",id.gt.${ID})`);
  });

  it("par nom : un curseur illisible est ignoré (première page)", async () => {
    const q = requete<{ id: string; nom: string }>([]);
    await lirePageParNom(q, 10, "%%%");
    expect(q.appels.some((a) => a.methode === "or")).toBe(false);
  });
});

describe("borner", () => {
  it("signale qu'il existe d'autres lignes au-delà de la limite", () => {
    expect(borner([1, 2, 3], 2)).toEqual({ lignes: [1, 2], autres: true });
    expect(borner([1, 2], 2)).toEqual({ lignes: [1, 2], autres: false });
    expect(borner(null, 2)).toEqual({ lignes: [], autres: false });
  });
});
