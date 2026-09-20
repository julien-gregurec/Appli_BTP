/**
 * Post-H lots on a disposable H-baseline stack (`local-test.mjs setup --lot-h`): upgrade every post-H
 * migration on top of populated Lot H data, roll each back in reverse order, then reapply all of them.
 * Timelines and render snapshots must stay byte-identical throughout. Local disposable runtime only.
 */
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const app = fileURLToPath(new URL("../", import.meta.url)),
  root = resolve(app, "../..");
const state = JSON.parse(readFileSync(join(app, ".local-test.json"), "utf8"));
if (
  !state.directory.startsWith(join(tmpdir(), "elsatia-studio-a-")) ||
  !/^elsatia-studio-a-[a-z0-9]+$/.test(state.projectId)
)
  throw Error("Disposable local runtime required");
function sql(input) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${state.projectId}`,
      "psql",
      "-XAt",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8", timeout: 60000 },
  ).trim();
}
const count = () =>
  Number(sql("select count(*) from supabase_migrations.schema_migrations"));
const hash = () =>
  sql(
    "select md5(coalesce((select string_agg(to_jsonb(t)::text,'' order by id) from studio_timelines t),'')||coalesce((select string_agg(snapshot::text,'' order by id) from studio_render_jobs),'')||coalesce((select string_agg(to_jsonb(a)::text,'' order by id) from studio_media_assets a),''))",
  );
const postH = readdirSync(join(root, "supabase/migrations"))
  .filter((name) => /^2026092\d{7,}_studio_.+\.sql$/.test(name))
  .sort();
const versions = postH.map((name) => name.split("_")[0]);
if (!postH.length) throw Error("No post-H migration found");
if (count() !== 260) throw Error("Fresh H baseline (260) required");
for (const name of postH)
  if (existsSync(join(state.directory, "supabase/migrations", name)))
    throw Error("Post-H migration already present: use --lot-h baseline");
function up() {
  for (const name of postH)
    copyFileSync(
      join(root, "supabase/migrations", name),
      join(state.directory, "supabase/migrations", name),
    );
  execFileSync(
    join(root, "node_modules/.bin/supabase"),
    ["migration", "up", "--local", "--workdir", state.directory],
    { stdio: "inherit", timeout: 180000 },
  );
}
const before = hash();
up();
if (count() !== 260 + postH.length || hash() !== before)
  throw Error("Post-H upgrade changed H data or count");
for (const [index, version] of [...versions.entries()].reverse()) {
  const rollback = join(app, "scripts/rollback-post-h", `${version}.sql`);
  if (!existsSync(rollback)) throw Error(`Rollback missing for ${version}`);
  sql(readFileSync(rollback, "utf8"));
  if (count() !== 260 + index || hash() !== before)
    throw Error(`Rollback of ${version} changed data or count`);
}
if (count() !== 260) throw Error("Rollbacks did not return to H");
up();
if (count() !== 260 + postH.length || hash() !== before)
  throw Error("Post-H reapply changed data or count");
writeFileSync(
  join(state.directory, "post-h-migration-evidence.json"),
  JSON.stringify({
    baseline: 260,
    migrations: versions,
    upgraded: 260 + postH.length,
    rolledBackTo: 260,
    reapplied: 260 + postH.length,
    dataUnchanged: true,
  }),
);
console.log(
  `Post-H ${versions.join(", ")}: upgrade / reverse rollback / reapply on H data: PASS`,
);
