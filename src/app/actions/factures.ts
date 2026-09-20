"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { TRANSITIONS_FACTURES } from "@/lib/factures";
import type { LigneDevis } from "@/lib/devis";
import { permissionsUtilisateur } from "@/lib/permissions";
import { envoyerDocumentCommercialParEmail } from "@/lib/documents-envoi";
import { construireSnapshotEntreprise } from "@/lib/documents-commerciaux";
import { lienPaiementStripeEstActif } from "@/lib/stripe";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

type FacturePayload = {
  client_id: string;
  chantier_id: string | null;
  type: string;
  date_emission: string;
  date_echeance: string | null;
  notes_client: string | null;
  notes_internes: string | null;
  lignes: LigneDevis[];
};

export async function modifierFactureAction(factureId: string, payload: FacturePayload) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: facture } = await supabase.from("factures").select("statut, chantier_id").eq("id", factureId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!facture || facture.statut !== "brouillon") return { error: "Seule une facture brouillon peut être modifiée." };

  const lignes = payload.lignes.filter((ligne) => ligne.designation.trim()).map((ligne, ordre) => ({
    designation: ligne.designation.trim(),
    description: ligne.description?.trim() || null,
    type: ligne.type,
    quantite: Number(ligne.quantite) || 0,
    unite: ligne.unite || "u",
    prix_unitaire_ht: Number(ligne.prix_unitaire_ht) || 0,
    remise_ligne: Math.min(100, Math.max(0, Number(ligne.remise_ligne) || 0)),
    taux_tva: Number(ligne.taux_tva) || 0,
    ordre,
  }));
  if (!lignes.length) return { error: "Ajoutez au moins une ligne à la facture." };

  const { error } = await supabase.rpc("modifier_facture_brouillon", {
    p_facture_id: factureId,
    p_facture: {
      client_id: payload.client_id,
      chantier_id: payload.chantier_id,
      type: payload.type,
      date_emission: payload.date_emission,
      date_echeance: payload.date_echeance,
      notes_client: payload.notes_client,
      notes_internes: payload.notes_internes,
    },
    p_lignes: lignes,
  });
  if (error) return { error: messageErreurUtilisateur("creerFactureAction", error, "Impossible de créer cette facture. Vérifiez les informations saisies.") };
  revalidatePath("/factures");
  revalidatePath(`/factures/${factureId}`);
  revalidatePath(`/imprimer/factures/${factureId}`);
  revalidatePath("/dashboard");
  return { id: factureId };
}

export async function creerFactureDepuisDevisAction(devisId: string, type: string = "simple") {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: devis } = await supabase.from("devis").select("id").eq("id", devisId).eq("entreprise_id", ctx.entrepriseId).eq("statut", "accepte").single();
  if (!devis) redirect(`/devis/${devisId}?error=${encodeURIComponent("Devis accepté introuvable")}`);

  const { data, error } = await supabase.rpc("creer_facture_depuis_devis", {
    p_devis_id: devisId,
    p_type: type,
  });

  if (error || !data) {
    redirect(`/devis/${devisId}?error=${encodeURIComponent(messageErreurUtilisateur("creerFactureDepuisDevisAction", error, "Impossible de créer la facture depuis ce devis."))}`);
  }

  revalidatePath("/factures");
  redirect(`/factures/${data}`);
}

export async function changerStatutFactureAction(factureId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: facture } = await supabase.from("factures").select("statut, chantier_id, entreprise_snapshot").eq("id", factureId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!facture || (statut !== facture.statut && !(TRANSITIONS_FACTURES[facture.statut] ?? []).includes(statut))) {
    revalidatePath(`/factures/${factureId}`);
    return;
  }

  // Une facture émise garde à vie l'identité légale de l'entreprise telle
  // qu'elle était à l'émission (adresse, SIRET, logo, assurances, mentions) :
  // capturée une seule fois ici, à la sortie du statut brouillon, jamais
  // réécrite ensuite. Voir src/lib/documents-commerciaux.ts.
  let entrepriseSnapshot: Record<string, unknown> | undefined;
  if (facture.statut === "brouillon" && statut !== "brouillon" && !facture.entreprise_snapshot) {
    const { data: entreprise } = await supabase.from("entreprises").select("*").eq("id", ctx.entrepriseId).single();
    if (entreprise) entrepriseSnapshot = construireSnapshotEntreprise(entreprise);
  }

  const { error } = await supabase
    .from("factures")
    .update({ statut, updated_at: new Date().toISOString(), ...(entrepriseSnapshot ? { entreprise_snapshot: entrepriseSnapshot } : {}) })
    .eq("id", factureId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath(`/factures/${factureId}`);
    revalidatePath("/factures");
    revalidatePath("/dashboard");
    revalidatePath("/chantiers");
    if (facture.chantier_id) revalidatePath(`/chantiers/${facture.chantier_id}`);
  }
}

