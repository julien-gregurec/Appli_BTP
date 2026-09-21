import { describe, expect, it } from "vitest";

import {
  allowlistPrixCapacite,
  CAPACITE_SUPPLEMENTAIRE_MAX,
  classifierItemsAbonnement,
  construireIdempotencyKey,
  evenementStripeEstApplicable,
  payloadSwapPrixCapacite,
  planifierChangementCapacite,
  prixCapacitePersonnePour,
  prochaineTransitionSaga,
  QuantiteCapaciteInvalideError,
  RACCOURCIS_CAPACITE,
  resoudreCibleCapacite,
  resoudrePlanPeriodicite,
  resumeChangementCapacite,
  sagaEstTerminale,
  SEMANTIQUE_CAPACITE,
  validerQuantiteCapacite,
  variablePrixCapacitePour,
  type ItemAbonnement,
} from "@/lib/stripe-capacite-personnes";

const ENV = {
  STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL: "price_cap_mini_m",
  STRIPE_PRICE_COMPTE_SUP_MINI_ANNUEL: "price_cap_mini_a",
  STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL: "price_cap_pro_m",
  STRIPE_PRICE_COMPTE_SUP_BUSINESS_MENSUEL: "price_cap_biz_m",
  STRIPE_PRICE_COMPTE_SUP_ENTREPRISE_MENSUEL: "price_cap_ent_m",
};

describe("registre des Price de capacité", () => {
  it("sémantique documentée = personne active", () => {
    expect(SEMANTIQUE_CAPACITE).toBe("capacite_personne_active");
  });

  it("mappe les variables historiques COMPTE_SUP par plan/périodicité", () => {
    expect(variablePrixCapacitePour("mini", "mensuel")).toBe("STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL");
    expect(variablePrixCapacitePour("pro", "annuel")).toBe("STRIPE_PRICE_COMPTE_SUP_PRO_ANNUEL");
    expect(variablePrixCapacitePour("entreprise", "mensuel")).toBe("STRIPE_PRICE_COMPTE_SUP_ENTREPRISE_MENSUEL");
    expect(variablePrixCapacitePour("sur_mesure", "mensuel")).toBeNull();
  });

  it("résout le Price ID depuis l'environnement", () => {
    expect(prixCapacitePersonnePour("mini", "mensuel", ENV)).toBe("price_cap_mini_m");
    expect(prixCapacitePersonnePour("pro", "mensuel", ENV)).toBe("price_cap_pro_m");
    expect(prixCapacitePersonnePour("pro", "annuel", ENV)).toBeNull(); // non configuré
  });

  it("allowlist = union des Price IDs configurés uniquement", () => {
    const set = allowlistPrixCapacite(ENV);
    expect(set.has("price_cap_mini_m")).toBe(true);
    expect(set.has("price_cap_pro_m")).toBe(true);
    expect(set.size).toBe(5);
    expect(allowlistPrixCapacite({}).size).toBe(0);
  });
});

