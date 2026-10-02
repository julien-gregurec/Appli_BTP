import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  bornesMois,
  chargerAnciennesSaisiesPage,
  chargerCompteurs,
  chargerControlesZone,
  chargerTotauxParEmploye,
  nombrePages,
  numeroPage,
  PLAFOND_LIGNES_POSTGREST,
} from "./pointages-gestion";

// ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — garde-fous sans base. La preuve à
// l'échelle contre un vrai PostgREST est dans pointages-gestion.integration.test.ts.

type Appel = { table?: string; rpc?: string; args?: unknown; filtres: string[]; range?: [number, number] };

/** Client factice : enregistre les appels et plafonne chaque réponse comme PostgREST. */
function clientFactice(options: { lignesTable?: (table: string) => unknown[]; rpc?: (nom: string, args: unknown) => unknown } = {}) {
  const appels: Appel[] = [];
  const constructeur = (appel: Appel) => {
    const requete = {
      select: () => requete,
      eq: (c: string) => (appel.filtres.push(`eq:${c}`), requete),
      gte: (c: string) => (appel.filtres.push(`gte:${c}`), requete),
      lte: (c: string) => (appel.filtres.push(`lte:${c}`), requete),
      in: (c: string) => (appel.filtres.push(`in:${c}`), requete),
      is: (c: string) => (appel.filtres.push(`is:${c}`), requete),
      order: () => requete,
      range: (debut: number, fin: number) => ((appel.range = [debut, fin]), requete),
      then: (resoudre: (valeur: { data: unknown[] }) => void) => {
        const toutes = options.lignesTable?.(appel.table!) ?? [];
        const [debut, fin] = appel.range ?? [0, toutes.length - 1];
        resoudre({ data: toutes.slice(debut, Math.min(fin + 1, debut + PLAFOND_LIGNES_POSTGREST)) });
      },
    };
    return requete;
  };
  const client = {
    from: (table: string) => { const appel: Appel = { table, filtres: [] }; appels.push(appel); return constructeur(appel); },
    rpc: async (nom: string, args: unknown) => { appels.push({ rpc: nom, args, filtres: [] }); return { data: options.rpc?.(nom, args) ?? [], error: null }; },
  };
  return { client: client as unknown as SupabaseClient, appels };
}

describe("bornes et pagination", () => {
  it("calcule les bornes d'un mois, années bissextiles comprises", () => {
    expect(bornesMois("2026-08")).toMatchObject({ debut: "2026-08-01", fin: "2026-08-31" });
    expect(bornesMois("2028-02").fin).toBe("2028-02-29");
    expect(bornesMois("2026-02").fin).toBe("2026-02-28");
    expect(bornesMois("2026-12").fin).toBe("2026-12-31");
  });

  it("borne le numéro de page", () => {
    expect(numeroPage(undefined)).toBe(1);
    expect(numeroPage("0")).toBe(1);
    expect(numeroPage("-3")).toBe(1);
    expect(numeroPage("abc")).toBe(1);
    expect(numeroPage("7")).toBe(7);
  });

  it("compte les pages sans jamais descendre sous 1", () => {
    expect(nombrePages(0, 50)).toBe(1);
    expect(nombrePages(50, 50)).toBe(1);
    expect(nombrePages(51, 50)).toBe(2);
    expect(nombrePages(20_000, 50)).toBe(400);
  });
});

describe("totaux par salarié", () => {
  it("viennent de la RPC agrégée, jamais d'une lecture de la table pointages", async () => {
    const { client, appels } = clientFactice({
      rpc: () => [{ employe_id: "e1", prenom: "Ana", nom: "Durand", nb_pointages: 1462, heures_normales: "7000.10", heures_supplementaires: "762.27", heures_total: "7762.37" }],
    });
    const { totaux, erreur } = await chargerTotauxParEmploye(client, "ent", bornesMois("2026-08"));
    expect(erreur).toBeNull();
    expect(totaux).toEqual([{ employeId: "e1", nom: "Ana Durand", nbPointages: 1462, heuresNormales: 7000.1, heuresSupplementaires: 762.27, heures: 7762.37 }]);
    expect(appels).toEqual([{ rpc: "pointages_gestion_totaux_mois", args: { p_entreprise_id: "ent", p_debut: "2026-08-01", p_fin: "2026-08-31" }, filtres: [] }]);
  });

  it("n'affiche aucun total partiel si la RPC échoue", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "refus" } }) } as unknown as SupabaseClient;
    expect(await chargerTotauxParEmploye(client, "ent", bornesMois("2026-08"))).toEqual({ totaux: [], erreur: "refus" });
    expect((await chargerCompteurs(client, "ent", bornesMois("2026-08"))).erreur).toBe("refus");
  });
});

describe("lectures au-delà de max_rows", () => {
  it("lit les contrôles de zone par tranches de 1 000 jusqu'à épuisement", async () => {
    const controles = Array.from({ length: 2_345 }, (_, i) => ({ id: `c${i}`, session_id: "s" }));
    const { client, appels } = clientFactice({ lignesTable: () => controles });
    const resultat = await chargerControlesZone(client, "ent", ["s"]);
    expect(resultat).toHaveLength(2_345);
    expect(appels.map((a) => a.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("n'interroge rien sans session affichée", async () => {
    const { client, appels } = clientFactice();
    expect(await chargerControlesZone(client, "ent", [])).toEqual([]);
    expect(appels).toHaveLength(0);
  });

  it("relit la page d'anciennes saisies par identifiants, sans anti-jointure", async () => {
    const { client, appels } = clientFactice({ rpc: () => [{ id: "p1" }, { id: "p2" }], lignesTable: () => [{ id: "p1" }, { id: "p2" }] });
    expect(await chargerAnciennesSaisiesPage(client, "ent", bornesMois("2026-08"), 3)).toHaveLength(2);
    expect(appels[0]).toMatchObject({ rpc: "pointages_gestion_anciennes_saisies_ids", args: { p_limite: 50, p_decalage: 100 } });
    expect(appels[1]).toMatchObject({ table: "pointages", filtres: ["eq:entreprise_id", "in:id"] });
  });
});

describe("page /pointage/gestion", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/pointage/gestion/page.tsx"), "utf8");

  it("ne lit plus le mois entier de pointages, sessions ou contrôles", () => {
    expect(source).not.toMatch(/from\("pointages"\)/);
    expect(source).not.toMatch(/from\("sessions_pointage"\)/);
    expect(source).not.toMatch(/from\("verifications_zone_pointage"\)/);
    expect(source).not.toMatch(/parEmploye/);
  });

  it("passe par les chargeurs paginés et agrégés", () => {
    for (const fonction of ["chargerTotauxParEmploye", "chargerCompteurs", "chargerSessionsPage", "chargerAnciennesSaisiesPage", "chargerControlesZone"]) {
      expect(source).toContain(`${fonction}(`);
    }
  });
});
