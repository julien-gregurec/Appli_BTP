import { NextResponse } from "next/server";
import { configMeta } from "@/lib/social/config";
import { comparerConstant } from "@/lib/social/crypto";
import { verifierSignatureMeta } from "@/lib/social/securite";
import { enregistrerEvenement, TAILLE_MAX_WEBHOOK } from "@/lib/social/webhook-reception";

// Webhooks Meta (objets « page » et « instagram ») : commentaires et messages.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const attendu = configMeta().webhookVerifyToken;
  const recu = url.searchParams.get("hub.verify_token") ?? "";
  if (url.searchParams.get("hub.mode") !== "subscribe" || !attendu || !comparerConstant(recu, attendu)) {
    return NextResponse.json({ error: "Vérification refusée" }, { status: 403 });
  }
  return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const corps = await request.text();
  if (corps.length > TAILLE_MAX_WEBHOOK) return NextResponse.json({ error: "Trop volumineux" }, { status: 413 });
  if (!verifierSignatureMeta(corps, request.headers.get("x-hub-signature-256"), configMeta().appSecret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  return enregistrerEvenement("meta", corps);
}
