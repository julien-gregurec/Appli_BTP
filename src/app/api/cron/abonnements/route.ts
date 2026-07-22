import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajouterOptionIAAbonnement, estPeriodiciteAbonnement, reconcilierAbonnementStripe } from "@/lib/stripe-abonnement";

// Bascule les essais Option IA expires vers la facturation reelle. Regroupe avec le cron
// des abonnements (et non un cron dedie) car le plan Vercel Hobby limite le nombre de
// crons disponibles.
async function convertirEssaisOptionIAExpires(admin: ReturnType<typeof createAdminClient>) {
  const { data: essaisExpires, error } = await admin
    .from("entreprises")
    .select("id,stripe_subscription_id,abonnement_periodicite")
    .eq("option_ia_statut", "essai")
    .lt("option_ia_essai_fin", new Date().toISOString());
  if (error) return [{ entrepriseId: "-", ok: false, raison: error.message }];

  const resultats: Array<{ entrepriseId: string; ok: boolean; raison?: string }> = [];
  for (const entreprise of essaisExpires ?? []) {
    const periodiciteBrute = String(entreprise.abonnement_periodicite ?? "mensuel");
    const periodicite = estPeriodiciteAbonnement(periodiciteBrute) ? periodiciteBrute : "mensuel";
    if (!entreprise.stripe_subscription_id) {
      // Essai termine sans abonnement de base souscrit : l'IA se coupe, sans facturation.
      await admin.from("entreprises").update({ option_ia_statut: "indisponible" }).eq("id", entreprise.id);
      resultats.push({ entrepriseId: entreprise.id, ok: true, raison: "essai_expire_sans_abonnement" });
      continue;
    }
    try {
      const item = await ajouterOptionIAAbonnement(entreprise.stripe_subscription_id, periodicite);
      await admin.from("entreprises").update({ option_ia_statut: "actif", option_ia_stripe_item_id: item.id }).eq("id", entreprise.id);
      resultats.push({ entrepriseId: entreprise.id, ok: true });
    } catch (erreur) {
      resultats.push({ entrepriseId: entreprise.id, ok: false, raison: erreur instanceof Error ? erreur.message : "Erreur" });
    }
  }
  return resultats;
}

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
  const optionIA = await convertirEssaisOptionIAExpires(admin);
  return NextResponse.json({ traitees: resultats.length, resultats, optionIA });
}
