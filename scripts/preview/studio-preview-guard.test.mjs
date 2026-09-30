// Tests de la garde de cible Studio Preview dédiée (node --test). Aucun réseau, aucune écriture.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOMAINE_STUDIO_PREVIEW,
  natureCleSupabase,
  verifierEnvStudioPreview,
  verifierEnvWorkerStudioPreview,
  verifierLiens,
} from "./studio-preview-guard.mjs";
import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE } from "./lib/preview-guard.mjs";
import { liensProduction, scriptsDePage, secretsDansTexte } from "./studio-preview-smoke.mjs";

const REF = "studiopreviewrefxxxx"; // 20 caractères, fictive
const jwt = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
const SERVICE = jwt({ role: "service_role", ref: REF });
const ANON = jwt({ role: "anon", ref: REF });

const envOk = () => ({
  ELSATIA_APPLICATION_ENV: "preview",
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON,
  NEXT_PUBLIC_STUDIO_URL: `https://${DOMAINE_STUDIO_PREVIEW}`,
  STUDIO_IDENTITY_MODE: "elsatia",
  ELSATIA_IDENTITY_ISSUER: "https://elsatia-preview.vercel.app/identity",
  ELSATIA_IDENTITY_HANDOFF_URL: "https://elsatia-preview.vercel.app/identity/studio/handoff",
  ELSATIA_IDENTITY_JWKS_URL: "https://elsatia-preview.vercel.app/api/elsatia-identity/jwks",
  STUDIO_AUTH_SERVICE_KEY: SERVICE,
  STUDIO_STORAGE_SERVICE_KEY: SERVICE,
  STUDIO_CRON_SECRET: "x".repeat(40),
  STUDIO_ENABLED: "1",
  STUDIO_SIGNUP_MODE: "closed",
  STUDIO_AI_ANALYSIS: "0",
});
const echecs = (constats) => constats.filter((c) => !c.ok).map((c) => c.code);

test("environnement Preview Studio dédié conforme → aucun échec", () => {
  assert.deepEqual(echecs(verifierEnvStudioPreview(envOk(), { refStudio: REF })), []);
});

test("URL Vercel Preview *.vercel.app admise", () => {
  const env = { ...envOk(), NEXT_PUBLIC_STUDIO_URL: "https://elsatia-studio-preview-git-x.vercel.app" };
  assert.deepEqual(echecs(verifierEnvStudioPreview(env, { refStudio: REF })), []);
});

test("--studio-ref = projet GP partagé ou Production → refus", () => {
  for (const ref of [REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE]) {
    const env = { ...envOk(), NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` };
    const codes = echecs(verifierEnvStudioPreview(env, { refStudio: ref }));
    assert.ok(codes.includes("SP-REF-INTERDITE"));
    assert.ok(codes.includes("SP-SUPABASE-URL"));
  }
});

test("URL Supabase d'un autre projet que la référence déclarée → refus", () => {
  const env = { ...envOk(), NEXT_PUBLIC_SUPABASE_URL: `https://${REF_PREVIEW_AUTORISEE}.supabase.co` };
  assert.ok(echecs(verifierEnvStudioPreview(env, { refStudio: REF })).includes("SP-SUPABASE-URL"));
});

test("référence absente → refus", () => {
  assert.ok(echecs(verifierEnvStudioPreview(envOk(), {})).includes("SP-REF-DECLAREE"));
});

test("indicateurs Production → refus", () => {
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), ELSATIA_APPLICATION_ENV: "production" }, { refStudio: REF })).includes("SP-APP-ENV"));
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), VERCEL_ENV: "production" }, { refStudio: REF })).includes("SP-VERCEL-ENV"));
});

test("domaine de Production studio.elsatia.fr ou domaine arbitraire → refus", () => {
  for (const url of ["https://studio.elsatia.fr", "https://evil.example", "http://studio-preview.elsatia.fr"]) {
    assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), NEXT_PUBLIC_STUDIO_URL: url }, { refStudio: REF })).includes("SP-ORIGINE"), url);
  }
});

