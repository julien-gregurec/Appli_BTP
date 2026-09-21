import { describe, expect, it, vi } from "vitest";
import { genererTokenPartage, hacherTokenPartage, obtenirNouveauTokenPartage, resoudreTokenPartage } from "@/lib/documents-partage";

describe("genererTokenPartage", () => {
  it("génère des tokens longs, url-safe et différents à chaque appel", () => {
    const a = genererTokenPartage();
    const b = genererTokenPartage();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hacherTokenPartage", () => {
  it("est déterministe pour un même token", () => {
    const token = "token-de-test";
    expect(hacherTokenPartage(token)).toBe(hacherTokenPartage(token));
  });

  it("produit des empreintes différentes pour des tokens différents", () => {
    expect(hacherTokenPartage("token-a")).not.toBe(hacherTokenPartage("token-b"));
  });

  it("ne renvoie jamais le token en clair", () => {
    const token = "secret-en-clair-tres-identifiable";
    expect(hacherTokenPartage(token)).not.toContain(token);
  });
});

describe("obtenirNouveauTokenPartage", () => {
  it("révoque les tokens actifs existants puis insère le nouveau", async () => {
    const update = vi.fn().mockReturnThis();
    const eqUpdate = vi.fn().mockReturnThis();
    const isFn = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ update, eq: eqUpdate, is: isFn, insert }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    // Réenchaîne update().eq().eq().eq().is(...) comme le fait le vrai client.
    update.mockReturnValue({ eq: eqUpdate });
    eqUpdate.mockReturnValue({ eq: eqUpdate, is: isFn });

    const token = await obtenirNouveauTokenPartage(supabase, {
      entrepriseId: "ent-1",
      typeDocument: "devis",
      documentId: "doc-1",
      creePar: "user-1",
    });

    expect(typeof token).toBe("string");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ entreprise_id: "ent-1", type_document: "devis", document_id: "doc-1", cree_par: "user-1" }),
    );
  });

  it("lève une erreur explicite si l'insertion échoue", async () => {
    const chain = { eq: vi.fn(), is: vi.fn() };
    chain.eq.mockReturnValue(chain);
    chain.is.mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue(chain),
        insert: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    await expect(
      obtenirNouveauTokenPartage(supabase, { entrepriseId: "ent-1", typeDocument: "facture", documentId: "doc-1", creePar: "user-1" }),
    ).rejects.toThrow("Impossible de créer le lien d'accès sécurisé");
  });
});

describe("resoudreTokenPartage", () => {
  it("retourne null si le token est vide", async () => {
    const supabase = { rpc: vi.fn() } as unknown as import("@supabase/supabase-js").SupabaseClient;
    expect(await resoudreTokenPartage(supabase, "")).toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("retourne null si la RPC ne renvoie aucune ligne (token invalide/expiré/révoqué)", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as unknown as import("@supabase/supabase-js").SupabaseClient;
    expect(await resoudreTokenPartage(supabase, "un-token")).toBeNull();
  });

  it("retourne null en cas d'erreur RPC", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "erreur" } }) } as unknown as import("@supabase/supabase-js").SupabaseClient;
    expect(await resoudreTokenPartage(supabase, "un-token")).toBeNull();
  });

  it("retourne l'identité du document quand le token est valide", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ type_document: "devis", document_id: "doc-1", entreprise_id: "ent-1" }],
        error: null,
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const resolution = await resoudreTokenPartage(supabase, "un-token-valide");
    expect(resolution).toEqual({ typeDocument: "devis", documentId: "doc-1", entrepriseId: "ent-1" });
    expect(supabase.rpc).toHaveBeenCalledWith("document_commercial_par_token", { p_token_hash: hacherTokenPartage("un-token-valide") });
  });
});
