/** Disposable Supabase test harness. Never links to or resets a remote project. */
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const app = fileURLToPath(new URL("../", import.meta.url));
const root = resolve(app, "../..");
const statePath = join(app, ".local-test.json");
const cli = join(root, "node_modules/.bin/supabase");
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
  let config = readFileSync(join(root, "supabase/config.toml"), "utf8").replace(
    'project_id = "btp-platform"',
    `project_id = "${projectId}"`,
  );
  for (let i = 0; i < 10; i++)
    config = config.replaceAll(String(54320 + i), String(base + i));
  config = config
    .replaceAll("http://127.0.0.1:3000", "http://127.0.0.1:3030")
    .replace(
      'additional_redirect_urls = ["https://127.0.0.1:3000"]',
      'additional_redirect_urls = ["http://127.0.0.1:3030/auth/callback"]',
    );
  writeFileSync(join(directory, "supabase/config.toml"), config);
  for (const name of ["migrations", "templates"])
    cpSync(join(root, "supabase", name), join(directory, "supabase", name), {
      recursive: true,
    });
  writeFileSync(statePath, JSON.stringify({ directory, projectId }));
  run(
    [
      "start",
      "--workdir",
      directory,
      "--exclude",
      "realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor",
    ],
    "start.log",
    directory,
  );
  const status = JSON.parse(
    run(["status", "--workdir", directory, "-o", "json"], null, directory),
  );
  if (new URL(status.API_URL).hostname !== "127.0.0.1")
    throw new Error("Non-loopback API rejected.");
  writeFileSync(
    join(app, ".env.local"),
    `NEXT_PUBLIC_STUDIO_URL=http://127.0.0.1:3030\nNEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\n`,
    { mode: 0o600 },
  );
  console.log(
    `Disposable Studio instance ready: ${projectId}. Only its public API key was written to apps/studio/.env.local.`,
  );
} else if (action === "test-db") {
  const { directory } = state();
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
