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

// AI-LAUNCH-V1B — proposer_creneaux_planning (outil manquant depuis V1, §17).
type FixtureCreneaux = {
  employes?: Array<{ id: string; nom: string; prenom: string }>;
  affectations?: Array<{ employe_id: string; date: string; heures: number }>;
  conges?: Array<{ employe_id: string; date_debut: string; date_fin: string }>;
};

function supabaseCreneaux(fixture: FixtureCreneaux): SupabaseClient {
  return {
    from(table: string) {
      const requete: Record<string, unknown> = {};
      for (const methode of ["select", "eq", "in", "gte", "lte"]) requete[methode] = () => requete;
      if (table === "employes") {
        requete.then = (resolution: (v: unknown) => unknown) => Promise.resolve({ data: fixture.employes ?? [], error: null }).then(resolution);
      } else if (table === "affectations") {
        requete.then = (resolution: (v: unknown) => unknown) => Promise.resolve({ data: fixture.affectations ?? [], error: null }).then(resolution);
      } else if (table === "demandes_conges") {
        requete.then = (resolution: (v: unknown) => unknown) => Promise.resolve({ data: fixture.conges ?? [], error: null }).then(resolution);
      } else {
        throw new Error(`Table non prévue par ce mock : ${table}`);
      }
      return requete;
    },
  } as unknown as SupabaseClient;
}

describe("proposer_creneaux_planning (AI-LAUNCH-V1B)", () => {
  const karim = { id: "karim", nom: "Haddad", prenom: "Karim" };
  const mehdi = { id: "mehdi", nom: "Amrani", prenom: "Mehdi" };

  it("refuse une durée supérieure à la capacité journalière (7h) plutôt que d'inventer un dépassement", async () => {
    const resultat = (await executerOutilCopilote(supabaseCreneaux({}), "e1", null, "proposer_creneaux_planning", {
      employe_ids: ["karim"], duree_heures: 9, date_debut: "2026-09-01", date_fin: "2026-09-05",
    })) as { error?: string };
    expect(resultat.error).toBeDefined();
  });

  it("refuse une période invalide (fin avant début)", async () => {
    const resultat = (await executerOutilCopilote(supabaseCreneaux({}), "e1", null, "proposer_creneaux_planning", {
      employe_ids: ["karim"], duree_heures: 1, date_debut: "2026-09-05", date_fin: "2026-09-01",
    })) as { error?: string };
    expect(resultat.error).toBeDefined();
  });

  it("refuse si un employé demandé n'existe pas ou n'est pas actif dans l'entreprise", async () => {
    const resultat = (await executerOutilCopilote(supabaseCreneaux({ employes: [karim] }), "e1", null, "proposer_creneaux_planning", {
      employe_ids: ["karim", "mehdi"], duree_heures: 1, date_debut: "2026-09-01", date_fin: "2026-09-03",
    })) as { error?: string };
    expect(resultat.error).toMatch(/introuvables|inactifs/);
  });

  it("propose le premier jour de la période quand personne n'a aucun conflit", async () => {
    const resultat = (await executerOutilCopilote(
      supabaseCreneaux({ employes: [karim, mehdi] }),
      "e1", null, "proposer_creneaux_planning",
      { employe_ids: ["karim", "mehdi"], duree_heures: 1, date_debut: "2026-09-01", date_fin: "2026-09-03" },
    )) as { creneaux: Array<{ date: string }> };
    expect(resultat.creneaux[0]?.date).toBe("2026-09-01");
  });

  it("saute un jour où un employé est déjà occupé au point de ne plus avoir de marge", async () => {
    const resultat = (await executerOutilCopilote(
      supabaseCreneaux({ employes: [karim], affectations: [{ employe_id: "karim", date: "2026-09-01", heures: 7 }] }),
      "e1", null, "proposer_creneaux_planning",
      { employe_ids: ["karim"], duree_heures: 1, date_debut: "2026-09-01", date_fin: "2026-09-02" },
    )) as { creneaux: Array<{ date: string }> };
    expect(resultat.creneaux.map((c) => c.date)).toEqual(["2026-09-02"]);
  });

  it("un seul salarié occupé bloque le jour même si l'autre est libre (créneau commun requis)", async () => {
    const resultat = (await executerOutilCopilote(
      supabaseCreneaux({ employes: [karim, mehdi], affectations: [{ employe_id: "karim", date: "2026-09-01", heures: 7 }] }),
      "e1", null, "proposer_creneaux_planning",
      { employe_ids: ["karim", "mehdi"], duree_heures: 1, date_debut: "2026-09-01", date_fin: "2026-09-01" },
    )) as { creneaux: Array<{ date: string }> };
    expect(resultat.creneaux).toEqual([]);
  });

  it("saute un jour de congé approuvé même sans affectation ce jour-là", async () => {
    const resultat = (await executerOutilCopilote(
      supabaseCreneaux({ employes: [karim], conges: [{ employe_id: "karim", date_debut: "2026-09-01", date_fin: "2026-09-01" }] }),
      "e1", null, "proposer_creneaux_planning",
      { employe_ids: ["karim"], duree_heures: 1, date_debut: "2026-09-01", date_fin: "2026-09-02" },
    )) as { creneaux: Array<{ date: string }> };
    expect(resultat.creneaux.map((c) => c.date)).toEqual(["2026-09-02"]);
  });

  it("ne propose jamais plus de 3 créneaux", async () => {
    const resultat = (await executerOutilCopilote(
      supabaseCreneaux({ employes: [karim] }), "e1", null, "proposer_creneaux_planning",
      { employe_ids: ["karim"], duree_heures: 1, date_debut: "2026-09-01", date_fin: "2026-09-30" },
    )) as { creneaux: unknown[] };
    expect(resultat.creneaux.length).toBeLessThanOrEqual(3);
  });

  it("renvoie une liste vide et une note explicite si aucun jour ne convient à tous", async () => {
    const resultat = (await executerOutilCopilote(
      supabaseCreneaux({ employes: [karim], affectations: [{ employe_id: "karim", date: "2026-09-01", heures: 7 }] }),
      "e1", null, "proposer_creneaux_planning",
      { employe_ids: ["karim"], duree_heures: 1, date_debut: "2026-09-01", date_fin: "2026-09-01" },
    )) as { creneaux: unknown[]; note: string | null };
    expect(resultat.creneaux).toEqual([]);
    expect(resultat.note).toMatch(/[Aa]ucun/);
  });

  it("n'exige pas gerer_planning (outil de lecture, comme verifier_disponibilite_employe)", () => {
    expect(autoriseOutilCopilote("proposer_creneaux_planning", PERMISSIONS_TERRAIN)).toBe(true);
  });
});
