"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { structurerCompteRendu } from "@/lib/ai/compteRendu";

export async function structurerCompteRenduIAAction(transcription: string) {
  await getContexteEntreprise();
  const texte = transcription.trim();
  if (!texte) return { error: "Rien à structurer : dicte ou écris d'abord un texte." };
  if (texte.length > 8000) return { error: "Texte trop long (8000 caractères max)." };

  try {
    const { titre, contenu } = await structurerCompteRendu(texte);
    return { titre, contenu };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur lors de la structuration IA." };
  }
}

export async function enregistrerCompteRenduAction(
  chantierId: string,
  titre: string,
  contenu: string,
  transcriptionBrute: string,
) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const titreNettoye = titre.trim() || "Compte-rendu";
  const contenuNettoye = contenu.trim();
  if (!contenuNettoye) return { error: "Le compte-rendu est vide." };

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("id")
    .eq("id", chantierId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!chantier) return { error: "Chantier introuvable." };

  const { data, error } = await supabase
    .from("comptes_rendus_chantier")
    .insert({
      entreprise_id: ctx.entrepriseId,
      chantier_id: chantierId,
      auteur_id: ctx.userId,
      titre: titreNettoye,
      contenu: contenuNettoye,
      transcription_brute: transcriptionBrute.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Erreur à l'enregistrement." };

  revalidatePath(`/chantiers/${chantierId}/comptes-rendus`);
  return { id: data.id as string };
}
