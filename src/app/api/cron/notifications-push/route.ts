import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traiterNotificationPush, type IssueTraitementPush } from "@/lib/push";
import { cronsSontActifs } from "@/lib/preview-features";

// Filet de secours : le webhook Supabase (POST /api/webhooks/notifications-push, déclenché en
// temps réel sur chaque insertion) est le chemin normal. Ce cron rattrape toute notification
// qui n'aurait pas été poussée (webhook non configuré, panne temporaire...).
//
// File durable (ELSATIA PERFORMANCE HARDENING V9.1, migration 20261003000101) : plus de fenêtre
// glissante de 25 h ni de lot unique de 200. Le cron réserve des lots bornés et équitables entre
// tenants (push_reserver_lot_service : bail + FOR UPDATE SKIP LOCKED) et boucle jusqu'à ce que la
// file soit vide ou que son budget de temps soit consommé ; ce qui reste est repris au passage
// suivant (rien ne sort de la file sans un état explicite : envoyée, réessai ou abandonnée).
export const maxDuration = 60;

const BUDGET_MS = 45_000;
const TAILLE_LOT = 100;
const PAR_ENTREPRISE = 25;
const CONCURRENCE = 8;
const LOTS_MAX = 500;

async function traiterLot(admin: ReturnType<typeof createAdminClient>, ids: string[]): Promise<IssueTraitementPush[]> {
  const issues: IssueTraitementPush[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCE) {
    const tranche = ids.slice(i, i + CONCURRENCE);
    issues.push(...(await Promise.all(tranche.map((id) => traiterNotificationPush(admin, id, { dejaReservee: true })))));
  }
  return issues;
}

export async function GET(request: Request) {
  if (!cronsSontActifs()) return NextResponse.json({ error: "Tâches planifiées désactivées" }, { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });

  const admin = createAdminClient();
  const debut = Date.now();
  const bilan = { traitees: 0, envoyees: 0, echecs: 0, ignorees: 0, lots: 0, budget_epuise: false };

  while (bilan.lots < LOTS_MAX) {
    if (Date.now() - debut > BUDGET_MS) {
      bilan.budget_epuise = true;
      break;
    }
    // ACL canonique (migration 255) : pas de lecture directe de notifications_utilisateurs par service_role.
    const { data, error } = await admin.rpc("push_reserver_lot_service", { p_limite: TAILLE_LOT, p_par_entreprise: PAR_ENTREPRISE });
    if (error) {
      console.error("Échec du traitement périodique des notifications", error);
      if (bilan.lots === 0) return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
      break;
    }
    const lot = (data ?? []) as Array<{ id: string }>;
    if (!lot.length) break;
    bilan.lots += 1;
    for (const issue of await traiterLot(admin, lot.map((n) => n.id))) {
      bilan.traitees += 1;
      if (issue === "envoyee") bilan.envoyees += 1;
      else if (issue === "echec") bilan.echecs += 1;
      else bilan.ignorees += 1;
    }
  }

  return NextResponse.json(bilan);
}
