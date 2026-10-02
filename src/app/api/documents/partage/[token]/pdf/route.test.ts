import { beforeEach, describe, expect, it, vi } from "vitest";
import { politiquesRateLimitPour } from "@/lib/security/rate-limit";

// ELSATIA POST-V9 HARDENING V1 — SEC-5 (Security V2 §7 ; train V9 §4) : la route publique
// /api/documents/partage/[token]/pdf lançait Chromium AVANT toute validation du jeton,
// sans rate limit, vers une origine dérivée de l'en-tête Host de la requête.
// Témoin ROUGE sur V9 (6392131a) ; VERT après correctif.

const deps = vi.hoisted(() => ({ rpc: vi.fn(), genererPdf: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: deps.rpc }) }));
vi.mock("@/lib/pdf/generer", async () => {
  const reel = await vi.importActual<typeof import("@/lib/pdf/generer")>("@/lib/pdf/generer");
  return { ...reel, genererPdfDepuisUrl: deps.genererPdf };
});

vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.exemple.invalid");
const { GET } = await import("./route");

const TOKEN = "A".repeat(43);
const appeler = (url: string, token = TOKEN) => GET(new Request(url), { params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
  deps.genererPdf.mockResolvedValue(Buffer.from("%PDF-1.7 test"));
  deps.rpc.mockResolvedValue({ data: { type_document: "facture", document: { numero: "FAC-2026-001" } }, error: null });
});

describe("SEC-5 — PDF de partage public", () => {
  it("jeton inconnu ou expiré : 404 SANS lancer Chromium", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: null });
    const reponse = await appeler(`https://app.exemple.invalid/api/documents/partage/${TOKEN}/pdf`);
    expect(reponse.status).toBe(404);
    expect(deps.genererPdf).not.toHaveBeenCalled();
    expect(deps.rpc).toHaveBeenCalledWith("document_commercial_public_par_token", { p_token: TOKEN });
  });

  it("jeton mal formé : 404 sans requête base ni Chromium", async () => {
    for (const jeton of ["court", "../../etc", `${"A".repeat(43)}%2F`, "A".repeat(200)]) {
      const reponse = await appeler("https://app.exemple.invalid/api/documents/partage/x/pdf", jeton);
      expect(reponse.status).toBe(404);
    }
    expect(deps.rpc).not.toHaveBeenCalled();
    expect(deps.genererPdf).not.toHaveBeenCalled();
  });

  it("erreur de résolution : 404 sans Chromium", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const reponse = await appeler(`https://app.exemple.invalid/api/documents/partage/${TOKEN}/pdf`);
    expect(reponse.status).toBe(404);
    expect(deps.genererPdf).not.toHaveBeenCalled();
  });

  it("origine figée : un Host falsifié ne détourne pas Chromium (SSRF)", async () => {
    const reponse = await appeler(`http://169.254.169.254/api/documents/partage/${TOKEN}/pdf`);
    expect(reponse.status).toBe(200);
    expect(deps.genererPdf).toHaveBeenCalledTimes(1);
    expect(deps.genererPdf.mock.calls[0][0]).toBe(`https://app.exemple.invalid/imprimer/partage/${TOKEN}`);
  });

  it("nom de fichier issu du document, jamais des paramètres de requête", async () => {
    const reponse = await appeler(`https://app.exemple.invalid/api/documents/partage/${TOKEN}/pdf?numero=pirate&type=devis`);
    expect(reponse.headers.get("content-disposition")).toBe('inline; filename="facture-FAC-2026-001.pdf"');
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect(reponse.headers.get("content-type")).toBe("application/pdf");
  });

  it("rate limit par IP, connecté ou non, avant tout rendu", () => {
    for (const authentifie of [false, true]) {
      expect(politiquesRateLimitPour(`/api/documents/partage/${TOKEN}/pdf`, "GET", authentifie)[0]).toMatchObject({
        cle: "api:shared-pdf",
        portee: "ip",
      });
    }
    // La page imprimable reste hors plafond IP : Chromium l'appelle depuis le serveur.
    expect(politiquesRateLimitPour(`/imprimer/partage/${TOKEN}`, "GET", false)).toEqual([]);
  });
});
