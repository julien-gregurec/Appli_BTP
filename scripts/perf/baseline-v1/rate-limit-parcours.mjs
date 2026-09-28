/*
 * ELSATIA — Baseline performance V1 : la limite de débit casse-t-elle un parcours NORMAL ?
 *
 * Gestion Pro compilé (`next start`) derrière le vrai proxy Next (limiteur `consommer_rate_limit`
 * en base, clé HMAC locale). Scénarios, tous des usages ordinaires :
 *   A. arrivée au bureau : N salariés d'une même entreprise se connectent en quelques minutes
 *      derrière la MÊME IP publique (box / NAT d'agence) — POST /login ;
 *   B. ouverture de « Photos & documents » d'un chantier dont la conversation porte 80 photos :
 *      la page, puis une requête par vignette, comme le navigateur (`<img src=/api/messagerie/…>`) ;
 *   C. navigation soutenue d'un utilisateur : 120 pages en ~1 min ;
 *   D. 25 utilisateurs simultanés, 20 pages chacun.
 * Sortie : nombre de réponses 429 par scénario (attendu : 0 pour un parcours normal).
 *
 * Usage : node rate-limit-parcours.mjs --app … --supabase … --anon … --password … --chantier <id> [--salaries 15]
 */
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => { if (v.startsWith("--")) acc.push([v.slice(2), a[i + 1]]); return acc; }, []));
const APP = args.app; const SUPA = args.supabase; const ANON = args.anon; const PASSWORD = args.password;
const ref = new URL(SUPA).hostname.split(".")[0];
const ipUnique = () => `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

async function cookie(email) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const s = await r.json();
  const v = "base64-" + Buffer.from(JSON.stringify(s)).toString("base64url");
  const nom = `sb-${ref}-auth-token`;
  if (v.length <= 3180) return `${nom}=${v}`;
  const m = []; for (let i = 0; i * 3180 < v.length; i++) m.push(`${nom}.${i}=${v.slice(i * 3180, (i + 1) * 3180)}`);
  return m.join("; ");
}
const compter = (statuts) => statuts.reduce((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});

// A. Connexions depuis une IP partagée.
const ipBureau = ipUnique();
const nbSalaries = Number(args.salaries ?? 15);
const statutsA = [];
for (let i = 1; i <= nbSalaries; i++) {
  const form = new FormData(); form.set("email", `fixture.principale.${i}@perf.invalid`); form.set("password", PASSWORD);
  const r = await fetch(`${APP}/login`, { method: "POST", body: form, redirect: "manual", headers: { "x-forwarded-for": ipBureau } });
  statutsA.push(r.status);
}
console.log(`A. ${nbSalaries} connexions depuis une même IP : ${JSON.stringify(compter(statutsA))} → 429 à partir de la tentative n°${statutsA.indexOf(429) + 1 || "—"}`);

// B. Page Photos & documents + une requête par vignette.
const c1 = await cookie("fixture.principale.2@perf.invalid");
const ipB = ipUnique();
const page = await fetch(`${APP}/chantiers/${args.chantier}/documents`, { headers: { cookie: c1, "x-forwarded-for": ipB }, redirect: "manual" });
const html = await page.text();
const vignettes = [...new Set([...html.matchAll(/\/api\/messagerie\/pieces-jointes\/([0-9a-f-]{36})(?!\?download)/g)].map((m) => m[1]))];
const statutsB = await Promise.all(vignettes.map((id) => fetch(`${APP}/api/messagerie/pieces-jointes/${id}`, { headers: { cookie: c1, "x-forwarded-for": ipB }, redirect: "manual" }).then((r) => r.status)));
console.log(`B. page ${page.status}, ${vignettes.length} vignettes demandées : ${JSON.stringify(compter(statutsB))} (302/503 = servie ou objet absent en local ; 429 = bloquée par la limite)`);

// C. Navigation soutenue d'un utilisateur.
const c3 = await cookie("fixture.principale.3@perf.invalid");
const pages = ["/dashboard", "/chantiers", "/devis", "/factures", "/planning", "/pointage", "/clients", "/employes"];
const statutsC = [];
const debutC = Date.now();
for (let k = 0; k < 120; k++) statutsC.push((await fetch(APP + pages[k % pages.length], { headers: { cookie: c3, "x-forwarded-for": ipUnique() }, redirect: "manual" })).status);
console.log(`C. 120 pages en ${((Date.now() - debutC) / 1000).toFixed(1)} s : ${JSON.stringify(compter(statutsC))}`);

// D. 25 utilisateurs simultanés.
const statutsD = (await Promise.all(Array.from({ length: 25 }, async (_, u) => {
  const c = await cookie(`fixture.principale.${1 + (u % 20)}@perf.invalid`);
  const s = [];
  for (let k = 0; k < 20; k++) s.push((await fetch(APP + pages[(k + u) % pages.length], { headers: { cookie: c, "x-forwarded-for": "203.0.113.10" }, redirect: "manual" })).status);
  return s;
}))).flat();
console.log(`D. 25 utilisateurs × 20 pages (même IP) : ${JSON.stringify(compter(statutsD))}`);
