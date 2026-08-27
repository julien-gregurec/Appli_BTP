import { beforeEach, describe, expect, it } from "vitest";
import { OperationRemiseAReconcilier, reconcilierOperationRemise, type EtatSouhaiteRemise, type OperationRemise, type StatutOperationRemise } from "./stripe-discount-consistency";
import type { StripeSubscription } from "./stripe-abonnement";

function operationApplication(): OperationRemise {
  return {
    id: "op-1", entreprise_id: "entreprise-1", stripe_subscription_id: "sub-1",
    type_operation: "application", statut: "pending", coupon_stripe_id: null,
    cle_idempotence_coupon: "coupon-op-1", cle_idempotence_application: "apply-op-1",
    nombre_tentatives: 0,
    etat_souhaite: { active: true, type: "pourcentage", valeur: 10, duree: "forever", description: "10 % à vie", motif_interne: "Pilote", nom_coupon: "Test — 10 % à vie" },
  };
}

function operationRetrait(): OperationRemise {
  return { ...operationApplication(), id: "op-2", type_operation: "retrait", etat_souhaite: { active: false }, coupon_stripe_id: null, cle_idempotence_coupon: null, cle_idempotence_application: null };
}

function environnement(initiale: OperationRemise, couponStripe: string | null = null) {
  let operation = structuredClone(initiale);
  let remiseMetier: string | null = initiale.type_operation === "retrait" ? "coupon-ancien" : null;
  let couponActif = couponStripe;
  let echecFinalisation = false;
  let timeoutApresEffet = false;
  const historique: StatutOperationRemise[] = [operation.statut];
  const effets = { creation: 0, application: 0, retrait: 0, lecture: 0 };
  const couponsParCle = new Map<string, string>();
  const applicationsParCle = new Map<string, string>();
  const stockage = {
    async transition(_id: string, statut: StatutOperationRemise, _etat: { coupon_id: string | null } | null, couponId?: string | null) {
      if (statut === "stripe_in_progress" && operation.statut === "stripe_in_progress") throw new Error("déjà en cours");
      operation = { ...operation, statut, coupon_stripe_id: couponId ?? operation.coupon_stripe_id, nombre_tentatives: operation.nombre_tentatives + (statut === "stripe_in_progress" ? 1 : 0) };
      historique.push(statut);
      return structuredClone(operation);
    },
    async enregistrerCoupon(_id: string, couponId: string) {
      operation = { ...operation, coupon_stripe_id: couponId };
      historique.push("stripe_in_progress");
      return structuredClone(operation);
    },
    async preparerApplication() {
      const numero = (operation.numero_posts_application ?? 0) + 1;
      operation = { ...operation, numero_posts_application: numero, cle_idempotence_application: `${operation.id}-apply-${numero}` };
      historique.push("stripe_in_progress");
      return structuredClone(operation);
    },
    async finaliser(_operation: OperationRemise, etat: { coupon_id: string | null }) {
      if (echecFinalisation) { echecFinalisation = false; throw new Error("sql indisponible"); }
      remiseMetier = etat.coupon_id;
      operation = { ...operation, statut: "completed" };
      historique.push("completed");
      return structuredClone(operation);
    },
  };
  const stripe = {
    async lire(): Promise<StripeSubscription> {
      effets.lecture++;
      return { id: "sub-1", customer: "cus-1", status: "active", discounts: couponActif ? [{ source: { coupon: { id: couponActif } } }] : [] };
    },
    couponActif(abonnement: StripeSubscription) {
      const source = typeof abonnement.discounts?.[0] === "object" ? abonnement.discounts[0].source?.coupon : null;
      return source && typeof source === "object" ? source.id ?? null : typeof source === "string" ? source : null;
    },
    async creerCoupon(_souhait: EtatSouhaiteRemise, cle: string) {
      if (!couponsParCle.has(cle)) { effets.creation++; couponsParCle.set(cle, `coupon-${effets.creation}`); }
      return { id: couponsParCle.get(cle)! };
    },
    async appliquerCoupon(_subscription: string, coupon: string, cle: string) {
      if (!applicationsParCle.has(cle)) { effets.application++; applicationsParCle.set(cle, coupon); couponActif = coupon; }
      if (timeoutApresEffet) { timeoutApresEffet = false; throw new Error("timeout"); }
    },
    async retirerCoupon() {
      effets.retrait++;
      if (couponActif === null) throw new Error("No discount exists");
      couponActif = null;
      if (timeoutApresEffet) { timeoutApresEffet = false; throw new Error("timeout"); }
    },
  };
  return {
    stockage, stripe, historique, effets,
    operation: () => structuredClone(operation),
    stripeActuel: () => couponActif,
    metierActuel: () => remiseMetier,
    echouerFinalisation: () => { echecFinalisation = true; },
    timeoutApresMutation: () => { timeoutApresEffet = true; },
    modifierStripe: (coupon: string | null) => { couponActif = coupon; },
  };
}

