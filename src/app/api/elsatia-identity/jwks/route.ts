import { NextResponse } from "next/server";
import { identityJwks } from "@/lib/elsatia-identity/config";

// Clés PUBLIQUES de l'identité centrale (courante + précédente pendant la fenêtre de rotation).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(identityJwks(), {
      headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return NextResponse.json({ error: "Clés d'identité non configurées" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
