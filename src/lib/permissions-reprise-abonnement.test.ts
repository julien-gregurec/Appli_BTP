import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContexteEntreprise } from "@/lib/entreprise";

/**
 * ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1 — entreprise suspendue ou annulée : la RLS
 * (`est_membre_actif`) masque ses permissions de poste à ses propres membres.
 * `permissionsUtilisateur` rendait une liste VIDE (abonnement fermé, lecture seule :
 * aucun réabonnement possible, constaté en navigateur). Il rend désormais le seul
 * périmètre de gestion d'abonnement, et seulement si la base l'accorde.
 */

const mocks = vi.hoisted(() => ({
  peutGerer: true as boolean | null,
  permissionsPoste: ["acces_chantiers", "gerer_parametres", "acces_parametres"],
  appelsEtat: 0,
}));

vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/tarification", () => ({ filtrerPermissionsSelonOffre: (droits: Set<string>) => [...droits] }));
vi.mock("@/lib/acces-support-abonnement", () => ({
  etatReabonnementEntreprise: async () => {
    mocks.appelsEtat += 1;
    return mocks.peutGerer === null ? null : { peut_gerer: mocks.peutGerer };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: false, error: null }),
    from: (table: string) => ({
      select: () => {
        const chaine: Record<string, unknown> = {};
        chaine.eq = () => chaine;
        chaine.maybeSingle = async () => ({ data: table === "utilisateurs_entreprises" ? { poste_id: "poste-1", pointage_personnel_actif: false } : null, error: null });
        chaine.then = (resoudre: (v: unknown) => void) => resoudre({ data: mocks.permissionsPoste.map((cle_permission) => ({ cle_permission })), error: null });
        return chaine;
      },
    }),
  }),
}));

const { permissionsUtilisateur, PERMISSIONS_REPRISE_ABONNEMENT } = await import("./permissions");

let compteur = 0;
function contexte(partiel: Partial<ContexteEntreprise>): ContexteEntreprise {
  compteur += 1;
  return { userId: "uid", entrepriseId: `ent-${compteur}`, abonnementStatut: "actif", suspensionPrevueAt: null, ...partiel } as ContexteEntreprise;
}

beforeEach(() => {
  mocks.peutGerer = true;
  mocks.appelsEtat = 0;
});

describe("permissions d'une entreprise masquée par la RLS", () => {
  it.each(["annule", "suspendu"])("%s + gerer_parametres accordé en base : seul le périmètre d'abonnement", async (statut) => {
    const droits = await permissionsUtilisateur(contexte({ abonnementStatut: statut }));
    expect(droits).toEqual([...PERMISSIONS_REPRISE_ABONNEMENT]);
    expect(droits).not.toContain("acces_chantiers");
  });

  it("suspension échue (suspension_prevue_at passée) : même périmètre", async () => {
    const droits = await permissionsUtilisateur(contexte({ suspensionPrevueAt: new Date(Date.now() - 60_000).toISOString() }));
    expect(droits).toEqual([...PERMISSIONS_REPRISE_ABONNEMENT]);
  });

  it("essai expiré sans abonnement (ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1, B-4) : même périmètre", async () => {
    const droits = await permissionsUtilisateur(contexte({ abonnementStatut: "essai", essaiExpireSansOffre: true }));
    expect(droits).toEqual([...PERMISSIONS_REPRISE_ABONNEMENT]);
    expect(droits).not.toContain("acces_chantiers");
  });

  it("essai en cours : permissions de poste, aucune lecture de l'état de reprise", async () => {
    const droits = await permissionsUtilisateur(contexte({ abonnementStatut: "essai", essaiExpireSansOffre: false }));
    expect(droits).toEqual(expect.arrayContaining(["acces_chantiers"]));
    expect(mocks.appelsEtat).toBe(0);
  });

  it("annulée, droit refusé en base (ou lecture impossible) : aucune permission", async () => {
    mocks.peutGerer = false;
    expect(await permissionsUtilisateur(contexte({ abonnementStatut: "annule" }))).toEqual([]);
    mocks.peutGerer = null;
    expect(await permissionsUtilisateur(contexte({ abonnementStatut: "annule" }))).toEqual([]);
  });

  it("entreprise active : permissions de poste inchangées, aucune lecture de l'état de reprise", async () => {
    const droits = await permissionsUtilisateur(contexte({ abonnementStatut: "actif" }));
    expect(droits).toEqual(expect.arrayContaining(["acces_chantiers", "gerer_parametres"]));
    expect(mocks.appelsEtat).toBe(0);
  });
});