export async function envoyerFactureEmailAction(factureId: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && !permissions.includes("gerer_factures")) {
    return { error: "Votre poste ne permet pas d'envoyer de factures par e-mail." };
  }

  const { data: facturePaiement } = await supabase
    .from("factures")
    .select("stripe_checkout_url, lien_paiement_expire_at")
    .eq("id", factureId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  const lienPaiement = facturePaiement && lienPaiementStripeEstActif(facturePaiement.stripe_checkout_url, facturePaiement.lien_paiement_expire_at)
    ? facturePaiement.stripe_checkout_url
    : null;

  const resultat = await envoyerDocumentCommercialParEmail(supabase, {
    entrepriseId: ctx.entrepriseId,
    entrepriseNom: ctx.entrepriseNom,
    prenomEmetteur: ctx.prenom,
    userId: ctx.userId,
    typeDocument: "facture",
    documentId: factureId,
    complementCorps: lienPaiement ? `Vous pouvez régler cette facture en ligne de façon sécurisée :\n${lienPaiement}` : undefined,
  });
  if ("error" in resultat) return resultat;

  revalidatePath(`/factures/${factureId}`);
  revalidatePath("/factures");
  return { ok: true };
}

export async function enregistrerPaiementAction(factureId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const montant = Number(formData.get("montant"));
  if (!montant || montant <= 0) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent("Montant invalide")}`);
  }

  // enregistrer_paiement_facture verrouille la facture (for update) le temps de
  // la transaction : deux enregistrements concurrents (double clic, deux
  // onglets, deux utilisateurs) ne peuvent plus lire le même montant_paye
  // périmé ni dépasser ensemble le reste dû (GP-EXTERNAL-PILOT-CLOSURE-V1).
  const { error } = await supabase.rpc("enregistrer_paiement_facture", {
    p_entreprise_id: ctx.entrepriseId,
    p_facture_id: factureId,
    p_montant: montant,
    p_date: String(formData.get("date") || new Date().toISOString().slice(0, 10)),
    p_mode: String(formData.get("mode") || "virement"),
    p_reference: String(formData.get("reference") || "") || null,
  });

  if (error) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent(messageErreurUtilisateur("enregistrerPaiementAction", error, "Impossible d’enregistrer ce paiement."))}`);
  }

  revalidatePath(`/factures/${factureId}`);
  redirect(`/factures/${factureId}`);
}

export async function supprimerPaiementAction(paiementId: string, factureId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: facture } = await supabase.from("factures").select("id").eq("id", factureId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!facture) return;
  await supabase.from("paiements").delete().eq("id", paiementId).eq("facture_id", factureId);
  revalidatePath(`/factures/${factureId}`);
  revalidatePath("/factures");
  revalidatePath("/dashboard");
}

export async function modifierEcheanceFactureAction(factureId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const dateEcheance = String(formData.get("date_echeance") ?? "") || null;

  // GP-EXTERNAL-PILOT-CLOSURE-V1 — la date d'échéance est un champ légalement
  // significatif (base des pénalités de retard) : une fois la facture émise,
  // elle est figée comme les montants et les lignes (garde-fou dupliqué côté
  // base par verrouiller_facture_emise, qui refuserait de toute façon l'écriture).
  const { data: facture } = await supabase.from("factures").select("statut").eq("id", factureId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!facture) redirect(`/factures/${factureId}?error=${encodeURIComponent("Facture introuvable")}`);
  if (facture.statut !== "brouillon") {
    redirect(`/factures/${factureId}?error=${encodeURIComponent("Cette facture est déjà émise : sa date d’échéance est figée et ne peut plus être modifiée.")}`);
  }

  const { error } = await supabase
    .from("factures")
    .update({ date_echeance: dateEcheance, updated_at: new Date().toISOString() })
    .eq("id", factureId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (error) redirect(`/factures/${factureId}?error=${encodeURIComponent(messageErreurUtilisateur("modifierEcheanceFactureAction", error, "Impossible d’enregistrer cette échéance."))}`);
  revalidatePath(`/factures/${factureId}`);
  revalidatePath("/factures");
  revalidatePath("/dashboard");
  redirect(`/factures/${factureId}`);
}
