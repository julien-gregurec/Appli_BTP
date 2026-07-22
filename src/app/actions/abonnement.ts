"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import {
  ajouterOptionIAAbonnement,
  creerOuRecupererClientStripe,
  creerSessionAbonnementStripe,
  creerSessionPortailStripe,
  estOffreAbonnement,
  estPeriodiciteAbonnement,
  retirerOptionIAAbonnement,
} from "@/lib/stripe-abonnement";

async function verifierDroitAbonnement() {
  const ctx = await getContexteEntreprise();
  const droits = await permissionsUtilisateur(ctx);
  if (droits !== null && !droits.includes("gerer_parametres")) {
    redirect(`/abonnement?error=${encodeURIComponent("Votre poste ne permet pas de gérer l’abonnement")}`);
  }
  return ctx;
}

function retourErreurAutorise(valeur: FormDataEntryValue | null) {
  const retour = String(valeur ?? "/abonnement");
  return retour.startsWith("/onboarding/besoins") ? retour : "/abonnement";
}

export async function demarrerAbonnementAction(formData: FormData) {
  const ctx = await verifierDroitAbonnement();
  const offre = String(formData.get("offre") ?? "");
  const periodicite = String(formData.get("periodicite") ?? "mensuel");
  const retourErreur = retourErreurAutorise(formData.get("retour_erreur"));
  if (!estOffreAbonnement(offre) || !estPeriodiciteAbonnement(periodicite)) {
    redirect(`${retourErreur}?error=${encodeURIComponent("Offre ou périodicité invalide")}`);
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  let destination: string;
  try {
    const customerId = await creerOuRecupererClientStripe({
      entrepriseId: ctx.entrepriseId,
      email: user.email,
    });
    const session = await creerSessionAbonnementStripe({
      entrepriseId: ctx.entrepriseId,
      customerId,
      offre,
      periodicite,
    });
    if (!session.url) throw new Error("Stripe n’a pas retourné de page de paiement");
    destination = session.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Souscription impossible";
    const separateur = retourErreur.includes("?") ? "&" : "?";
    redirect(`${retourErreur}${separateur}error=${encodeURIComponent(message)}`);
  }
  redirect(destination);
}

export async function ouvrirPortailAbonnementAction() {
  const ctx = await verifierDroitAbonnement();
  const supabase = await createClient();
  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("stripe_customer_id")
    .eq("id", ctx.entrepriseId)
    .single();
  if (!entreprise?.stripe_customer_id) {
    redirect(`/abonnement?error=${encodeURIComponent("Aucun abonnement Stripe n’est encore associé")}`);
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) redirect(`/abonnement?error=${encodeURIComponent("Adresse publique de l’application non configurée")}`);
  let destination: string;
  try {
    const session = await creerSessionPortailStripe(entreprise.stripe_customer_id, `${baseUrl}/abonnement`);
    if (!session.url) throw new Error("Stripe n’a pas retourné le portail client");
    destination = session.url;
  } catch (error) {
    redirect(`/abonnement?error=${encodeURIComponent(error instanceof Error ? error.message : "Portail indisponible")}`);
  }
  redirect(destination);
}

// Option IA payante : desactivation en libre-service (annule l'essai en cours ou retire
// la ligne Stripe facturee), et reactivation (facturee immediatement, sans nouvel essai,
// pour eviter les allers-retours qui prolongeraient la periode gratuite indefiniment).
export async function desactiverOptionIAAction() {
  const ctx = await verifierDroitAbonnement();
  const supabase = await createClient();
  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("option_ia_statut,option_ia_stripe_item_id")
    .eq("id", ctx.entrepriseId)
    .maybeSingle();
  if (!entreprise || (entreprise.option_ia_statut !== "essai" && entreprise.option_ia_statut !== "actif")) {
    redirect(`/abonnement?error=${encodeURIComponent("L’option IA n’est pas active")}`);
  }
  if (entreprise.option_ia_stripe_item_id) {
    try {
      await retirerOptionIAAbonnement(entreprise.option_ia_stripe_item_id);
    } catch (error) {
      redirect(`/abonnement?error=${encodeURIComponent(error instanceof Error ? error.message : "Désactivation impossible")}`);
    }
  }
  await supabase.from("entreprises").update({ option_ia_statut: "annule", option_ia_stripe_item_id: null }).eq("id", ctx.entrepriseId);
  revalidatePath("/abonnement");
  redirect(`/abonnement?succes=1`);
}

export async function reactiverOptionIAAction() {
  const ctx = await verifierDroitAbonnement();
  const supabase = await createClient();
  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("option_ia_statut,stripe_subscription_id,abonnement_periodicite")
    .eq("id", ctx.entrepriseId)
    .maybeSingle();
  if (!entreprise || entreprise.option_ia_statut !== "annule") {
    redirect(`/abonnement?error=${encodeURIComponent("L’option IA n’est pas désactivée")}`);
  }
  if (!entreprise.stripe_subscription_id) {
    redirect(`/abonnement?error=${encodeURIComponent("Souscrivez d’abord à un abonnement pour réactiver l’option IA")}`);
  }
  const periodiciteBrute = String(entreprise.abonnement_periodicite ?? "mensuel");
  const periodicite = estPeriodiciteAbonnement(periodiciteBrute) ? periodiciteBrute : "mensuel";
  try {
    const item = await ajouterOptionIAAbonnement(entreprise.stripe_subscription_id, periodicite);
    await supabase.from("entreprises").update({ option_ia_statut: "actif", option_ia_stripe_item_id: item.id }).eq("id", ctx.entrepriseId);
  } catch (error) {
    redirect(`/abonnement?error=${encodeURIComponent(error instanceof Error ? error.message : "Réactivation impossible")}`);
  }
  revalidatePath("/abonnement");
  redirect(`/abonnement?succes=1`);
}

export async function ouvrirPortailAbonnementSuspenduAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profil } = await supabase.from("utilisateurs").select("entreprise_active_id").eq("id", user.id).maybeSingle();
  if (!profil?.entreprise_active_id) redirect("/onboarding");
  const [{ data: support }, { data: appartenance }] = await Promise.all([
    supabase.rpc("est_acces_support_actif", { p_entreprise_id: profil.entreprise_active_id }),
    supabase.from("utilisateurs_entreprises").select("poste_id").eq("utilisateur_id", user.id).eq("entreprise_id", profil.entreprise_active_id).eq("statut", "actif").maybeSingle(),
  ]);
  const { data: permission } = appartenance?.poste_id ? await supabase.from("permissions_poste").select("autorise").eq("entreprise_id", profil.entreprise_active_id).eq("poste_id", appartenance.poste_id).eq("cle_permission", "gerer_parametres").eq("autorise", true).maybeSingle() : { data: null };
  if (support !== true && !permission) redirect(`/abonnement-suspendu?error=${encodeURIComponent("Seul un administrateur peut gérer l’abonnement")}`);
  const { data: entreprise } = await supabase.from("entreprises").select("stripe_customer_id").eq("id", profil.entreprise_active_id).maybeSingle();
  if (!entreprise?.stripe_customer_id) redirect(`/abonnement-suspendu?error=${encodeURIComponent("Aucun abonnement Stripe n’est associé. Contactez Liria Gestion Pro.")}`);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) redirect(`/abonnement-suspendu?error=${encodeURIComponent("Adresse publique non configurée")}`);
  let destination: string;
  try {
    const session = await creerSessionPortailStripe(entreprise.stripe_customer_id, `${baseUrl}/abonnement-suspendu`);
    if (!session.url) throw new Error("Stripe n’a pas retourné le portail client");
    destination = session.url;
  } catch (error) {
    redirect(`/abonnement-suspendu?error=${encodeURIComponent(error instanceof Error ? error.message : "Portail indisponible")}`);
  }
  redirect(destination);
}
