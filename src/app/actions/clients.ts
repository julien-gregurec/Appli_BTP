"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

export async function creerClientAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      entreprise_id: ctx.entrepriseId,
      type: champ(formData, "type") ?? "particulier",
      nom: champ(formData, "nom"),
      prenom: champ(formData, "prenom"),
      societe: champ(formData, "societe"),
      siret: champ(formData, "siret"),
      adresse_facturation: champ(formData, "adresse_facturation"),
      code_postal: champ(formData, "code_postal"),
      ville: champ(formData, "ville"),
      telephone: champ(formData, "telephone"),
      email: champ(formData, "email"),
      conditions_paiement: champ(formData, "conditions_paiement"),
      delai_paiement_jours: Math.min(365, Math.max(0, Number(formData.get("delai_paiement_jours")) || 0)),
      statut: champ(formData, "statut") ?? "prospect",
      notes: champ(formData, "notes"),
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/clients/nouveau?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

// Création rapide d'un client depuis le formulaire de devis (retourne du JSON, pas de redirect).
export type ClientRapide = {
  type: string;
  nom?: string | null;
  prenom?: string | null;
  societe?: string | null;
  telephone?: string | null;
  email?: string | null;
  code_postal?: string | null;
  ville?: string | null;
};

export async function creerClientRapideAction(
  data: ClientRapide,
): Promise<{ id: string; label: string } | { error: string }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const nom = data.nom?.trim() || null;
  const societe = data.societe?.trim() || null;
  if (!nom && !societe) {
    return { error: "Renseigne au moins un nom ou une société." };
  }

  const { data: cree, error } = await supabase
    .from("clients")
    .insert({
      entreprise_id: ctx.entrepriseId,
      type: data.type || "particulier",
      nom,
      prenom: data.prenom?.trim() || null,
      societe,
      telephone: data.telephone?.trim() || null,
      email: data.email?.trim() || null,
      code_postal: data.code_postal?.trim() || null,
      ville: data.ville?.trim() || null,
      statut: "prospect",
    })
    .select("id, nom, prenom, societe")
    .single();

  if (error || !cree) {
    return { error: error?.message ?? "Erreur lors de la création du client." };
  }

  revalidatePath("/clients");
  const label = cree.societe || [cree.prenom, cree.nom].filter(Boolean).join(" ") || "Client";
  return { id: cree.id, label };
}

export async function modifierClientAction(clientId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({
      type: champ(formData, "type") ?? "particulier",
      nom: champ(formData, "nom"),
      prenom: champ(formData, "prenom"),
      societe: champ(formData, "societe"),
      siret: champ(formData, "siret"),
      adresse_facturation: champ(formData, "adresse_facturation"),
      code_postal: champ(formData, "code_postal"),
      ville: champ(formData, "ville"),
      telephone: champ(formData, "telephone"),
      email: champ(formData, "email"),
      conditions_paiement: champ(formData, "conditions_paiement"),
      delai_paiement_jours: Math.min(365, Math.max(0, Number(formData.get("delai_paiement_jours")) || 0)),
      statut: champ(formData, "statut") ?? "prospect",
      notes: champ(formData, "notes"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (error) {
    redirect(`/clients/${clientId}/modifier?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}
