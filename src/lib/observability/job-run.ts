import type { createAdminClient } from "@/lib/supabase/admin";
import { logErreur, logInfo, logWarn } from "@/lib/observability/logger";

type Admin = ReturnType<typeof createAdminClient>;
type StatutJobRun = "succes" | "echec_partiel" | "echec";

// Trace le début/fin d'un cron dans job_runs (cf. migration observabilite_job_runs),
// pour qu'un job "mort" silencieusement (plus aucune ligne récente) ou en échec
// devienne détectable sans dépendre uniquement du corps JSON de la réponse HTTP.
export async function demarrerJobRun(admin: Admin, jobName: string, requestId: string) {
  const { data } = await admin.from("job_runs").insert({ job_name: jobName, request_id: requestId }).select("id").single();
  return data?.id as string | undefined;
}

export async function terminerJobRun(admin: Admin, runId: string | undefined, params: { jobName: string; requestId: string; statut: StatutJobRun; resume?: unknown; erreur?: string; debutMs: number }) {
  const dureeMs = Date.now() - params.debutMs;
  if (runId) {
    await admin.from("job_runs").update({
      finished_at: new Date().toISOString(),
      statut: params.statut,
      duree_ms: dureeMs,
      resume: params.resume ?? null,
      erreur: params.erreur ?? null,
    }).eq("id", runId);
  }
  const contexte = { requestId: params.requestId, route: params.jobName, durationMs: dureeMs };
  if (params.statut === "succes") logInfo("worker", `Job ${params.jobName} terminé avec succès`, contexte);
  else if (params.statut === "echec_partiel") logWarn("worker", `Job ${params.jobName} terminé avec des échecs partiels`, contexte);
  else logErreur("worker", `Job ${params.jobName} a échoué`, contexte, params.erreur);
}
