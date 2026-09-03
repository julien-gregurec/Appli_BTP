import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  reconcilierCapacitePersonnesStripe,
  reprendreOperationsCapaciteStripe,
  type DepsReconcileCapacite,
  type RequeteStripeMinimal,
} from "@/lib/stripe-capacite-reconcile";
import type { StripeSubscription } from "@/lib/stripe-abonnement";

const ENV = {
  STRIPE_PRICE_MINI_MENSUEL: "price_base_mini_m",
  STRIPE_PRICE_PRO_MENSUEL: "price_base_pro_m",
  STRIPE_PRICE_BUSINESS_MENSUEL: "price_base_biz_m",
  STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL: "price_cap_mini_m",
  STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL: "price_cap_pro_m",
  STRIPE_PRICE_COMPTE_SUP_BUSINESS_MENSUEL: "price_cap_biz_m",
  STRIPE_PRICE_OPTION_IA_100_MENSUEL: "price_ia_100_m",
};

// ── Faux client admin Supabase minimal ─────────────────────────────────────────
function fakeAdmin(entreprise: Record<string, unknown>, rpcImpl?: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null }) {
  const state = { entreprise: { ...entreprise }, updates: [] as Array<Record<string, unknown>>, rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }> };
  const admin = {
    from(table: string) {
      if (table !== "entreprises") throw new Error(`table inattendue ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: state.entreprise, error: null }),
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async () => {
              state.updates.push(patch);
              Object.assign(state.entreprise, patch);
              return { data: null, error: null };
            },
          };
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ fn, args });
      if (rpcImpl) return rpcImpl(fn, args);
      return { data: "op_" + fn, error: null };
    },
  };
  return { admin: admin as unknown as DepsReconcileCapacite["admin"], state };
}

function sub(items: Array<{ id: string; quantity?: number; price?: { id?: string } }>, extra: Partial<StripeSubscription> = {}): StripeSubscription {
  return {
    id: "sub_A",
    customer: "cus_A",
    status: "active",
    current_period_start: 1_000,
    current_period_end: 2_000,
    items: { data: items },
    ...extra,
  } as StripeSubscription;
}

const ENTREPRISE_BASE = {
  stripe_subscription_id: "sub_A",
  abonnement_offre: "mini",
  abonnement_periodicite: "mensuel",
  capacite_personnes_supplementaire: 0,
  capacite_personnes_supplementaire_planifiee: null,
  capacite_personnes_planifiee_effet_at: null,
  capacite_stripe_sync_evenement_at: null,
};

function deps(over: Partial<DepsReconcileCapacite> & { admin: DepsReconcileCapacite["admin"] }): Partial<DepsReconcileCapacite> {
  return { env: ENV, requete: vi.fn<RequeteStripeMinimal>(), recupererAbonnement: vi.fn(async () => sub([])), ...over };
}

describe("reconcilierCapacitePersonnesStripe", () => {
  it("1. crée l'item capacité quand DB=5 et Stripe absent", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn<(id: string) => Promise<StripeSubscription>>()
      .mockResolvedValueOnce(sub([{ id: "si_base", quantity: 1, price: { id: "price_base_mini_m" } }])) // avant
      .mockResolvedValueOnce(sub([
        { id: "si_base", quantity: 1, price: { id: "price_base_mini_m" } },
        { id: "si_cap", quantity: 5, price: { id: "price_cap_mini_m" } },
      ])); // après re-observation
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "creation", quantiteApres: 5 });
    expect(requete).toHaveBeenCalledWith("subscription_items", expect.objectContaining({ corps: expect.any(URLSearchParams) }));
    const body = (requete.mock.calls[0][1] as { corps: URLSearchParams }).corps;
    expect(body.get("price")).toBe("price_cap_mini_m");
    expect(body.get("quantity")).toBe("5");
    expect(body.get("proration_behavior")).toBe("always_invoice");
    expect(state.rpcCalls.at(-1)?.args.p_statut_final).toBe("completed");
  });

  it("2. met à jour la quantité (Stripe 2 → DB 5) sans delete/create", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn<(id: string) => Promise<StripeSubscription>>()
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 2, price: { id: "price_cap_mini_m" } }]))
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 5, price: { id: "price_cap_mini_m" } }]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "mise_a_jour", quantiteAvant: 2, quantiteApres: 5 });
    expect(requete).toHaveBeenCalledWith("subscription_items/si_cap", expect.anything());
    expect(requete.mock.calls[0][0]).not.toContain("DELETE");
    void state;
  });

  it("3. supprime l'item quand DB cible = 0", async () => {
    const { admin } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 0 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn<(id: string) => Promise<StripeSubscription>>()
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 3, price: { id: "price_cap_mini_m" } }]))
      .mockResolvedValueOnce(sub([])); // supprimé
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "suppression", quantiteApres: 0 });
    expect(requete).toHaveBeenCalledWith("subscription_items/si_cap", expect.objectContaining({ methode: "DELETE" }));
  });

  it("4. no-op quand Stripe et DB concordent", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 3 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn(async () => sub([{ id: "si_cap", quantity: 3, price: { id: "price_cap_mini_m" } }]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "aucune" });
    expect(requete).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("5. swap Price Mini → Pro : même item, quantité conservée", async () => {
    const { admin } = fakeAdmin({ ...ENTREPRISE_BASE, abonnement_offre: "pro", capacite_personnes_supplementaire: 5 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn<(id: string) => Promise<StripeSubscription>>()
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 5, price: { id: "price_cap_mini_m" } }])) // encore le Price Mini
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 5, price: { id: "price_cap_pro_m" } }]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "swap_prix", quantiteApres: 5 });
    const [path, opts] = requete.mock.calls[0] as [string, { corps: URLSearchParams }];
    expect(path).toBe("subscription_items/si_cap");
    expect(opts.corps.get("price")).toBe("price_cap_pro_m");
    expect(opts.corps.get("quantity")).toBe("5");
  });

  it("6. swap Pro → Business", async () => {
    const { admin } = fakeAdmin({ ...ENTREPRISE_BASE, abonnement_offre: "business", capacite_personnes_supplementaire: 8 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn<(id: string) => Promise<StripeSubscription>>()
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 8, price: { id: "price_cap_pro_m" } }]))
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 8, price: { id: "price_cap_biz_m" } }]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "swap_prix" });
    expect((requete.mock.calls[0][1] as { corps: URLSearchParams }).corps.get("price")).toBe("price_cap_biz_m");
  });

  it("7. FAIL-CLOSED si un item capacité utilise un Price inconnu", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn(async () => sub([{ id: "si_x", quantity: 5, price: { id: "price_inconnu" } }]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    // price_inconnu → item classé "inconnu" → anomalie → non fiable
    expect(r).toMatchObject({ synchronise: false, raison: "classification_non_fiable" });
    expect(requete).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("8. FAIL-CLOSED sur deux items capacité", async () => {
    const { admin } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn(async () =>
      sub([
        { id: "si_cap1", quantity: 2, price: { id: "price_cap_mini_m" } },
        { id: "si_cap2", quantity: 3, price: { id: "price_cap_mini_m" } },
      ]),
    );
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: false, raison: "classification_non_fiable" });
    expect(requete).not.toHaveBeenCalled();
  });

  it("9. erreur Stripe → opération failed, DB inchangée", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 });
    const requete = vi.fn(async () => {
      throw new Error("Stripe down");
    });
    const rec = vi.fn(async () => sub([{ id: "si_base", price: { id: "price_base_mini_m" } }]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: false, raison: "stripe_erreur" });
    expect(state.rpcCalls.at(-1)?.args.p_statut_final).toBe("failed");
    expect(state.updates).toHaveLength(0); // aucune capacité accordée
  });

  it("10. erreur DB après mutation Stripe → needs_reconcile", async () => {
    const { admin, state } = fakeAdmin(
      { ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 },
      (fn) => (fn === "synchroniser_capacite_stripe_service" ? { error: { message: "db timeout" } } : { data: null, error: null }),
    );
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn<(id: string) => Promise<StripeSubscription>>()
      .mockResolvedValueOnce(sub([{ id: "si_base", price: { id: "price_base_mini_m" } }]))
      .mockResolvedValueOnce(sub([
        { id: "si_base", price: { id: "price_base_mini_m" } },
        { id: "si_cap", quantity: 5, price: { id: "price_cap_mini_m" } },
      ]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: false, raison: "db_needs_reconcile" });
    void state;
  });

  it("11-12. observation Stripe incohérente après mutation → needs_reconcile (retry cron converge)", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn<(id: string) => Promise<StripeSubscription>>()
      .mockResolvedValueOnce(sub([{ id: "si_base", price: { id: "price_base_mini_m" } }]))
      .mockResolvedValueOnce(sub([
        { id: "si_base", price: { id: "price_base_mini_m" } },
        { id: "si_cap", quantity: 3, price: { id: "price_cap_mini_m" } }, // quantité ≠ 5 attendue
      ]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: false, raison: "db_needs_reconcile" });
    expect(state.rpcCalls.at(-1)?.args.p_statut_final).toBe("needs_reconcile");
  });

  it("13. baisse (Stripe 10 → DB 3) : planifiée fin de période, aucune mutation Stripe immédiate", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 3 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn(async () => sub([{ id: "si_cap", quantity: 10, price: { id: "price_cap_mini_m" } }], { current_period_end: 9_999 }));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "mise_a_jour", quantiteAvant: 10, quantiteApres: 3 });
    expect(requete).not.toHaveBeenCalled(); // baisse : rien tout de suite côté Stripe
    const call = state.rpcCalls.find((c) => c.fn === "synchroniser_capacite_stripe_service");
    expect(call?.args.p_type_operation).toBe("baisse");
    expect(call?.args.p_date_effet_souhaitee).toBe(new Date(9_999 * 1000).toISOString());
  });

  it("16-17. événement Stripe périmé → ignoré", async () => {
    const { admin } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5, capacite_stripe_sync_evenement_at: new Date(500 * 1000).toISOString() });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn(async () => sub([]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", evenementCreatedAt: 400, deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: false, raison: "evenement_perime" });
    expect(rec).not.toHaveBeenCalled();
  });

  it("18. événement Stripe plus récent → traité (no-op cohérent + marqueur avancé)", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 3, capacite_stripe_sync_evenement_at: new Date(500 * 1000).toISOString() });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn(async () => sub([{ id: "si_cap", quantity: 3, price: { id: "price_cap_mini_m" } }]));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", evenementCreatedAt: 900, deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "aucune" });
    expect(requete).not.toHaveBeenCalled();
    expect(state.updates.at(-1)).toMatchObject({ capacite_stripe_sync_evenement_at: new Date(900 * 1000).toISOString() });
  });

  it("19. abonnement absent → non synchronisé", async () => {
    const { admin } = fakeAdmin({ ...ENTREPRISE_BASE, stripe_subscription_id: null });
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin }) });
    expect(r).toMatchObject({ synchronise: false, raison: "abonnement_absent" });
  });

  it("20. plan invalide → non synchronisé", async () => {
    const { admin } = fakeAdmin({ ...ENTREPRISE_BASE, abonnement_offre: "gold" });
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin }) });
    expect(r).toMatchObject({ synchronise: false, raison: "plan_invalide" });
  });

  it("21. Price capacité non configuré alors que DB cible > 0 → non synchronisé", async () => {
    const { admin } = fakeAdmin({ ...ENTREPRISE_BASE, abonnement_offre: "pro", abonnement_periodicite: "annuel", capacite_personnes_supplementaire: 5 });
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin }) });
    expect(r).toMatchObject({ synchronise: false, raison: "prix_capacite_absent" });
  });

  it("22. clé d'idempotence déterministe et Idempotency-Key Stripe sur la mutation", async () => {
    const { admin, state } = fakeAdmin({ ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 });
    const requete = vi.fn<RequeteStripeMinimal>();
    const rec = vi.fn<(id: string) => Promise<StripeSubscription>>()
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 2, price: { id: "price_cap_mini_m" } }], { current_period_start: 42 }))
      .mockResolvedValueOnce(sub([{ id: "si_cap", quantity: 5, price: { id: "price_cap_mini_m" } }], { current_period_start: 42 }));
    const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: "e1", deps: deps({ admin, requete, recupererAbonnement: rec }) });
    expect(r).toMatchObject({ synchronise: true, action: "mise_a_jour" });
    const idem = state.rpcCalls.at(-1)?.args.p_idempotency_key as string;
    expect(idem).toBe("capacite:hausse:e1:sub_A:5:42");
    // La mutation Stripe porte une Idempotency-Key stable dérivée de la même clé.
    expect((requete.mock.calls[0][1] as { idempotence?: string }).idempotence).toContain(idem);
  });
});

describe("reprendreOperationsCapaciteStripe (cron)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("applique une baisse scheduled à échéance et reprend un needs_reconcile", async () => {
    const rpcCalls: string[] = [];
    const admin = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...ENTREPRISE_BASE, capacite_personnes_supplementaire: 5 }, error: null }) }) }) }),
      async rpc(fn: string) {
        rpcCalls.push(fn);
        if (fn === "capacite_stripe_operations_a_reprendre") {
          return {
            data: [
              { operation_id: "op1", entreprise_id: "eA", type_operation: "baisse", statut: "scheduled" },
              { operation_id: "op2", entreprise_id: "eB", type_operation: "hausse", statut: "needs_reconcile" },
            ],
            error: null,
          };
        }
        if (fn === "appliquer_baisse_capacite_planifiee_service") return { data: true, error: null };
        return { data: "op", error: null };
      },
    } as unknown as DepsReconcileCapacite["admin"];

    const rec = vi.fn(async () => sub([{ id: "si_cap", quantity: 5, price: { id: "price_cap_mini_m" } }]));
    const out = await reprendreOperationsCapaciteStripe({
      deps: { admin, env: ENV, requete: vi.fn<RequeteStripeMinimal>(), recupererAbonnement: rec },
    });
    expect(out.traitees).toBe(2);
    expect(rpcCalls).toContain("appliquer_baisse_capacite_planifiee_service");
    expect(out.details[0]).toMatchObject({ type: "baisse_planifiee", resultat: "appliquee" });
  });

  it("liste vide → 0 traitée", async () => {
    const admin = { from: () => ({}), rpc: async () => ({ data: [], error: null }) } as unknown as DepsReconcileCapacite["admin"];
    const out = await reprendreOperationsCapaciteStripe({ deps: { admin, env: ENV } });
    expect(out.traitees).toBe(0);
  });
});
