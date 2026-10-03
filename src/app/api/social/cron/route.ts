import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { comparerConstant } from "@/lib/social/crypto";
import { executerTachesSociales } from "@/lib/social/taches";

// Planificateur ELSATIA Social : publications programmées, reprises, webhooks.
// À appeler toutes les 5 minutes avec « Authorization: Bearer CRON_SECRET »
// (Supabase pg_cron + pg_net, cron Vercel Pro ou planificateur externe).
// ?synchroniser=1 ajoute la lecture des statistiques, commentaires et messages.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 503 });
  if (!comparerConstant(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  const synchroniser = new URL(request.url).searchParams.get("synchroniser") === "1";
  const resultat = await executerTachesSociales(createAdminClient(), { synchroniser });
  return NextResponse.json(resultat);
}