describe("classifieur d'items (jamais items[0], jamais metadata client)", () => {
  const base = ["price_base_mini_m"];
  const capacite = ["price_cap_mini_m"];
  const autres = ["price_ia_100_m"];

  it("classe base + capacité + option", () => {
    const items: ItemAbonnement[] = [
      { id: "si_cap", quantity: 3, price: { id: "price_cap_mini_m" } },
      { id: "si_base", quantity: 1, price: { id: "price_base_mini_m" } },
      { id: "si_ia", quantity: 1, price: { id: "price_ia_100_m" } },
    ];
    const r = classifierItemsAbonnement(items, { prixBaseAttendus: base, prixCapaciteAttendus: capacite, prixAutresConnus: autres });
    expect(r.base?.id).toBe("si_base");
    expect(r.capacite?.id).toBe("si_cap");
    expect(r.autres.map((i) => i.id)).toEqual(["si_ia"]);
    expect(r.inconnus).toHaveLength(0);
    expect(r.fiable).toBe(true);
  });

  it("ne se fie pas à l'ordre : capacité en position 0", () => {
    const items: ItemAbonnement[] = [
      { id: "si_cap", quantity: 5, price: { id: "price_cap_mini_m" } },
      { id: "si_base", quantity: 1, price: { id: "price_base_mini_m" } },
    ];
    const r = classifierItemsAbonnement(items, { prixBaseAttendus: base, prixCapaciteAttendus: capacite });
    expect(r.base?.id).toBe("si_base");
    expect(r.capacite?.id).toBe("si_cap");
  });

  it("détecte deux items de capacité → non fiable", () => {
    const items: ItemAbonnement[] = [
      { id: "si_cap1", quantity: 2, price: { id: "price_cap_mini_m" } },
      { id: "si_cap2", quantity: 3, price: { id: "price_cap_mini_m" } },
    ];
    const r = classifierItemsAbonnement(items, { prixBaseAttendus: base, prixCapaciteAttendus: capacite });
    expect(r.fiable).toBe(false);
    expect(r.capaciteDupliquee).toHaveLength(1);
    expect(r.anomalies.join(" ")).toContain("plusieurs items de capacité");
  });

  it("price inconnu → inconnus + non fiable via anomalie", () => {
    const items: ItemAbonnement[] = [{ id: "si_x", quantity: 1, price: { id: "price_pirate" } }];
    const r = classifierItemsAbonnement(items, { prixBaseAttendus: base, prixCapaciteAttendus: capacite });
    expect(r.inconnus.map((i) => i.id)).toEqual(["si_x"]);
    expect(r.anomalies.join(" ")).toContain("inconnu");
  });

  it("quantité de capacité invalide → non fiable", () => {
    for (const q of [undefined, -1, 1.5]) {
      const items: ItemAbonnement[] = [{ id: "si_cap", quantity: q as number, price: { id: "price_cap_mini_m" } }];
      const r = classifierItemsAbonnement(items, { prixBaseAttendus: base, prixCapaciteAttendus: capacite });
      expect(r.fiable).toBe(false);
    }
  });

  it("item sans price.id → inconnu", () => {
    const r = classifierItemsAbonnement([{ id: "si_np" }], { prixBaseAttendus: base, prixCapaciteAttendus: capacite });
    expect(r.inconnus).toHaveLength(1);
    expect(r.anomalies.join(" ")).toContain("sans price.id");
  });

  it("liste vide / undefined → tout à null, fiable", () => {
    const r = classifierItemsAbonnement(undefined, { prixBaseAttendus: base, prixCapaciteAttendus: capacite });
    expect(r.base).toBeNull();
    expect(r.capacite).toBeNull();
    expect(r.fiable).toBe(true);
  });
});

describe("validation de quantité", () => {
  it("accepte les entiers ≥ 0", () => {
    expect(validerQuantiteCapacite(0)).toBe(0);
    expect(validerQuantiteCapacite(5)).toBe(5);
    expect(validerQuantiteCapacite("10")).toBe(10);
    expect(validerQuantiteCapacite(CAPACITE_SUPPLEMENTAIRE_MAX)).toBe(CAPACITE_SUPPLEMENTAIRE_MAX);
  });
  it("rejette négatif / non entier / non numérique / au-delà du max", () => {
    for (const v of [-1, 2.5, "x", NaN, Infinity, CAPACITE_SUPPLEMENTAIRE_MAX + 1]) {
      expect(() => validerQuantiteCapacite(v)).toThrow(QuantiteCapaciteInvalideError);
    }
  });
});

describe("planification hausse immédiate / baisse fin de période", () => {
  const finPeriode = "2026-10-01T00:00:00.000Z";
  const maintenant = new Date("2026-09-15T12:00:00.000Z");

  it("aucun changement", () => {
    const p = planifierChangementCapacite({ actuel: 3, cible: 3, finDePeriodeAt: finPeriode, maintenant });
    expect(p.type).toBe("aucun");
    expect(p.capaciteImmediate).toBe(3);
    expect(p.capacitePlanifiee).toBeNull();
    expect(p.proration).toBe("none");
  });

  it("hausse (2 → 5) : effet immédiat, always_invoice", () => {
    const p = planifierChangementCapacite({ actuel: 2, cible: 5, finDePeriodeAt: finPeriode, maintenant });
    expect(p.type).toBe("hausse");
    expect(p.effet).toBe("immediat");
    expect(p.capaciteImmediate).toBe(5);
    expect(p.capacitePlanifiee).toBeNull();
    expect(p.proration).toBe("always_invoice");
    expect(p.dateEffet).toBe(maintenant.toISOString());
  });

  it("+1 / +5 / +10 raccourcis ⇒ toujours une hausse d'une seule quantité totale", () => {
    for (const [actuel, cible] of [[0, 1], [0, 5], [0, 10], [3, 8]]) {
      const p = planifierChangementCapacite({ actuel, cible, finDePeriodeAt: finPeriode, maintenant });
      expect(p.type).toBe("hausse");
      expect(p.capaciteImmediate).toBe(cible);
    }
  });

  it("baisse (10 → 3) : effet fin de période, capacité DB inchangée jusqu'à l'échéance", () => {
    const p = planifierChangementCapacite({ actuel: 10, cible: 3, finDePeriodeAt: finPeriode, maintenant });
    expect(p.type).toBe("baisse");
    expect(p.effet).toBe("fin_de_periode");
    expect(p.capaciteImmediate).toBe(10); // ← aucune suppression / réduction immédiate
    expect(p.capacitePlanifiee).toBe(3);
    expect(p.dateEffet).toBe(new Date(finPeriode).toISOString());
    expect(p.proration).toBe("create_prorations");
  });

  it("baisse → 0 : suppression planifiée, pas immédiate", () => {
    const p = planifierChangementCapacite({ actuel: 5, cible: 0, finDePeriodeAt: finPeriode, maintenant });
    expect(p.type).toBe("baisse");
    expect(p.capacitePlanifiee).toBe(0);
    expect(p.capaciteImmediate).toBe(5);
  });

  it("baisse sans date de fin de période connue → dateEffet null (à résoudre par l'appelant)", () => {
    const p = planifierChangementCapacite({ actuel: 5, cible: 2, finDePeriodeAt: null, maintenant });
    expect(p.type).toBe("baisse");
    expect(p.dateEffet).toBeNull();
    expect(p.capacitePlanifiee).toBe(2);
  });

  it("rejette une cible invalide", () => {
    expect(() => planifierChangementCapacite({ actuel: 3, cible: -1, finDePeriodeAt: finPeriode })).toThrow();
  });
});

