import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traiterNotificationPush } from "@/lib/push";
import { obtenirIdCorrelation } from "@/lib/observability/request-id";
import { demarrerJobRun, terminerJobRun } from "@/lib/observability/job-run";

const NOM_JOB = "cron:notifications-push";

// Filet de secours : le webhook Supabase (POST /api/webhooks/notifications-push, déclenché en
// temps réel sur chaque insertion) est le chemin normal. Ce cron rattrape toute notification
// qui n'aurait pas été poussée (webhook non configuré, panne temporaire...). Le plan Vercel Hobby
// limite les crons à une exécution quotidienne : la fenêtre de rattrapage couvre donc 25h
// (un peu plus qu'un jour plein) pour ne rien manquer entre deux passages.
export async function GET(request: Request) {
  const requestId = obtenirIdCorrelation(request);
  const debutMs = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });

  const admin = createAdminClient();
  const runId = await demarrerJobRun(admin, NOM_JOB, requestId);
  const depuis = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { data: enAttente, error } = await admin
    .from("notifications_utilisateurs")
    .select("id")
    .is("push_envoyee_at", null)
    .gte("created_at", depuis)
    .limit(200);
  if (error) {
    await terminerJobRun(admin, runId, { jobName: NOM_JOB, requestId, statut: "echec", erreur: error.message, debutMs });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const notification of enAttente ?? []) {
    await traiterNotificationPush(admin, notification.id);
  }
  await terminerJobRun(admin, runId, { jobName: NOM_JOB, requestId, statut: "succes", resume: { traitees: enAttente?.length ?? 0 }, debutMs });
  return NextResponse.json({ traitees: enAttente?.length ?? 0 });
}
