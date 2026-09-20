/**
 * The dedicated Studio Supabase project (apps/studio/supabase) must expose exactly the Studio migrations of the
 * repository, as symbolic links, in strictly increasing unique order. No remote access.
 */
import { lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../", import.meta.url)),
  root = resolve(app, "../.."),
  repo = join(root, "supabase/migrations"),
  dedicated = join(app, "supabase/migrations");
const expected = readdirSync(repo)
  .filter((name) => /^\d{14}_studio_.+\.sql$/.test(name))
  .sort();
const actual = readdirSync(dedicated).sort();
const problems = [];
for (const name of expected)
  if (!actual.includes(name)) problems.push(`missing link: ${name}`);
for (const name of actual) {
  if (!expected.includes(name)) problems.push(`unexpected file: ${name}`);
  else if (!lstatSync(join(dedicated, name)).isSymbolicLink())
    problems.push(`not a symlink: ${name}`);
  else if (
    realpathSync(join(dedicated, name)) !== realpathSync(join(repo, name))
  )
    problems.push(`wrong target: ${name} -> ${readlinkSync(join(dedicated, name))}`);
}
const versions = expected.map((n) => n.split("_")[0]);
if (new Set(versions).size !== versions.length)
  problems.push("duplicate migration version");
if (versions.some((v, i) => i > 0 && v <= versions[i - 1]))
  problems.push("versions are not strictly increasing");
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Studio dedicated project: ${expected.length} migrations linked, ledger independent of Gestion Pro: PASS`);