describe("machine à états de la saga", () => {
  it("chemin nominal hausse : pending → stripe_applied → completed", () => {
    expect(prochaineTransitionSaga("pending", "stripe_ok")).toBe("stripe_applied");
    expect(prochaineTransitionSaga("stripe_applied", "db_ok")).toBe("completed");
  });
  it("erreur Stripe : pending → failed", () => {
    expect(prochaineTransitionSaga("pending", "stripe_erreur")).toBe("failed");
  });
  it("erreur DB après Stripe : stripe_applied → needs_reconcile → completed", () => {
    expect(prochaineTransitionSaga("stripe_applied", "db_erreur")).toBe("needs_reconcile");
    expect(prochaineTransitionSaga("needs_reconcile", "reconcile_ok")).toBe("completed");
  });
  it("baisse programmée : scheduled → (échéance) → pending", () => {
    expect(prochaineTransitionSaga("scheduled", "echeance_atteinte")).toBe("pending");
    expect(prochaineTransitionSaga("scheduled", "abandon")).toBe("failed");
  });
  it("états terminaux figés : completed / failed n'acceptent aucune transition", () => {
    for (const ev of ["stripe_ok", "db_ok", "stripe_erreur", "abandon", "reconcile_ok"] as const) {
      expect(prochaineTransitionSaga("completed", ev)).toBeNull();
      expect(prochaineTransitionSaga("failed", ev)).toBeNull();
    }
    expect(sagaEstTerminale("completed")).toBe(true);
    expect(sagaEstTerminale("failed")).toBe(true);
    expect(sagaEstTerminale("needs_reconcile")).toBe(false);
  });
  it("transitions non permises → null (jamais forcer)", () => {
    expect(prochaineTransitionSaga("pending", "db_ok")).toBeNull();
    expect(prochaineTransitionSaga("stripe_applied", "stripe_ok")).toBeNull();
    expect(prochaineTransitionSaga("scheduled", "stripe_ok")).toBeNull();
  });
});

describe("garde d'événements out-of-order", () => {
  it("événement plus récent → appliqué", () => {
    expect(evenementStripeEstApplicable({ evenementCreatedAt: 200, dernierEvenementTraiteAt: 100 })).toBe(true);
  });
  it("événement plus ancien → ignoré (ne réécrit pas un état plus récent)", () => {
    expect(evenementStripeEstApplicable({ evenementCreatedAt: 50, dernierEvenementTraiteAt: 100 })).toBe(false);
  });
  it("égalité d'horodatage → départage par période de subscription", () => {
    expect(evenementStripeEstApplicable({ evenementCreatedAt: 100, dernierEvenementTraiteAt: 100, subscriptionPeriodStart: 20, dernierePeriodStartConnu: 10 })).toBe(true);
    expect(evenementStripeEstApplicable({ evenementCreatedAt: 100, dernierEvenementTraiteAt: 100, subscriptionPeriodStart: 5, dernierePeriodStartConnu: 10 })).toBe(false);
  });
  it("premier événement (aucun état connu) → appliqué", () => {
    expect(evenementStripeEstApplicable({ evenementCreatedAt: 100, dernierEvenementTraiteAt: null })).toBe(true);
  });
});

