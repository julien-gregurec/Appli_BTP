// Exécuteur RGPD Studio (compte ELSATIA supprimé → effacement des données Studio).
//
// La BASE décide de tout (apps/studio/supabase/migrations/20260928110000_studio_rgpd_erasure_foundation.sql) :
// mode off | dry_run | execute, décision écrite, délai décidé, périmètre, éléments DECISION_REQUIRED,
// constat d'absence des objets, ordre. Cet exécuteur ne fait que ce que SQL ne peut pas faire :
// supprimer les objets par l'API Storage et l'utilisateur par l'API admin GoTrue du projet Studio.
// Idempotent et rejouable : chaque cycle reprend là où la base en est. Journal sans donnée personnelle
// (identifiants de demande et compteurs uniquement).

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
type StorageItem = { name: string; id: string | null };

export type ErasureClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  storage: {
    from(bucket: string): {
      remove(paths: string[]): PromiseLike<{ error: unknown }>;
      list(
        prefix: string,
        options: { limit: number; offset: number },
      ): PromiseLike<{ data: StorageItem[] | null; error: unknown }>;
    };
  };
  auth: {
    admin: {
      deleteUser(id: string): PromiseLike<{ error: { status?: number } | null }>;
    };
  };
};

export type ErasureSummary = {
  mode: "off" | "dry_run" | "execute";
  requests: number;
  planned: number;
  dbErased: number;
  waiting: number;
  objectsRemoved: number;
  completed: number;
  errors: number;
};

type QueueItem = { queue_id: number; bucket: string; object_key: string; kind: "object" | "prefix" };

const MAX_PREFIX_OBJECTS = 20000;

async function call<T>(client: ErasureClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? "erreur"}`);
  return data as T;
}

/** Tous les objets sous un préfixe (parcours borné, dossiers compris). */
async function listPrefix(client: ErasureClient, bucket: string, prefix: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 8) throw new Error("Arborescence Storage inattendue");
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.storage.from(bucket).list(dir, { limit: 100, offset });
      if (error || !data) throw new Error("Inventaire Storage indisponible");
      for (const item of data) {
        const path = `${dir}/${item.name}`;
        if (item.id) {
          found.push(path);
          if (found.length > MAX_PREFIX_OBJECTS) throw new Error("Borne d'inventaire atteinte");
        } else await walk(path, depth + 1);
      }
      if (data.length < 100) return;
    }
  }
  await walk(prefix.replace(/\/+$/, ""), 0);
  return found;
}

async function purgeStorage(client: ErasureClient, requestId: string, summary: ErasureSummary): Promise<boolean> {
  let clean = true;
  for (;;) {
    const batch = await call<QueueItem[]>(client, "studio_erasure_storage_batch", { p_request: requestId, p_limit: 100 });
    if (!batch?.length) return clean;
    let progressed = false;
    for (const item of batch) {
      try {
        const keys = item.kind === "prefix" ? await listPrefix(client, item.bucket, item.object_key) : [item.object_key];
        for (let i = 0; i < keys.length; i += 100) {
          const { error } = await client.storage.from(item.bucket).remove(keys.slice(i, i + 100));
          if (error) throw new Error("Suppression Storage refusée");
        }
        summary.objectsRemoved += keys.length;
        // La base vérifie elle-même qu'aucun objet ne subsiste avant d'enregistrer le constat.
        await call<boolean>(client, "studio_erasure_storage_done", { p_queue_id: item.queue_id });
        progressed = true;
      } catch {
        summary.errors++;
        clean = false;
      }
    }
    if (!progressed) return false;
  }
}

export async function runErasureCycle(
  client: ErasureClient,
  options: { limit?: number; log?: (event: string, detail: Record<string, unknown>) => void } = {},
): Promise<ErasureSummary> {
  const log = options.log ?? (() => {});
  const summary: ErasureSummary = {
    mode: "off", requests: 0, planned: 0, dbErased: 0, waiting: 0, objectsRemoved: 0, completed: 0, errors: 0,
  };
  const due = await call<{ id: string; status: string }[]>(client, "studio_erasure_due", { p_limit: options.limit ?? 20 });
  for (const request of due ?? []) {
    summary.requests++;
    try {
      if (request.status !== "auth_pending") {
        const plan = await call<{ outcome: string; mode?: "dry_run" | "execute" }>(client, "studio_erasure_prepare", {
          p_request: request.id,
        });
        if (plan.outcome === "disabled") {
          summary.mode = "off";
          log("erasure_disabled", {});
          return summary; // mode off : rien d'autre ne doit être tenté
        }
        if (plan.outcome !== "planned") continue;
        summary.planned++;
        summary.mode = plan.mode ?? "dry_run";
        if (summary.mode !== "execute") {
          log("erasure_planned", { request: request.id });
          continue;
        }
        const run = await call<{ outcome: string }>(client, "studio_erasure_execute", { p_request: request.id });
        if (run.outcome !== "db_erased") {
          summary.waiting++;
          log("erasure_waiting", { request: request.id, outcome: run.outcome });
          continue;
        }
        summary.dbErased++;
        if (!(await purgeStorage(client, request.id, summary))) {
          log("erasure_storage_incomplete", { request: request.id });
          continue;
        }
      } else summary.mode = "execute";
      // Refusée par la base tant qu'une décision manque ou qu'un reste existe : la demande attend.
      const finalized = await client.rpc("studio_erasure_finalize", { p_request: request.id });
      if (finalized.error || typeof finalized.data !== "string") {
        summary.waiting++;
        log("erasure_waiting", { request: request.id, outcome: "finalize_refused" });
        continue;
      }
      const deleted = await client.auth.admin.deleteUser(finalized.data);
      if (deleted.error && deleted.error.status !== 404) throw new Error("Suppression Auth Studio refusée");
      await call<boolean>(client, "studio_erasure_confirm_auth_deleted", { p_request: request.id });
      summary.completed++;
      log("erasure_completed", { request: request.id });
    } catch (error) {
      summary.errors++;
      log("erasure_error", { request: request.id, error: error instanceof Error ? error.message : "erreur" });
    }
  }
  return summary;
}
