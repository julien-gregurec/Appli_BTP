/** Destructive rollback qualification restricted to the registered, empty Studio fixture schema. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
const app = fileURLToPath(new URL("../", import.meta.url));
const state = JSON.parse(readFileSync(join(app, ".local-test.json"), "utf8"));
if (
  !state.directory.startsWith(join(tmpdir(), "elsatia-studio-a-")) ||
  !/^elsatia-studio-a-[a-z0-9]+$/.test(state.projectId)
)
  throw Error("Not a disposable Studio database");
const config = readFileSync(
  join(state.directory, "supabase/config.toml"),
  "utf8",
);
if (!config.includes(`project_id = "${state.projectId}"`))
  throw Error("Local project mismatch");
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
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8", timeout: 30000 },
  ).trim();
}
const count = () =>
  Number(sql("select count(*) from supabase_migrations.schema_migrations;"));
if (count() !== 256) throw Error("Expected fresh 256-migration state");
const before = sql(
  "select count(*)||':'||(select count(*) from public.studio_media_assets) from public.studio_projects;",
);
sql(readFileSync(join(app, "scripts/rollback-timeline-local.sql"), "utf8"));
if (
  count() !== 255 ||
  sql("select to_regclass('public.studio_timelines') is null;") !== "t"
)
  throw Error("Rollback failed");
const result = spawnSync(
  resolve(app, "../../node_modules/.bin/supabase"),
  ["migration", "up", "--local", "--workdir", state.directory],
  { encoding: "utf8", timeout: 120000 },
);
writeFileSync(
  join(state.directory, "timeline-reapply.log"),
  `${result.stdout}\n${result.stderr}`,
  { mode: 0o600 },
);
if (result.status !== 0 || count() !== 256)
  throw Error("Reapply failed: inspect local timeline-reapply.log");
const after = sql(
  "select count(*)||':'||(select count(*) from public.studio_media_assets) from public.studio_projects;",
);
if (before !== after) throw Error("Existing project/media counts changed");
console.log(
  "Fresh 256 → rollback 255 → reapply 256: PASS; project/media counts preserved",
);
