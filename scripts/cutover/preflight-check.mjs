#!/usr/bin/env node
/**
 * ELSATIA — Preflight opérateur du cutover Production. LECTURE SEULE.
 *
 * Ne se connecte JAMAIS à Production, n'écrit rien, ne déploie rien.
 * Vérifie seulement que le poste opérateur est en état de conduire le cutover.
 *
 *   node scripts/cutover/preflight-check.mjs
 *   node scripts/cutover/preflight-check.mjs --target 996be15
 *
 * Sortie : tableau de contrôles + code de sortie 0 (GO) / 1 (NO-GO).
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const TARGET = (args[args.indexOf('--target') + 1] || '996be15').replace(/[^0-9a-f]/gi, '');
const ROOT = resolve(import.meta.dirname, '..', '..');
const DISQUE_MINI_GI = 30;
const MIGRATIONS_ATTENDUES = 263;

const res = [];
const add = (code, libelle, ok, detail, bloquant = true) =>
  res.push({ code, libelle, ok, detail, bloquant });

const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const trySh = (cmd) => { try { return sh(cmd); } catch { return null; } };

// --- 1. Outils ---------------------------------------------------------------
// psql/pg_dump/pg_restore sont non bloquants ici : le conteneur Docker Supabase
// les fournit en local. Ils redeviennent OBLIGATOIRES pour opérer sur Production.
const outils = [
  ['git', 'git --version', true],
  ['node', 'node --version', true],
  ['npm', 'npm --version', true],
  ['docker', 'docker --version', true],
  ['openssl', 'openssl version', true],
  ['psql', 'psql --version', false],
  ['pg_dump', 'pg_dump --version', false],
  ['pg_restore', 'pg_restore --version', false],
];
for (const [nom, cmd, bloquant] of outils) {
  const v = trySh(cmd);
  add(`OUT-${nom}`, `outil ${nom}`, !!v, v || 'ABSENT du PATH', bloquant);
}
const sup = trySh('npx --no-install supabase --version');
add('OUT-supabase', 'supabase CLI (local)', !!sup, sup || 'ABSENT', true);
const vercel = trySh('npx --no-install vercel --version');
add('OUT-vercel', 'vercel CLI', !!vercel, vercel || 'absent en local (npx vercel@latest sinon)', false);

// --- 2. Docker actif ---------------------------------------------------------
const dockerUp = trySh('docker info --format "{{.ServerVersion}}"');
add('DOCKER', 'démon Docker actif', !!dockerUp, dockerUp || 'démon injoignable');

// --- 3. Git ------------------------------------------------------------------
const head = trySh('git rev-parse HEAD');
add('GIT-HEAD', 'HEAD résolu', !!head, head || 'n/a', false);
const cibleOk = !!trySh(`git rev-parse --verify --quiet ${TARGET}^{commit}`);
add('GIT-CIBLE', `commit cible ${TARGET} présent`, cibleOk, cibleOk ? trySh(`git log -1 --format=%s ${TARGET}`) : 'introuvable');
const propre = trySh('git status --porcelain');
add('GIT-PROPRE', 'arbre de travail propre', propre === '', propre === '' ? 'aucune modification' : `${propre.split('\n').length} fichier(s) modifié(s)`, false);

// --- 4. Migrations du dépôt --------------------------------------------------
const migDir = resolve(ROOT, 'supabase', 'migrations');
let migs = [];
if (existsSync(migDir)) migs = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
add('MIG-NB', `migrations du dépôt = ${MIGRATIONS_ATTENDUES}`, migs.length === MIGRATIONS_ATTENDUES, `${migs.length} trouvée(s)`);
add('MIG-MAX', 'dernière migration', migs.length > 0, migs.at(-1) || 'aucune', false);

// --- 5. Variables d'environnement (PRÉSENCE seule, jamais les valeurs) -------
const envAttendues = [
  'SUPABASE_DB_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
];
for (const k of envAttendues) {
  add(`ENV-${k}`, `variable ${k}`, !!process.env[k], process.env[k] ? 'définie (valeur non affichée)' : 'non définie dans ce shell', false);
}

// --- 6. Documents de cutover -------------------------------------------------
const docs = [
  'docs/audits/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_V1.md',
  'docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_RUNBOOK_V1.md',
  'docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_GO_NO_GO_V1.md',
  'scripts/cutover/sentinels-pre-migration.sql',
];
for (const d of docs) {
  const p = resolve(ROOT, d);
  add(`DOC-${d.split('/').at(-1)}`, d, existsSync(p), existsSync(p) ? `${statSync(p).size} octets` : 'ABSENT');
}

// --- 7. Espace disque --------------------------------------------------------
let libreGi = null;
try {
  const out = sh('df -k /').split('\n').at(-1).split(/\s+/);
  libreGi = Math.round((Number(out[3]) * 1024) / 1024 ** 3);
} catch { /* ignore */ }
add('DISQUE', `espace libre >= ${DISQUE_MINI_GI} Gi`, libreGi !== null && libreGi >= DISQUE_MINI_GI, libreGi !== null ? `${libreGi} Gi libres` : 'indéterminé');

// --- Rapport -----------------------------------------------------------------
const large = Math.max(...res.map((r) => r.libelle.length));
console.log('\n=== ELSATIA — PREFLIGHT OPERATEUR (lecture seule) ===\n');
for (const r of res) {
  const etat = r.ok ? 'OK  ' : r.bloquant ? 'STOP' : 'WARN';
  console.log(`[${etat}] ${r.libelle.padEnd(large)}  ${r.detail}`);
}
const stops = res.filter((r) => !r.ok && r.bloquant);
const warns = res.filter((r) => !r.ok && !r.bloquant);
console.log(`\n${res.filter((r) => r.ok).length} OK / ${warns.length} WARN / ${stops.length} STOP`);
if (stops.length) {
  console.log('\nVERDICT : NO-GO OPERATEUR — bloquants :');
  for (const s of stops) console.log(`  - ${s.code} : ${s.libelle} (${s.detail})`);
  process.exit(1);
}
console.log('\nVERDICT : GO OPERATEUR (aucun bloquant local).');
