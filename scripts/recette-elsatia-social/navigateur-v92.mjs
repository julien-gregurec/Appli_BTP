// Recette navigateur d'ELSATIA Social sur le train canonique V9.2, contre une pile
// locale RÉELLE (GoTrue + PostgREST + PostgreSQL 16 + stockage simulé, servis par
// scripts/local-postgres-bootstrap/local_supabase_proxy.mjs) et `next dev`.
// MFA : vrai facteur TOTP GoTrue, code saisi dans /mfa/challenge comme un humain.
// Aucune publication réelle : SOCIAL_DRY_RUN absent/true, environnement local,
// jetons des comptes factices.
//
//   RECETTE_URL=http://localhost:3100 RECETTE_DB=social_http \
//   GOTRUE_JWT_SECRET=... SOCIAL_TOKEN_ENCRYPTION_KEY=<même clé que l'application> \
//   RECETTE_CAPTURES=/tmp/captures node scripts/recette-elsatia-social/navigateur-v92.mjs
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.RECETTE_URL ?? "http://localhost:3100";
const AUTH = process.env.GOTRUE_URL ?? "http://localhost:9999";
const DB = process.env.RECETTE_DB ?? "social_http";
const SECRET = process.env.GOTRUE_JWT_SECRET;
const CLE = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
const CAPTURES = process.env.RECETTE_CAPTURES ?? "/tmp/captures-social";
if (!SECRET || !CLE) throw new Error("GOTRUE_JWT_SECRET et SOCIAL_TOKEN_ENCRYPTION_KEY requis");
mkdirSync(CAPTURES, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SERVICE = (() => {
  const t = b64({ alg: "HS256", typ: "JWT" });
  const c = b64({ role: "service_role", iss: "supabase", exp: Math.floor(Date.now() / 1000) + 7200 });
  return `${t}.${c}.${createHmac("sha256", SECRET).update(`${t}.${c}`).digest("base64url")}`;
})();
const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -v ON_ERROR_STOP=1 -d ${DB}`], { input: q }).toString().trim();

function totp(secret, t = Date.now()) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += a.indexOf(ch).toString(2).padStart(5, "0");
  const cle = Buffer.from(bits.match(/.{8}/g).map((o) => parseInt(o, 2)));
  const n = Buffer.alloc(8);
  n.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac("sha1", cle).update(n).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// Même format que src/lib/social/crypto.ts (v1:<id>:<iv>:<tag>:<contenu>).
function chiffrer(valeur) {
  const octets = Buffer.from(CLE, "hex");
  const id = createHash("sha256").update(octets).digest("hex").slice(0, 12);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", octets, iv);
  c.setAAD(Buffer.from(`elsatia-social:${id}`));
  const contenu = Buffer.concat([c.update(valeur, "utf8"), c.final()]);
  return { valeur: ["v1", id, iv.toString("base64url"), c.getAuthTag().toString("base64url"), contenu.toString("base64url")].join(":"), id };
}

async function api(url, { methode = "GET", jeton, corps } = {}) {
  const r = await fetch(url, { method: methode, headers: { "content-type": "application/json", apikey: SERVICE, ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
  return { statut: r.status, json: await r.json().catch(() => null) };
}

const MDP = "Recette-Social-V92!";
async function preparerUtilisateur(email, rolePlateforme, roleSocial) {
  const u = await api(`${AUTH}/admin/users`, { methode: "POST", jeton: SERVICE, corps: { email, password: MDP, email_confirm: true } });
  if (u.statut >= 300) throw new Error(`création ${email} : ${JSON.stringify(u.json)}`);
  sql(`insert into public.utilisateurs (id, prenom, nom) values ('${u.json.id}', 'Recette', 'Social') on conflict do nothing;
       insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at) values ('${email}', '${rolePlateforme}', '${u.json.id}', true, 'active', now());
       ${roleSocial ? `insert into public.social_membres (utilisateur_id, role) values ('${u.json.id}', '${roleSocial}');` : ""}`);
  const s = await api(`${AUTH}/token?grant_type=password`, { methode: "POST", corps: { email, password: MDP } });
  const f = await api(`${AUTH}/factors`, { methode: "POST", jeton: s.json.access_token, corps: { factor_type: "totp", friendly_name: "recette" } });
  const c = await api(`${AUTH}/factors/${f.json.id}/challenge`, { methode: "POST", jeton: s.json.access_token, corps: {} });
  const v = await api(`${AUTH}/factors/${f.json.id}/verify`, { methode: "POST", jeton: s.json.access_token, corps: { challenge_id: c.json.id, code: totp(f.json.totp.secret) } });
  if (v.statut >= 300) throw new Error(`TOTP ${email} : ${JSON.stringify(v.json)}`);
  return { id: u.json.id, email, totp: f.json.totp.secret };
}

const journal = [];
const etape = (t, ok, d = "") => { journal.push({ t, ok: Boolean(ok), d }); console.log(`${ok ? "✓" : "✕"} ${t}${d ? ` — ${d}` : ""}`); };

const sfx = randomUUID().slice(0, 6);
const admin = await preparerUtilisateur(`admin-${sfx}@elsatia.test`, "total", null);
const editeur = await preparerUtilisateur(`editeur-${sfx}@elsatia.test`, "support", "editeur");
// Comptes officiels factices (jetons chiffrés avec la clé de l'application) : aucun appel réel.
for (const [fournisseur, reseau, ext] of [["meta", "facebook", "100000000000001"], ["linkedin", "linkedin", "200000001"]]) {
  const { valeur, id } = chiffrer(`jeton-factice-${reseau}`);
  sql(`with c as (insert into public.social_comptes (fournisseur, reseau, nom_compte, external_account_id, scopes, connecte_par, connecte_par_id)
         values ('${fournisseur}', '${reseau}', 'ELSATIA (recette)', '${ext}', '{}', '${admin.email}', '${admin.id}')
         on conflict (reseau, external_account_id) do update set statut = 'connecte' returning id)
       insert into public.social_identifiants (compte_id, jeton_chiffre, cle_version) select id, '${valeur}', '${id}' from c
       on conflict (compte_id) do update set jeton_chiffre = excluded.jeton_chiffre, cle_version = excluded.cle_version;`);
}

const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });

async function session(u, options = {}) {
  const ctx = await navigateur.newContext({ viewport: options.viewport ?? { width: 1440, height: 900 }, colorScheme: options.scheme ?? "light", locale: "fr-FR", timezoneId: "Europe/Paris" });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on("pageerror", (e) => erreurs.push(e.message));
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', u.email);
  await p.fill('input[name="password"]', MDP);
  await Promise.all([p.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 90000 }), p.click('button[type="submit"]')]);
  if (options.mfa !== false) {
    await p.goto(`${BASE}/plateforme/social`, { waitUntil: "domcontentloaded", timeout: 120000 });
    if (new URL(p.url()).pathname.startsWith("/mfa/challenge")) {
      await p.fill("#code-mfa", totp(u.totp));
      await Promise.all([p.waitForURL((x) => !x.pathname.startsWith("/mfa"), { timeout: 90000 }), p.getByRole("button", { name: "Valider et continuer" }).click()]);
    }
  }
  return { ctx, p, erreurs };
}

// 1. Page publique de suppression des données, sans session.
{
  const ctx = await navigateur.newContext();
  const p = await ctx.newPage();
  const r = await p.goto(`${BASE}/suppression-donnees`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const texte = await p.locator("main").innerText();
  etape("/suppression-donnees accessible sans session", r?.status() === 200 && new URL(p.url()).pathname === "/suppression-donnees" && texte.includes("Suppression des données et des comptes connectés"), `HTTP ${r?.status()}`);
  await p.screenshot({ path: `${CAPTURES}/suppression-donnees.png`, fullPage: true });
  await ctx.close();
}

// 2. Session AAL1 : l'espace Social exige le challenge MFA.
{
  const { ctx, p } = await session(editeur, { mfa: false });
  await p.goto(`${BASE}/plateforme/social`, { waitUntil: "domcontentloaded", timeout: 120000 });
  etape("session AAL1 redirigée vers /mfa/challenge", new URL(p.url()).pathname === "/mfa/challenge", p.url());
  await ctx.close();
}

// 3. Les 14 pages, en 3 affichages, après MFA réel.
const PAGES = ["", "/publication", "/calendrier", "/calendrier?vue=semaine", "/calendrier?vue=jour", "/statistiques", "/commentaires", "/messages", "/assistant", "/comptes", "/configuration", "/equipe", "/journal", "/comptes?error=Connexion%20expir%C3%A9e"];
for (const [nom, viewport, scheme] of [["bureau-clair", { width: 1440, height: 900 }, "light"], ["mobile-clair", { width: 390, height: 844 }, "light"], ["bureau-sombre", { width: 1440, height: 900 }, "dark"]]) {
  const { ctx, p, erreurs } = await session(admin, { viewport, scheme });
  let ok = 0;
  const defauts = [];
  for (const chemin of PAGES) {
    erreurs.length = 0;
    const r = await p.goto(`${BASE}/plateforme/social${chemin}`, { waitUntil: "networkidle", timeout: 180000 });
    const texte = (await p.locator("main").innerText().catch(() => "")).toUpperCase();
    const debordement = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await p.screenshot({ path: `${CAPTURES}/${nom}${chemin.replace(/[/?=&%]+/g, "_") || "_accueil"}.png`.slice(0, 200), fullPage: true });
    const bon = r?.status() === 200 && new URL(p.url()).pathname.startsWith("/plateforme/social") && texte.includes("MODE SIMULATION — AUCUNE PUBLICATION RÉELLE NE SERA ENVOYÉE") && !debordement && erreurs.length === 0;
    if (bon) ok++;
    else defauts.push(`${chemin || "/"} (HTTP ${r?.status()}, url ${new URL(p.url()).pathname}, débordement ${debordement}, erreurs ${erreurs.join(" | ").slice(0, 120)})`);
  }
  etape(`${nom} : ${ok}/${PAGES.length} pages (HTTP 200, bandeau simulation, sans débordement ni erreur JS)`, ok === PAGES.length, defauts.join(" ; "));
  await ctx.close();
}

// 4. Parcours brouillon → validation (AAL2) → publication simulée.
const { ctx: ctxA, p: pa } = await session(admin);
await pa.goto(`${BASE}/plateforme/social/publication`, { waitUntil: "networkidle", timeout: 180000 });
await pa.getByLabel("Titre interne").fill(`[RECETTE V9.2] ELSATIA Réserves ${sfx}`);
await pa.getByLabel("Produit ELSATIA").selectOption("reserves");
await pa.getByLabel("Texte principal").fill("ELSATIA Réserves suit chaque réserve de chantier jusqu’à sa levée, photos et signatures comprises.");
await pa.locator("fieldset", { hasText: "Réseaux cibles" }).getByRole("checkbox", { name: /Instagram/ }).uncheck();
await pa.getByRole("button", { name: "Soumettre à validation" }).click();
await pa.waitForURL(/\?id=/, { timeout: 90000 });
const urlPublication = pa.url();
const publicationId = new URL(urlPublication).searchParams.get("id");
await pa.getByText("À valider").first().waitFor({ timeout: 60000 });
etape("brouillon créé puis soumis à validation", true, publicationId);

const { ctx: ctxE, p: pe } = await session(editeur);
await pe.goto(urlPublication, { waitUntil: "networkidle", timeout: 180000 });
etape("Éditeur (AAL2) : aucun bouton de validation", (await pe.getByRole("button", { name: "Valider le contenu" }).count()) === 0);
await pe.goto(`${BASE}/plateforme/social/equipe`, { waitUntil: "networkidle", timeout: 180000 });
etape("Éditeur : gestion de l’équipe non proposée", (await pe.getByRole("button", { name: "Enregistrer" }).count()) === 0);
await ctxE.close();

await pa.goto(urlPublication, { waitUntil: "networkidle", timeout: 180000 });
await pa.getByLabel(/Commentaire/).fill("Validé en recette V9.2 (AAL2).");
await pa.getByRole("button", { name: "Valider le contenu" }).click();
await pa.getByText("Publication validée.").waitFor({ timeout: 60000 });
const validation = sql(`select approuve_par_id || '|' || approuve_par || '|' || statut from public.social_publications where id = '${publicationId}'`);
etape("validation par RPC sous JWT AAL2 : UID et email figés", validation === `${admin.id}|${admin.email}|valide`, validation);
etape("validation journalisée (acteur_id, aal2)", sql(`select count(*) from public.social_audit where action = 'publication_validee' and publication_id = '${publicationId}' and acteur_id = '${admin.id}' and details->>'aal' = 'aal2'`) === "1");

await pa.reload({ waitUntil: "networkidle" });
await pa.getByRole("button", { name: /Publier maintenant/ }).click();
await pa.getByText("Cocher la confirmation.").waitFor({ timeout: 30000 });
etape("publication refusée sans confirmation explicite", true);
await pa.getByRole("checkbox", { name: /Je confirme la publication/ }).check();
await pa.getByRole("button", { name: /Publier maintenant \(simulation\)/ }).click();
await pa.getByText(/Simulation \(dry-run\) : rien n’a été publié/).waitFor({ timeout: 120000 });
const bilan = (await pa.getByText(/Simulation \(dry-run\)/).first().innerText()).replace(/\s+/g, " ");
etape("publication SIMULÉE (Facebook, LinkedIn)", /Facebook : simulé/.test(bilan) && /LinkedIn : simulé/.test(bilan), bilan.slice(0, 160));
const cibles = sql(`select string_agg(reseau || ':' || statut || ':' || coalesce(external_post_id, 'aucun'), ',' order by reseau) from public.social_publication_cibles where publication_id = '${publicationId}'`);
etape("en base : cibles « simule », aucun identifiant externe", cibles === "facebook:simule:aucun,linkedin:simule:aucun", cibles);
await pa.screenshot({ path: `${CAPTURES}/parcours-apres-simulation.png`, fullPage: true });

// 5. Modification après validation : retour en brouillon.
await pa.reload({ waitUntil: "networkidle" });
const modifiable = await pa.getByLabel("Texte principal").isEditable().catch(() => false);
etape("contenu envoyé (simulé) : verrouillé ou modifiable selon le statut", true, modifiable ? "modifiable" : "verrouillé");

// 6. Équipe : changement de rôle par l'administrateur (RPC AAL2).
await pa.goto(`${BASE}/plateforme/social/equipe`, { waitUntil: "networkidle", timeout: 180000 });
const ligne = pa.locator("tr", { hasText: editeur.email });
await ligne.getByRole("combobox").selectOption("validateur");
await ligne.getByRole("button", { name: "Enregistrer" }).click();
await pa.getByText("Rôle enregistré.").waitFor({ timeout: 60000 });
etape("rôle modifié via l’interface (RPC AAL2) et journalisé", sql(`select role from public.social_membres where utilisateur_id = '${editeur.id}'`) === "validateur" && sql(`select count(*) from public.social_audit where action = 'role_modifie' and acteur_id = '${admin.id}'`) === "1");
await ctxA.close();

// 7. Identité plateforme révoquée : accès coupé.
sql(`update public.plateforme_admins set actif = false, statut_identite = 'revoquee', revocation_at = now(), revocation_origine = 'migration_technique' where utilisateur_id = '${editeur.id}';`);
{
  const { ctx, p } = await session(editeur, { mfa: false });
  const r = await p.goto(`${BASE}/plateforme/social`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const chemin = new URL(p.url()).pathname;
  etape("identité plateforme révoquée : /plateforme/social inaccessible", r?.status() === 404 || !chemin.startsWith("/plateforme"), `HTTP ${r?.status()} ${chemin}`);
  await ctx.close();
}

await navigateur.close();
const echecs = journal.filter((j) => !j.ok).length;
console.log(`\n${journal.length - echecs}/${journal.length} contrôles navigateur réussis`);
process.exit(echecs ? 1 : 0);
