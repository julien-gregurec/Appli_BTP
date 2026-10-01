"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { chargerIdsLignesInventaire } from "@/lib/stock-donnees";

const champ = (formData: FormData, nom: string) => String(formData.get(nom) ?? "").trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function creerInventaireAction(formData: FormData) {
  const contexte = await getContexteEntreprise();
  const supabase = await createClient();
  const articles = [...new Set(formData.getAll("article_id").map(String).filter((id) => uuid.test(id)))];
  if (!articles.length) redirect(`/inventaires?error=${encodeURIComponent("Sélectionnez au moins un article du dépôt")}`);
  const { data, error } = await supabase.rpc("creer_inventaire_stock_selection", {
    p_entreprise_id: contexte.entrepriseId,
    p_zone_id: champ(formData, "zone_id") || null,
    p_article_ids: articles,
    p_commentaire: champ(formData, "commentaire") || null,
  });
  if (error || !data) redirect(`/inventaires?error=${encodeURIComponent(messageErreurUtilisateur("creerInventaireAction", error, "Impossible de créer l’inventaire."))}`);
  revalidatePath("/inventaires");
  redirect(`/inventaires/${data}`);
}

export async function enregistrerInventaireAction(id: string, formData: FormData) {
  const contexte = await getContexteEntreprise();
  const supabase = await createClient();
  // Toutes les lignes (lecture complète) : la RPC refuse un comptage partiel.
  const lignes = await chargerIdsLignesInventaire(supabase, contexte.entrepriseId, id);
  if (!lignes) redirect(`/inventaires/${id}?error=${encodeURIComponent("Inventaire introuvable")}`);
  const comptages = lignes.map((ligneId) => ({ ligne_id: ligneId, quantite: Number(champ(formData, `q_${ligneId}`)) }));
  const valider = champ(formData, "intention") === "valider";
  const { error } = await supabase.rpc("enregistrer_comptage_inventaire", { p_entreprise_id: contexte.entrepriseId, p_inventaire_id: id, p_comptages: comptages, p_valider: valider });
  if (error) redirect(`/inventaires/${id}?error=${encodeURIComponent(messageErreurUtilisateur("enregistrerComptageInventaireAction", error, "Impossible d’enregistrer ce comptage."))}`);
  revalidatePath("/inventaires");
  revalidatePath(`/inventaires/${id}`);
  revalidatePath("/stock");
  redirect(`/inventaires/${id}?success=${encodeURIComponent(valider ? "Inventaire validé et stock ajusté" : "Comptage enregistré")}`);
}
