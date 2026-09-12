/** Manual, dry-run by default. No scheduler and no production credentials loaded implicitly. */
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1")
  throw new Error("This validated reconciliation command is local-only.");
const key = process.env.STUDIO_STORAGE_SERVICE_KEY;
if (!key) throw new Error("Server storage credential required.");
const apply = process.argv.includes("--apply");
const client = createClient(url, key, { auth: { persistSession: false } }),
  bucket = client.storage.from("studio-originals");
const summary = {
  dryRun: !apply,
  scanned: 0,
  expired: 0,
  purged: 0,
  missing: 0,
  orphans: 0,
  errors: 0,
};
let offset = 0;
for (;;) {
  const { data: rows, error } = await client
    .from("studio_media_assets")
    .select("*")
    .order("id")
    .range(offset, offset + 99);
  if (error) throw new Error("Asset inventory unavailable.");
  for (const asset of rows) {
    summary.scanned++;
    if (asset.purged_at) continue;
    const expired =
      ["pending", "uploading", "uploaded", "failed"].includes(
        asset.upload_status,
      ) && Date.parse(asset.upload_expires_at) < Date.now();
    let deleted = !!asset.deleted_at;
    if (expired && !deleted) {
      summary.expired++;
      deleted = true;
      if (apply) {
        const { error } = await client.rpc("studio_expire_media", {
          p_asset: asset.id,
        });
        if (error) {
          summary.errors++;
          continue;
        }
      }
    }
    const info = await bucket.info(asset.storage_key);
    const absent =
      info.error && ["400", "404"].includes(String(info.error.status));
    if (info.error && !absent) {
      summary.errors++;
      continue;
    }
    if (asset.upload_status === "ready" && absent) {
      summary.missing++;
      if (apply) {
        const update = await client
          .from("studio_media_assets")
          .update({
            upload_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", asset.id)
          .eq("upload_status", "ready");
        if (update.error) summary.errors++;
      }
    }
    if (deleted && Date.parse(asset.purge_after) < Date.now()) {
      summary.purged++;
      if (apply) {
        const refs = await client
          .from("studio_project_assets")
          .select("asset_id")
          .eq("asset_id", asset.id)
          .limit(1);
        if (refs.error || refs.data.length) {
          summary.errors++;
          continue;
        }
        const { error } = await bucket.remove([asset.storage_key]);
        if (error) {
          summary.errors++;
          continue;
        }
        const check = await bucket.info(asset.storage_key);
        if (
          !check.error ||
          !["400", "404"].includes(String(check.error.status))
        ) {
          summary.errors++;
          continue;
        }
        const update = await client
          .from("studio_media_assets")
          .update({ purged_at: new Date().toISOString() })
          .eq("id", asset.id)
          .eq("upload_status", "deleted");
        if (update.error) summary.errors++;
      }
    }
  }
  offset += rows.length;
  if (rows.length < 100) break;
}
// Bucket-scoped traversal; no names, signed tokens or credentials printed.
let traversed = 0;
const orphanDeletes = [];
async function walk(prefix = "", depth = 0) {
  if (depth > 5) throw new Error("Unexpected Storage hierarchy.");
  let offset = 0;
  for (;;) {
    const { data, error } = await bucket.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error("Object inventory unavailable.");
    const folders = [];
    for (const object of data) {
      if (++traversed > 100000)
        throw new Error("Inventory bound reached; partition the next run.");
      const path = prefix ? `${prefix}/${object.name}` : object.name;
      if (!object.id) {
        folders.push(path);
        continue;
      }
      const { data: asset, error } = await client
        .from("studio_media_assets")
        .select("id")
        .eq("storage_key", path)
        .maybeSingle();
      if (error) throw new Error("Asset lookup unavailable.");
      if (
        !asset &&
        Date.parse(object.created_at) < Date.now() - 30 * 3600 * 1000
      ) {
        summary.orphans++;
        if (apply) orphanDeletes.push(path);
      }
    }
    for (const folder of folders) await walk(folder, depth + 1);
    offset += data.length;
    if (data.length < 100) break;
  }
}
await walk();
for (const path of orphanDeletes) {
  const { error } = await bucket.remove([path]);
  if (error) summary.errors++;
}
console.log(JSON.stringify(summary));
if (summary.errors) process.exitCode = 1;
