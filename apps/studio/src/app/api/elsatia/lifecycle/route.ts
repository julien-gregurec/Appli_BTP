import { NextResponse, type NextRequest } from "next/server";
import { lifecycleHttpStatus } from "@elsatia/identity";
import { studioBroker } from "../../../../lib/identity";

// Webhook plateforme → Studio : corps = JWS « elsatia-lifecycle+jwt » (ES256, même JWKS que le
// passage). 200 = acquitté (appliqué, obsolète ou doublon) ; 400 = refusé ; 503 = à réessayer.
export async function POST(request: NextRequest) {
  const body = (await request.text().catch(() => "")).trim();
  if (!body || body.length > 4096) return NextResponse.json({ code: "MALFORMED" }, { status: 400 });
  try {
    const result = await studioBroker().applyLifecycle(body);
    return NextResponse.json({ status: result.status, seq: result.seq, banPending: result.banPending });
  } catch (error) {
    const { status, code } = lifecycleHttpStatus(error);
    return NextResponse.json({ code }, { status: code === "CONFIG_INVALID" ? 503 : status });
  }
}
