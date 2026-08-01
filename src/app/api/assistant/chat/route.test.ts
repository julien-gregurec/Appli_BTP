import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test d'integration de la route reelle (pas seulement de la validation isolee) : construit
// de vraies Request avec un corps ReadableStream, pour verifier que le lecteur de flux
// borne (lireJsonBorne) laisse effectivement passer une piece jointe realiste apres le
// correctif, sans dependre de Supabase ni d'un appel reseau reel a OpenAI.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/entreprise", () => ({
  getContexteEntreprise: vi.fn(async () => ({
    entrepriseId: "11111111-1111-1111-1111-111111111111",
    entrepriseNom: "Entreprise de test",
    userId: "22222222-2222-2222-2222-222222222222",
    prenom: "Test",
  })),
}));
vi.mock("@/lib/permissions", () => ({
  permissionsUtilisateur: vi.fn(async () => null),
  aAccesIA: vi.fn(() => true),
}));
vi.mock("@/lib/ai/journal", () => ({
  verifierPlafondIA: vi.fn(async () => null),
  journaliserAppelIA: vi.fn(),
}));
vi.mock("@/lib/ai/assistant", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/assistant")>();
  return {
    ...actual,
    // Ne jamais appeler le vrai provider IA (couteux, reseau) : un generateur vide suffit
    // a verifier que la route accepte la requete et atteint le flux de reponse.
    demanderAssistantIAStream: vi.fn(async function* () {
      yield { type: "texte", delta: "ok" };
    }),
  };
});

const { POST } = await import("./route");
const assistant = await import("@/lib/ai/assistant");
const entreprise = await import("@/lib/entreprise");
const permissions = await import("@/lib/permissions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(permissions.aAccesIA).mockReturnValue(true);
});

afterEach(() => vi.unstubAllEnvs());

function base64DeTaille(octets: number): string {
  return Buffer.alloc(octets, 1).toString("base64");
}

function requeteJson(corps: unknown): Request {
  const texte = JSON.stringify(corps);
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: texte,
  });
}

async function lireStatutEtCorps(reponse: Response) {
  const statut = reponse.status;
  if (reponse.headers.get("Content-Type")?.includes("application/json")) {
    return { statut, corps: await reponse.json() };
  }
  return { statut, corps: null };
}

describe("POST /api/assistant/chat — regression pieces jointes", () => {
  it("refuse avant tout contexte ou provider lorsque l'IA globale est désactivée", async () => {
    vi.stubEnv("FEATURE_AI_ENABLED", "false");
    const reponse = await POST(requeteJson({ historique: [{ role: "user", contenu: "Bonjour" }] }));
    expect(reponse.status).toBe(404);
    expect(entreprise.getContexteEntreprise).not.toHaveBeenCalled();
    expect(assistant.demanderAssistantIAStream).not.toHaveBeenCalled();
  });

  it("conserve le contrôle des permissions lorsque l'IA globale est active", async () => {
    vi.stubEnv("FEATURE_AI_ENABLED", "true");
    vi.mocked(permissions.aAccesIA).mockReturnValue(false);
    const reponse = await POST(requeteJson({ historique: [{ role: "user", contenu: "Bonjour" }] }));
    expect(reponse.status).toBe(403);
    expect(assistant.demanderAssistantIAStream).not.toHaveBeenCalled();
  });

  it("accepte un message texte normal sans fichier", async () => {
    const reponse = await POST(requeteJson({ historique: [{ role: "user", contenu: "Bonjour" }] }));
    expect(reponse.status).toBe(200);
  });

  it("accepte une piece jointe JPEG realiste de 500 Ko (cas de la regression)", async () => {
    const reponse = await POST(
      requeteJson({
        historique: [{ role: "user", contenu: "Analyse cette photo", fichier: { mimeType: "image/jpeg", base64: base64DeTaille(500 * 1024) } }],
      }),
    );
    expect(reponse.status).toBe(200);
  });

  it("accepte un PDF de 1 Mo", async () => {
    const reponse = await POST(
      requeteJson({
        historique: [{ role: "user", contenu: "Relis ce devis", fichier: { mimeType: "application/pdf", base64: base64DeTaille(1024 * 1024) } }],
      }),
    );
    expect(reponse.status).toBe(200);
  });

  it("refuse une piece jointe superieure a 6 Mo (rejet metier explicite, distinct du plafond global du corps)", async () => {
    // Volontairement juste au-dessus de 6 Mo decodes, pas trop pour rester sous le plafond
    // global du corps HTTP (TAILLE_MAX_CORPS_ASSISTANT) : ce test verifie precisement le
    // message d'erreur dedie a la piece jointe, distinct du 413 generique du flux.
    const reponse = await POST(
      requeteJson({
        historique: [{ role: "user", contenu: "Photo trop lourde", fichier: { mimeType: "image/jpeg", base64: base64DeTaille(6_050_000) } }],
      }),
    );
    const { statut, corps } = await lireStatutEtCorps(reponse);
    expect(statut).toBe(400);
    expect(corps.error).toMatch(/6 Mo/);
  });

  it("refuse un type MIME interdit", async () => {
    const reponse = await POST(
      requeteJson({
        historique: [{ role: "user", contenu: "Fichier", fichier: { mimeType: "application/zip", base64: base64DeTaille(1024) } }],
      }),
    );
    const { statut } = await lireStatutEtCorps(reponse);
    expect(statut).toBe(400);
  });

  it("refuse un payload texte abusif de 70 000 caracteres sans fichier", async () => {
    const reponse = await POST(requeteJson({ historique: [{ role: "user", contenu: "x".repeat(70_000) }] }));
    const { statut } = await lireStatutEtCorps(reponse);
    expect(statut).toBe(400);
  });

  it("refuse un corps HTTP brut trop volumineux, quel que soit son contenu", async () => {
    // Garbage superieur au plafond total dedie de la route (TAILLE_MAX_CORPS_ASSISTANT) :
    // doit etre coupe par le lecteur de flux avant meme la tentative de parsing JSON.
    const enorme = "a".repeat(9_000_000);
    const reponse = await POST(
      new Request("http://localhost/api/assistant/chat", { method: "POST", body: enorme }),
    );
    expect(reponse.status).toBe(413);
  });

  it("refuse un historique de plus de 30 messages", async () => {
    const historique = Array.from({ length: 31 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", contenu: `m${i}` }));
    const reponse = await POST(requeteJson({ historique }));
    const { statut } = await lireStatutEtCorps(reponse);
    expect(statut).toBe(400);
  });
});
