"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import type { LigneDevis } from "@/lib/devis";
import { TRANSITIONS_DEVIS } from "@/lib/devis";

type DevisPayload = {
  client_id: string;
  chantier_id: string | null;
  date_emission: string | null;
  date_validite: string | null;
  conditions: string | null;
  notes_client: string | null;
  notes_internes: string | null;
  remise_globale: number;
  lignes: LigneDevis[];
};

function nettoieLignes(lignes: LigneDevis[]) {
  return lignes
    .filter((l) => l.designation.trim() !== "")
    .map((l, i) => ({
      designation: l.designation.trim(),
      description: l.description?.trim() || null,
      type: l.type,
      quantite: Number(l.quantite) || 0,
      unite: l.unite || "u",
      prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
      remise_ligne: Number(l.remise_ligne) || 0,
      taux_tva: Number(l.taux_tva) || 0,
      ordre: i,
    }));
}

export async function creerDevisAction(payload: DevisPayload) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const lignes = nettoieLignes(payload.lignes);

  const { data: devisId, error } = await supabase.rpc("creer_devis_brouillon", {
    p_entreprise_id: ctx.entrepriseId,
    p_devis: {
      client_id: payload.client_id,
      chantier_id: payload.chantier_id,
      date_emission: payload.date_emission,
      date_validite: payload.date_validite,
      conditions: payload.conditions,
      notes_client: payload.notes_client,
      notes_internes: payload.notes_internes,
      remise_globale: payload.remise_globale,
    },
    p_lignes: lignes,
  });

  if (error || !devisId) {
    return { error: error?.message ?? "Erreur à la création du devis" };
  }

  revalidatePath("/devis");
  revalidatePath("/dashboard");
  return { id: devisId as string };
}

export async function modifierDevisAction(devisId: string, payload: DevisPayload) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: existant } = await supabase
    .from("devis")
    .select("statut")
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!existant || existant.statut !== "brouillon") {
    return { error: "Seul un devis brouillon peut être modifié." };
  }

  const lignes = nettoieLignes(payload.lignes);
  const { error } = await supabase.rpc("modifier_devis_brouillon", {
    p_devis_id: devisId,
    p_devis: {
      client_id: payload.client_id,
      chantier_id: payload.chantier_id,
      date_validite: payload.date_validite,
      conditions: payload.conditions,
      notes_client: payload.notes_client,
      notes_internes: payload.notes_internes,
      remise_globale: payload.remise_globale,
    },
    p_lignes: lignes,
  });

  if (error) return { error: error.message };

  revalidatePath("/devis");
  revalidatePath(`/devis/${devisId}`);
  revalidatePath(`/imprimer/devis/${devisId}`);
  return { id: devisId };
}

export async function associerDevisChantierAction(devisId: string, retour: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const destination = retour.startsWith("/chantiers/") || retour === `/devis/${devisId}` ? retour : `/devis/${devisId}`;
  const avecMessage = (type: "error" | "success", message: string) =>
    `${destination}${destination.includes("?") ? "&" : "?"}${type}=${encodeURIComponent(message)}`;

  if (permissions !== null && !permissions.includes("gerer_devis")) {
    redirect(avecMessage("error", "Votre poste permet de consulter les devis, mais pas de modifier leur chantier."));
  }

  const chantierId = String(formData.get("chantier_id") ?? "").trim() || null;
  const { data: devis } = await supabase
    .from("devis")
    .select("id,client_id,chantier_id,statut")
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();

  if (!devis) redirect(avecMessage("error", "Devis introuvable dans cette entreprise."));
  if (!chantierId && devis.statut === "accepte") {
    redirect(avecMessage("error", "Un devis accepté doit rester associé à un chantier afin de conserver ses tâches."));
  }

  if (chantierId) {
    const { data: chantier } = await supabase
      .from("chantiers")
      .select("id,client_id")
      .eq("id", chantierId)
      .eq("entreprise_id", ctx.entrepriseId)
      .maybeSingle();
    if (!chantier) redirect(avecMessage("error", "Chantier introuvable dans cette entreprise."));
    if (chantier.client_id !== devis.client_id) {
      redirect(avecMessage("error", "Le devis et le chantier doivent appartenir au même client."));
    }
  }

  const ancienChantierId = devis.chantier_id as string | null;
  const { error } = await supabase
    .from("devis")
    .update({ chantier_id: chantierId, updated_at: new Date().toISOString() })
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId);
  if (error) redirect(avecMessage("error", error.message));

  revalidatePath("/devis");
  revalidatePath(`/devis/${devisId}`);
  revalidatePath(`/imprimer/devis/${devisId}`);
  revalidatePath("/chantiers");
  revalidatePath("/mes-travaux");
  if (ancienChantierId) revalidatePath(`/chantiers/${ancienChantierId}`);
  if (chantierId) revalidatePath(`/chantiers/${chantierId}`);
  redirect(avecMessage("success", chantierId ? "Devis et chantier associés." : "Le devis n’est plus associé à un chantier."));
}

export async function associerDevisDepuisChantierAction(chantierId: string, formData: FormData) {
  const devisId = String(formData.get("devis_id") ?? "").trim();
  if (!devisId) redirect(`/chantiers/${chantierId}?error=${encodeURIComponent("Sélectionnez un devis à associer.")}`);
  formData.set("chantier_id", chantierId);
  await associerDevisChantierAction(devisId, `/chantiers/${chantierId}`, formData);
}

export async function changerStatutDevisAction(devisId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: devis } = await supabase.from("devis").select("statut, chantier_id").eq("id", devisId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!devis || (statut !== devis.statut && !(TRANSITIONS_DEVIS[devis.statut] ?? []).includes(statut))) {
    revalidatePath(`/devis/${devisId}`);
    return;
  }

  const { error } = await supabase
    .from("devis")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath(`/devis/${devisId}`);
    revalidatePath("/devis");
    revalidatePath("/dashboard");
    revalidatePath("/chantiers");
    if (devis.chantier_id) revalidatePath(`/chantiers/${devis.chantier_id}`);
  }
}

export async function supprimerDevisAction(devisId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: devis } = await supabase
    .from("devis")
    .select("statut")
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!devis || !["brouillon", "refuse", "annule"].includes(devis.statut)) {
    redirect(`/devis/${devisId}`);
  }

  await supabase.from("devis").delete().eq("id", devisId).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/devis");
  redirect("/devis");
}

export async function dupliquerDevisAction(devisId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: source } = await supabase.from("devis").select("id").eq("id", devisId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!source) redirect("/devis");
  const { data, error } = await supabase.rpc("dupliquer_devis", { p_devis_id: devisId });

  if (error || !data) {
    redirect(`/devis/${devisId}?error=${encodeURIComponent(error?.message ?? "Impossible de dupliquer le devis")}`);
  }

  revalidatePath("/devis");
  redirect(`/devis/${data}/modifier`);
}
