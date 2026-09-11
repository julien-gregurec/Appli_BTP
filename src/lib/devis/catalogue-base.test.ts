import { describe, expect, it } from "vitest";
import {
  articleDepuisBase,
  articlesDepuisBase,
  chargerParPages,
  coutsParPrestation,
  fournisseurDepuisBase,
  type PrestationBase,
} from "@/lib/devis/catalogue-base";

// Toutes les données sont FICTIVES.

const prestation = (p: Partial<PrestationBase> & { id: string }): PrestationBase => ({
  designation: "Article (fictif)",
  description: null,
  unite: "u",
  prix_unitaire_ht: "12.50",
  taux_tva: "20.00",
  actif: true,
  reference_interne: null,
  reference_fabricant: null,
  code_barres: null,
  fabricant: null,
  fournisseur_id: null,
  categorie: null,
  ...p,
});

describe("articleDepuisBase", () => {
  it("convertit les numériques renvoyés en texte et garde les trois références distinctes", () => {
    const a = articleDepuisBase(prestation({ id: "p1", reference_interne: "RI", reference_fabricant: "RF", code_barres: "123", actif: null }), 4.2);
    expect(a).toMatchObject({
      id: "p1", referenceInterne: "RI", referenceFabricant: "RF", codeBarres: "123",
      prixVenteHt: 12.5, tauxTva: 20, prixAchatHt: 4.2, actif: true,
    });
  });

  it("un taux absent reste inconnu, jamais zéro", () => {
    expect(articleDepuisBase(prestation({ id: "p1", taux_tva: null }), null).tauxTva).toBeNull();
  });
});

describe("articlesDepuisBase", () => {
  const couts = [{ prestation_id: "p1", prix_achat_ht: "3.1000" }, { prestation_id: "p2", prix_achat_ht: "abc" }];

  it("sans droit de voir les coûts, aucun prix d'achat, même s'ils sont fournis", () => {
    const articles = articlesDepuisBase([prestation({ id: "p1" })], couts, { voirCouts: false });
    expect(articles[0].prixAchatHt).toBeNull();
  });

  it("avec le droit, rattache chaque coût à sa prestation et écarte les valeurs illisibles", () => {
    const articles = articlesDepuisBase([prestation({ id: "p1" }), prestation({ id: "p2" })], couts, { voirCouts: true });
    expect(articles.map((a) => a.prixAchatHt)).toEqual([3.1, null]);
    expect(coutsParPrestation(couts).size).toBe(1);
  });
});

describe("fournisseurDepuisBase", () => {
  it("une référence absente devient vide (jamais rapprochable)", () => {
    expect(fournisseurDepuisBase({ id: "f1", nom: "Négoce (fictif)", reference: null })).toEqual({ id: "f1", nom: "Négoce (fictif)", reference: "" });
  });
});

describe("chargerParPages", () => {
  const source = Array.from({ length: 11 }, (_, i) => ({ id: i }));

  it("lit tout, en avançant du nombre de lignes RÉELLEMENT reçues (plafond serveur inférieur à la page)", async () => {
    const demandes: Array<[number, number]> = [];
    const maxRows = 3;
    const r = await chargerParPages<{ id: number }>(async (de, a) => {
      demandes.push([de, a]);
      return { data: source.slice(de, Math.min(a + 1, de + maxRows)), error: null };
    }, { taille: 5 });
    expect(r.erreur).toBeNull();
    expect(r.data.map((x) => x.id)).toEqual(source.map((x) => x.id));
    expect(demandes[1]).toEqual([3, 7]);
    expect(demandes.at(-1)?.[0]).toBe(11);
  });

  it("une erreur, même tardive, ne rend rien plutôt qu'une liste partielle", async () => {
    let appel = 0;
    const r = await chargerParPages<{ id: number }>(async (de, a) => (++appel === 2 ? { data: null, error: { code: "57014" } } : { data: source.slice(de, a + 1), error: null }), { taille: 5 });
    expect(r).toEqual({ data: [], erreur: { code: "57014" } });
  });

  it("au-delà du plafond de pages, échoue au lieu de tronquer", async () => {
    const r = await chargerParPages<{ id: number }>(async (de, a) => ({ data: source.slice(de, a + 1), error: null }), { taille: 2, pagesMax: 3 });
    expect(r.data).toEqual([]);
    expect(r.erreur).toBeInstanceOf(Error);
  });
});