describe("clé d'idempotence déterministe", () => {
  it("même intention rejouée ⇒ même clé", () => {
    const a = construireIdempotencyKey({ entrepriseId: "e1", type: "hausse", cible: 5, subscriptionId: "sub_1" });
    const b = construireIdempotencyKey({ entrepriseId: "e1", type: "hausse", cible: 5, subscriptionId: "sub_1" });
    expect(a).toBe(b);
  });
  it("cible ou type différents ⇒ clé différente", () => {
    const base = construireIdempotencyKey({ entrepriseId: "e1", type: "hausse", cible: 5, subscriptionId: "sub_1" });
    expect(construireIdempotencyKey({ entrepriseId: "e1", type: "hausse", cible: 6, subscriptionId: "sub_1" })).not.toBe(base);
    expect(construireIdempotencyKey({ entrepriseId: "e1", type: "baisse", cible: 5, subscriptionId: "sub_1" })).not.toBe(base);
    expect(construireIdempotencyKey({ entrepriseId: "e2", type: "hausse", cible: 5, subscriptionId: "sub_1" })).not.toBe(base);
  });
  it("période de référence prise en compte quand fournie", () => {
    const a = construireIdempotencyKey({ entrepriseId: "e1", type: "hausse", cible: 5, subscriptionId: "sub_1", periodeReference: 111 });
    const b = construireIdempotencyKey({ entrepriseId: "e1", type: "hausse", cible: 5, subscriptionId: "sub_1", periodeReference: 222 });
    expect(a).not.toBe(b);
  });
});

describe("swap de Price atomique (plan change, quantité conservée)", () => {
  it("construit un POST sur l'item existant avec le nouveau Price et la même quantité", () => {
    const p = payloadSwapPrixCapacite({ itemId: "si_cap", nouveauPrixId: "price_cap_pro_m", quantite: 5 });
    expect(p.path).toBe("subscription_items/si_cap");
    expect(p.body).toEqual({ price: "price_cap_pro_m", quantity: "5", proration_behavior: "create_prorations" });
  });
  it("jamais de delete/create : un seul path d'item", () => {
    const p = payloadSwapPrixCapacite({ itemId: "si_cap", nouveauPrixId: "price_cap_biz_m", quantite: 12, proration: "always_invoice" });
    expect(p.path).not.toContain("DELETE");
    expect(p.body.proration_behavior).toBe("always_invoice");
  });
  it("exige itemId, nouveauPrixId et une quantité valide", () => {
    expect(() => payloadSwapPrixCapacite({ itemId: "", nouveauPrixId: "p", quantite: 1 })).toThrow();
    expect(() => payloadSwapPrixCapacite({ itemId: "i", nouveauPrixId: "", quantite: 1 })).toThrow();
    expect(() => payloadSwapPrixCapacite({ itemId: "i", nouveauPrixId: "p", quantite: -1 })).toThrow();
  });
});

describe("résolution plan/périodicité sûre", () => {
  it("valide", () => {
    expect(resoudrePlanPeriodicite("pro", "mensuel")).toEqual({ plan: "pro", periodicite: "mensuel" });
  });
  it("rejette valeurs inconnues / nulles", () => {
    expect(resoudrePlanPeriodicite("gold", "mensuel")).toBeNull();
    expect(resoudrePlanPeriodicite("pro", "hebdo")).toBeNull();
    expect(resoudrePlanPeriodicite(null, "mensuel")).toBeNull();
    expect(resoudrePlanPeriodicite("pro", undefined)).toBeNull();
  });
});

describe("résolution serveur de la cible de capacité (R2-C)", () => {
  it("raccourci +5 depuis 2 → 7", () => {
    expect(resoudreCibleCapacite({ actuel: 2, delta: 5 })).toBe(7);
  });
  it("raccourci +10 depuis 0 → 10", () => {
    expect(resoudreCibleCapacite({ actuel: 0, delta: 10 })).toBe(10);
  });
  it("raccourci −5 depuis 8 → 3", () => {
    expect(resoudreCibleCapacite({ actuel: 8, delta: -5 })).toBe(3);
  });
  it("baisse bornée à 0 (jamais négative)", () => {
    expect(resoudreCibleCapacite({ actuel: 3, delta: -10 })).toBe(0);
  });
  it("cible absolue prime sur delta", () => {
    expect(resoudreCibleCapacite({ actuel: 2, delta: 5, cibleAbsolue: 12 })).toBe(12);
  });
  it("cible absolue négative → 0, au-delà du max → max", () => {
    expect(resoudreCibleCapacite({ actuel: 4, cibleAbsolue: -3 })).toBe(0);
    expect(resoudreCibleCapacite({ actuel: 4, cibleAbsolue: CAPACITE_SUPPLEMENTAIRE_MAX + 50 })).toBe(CAPACITE_SUPPLEMENTAIRE_MAX);
  });
  it("valeur non finie ou fractionnaire → normalisée", () => {
    expect(resoudreCibleCapacite({ actuel: 5, delta: Number.NaN })).toBe(5);
    expect(resoudreCibleCapacite({ actuel: 5, cibleAbsolue: 7.9 })).toBe(7);
  });
  it("raccourcis figés = 1 / 5 / 10", () => {
    expect([...RACCOURCIS_CAPACITE]).toEqual([1, 5, 10]);
  });
});

