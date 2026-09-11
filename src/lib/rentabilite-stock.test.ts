import { describe, expect, it, vi } from "vitest";
import {
  coutStockDuChantier,
  interpreterCoutsStock,
  lireCoutsStockChantiers,
  margeChantier,
  MESSAGE_COUT_STOCK_INDISPONIBLE,
  MESSAGE_COUT_STOCK_REFUSE,
  peutConsulterRentabilite,
  totalCoutStock,
} from "./rentabilite-stock";

describe("peutConsulterRentabilite (D1)", () => {
  it("accès complet (null) : autorisé", () => expect(peutConsulterRentabilite(null)).toBe(true));
  it("acces_rentabilite : autorisé", () => expect(peutConsulterRentabilite(["acces_rentabilite"])).toBe(true));
  it("option IA seule : refusé", () => expect(peutConsulterRentabilite(["acces_ia"])).toBe(false));
  it("voir_rentabilite n'équivaut pas à acces_rentabilite", () => expect(peutConsulterRentabilite(["voir_rentabilite"])).toBe(false));
  it("expert-comptable par défaut (factures, achats, exports) : refusé (D3)", () =>
    expect(peutConsulterRentabilite(["acces_factures", "acces_achats", "acces_exports"])).toBe(false));
});

describe("interpreterCoutsStock", () => {
  it("disponible : totaux par chantier", () => {
    const couts = interpreterCoutsStock({ data: [{ chantier_id: "a", total: 10 }, { chantier_id: "b", total: "2.5" }], error: null });
    expect(couts.etat).toBe("disponible");
    expect(coutStockDuChantier(couts, "a")).toBe(10);
    expect(coutStockDuChantier(couts, "b")).toBe(2.5);
  });
  it("refus 42501 : état refusé explicite, pas un vide", () => {
    expect(interpreterCoutsStock({ data: null, error: { code: "42501", message: "Accès à la rentabilité refusé" } }))
      .toEqual({ etat: "refuse", message: MESSAGE_COUT_STOCK_REFUSE });
  });
  it("autre erreur : indisponible", () => {
    expect(interpreterCoutsStock({ data: null, error: { code: "PGRST000", message: "connexion" } }))
      .toEqual({ etat: "indisponible", message: MESSAGE_COUT_STOCK_INDISPONIBLE });
  });
  it("réponse sans tableau : indisponible", () => {
    expect(interpreterCoutsStock({ data: null, error: null }).etat).toBe("indisponible");
  });
  it("une ligne illisible rend tout le résultat indisponible (jamais un total partiel)", () => {
    expect(interpreterCoutsStock({ data: [{ chantier_id: "a", total: 10 }, { chantier_id: "b", total: null }], error: null }).etat).toBe("indisponible");
    expect(interpreterCoutsStock({ data: [{ chantier_id: "a", total: "abc" }], error: null }).etat).toBe("indisponible");
    expect(interpreterCoutsStock({ data: [{ total: 3 }], error: null }).etat).toBe("indisponible");
  });
});

describe("coutStockDuChantier — jamais 0 par défaut", () => {
  it("refusé ou indisponible : null", () => {
    expect(coutStockDuChantier({ etat: "refuse", message: "x" }, "a")).toBeNull();
    expect(coutStockDuChantier({ etat: "indisponible", message: "x" }, "a")).toBeNull();
  });
  it("disponible et chantier sans sortie : vrai zéro", () => {
    expect(coutStockDuChantier({ etat: "disponible", parChantier: new Map() }, "a")).toBe(0);
  });
});

describe("totalCoutStock", () => {
  it("indisponible : null", () => expect(totalCoutStock({ etat: "refuse", message: "x" }, ["a"])).toBeNull());
  it("disponible : somme des chantiers listés", () => {
    expect(totalCoutStock({ etat: "disponible", parChantier: new Map([["a", 10], ["b", 5], ["z", 99]]) }, ["a", "b", "c"])).toBe(15);
  });
});

describe("margeChantier", () => {
  it("coût stock inconnu : marge et taux inconnus", () => expect(margeChantier(1000, 200, null)).toEqual({ marge: null, taux: null }));
  it("coût stock connu : marge = facturé - autres coûts - stock", () => expect(margeChantier(1000, 200, 300)).toEqual({ marge: 500, taux: 50 }));
  it("non facturé : taux null mais marge connue", () => expect(margeChantier(0, 0, 40)).toEqual({ marge: -40, taux: null }));
});

describe("lireCoutsStockChantiers", () => {
  it("appelle la RPC agrégée, avec ou sans chantier", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    await lireCoutsStockChantiers({ rpc } as never, "ent");
    await lireCoutsStockChantiers({ rpc } as never, "ent", "ch");
    expect(rpc).toHaveBeenNthCalledWith(1, "couts_stock_par_chantier", { p_entreprise_id: "ent" });
    expect(rpc).toHaveBeenNthCalledWith(2, "couts_stock_par_chantier", { p_entreprise_id: "ent", p_chantier_id: "ch" });
  });
  it("une exception réseau devient « indisponible »", async () => {
    const rpc = vi.fn(async () => { throw new Error("réseau"); });
    expect((await lireCoutsStockChantiers({ rpc } as never, "ent")).etat).toBe("indisponible");
  });
});
