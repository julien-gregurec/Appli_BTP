import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifierPlafondIA } from "./journal";

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
