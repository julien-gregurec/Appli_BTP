"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { structurerCompteRendu } from "@/lib/ai/compteRendu";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";

export async function structurerCompteRenduIAAction(transcription: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  const texte = transcription.trim();
  if (!texte) return { error: "Rien à structurer : dicte ou écris d'abord un texte." };
  if (texte.length > 8000) return { error: "Texte trop long (8000 caractères max)." };

  const depassement = await verifierPlafondIA(supabase, ctx.entrepriseId);
  if (depassement) return { error: depassement };

  try {
    const { titre, contenu } = await structurerCompteRendu(texte);
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "compte_rendu", statut: "succes" });
    return { titre, contenu };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de la structuration IA.";
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "compte_rendu", statut: "erreur", messageErreur: message });
    return { error: message };
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
