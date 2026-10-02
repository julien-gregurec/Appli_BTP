import { NextResponse, type NextRequest } from "next/server";
import { servirExportStudio } from "../../../../lib/rgpd-export-service";

// Export RGPD d'un sujet ELSATIA, appelé serveur à serveur par la plateforme (worker d'export).
// Corps : {"token": "<elsatia-export-request+jwt>"}. 200 = données ; 400/401 = demande refusée ;
// 409 = rejeu ou compte inactif ; 503 = à réessayer. Jamais de contenu dans les journaux.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const texte = await request.text().catch(() => "");
  if (texte.length > 8192) return NextResponse.json({ code: "MALFORMED" }, { status: 400 });
  let corps: unknown = null;
  try {
    corps = JSON.parse(texte);
  } catch {
    return NextResponse.json({ code: "MALFORMED" }, { status: 400 });
  }
  let r;
  try {
    r = await servirExportStudio(corps);
  } catch {
    return NextResponse.json({ code: "CONFIG_INVALID" }, { status: 503 });
  }
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
