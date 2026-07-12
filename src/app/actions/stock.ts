"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { lireImportStock } from "@/lib/import-stock";
const champ = (fd: FormData, nom: string) => String(fd.get(nom) ?? "").trim() || null;

export async function creerArticleStockAction(fd: FormData) {
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const reference = champ(fd, "reference"); const designation = champ(fd, "designation");
  if (!reference || !designation) redirect(`/stock?error=${encodeURIComponent("Référence et désignation obligatoires")}`);
  const { error } = await supabase.from("articles_stock").insert({ entreprise_id: ctx.entrepriseId, reference, designation, unite: champ(fd, "unite") ?? "u", seuil_alerte: Number(fd.get("seuil_alerte")) || 0, prix_achat_ht: Number(fd.get("prix_achat_ht")) || 0, emplacement: champ(fd, "emplacement"),marque:champ(fd,"marque"),code_barres:champ(fd,"code_barres") });
  if (error) redirect(`/stock?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock"); redirect("/stock?succes=article");
}

export async function creerMouvementStockAction(fd: FormData) {
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const articleId = champ(fd, "article_id"); const type = champ(fd, "type"); const quantite = Number(fd.get("quantite"));
  if (!articleId || !type || !quantite || quantite <= 0) redirect(`/stock?error=${encodeURIComponent("Mouvement invalide")}`);
  const { data: article } = await supabase.from("articles_stock").select("id").eq("id", articleId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!article) redirect(`/stock?error=${encodeURIComponent("Article introuvable")}`);
  const { error } = await supabase.from("mouvements_stock").insert({ entreprise_id: ctx.entrepriseId, article_id: articleId, chantier_id: champ(fd, "chantier_id"),teinte_id:champ(fd,"teinte_id"), type, quantite, date: champ(fd, "date") ?? new Date().toISOString().slice(0, 10), motif: champ(fd, "motif") });
  if (error) redirect(`/stock?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock"); redirect("/stock?succes=mouvement");
}

export async function importerStockAction(fd:FormData){const ctx=await getContexteEntreprise(),supabase=await createClient(),fichier=fd.get("fichier"),type=String(fd.get("type_import")??"");if(!(fichier instanceof File)||!fichier.size)redirect(`/stock?error=${encodeURIComponent("Choisissez un fichier")}`);if(fichier.size>20*1024*1024)redirect(`/stock?error=${encodeURIComponent("Le fichier dépasse 20 Mo")}`);try{const lignes=await lireImportStock(fichier);if(!lignes.length)throw new Error("Aucune ligne produit détectée");const{data,error}=await supabase.rpc("importer_articles_stock",{p_entreprise_id:ctx.entrepriseId,p_type:type,p_lignes:lignes});if(error)throw error;revalidatePath("/stock");revalidatePath("/inventaires");redirect(`/stock?succes=${encodeURIComponent(`${data} ligne(s) importée(s)`)}`)}catch(e){if(e&&typeof e==="object"&&"digest"in e)throw e;redirect(`/stock?error=${encodeURIComponent(e instanceof Error?e.message:"Import impossible")}`)}}
export async function ajouterTeinteAction(articleId:string,fd:FormData){const ctx=await getContexteEntreprise(),supabase=await createClient(),nom=champ(fd,"nom"),hex=champ(fd,"code_hex");if(!nom)redirect(`/stock/${articleId}?error=${encodeURIComponent("Nom de teinte obligatoire")}`);const{data:a}=await supabase.from("articles_stock").select("id").eq("id",articleId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();if(!a)redirect("/stock");const{error}=await supabase.from("article_teintes").insert({entreprise_id:ctx.entrepriseId,article_id:articleId,nom,reference:champ(fd,"reference"),code_hex:hex});if(error)redirect(`/stock/${articleId}?error=${encodeURIComponent(error.message)}`);revalidatePath("/stock");revalidatePath(`/stock/${articleId}`);redirect(`/stock/${articleId}?success=Teinte ajoutée`)}
