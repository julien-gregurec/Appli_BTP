"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

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
  if (error || !data) redirect(`/inventaires?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  revalidatePath("/inventaires");
  redirect(`/inventaires/${data}`);
}

export async function enregistrerInventaireAction(id: string, formData: FormData) {
  const contexte = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: lignes } = await supabase.from("lignes_inventaire").select("id").eq("inventaire_id", id).eq("entreprise_id", contexte.entrepriseId);
  if (!lignes) redirect(`/inventaires/${id}?error=${encodeURIComponent("Inventaire introuvable")}`);
  const comptages = lignes.map((ligne) => ({ ligne_id: ligne.id, quantite: Number(champ(formData, `q_${ligne.id}`)) }));
  const valider = champ(formData, "intention") === "valider";
  const { error } = await supabase.rpc("enregistrer_comptage_inventaire", { p_entreprise_id: contexte.entrepriseId, p_inventaire_id: id, p_comptages: comptages, p_valider: valider });
  if (error) redirect(`/inventaires/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/inventaires");
  revalidatePath(`/inventaires/${id}`);
  revalidatePath("/stock");
  redirect(`/inventaires/${id}?success=${encodeURIComponent(valider ? "Inventaire validé et stock ajusté" : "Comptage enregistré")}`);
}
