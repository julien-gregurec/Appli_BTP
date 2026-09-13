/** Local-only functional readiness and stability probes. No business-test retries. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const app = fileURLToPath(new URL("../", import.meta.url));
const state = JSON.parse(readFileSync(join(app, ".local-test.json"), "utf8"));
if (
  !/^elsatia-studio-a-[a-z0-9]+$/.test(state.projectId) ||
  !state.directory.startsWith(join(tmpdir(), "elsatia-studio-a-"))
)
  throw Error("Disposable Studio runtime required");
const env = Object.fromEntries(
  readFileSync(join(app, ".env.local"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const origin = env.NEXT_PUBLIC_SUPABASE_URL;
const web = env.NEXT_PUBLIC_STUDIO_URL;
for (const url of [origin, web])
  if (new URL(url).hostname !== "127.0.0.1") throw Error("Loopback required");
const config = readFileSync(
  join(state.directory, "supabase/config.toml"),
  "utf8",
);
if (
  !config.includes(`project_id = "${state.projectId}"`) ||
  !config.includes(`port = ${new URL(origin).port}`)
)
  throw Error("Runtime/environment mismatch");
const rows = [];
async function request(
  path,
  {
    token = env.STUDIO_STORAGE_SERVICE_KEY,
    method = "GET",
    body,
    site = origin,
    rawBody,
    contentType = "application/json",
    binary = false,
  } = {},
) {
  const start = performance.now();
  let row = { at: new Date().toISOString(), path: path.split("?")[0], method };
  try {
    const r = await fetch(site + path, {
      method,
      headers:
        site === origin
          ? {
              apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              "Content-Type": contentType,
            }
          : {},
      body: rawBody ?? (body ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout(8000),
    });
    if (binary && r.ok) {
      const data = Buffer.from(await r.arrayBuffer());
      row = {
        ...row,
        status: r.status,
        ms: Math.round(performance.now() - start),
      };
      return data;
    }
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    row = {
      ...row,
      status: r.status,
      ms: Math.round(performance.now() - start),
    };
    if (!r.ok) {
      row.body =
        typeof data === "object"
          ? {
              code: data.code,
              message: data.message,
              msg: data.msg,
              error_code: data.error_code,
            }
          : String(data).slice(0, 120);
      throw Object.assign(Error(`HTTP ${r.status} ${path.split("?")[0]}`), {
        status: r.status,
      });
    }
    return data;
  } catch (error) {
    row.error = error.message;
    row.ms = Math.round(performance.now() - start);
    throw error;
  } finally {
    rows.push(row);
  }
}
async function postgres() {
  const output = execFileSync(
    "docker",
    [
      "exec",
      `supabase_db_${state.projectId}`,
      "psql",
      "-XAt",
      "-U",
      "postgres",
      "-c",
      "select count(*) from supabase_migrations.schema_migrations;",
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  if (Number(output.trim()) !== 258)
    throw Error("Expected 258 applied migrations");
}
async function waitReady(check) {
  const end = Date.now() + 120000;
  let last;
  do {
    try {
      await check();
      return;
    } catch (error) {
      // A real denial or wrong identity/role is not a startup transport failure.
      if (
        (error.status >= 400 && error.status < 500) ||
        /mismatch|Expected 258/.test(error.message)
      )
        throw error;
      last = error;
      console.log(`Readiness: ${error.message}`);
      if (Date.now() < end) await new Promise((r) => setTimeout(r, 1000));
    }
  } while (Date.now() < end);
  throw Error(`Runtime not ready within 120s: ${last?.message}`);
}
const mode = process.argv[2] ?? "ready";
const probePath = join(state.directory, "runtime-probe.json");
async function timelineReady(project, token) {
  // The readiness project intentionally has no montage; exercise both RLS and
  // the atomic document RPC before browser tests populate their own fixtures.
  const timelines = await request(
    `/rest/v1/studio_timelines?project_id=eq.${project}&select=id`,
    { token },
  );
  const document = await request("/rest/v1/rpc/studio_get_timeline", {
    token,
    method: "POST",
    body: { p_project: project, p_timeline: randomUUID() },
  });
  if (timelines.length !== 0 || document !== null)
    throw Error("Timeline readiness fixture mismatch");
}
try {
  if (mode === "ready") {
    await waitReady(async () => {
      await postgres();
      const health = await request("/auth/v1/health");
      if (!health.version) throw Error("Invalid Auth health");
      const users = await request("/auth/v1/admin/users?page=1&per_page=1");
      if (!Array.isArray(users.users)) throw Error("Auth DB not ready");
      const schema = await request("/rest/v1/");
      if (!schema.paths?.["/studio_projects"])
        throw Error("REST schema not ready");
      const buckets = await request("/storage/v1/bucket");
      if (
        !buckets.some((b) => b.id === "studio-originals" && b.public === false)
      )
        throw Error("Private Studio bucket not ready");
    });
    const email = `runtime-${randomUUID()}@example.test`,
      password = `Studio-${randomUUID()}!`;
    const user = await request("/auth/v1/admin/users", {
      method: "POST",
      body: { email, password, email_confirm: true },
    });
    let session = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    session = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: session.refresh_token },
    });
    const refreshed = await request("/auth/v1/user", {
      token: session.access_token,
    });
    if (refreshed.id !== user.id) throw Error("Refresh identity mismatch");
    await request("/auth/v1/logout", {
      method: "POST",
      token: session.access_token,
    });
    session = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    const token = session.access_token;
    const workspace = await request("/rest/v1/rpc/studio_create_workspace", {
      token,
      method: "POST",
      body: { p_name: "Runtime probe", p_type: "personal" },
    });
    const project = await request("/rest/v1/rpc/studio_create_project", {
      token,
      method: "POST",
      body: {
        p_workspace: workspace,
        p_name: "Runtime project",
        p_type: "free",
      },
    });
    const workspaces = await request(
      `/rest/v1/studio_workspaces?id=eq.${workspace}&select=id`,
      { token },
    );
    const projects = await request(
      `/rest/v1/studio_projects?id=eq.${project}&select=id,workspace_id`,
      { token },
    );
    if (workspaces.length !== 1 || projects[0]?.workspace_id !== workspace)
      throw Error("REST fixture mismatch");
    await timelineReady(project, token);
    const key = `studio/runtime-${randomUUID()}/original.png`;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=",
      "base64",
    );
    try {
      const upload = await request(
        `/storage/v1/object/upload/sign/studio-originals/${key}`,
        { method: "POST", body: {} },
      );
      await request(`/storage/v1${upload.url}`, {
        token: null,
        method: "PUT",
        rawBody: png,
        contentType: "image/png",
      });
      const preview = await request(
        `/storage/v1/object/sign/studio-originals/${key}`,
        { method: "POST", body: { expiresIn: 60 } },
      );
      const actual = await request(`/storage/v1${preview.signedURL}`, {
        token: null,
        binary: true,
      });
      if (!actual.equals(png)) throw Error("Storage preview bytes mismatch");
    } finally {
      await request("/storage/v1/object/studio-originals", {
        method: "DELETE",
        body: { prefixes: [key] },
      });
    }
    const remaining = await request(
      "/storage/v1/object/list/studio-originals",
      {
        method: "POST",
        body: {
          prefix: key.slice(0, key.lastIndexOf("/")),
          limit: 10,
          offset: 0,
        },
      },
    );
    if (remaining.length !== 0) throw Error("Storage fixture cleanup mismatch");
    const fixture = { user: user.id, workspace, project, token };
    writeFileSync(probePath, JSON.stringify(fixture), { mode: 0o600 });
    await waitReady(async () => {
      const actor = await request("/auth/v1/user", { token });
      if (actor.id !== user.id) throw Error("Probe identity mismatch");
      const role = await request("/rest/v1/rpc/studio_my_role", {
        token,
        method: "POST",
        body: { p_workspace_id: workspace },
      });
      if (role !== "owner") throw Error("Probe role mismatch");
    });
  } else if (mode === "web") {
    const fixture = JSON.parse(readFileSync(probePath, "utf8"));
    await waitReady(async () => {
      await postgres();
      const actor = await request("/auth/v1/user", { token: fixture.token });
      if (actor.id !== fixture.user) throw Error("Readiness identity mismatch");
      const role = await request("/rest/v1/rpc/studio_my_role", {
        token: fixture.token,
        method: "POST",
        body: { p_workspace_id: fixture.workspace },
      });
      if (role !== "owner") throw Error("Readiness role mismatch");
      await timelineReady(fixture.project, fixture.token);
      const buckets = await request("/storage/v1/bucket");
      if (
        !buckets.some((b) => b.id === "studio-originals" && b.public === false)
      )
        throw Error("Private Storage unavailable");
      const page = await request("/login", { site: web });
      if (typeof page !== "string" || !page.includes("Se connecter"))
        throw Error("Studio login not usable");
    });
  } else if (mode === "stability") {
    const fixture = JSON.parse(readFileSync(probePath, "utf8"));
    // 100 Auth/REST cycles, private Storage every tenth cycle. No request retry.
    const deadline = Date.now() + 120000;
    let failures = 0,
      completed = 0;
    for (let i = 0; i < 100 && Date.now() < deadline; i++) {
      completed++;
      try {
        const actor = await request("/auth/v1/user", { token: fixture.token });
        if (actor.id !== fixture.user) throw Error("Identity mismatch");
        const role = await request("/rest/v1/rpc/studio_my_role", {
          token: fixture.token,
          method: "POST",
          body: { p_workspace_id: fixture.workspace },
        });
        if (role !== "owner") throw Error("Role mismatch");
        if (i % 10 === 0) {
          const buckets = await request("/storage/v1/bucket");
          if (
            !buckets.some(
              (b) => b.id === "studio-originals" && b.public === false,
            )
          )
            throw Error("Private Storage mismatch");
        }
      } catch (error) {
        failures++;
        const last = rows.at(-1);
        if (last && !last.error) last.error = error.message;
      }
    }
    if (failures || completed !== 100)
      throw Error(
        `Runtime unstable: ${failures} failures, ${completed}/100 cycles completed; no retry`,
      );
    console.log("100/100 Auth/REST cycles; 10 private Storage checks");
  } else throw Error("Usage: runtime-check.mjs ready|web|stability");
  console.log(`Runtime ${mode}: PASS`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  const latency = rows.map((r) => r.ms).sort((a, b) => a - b);
  const result = {
    mode,
    passed: !process.exitCode,
    requests: rows.length,
    errors: rows.filter((r) => r.error).length,
    p50: latency[Math.floor(latency.length * 0.5)],
    p95: latency[Math.floor(latency.length * 0.95)],
    max: latency.at(-1),
    rows,
  };
  writeFileSync(
    join(state.directory, `runtime-${mode}.json`),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ ...result, rows: undefined }));
}