test("identité : mode local, identité centrale de Production, hôtes mêlés → refus", () => {
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_IDENTITY_MODE: "local" }, { refStudio: REF })).includes("SP-IDENTITY-MODE"));
  const prod = { ...envOk(), ELSATIA_IDENTITY_ISSUER: "https://app.elsatia.fr/identity", ELSATIA_IDENTITY_HANDOFF_URL: "https://app.elsatia.fr/identity/studio/handoff" };
  assert.ok(echecs(verifierEnvStudioPreview(prod, { refStudio: REF })).includes("SP-IDENTITY-URL"));
  const mele = { ...envOk(), ELSATIA_IDENTITY_HANDOFF_URL: "https://autre-preview.vercel.app/identity/studio/handoff" };
  assert.ok(echecs(verifierEnvStudioPreview(mele, { refStudio: REF })).includes("SP-IDENTITY-COHERENCE"));
});

test("JWKS épinglé contenant une clé privée → refus ; JWKS public → admis", () => {
  const base = { ...envOk() };
  delete base.ELSATIA_IDENTITY_JWKS_URL;
  const prive = { ...base, ELSATIA_IDENTITY_JWKS: JSON.stringify({ keys: [{ kty: "EC", d: "secret" }] }) };
  assert.ok(echecs(verifierEnvStudioPreview(prive, { refStudio: REF })).includes("SP-JWKS"));
  const pub = { ...base, ELSATIA_IDENTITY_JWKS: JSON.stringify({ keys: [{ kty: "EC", x: "a", y: "b" }] }) };
  assert.deepEqual(echecs(verifierEnvStudioPreview(pub, { refStudio: REF })), []);
  assert.ok(echecs(verifierEnvStudioPreview(base, { refStudio: REF })).includes("SP-JWKS"));
});

test("clé de service exposée au navigateur → refus", () => {
  const env = { ...envOk(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SERVICE };
  const codes = echecs(verifierEnvStudioPreview(env, { refStudio: REF }));
  assert.ok(codes.includes("SP-PUBLIC-KEY"));
  assert.ok(codes.includes("SP-NO-SERVICE-IN-BROWSER"));
  const copie = { ...envOk(), NEXT_PUBLIC_DEBUG: "sb_secret_abc" };
  assert.ok(echecs(verifierEnvStudioPreview(copie, { refStudio: REF })).includes("SP-NO-SERVICE-IN-BROWSER"));
});

test("clé de service d'un autre projet ou paire incohérente → refus", () => {
  const autre = jwt({ role: "service_role", ref: REF_PREVIEW_AUTORISEE });
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_AUTH_SERVICE_KEY: autre, STUDIO_STORAGE_SERVICE_KEY: autre }, { refStudio: REF })).includes("SP-SERVICE-KEY"));
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_STORAGE_SERVICE_KEY: "sb_secret_other" }, { refStudio: REF })).includes("SP-SERVICE-KEY-PAIRE"));
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_AUTH_SERVICE_KEY: ANON, STUDIO_STORAGE_SERVICE_KEY: ANON }, { refStudio: REF })).includes("SP-SERVICE-KEY"));
});

test("secret cron court ou partagé avec GP → refus", () => {
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_CRON_SECRET: "court" }, { refStudio: REF })).includes("SP-CRON-SECRET"));
  const s = "y".repeat(40);
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_CRON_SECRET: s, CRON_SECRET: s }, { refStudio: REF })).includes("SP-CRON-SECRET"));
});

test("Studio désactivé, inscription ouverte, analyse IA active → refus", () => {
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_ENABLED: "0" }, { refStudio: REF })).includes("SP-ENABLED"));
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_SIGNUP_MODE: "open" }, { refStudio: REF })).includes("SP-SIGNUP"));
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_AI_ANALYSIS: "1" }, { refStudio: REF })).includes("SP-AI"));
});

test("fournisseur e-mail sans allowlist Preview → refus", () => {
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_RESEND_API_KEY: "re_x" }, { refStudio: REF })).includes("SP-EMAIL"));
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_MAIL_PROVIDER: "resend", STUDIO_RESEND_API_KEY: "re_x" }, { refStudio: REF })).includes("SP-EMAIL"));
  assert.deepEqual(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_MAIL_PROVIDER: "resend", STUDIO_RESEND_API_KEY: "re_x", EMAIL_PREVIEW_ALLOWLIST: "qa@elsatia.fr" }, { refStudio: REF })), []);
  assert.ok(echecs(verifierEnvStudioPreview({ ...envOk(), STUDIO_MAIL_PROVIDER: "mailpit" }, { refStudio: REF })).includes("SP-EMAIL"));
});

