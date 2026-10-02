import { beforeEach, describe, expect, it, vi } from "vitest";

// V9-01 / V9-02 (post-V9) — écran /plateforme/entreprises/[id]/applications : dates de
// validité d'un accès d'entreprise et d'une habilitation utilisateur. Témoin ROUGE sur V9
// (6392131a : `new Date(valeur)` dans le fuseau du serveur, valeur invalide = sans fin).

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/multi-app-server", () => ({ estAdministrateurPlateformeMultiApp: async () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

const { activerApplicationEntrepriseAction, habiliterUtilisateurApplicationAction } = await import("./multi-app");

const ENTREPRISE = "a0000000-0000-4000-8000-000000000001";
const UTILISATEUR = "10000000-0000-4000-8000-000000000001";

const formulaire = (valeurs: Record<string, string>) => {
  const formData = new FormData();
  formData.set("role_code", "gestion_pro_utilisateur");
  for (const [cle, valeur] of Object.entries(valeurs)) formData.set(cle, valeur);
  return formData;
};

const habiliter = (valeurs: Record<string, string>) =>
  habiliterUtilisateurApplicationAction(ENTREPRISE, UTILISATEUR, "gestion_pro", formulaire(valeurs));

const parametresRpc = () => mocks.rpc.mock.calls.at(-1)?.[1] as { p_valide_du: string | null; p_valide_jusqu_au: string | null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  process.env.TZ = "UTC"; // serveur Vercel
});

describe("V9-01 — fuseau du navigateur, pas celui du serveur", () => {
  it.each([
    ["Europe/Paris", "2026-07-15T09:00", "2026-07-15T07:00:00.000Z"],
    ["UTC", "2026-07-15T09:00", "2026-07-15T09:00:00.000Z"],
    ["Asia/Tokyo", "2026-07-15T09:00", "2026-07-15T00:00:00.000Z"],
    ["America/New_York", "2026-07-15T09:00", "2026-07-15T13:00:00.000Z"],
  ])("habilitation saisie à %s : %s → %s", async (fuseau, murale, attendu) => {
    await expect(habiliter({ valide_jusqu_au: murale, valide_jusqu_au__fuseau: fuseau })).rejects.toThrow("REDIRECT:");
    expect(parametresRpc().p_valide_jusqu_au).toBe(attendu);
  });

  it("accès d'entreprise : début et fin convertis dans le fuseau transmis", async () => {
    await expect(activerApplicationEntrepriseAction(ENTREPRISE, "gestion_pro", formulaire({
      valide_du: "2026-01-15T08:00", valide_du__fuseau: "Europe/Paris",
      valide_jusqu_au: "2026-12-31T23:59", valide_jusqu_au__fuseau: "Europe/Paris",
    }))).rejects.toThrow("REDIRECT:");
    expect(parametresRpc()).toMatchObject({ p_valide_du: "2026-01-15T07:00:00.000Z", p_valide_jusqu_au: "2026-12-31T22:59:00.000Z" });
  });
});

describe("V9-02 — date de fin d'habilitation", () => {
  it("création avec date de fin", async () => {
    await expect(habiliter({ valide_jusqu_au: "2026-12-31T18:00", valide_jusqu_au__fuseau: "Europe/Paris" })).rejects.toThrow("succes=");
    expect(parametresRpc().p_valide_jusqu_au).toBe("2026-12-31T17:00:00.000Z");
  });

  it("suppression : « Sans date de fin » l'emporte sur une valeur résiduelle (Safari)", async () => {
    await expect(habiliter({ valide_jusqu_au: "2026-12-31T18:00", valide_jusqu_au__fuseau: "Europe/Paris", valide_jusqu_au__aucune: "1" }))
      .rejects.toThrow("succes=");
    expect(parametresRpc().p_valide_jusqu_au).toBeNull();
  });

  it("une date invalide n'est jamais transformée en habilitation sans fin", async () => {
    await expect(habiliter({ valide_jusqu_au: "31/12/2026 18:00" })).rejects.toThrow(/error=Date/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fin antérieure au début refusée (dans le même fuseau)", async () => {
    await expect(habiliter({
      valide_du: "2026-07-15T10:00", valide_du__fuseau: "Asia/Tokyo",
      valide_jusqu_au: "2026-07-15T09:00", valide_jusqu_au__fuseau: "Asia/Tokyo",
    })).rejects.toThrow(/error=La%20fin/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
