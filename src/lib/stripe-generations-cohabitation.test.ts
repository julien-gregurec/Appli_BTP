import { describe, expect, it } from "vitest";
import {
  PrixGenerationHistoriqueNonVendable,
  allowlistPrixBase,
  allowlistPrixHorsForfait,
  creerSessionAbonnementStripe,
  prixStripePour,
  verifierPrixVendable,
} from "./stripe-abonnement";
import { allowlistPrixCapacite, classifierItemsAbonnement } from "./stripe-capacite-personnes";

/**
 * TRAIN V3 — cohabitation des générations tarifaires.
 *
 * Un Price *connu* du serveur peut encore appartenir à un contrat historique.
 * Un Price *vendable* peut être proposé à un nouveau client. Les deux ensembles
 * ne coïncident pas, et c'est délibéré : les confondre casse soit les contrats
 * en cours, soit le catalogue. Ces tests tiennent les quatre interdits.
 */

// Génération fermée, encore portée par des abonnements.
const V2_MINI_MENSUEL = "price_v2_mini_mensuel";
const V3_MINI_ANNUEL = "price_v3_mini_annuel";
// Génération courante, seule vendable.
const V4_MINI_MENSUEL = "price_v4_mini_mensuel";
const V4_MINI_ANNUEL = "price_v4_mini_annuel";
const V4_CAPACITE_MINI = "price_v4_capacite_mini_mensuel";

/** Environnement d'après repointage : les variables courantes désignent la V4. */
const ENV = {
  STRIPE_PRICE_MINI_MENSUEL: V4_MINI_MENSUEL,
  STRIPE_PRICE_MINI_ANNUEL: V4_MINI_ANNUEL,
  STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL: V4_CAPACITE_MINI,
  STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES: `${V2_MINI_MENSUEL},${V3_MINI_ANNUEL}`,
  NEXT_PUBLIC_APP_URL: "https://app.exemple.invalid",
};

const registres = (env: Record<string, string | undefined>) => ({
  prixBaseAttendus: allowlistPrixBase(env),
  prixCapaciteAttendus: allowlistPrixCapacite(env),
  prixAutresConnus: allowlistPrixHorsForfait(env),
});

const item = (id: string, priceId: string, quantity = 1) => ({
  id,
  price: { id: priceId },
  quantity,
});

describe("interdit n°1 — un ancien abonnement ne devient jamais inclassable", () => {
  it("reste fiable après repointage des variables courantes sur la V4", () => {
    // L'abonnement porte le forfait de la génération fermée : c'est le cas qui
    // cassait. Le classifieur est fail-closed, un `inconnu` gèle toute
    // réconciliation de capacité sur cet abonnement.
    const classification = classifierItemsAbonnement(
      [item("si_base", V2_MINI_MENSUEL), item("si_capacite", V4_CAPACITE_MINI, 3)],
      registres(ENV),
    );
    expect(classification.inconnus).toHaveLength(0);
    expect(classification.fiable).toBe(true);
    expect(classification.anomalies).toEqual([]);
    expect(classification.base?.price?.id).toBe(V2_MINI_MENSUEL);
    expect(classification.capacite?.id).toBe("si_capacite");
  });

  it("l'annuel d'une génération intermédiaire est reconnu lui aussi", () => {
    const classification = classifierItemsAbonnement([item("si_base", V3_MINI_ANNUEL)], registres(ENV));
    expect(classification.inconnus).toHaveLength(0);
    expect(classification.fiable).toBe(true);
  });

  it("sans déclaration des générations précédentes, l'abonnement redevient inclassable", () => {
    // Preuve que le test ci-dessus mesure bien quelque chose : on retire la
    // seule chose qui protège, et la régression réapparaît.
    const sansDeclaration = { ...ENV, STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES: "" };
    const classification = classifierItemsAbonnement(
      [item("si_base", V2_MINI_MENSUEL)],
      registres(sansDeclaration),
    );
    expect(classification.inconnus).toHaveLength(1);
  });

  it("un Price réellement étranger reste inconnu : l'allowlist ne devient pas passoire", () => {
    const classification = classifierItemsAbonnement(
      [item("si_base", V4_MINI_MENSUEL), item("si_intrus", "price_jamais_vu")],
      registres(ENV),
    );
    expect(classification.inconnus.map((i) => i.id)).toEqual(["si_intrus"]);
  });
});

