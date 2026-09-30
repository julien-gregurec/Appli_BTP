import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { exigerBaseLocale, exigerCibleLocale, fuites, jusqua, signerJwt, signerStripe } from "./lib.mjs";

test("le drill refuse toute cible non locale", () => {
  assert.equal(exigerCibleLocale("http://127.0.0.1:3100/api/health"), "http://127.0.0.1:3100/api/health");
  assert.equal(exigerCibleLocale("http://localhost:15432"), "http://localhost:15432");
  for (const url of ["https://abc.supabase.co", "https://app.elsatia.fr", "http://10.0.0.5:5432", "pas une url"]) {
    assert.throws(() => exigerCibleLocale(url), /REFUS/);
  }
});

test("le drill refuse une base qui ressemble à une chaîne de connexion", () => {
  assert.equal(exigerBaseLocale("incident_drill"), "incident_drill");
  for (const nom of ["postgres://u:p@h/db", "db.abc.supabase.co", "x", "Prod-DB"]) assert.throws(() => exigerBaseLocale(nom), /REFUS/);
});

test("JWT HS256 vérifiable avec le secret local", () => {
  const jwt = signerJwt({ sub: "u1", role: "authenticated", aal: "aal2" }, "secret-local");
  const [h, c, s] = jwt.split(".");
  assert.equal(crypto.createHmac("sha256", "secret-local").update(`${h}.${c}`).digest("base64url"), s);
  assert.equal(JSON.parse(Buffer.from(c, "base64url").toString()).aal, "aal2");
});

test("signature Stripe v1", () => {
  const sig = signerStripe("{}", "whsec_local", 1700000000);
  assert.match(sig, /^t=1700000000,v1=[0-9a-f]{64}$/);
});

test("détection de fuite de secret dans une réponse publique", () => {
  assert.deepEqual(fuites('{"statut":"OK"}', ["sk_test_abcdef", "xkeysib-123456"]), []);
  assert.deepEqual(fuites("erreur sk_test_abcdef", ["sk_test_abcdef", "court"]), ["sk_test_abcdef"]);
});

test("jusqua borne l'attente", async () => {
  let n = 0;
  const r = await jusqua(async () => ++n >= 3, 2_000, 10);
  assert.equal(r.ok, true);
  const echec = await jusqua(async () => false, 50, 10);
  assert.equal(echec.ok, false);
});
