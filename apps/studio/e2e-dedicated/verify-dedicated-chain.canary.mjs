#!/usr/bin/env node
// Preuve que la garde CI verify-dedicated-chain.mjs ÉCHOUE vraiment (tests canaris, base du banc).
// Chaque cas introduit un défaut, vérifie le code de sortie 1 et le message attendu, puis l'annule.
//   K1  une migration GP apparaît dans apps/studio/supabase/migrations
//   K2  une migration Studio est oubliée (fichier présent, jamais appliqué)
//   K3  une RPC non classée apparaît (exécutable par authenticated)
//   K4  une table GP apparaît dans le projet dédié
//   K5  une fonction « service_role » devient exécutable par authenticated
// Usage : node verify-dedicated-chain.canary.mjs --db postgres://postgres@127.0.0.1:56433/postgres
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../..");
const argv = process.argv.slice(2);
const db = argv[argv.indexOf("--db") + 1];
if (!db || !/@(127\.0\.0\.1|localhost)[:/]/.test(db)) {
  console.error("--db (base locale du banc) requis");
  process.exit(2);
}
const sql = (q) => execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", db, "-c", q], { encoding: "utf8" });
const verify = () => spawnSync(process.execPath, [join(import.meta.dirname, "verify-dedicated-chain.mjs"), "--db", db], { encoding: "utf8" });
const dir = join(ROOT, "apps/studio/supabase/migrations");

let failures = 0;
function expectFailure(name, pattern, arrange, restore) {
  try {
    arrange();
    const r = verify();
    const out = `${r.stdout}\n${r.stderr}`;
    const ok = r.status === 1 && pattern.test(out);
    console.log(`${ok ? "ok" : "ÉCHEC"}  ${name}${ok ? "" : ` (code ${r.status})\n${out}`}`);
    if (!ok) failures++;
  } finally {
    restore();
  }
}

const baseline = verify();
if (baseline.status !== 0) {
  console.error(`La base n'est pas conforme avant les canaris :\n${baseline.stdout}${baseline.stderr}`);
  process.exit(1);
}

const gp = readdirSync(join(ROOT, "supabase/migrations")).find((n) => !/_studio_/.test(n) && n.endsWith(".sql"));
expectFailure(
  "K1 migration GP ajoutée à la chaîne dédiée",
  /C1 .*non classée|C3 .*non Studio/,
  () => copyFileSync(join(ROOT, "supabase/migrations", gp), join(dir, gp)),
  () => rmSync(join(dir, gp), { force: true }),
);
const forgotten = "20991231235959_studio_canary_forgotten.sql";
expectFailure(
  "K2 migration Studio oubliée (non appliquée, non classée)",
  /C2 .*migration\(s\) appliquée\(s\) pour|C1 .*non classée/,
  () => writeFileSync(join(dir, forgotten), "select 1;\n"),
  () => rmSync(join(dir, forgotten), { force: true }),
);
expectFailure(
  "K3 RPC non classée exécutable par authenticated",
  /C5 RPC non classée\(s\) : studio_canary_unclassified/,
  () => sql("create function public.studio_canary_unclassified() returns int language sql as 'select 1'; grant execute on function public.studio_canary_unclassified() to authenticated;"),
  () => sql("drop function if exists public.studio_canary_unclassified()"),
);
expectFailure(
  "K4 table GP dans le projet dédié",
  /C4 .*entreprises/,
  () => sql("create table public.entreprises(id int)"),
  () => sql("drop table if exists public.entreprises"),
);
const lifecycle = "public.studio_identity_apply_lifecycle(uuid, text, bigint, text, text, boolean, boolean, text, timestamptz)";
expectFailure(
  "K5 fonction service_role ouverte à authenticated",
  /C5 studio_identity_apply_lifecycle \(identity_bridge\) exécutable par authenticated/,
  () => sql(`grant execute on function ${lifecycle} to authenticated`),
  () => sql(`revoke execute on function ${lifecycle} from authenticated`),
);

const after = verify();
if (after.status !== 0) {
  console.error(`La base n'est plus conforme après les canaris :\n${after.stdout}${after.stderr}`);
  process.exit(1);
}
console.log(failures ? `ÉCHEC : ${failures} canari(s) non détecté(s)` : "OK : les 5 défauts sont détectés, base restaurée");
process.exit(failures ? 1 : 0);
