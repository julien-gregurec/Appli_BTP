import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { studioBroker } from "../../../../lib/identity";

// Réconciliation Studio (planification) : rejoue les bans GoTrue non confirmés, purge les jti et
// événements expirés et les sessions orphelines. Authorization: Bearer <STUDIO_CRON_SECRET>.
export async function POST(request: NextRequest) {
  const secret = process.env.STUDIO_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "STUDIO_CRON_SECRET absent" }, { status: 503 });
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want))
    return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  try {
    return NextResponse.json(await studioBroker().reconcile());
  } catch {
    return NextResponse.json({ error: "Réconciliation indisponible" }, { status: 503 });
  }
}
