import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcilierAbonnementStripe } from "@/lib/stripe-abonnement";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  const admin = createAdminClient();
  const { data: entreprises, error } = await admin.from("entreprises").select("id").not("stripe_subscription_id", "is", null).in("abonnement_statut", ["essai", "actif"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const resultats: Array<{ entrepriseId: string; synchronise: boolean; raison?: string }> = [];
  for (const entreprise of entreprises ?? []) {
    try {
      const resultat = await reconcilierAbonnementStripe(entreprise.id);
      resultats.push({ entrepriseId: entreprise.id, ...resultat });
    } catch (erreur) {
      resultats.push({ entrepriseId: entreprise.id, synchronise: false, raison: erreur instanceof Error ? erreur.message : "Erreur" });
    }
  }
  return NextResponse.json({ traitees: resultats.length, resultats });
}
