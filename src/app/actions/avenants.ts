"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import type { LigneAvenant } from "@/lib/avenants";
import { TRANSITIONS_AVENANTS } from "@/lib/avenants";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

type AvenantPayload = {
  devis_origine_id: string;
  notes_client: string | null;
  notes_internes: string | null;
  lignes: LigneAvenant[];
};

function nettoieLignes(lignes: LigneAvenant[]) {
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

export async function creerAvenantAction(payload: AvenantPayload) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const lignes = nettoieLignes(payload.lignes);

  const { data: avenantId, error } = await supabase.rpc("creer_avenant", {
    p_entreprise_id: ctx.entrepriseId,
    p_devis_origine_id: payload.devis_origine_id,
    p_notes_client: payload.notes_client,
    p_notes_internes: payload.notes_internes,
    p_lignes: lignes,
  });

  if (error || !avenantId) {
    return { error: messageErreurUtilisateur("creerAvenantAction", error, "Impossible de créer cet avenant. Vérifiez que le devis est bien accepté.") };
  }

  revalidatePath("/chantiers");
  revalidatePath("/devis");
  revalidatePath("/rentabilite");
  return { id: avenantId as string };
}

export async function modifierAvenantAction(avenantId: string, payload: AvenantPayload) {
  await getContexteEntreprise();
  const supabase = await createClient();
  const lignes = nettoieLignes(payload.lignes);

  const { error } = await supabase.rpc("modifier_avenant_brouillon", {
    p_avenant_id: avenantId,
    p_notes_client: payload.notes_client,
    p_notes_internes: payload.notes_internes,
    p_lignes: lignes,
  });

  if (error) {
    return { error: messageErreurUtilisateur("modifierAvenantAction", error, "Impossible d'enregistrer ces modifications.") };
  }

  revalidatePath(`/avenants/${avenantId}`);
  revalidatePath("/chantiers");
  revalidatePath("/rentabilite");
  return { id: avenantId };
}

export async function changerStatutAvenantAction(avenantId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: avenant } = await supabase.from("avenants").select("statut, chantier_id").eq("id", avenantId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!avenant || (statut !== avenant.statut && !(TRANSITIONS_AVENANTS[avenant.statut] ?? []).includes(statut))) {
    revalidatePath(`/avenants/${avenantId}`);
    return;
  }

  const { error } = await supabase
    .from("avenants")
    .update({ statut })
    .eq("id", avenantId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath(`/avenants/${avenantId}`);
    revalidatePath("/chantiers");
    revalidatePath(`/chantiers/${avenant.chantier_id}`);
    revalidatePath("/devis");
    revalidatePath("/rentabilite");
    revalidatePath("/dashboard");
  }
}

export async function supprimerAvenantAction(avenantId: string, chantierId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: avenant } = await supabase.from("avenants").select("statut").eq("id", avenantId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!avenant || avenant.statut !== "brouillon") {
    redirect(`/chantiers/${chantierId}`);
  }

  await supabase.from("avenants").delete().eq("id", avenantId).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath(`/chantiers/${chantierId}`);
  redirect(`/chantiers/${chantierId}`);
}
