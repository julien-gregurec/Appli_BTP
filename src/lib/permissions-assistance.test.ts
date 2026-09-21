import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContexteEntreprise } from "@/lib/entreprise";

/**
 * Point d'intégration du P0 : ce que `permissionsUtilisateur()` renvoie réellement
 * pendant une session d'assistance. Le reste du contrat est prouvé ailleurs ; ici, on
 * vérifie qu'aucun chemin ne ramène « tous les droits » par défaut.
 */

const mocks = vi.hoisted(() => ({
  perimetreServeur: undefined as string[] | null | undefined,
  catalogue: [
    { cle: "acces_clients" },
    { cle: "acces_chantiers" },
    { cle: "voir_rentabilite" },
    { cle: "gerer_devis" },
    { cle: "gerer_utilisateurs" },
    { cle: "gerer_paie" },
  ],
}));

vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/tarification", () => ({
  filtrerPermissionsSelonOffre: (droits: Set<string>) => [...droits],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fonction: string) => {
      if (fonction === "est_acces_support_actif") return { data: true, error: null };
      if (fonction === "assistance_permissions_gestion_pro") {
        // `undefined` simule une base où le contrat n'est pas encore appliqué :
        // PostgREST répond « fonction inconnue ».
        if (mocks.perimetreServeur === undefined) {
          return { data: null, error: { code: "PGRST202", message: "not found" } };
        }
        return { data: mocks.perimetreServeur, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => {
        if (table === "permissions_disponibles") {
          return Promise.resolve({ data: mocks.catalogue, error: null });
        }
        const chaine = {
          eq: () => chaine,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chaine;
      },
    }),
  }),
}));

const { permissionsUtilisateur } = await import("./permissions");

let compteur = 0;
function contexte(): ContexteEntreprise {
  // Un identifiant distinct par appel : `permissionsUtilisateur` est mémoïsé par
  // `cache()`, et deux cas de test partageant le même contexte partageraient sa réponse.
  compteur += 1;
  return {
    userId: "uid-plateforme",
    entrepriseId: `ent-${compteur}`,
  } as ContexteEntreprise;
}

describe("permissions sous session d’assistance", () => {
  beforeEach(() => {
    mocks.perimetreServeur = undefined;
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", undefined);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("ELSATIA_ENV", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("1. variable absente : lecture seule, jamais « tous les droits »", async () => {
    const droits = await permissionsUtilisateur(contexte());
    expect(droits).not.toBeNull();
    expect(droits).toEqual(["acces_clients", "acces_chantiers", "voir_rentabilite"]);
  });

  it("2. valeur invalide : lecture seule", async () => {
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "peut-etre");
    const droits = await permissionsUtilisateur(contexte());
    expect(droits).toEqual(["acces_clients", "acces_chantiers", "voir_rentabilite"]);
  });

  it("3. désactivation tentée en Production : lecture seule quand même", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "0");
    const droits = await permissionsUtilisateur(contexte());
    expect(droits).not.toBeNull();
    expect(droits).not.toContain("gerer_utilisateurs");
    expect(droits).not.toContain("gerer_paie");
  });

  it("4. mode hérité explicitement autorisé hors Production", async () => {
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "0");
    expect(await permissionsUtilisateur(contexte())).toBeNull();
  });

  it("le contrat serveur, quand il existe, prime sur l’environnement", async () => {
    mocks.perimetreServeur = ["acces_clients", "gerer_devis"];
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "0");
    expect(await permissionsUtilisateur(contexte())).toEqual(["acces_clients", "gerer_devis"]);
  });

  it("le contrat serveur peut refuser tout droit sans que l’environnement ne le rouvre", async () => {
    mocks.perimetreServeur = null;
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "0");
    expect(await permissionsUtilisateur(contexte())).toEqual([]);
  });
});
