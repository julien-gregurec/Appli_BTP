import { beforeEach, describe, expect, it, vi } from "vitest";

// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 : les actions « formulaire » (identifiant en champ caché)
// remplacent les actions liées par élément sur /planning et /pointage/gestion. Elles doivent
// valider strictement leurs champs, puis appeler EXACTEMENT la même logique métier qu'avant
// (même RPC / même mise à jour, même contexte d'entreprise, mêmes redirections).

const mocks = vi.hoisted(() => ({
  appels: [] as Array<{ type: string; args: unknown }>,
  permissions: null as string[] | null,
}));

class Redirection extends Error {
  constructor(readonly url: string) { super(`REDIRECT ${url}`); }
}
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Redirection(url); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => ({ entrepriseId: "ent-a", userId: "user-1" })) }));
vi.mock("@/lib/permissions", () => ({ permissionsUtilisateur: vi.fn(async () => mocks.permissions) }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const chaine = (table: string) => {
      const etat: Record<string, unknown> = { table, filtres: [] };
      const c: Record<string, unknown> = {};
      const enregistrer = (type: string) => (...args: unknown[]) => { (etat.filtres as unknown[]).push([type, ...args]); return c; };
      for (const m of ["select", "eq", "in"]) c[m] = enregistrer(m);
      c.update = (valeurs: unknown) => { etat.update = valeurs; return c; };
      c.delete = () => { etat.delete = true; return c; };
      c.maybeSingle = async () => ({ data: table === "chantiers" ? { id: "c1" } : null });
      (c as { then: (r: (v: unknown) => void) => void }).then = (resolve) => { mocks.appels.push({ type: `from:${table}`, args: etat }); resolve({ error: null }); };
      return c;
    };
    return {
      from: chaine,
      rpc: async (nom: string, args: unknown) => { mocks.appels.push({ type: `rpc:${nom}`, args }); return { error: null }; },
      storage: { from: () => ({ remove: async () => ({}) }) },
    };
  }),
}));

import { modifierAffectationFormAction } from "./planning";
import { supprimerPointageFormAction, validerPointageFormAction } from "./pointages";

const ID = "6f1c1c3e-9b1a-4c55-8f0e-2b2f0b8f9a10";
const fd = (champs: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
async function redirection(promesse: Promise<unknown>) {
  try { await promesse; } catch (e) { if (e instanceof Redirection) return e.url; throw e; }
  throw new Error("pas de redirection");
}

beforeEach(() => { mocks.appels.length = 0; mocks.permissions = null; });

describe("validerPointageFormAction", () => {
  it("valide : même RPC qu'avant (valider_preuve_pointage) avec les champs du formulaire", async () => {
    const url = await redirection(validerPointageFormAction(fd({ pointage_id: ID, statut: "rejete", mois: "2026-09", commentaire_verification: "Hors zone" })));
    expect(url).toBe("/pointage?mois=2026-09&succes=validation");
    expect(mocks.appels).toEqual([{ type: "rpc:valider_preuve_pointage", args: { p_entreprise_id: "ent-a", p_pointage_id: ID, p_statut: "rejete", p_commentaire: "Hors zone" } }]);
  });

  it("refuse un identifiant invalide ou un statut inconnu, sans aucun appel", async () => {
    expect(await redirection(validerPointageFormAction(fd({ pointage_id: "1 or 1=1", statut: "valide", mois: "2026-09" })))).toContain("error=");
    expect(await redirection(validerPointageFormAction(fd({ pointage_id: ID, statut: "supprime", mois: "2026-09" })))).toContain("error=");
    expect(await redirection(validerPointageFormAction(fd({ pointage_id: ID, statut: "valide", mois: "../x" })))).toMatch(/^\/pointage\?mois=\d{4}-\d{2}&succes=validation$/);
    expect(mocks.appels.filter((a) => a.args && (a.args as { p_statut?: string }).p_statut === "supprime")).toEqual([]);
  });
});

describe("supprimerPointageFormAction", () => {
  it("garde la vérification de permission gerer_pointage", async () => {
    mocks.permissions = ["valider_pointages"];
    expect(await redirection(supprimerPointageFormAction(fd({ pointage_id: ID, mois: "2026-09" })))).toContain("Suppression%20non%20autoris");
    expect(mocks.appels.some((a) => (a.args as { delete?: boolean }).delete)).toBe(false);
  });

  it("supprime dans l'entreprise du contexte", async () => {
    expect(await redirection(supprimerPointageFormAction(fd({ pointage_id: ID, mois: "2026-09" })))).toBe("/pointage?mois=2026-09");
    const suppression = mocks.appels.find((a) => (a.args as { delete?: boolean }).delete);
    expect((suppression!.args as { filtres: unknown[] }).filtres).toEqual([["eq", "id", ID], ["eq", "entreprise_id", "ent-a"]]);
  });
});

describe("modifierAffectationFormAction", () => {
  it("met à jour l'affectation (et les cases cochées) dans l'entreprise du contexte", async () => {
    const autre = "0b0f0e3c-1111-4c55-8f0e-2b2f0b8f9a10";
    const url = await redirection(modifierAffectationFormAction(fd({
      affectation_id: ID, retour: "2026-09-21", type_activite: "chantier", chantier_id: "c1", date: "2026-09-22", heures: "7.5", tache: "Pose", ids_supplementaires: [autre],
    })));
    expect(url).toBe("/planning?semaine=2026-09-21");
    const maj = mocks.appels.find((a) => (a.args as { table: string; update?: unknown }).table === "affectations")!.args as { update: unknown; filtres: unknown[] };
    expect(maj.update).toEqual({ chantier_id: "c1", date: "2026-09-22", heures: 7.5, tache: "Pose", type_activite: "chantier", lieu_activite: null });
    expect(maj.filtres).toEqual([["eq", "entreprise_id", "ent-a"], ["in", "id", [ID, autre]]]);
  });

  it("refuse un identifiant absent ou invalide", async () => {
    expect(await redirection(modifierAffectationFormAction(fd({ retour: "2026-09-21", type_activite: "bureau", date: "2026-09-22", heures: "7" })))).toBe("/planning?semaine=2026-09-21&error=Affectation%20introuvable");
    expect(mocks.appels).toEqual([]);
  });
});
