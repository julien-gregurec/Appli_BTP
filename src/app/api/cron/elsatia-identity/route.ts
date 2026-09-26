import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchOutbox, httpDeliver, supabaseOutboxStore } from "@elsatia/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { identityIssuer, lifecycleEndpoints, studioAccessDecision } from "@/lib/elsatia-identity/config";

// Livraison des événements de cycle de vie (désactivation, réactivation, suppression) vers les
// applications à projet dédié, avec réessais et réconciliation. Appelée :
//  - par un webhook de base Supabase sur INSERT de elsatia_identity_outbox (latence ~ secondes) ;
//  - par une planification de secours (toutes les 5-15 min), qui rattrape toute notification perdue.
// Authentification : Authorization: Bearer <CRON_SECRET>.
export const dynamic = "force-dynamic";

function autorise(request: Request, secret: string) {
  const recu = Buffer.from(request.headers.get("authorization") ?? "");
  const attendu = Buffer.from(`Bearer ${secret}`);
  return recu.length === attendu.length && timingSafeEqual(recu, attendu);
}

async function executer(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 503 });
  if (!autorise(request, secret)) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  const endpoints = lifecycleEndpoints();
  if (Object.keys(endpoints).length === 0) return NextResponse.json({ error: "Aucune application destinataire configurée" }, { status: 503 });
  try {
    const resultat = await dispatchOutbox({
      store: supabaseOutboxStore(createAdminClient()),
      issuer: identityIssuer(),
      deliver: httpDeliver(endpoints),
      entitlementFor: (row) => (row.email ? studioAccessDecision(row.email) : null),
      limit: 100,
    });
    return NextResponse.json(resultat, { status: resultat.failed > 0 ? 207 : 200 });
  } catch (erreur) {
    return NextResponse.json({ error: erreur instanceof Error ? erreur.message.slice(0, 200) : "Erreur" }, { status: 500 });
  }
}

export const GET = executer;
export const POST = executer;
