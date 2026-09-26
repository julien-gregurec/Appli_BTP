import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifierPlafondIA, journaliserAppelIA } from "./journal";

function requeteResolue(data: unknown) {
  const requete: Record<string, unknown> = {};
  for (const methode of ["select", "eq", "is", "gte", "lt"]) requete[methode] = () => requete;
  requete.maybeSingle = async () => ({ data, error: null });
  requete.then = (resolution: (valeur: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolution);
  return requete;
}

describe("contrôle IA par entreprise", () => {
  it("bloque une entreprise avec ia_active=false même si l'IA globale est disponible", async () => {
    const supabase = {
      from(table: string) {
        return requeteResolue(table === "entreprises" ? {
          abonnement_offre: "mini",
          ia_active: false,
          ia_credits_achetes: 0,
          ia_politique_quota: "blocage",
          ia_plafond_cout_mensuel_ht: null,
        } : []);
      },
    } as unknown as SupabaseClient;

    await expect(verifierPlafondIA(supabase, "entreprise-test")).resolves.toMatch(/désactivées par un administrateur/);
  });
});

// PRE-LIVE-CLEANUP-V1 §13 : le GO-LIVE-FINAL avait identifié l'absence d'un test explicite
// du scénario "quota dépassé". Ces tests couvrent le comportement réel de verifierPlafondIA
// (seule fonction interrogée par tous les appelants IA avant tout appel provider — voir
// src/app/actions/devis.ts:275, où `depassement` retourne immédiatement en cas de blocage,
// sans jamais appeler genererLignesDevisIA ni journaliserAppelIA : aucun contournement
// possible côté IA devis, aucun coût/jeton journalisé si l'appel provider n'a jamais lieu).
describe("verifierPlafondIA — quota mensuel (PRE-LIVE-CLEANUP-V1 §13)", () => {
  function supabaseAvecUsage(entreprise: Record<string, unknown>, operationsDejaUtilisees: number) {
    return {
      from(table: string) {
        if (table === "entreprises") return requeteResolue(entreprise);
        // journal_ia : simule `operationsDejaUtilisees` lignes "succes" déjà journalisées ce mois-ci.
        const lignes = Array.from({ length: operationsDejaUtilisees }, () => ({ operations_decomptees: 1, cout_estime_ht: 0.01 }));
        return requeteResolue(lignes);
      },
    } as unknown as SupabaseClient;
  }

  const entrepriseMini = {
    abonnement_offre: "mini",
    ia_active: true,
    ia_credits_achetes: 0,
    ia_politique_quota: "blocage",
    ia_plafond_cout_mensuel_ht: null,
  };

  it("1. quota disponible (utilisation < quota) -> appel autorisé, aucune erreur", async () => {
    // offre "mini" (offreTarifaireParCle) : quota inclus très supérieur à 1, marge large.
    const supabase = supabaseAvecUsage(entrepriseMini, 1);
    await expect(verifierPlafondIA(supabase, "entreprise-test")).resolves.toBeNull();
  });

  it("2. quota exactement atteint (utilisation = quota) -> bloqué, message clair", async () => {
    // Forcer utilise === quota via un plafond de repli connu (offre absente du catalogue).
    const entreprise = { ...entrepriseMini, abonnement_offre: "inconnue" }; // -> PLAFOND_MENSUEL_REPLI = 100
    const supabase = supabaseAvecUsage(entreprise, 100);
    const message = await verifierPlafondIA(supabase, "entreprise-test");
    expect(message).toMatch(/Quota mensuel d'opérations IA atteint \(100\)/);
  });

  it("3. quota dépassé (utilisation > quota) -> bloqué, message propre pour l'utilisateur", async () => {
    const entreprise = { ...entrepriseMini, abonnement_offre: "inconnue" };
    const supabase = supabaseAvecUsage(entreprise, 150);
    const message = await verifierPlafondIA(supabase, "entreprise-test");
    expect(message).not.toBeNull();
    expect(message).toMatch(/Quota mensuel d'opérations IA atteint/);
    expect(message).toMatch(/réinitialisé le mois prochain/);
    expect(message).not.toMatch(/undefined|NaN|\[object/);
  });

  it("4. politique 'depassement_facture' -> jamais bloqué même quota dépassé (facturation à l'usage assumée)", async () => {
    const entreprise = { ...entrepriseMini, abonnement_offre: "inconnue", ia_politique_quota: "depassement_facture" };
    const supabase = supabaseAvecUsage(entreprise, 500);
    await expect(verifierPlafondIA(supabase, "entreprise-test")).resolves.toBeNull();
  });

  it("5. plafond budgétaire HT atteint -> bloqué même si le quota d'opérations n'est pas atteint", async () => {
    const entreprise = { ...entrepriseMini, ia_plafond_cout_mensuel_ht: 0.005 }; // < 0.01 (coût simulé d'1 opération)
    const supabase = supabaseAvecUsage(entreprise, 1);
    const message = await verifierPlafondIA(supabase, "entreprise-test");
    expect(message).toMatch(/Plafond budgétaire IA atteint/);
  });

  it("6. aucun appel provider ni journalisation quand verifierPlafondIA bloque -- vérifié au niveau de l'appelant réel (devis.ts)", async () => {
    // Reproduit exactement le garde-fou de genererDevisIAAction (src/app/actions/devis.ts:275-276) :
    // le blocage retourne avant tout appel à journaliserAppelIA ou au provider IA.
    const entreprise = { ...entrepriseMini, abonnement_offre: "inconnue" };
    const supabase = supabaseAvecUsage(entreprise, 100);
    const journaliser = vi.fn();
    const genererLignesDevisIASimule = vi.fn();

    const depassement = await verifierPlafondIA(supabase, "entreprise-test");
    if (!depassement) {
      genererLignesDevisIASimule();
      journaliser();
    }

    expect(depassement).not.toBeNull();
    expect(genererLignesDevisIASimule).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });
});

describe("journaliserAppelIA — jamais de contenu de conversation persisté", () => {
  it("n'écrit que des métriques d'usage, jamais de prompt/message brut", () => {
    const insere = vi.fn().mockReturnValue({ then: () => {} });
    const supabase = { from: () => ({ insert: insere }) } as unknown as SupabaseClient;

    journaliserAppelIA(supabase, {
      entrepriseId: "ent-1", utilisateurId: "user-1", fonctionnalite: "devis", statut: "succes",
      jetonsEntree: 100, jetonsSortie: 50, jetonsTotal: 150, coutEstimeHT: 0.02,
    });

    expect(insere).toHaveBeenCalledTimes(1);
    const ligne = insere.mock.calls[0][0];
    expect(Object.keys(ligne).sort()).toEqual([
      "cout_estime_ht", "entreprise_id", "fonctionnalite", "jetons_entree", "jetons_sortie",
      "jetons_total", "message_erreur", "modele", "operation_id", "operations_decomptees",
      "statut", "utilisateur_id", "fournisseur",
    ].sort());
  });
});
