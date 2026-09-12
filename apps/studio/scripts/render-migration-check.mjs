/** Fresh disposable runtime only: rollback E, seed a populated D timeline, upgrade E. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const app = fileURLToPath(new URL("../", import.meta.url));
const state = JSON.parse(readFileSync(join(app, ".local-test.json"), "utf8"));
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
if (
  sql("select count(*) from supabase_migrations.schema_migrations") !== "257" ||
  sql("select count(*) from studio_render_jobs") !== "0"
)
  throw Error("Fresh empty render schema required");
const env = Object.fromEntries(
  readFileSync(join(app, ".env.local"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "127.0.0.1")
  throw Error("Local only");
const r = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket/studio-renders`,
  {
    method: "DELETE",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${env.STUDIO_STORAGE_SERVICE_KEY}`,
    },
  },
);
if (!r.ok) throw Error("Empty private bucket deletion failed");
sql(readFileSync(join(app, "scripts/rollback-render-local.sql"), "utf8"));
if (sql("select count(*) from supabase_migrations.schema_migrations") !== "256")
  throw Error("Rollback failed");
let fixture = readFileSync(
  resolve(app, "../../supabase/tests/studio_timeline.test.sql"),
  "utf8",
).split("select is((select count(*) from public.studio_timelines)")[0];
for (let i = 1; i <= 5; i++)
  fixture = fixture.replaceAll(
    `54000000-0000-0000-0000-00000000000${i}`,
    randomUUID(),
  );
fixture = fixture.replaceAll("@example.test", `-${randomUUID()}@example.test`);
sql(fixture + "\ncommit;");
const before = sql(
  "select md5(string_agg(row_to_json(t)::text,'' order by id)) from studio_timelines t;",
);
const log = execFileSync(
  resolve(app, "../../node_modules/.bin/supabase"),
  ["migration", "up", "--local", "--workdir", state.directory],
  { encoding: "utf8", timeout: 120000 },
);
writeFileSync(join(state.directory, "render-reapply.log"), log, {
  mode: 0o600,
});
if (
  sql("select count(*) from supabase_migrations.schema_migrations") !== "257" ||
  sql(
    "select md5(string_agg(row_to_json(t)::text,'' order by id)) from studio_timelines t;",
  ) !== before
)
  throw Error("Upgrade changed D timeline");
console.log(
  "Fresh 257 → rollback 256 → populated Lot D fixture → upgrade/reapply 257: PASS; timeline byte-identical",
);
