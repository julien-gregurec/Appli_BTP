import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OUTILS_COPILOTE, autoriseOutilCopilote, outilsAutorisesCopilote, executerOutilCopilote } from "./copilote";

// Un poste Terrain type : accès IA mais aucun des droits de menu couverts par les outils
// sensibles (cf. AI-LAUNCH-V1 §2 — l'IA ne doit jamais donner plus que les droits réels).
const PERMISSIONS_TERRAIN = ["acces_ia", "acces_pointage", "saisir_son_pointage"];
const OUTILS_SENSIBLES = ["rentabilite_chantiers", "vehicules_entretien", "stock_faible", "factures_impayees", "devis_en_attente", "heures_supplementaires_semaine"];

function supabaseVide(): SupabaseClient {
  const requete: Record<string, unknown> = {};
  for (const methode of ["select", "eq", "in", "lt", "lte", "gte", "gt", "order", "limit", "ilike", "neq"]) requete[methode] = () => requete;
  requete.maybeSingle = async () => ({ data: null, error: null });
  requete.then = (resolution: (valeur: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolution);
  return { from: () => requete } as unknown as SupabaseClient;
}

describe("droits de menu appliqués au copilote IA", () => {
  it("un poste Terrain (sans droit de menu associé) n'a accès à aucun outil sensible", () => {
    for (const nom of OUTILS_SENSIBLES) {
      expect(autoriseOutilCopilote(nom, PERMISSIONS_TERRAIN)).toBe(false);
    }
  });

  it("outilsAutorisesCopilote retire les outils sensibles de la liste proposée au modèle pour un poste Terrain", () => {
    const noms = outilsAutorisesCopilote(PERMISSIONS_TERRAIN).map((o) => o.nom);
    for (const nom of OUTILS_SENSIBLES) expect(noms).not.toContain(nom);
    // Les outils non sensibles (recherche générale, disponibilité, etc.) restent proposés.
    expect(noms).toContain("rechercher");
    expect(noms).toContain("chercher_employe");
  });

  it("accorde acces_rentabilite -> rentabilite_chantiers uniquement, pas les autres outils sensibles", () => {
    const permissions = [...PERMISSIONS_TERRAIN, "acces_rentabilite"];
    expect(autoriseOutilCopilote("rentabilite_chantiers", permissions)).toBe(true);
    expect(autoriseOutilCopilote("vehicules_entretien", permissions)).toBe(false);
    expect(autoriseOutilCopilote("stock_faible", permissions)).toBe(false);
  });

  it("heures_supplementaires_semaine accepte voir_pointages_equipe OU gerer_pointage", () => {
    expect(autoriseOutilCopilote("heures_supplementaires_semaine", [...PERMISSIONS_TERRAIN, "voir_pointages_equipe"])).toBe(true);
    expect(autoriseOutilCopilote("heures_supplementaires_semaine", [...PERMISSIONS_TERRAIN, "gerer_pointage"])).toBe(true);
    expect(autoriseOutilCopilote("heures_supplementaires_semaine", PERMISSIONS_TERRAIN)).toBe(false);
  });

  it("permissions=null (mode prototype/support) donne accès à tous les outils, y compris sensibles", () => {
    for (const outil of OUTILS_COPILOTE) expect(autoriseOutilCopilote(outil.nom, null)).toBe(true);
    expect(outilsAutorisesCopilote(null)).toHaveLength(OUTILS_COPILOTE.length);
  });

  it("executerOutilCopilote refuse en profondeur un outil sensible même si le modèle l'appelle quand même", async () => {
    const resultat = (await executerOutilCopilote(supabaseVide(), "entreprise-test", PERMISSIONS_TERRAIN, "rentabilite_chantiers", {})) as { error?: string };
    expect(resultat.error).toMatch(/n'a pas accès/);
  });

  it("executerOutilCopilote exécute normalement un outil sensible quand le droit est présent", async () => {
    const resultat = await executerOutilCopilote(supabaseVide(), "entreprise-test", [...PERMISSIONS_TERRAIN, "acces_flotte"], "vehicules_entretien", {});
    expect(resultat).not.toHaveProperty("error");
  });

  it("rechercher masque les résultats devis/factures sans les droits acces_devis/acces_factures correspondants", async () => {
    const resultat = (await executerOutilCopilote(supabaseVide(), "entreprise-test", PERMISSIONS_TERRAIN, "rechercher", { terme: "test" })) as {
      devis: unknown[];
      factures: unknown[];
    };
    expect(resultat.devis).toEqual([]);
    expect(resultat.factures).toEqual([]);
  });
});