test("aucune valeur secrète dans les messages", () => {
  const env = { ...envOk(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SERVICE, STUDIO_CRON_SECRET: "s3cr3t-valeur" };
  const texte = JSON.stringify(verifierEnvStudioPreview(env, { refStudio: REF }));
  assert.ok(!texte.includes(SERVICE));
  assert.ok(!texte.includes("s3cr3t-valeur"));
});

test("natureCleSupabase : formats nouveaux et JWT", () => {
  assert.equal(natureCleSupabase("sb_secret_x").nature, "service");
  assert.equal(natureCleSupabase("sb_publishable_x").nature, "publique");
  assert.deepEqual(natureCleSupabase(SERVICE), { nature: "service", ref: REF });
  assert.equal(natureCleSupabase("n'importe quoi").nature, "inconnue");
  assert.equal(natureCleSupabase("").nature, null);
});

test("worker : conforme, Redis sans TLS, variables GP, clé différente", () => {
  const w = { NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`, STUDIO_STORAGE_SERVICE_KEY: SERVICE, STUDIO_REDIS_URL: "rediss://:pw@redis.example:6379", ELSATIA_APPLICATION_ENV: "preview" };
  assert.deepEqual(echecs(verifierEnvWorkerStudioPreview(w, envOk(), { refStudio: REF })), []);
  assert.ok(echecs(verifierEnvWorkerStudioPreview({ ...w, STUDIO_REDIS_URL: "redis://redis.example:6379" }, envOk(), { refStudio: REF })).includes("SPW-REDIS"));
  assert.ok(echecs(verifierEnvWorkerStudioPreview({ ...w, SUPABASE_SERVICE_ROLE_KEY: "gp" }, envOk(), { refStudio: REF })).includes("SPW-NO-GP"));
  assert.ok(echecs(verifierEnvWorkerStudioPreview({ ...w, STUDIO_STORAGE_SERVICE_KEY: "sb_secret_other" }, envOk(), { refStudio: REF })).includes("SPW-SERVICE-KEY-PAIRE"));
  assert.ok(echecs(verifierEnvWorkerStudioPreview({ ...w, ELSATIA_APPLICATION_ENV: "production" }, envOk(), { refStudio: REF })).includes("SPW-APP-ENV"));
});

test("liens : projet Vercel dédié, CLI Studio liée, racine jamais liée au projet Studio", () => {
  const ok = { vercelProject: { projectName: "elsatia-studio-preview" }, refLieeStudio: `${REF}\n`, refLieeRacine: REF_PREVIEW_AUTORISEE };
  assert.deepEqual(echecs(verifierLiens(ok, { refStudio: REF })), []);
  assert.ok(echecs(verifierLiens({ ...ok, vercelProject: { projectName: "elsatia-preview" } }, { refStudio: REF })).includes("SPL-VERCEL"));
  assert.ok(echecs(verifierLiens({ ...ok, vercelProject: null }, { refStudio: REF })).includes("SPL-VERCEL"));
  assert.ok(echecs(verifierLiens({ ...ok, refLieeStudio: REF_PREVIEW_AUTORISEE }, { refStudio: REF })).includes("SPL-SUPABASE-STUDIO"));
  assert.ok(echecs(verifierLiens({ ...ok, refLieeRacine: REF }, { refStudio: REF })).includes("SPL-SUPABASE-RACINE"));
});

// --- smoke Studio : fonctions pures ---

test("smoke : clé de service détectée dans le JavaScript servi, clé publique ignorée", () => {
  const jwtLong = (p) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ...p, iat: 1700000000, exp: 2000000000 })).toString("base64url")}.c2lnbmF0dXJlLXRlc3Q`;
  assert.deepEqual(secretsDansTexte(`const k="${jwtLong({ role: "anon", ref: REF })}"`), []);
  assert.deepEqual(secretsDansTexte(`const k="${jwtLong({ role: "service_role", ref: REF })}"`), ["jwt service_role"]);
  assert.deepEqual(secretsDansTexte('x="sb_secret_abcdefghijkl"'), ["sb_secret_"]);
});

test("smoke : scripts same-origin et liens vers la Production", () => {
  const html = '<script src="/_next/static/chunks/a.js"></script><script src="https://cdn.example/x.js"></script><a href="https://studio.elsatia.fr/x">p</a><a href="https://studio-preview.elsatia.fr/">q</a>';
  assert.deepEqual(scriptsDePage(html), ["/_next/static/chunks/a.js"]);
  assert.deepEqual(liensProduction(html), ["studio.elsatia.fr"]);
});