describe("résumé chiffré d'un changement de capacité (écran de confirmation R2-C)", () => {
  it("Mini : prix unitaire 15 € HT/mois, hausse +1", () => {
    const r = resumeChangementCapacite({ plan: "mini", capaciteBase: 3, personnesActives: 3, supplementActuel: 0, supplementCible: 1 });
    expect(r).toMatchObject({ sens: "hausse", prixUnitaireMensuelHt: 15, deltaPersonnes: 1, coutMensuelCibleHt: 15, coutMensuelDeltaHt: 15 });
  });
  it("Pro : prix unitaire 12 €, 2 → 7 personnes supplémentaires", () => {
    const r = resumeChangementCapacite({ plan: "pro", capaciteBase: 15, personnesActives: 10, supplementActuel: 2, supplementCible: 7 });
    expect(r).toMatchObject({
      sens: "hausse",
      prixUnitaireMensuelHt: 12,
      deltaPersonnes: 5,
      coutMensuelActuelHt: 24,
      coutMensuelCibleHt: 84,
      coutMensuelDeltaHt: 60,
      capaciteTotaleProjetee: 22,
    });
  });
  it("Business et Entreprise : prix unitaire 9 €", () => {
    expect(resumeChangementCapacite({ plan: "business", capaciteBase: 30, personnesActives: 0, supplementActuel: 0, supplementCible: 4 })?.prixUnitaireMensuelHt).toBe(9);
    expect(resumeChangementCapacite({ plan: "entreprise", capaciteBase: 50, personnesActives: 0, supplementActuel: 0, supplementCible: 4 })?.prixUnitaireMensuelHt).toBe(9);
  });
  it("baisse : delta et coût mensuel négatifs, capacité projetée réduite", () => {
    const r = resumeChangementCapacite({ plan: "mini", capaciteBase: 3, personnesActives: 4, supplementActuel: 10, supplementCible: 5 });
    expect(r).toMatchObject({ sens: "baisse", deltaPersonnes: -5, coutMensuelDeltaHt: -75, capaciteTotaleProjetee: 8 });
  });
  it("cible identique → sens « aucun »", () => {
    expect(resumeChangementCapacite({ plan: "pro", capaciteBase: 15, personnesActives: 5, supplementActuel: 7, supplementCible: 7 })?.sens).toBe("aucun");
  });
  it("baisse mettant l'entreprise au-dessus de sa capacité → depasseraCapacite = true", () => {
    const r = resumeChangementCapacite({ plan: "pro", capaciteBase: 15, personnesActives: 20, supplementActuel: 10, supplementCible: 3 });
    expect(r?.capaciteTotaleProjetee).toBe(18);
    expect(r?.depasseraCapacite).toBe(true);
  });
  it("baisse restant dans la capacité → depasseraCapacite = false", () => {
    const r = resumeChangementCapacite({ plan: "pro", capaciteBase: 15, personnesActives: 16, supplementActuel: 10, supplementCible: 3 });
    expect(r?.depasseraCapacite).toBe(false);
  });
  it("offre non commercialisée ou inconnue → null (capacité à la carte indisponible)", () => {
    expect(resumeChangementCapacite({ plan: "essentiel", capaciteBase: 2, personnesActives: 0, supplementActuel: 0, supplementCible: 3 })).toBeNull();
    expect(resumeChangementCapacite({ plan: "sur_mesure", capaciteBase: 50, personnesActives: 0, supplementActuel: 0, supplementCible: 3 })).toBeNull();
    expect(resumeChangementCapacite({ plan: "gold", capaciteBase: 0, personnesActives: 0, supplementActuel: 0, supplementCible: 3 })).toBeNull();
    expect(resumeChangementCapacite({ plan: null, capaciteBase: 0, personnesActives: 0, supplementActuel: 0, supplementCible: 3 })).toBeNull();
  });
});
