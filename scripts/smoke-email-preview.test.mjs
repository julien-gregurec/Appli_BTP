// Tests du smoke test e-mail Preview. Aucun appel réseau : fetch et l'envoi sont injectés.
//   node --test scripts/smoke-email-preview.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { REF_PREVIEW_AUTORISEE } from "./garde-scripts-production.mjs";
import { BREVO_API_URL, REF_PRODUCTION_CONNUE, Refus, lireArguments, main, refDepuisUrl, verifierCible } from "./smoke-email-preview.mjs";

const cleBrevo = "xkeysib-" + "a".repeat(40);
const clePublique = "sb_publishable_" + "p".repeat(20);
const preview = {
  BREVO_API_KEY: cleBrevo,
  EMAIL_FROM_ADDRESS: "contact@exemple.fr",
  NEXT_PUBLIC_SUPABASE_URL: `https://${REF_PREVIEW_AUTORISEE}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: clePublique,
  ELSATIA_APPLICATION_ENV: "preview",
};

function capturer() {
  const lignes = [];
  const log = console.log, err = console.error;
  console.log = (...a) => lignes.push(a.join(" "));
  console.error = (...a) => lignes.push(a.join(" "));
  return { lignes, restaurer: () => { console.log = log; console.error = err; } };
}

async function executer(argv, env, deps) {
  const c = capturer();
  try { return { code: await main(argv, env, deps), sortie: c.lignes.join("\n") }; } finally { c.restaurer(); }
}

test("un seul mode, --check par défaut", () => {
  assert.equal(lireArguments([]).mode, "--check");
  assert.throws(() => lireArguments(["--brevo-send", "--auth-recovery"]), Refus);
});

test("refDepuisUrl ne reconnaît qu'un hôte <ref>.supabase.co", () => {
  assert.equal(refDepuisUrl(`https://${REF_PREVIEW_AUTORISEE}.supabase.co`), REF_PREVIEW_AUTORISEE);
  assert.equal(refDepuisUrl("https://evil.example.com"), null);
  assert.equal(refDepuisUrl("pas une url"), null);
});

test("Production refusée avant tout réseau, quel que soit le mode", async () => {
  let appels = 0;
  const fetchImpl = async () => { appels++; return new Response("{}"); };
  for (const env of [{ ...preview, ELSATIA_APPLICATION_ENV: "production" }, { ...preview, VERCEL_ENV: "production" }]) {
    for (const mode of ["--check", "--brevo-sandbox", "--brevo-send", "--auth-recovery"]) {
      const r = await executer([mode, "--to", "moi@exemple.fr"], env, { fetchImpl, envoyer: async () => { appels++; return {}; } });
      assert.equal(r.code, 2, `${mode}`);
    }
  }
  assert.equal(appels, 0);
});

test("--auth-recovery : référence Production refusée, même passée explicitement", () => {
  const prod = { ...preview, NEXT_PUBLIC_SUPABASE_URL: `https://${REF_PRODUCTION_CONNUE}.supabase.co` };
  assert.throws(() => verifierCible(prod, { mode: "--auth-recovery", to: "a@b.fr", previewRef: REF_PRODUCTION_CONNUE }), /PRODUCTION/);
  assert.throws(() => verifierCible(prod, { mode: "--auth-recovery", to: "a@b.fr", previewRef: null }), /PRODUCTION/);
});

test("--auth-recovery : un projet non répertorié exige --preview-ref concordant", () => {
  const autre = { ...preview, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" };
  assert.throws(() => verifierCible(autre, { mode: "--auth-recovery", to: "a@b.fr", previewRef: null }), /Preview attendue/);
  assert.doesNotThrow(() => verifierCible(autre, { mode: "--auth-recovery", to: "a@b.fr", previewRef: "abcdefghijklmnopqrst" }));
});

test("--auth-recovery : une clé secrète à la place de la clé publishable est refusée", () => {
  const env = { ...preview, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_" + "s".repeat(20) };
  assert.throws(() => verifierCible(env, { mode: "--auth-recovery", to: "a@b.fr", previewRef: null }), /secrète/);
});

test("modes réseau : --to obligatoire et unique", () => {
  assert.throws(() => verifierCible(preview, { mode: "--brevo-sandbox", to: null }), /--to/);
  assert.throws(() => verifierCible(preview, { mode: "--brevo-sandbox", to: "a@b.fr,c@d.fr" }), /--to/);
});

test("--check : aucun appel réseau, aucune valeur affichée", async () => {
  const r = await executer(["--check"], preview, { fetchImpl: async () => { throw new Error("réseau interdit"); } });
  assert.equal(r.code, 0);
  assert.equal(r.sortie.includes(cleBrevo), false);
  assert.equal(r.sortie.includes(clePublique), false);
  assert.match(r.sortie, /projet Preview connu/);
});

test("--brevo-sandbox : bac à sable demandé, clé jamais affichée", async () => {
  let requete;
  const fetchImpl = async (url, init) => { requete = { url, init }; return new Response(JSON.stringify({ messageId: "x" }), { status: 201 }); };
  const r = await executer(["--brevo-sandbox", "--to", "moi@exemple.fr"], preview, { fetchImpl });
  assert.equal(r.code, 0);
  assert.equal(requete.url, BREVO_API_URL);
  assert.equal(requete.init.headers["X-Sib-Sandbox"], "drop");
  assert.equal(JSON.parse(requete.init.body).headers["X-Sib-Sandbox"], "drop");
  assert.equal(r.sortie.includes(cleBrevo), false);
});

test("--brevo-sandbox : un refus Brevo fait échouer le smoke", async () => {
  const r = await executer(["--brevo-sandbox", "--to", "moi@exemple.fr"], preview, { fetchImpl: async () => new Response("{}", { status: 401 }) });
  assert.equal(r.code, 1);
});

test("--brevo-send : passe par le transport applicatif injecté", async () => {
  let recu;
  const r = await executer(["--brevo-send", "--to", "moi@exemple.fr"], preview, { envoyer: async (p) => { recu = p; return { messageId: "m" }; } });
  assert.equal(r.code, 0);
  assert.equal(recu.to, "moi@exemple.fr");
  assert.match(recu.sujet, /\[PREVIEW\]\[SMOKE\]/);
});

test("--auth-recovery : POST /auth/v1/recover avec la clé publishable", async () => {
  let requete;
  const fetchImpl = async (url, init) => { requete = { url, init }; return new Response("{}", { status: 200 }); };
  const r = await executer(["--auth-recovery", "--to", "moi@exemple.fr"], preview, { fetchImpl });
  assert.equal(r.code, 0);
  assert.equal(requete.url, `https://${REF_PREVIEW_AUTORISEE}.supabase.co/auth/v1/recover`);
  assert.equal(requete.init.headers.apikey, clePublique);
  assert.equal(r.sortie.includes(clePublique), false);
});
