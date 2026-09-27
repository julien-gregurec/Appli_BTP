import { describe, expect, it } from "vitest";
import { MediaRemoteError, type MediaId, type ReleveId, type TenantId } from "@elsatia/releve-domain";
import { classifyMediaError, elementFromRow, mediaFromRow, SupabaseReleveMediaRepository, type ReleveMediaSupabaseClient } from "./supabase-media-repository";

const META = { entreprise_id: "a0000000-0000-0000-0000-000000000001", created_at: "2026-09-27T10:00:00Z", updated_at: "2026-09-27T10:00:00Z", created_by: "u", updated_by: "u", revision: "3", deleted_at: null };

/** Client minimal : enregistre les appels, renvoie les réponses programmées. */
function fakeClient(responses: { insert?: unknown; upload?: unknown; rpc?: unknown; remove?: unknown; sign?: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const client = {
    from: (table: string) => ({ insert: async (row: unknown) => { calls.push(["insert", table, row]); return responses.insert ?? { error: null }; } }),
    rpc: async (name: string, args: unknown) => { calls.push(["rpc", name, args]); return responses.rpc ?? { data: { chemin: "chemin", miniature: "mini", fige: false }, error: null }; },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: unknown, options: unknown) => { calls.push(["upload", bucket, path, options]); return responses.upload ?? { data: { path }, error: null }; },
        remove: async (paths: string[]) => { calls.push(["remove", bucket, paths]); return responses.remove ?? { data: paths.map((name) => ({ name })), error: null }; },
        createSignedUrl: async (path: string, ttl: number) => { calls.push(["sign", bucket, path, ttl]); return responses.sign ?? { data: { signedUrl: `https://x/${path}?t=${ttl}` }, error: null }; },
        createSignedUrls: async (paths: string[], ttl: number) => {
          calls.push(["signMany", bucket, paths, ttl]);
          return { data: paths.map((path) => (path === "refuse" ? { path, signedUrl: null, error: "Object not found" } : { path, signedUrl: `https://x/${path}?t=${ttl}`, error: null })), error: null };
        },
      }),
    },
  };
  return { client: client as unknown as ReleveMediaSupabaseClient, calls };
}

const mediaRow = {
  id: "m" as MediaId, releveId: "r" as ReleveId, entrepriseId: "t" as TenantId, categorie: "photos" as const, storagePath: "p", mimeType: "image/jpeg", tailleOctets: 10,
  nomFichier: null, metadata: {} as never, miniatureStoragePath: "q", commentaire: "Fissure", etatDocumente: "initial" as const,
};

