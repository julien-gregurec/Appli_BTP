import { test } from "node:test";
import assert from "node:assert/strict";
import { verifierCibleDr, indicesProduction, REF_PREVIEW_CONNUE } from "./garde-cible.mjs";

const local = { hote: "127.0.0.1", base: "elsatia_dr_v2_live" };

test("base locale jetable autorisée", () => {
  const r = verifierCibleDr(local, {});
  assert.equal(r.autorise, true);
  assert.equal(r.distante, false);
});

test("base locale sans le préfixe DR refusée", () => {
  for (const base of ["upg_v4_v5", "gestion_pro", "elsatia", "dr_elsatia"]) {
    assert.equal(verifierCibleDr({ hote: "localhost", base }, {}).autorise, false, base);
  }
});

test("base absente refusée", () => {
  assert.equal(verifierCibleDr({ hote: "localhost" }, {}).autorise, false);
});

test("Production refusée par défaut : variables d'environnement", () => {
  for (const env of [{ VERCEL_ENV: "production" }, { NODE_ENV: "production" }, { ELSATIA_ENV: "production" }]) {
    const r = verifierCibleDr(local, env);
    assert.equal(r.autorise, false);
    assert.match(r.motif, /Production refusée/);
  }
});

test("Production refusée : projet Supabase non Preview", () => {
  const r = verifierCibleDr(local, { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co" });
  assert.equal(r.autorise, false);
  assert.match(r.motif, /abcdefghijklmnop/);
  assert.equal(indicesProduction({ NEXT_PUBLIC_SUPABASE_URL: `https://${REF_PREVIEW_CONNUE}.supabase.co` }).length, 0);
});

test("Production refusée : nom de base ou hôte", () => {
  assert.equal(verifierCibleDr({ hote: "localhost", base: "elsatia_dr_prod_copy" }, {}).autorise, false);
  assert.equal(verifierCibleDr({ hote: "db-prod.example", base: "elsatia_dr_x", mode: "verify-backup" },
    { DR_ALLOW_REMOTE: "1", DR_REMOTE_ALLOWLIST: "db-prod.example" }).autorise, false);
});

test("Production refusée même avec autorisation distante", () => {
  const r = verifierCibleDr({ hote: "db.abcdefghijklmnop.supabase.co", base: "elsatia_dr_x", mode: "verify-backup" },
    { DR_ALLOW_REMOTE: "1", DR_REMOTE_ALLOWLIST: "db.abcdefghijklmnop.supabase.co" });
  assert.equal(r.autorise, false);
  assert.match(r.motif, /Production refusée/);
});

test("cible distante refusée sans autorisation explicite", () => {
  const cible = { hote: "10.0.0.5", base: "elsatia_dr_x", mode: "verify-backup" };
  assert.equal(verifierCibleDr(cible, {}).autorise, false);
  assert.equal(verifierCibleDr(cible, { DR_ALLOW_REMOTE: "1" }).autorise, false);
  assert.equal(verifierCibleDr(cible, { DR_ALLOW_REMOTE: "true", DR_REMOTE_ALLOWLIST: "10.0.0.5" }).autorise, false);
  assert.equal(verifierCibleDr(cible, { DR_ALLOW_REMOTE: "1", DR_REMOTE_ALLOWLIST: "10.0.0.50" }).autorise, false);
});

test("cible distante autorisée explicitement : verify-backup uniquement", () => {
  const env = { DR_ALLOW_REMOTE: "1", DR_REMOTE_ALLOWLIST: "10.0.0.5, 10.0.0.6" };
  const ok = verifierCibleDr({ hote: "10.0.0.5", base: "elsatia_dr_x", mode: "verify-backup" }, env);
  assert.equal(ok.autorise, true);
  assert.equal(ok.distante, true);
  const drill = verifierCibleDr({ hote: "10.0.0.5", base: "elsatia_dr_x", mode: "drill" }, env);
  assert.equal(drill.autorise, false);
  assert.match(drill.motif, /verify-backup/);
});

test("mode inconnu refusé", () => {
  assert.equal(verifierCibleDr({ ...local, mode: "restore-prod" }, {}).autorise, false);
});
