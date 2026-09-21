/** Local H: empty rollback, prior H upgrade gates, and data preservation. */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
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
    { input, encoding: "utf8", timeout: 30000 },
  ).trim();
}
const count = () =>
  sql("select count(*) from supabase_migrations.schema_migrations");
const hash = () =>
  sql(
    "select md5(coalesce((select string_agg(to_jsonb(t)::text,'' order by id) from studio_timelines t),'')||coalesce((select string_agg(snapshot::text,'' order by id) from studio_render_jobs),''))",
  );
if (count() !== "260") throw Error("Fresh H 260 required");
const before = hash();
sql(readFileSync(join(app, "scripts/rollback-analysis-local.sql"), "utf8"));
if (count() !== "259" || hash() !== before)
  throw Error("H rollback changed data");
const migration = join(
  state.directory,
  "supabase/migrations/20260913040000_studio_media_analysis.sql",
);
renameSync(migration, migration + ".held");
try {
  execFileSync(
    process.execPath,
    [join(app, "scripts/editor-migration-check.mjs")],
    { stdio: "inherit" },
  );
} finally {
  renameSync(migration + ".held", migration);
}
const populated = hash();
function up() {
  execFileSync(
    join(root, "node_modules/.bin/supabase"),
    ["migration", "up", "--local", "--workdir", state.directory],
    { stdio: "inherit", timeout: 120000 },
  );
}
up();
if (count() !== "260" || hash() !== populated)
  throw Error("H upgrade changed F data");
sql(readFileSync(join(app, "scripts/rollback-analysis-local.sql"), "utf8"));
up();
if (count() !== "260" || hash() !== populated)
  throw Error("H populated rollback/reapply changed data");
const probeId =
  sql(`insert into studio_media_analysis(workspace_id,project_id,asset_id,requested_by,analysis_version)
 select a.workspace_id,p.project_id,a.id,a.uploaded_by,'media-v999'
 from studio_media_assets a join studio_project_assets p on p.asset_id=a.id
 limit 1 returning id`).split("\n")[0];
if (!/^[0-9a-f-]{36}$/.test(probeId))
  throw Error("Populated rollback fixture missing");
let refused = false;
try {
  sql(readFileSync(join(app, "scripts/rollback-analysis-local.sql"), "utf8"));
} catch (e) {
  refused = String(e.stderr).includes("rollback refused to preserve results");
}
if (
  !refused ||
  count() !== "260" ||
  sql(`select count(*) from studio_media_analysis where id='${probeId}'`) !==
    "1"
)
  throw Error("Populated H rollback did not preserve analysis");
sql(`delete from studio_media_analysis where id='${probeId}'`);
writeFileSync(
  join(state.directory, "analysis-migration-evidence.json"),
  JSON.stringify({
    fresh: 260,
    rollback: 259,
    reapplied: 260,
    populatedGUnchanged: true,
    populatedAnalysisRollbackRefused: true,
  }),
);
console.log(
  "H fresh 260 / A-G gates / populated upgrade / empty rollback-reapply: PASS",
);
