/** Manual, local-only reconciliation. Dry run by default; never touches originals. */
import { createClient } from "@supabase/supabase-js";
import { readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
const origin = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (new URL(origin).hostname !== "127.0.0.1")
  throw Error("Local reconciliation only");
const root = process.env.STUDIO_RENDER_TMP;
if (!root || !root.startsWith("/"))
  throw Error("Explicit absolute scratch root required");
const admin = createClient(
    origin,
    process.env.STUDIO_STORAGE_SERVICE_KEY || "",
    { auth: { persistSession: false } },
  ),
  apply = process.argv.includes("--apply");
const [jobs, outputs] = await Promise.all([
  admin.from("studio_render_jobs").select("id,status,lease_token").limit(1000),
  admin
    .from("studio_render_outputs")
    .select("storage_key,deleted_at")
    .limit(1000),
]);
if (
  jobs.error ||
  outputs.error ||
  jobs.data.length === 1000 ||
  outputs.data.length === 1000
)
  throw Error("Reconciliation window exceeded or unavailable; no deletion");
const active = new Set(
  jobs.data
    .filter((j) => !["completed", "failed", "cancelled"].includes(j.status))
    .map((j) => `${j.id}/${j.lease_token}`),
);
const retained = new Set(
  outputs.data.filter((o) => !o.deleted_at).map((o) => o.storage_key),
);
let tmp = 0,
  objects = 0,
  examined = 0;
for (const name of await readdir(root)) {
  if (!/^[0-9a-f-]{36}-[0-9a-f-]{36}-[A-Za-z0-9]+$/.test(name)) continue;
  const path = join(root, name),
    s = await stat(path);
  if (
    Date.now() - s.mtimeMs < 3600000 ||
    active.has(`${name.slice(0, 36)}/${name.slice(37, 73)}`)
  )
    continue;
  tmp++;
  if (apply) await rm(path, { recursive: true, force: true });
}
async function walk(prefix: string, depth = 0) {
  if (depth > 7) throw Error("Unexpected object depth");
  const { data, error } = await admin.storage
    .from("studio-renders")
    .list(prefix, { limit: 1000 });
  if (error || !data || data.length === 1000)
    throw Error("Storage unavailable or window exceeded");
  for (const item of data) {
    if (++examined > 20000) throw Error("Bound exceeded");
    const key = `${prefix}/${item.name}`;
    if (!item.id) {
      await walk(key, depth + 1);
      continue;
    }
    if (
      retained.has(key) ||
      !item.created_at ||
      Date.now() - Date.parse(item.created_at) < 3600000 ||
      [...active].some((a) => key.includes(`/renders/${a}/`))
    )
      continue;
    objects++;
    if (apply) {
      const r = await admin.storage.from("studio-renders").remove([key]);
      if (r.error) throw Error("Storage cleanup failed");
    }
  }
}
await walk("studio");
console.log(
  JSON.stringify({ apply, temporaryDirectories: tmp, orphanObjects: objects }),
);
