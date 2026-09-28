import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { studioAuthAdmin } from "../../../../lib/identity";
import { runErasureCycle, type ErasureClient } from "../../../../lib/erasure-runner";

// Effacement RGPD Studio (planification) : comptes ELSATIA supprimés. Tout est décidé et vérifié en
// base (mode off par défaut, décision écrite, délai décidé) ; cette route n'exécute que les
// suppressions Storage et Auth Studio. Authorization: Bearer <STUDIO_CRON_SECRET>.
export async function POST(request: NextRequest) {
  const secret = process.env.STUDIO_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "STUDIO_CRON_SECRET absent" }, { status: 503 });
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want))
    return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  try {
    const summary = await runErasureCycle(studioAuthAdmin() as unknown as ErasureClient, {
      log: (event, detail) => console.info(JSON.stringify({ scope: "studio-erasure", event, ...detail })),
    });
    return NextResponse.json(summary, { status: summary.errors ? 207 : 200 });
  } catch {
    return NextResponse.json({ error: "Effacement indisponible" }, { status: 503 });
  }
}
