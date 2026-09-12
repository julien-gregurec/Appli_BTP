import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
test("réconciliation réelle : pending abandonné, objet non confirmé, objet manquant et orphelin", async () => {
  test.setTimeout(120000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(new URL(url).hostname).toBe("127.0.0.1");
  const api = createClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const admin = createClient(url, process.env.STUDIO_STORAGE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
  const signup = await api.auth.signUp({
    email: `reconcile-${randomUUID()}@example.test`,
    password: "Fixture-Local-847-Reconcile!",
  });
  expect(signup.error).toBeNull();
  const ws = await api.rpc("studio_create_workspace", {
    p_name: "Reconcile",
    p_type: "personal",
  });
  const project = await api.rpc("studio_create_project", {
    p_workspace: ws.data,
    p_name: "Reconcile",
    p_type: "free",
  });
  expect(project.error).toBeNull();
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#26795a" },
  })
    .jpeg()
    .toBuffer();
  const ids: string[] = [];
  for (let n = 0; n < 3; n++) {
    const result = await api.rpc("studio_reserve_media", {
      p_project: project.data,
      p_request: randomUUID(),
      p_name: `fixture-${n}.jpg`,
      p_mime: "image/jpeg",
      p_bytes: buffer.length,
    });
    expect(result.error).toBeNull();
    ids.push(result.data);
  }
  const { data: assets } = await admin
    .from("studio_media_assets")
    .select("*")
    .in("id", ids)
    .order("original_filename");
  expect(assets).toHaveLength(3);
  const rows = assets!;
  expect(
    (
      await admin.storage
        .from("studio-originals")
        .upload(rows[1].storage_key, buffer, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  const past = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  expect(
    (
      await admin
        .from("studio_media_assets")
        .update({
          created_at: past,
          upload_expires_at: past,
          purge_after: past,
        })
        .in("id", ids.slice(0, 2))
    ).error,
  ).toBeNull();
  expect(
    (
      await admin
        .from("studio_media_assets")
        .update({ upload_status: "ready" })
        .eq("id", ids[2])
    ).error,
  ).toBeNull();
  const orphan = `studio/orphan-${randomUUID()}/original.jpg`;
  expect(
    (
      await admin.storage
        .from("studio-originals")
        .upload(orphan, buffer, { contentType: "image/jpeg" })
    ).error,
  ).toBeNull();
  const state = JSON.parse(readFileSync(".local-test.json", "utf8"));
  expect(state.projectId).toMatch(/^elsatia-studio-a-/);
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${state.projectId}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `update storage.objects set created_at=now()-interval '30 hours' where bucket_id='studio-originals' and name='${orphan}';`,
    },
  );
  const dry = JSON.parse(
    execFileSync(process.execPath, ["scripts/storage-reconcile.mjs"], {
      encoding: "utf8",
    }),
  );
  expect(dry.dryRun).toBe(true);
  expect(dry.expired).toBeGreaterThanOrEqual(2);
  expect(dry.orphans).toBeGreaterThanOrEqual(1);
  expect(
    (await admin.storage.from("studio-originals").info(orphan)).error,
  ).toBeNull();
  const apply = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/storage-reconcile.mjs", "--apply"],
      { encoding: "utf8" },
    ),
  );
  expect(apply.errors).toBe(0);
  expect(apply.purged).toBeGreaterThanOrEqual(2);
  expect(apply.missing).toBeGreaterThanOrEqual(1);
  expect(
    (await admin.storage.from("studio-originals").info(orphan)).error,
  ).not.toBeNull();
  expect(
    (
      await admin
        .from("studio_media_assets")
        .select("purged_at")
        .eq("id", ids[1])
        .single()
    ).data?.purged_at,
  ).not.toBeNull();
  expect(
    (
      await admin
        .from("studio_media_assets")
        .select("upload_status")
        .eq("id", ids[2])
        .single()
    ).data?.upload_status,
  ).toBe("failed");
  const again = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/storage-reconcile.mjs", "--apply"],
      { encoding: "utf8" },
    ),
  );
  expect(again.purged).toBe(0);
  expect(again.orphans).toBe(0);
});