describe("saga persistante des remises Stripe", () => {
  let env: ReturnType<typeof environnement>;
  beforeEach(() => { env = environnement(operationApplication()); });

  it("1. applique normalement et finalise les deux états", async () => {
    await reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe);
    expect(env.stripeActuel()).toBe("coupon-1"); expect(env.metierActuel()).toBe("coupon-1");
  });
  it("2. retire normalement et finalise les deux états", async () => {
    env = environnement(operationRetrait(), "coupon-ancien");
    await reconcilierOperationRemise(operationRetrait(), env.stockage, env.stripe);
    expect(env.stripeActuel()).toBeNull(); expect(env.metierActuel()).toBeNull();
  });
  it("3. un échec avant Stripe produit zéro effet", async () => {
    env.stockage.transition = async () => { throw new Error("sql"); };
    await expect(reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe)).rejects.toBeInstanceOf(OperationRemiseAReconcilier);
    expect(env.effets.creation + env.effets.application + env.effets.retrait).toBe(0);
  });
  it("4. succès Stripe puis échec SQL reste réconciliable", async () => {
    env.echouerFinalisation();
    await expect(reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe)).rejects.toBeInstanceOf(OperationRemiseAReconcilier);
    expect(env.stripeActuel()).toBe("coupon-1"); expect(env.metierActuel()).toBeNull();
  });
  it("5. reprise d'une application déjà réalisée ne rejoue pas Stripe", async () => {
    env.echouerFinalisation(); await expect(reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe)).rejects.toThrow();
    const effets = env.effets.application;
    await reconcilierOperationRemise(env.operation(), env.stockage, env.stripe);
    expect(env.effets.application).toBe(effets); expect(env.metierActuel()).toBe("coupon-1");
  });
  it("6. reprise d'un retrait déjà réalisé ne répète pas DELETE", async () => {
    env = environnement(operationRetrait(), "coupon-ancien"); env.echouerFinalisation();
    await expect(reconcilierOperationRemise(operationRetrait(), env.stockage, env.stripe)).rejects.toThrow();
    const effets = env.effets.retrait;
    await reconcilierOperationRemise(env.operation(), env.stockage, env.stripe);
    expect(env.effets.retrait).toBe(effets); expect(env.metierActuel()).toBeNull();
  });
  it("7. la même clé POST renvoie le coupon initial", async () => {
    const a = await env.stripe.creerCoupon(operationApplication().etat_souhaite, "stable");
    const b = await env.stripe.creerCoupon(operationApplication().etat_souhaite, "stable");
    expect(b).toEqual(a); expect(env.effets.creation).toBe(1);
  });
  it("8. une nouvelle intention reçoit une nouvelle clé et un nouvel effet", async () => {
    await env.stripe.creerCoupon(operationApplication().etat_souhaite, "op-a");
    await env.stripe.creerCoupon(operationApplication().etat_souhaite, "op-b");
    expect(env.effets.creation).toBe(2);
  });
  it("9. DELETE répété n'est pas supposé idempotent", async () => {
    env = environnement(operationRetrait(), "coupon-ancien"); await env.stripe.retirerCoupon();
    await expect(env.stripe.retirerCoupon()).rejects.toThrow("No discount exists");
  });
  it("10-11. timeout inconnu puis lecture confirmant l'effet", async () => {
    env.timeoutApresMutation(); await expect(reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe)).rejects.toThrow();
    const effets = env.effets.application; await reconcilierOperationRemise(env.operation(), env.stockage, env.stripe);
    expect(env.effets.application).toBe(effets); expect(env.metierActuel()).toBe("coupon-1");
  });
  it("12-13. crash puis redémarrage reprend depuis l'état persistant", async () => {
    env.echouerFinalisation(); await expect(reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe)).rejects.toThrow();
    const copiePersistante = env.operation(); await reconcilierOperationRemise(copiePersistante, env.stockage, env.stripe);
    expect(env.operation().statut).toBe("completed");
  });
  it("14-16. double clic identique converge sans second effet", async () => {
    const [a, b] = await Promise.allSettled([
      reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe),
      reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe),
    ]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(env.effets.application).toBe(1); expect(env.historique.filter((s) => s === "completed")).toHaveLength(1);
  });
  it("17-19. une opération non créée ne peut lire ni muter Stripe", () => {
    expect(env.effets).toEqual({ creation: 0, application: 0, retrait: 0, lecture: 0 });
  });
  it("20. rejouer une opération terminée ne produit ni effet ni historique", async () => {
    const terminee = await reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe); const longueur = env.historique.length;
    await reconcilierOperationRemise(terminee, env.stockage, env.stripe);
    expect(env.historique).toHaveLength(longueur); expect(env.effets.application).toBe(1);
  });
  it("21. une modification manuelle Stripe est détectée et corrigée", async () => {
    env.echouerFinalisation(); await expect(reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe)).rejects.toThrow();
    env.modifierStripe("coupon-manuel"); await reconcilierOperationRemise(env.operation(), env.stockage, env.stripe);
    expect(env.stripeActuel()).toBe("coupon-1"); expect(env.effets.application).toBe(2);
  });
  it("22. l'erreur publique ne contient aucun diagnostic interne", async () => {
    env.stockage.transition = async () => { throw new Error("diagnostic-interne-sensible sql détail privé"); };
    await expect(reconcilierOperationRemise(operationApplication(), env.stockage, env.stripe)).rejects.toThrow("doit être vérifiée et finalisée");
  });
  it("23. une expiration confirmée finalise sans DELETE Stripe", async () => {
    const expiration = { ...operationRetrait(), etat_souhaite: { active: false, mode: "expiration_stripe" as const } };
    env = environnement(expiration, null);
    await reconcilierOperationRemise(expiration, env.stockage, env.stripe);
    expect(env.effets.retrait).toBe(0);
    expect(env.operation().statut).toBe("completed");
  });
  it("24. une remise réapparue annule l'expiration sans mutation Stripe", async () => {
    const expiration = { ...operationRetrait(), etat_souhaite: { active: false, mode: "expiration_stripe" as const } };
    env = environnement(expiration, "coupon-nouveau");
    const resultat = await reconcilierOperationRemise(expiration, env.stockage, env.stripe);
    expect(resultat.statut).toBe("cancelled");
    expect(env.effets.retrait).toBe(0);
    expect(env.stripeActuel()).toBe("coupon-nouveau");
  });
});
