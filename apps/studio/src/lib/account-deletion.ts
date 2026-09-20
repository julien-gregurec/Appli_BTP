import "server-only";
import { createStudioClient } from "./supabase";
import { storageAdmin } from "./storage-admin";
export interface DeletionPlan {
  purge: { id: string; name: string; projects: number; assets: number; bytes: number; renders: number; shares: number }[];
  blocked: { id: string; name: string; members: number }[];
  leave: { id: string; name: string; contributions: number }[];
}
export async function getDeletionPlan(): Promise<DeletionPlan | null> {
  const client = await createStudioClient();
  const r = await client.rpc("studio_my_deletion_plan");
  return r.error ? null : (r.data as DeletionPlan);
}
/**
 * prepare -> delete the queued Storage objects -> finish -> delete the Auth user. Every step is idempotent,
 * so a crash at any point is resumed by running it again. Identity comes from the verified session, never a form.
 */
export async function executeAccountDeletion(
  userId: string,
): Promise<{ blocked: boolean }> {
  const admin = storageAdmin();
  const prepared = await admin.rpc("studio_deletion_prepare", { p_user: userId });
  if (prepared.error) throw new Error("prepare");
  if ((prepared.data as { blocked?: unknown[] }).blocked) return { blocked: true };
  for (let round = 0; round < 500; round++) {
    const finished = await admin.rpc("studio_deletion_finish", { p_user: userId });
    if (finished.error) throw new Error("finish");
    const result = finished.data as {
      pending_objects?: number;
      remaining_references?: number;
      blocked?: boolean;
      not_prepared?: boolean;
    };
    if (result.blocked) return { blocked: true };
    if (result.not_prepared) throw new Error("not-prepared");
    if (result.remaining_references !== undefined) {
      if (result.remaining_references !== 0) throw new Error("references");
      const removed = await admin.auth.admin.deleteUser(userId);
      // An already deleted user (a previous attempt got this far) is success, not an error.
      if (removed.error && !/not found/i.test(removed.error.message))
        throw new Error("auth");
      return { blocked: false };
    }
    const pending = await admin.rpc("studio_deletion_pending_keys", { p_limit: 200 });
    const keys = (pending.data as { bucket: string; key: string }[] | null) ?? [];
    if (!keys.length && !result.pending_objects) throw new Error("stalled");
    for (const bucket of ["studio-originals", "studio-renders"]) {
      const inBucket = keys.filter((k) => k.bucket === bucket).map((k) => k.key);
      if (!inBucket.length) continue;
      const removed = await admin.storage.from(bucket).remove(inBucket);
      if (removed.error) throw new Error("storage");
      const marked = await admin.rpc("studio_deletion_mark_purged", {
        p_bucket: bucket,
        p_keys: inBucket,
      });
      if (marked.error) throw new Error("mark");
    }
  }
  throw new Error("too-many-rounds");
}
