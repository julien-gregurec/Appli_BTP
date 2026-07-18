"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { delaiPaiementFournisseurValide } from "@/lib/echeances-fournisseurs";

const valeur = (formData: FormData, nom: string) => String(formData.get(nom) ?? "").trim();
const chemin = "/sous-traitants";

export async function creerSousTraitantAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const nom = valeur(formData, "nom");
  const delai = Number(valeur(formData, "delai_paiement_jours") || "30");
  if (!nom) redirect(`${chemin}?error=${encodeURIComponent("Le nom du sous-traitant est obligatoire")}`);
  if (!delaiPaiementFournisseurValide(delai)) redirect(`${chemin}?error=${encodeURIComponent("Le délai de paiement est invalide")}`);
  const { data, error } = await supabase.from("fournisseurs").insert({
    entreprise_id: ctx.entrepriseId,
    type_tiers: "sous_traitant",
    nom,
    specialite: valeur(formData, "specialite") || null,
    contact_nom: valeur(formData, "contact_nom") || null,
    email: valeur(formData, "email") || null,
    telephone: valeur(formData, "telephone") || null,
    siret: valeur(formData, "siret") || null,
    delai_paiement_jours: delai,
  }).select("id").single();
  if (error || !data) redirect(`${chemin}?error=${encodeURIComponent(error?.message ?? "Création impossible")}`);
  revalidatePath(chemin);
  redirect(`${chemin}/${data.id}?success=${encodeURIComponent("Sous-traitant créé")}`);
}

export async function modifierSousTraitantAction(id: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const nom = valeur(formData, "nom");
  const delai = Number(valeur(formData, "delai_paiement_jours") || "30");
  if (!nom) redirect(`${chemin}/${id}?error=${encodeURIComponent("Le nom est obligatoire")}`);
  if (!delaiPaiementFournisseurValide(delai)) redirect(`${chemin}/${id}?error=${encodeURIComponent("Le délai de paiement est invalide")}`);
  const { error } = await supabase.from("fournisseurs").update({
    nom,
    specialite: valeur(formData, "specialite") || null,
    contact_nom: valeur(formData, "contact_nom") || null,
    email: valeur(formData, "email") || null,
    telephone: valeur(formData, "telephone") || null,
    adresse: valeur(formData, "adresse") || null,
    code_postal: valeur(formData, "code_postal") || null,
    ville: valeur(formData, "ville") || null,
    siret: valeur(formData, "siret") || null,
    numero_tva: valeur(formData, "numero_tva") || null,
    assurance_rc_pro: valeur(formData, "assurance_rc_pro") || null,
    assurance_decennale: valeur(formData, "assurance_decennale") || null,
    date_validite_assurance: valeur(formData, "date_validite_assurance") || null,
    delai_paiement_jours: delai,
    notes: valeur(formData, "notes") || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("entreprise_id", ctx.entrepriseId).eq("type_tiers", "sous_traitant");
  if (error) redirect(`${chemin}/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(chemin);
  revalidatePath(`${chemin}/${id}`);
  redirect(`${chemin}/${id}?success=${encodeURIComponent("Fiche mise à jour")}`);
}

export async function changerActivationSousTraitantAction(id: string, actif: boolean) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  await supabase.from("fournisseurs").update({ actif, updated_at: new Date().toISOString() })
    .eq("id", id).eq("entreprise_id", ctx.entrepriseId).eq("type_tiers", "sous_traitant");
  revalidatePath(chemin);
  revalidatePath(`${chemin}/${id}`);
}

export async function affecterSousTraitantAction(id: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const chantierId = valeur(formData, "chantier_id");
  const mission = valeur(formData, "mission");
  if (!chantierId || !mission) redirect(`${chemin}/${id}?error=${encodeURIComponent("Le chantier et la mission sont obligatoires")}`);
  const montant = Number(valeur(formData, "montant_previsionnel_ht") || "0");
  if (!Number.isFinite(montant) || montant < 0) redirect(`${chemin}/${id}?error=${encodeURIComponent("Le montant prévisionnel est invalide")}`);
  const { error } = await supabase.from("sous_traitants_chantiers").insert({
    entreprise_id: ctx.entrepriseId,
    fournisseur_id: id,
    chantier_id: chantierId,
    mission,
    date_debut: valeur(formData, "date_debut") || null,
    date_fin: valeur(formData, "date_fin") || null,
    montant_previsionnel_ht: montant,
    statut: valeur(formData, "statut") || "prevue",
    notes: valeur(formData, "notes") || null,
  });
  if (error) redirect(`${chemin}/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`${chemin}/${id}`);
  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath("/rentabilite");
  redirect(`${chemin}/${id}?success=${encodeURIComponent("Sous-traitant affecté au chantier")}`);
}

export async function retirerAffectationSousTraitantAction(id: string, affectationId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase.from("sous_traitants_chantiers").select("chantier_id")
    .eq("id", affectationId).eq("entreprise_id", ctx.entrepriseId).eq("fournisseur_id", id).maybeSingle();
  const { error } = await supabase.from("sous_traitants_chantiers").delete()
    .eq("id", affectationId).eq("entreprise_id", ctx.entrepriseId).eq("fournisseur_id", id);
  if (error) redirect(`${chemin}/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`${chemin}/${id}`);
  if (data?.chantier_id) revalidatePath(`/chantiers/${data.chantier_id}`);
  revalidatePath("/rentabilite");
}
