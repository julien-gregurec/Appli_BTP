import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  construireAttendus,
  couplesRegleAnnuelle,
  offresSansPriceStripe,
} from "../../scripts/lib/stripe-prices-attendus.mjs";
import {
  allowlistPrixBase,
  allowlistPrixBaseGenerationsPrecedentes,
  allowlistPrixHorsForfait,
  prixStripePour,
} from "./stripe-abonnement";
import {
  MODULES_FACTURABLES,
  OFFRES_TARIFAIRES,
  OPTION_IA_INTENSIVE,
  PACK_CREDITS_IA,
  moduleInclusDansOffre,
  tarifModuleCentimes,
} from "./tarification";

/**
 * ELSATIA-STRIPE-TEST-CANONICAL-PRICES-P0-V1
 *
 * Ce que Stripe doit porter se déduit du contrat canonique, jamais l'inverse.
 * Ces tests tiennent la dérivation ; `npm run verify:stripe-prices` confronte
 * ensuite la dérivation au compte Stripe Test réel.
 */

const catalogue = JSON.parse(readFileSync("src/lib/tarification.canonical.json", "utf8"));
const attendus = construireAttendus(catalogue);
const GENERATION = "CANONICAL-V4-2026-09";

const parCle = (cle: string) => attendus.filter((a) => a.cle === cle);

describe("génération tarifaire", () => {
  it("le contrat canonique est bien la génération V4", () => {
    expect(catalogue.version).toBe(GENERATION);
  });

  it("chaque montant attendu vaut le montant canonique en centimes", () => {
    // Aucun montant n'est écrit dans le garde-fou : il ne fait que relayer le contrat.
    const mini = OFFRES_TARIFAIRES.find((o) => o.cle === "mini")!;
    expect(parCle("forfait_mini").find((a) => a.billingKind === "recurring_monthly")!.centimes)
      .toBe(mini.prixMensuelCentimes);
    expect(parCle("forfait_mini").find((a) => a.billingKind === "recurring_yearly")!.centimes)
      .toBe(mini.prixAnnuelCentimes);
    expect(attendus.every((a) => Number.isInteger(a.centimes) && a.centimes > 0)).toBe(true);
  });

  it("couvre les 27 Price de la grille : forfaits, comptes par rôle, modules, IA", () => {
    const parFamille = attendus.reduce<Record<string, number>>((acc, a) => {
      acc[a.famille] = (acc[a.famille] ?? 0) + 1;
      return acc;
    }, {});
    expect(parFamille).toEqual({ forfait: 8, compte_supplementaire: 6, module: 10, ia: 3 });
    expect(attendus).toHaveLength(27);
  });
});

describe("mensuel et annuel", () => {
  it("distingue chaque périodicité par une variable et une facturation propres", () => {
    const noms = attendus.map((a) => a.nomVar);
    expect(new Set(noms).size).toBe(noms.length);
    for (const a of attendus) {
      if (a.billingKind === "recurring_monthly") expect(a.interval).toBe("month");
      if (a.billingKind === "recurring_yearly") expect(a.interval).toBe("year");
      if (a.billingKind === "one_time") expect(a.interval).toBeNull();
    }
  });

  it("annuel = exactement dix mensualités, sur les 13 couples récurrents", () => {
    const couples = couplesRegleAnnuelle(attendus);
    expect(couples).toHaveLength(13);
    for (const c of couples) expect(c.annuel).toBe(c.mensuel * 10);
  });
});

describe("intelligence artificielle", () => {
  it("le pack de crédits est un achat ponctuel, sans annuel ni reconduction", () => {
    const pack = parCle("ia_credits_pack");
    expect(pack).toHaveLength(1);
    expect(pack[0].billingKind).toBe("one_time");
    expect(pack[0].centimes).toBe(PACK_CREDITS_IA.prixCentimes);
    expect(PACK_CREDITS_IA.prixAnnuelCentimes).toBeNull();
    expect(PACK_CREDITS_IA.renouvellementAutomatique).toBe(false);
  });

  it("l'IA intensive est récurrente et n'est jamais confondue avec le pack", () => {
    const intensive = parCle("ia_intensive");
    expect(intensive.map((a) => a.billingKind).sort())
      .toEqual(["recurring_monthly", "recurring_yearly"]);
    expect(intensive.find((a) => a.billingKind === "recurring_monthly")!.centimes)
      .toBe(OPTION_IA_INTENSIVE.mensuelCentimes);
    // Identifiants, variables et modes de facturation distincts.
    const varsPack = parCle("ia_credits_pack").map((a) => a.nomVar);
    const varsIntensive = intensive.map((a) => a.nomVar);
    expect(varsPack.some((v) => varsIntensive.includes(v))).toBe(false);
    expect(PACK_CREDITS_IA.cle).not.toBe(OPTION_IA_INTENSIVE.cle);
  });
});

