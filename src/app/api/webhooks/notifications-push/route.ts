import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traiterNotificationPush } from "@/lib/push";

// Cible d'un Supabase Database Webhook (Dashboard > Database > Webhooks) déclenché sur
// INSERT dans notifications_utilisateurs : livraison quasi temps réel, dès qu'une
// notification est créée par un trigger/fonction Postgres. Voir NOTIFICATIONS_WEBHOOK_SECRET
// pour la configuration exacte (header personnalisé à ajouter dans le webhook Supabase).
type PayloadWebhookSupabase = { type: string; table: string; record?: { id?: string } };

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATIONS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "NOTIFICATIONS_WEBHOOK_SECRET absent" }, { status: 503 });
  if (request.headers.get("x-notifications-secret") !== secret) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });

  const payload = (await request.json().catch(() => null)) as PayloadWebhookSupabase | null;
  if (!payload || payload.table !== "notifications_utilisateurs" || payload.type !== "INSERT" || !payload.record?.id) {
    return NextResponse.json({ ignore: true });
  }

  const admin = createAdminClient();
  await traiterNotificationPush(admin, payload.record.id);
  return NextResponse.json({ ok: true });
}
