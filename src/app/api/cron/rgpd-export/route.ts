import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { expirerArchives, traiterExports } from "@/lib/rgpd-export/service";

// Génération asynchrone des exports RGPD (jobs PENDING / interrompus) puis expiration des archives
// échues. Authentification : Authorization: Bearer <CRON_SECRET>. Réponse : compteurs uniquement.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function autorise(request: Request, secret: string) {
  const recu = Buffer.from(request.headers.get("authorization") ?? "");
  const attendu = Buffer.from(`Bearer ${secret}`);
  return recu.length === attendu.length && timingSafeEqual(recu, attendu);
}

async function executer(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 503 });
  if (!autorise(request, secret)) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  const admin = createAdminClient();
  try {
    const exports = await traiterExports(admin, 240_000);
    const expiration = await expirerArchives(admin);
    return NextResponse.json({
      traites: exports.length,
      prets: exports.filter((r) => r.etat === "ready").length,
      reessais: exports.filter((r) => r.etat === "retry").length,
      echecs: exports.filter((r) => r.etat === "failed").length,
      expiration,
    });
  } catch {
    return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
  }
}

export const GET = executer;
export const POST = executer;
