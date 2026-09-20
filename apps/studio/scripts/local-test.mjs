/** Disposable Supabase test harness. Never links to or resets a remote project. */
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  existsSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const app = fileURLToPath(new URL("../", import.meta.url));
const root = resolve(app, "../..");
const statePath = join(app, ".local-test.json");
const cli = join(root, "node_modules/.bin/supabase");
// --studio-only: the dedicated Studio Supabase project (own config, templates and Studio-only migrations),
// proving that Studio installs on an empty project with a ledger independent of Gestion Pro.
const studioOnly = process.argv.includes("--studio-only");
const source = studioOnly ? join(app, "supabase") : join(root, "supabase");
function run(args, logName, dir) {
  const result = spawnSync(cli, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (logName)
    writeFileSync(
      join(dir, logName),
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      { mode: 0o600 },
    );
  if (result.status !== 0)
    throw new Error(
      `Local Supabase command failed. Inspect ${join(dir, logName ?? "")}.`,
    );
  return result.stdout;
}
function state() {
  const value = JSON.parse(readFileSync(statePath, "utf8"));
  if (
    typeof value.directory !== "string" ||
    !value.directory.startsWith(join(tmpdir(), "elsatia-studio-a-"))
  )
    throw new Error("Invalid disposable test directory.");
  const config = readFileSync(
    join(value.directory, "supabase/config.toml"),
    "utf8",
  );
  if (!config.includes('project_id = "elsatia-studio-a-'))
    throw new Error("Not a Studio disposable project.");
  return value;
}
// Registration is closed by default (table studio_signup_policy, enforced by the Auth hook and by
// studio_create_workspace). The E2E fixtures create accounts through auth.signUp directly and the pgTAP fixtures
// insert users then call studio_create_workspace, so this DISPOSABLE stack opens the policy explicitly;
// nothing here bypasses the gate and no other environment is touched.
function openDisposableSignupPolicy(projectId) {
  const opened = spawnSync(
    "docker",
    [
      "exec",
      `supabase_db_${projectId}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      // Historical --lot-x baselines are built without the policy table.
      "do $$ begin if to_regclass('public.studio_signup_policy') is not null then update public.studio_signup_policy set mode='open', updated_at=now(); end if; end $$",
    ],
    { encoding: "utf8" },
  );
  if (opened.status !== 0)
    throw new Error(
      `Could not open the disposable signup policy: ${opened.stderr ?? ""}`,
    );
}
const action = process.argv[2];
if (action === "setup") {
  if (existsSync(statePath))
    throw new Error(
      "A Studio test instance is already registered. Stop it explicitly before setup.",
    );
  if (existsSync(join(app, ".env.local")))
    throw new Error(
      "Preserve .env.local elsewhere before setup; it will not be overwritten.",
    );
  const base = Number(process.env.STUDIO_TEST_PORT_BASE ?? 62320);
  if (!Number.isInteger(base) || base < 1024 || base > 65525)
    throw new Error("Invalid local port base.");
  const directory = mkdtempSync(join(tmpdir(), "elsatia-studio-a-"));
  const projectId = directory.split("/").at(-1).toLowerCase();
  mkdirSync(join(directory, "supabase"));
  let config = readFileSync(join(source, "config.toml"), "utf8").replace(
    studioOnly ? 'project_id = "elsatia-studio"' : 'project_id = "btp-platform"',
    `project_id = "${projectId}"`,
  );
  // The dedicated project asks for e-mail confirmation; the disposable stack signs users in at once.
  if (studioOnly) config = config.replace("enable_confirmations = true", "enable_confirmations = false");
  for (let i = 0; i < 10; i++)
    config = config.replaceAll(String(54320 + i), String(base + i));
  // Disposable stack only: the shipped limit (2 e-mails/hour) starves the recovery E2E on a reused stack.
  config = config.replace("email_sent = 2", "email_sent = 200");
  config = config.replace(
    'file_size_limit = "50MiB"',
    'file_size_limit = "1GiB"',
  );
  config = config
    .replaceAll("http://127.0.0.1:3000", "http://127.0.0.1:3030")
    .replace(
      'additional_redirect_urls = ["https://127.0.0.1:3000"]',
      'additional_redirect_urls = ["http://127.0.0.1:3030/auth/callback", "http://127.0.0.1:3030/auth/recovery"]',
    );
  writeFileSync(join(directory, "supabase/config.toml"), config);
  for (const name of ["migrations", "templates"])
    cpSync(join(source, name), join(directory, "supabase", name), {
      recursive: true,
      dereference: true,
    });
  const excludedMigrations = process.argv.includes("--lot-a")
    ? [
        "20260912140000_studio_media_upload.sql",
        "20260912160000_studio_project_management.sql",
      ]
    : process.argv.includes("--lot-b")
      ? ["20260912160000_studio_project_management.sql"]
      : [];
  if (
    ["--lot-a", "--lot-b", "--lot-c"].some((flag) =>
      process.argv.includes(flag),
    )
  )
    excludedMigrations.push("20260912230000_studio_timeline.sql");
  if (
    ["--lot-a", "--lot-b", "--lot-c", "--lot-d"].some((flag) =>
      process.argv.includes(flag),
    )
  )
    excludedMigrations.push("20260913010000_studio_render_engine.sql");
  if (
    ["--lot-a", "--lot-b", "--lot-c", "--lot-d", "--lot-e"].some((flag) =>
      process.argv.includes(flag),
    )
  )
    excludedMigrations.push("20260913020000_studio_templates.sql");
  if (
    ["--lot-a", "--lot-b", "--lot-c", "--lot-d", "--lot-e", "--lot-f"].some(
      (flag) => process.argv.includes(flag),
    )
  )
    excludedMigrations.push("20260913030000_studio_editor_transactions.sql");
  if (
    [
      "--lot-a",
      "--lot-b",
      "--lot-c",
      "--lot-d",
      "--lot-e",
      "--lot-f",
      "--lot-g",
    ].some((flag) => process.argv.includes(flag))
  )
    excludedMigrations.push("20260913040000_studio_media_analysis.sql");
  // Post-H lots are additive on top of the H baseline: any historical --lot-x
  // baseline (including --lot-h itself) is built without them.
  if (
    ["--lot-a", "--lot-b", "--lot-c", "--lot-d", "--lot-e", "--lot-f", "--lot-g", "--lot-h"].some(
      (flag) => process.argv.includes(flag),
    )
  )
    for (const name of readdirSync(join(directory, "supabase/migrations")))
      if (/^2026092\d{7,}_studio_/.test(name)) excludedMigrations.push(name);
  for (const migration of excludedMigrations)
    unlinkSync(join(directory, "supabase/migrations", migration));
  writeFileSync(statePath, JSON.stringify({ directory, projectId }));
  run(
    [
      "start",
      "--workdir",
      directory,
      "--exclude",
      "realtime,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor",
    ],
    "start.log",
    directory,
  );
  const status = JSON.parse(
    run(["status", "--workdir", directory, "-o", "json"], null, directory),
  );
  if (new URL(status.API_URL).hostname !== "127.0.0.1")
    throw new Error("Non-loopback API rejected.");
  openDisposableSignupPolicy(projectId);
  writeFileSync(
    join(app, ".env.local"),
    `NEXT_PUBLIC_STUDIO_URL=http://127.0.0.1:3030\nNEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\nSTUDIO_STORAGE_SERVICE_KEY=${status.SERVICE_ROLE_KEY}\n`,
    { mode: 0o600 },
  );
  console.log(
    `Disposable Studio instance ready: ${projectId}. Public API and server-only storage credentials were written to the ignored local environment to apps/studio/.env.local.`,
  );
} else if (action === "test-db") {
  const { directory, projectId } = state();
  openDisposableSignupPolicy(projectId);
  run(
    [
      "test",
      "db",
      "--local",
      "--workdir",
      directory,
      join(root, "supabase/tests"),
    ],
    "tests.log",
    directory,
  );
  const summary = readFileSync(join(directory, "tests.log"), "utf8")
    .split("\n")
    .filter((line) => /Files=|Result:|All tests/.test(line));
  console.log(summary.join("\n"));
} else if (action === "stop") {
  const { directory } = state();
  run(["stop", "--workdir", directory, "--no-backup"], "stop.log", directory);
  unlinkSync(statePath);
  console.log(
    "Disposable instance removed. Logs and .env.local retained for explicit review/removal.",
  );
} else throw new Error("Usage: node scripts/local-test.mjs setup|test-db|stop");
