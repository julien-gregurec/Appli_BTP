import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createIdentityIssuer, createIdentityVerifier, generateSigningKey, parseSigningKeys, staticJwks, STUDIO_AUDIENCE } from "@elsatia/identity";
import { studioExportClient } from "./studio-client";

const ISS = "https://gp.elsatia.test/identity";
const cle = generateSigningKey();
const ring = parseSigningKeys(JSON.stringify({ current: cle.privateJwk }));
const issuer = createIdentityIssuer({ issuer: ISS, keys: ring });
const verifier = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks()) });

function fetcher(reponse: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => reponse(String(url), init)) as typeof fetch;
}

describe("client d'export Studio (contrat inter-projets)", () => {
  it("envoie une demande signée vérifiable par Studio (clé publique), sans identifiant plateforme", async () => {
    let corps = "";
    const client = studioExportClient({ issuer, url: "https://studio.test/api/elsatia/export", originesFichiers: [],
      fetcher: fetcher(async (_u, init) => {
        corps = String(init?.body);
        return Response.json({ statut: "aucun_compte", format: "elsatia.studio-export/1" });
      }) });
    const user = randomUUID();
    const job = randomUUID();
    await expect(client.exporter(user, job)).resolves.toMatchObject({ statut: "aucun_compte" });
    expect(corps).not.toContain(user);
    const claims = await verifier.verifyExportRequest(JSON.parse(corps).token);
    expect(claims.job).toBe(job);
  });

  it.each([
    ["réseau coupé", () => { throw new TypeError("fetch failed"); }, "EXPORT_STUDIO_INDISPONIBLE"],
    ["503", () => new Response("", { status: 503 }), "EXPORT_STUDIO_INDISPONIBLE"],
    ["401 (contrat refusé)", () => new Response("", { status: 401 }), "EXPORT_STUDIO_CONTRAT_REFUSE"],
    ["réponse non conforme", () => Response.json({ statut: "ok", format: "autre/1" }), "EXPORT_STUDIO_REPONSE_INVALIDE"],
    ["corps illisible", () => new Response("<html>", { status: 200 }), "EXPORT_STUDIO_REPONSE_INVALIDE"],
  ])("%s → erreur transitoire %s (le job est réessayé, jamais déclaré complet)", async (_n, rep, code) => {
    const client = studioExportClient({ issuer, url: "https://studio.test/x", originesFichiers: [], fetcher: fetcher(rep as () => Response) });
    await expect(client.exporter(randomUUID(), randomUUID())).rejects.toMatchObject({ code });
  });

  it("URL de fichier hors du Storage Studio configuré : jamais suivie (SSRF)", async () => {
    const appels: string[] = [];
    const client = studioExportClient({ issuer, url: "https://studio.test/x", originesFichiers: ["https://studio-proj.supabase.co"],
      fetcher: fetcher((u) => { appels.push(u); return new Response("ok"); }) });
    expect(await client.lireUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
    expect(await client.lireUrl("https://gp-proj.supabase.co/storage/v1/object/sign/x")).toBeNull();
    expect(await client.lireUrl("pas une url")).toBeNull();
    expect(await client.lireUrl("https://studio-proj.supabase.co/storage/v1/object/sign/studio-originals/a?token=t")).not.toBeNull();
    expect(appels).toEqual(["https://studio-proj.supabase.co/storage/v1/object/sign/studio-originals/a?token=t"]);
  });
});