describe("expert-comptable", () => {
  it("est gratuit et ne porte aucun Price payant", () => {
    const gratuites = offresSansPriceStripe(catalogue);
    expect(gratuites.map((g: { cle: string }) => g.cle)).toEqual(["compte_sup_expert_comptable"]);
    expect(attendus.some((a) => a.cle === "compte_sup_expert_comptable")).toBe(false);
  });
});

describe("modules", () => {
  it("un module compris dans le forfait n'est jamais facturé une seconde fois", () => {
    let auMoinsUnInclus = false;
    for (const offre of OFFRES_TARIFAIRES) {
      for (const module_ of MODULES_FACTURABLES) {
        if (!moduleInclusDansOffre(module_.cle, offre)) continue;
        auMoinsUnInclus = true;
        expect(tarifModuleCentimes(module_.cle, offre, "mensuel")).toBe(0);
        expect(tarifModuleCentimes(module_.cle, offre, "annuel")).toBe(0);
      }
    }
    expect(auMoinsUnInclus).toBe(true);
  });

  it("un module non compris est facturé au tarif canonique, annuel compris", () => {
    for (const offre of OFFRES_TARIFAIRES) {
      for (const module_ of MODULES_FACTURABLES) {
        if (moduleInclusDansOffre(module_.cle, offre)) continue;
        expect(tarifModuleCentimes(module_.cle, offre, "mensuel")).toBe(module_.mensuelCentimes);
        expect(tarifModuleCentimes(module_.cle, offre, "annuel")).toBe(module_.mensuelCentimes * 10);
      }
    }
  });
});

describe("aucun identifiant Live", () => {
  it("les variables attendues ne nomment que des Price, jamais un secret", () => {
    for (const a of attendus) {
      expect(a.nomVar).toMatch(/^STRIPE_PRICE_[A-Z0-9_]+$/);
      expect(a.nomVar).not.toMatch(/SECRET|WEBHOOK|LIVE/);
    }
  });
});

describe("cohabitation des générations", () => {
  // Environnement représentatif : les variables de vente pointent la V4, les
  // Price déjà souscrits restent déclarés à part.
  const ANCIEN_MINI_MENSUEL = "price_ancien_mini_mensuel";
  const V4_MINI_MENSUEL = "price_v4_mini_mensuel";
  const env = {
    STRIPE_PRICE_MINI_MENSUEL: V4_MINI_MENSUEL,
    STRIPE_PRICE_MINI_ANNUEL: "price_v4_mini_annuel",
    STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES: `${ANCIEN_MINI_MENSUEL}, price_ancien_pro_mensuel`,
    STRIPE_PRICE_IA_CREDITS_PACK_PONCTUEL: "price_v4_ia_pack",
    STRIPE_PRICE_MODULE_STOCK_MENSUEL: "price_v4_module_stock",
  };

  it("un nouveau contrat ne peut sélectionner que la génération courante", () => {
    expect(prixStripePour("mini", "mensuel", env)).toBe(V4_MINI_MENSUEL);
    expect(prixStripePour("mini", "mensuel", env)).not.toBe(ANCIEN_MINI_MENSUEL);
  });

  it("un abonnement déjà souscrit reste classable : son Price reste connu", () => {
    // Le classifieur est fail-closed ; un Price inconnu bloquerait toute
    // réconciliation de l'abonnement, sans le repricer pour autant.
    expect(allowlistPrixBase(env).has(ANCIEN_MINI_MENSUEL)).toBe(true);
    expect(allowlistPrixBase(env).has(V4_MINI_MENSUEL)).toBe(true);
    expect(allowlistPrixBaseGenerationsPrecedentes(env).has(ANCIEN_MINI_MENSUEL)).toBe(true);
  });

  it("connaître un ancien Price ne le rend pas vendable", () => {
    const vendables = new Set(
      (["mini", "pro", "business", "entreprise"] as const).flatMap((offre) =>
        (["mensuel", "annuel"] as const).map((p) => prixStripePour(offre, p, env)),
      ),
    );
    expect(vendables.has(ANCIEN_MINI_MENSUEL)).toBe(false);
  });

  it("ignore une entrée mal formée dans la liste des générations précédentes", () => {
    const bruite = { STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES: " price_ok , , sk_test_pas_un_price " };
    expect([...allowlistPrixBaseGenerationsPrecedentes(bruite)]).toEqual(["price_ok"]);
  });

  it("les modules et l'IA de la génération courante sont des lignes reconnues", () => {
    const connus = allowlistPrixHorsForfait(env);
    expect(connus.has("price_v4_ia_pack")).toBe(true);
    expect(connus.has("price_v4_module_stock")).toBe(true);
  });
});
