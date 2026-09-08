// ELSATIA-GP-CLIENT-LEGAL-FIELDS-V1 (migration 20260908000274).
//
// `lireIdentiteLegale` est le seul point où l'application décide ce qu'elle écrit dans les
// colonnes d'identité légale de `public.clients`. Les assertions ci-dessous portent sur les
// trois propriétés qui ont motivé le lot :
//
//   1. la validation de forme vient de `@elsatia/client-contracts`, jamais d'une règle
//      réécrite localement — un numéro de TVA à clé de contrôle fausse est refusé ;
//   2. rien n'est inventé : une saisie vide reste `null`, et `pays` n'est pas rempli à "FR"
//      à l'enregistrement (ce défaut est appliqué à la lecture, pas à l'écriture) ;
//   3. les valeurs sont normalisées avant stockage, pour que la base ne contienne qu'une
//      seule forme de la même donnée.

import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => ({ entrepriseId: "ent-a" })) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));

import { lireIdentiteLegale } from "./clients";

function form(champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

describe("lireIdentiteLegale", () => {
  it("accepte un numéro de TVA français dont la clé de contrôle est juste, et le normalise", () => {
    const r = lireIdentiteLegale(form({ numero_tva: "fr 40 303 265 045" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valeurs.numero_tva).toBe("FR40303265045");
  });

  it("refuse un numéro de TVA français dont la clé de contrôle est fausse", () => {
    // Même SIREN, clé volontairement erronée : seul le validateur partagé sait le voir.
    const r = lireIdentiteLegale(form({ numero_tva: "FR00303265045" }));
    expect(r.ok).toBe(false);
  });

  it("refuse un pays qui n'est pas un code ISO à deux lettres", () => {
    expect(lireIdentiteLegale(form({ pays: "France" })).ok).toBe(false);
  });

  it("met le pays en majuscules", () => {
    const r = lireIdentiteLegale(form({ pays: "be" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valeurs.pays).toBe("BE");
  });

  it("n'invente aucune valeur : tout champ vide reste null, pays compris", () => {
    const r = lireIdentiteLegale(form({ raison_sociale: "  ", numero_tva: "", pays: "" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valeurs).toEqual({
        raison_sociale: null,
        numero_tva: null,
        forme_juridique: null,
        adresse_complement: null,
        pays: null,
      });
    }
  });

  it("conserve la dénomination légale et la forme juridique telles quelles", () => {
    const r = lireIdentiteLegale(
      form({ raison_sociale: "MENUISERIE MULLER SAS", forme_juridique: "SAS", adresse_complement: "Bâtiment A" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valeurs.raison_sociale).toBe("MENUISERIE MULLER SAS");
      expect(r.valeurs.forme_juridique).toBe("SAS");
      expect(r.valeurs.adresse_complement).toBe("Bâtiment A");
    }
  });
});
