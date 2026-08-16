"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aPermissionPlateforme } from "@/lib/plateforme";
import { validerPromotion, type PromotionSaisie } from "@/lib/promotions-commerciales";
import { lirePromotionFormData } from "@/lib/promotions-form";
import { createClient } from "@/lib/supabase/server";
import {
  appliquerCouponAbonnement,
  creerCodePromotionnelTest,
  creerCouponRemise,
  desactiverCodePromotionnelTest,
  exigerStripeTest,
  retirerCouponAbonnement,
} from "@/lib/stripe-abonnement";

const RETOUR = "/plateforme/promotions";

function chaine(formData: FormData, nom: string) {
  return String(formData.get(nom) ?? "").trim();
}

function parametresRpc(saisie: PromotionSaisie) {
  return {
    p_nom_interne: saisie.nomInterne,
    p_type_remise: saisie.type,
    p_valeur: saisie.valeur,
    p_duree: saisie.duree,
    p_duree_mois: saisie.dureeMois,
    p_date_debut: saisie.dateDebut,
    p_date_fin: saisie.dateFin,
    p_offres: saisie.offres,
    p_entreprise_id: saisie.entrepriseId,
    p_justification: saisie.justification,
    p_est_pilote: saisie.estPilote,
    p_code_promotionnel: saisie.codePromotionnel,
    p_limite_utilisations: saisie.limiteUtilisations,
  };
}

function erreur(message: string): never {
  redirect(`${RETOUR}?error=${encodeURIComponent(message)}`);
}

export async function enregistrerPromotionAction(formData: FormData) {
  if (!(await aPermissionPlateforme("gerer_remises"))) redirect("/dashboard");
  const saisie = lirePromotionFormData(formData);
  const erreurs = validerPromotion(saisie);
  if (erreurs.length) erreur(erreurs[0]);
  const supabase = await createClient();
  const id = chaine(formData, "promotion_id");
  const requete = id
    ? supabase.rpc("plateforme_promotion_modifier", { p_id: id, ...parametresRpc(saisie) })
    : supabase.rpc("plateforme_promotion_creer", parametresRpc(saisie));
  const { error: erreurRpc } = await requete;
  if (erreurRpc) erreur(erreurRpc.message);
  revalidatePath(RETOUR);
  redirect(`${RETOUR}?succes=${encodeURIComponent(id ? "Brouillon modifié" : "Brouillon créé")}`);
}

export async function activerPromotionAction(promotionId: string) {
  if (!(await aPermissionPlateforme("gerer_remises"))) redirect("/dashboard");
  try {
    exigerStripeTest();
    const supabase = await createClient();
    const { data, error: preparationErreur } = await supabase.rpc("plateforme_promotion_preparer_activation", { p_id: promotionId });
    const promotion = Array.isArray(data) ? data[0] : data;
    if (preparationErreur || !promotion) throw new Error(preparationErreur?.message ?? "Brouillon introuvable");
    if (promotion.entreprise_id && !promotion.stripe_subscription_id) {
      throw new Error("L’entreprise ciblée n’a pas d’abonnement Stripe Test actif");
    }
    const coupon = await creerCouponRemise({
      type: promotion.type_remise === "montant" ? "montant" : "pourcentage",
      valeur: Number(promotion.valeur),
      duree: promotion.duree,
      dureeMois: promotion.duree_mois ?? undefined,
      nom: promotion.nom_interne,
    });
    let codeId: string | null = null;
    if (promotion.code_promotionnel) {
      const code = await creerCodePromotionnelTest({
        couponId: coupon.id,
        code: promotion.code_promotionnel,
        expiration: promotion.date_fin,
        limiteUtilisations: promotion.limite_utilisations,
      });
      codeId = code.id;
    }
    if (promotion.entreprise_id) {
      await appliquerCouponAbonnement(promotion.stripe_subscription_id, coupon.id);
    }
    const { error: confirmationErreur } = await supabase.rpc("plateforme_promotion_confirmer_activation", {
      p_id: promotionId,
      p_stripe_coupon_id: coupon.id,
      p_stripe_promotion_code_id: codeId,
    });
    if (confirmationErreur) throw new Error(confirmationErreur.message);
  } catch (cause) {
    erreur(cause instanceof Error ? cause.message : "Activation impossible");
  }
  revalidatePath(RETOUR);
  revalidatePath("/plateforme");
  redirect(`${RETOUR}?succes=${encodeURIComponent("Promotion activée dans Stripe Test")}`);
}

export async function desactiverPromotionAction(promotionId: string) {
  if (!(await aPermissionPlateforme("gerer_remises"))) redirect("/dashboard");
  try {
    exigerStripeTest();
    const supabase = await createClient();
    const { data, error: preparationErreur } = await supabase.rpc("plateforme_promotion_preparer_desactivation", { p_id: promotionId });
    const promotion = Array.isArray(data) ? data[0] : data;
    if (preparationErreur || !promotion) throw new Error(preparationErreur?.message ?? "Promotion active introuvable");
    if (promotion.stripe_subscription_id) await retirerCouponAbonnement(promotion.stripe_subscription_id);
    if (promotion.stripe_promotion_code_id) await desactiverCodePromotionnelTest(promotion.stripe_promotion_code_id);
    const { error: confirmationErreur } = await supabase.rpc("plateforme_promotion_confirmer_desactivation", { p_id: promotionId });
    if (confirmationErreur) throw new Error(confirmationErreur.message);
  } catch (cause) {
    erreur(cause instanceof Error ? cause.message : "Désactivation impossible");
  }
  revalidatePath(RETOUR);
  revalidatePath("/plateforme");
  redirect(`${RETOUR}?succes=${encodeURIComponent("Promotion désactivée")}`);
}
