"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { TRANSITIONS_FACTURES } from "@/lib/factures";
import type { LigneDevis } from "@/lib/devis";

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
  if (error) return { error: error.message };
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
    redirect(`/devis/${devisId}?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  revalidatePath("/factures");
  redirect(`/factures/${data}`);
}

export async function changerStatutFactureAction(factureId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: facture } = await supabase.from("factures").select("statut, chantier_id").eq("id", factureId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!facture || (statut !== facture.statut && !(TRANSITIONS_FACTURES[facture.statut] ?? []).includes(statut))) {
    revalidatePath(`/factures/${factureId}`);
    return;
  }

  const { error } = await supabase
    .from("factures")
    .update({ statut, updated_at: new Date().toISOString() })
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

export async function enregistrerPaiementAction(factureId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const montant = Number(formData.get("montant"));
  if (!montant || montant <= 0) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent("Montant invalide")}`);
  }


  const { data: facture } = await supabase
    .from("factures")
    .select("montant_ttc, montant_paye, statut")
    .eq("id", factureId)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!facture) redirect(`/factures/${factureId}?error=${encodeURIComponent("Facture introuvable")}`);
  if (["brouillon", "annulee", "avoir_emis"].includes(facture.statut)) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent("Un paiement ne peut pas être ajouté à cette facture")}`);
  }
  const reste = Math.max(0, Number(facture.montant_ttc) - Number(facture.montant_paye));
  if (montant > reste + 0.005) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent(`Le paiement dépasse le reste dû (${reste.toFixed(2)} €)`)}`);
  }

  const { error } = await supabase.from("paiements").insert({
    facture_id: factureId,
    montant,
    date: String(formData.get("date") || new Date().toISOString().slice(0, 10)),
    mode: String(formData.get("mode") || "virement"),
    reference: String(formData.get("reference") || "") || null,
  });

  if (error) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent(error.message)}`);
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
  const { error } = await supabase
    .from("factures")
    .update({ date_echeance: dateEcheance, updated_at: new Date().toISOString() })
    .eq("id", factureId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (error) redirect(`/factures/${factureId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/factures/${factureId}`);
  revalidatePath("/factures");
  revalidatePath("/dashboard");
  redirect(`/factures/${factureId}`);
}
