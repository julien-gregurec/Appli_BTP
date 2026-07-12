"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import type { LigneDevis } from "@/lib/devis";
import type { PrestationCatalogue } from "@/lib/prestations";

function champ(formData: FormData, nom: string) {
  return String(formData.get(nom) ?? "").trim();
}

function payloadFormulaire(formData: FormData) {
  return {
    designation: champ(formData, "designation"),
    description: champ(formData, "description") || null,
    type: champ(formData, "type") || "main_oeuvre",
    unite: champ(formData, "unite") || "h",
    prix_unitaire_ht: Number(champ(formData, "prix_unitaire_ht").replace(",", ".")) || 0,
    taux_tva: Number(champ(formData, "taux_tva").replace(",", ".")) || 0,
  };
}

export async function creerPrestationDepuisLigneAction(ligne: LigneDevis) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const designation = ligne.designation.trim();

  if (!designation) return { error: "La prestation doit avoir une désignation." };
  if (Number(ligne.prix_unitaire_ht) < 0) return { error: "Le prix ne peut pas être négatif." };

  const { data, error } = await supabase
    .from("prestations_catalogue")
    .insert({
      entreprise_id: ctx.entrepriseId,
      designation,
      description: ligne.description?.trim() || null,
      type: ligne.type,
      unite: ligne.unite || "u",
      prix_unitaire_ht: Number(ligne.prix_unitaire_ht) || 0,
      taux_tva: Number(ligne.taux_tva) || 0,
    })
    .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva")
    .single();

  if (error || !data) {
    const doublon = error?.code === "23505";
    return { error: doublon ? "Une prestation porte déjà ce nom." : (error?.message ?? "Impossible d’enregistrer la prestation.") };
  }

  return { prestation: data as PrestationCatalogue };
}

export async function creerPrestationAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const payload = payloadFormulaire(formData);

  if (!payload.designation) redirect(`/prestations/nouveau?error=${encodeURIComponent("Désignation obligatoire")}`);
  if (payload.prix_unitaire_ht < 0) redirect(`/prestations/nouveau?error=${encodeURIComponent("Le prix ne peut pas être négatif")}`);

  const { error } = await supabase.from("prestations_catalogue").insert({
    entreprise_id: ctx.entrepriseId,
    ...payload,
  });

  if (error) {
    const message = error.code === "23505" ? "Une prestation porte déjà ce nom" : error.message;
    redirect(`/prestations/nouveau?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
  redirect("/prestations");
}

export async function modifierPrestationAction(id: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const payload = payloadFormulaire(formData);

  if (!payload.designation) redirect(`/prestations/${id}/modifier?error=${encodeURIComponent("Désignation obligatoire")}`);

  const { error } = await supabase
    .from("prestations_catalogue")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId);

  if (error) redirect(`/prestations/${id}/modifier?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
  redirect("/prestations");
}

export async function changerActivationPrestationAction(id: string, actif: boolean) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  await supabase
    .from("prestations_catalogue")
    .update({ actif, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
}
