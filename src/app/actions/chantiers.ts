"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

export async function creerChantierAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const clientId = champ(formData, "client_id");
  if (!clientId) {
    redirect(`/chantiers/nouveau?error=${encodeURIComponent("Client obligatoire")}`);
  }

  const { data, error } = await supabase
    .from("chantiers")
    .insert({
      entreprise_id: ctx.entrepriseId,
      client_id: clientId,
      nom: champ(formData, "nom"),
      adresse: champ(formData, "adresse"),
      code_postal: champ(formData, "code_postal"),
      ville: champ(formData, "ville"),
      type_chantier_id: champ(formData, "type_chantier_id"),
      statut: champ(formData, "statut") ?? "prospect",
      date_debut_prevue: champ(formData, "date_debut_prevue"),
      date_fin_prevue: champ(formData, "date_fin_prevue"),
      budget_previsionnel: champ(formData, "budget_previsionnel"),
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/chantiers/nouveau?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  revalidatePath("/chantiers");
  redirect(`/chantiers/${data.id}`);
}

export async function changerStatutChantierAction(chantierId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { error } = await supabase
    .from("chantiers")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", chantierId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath(`/chantiers/${chantierId}`);
    revalidatePath("/chantiers");
  }
}

export async function ajouterTacheAction(chantierId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const libelle = String(formData.get("libelle") ?? "").trim();
  if (libelle === "") return;
  const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!chantier) return;

  await supabase.from("taches").insert({
    chantier_id: chantierId,
    libelle,
    echeance: champ(formData, "echeance"),
  });

  revalidatePath(`/chantiers/${chantierId}`);
}

export async function basculerTacheAction(tacheId: string, chantierId: string, fait: boolean) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!chantier) return;

  await supabase
    .from("taches")
    .update({ statut: fait ? "fait" : "a_faire" })
    .eq("id", tacheId)
    .eq("chantier_id", chantierId);

  revalidatePath(`/chantiers/${chantierId}`);
}