describe("interdit n°2 — un Price historique n'est jamais proposé à un nouveau checkout", () => {
  it("le garde refuse un Price de génération fermée", () => {
    expect(() => verifierPrixVendable(V2_MINI_MENSUEL, ENV)).toThrow(PrixGenerationHistoriqueNonVendable);
    expect(() => verifierPrixVendable(V3_MINI_ANNUEL, ENV)).toThrow(PrixGenerationHistoriqueNonVendable);
  });

  it("le garde laisse passer la génération courante", () => {
    expect(verifierPrixVendable(V4_MINI_MENSUEL, ENV)).toBe(V4_MINI_MENSUEL);
  });

  it("le checkout échoue avant tout appel réseau si une variable courante pointe un ancien Price", async () => {
    // Erreur de configuration réaliste : la variable de vente a été repointée à
    // l'envers. Facturer serait pire qu'échouer.
    const malConfigure = { ...ENV, STRIPE_PRICE_MINI_MENSUEL: V2_MINI_MENSUEL };
    await expect(
      creerSessionAbonnementStripe({
        entrepriseId: "ent-1",
        customerId: "cus_1",
        offre: "mini",
        periodicite: "mensuel",
        environnement: malConfigure,
      }),
    ).rejects.toThrow(PrixGenerationHistoriqueNonVendable);
  });

  it("connaître un ancien Price ne le rend pas vendable", () => {
    expect(allowlistPrixBase(ENV).has(V2_MINI_MENSUEL)).toBe(true);
    const vendables = new Set(
      (["mensuel", "annuel"] as const).map((p) => prixStripePour("mini", p, ENV)),
    );
    expect(vendables.has(V2_MINI_MENSUEL)).toBe(false);
    expect(vendables.has(V3_MINI_ANNUEL)).toBe(false);
  });
});

describe("interdit n°3 — un nouveau client ne reçoit jamais un ancien tarif", () => {
  it("chaque offre × périodicité ne rend que la génération courante", () => {
    const historiques = new Set([V2_MINI_MENSUEL, V3_MINI_ANNUEL]);
    for (const periodicite of ["mensuel", "annuel"] as const) {
      const prix = prixStripePour("mini", periodicite, ENV);
      expect(prix).not.toBeNull();
      expect(historiques.has(prix!)).toBe(false);
      expect(() => verifierPrixVendable(prix!, ENV)).not.toThrow();
    }
  });

  it("aucune génération fermée ne peut redevenir vendable en restant déclarée", () => {
    // Déclarer un Price comme historique et le remettre en vente en même temps
    // est contradictoire : le garde tranche en faveur du refus.
    const contradictoire = {
      ...ENV,
      STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES: `${V2_MINI_MENSUEL},${V4_MINI_MENSUEL}`,
    };
    expect(() => verifierPrixVendable(V4_MINI_MENSUEL, contradictoire)).toThrow(
      PrixGenerationHistoriqueNonVendable,
    );
  });
});

describe("interdit n°4 — un client existant n'est jamais migré automatiquement", () => {
  it("l'item de forfait historique n'est jamais une cible de mutation", () => {
    // Le réconciliateur ne mute que `classification.capacite`. L'item de base,
    // lui, est seulement observé : c'est ce qui fige le prix souscrit.
    const classification = classifierItemsAbonnement(
      [item("si_base", V2_MINI_MENSUEL), item("si_capacite", V4_CAPACITE_MINI, 2)],
      registres(ENV),
    );
    expect(classification.base?.price?.id).toBe(V2_MINI_MENSUEL);
    // Le forfait n'est ni un item de capacité, ni un item « autre » : rien ne
    // peut le swapper.
    expect(classification.capacite?.price?.id).not.toBe(V2_MINI_MENSUEL);
    expect(classification.autres.map((i) => i.price?.id)).not.toContain(V2_MINI_MENSUEL);
  });

  it("reconnaître un ancien forfait n'aligne pas son prix sur la génération courante", () => {
    const classification = classifierItemsAbonnement([item("si_base", V2_MINI_MENSUEL)], registres(ENV));
    expect(classification.base?.price?.id).toBe(V2_MINI_MENSUEL);
    expect(classification.base?.price?.id).not.toBe(prixStripePour("mini", "mensuel", ENV));
  });
});
