/** Fresh disposable local runtimes only. Never stops unrelated services or touches remote Supabase. */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  cpSync,
  openSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
const app = fileURLToPath(new URL("../", import.meta.url));
const statePath = join(app, ".local-test.json"),
  envPath = join(app, ".env.local");
if (existsSync(statePath))
  throw Error(
    "An existing Studio disposable runtime is registered. Stop that specific instance explicitly before running the fresh gate.",
  );
const output = mkdtempSync(join(tmpdir(), "studio-e2e-gate-"));
const backup = join(output, "environment.previous");
if (existsSync(envPath)) renameSync(envPath, backup);
console.log(`Evidence: ${output}`);
const individual = process.argv.includes("--individual");
let owned = false;
let renderer = null,
  redisName = null;
const renderRoot = resolve(app, "../../workers/studio-video");
const redisPort = Number(process.env.STUDIO_RENDER_REDIS_PORT || 64379);
async function startRenderer(label) {
  redisName = `studio-render-${JSON.parse(readFileSync(statePath, "utf8")).projectId}`;
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      redisName,
      "--memory=128m",
      "--cpus=0.5",
      "-p",
      `127.0.0.1:${redisPort}:6379`,
      "redis:7.4.2-alpine@sha256:02419de7eddf55aa5bcf49efb74e88fa8d931b4d77c07eff8a6b2144472b6952",
      "redis-server",
      "--save",
      "",
      "--appendonly",
      "no",
    ],
    { stdio: "ignore", timeout: 120000 },
  );
  const log = openSync(join(output, `${label}-worker.log`), "w", 0o600);
  const environment = {
    ...process.env,
    STUDIO_REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    STUDIO_RENDER_TMP: join(output, `${label}-scratch`),
  };
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "STUDIO_STORAGE_SERVICE_KEY"])
    delete environment[key];
  renderer = spawn(
    process.execPath,
    [
      `--env-file=${envPath}`,
      "--import",
      join(renderRoot, "node_modules/tsx/dist/loader.mjs"),
      join(renderRoot, "src/worker.ts"),
    ],
    { cwd: renderRoot, env: environment, stdio: ["ignore", log, log] },
  );
  renderer.once("close", () => closeSync(log));
}
async function stopRenderer() {
  if (renderer) {
    const child = renderer;
    renderer = null;
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("close", resolve));
    }
  }
  if (redisName) {
    execFileSync("docker", ["rm", "-f", redisName], {
      stdio: "ignore",
      timeout: 30000,
    });
    redisName = null;
  }
}
const results = [];
async function run(command, args, label, extra = {}) {
  console.log(`Gate: ${label}`);
  const log = openSync(join(output, `${label}.log`), "w", 0o600);
  const environment = { ...process.env, ...extra };
  // Do not let a parent shell's other local project override this fresh .env.local.
  for (const key of [
    "NEXT_PUBLIC_STUDIO_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "STUDIO_STORAGE_SERVICE_KEY",
  ])
    delete environment[key];
  const child = spawn(command, args, {
    cwd: app,
    env: environment,
    stdio: ["ignore", log, log],
  });
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  }).finally(() => closeSync(log));
  if (status !== 0)
    throw Error(`${label} failed (${status}); inspect ${output}`);
}
async function stop(label) {
  await stopRenderer();
  if (!owned) return;
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  // Capture only this gate's containers; raw logs are private local artifacts, never committed.
  for (const service of ["auth", "rest", "db", "storage", "kong"]) {
    const log = openSync(join(output, `${label}-${service}.log`), "w", 0o600);
    try {
      execFileSync(
        "docker",
        ["logs", `supabase_${service}_${state.projectId}`],
        { stdio: ["ignore", log, log], timeout: 15000 },
      );
    } catch {
      console.error(`Could not capture ${service} logs`);
    } finally {
      closeSync(log);
    }
  }
  cpSync(state.directory, join(output, `${label}-runtime`), {
    recursive: true,
  });
  if (existsSync(join(app, "test-results")))
    cpSync(join(app, "test-results"), join(output, `${label}-last-artifacts`), {
      recursive: true,
    });
  await run(
    process.execPath,
    ["scripts/local-test.mjs", "stop"],
    `${label}-stop`,
  );
  owned = false;
  if (existsSync(envPath)) unlinkSync(envPath);
}
try {
  for (let iteration = 1; iteration <= (individual ? 1 : 2); iteration++) {
    const label = individual ? "individual" : `run-${iteration}`;
    owned = true; // local-test records ownership before starting Docker; failed setup can still be cleaned.
    await run(
      process.execPath,
      ["scripts/local-test.mjs", "setup"],
      `${label}-setup`,
    );
    await run(
      process.execPath,
      ["scripts/templates-migration-check.mjs"],
      `${label}-migration-check`,
    );
    await run(
      process.execPath,
      ["scripts/runtime-check.mjs", "ready"],
      `${label}-ready`,
    );
    await run(
      process.execPath,
      ["scripts/runtime-check.mjs", "stability"],
      `${label}-stability-before`,
    );
    await run("npm", ["run", "build"], `${label}-build`);
    await run(
      process.execPath,
      ["scripts/local-test.mjs", "test-db"],
      `${label}-sql`,
    );
    await startRenderer(label);
    const targets = individual
      ? JSON.parse(
          execFileSync(
            resolve(app, "node_modules/.bin/playwright"),
            ["test", "--list", "--reporter=json"],
            { cwd: app, encoding: "utf8" },
          ),
        ).suites.flatMap((s) => s.specs.map((t) => `${s.file}:${t.line}`))
      : [null];
    if (individual && targets.length !== 22)
      throw Error(`Expected 22 individual E2E cases, found ${targets.length}`);
    if (individual && process.argv.includes("--foundation-first")) {
      const foundation = targets.find((t) =>
        t.startsWith("foundation.spec.ts:"),
      );
      if (!foundation) throw Error("Foundation scenario missing");
      targets.unshift(foundation);
    }
    for (const [index, target] of targets.entries()) {
      const name = `${label}-e2e-${index + 1}`,
        report = join(output, `${name}.json`);
      await run(
        "npm",
        ["run", "test:e2e", "--", ...(target ? [target] : [])],
        name,
        {
          STUDIO_E2E_RESULT: report,
          STUDIO_RENDER_INTERNAL_PREVIEW: "1",
          STUDIO_REDIS_URL: `redis://127.0.0.1:${redisPort}`,
          STUDIO_RENDER_TMP: join(output, `${label}-scratch`),
          STUDIO_RUNTIME_TRACE: join(output, `${name}-http.jsonl`),
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${new URL("runtime-observer.mjs", import.meta.url).href}`,
        },
      );
      const stats = JSON.parse(readFileSync(report, "utf8")).stats;
      const trace = readFileSync(join(output, `${name}-http.jsonl`), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      if (trace.some((row) => row.status >= 500 || row.status === 0))
        throw Error(`${name}: runtime transport failure or HTTP 5xx`);
      const expected = target ? 1 : 22;
      if (
        stats.expected !== expected ||
        stats.unexpected ||
        stats.flaky ||
        stats.skipped
      )
        throw Error(
          `${name}: expected ${expected} passes with no skips/flaky results`,
        );
      results.push({ name, ...stats });
      cpSync(join(app, "test-results"), join(output, `${name}-artifacts`), {
        recursive: true,
      });
    }
    await run(
      process.execPath,
      ["scripts/runtime-check.mjs", "stability"],
      `${label}-stability-after`,
    );
    await stop(label);
  }
  console.log("Gate: GO");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    if (owned && existsSync(statePath)) await stop("final");
  } catch (error) {
    console.error(`Cleanup requires attention: ${error.message}`);
    process.exitCode = 1;
  }
  if (owned && !existsSync(statePath)) owned = false;
  if (!owned && existsSync(backup)) renameSync(backup, envPath);
  writeFileSync(
    join(output, "verdict.json"),
    JSON.stringify(
      { verdict: process.exitCode ? "NO-GO" : "GO", individual, results },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`Gate ${process.exitCode ? "NO-GO" : "GO"}; evidence ${output}`);
}
