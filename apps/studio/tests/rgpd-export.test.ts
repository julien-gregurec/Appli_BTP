import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createIdentityIssuer, createIdentityVerifier, generateSigningKey, parseSigningKeys, staticJwks, STUDIO_AUDIENCE } from "@elsatia/identity";
import { servirExport, type DependancesExport } from "../src/lib/rgpd-export";

const ISS = "https://gp.elsatia.test/identity";
const ring = parseSigningKeys(JSON.stringify({ current: generateSigningKey().privateJwk }));
const issuer = createIdentityIssuer({ issuer: ISS, keys: ring });
const verifier = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks()) });

function deps(sujet: Record<string, unknown>, journal: string[] = []): DependancesExport {
  const consommes = new Set<string>();
  return {
    verifier: (t) => verifier.verifyExportRequest(t),
    consommer: async (jti) => {
      journal.push("consume");
      if (consommes.has(jti)) return false;
      consommes.add(jti);
      return true;
    },
    lireSujet: async () => {
      journal.push("read");
      return sujet;
    },
    signer: async (b, c) => `https://studio.supabase.test/storage/v1/object/sign/${b}/${c}?token=t`,
  };
}
const demande = () => issuer.issueExportRequest({ userId: randomUUID(), audience: STUDIO_AUDIENCE, jobId: randomUUID() }).token;
const W = "5e000000-0000-0000-0000-000000000001";

describe("route d'export RGPD Studio", () => {
  it("demande valide : données + URL signées pour les seuls fichiers OWN_DATA", async () => {
    const r = await servirExport({ token: demande() }, deps({ statut: "ok", compte: { email: "e@x" }, projets: [{ id: 1 }], fichiers: [
      { bucket: "studio-originals", cle: `studio/${W}/a.jpg`, categorie: "OWN_DATA" },
      { bucket: "studio-originals", cle: `studio/${W}/b.jpg`, categorie: "SHARED" },
      { bucket: "autre", cle: `studio/${W}/c.jpg`, categorie: "OWN_DATA" },
    ] }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ statut: "ok", format: "elsatia.studio-export/1", donnees: { compte: { email: "e@x" }, projets: [{ id: 1 }] } });
    expect((r.body.fichiers as Array<{ url: string | null }>).map((f) => f.url !== null)).toEqual([true, false, false]);
  });

  it("rejeu de la même demande : 409, aucune lecture", async () => {
    const journal: string[] = [];
    const d = deps({ statut: "ok", fichiers: [] }, journal);
    const t = demande();
    expect((await servirExport({ token: t }, d)).status).toBe(200);
    expect((await servirExport({ token: t }, d))).toEqual({ status: 409, body: { code: "REPLAY" } });
    expect(journal).toEqual(["consume", "read", "consume"]);
  });

  it("demande forgée, d'un autre projet ou mal formée : refusée AVANT consommation et lecture", async () => {
    const journal: string[] = [];
    const autre = createIdentityIssuer({ issuer: ISS, keys: parseSigningKeys(JSON.stringify({ current: generateSigningKey().privateJwk })) });
    const etranger = autre.issueExportRequest({ userId: randomUUID(), audience: STUDIO_AUDIENCE, jobId: randomUUID() }).token;
    expect((await servirExport({ token: etranger }, deps({}, journal))).status).toBe(401);
    const passage = issuer.issueHandoff({ userId: randomUUID(), email: "a@b.c", emailVerified: true, audience: STUDIO_AUDIENCE, nonce: "n".repeat(43), ent: { granted: true, plan: null, valid_until: null }, seq: 0 }).token;
    expect(await servirExport({ token: passage }, deps({}, journal))).toEqual({ status: 401, body: { code: "TYP_REJECTED" } });
    expect((await servirExport({ jeton: "x" }, deps({}, journal))).status).toBe(400);
    expect(journal).toEqual([]);
  });

  it("aucun compte : 200 vide ; compte inactif : 409 ; base indisponible : 503", async () => {
    expect((await servirExport({ token: demande() }, deps({ statut: "aucun_compte" }))).body).toEqual({ statut: "aucun_compte", format: "elsatia.studio-export/1" });
    expect((await servirExport({ token: demande() }, deps({ statut: "compte_inactif" }))).status).toBe(409);
    const panne = { ...deps({}), lireSujet: async () => { throw new Error("db"); } };
    expect((await servirExport({ token: demande() }, panne)).status).toBe(503);
  });
});
