/** Disposable fresh F only. Reject rollback if any F data exists, preserve populated E snapshots. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const app = fileURLToPath(new URL("../", import.meta.url)),
  root = resolve(app, "../.."),
  state = JSON.parse(readFileSync(join(app, ".local-test.json"), "utf8"));
if (
  !state.directory.startsWith(join(tmpdir(), "elsatia-studio-a-")) ||
  !/^elsatia-studio-a-[a-z0-9]+$/.test(state.projectId)
)
  throw Error("Disposable runtime required");
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
if (sql("select count(*) from supabase_migrations.schema_migrations") !== "258")
  throw Error("Fresh F required");
sql(readFileSync(join(app, "scripts/rollback-templates-local.sql"), "utf8"));
if (sql("select count(*) from supabase_migrations.schema_migrations") !== "257")
  throw Error("F rollback failed");
// Earlier E rollback/upgrade gate is still checked at its intended 257 schema.
// F file is temporarily absent from the disposable migration directory only.
const f = join(
  state.directory,
  "supabase/migrations/20260913020000_studio_templates.sql",
);
const { renameSync } = await import("node:fs");
renameSync(f, f + ".held");
try {
  execFileSync(
    process.execPath,
    [join(app, "scripts/render-migration-check.mjs")],
    { stdio: "inherit" },
  );
} finally {
  renameSync(f + ".held", f);
}
let fixture = readFileSync(
  join(root, "supabase/tests/studio_render_engine.test.sql"),
  "utf8",
).split("select is(public.studio_request_render")[0];
for (let i = 1; i <= 5; i++)
  fixture = fixture.replaceAll(
    `54000000-0000-0000-0000-00000000000${i}`,
    randomUUID(),
  );
fixture = fixture.replaceAll("@example.test", `-${randomUUID()}@example.test`);
sql(fixture + "\ncommit;");
const hash = () =>
  sql(
    "select md5(coalesce(string_agg(snapshot::text,'' order by id),'')) from studio_render_jobs;",
  );
const before = hash();
const timelines = () =>
  sql(
    "select md5(string_agg((to_jsonb(t)-'presentation')::text,'' order by id)) from studio_timelines t",
  );
const timelineBefore = timelines();
execFileSync(
  join(root, "node_modules/.bin/supabase"),
  ["migration", "up", "--local", "--workdir", state.directory],
  { stdio: "inherit", timeout: 120000 },
);
if (
  sql("select count(*) from supabase_migrations.schema_migrations") !== "258" ||
  hash() !== before ||
  timelines() !== timelineBefore
)
  throw Error("F upgrade changed E data");
sql(readFileSync(join(app, "scripts/rollback-templates-local.sql"), "utf8"));
execFileSync(
  join(root, "node_modules/.bin/supabase"),
  ["migration", "up", "--local", "--workdir", state.directory],
  { stdio: "inherit", timeout: 120000 },
);
if (hash() !== before || timelines() !== timelineBefore)
  throw Error("F reapply changed E data");
writeFileSync(
  join(state.directory, "templates-migration-evidence.json"),
  JSON.stringify({
    fresh: 258,
    rollback: 257,
    reapplied: 258,
    immutableRenderSnapshot: true,
    unchangedTimeline: true,
  }),
);
console.log(
  "F fresh 258 / rollback 257 / E rollback-upgrade / populated E upgrade 258 / F rollback-reapply: PASS",
);
