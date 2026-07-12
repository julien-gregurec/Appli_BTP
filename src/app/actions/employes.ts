"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

function nombre(formData: FormData, nom: string): number | null {
  const value = champ(formData, nom);
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function payloadEmploye(formData: FormData) {
  return {
    prenom: champ(formData, "prenom"),
    nom: champ(formData, "nom"),
    email: champ(formData, "email"),
    telephone: champ(formData, "telephone"),
    poste: champ(formData, "poste"),
    type_contrat: champ(formData, "type_contrat") ?? "cdi",
    date_entree: champ(formData, "date_entree"),
    date_sortie: champ(formData, "date_sortie"),
    taux_horaire: nombre(formData, "taux_horaire"),
    cout_horaire: nombre(formData, "cout_horaire"),
    statut: champ(formData, "statut") ?? "actif",
    notes: champ(formData, "notes"),
  };
}

export async function creerEmployeAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const payload = payloadEmploye(formData);

  if (!payload.prenom || !payload.nom) {
    redirect(`/employes/nouveau?error=${encodeURIComponent("Prénom et nom obligatoires")}`);
  }

  const { data, error } = await supabase
    .from("employes")
    .insert({
      entreprise_id: ctx.entrepriseId,
      ...payload,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/employes/nouveau?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  revalidatePath("/employes");
  redirect(`/employes/${data.id}`);
}

export async function modifierEmployeAction(employeId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const payload = payloadEmploye(formData);

  if (!payload.prenom || !payload.nom) {
    redirect(`/employes/${employeId}/modifier?error=${encodeURIComponent("Prénom et nom obligatoires")}`);
  }

  const { error } = await supabase
    .from("employes")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employeId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (error) {
    redirect(`/employes/${employeId}/modifier?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/employes");
  revalidatePath(`/employes/${employeId}`);
  redirect(`/employes/${employeId}`);
}

export async function changerStatutEmployeAction(employeId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { error } = await supabase
    .from("employes")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", employeId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath("/employes");
    revalidatePath(`/employes/${employeId}`);
  }
}
