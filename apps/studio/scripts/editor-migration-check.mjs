/** Local G adapters: rollback without data loss, then all historical E/F upgrade gates. */
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
if (count() !== "259") throw Error("Fresh G 259 required");
const before = hash();
sql(readFileSync(join(app, "scripts/rollback-editor-local.sql"), "utf8"));
if (count() !== "258" || hash() !== before)
  throw Error("G rollback changed data");
const migration = join(
  state.directory,
  "supabase/migrations/20260913030000_studio_editor_transactions.sql",
);
renameSync(migration, migration + ".held");
try {
  execFileSync(
    process.execPath,
    [join(app, "scripts/templates-migration-check.mjs")],
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
if (count() !== "259" || hash() !== populated)
  throw Error("G upgrade changed F data");
sql(readFileSync(join(app, "scripts/rollback-editor-local.sql"), "utf8"));
up();
if (count() !== "259" || hash() !== populated)
  throw Error("G populated rollback/reapply changed data");
writeFileSync(
  join(state.directory, "editor-migration-evidence.json"),
  JSON.stringify({
    fresh: 259,
    rollback: 258,
    reapplied: 259,
    populatedFUnchanged: true,
  }),
);
console.log(
  "G fresh 259 / A-F gates / populated upgrade / non-destructive rollback-reapply: PASS",
);
