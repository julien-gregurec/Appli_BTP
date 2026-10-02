import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { evenementRapprochement, rapprocherAbonnementsStripe, STATUTS_RAPPROCHES } = await import("./stripe-abonnement-rapprochement");

function adminFake(lignes: unknown[] | null, erreur: { message: string } | null = null) {
  const filtres: Array<[string, ...unknown[]]> = [];
  const requete = {
    select: (colonnes: string) => { filtres.push(["select", colonnes]); return requete; },
    not: (...args: unknown[]) => { filtres.push(["not", ...args]); return requete; },
    in: (...args: unknown[]) => { filtres.push(["in", ...args]); return { data: lignes, error: erreur }; },
  };
  return { admin: { from: (table: string) => { filtres.push(["from", table]); return requete; } }, filtres };
}

describe("P5 — rapprochement quotidien des abonnements Stripe", () => {
  const maintenant = new Date("2026-11-01T03:00:00Z");

  it("identifiant stable par subscription et par jour UTC (idempotence), horloge du rapprochement", () => {
    expect(evenementRapprochement("sub_1", maintenant)).toEqual({
      id: "rapprochement:sub_1:2026-11-01",
      type: "rapprochement.subscription",
      created: Math.floor(maintenant.getTime() / 1000),
      objetType: "subscription",
      objetId: "sub_1",
    });
    expect(evenementRapprochement("sub_1", new Date("2026-11-01T23:59:59Z")).id).toBe("rapprochement:sub_1:2026-11-01");
    expect(evenementRapprochement("sub_1", new Date("2026-11-02T00:00:00Z")).id).toBe("rapprochement:sub_1:2026-11-02");
  });

  it("ne relit jamais une entreprise annulée (terminal) ni sans subscription", async () => {
    const { admin, filtres } = adminFake([]);
    const rapprocher = vi.fn();
    await rapprocherAbonnementsStripe(admin as never, maintenant, rapprocher);
    expect(filtres).toContainEqual(["not", "stripe_subscription_id", "is", null]);
    expect(filtres).toContainEqual(["in", "abonnement_statut", ["essai", "actif", "suspendu"]]);
    expect(STATUTS_RAPPROCHES).not.toContain("annule");
    expect(rapprocher).not.toHaveBeenCalled();
  });

  it("applique chaque relecture par la voie ordonnée et compte les corrections", async () => {
    const { admin } = adminFake([
      { id: "e1", stripe_subscription_id: "sub_1", abonnement_statut: "actif" },
      { id: "e2", stripe_subscription_id: "sub_2", abonnement_statut: "actif" },
      { id: "e3", stripe_subscription_id: "sub_3", abonnement_statut: "suspendu" },
    ]);
    const rapprocher = vi.fn(async (_admin: unknown, entrepriseId: string) =>
      entrepriseId === "e1" ? "actif" : entrepriseId === "e2" ? "suspendu" : null);
    const resultat = await rapprocherAbonnementsStripe(admin as never, maintenant, rapprocher as never);
    expect(rapprocher).toHaveBeenCalledWith(admin, "e2", "sub_2", evenementRapprochement("sub_2", maintenant));
    expect(resultat).toEqual({
      traitees: 3,
      corrigees: 1,
      resultats: [
        { entrepriseId: "e1", statutAvant: "actif", statut: "actif", corrige: false },
        { entrepriseId: "e2", statutAvant: "actif", statut: "suspendu", corrige: true },
        // Subscription remplacée / terminale non rattachée : sans effet.
        { entrepriseId: "e3", statutAvant: "suspendu", statut: null, corrige: false },
      ],
    });
  });

  it("une erreur sur une entreprise n'interrompt pas les autres", async () => {
    const { admin } = adminFake([
      { id: "e1", stripe_subscription_id: "sub_1", abonnement_statut: "actif" },
      { id: "e2", stripe_subscription_id: "sub_2", abonnement_statut: "essai" },
    ]);
    const rapprocher = vi.fn(async (_a: unknown, entrepriseId: string) => {
      if (entrepriseId === "e1") throw new Error("Stripe indisponible");
      return "essai";
    });
    const resultat = await rapprocherAbonnementsStripe(admin as never, maintenant, rapprocher as never);
    expect(resultat).toMatchObject({ traitees: 2, corrigees: 0 });
    expect("resultats" in resultat && resultat.resultats[0]).toMatchObject({ entrepriseId: "e1", raison: "Stripe indisponible" });
  });

  it("lecture impossible : erreur explicite, aucune relecture", async () => {
    const { admin } = adminFake(null, { message: "boom" });
    const rapprocher = vi.fn();
    expect(await rapprocherAbonnementsStripe(admin as never, maintenant, rapprocher)).toEqual({ erreur: "Lecture des abonnements impossible" });
    expect(rapprocher).not.toHaveBeenCalled();
  });
});