describe("adaptateur Supabase des médias Relevé", () => {
  it("classe les erreurs : seul le réseau est retenté", () => {
    expect(classifyMediaError({ message: "TypeError: Failed to fetch", code: "" })).toBe("network");
    expect(classifyMediaError({ name: "StorageUnknownError", message: "x" })).toBe("network");
    expect(classifyMediaError({ code: "42501", message: "new row violates row-level security policy" })).toBe("forbidden");
    expect(classifyMediaError({ statusCode: "403", message: "Unauthorized" })).toBe("forbidden");
    expect(classifyMediaError({ code: "23514", message: "check" })).toBe("invalid");
    expect(classifyMediaError({ status: 413, message: "Payload too large" })).toBe("invalid");
    expect(classifyMediaError({ code: "P0002", message: "introuvable" })).toBe("not_found");
    expect(classifyMediaError({ status: 503, message: "unavailable" })).toBe("network");
    expect(classifyMediaError({ code: "42501" }, false)).toBe("network");
  });

  it("dépôt sans écrasement dans le bucket privé ; « déjà présent » = succès idempotent", async () => {
    const created = fakeClient({});
    expect(await new SupabaseReleveMediaRepository(created.client).uploadObject("a/b/photos/c.jpg", new Uint8Array(3), "image/jpeg")).toBe("created");
    expect(created.calls[0]).toEqual(["upload", "tools-releves", "a/b/photos/c.jpg", { contentType: "image/jpeg", upsert: false, cacheControl: "3600" }]);
    const duplicate = fakeClient({ upload: { data: null, error: { statusCode: "409", message: "The resource already exists" } } });
    expect(await new SupabaseReleveMediaRepository(duplicate.client).uploadObject("p", new Uint8Array(1), "image/jpeg")).toBe("exists");
    const forbidden = fakeClient({ upload: { data: null, error: { statusCode: "403", message: "new row violates row-level security policy" } } });
    await expect(new SupabaseReleveMediaRepository(forbidden.client).uploadObject("p", new Uint8Array(1), "image/jpeg")).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("ligne média : métadonnées transmises ; doublon (23505) = succès ; refus CHECK = invalide", async () => {
    const ok = fakeClient({});
    expect(await new SupabaseReleveMediaRepository(ok.client).insertMedia(mediaRow)).toBe("created");
    expect(ok.calls[0][2]).toMatchObject({ id: "m", categorie: "photos", metadata: {}, miniature_storage_path: "q", commentaire: "Fissure", etat_documente: "initial" });
    const dup = fakeClient({ insert: { error: { code: "23505", message: "duplicate key" } } });
    expect(await new SupabaseReleveMediaRepository(dup.client).insertMedia(mediaRow)).toBe("exists");
    const bad = fakeClient({ insert: { error: { code: "23514", message: "violates check constraint" } } });
    const error = await new SupabaseReleveMediaRepository(bad.client).insertMedia(mediaRow).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MediaRemoteError);
    expect(error).toMatchObject({ kind: "invalid", code: "23514" });
  });

  it("URL signée, suppression et RPC de retrait / remplacement", async () => {
    const { client, calls } = fakeClient({});
    const repository = new SupabaseReleveMediaRepository(client);
    expect(await repository.signedUrl("p", 600)).toBe("https://x/p?t=600");
    expect(await repository.removeObjects(["p"])).toEqual(["p"]);
    expect(await repository.removeObjects([])).toEqual([]);
    expect(await repository.deletePhoto("m" as MediaId)).toEqual({ storagePath: "chemin", miniaturePath: "mini", fige: false });
    expect(await repository.signedUrls(["a", "refuse"], 600)).toEqual({ a: "https://x/a?t=600" });
    await repository.replacePhoto("a" as MediaId, "b" as MediaId);
    expect(calls.filter(([kind]) => kind === "rpc")).toEqual([["rpc", "tools_releve_retirer_photo", { p_media_id: "m" }], ["rpc", "tools_releve_remplacer_photo", { p_ancien: "a", p_nouveau: "b" }]]);
    const refused = fakeClient({ sign: { data: null, error: { statusCode: "400", message: "Object not found" } } });
    await expect(new SupabaseReleveMediaRepository(refused.client).signedUrl("p", 600)).rejects.toBeInstanceOf(MediaRemoteError);
  });

  it("doublon de CONTENU (même SHA-256) ≠ reprise idempotente : refus explicite", async () => {
    const dup = fakeClient({ insert: { error: { code: "23505", message: 'duplicate key value violates unique constraint "tools_releves_medias_empreinte_unique"' } } });
    await expect(new SupabaseReleveMediaRepository(dup.client).insertMedia(mediaRow)).rejects.toMatchObject({ kind: "duplicate" });
    const figee = fakeClient({ rpc: { data: { chemin: "c", miniature: null, fige: true }, error: null } });
    expect(await new SupabaseReleveMediaRepository(figee.client).deletePhoto("m" as MediaId)).toEqual({ storagePath: "c", miniaturePath: null, fige: true });
    const inattendu = fakeClient({ rpc: { data: "texte", error: null } });
    await expect(new SupabaseReleveMediaRepository(inattendu.client).deletePhoto("m" as MediaId)).rejects.toBeInstanceOf(MediaRemoteError);
  });

  it("mapping des lignes (numeric PostgREST en chaîne, métadonnées absentes → {})", () => {
    const media = mediaFromRow({ ...META, id: "m", releve_id: "r", categorie: "photos", storage_path: "p", mime_type: "image/jpeg", taille_octets: "1200", nom_fichier: null, metadata: null });
    expect(media).toMatchObject({ tailleOctets: 1200, revision: 3, metadata: {}, createdBy: "u", commentaire: null, etatDocumente: "initial", miniatureStoragePath: null });
    const element = elementFromRow({ ...META, id: "e", releve_id: "r", type: "photo_anchor", etage_id: null, piece_id: null, parent_element_id: null, schema_version: 1, donnees: { mediaId: "m" } });
    expect(element).toMatchObject({ type: "photo_anchor", revision: 3, donnees: { mediaId: "m" } });
  });
});
