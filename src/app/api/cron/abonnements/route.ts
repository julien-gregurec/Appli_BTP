import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajouterOptionIAAbonnement, estPalierOptionIA, estPeriodiciteAbonnement, reconcilierAbonnementStripe } from "@/lib/stripe-abonnement";

// Bascule les essais Option IA expires vers la facturation reelle. Regroupe avec le cron
// des abonnements (et non un cron dedie) car le plan Vercel Hobby limite le nombre de
// crons disponibles.
async function convertirEssaisOptionIAExpires(admin: ReturnType<typeof createAdminClient>) {
  const { data: essaisExpires, error } = await admin
    .from("entreprises")
    .select("id,stripe_subscription_id,abonnement_periodicite,option_ia_palier")
    .eq("option_ia_statut", "essai")
    .lt("option_ia_essai_fin", new Date().toISOString());
  if (error) return [{ entrepriseId: "-", ok: false, raison: error.message }];

  const resultats: Array<{ entrepriseId: string; ok: boolean; raison?: string }> = [];
  for (const entreprise of essaisExpires ?? []) {
    const periodiciteBrute = String(entreprise.abonnement_periodicite ?? "mensuel");
    const periodicite = estPeriodiciteAbonnement(periodiciteBrute) ? periodiciteBrute : "mensuel";
    const palierBrute = String(entreprise.option_ia_palier ?? "300");
    const palier = estPalierOptionIA(palierBrute) ? palierBrute : "300";
    if (!entreprise.stripe_subscription_id) {
      // Essai termine sans abonnement de base souscrit : l'IA se coupe, sans facturation.
      await admin.from("entreprises").update({ option_ia_statut: "indisponible" }).eq("id", entreprise.id);
      resultats.push({ entrepriseId: entreprise.id, ok: true, raison: "essai_expire_sans_abonnement" });
      continue;
    }
    try {
      const item = await ajouterOptionIAAbonnement(entreprise.stripe_subscription_id, palier, periodicite);
      await admin.from("entreprises").update({ option_ia_statut: "actif", option_ia_stripe_item_id: item.id }).eq("id", entreprise.id);
      resultats.push({ entrepriseId: entreprise.id, ok: true });
    } catch (erreur) {
      resultats.push({ entrepriseId: entreprise.id, ok: false, raison: erreur instanceof Error ? erreur.message : "Erreur" });
    }
  }
  return resultats;
}

// Rattrapage quotidien du module paie : re-synchronise (pointages/congés/notes de frais/
// grands déplacements) toute période encore ouverte, sans attendre un clic manuel. Greffé
// ici plutôt que sur un cron dédié, pour la même raison que convertirEssaisOptionIAExpires
// ci-dessus (plan Vercel Hobby, nombre de crons limité).
async function synchroniserPeriodesPaieOuvertes(admin: ReturnType<typeof createAdminClient>) {
  const { data: periodes, error } = await admin
    .from("periodes_paie")
    .select("id, entreprise_id")
    .in("statut", ["brouillon", "saisie_en_cours", "a_controler"]);
  if (error) return [{ periodeId: "-", ok: false, raison: error.message }];

  const resultats: Array<{ periodeId: string; ok: boolean; raison?: string }> = [];
  for (const periode of periodes ?? []) {
    const { error: syncError } = await admin.rpc("synchroniser_periode_paie_service", { p_periode_id: periode.id });
    resultats.push({ periodeId: periode.id, ok: !syncError, raison: syncError?.message });
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
  const paiePeriodes = await synchroniserPeriodesPaieOuvertes(admin);
  return NextResponse.json({ traitees: resultats.length, resultats, optionIA, paiePeriodes });
}
