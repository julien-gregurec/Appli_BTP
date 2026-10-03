import { NextResponse } from "next/server";
import { configLinkedIn } from "@/lib/social/config";
import { reponseDefiLinkedIn, verifierSignatureLinkedIn } from "@/lib/social/securite";
import { enregistrerEvenement, TAILLE_MAX_WEBHOOK } from "@/lib/social/webhook-reception";

// Webhooks LinkedIn : notifications d'actions sociales de l'organisation.

export async function GET(request: Request) {
  const challengeCode = new URL(request.url).searchParams.get("challengeCode");
  const secret = configLinkedIn().clientSecret;
  if (!challengeCode || !secret) return NextResponse.json({ error: "Validation refusée" }, { status: 400 });
  return NextResponse.json({ challengeCode, challengeResponse: reponseDefiLinkedIn(challengeCode, secret) });
}

export async function POST(request: Request) {
  const corps = await request.text();
  if (corps.length > TAILLE_MAX_WEBHOOK) return NextResponse.json({ error: "Trop volumineux" }, { status: 413 });
  if (!verifierSignatureLinkedIn(corps, request.headers.get("x-li-signature"), configLinkedIn().clientSecret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  return enregistrerEvenement("linkedin", corps);
}
