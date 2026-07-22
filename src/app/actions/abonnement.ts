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
  estPalierOptionIA,
  estPeriodiciteAbonnement,
  modifierOptionIAAbonnement,
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
  if (offre === "sur_mesure") {
    redirect(`${retourErreur}?error=${encodeURIComponent("L’offre Sur mesure nécessite un devis validé avant activation")}`);
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

export async function configurerPolitiqueIAAction(formData: FormData) {
  const ctx = await verifierDroitAbonnement();
  const active = formData.get("ia_active") === "on";
  const politique = String(formData.get("ia_politique_quota") ?? "blocage");
  if (!["blocage", "depassement_facture", "achat_pack"].includes(politique)) {
    redirect(`/abonnement?error=${encodeURIComponent("Politique IA invalide")}`);
  }
  const plafondSaisi = String(formData.get("ia_plafond_cout_mensuel_ht") ?? "").replace(",", ".").trim();
  const plafond = plafondSaisi === "" ? null : Number(plafondSaisi);
  if (plafond !== null && (!Number.isFinite(plafond) || plafond <= 0 || plafond > 100_000)) {
    redirect(`/abonnement?error=${encodeURIComponent("Le plafond budgétaire IA doit être compris entre 0,01 € et 100 000 € HT")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprises")
    .update({ ia_active: active, ia_politique_quota: politique, ia_plafond_cout_mensuel_ht: plafond })
    .eq("id", ctx.entrepriseId);
  if (error) redirect(`/abonnement?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/abonnement");
  redirect("/abonnement?succes=1");
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
    .select("option_ia_statut,option_ia_palier,stripe_subscription_id,abonnement_periodicite")
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
  const palierBrute = String(entreprise.option_ia_palier ?? "300");
  const palier = estPalierOptionIA(palierBrute) ? palierBrute : "300";
  try {
    const item = await ajouterOptionIAAbonnement(entreprise.stripe_subscription_id, palier, periodicite);
    await supabase.from("entreprises").update({ option_ia_statut: "actif", option_ia_stripe_item_id: item.id }).eq("id", ctx.entrepriseId);
  } catch (error) {
    redirect(`/abonnement?error=${encodeURIComponent(error instanceof Error ? error.message : "Réactivation impossible")}`);
  }
  revalidatePath("/abonnement");
  redirect(`/abonnement?succes=1`);
}

// Choix du palier IA (100/300/illimité). Pendant l'essai : simple mise à jour locale (rien
// n'est facturé avant la fin de l'essai). Une fois actif : bascule Stripe (retrait de
// l'ancienne ligne, ajout de la nouvelle) avec proration.
export async function choisirPalierOptionIAAction(formData: FormData) {
  const ctx = await verifierDroitAbonnement();
  const palierBrut = String(formData.get("palier") ?? "");
  if (!estPalierOptionIA(palierBrut)) {
    redirect(`/abonnement?error=${encodeURIComponent("Palier invalide")}`);
  }
  const supabase = await createClient();
  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("option_ia_statut,option_ia_palier,option_ia_stripe_item_id,stripe_subscription_id,abonnement_periodicite")
    .eq("id", ctx.entrepriseId)
    .maybeSingle();
  if (!entreprise || (entreprise.option_ia_statut !== "essai" && entreprise.option_ia_statut !== "actif")) {
    redirect(`/abonnement?error=${encodeURIComponent("L’option IA doit être active ou en essai pour choisir un palier")}`);
  }
  if (entreprise.option_ia_palier === palierBrut) {
    redirect(`/abonnement?succes=1`);
  }

  if (entreprise.option_ia_statut === "essai") {
    await supabase.from("entreprises").update({ option_ia_palier: palierBrut }).eq("id", ctx.entrepriseId);
    revalidatePath("/abonnement");
    redirect(`/abonnement?succes=1`);
  }

  if (!entreprise.stripe_subscription_id) {
    redirect(`/abonnement?error=${encodeURIComponent("Aucun abonnement Stripe associé")}`);
  }
  const periodiciteBrute = String(entreprise.abonnement_periodicite ?? "mensuel");
  const periodicite = estPeriodiciteAbonnement(periodiciteBrute) ? periodiciteBrute : "mensuel";
  try {
    const item = entreprise.option_ia_stripe_item_id
      ? await modifierOptionIAAbonnement(entreprise.option_ia_stripe_item_id, palierBrut, periodicite)
      : await ajouterOptionIAAbonnement(entreprise.stripe_subscription_id, palierBrut, periodicite);
    await supabase.from("entreprises").update({ option_ia_palier: palierBrut, option_ia_stripe_item_id: item.id }).eq("id", ctx.entrepriseId);
  } catch (error) {
    redirect(`/abonnement?error=${encodeURIComponent(error instanceof Error ? error.message : "Changement de palier impossible")}`);
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
