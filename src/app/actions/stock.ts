"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { lireImportStock } from "@/lib/import-stock";
import { nomFichierSecurise } from "@/lib/documents";
const champ = (fd: FormData, nom: string) => String(fd.get(nom) ?? "").trim() || null;

export async function creerArticleStockAction(fd: FormData) {
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const reference = champ(fd, "reference"); const designation = champ(fd, "designation");
  if (!reference || !designation) redirect(`/stock?error=${encodeURIComponent("Référence et désignation obligatoires")}`);
  const { error } = await supabase.from("articles_stock").insert({ entreprise_id: ctx.entrepriseId, reference, designation, unite: champ(fd, "unite") ?? "u", seuil_alerte: Number(fd.get("seuil_alerte")) || 0, prix_achat_ht: Number(fd.get("prix_achat_ht")) || 0, prix_vente_ht: Number(fd.get("prix_vente_ht")) || 0, emplacement: champ(fd, "emplacement"),marque:champ(fd,"marque"),code_barres:champ(fd,"code_barres") });
  if (error) redirect(`/stock?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock"); redirect("/stock?succes=article");
}

export async function creerMouvementStockAction(fd: FormData) {
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const articleId = champ(fd, "article_id"); const type = champ(fd, "type"); const quantite = Number(fd.get("quantite"));
  if (!articleId || !type || !quantite || quantite <= 0) redirect(`/stock?error=${encodeURIComponent("Mouvement invalide")}`);
  if (type === "sortie" && !champ(fd, "chantier_id")) redirect(`/stock?error=${encodeURIComponent("Le chantier est obligatoire pour une sortie de stock")}`);
  const { data: article } = await supabase.from("articles_stock").select("id").eq("id", articleId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!article) redirect(`/stock?error=${encodeURIComponent("Article introuvable")}`);
  const { data: employe } = await supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  const { error } = await supabase.from("mouvements_stock").insert({ entreprise_id: ctx.entrepriseId, article_id: articleId, chantier_id: champ(fd, "chantier_id"),teinte_id:champ(fd,"teinte_id"), type, quantite, date: champ(fd, "date") ?? new Date().toISOString().slice(0, 10), motif: champ(fd, "motif"), employe_id: employe?.id ?? null, cree_par_utilisateur_id: ctx.userId });
  if (error) redirect(`/stock?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock"); redirect("/stock?succes=mouvement");
}

export async function modifierPrixArticleStockAction(articleId:string,fd:FormData){
  const ctx=await getContexteEntreprise(),supabase=await createClient();
  const achat=Number(fd.get("prix_achat_ht")),vente=Number(fd.get("prix_vente_ht"));
  if(!Number.isFinite(achat)||achat<0||!Number.isFinite(vente)||vente<0)redirect(`/stock/${articleId}?error=${encodeURIComponent("Prix invalides")}`);
  const{error}=await supabase.from("articles_stock").update({prix_achat_ht:achat,prix_vente_ht:vente}).eq("id",articleId).eq("entreprise_id",ctx.entrepriseId);
  if(error)redirect(`/stock/${articleId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock");revalidatePath(`/stock/${articleId}`);redirect(`/stock/${articleId}?success=${encodeURIComponent("Prix enregistrés")}`);
}

export async function mouvementStockBorneAction(fd: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const type = champ(fd, "type") ?? "sortie";
  const quantite = Number(fd.get("quantite"));
  let identifiantEmploye = champ(fd, "identifiant_employe");
  const motDePasse = champ(fd, "mot_de_passe_stock");
  const codeArticle = champ(fd, "code_article");
  if (!identifiantEmploye || !motDePasse || !codeArticle || !Number.isFinite(quantite) || quantite <= 0) {
    redirect(`/stock/borne?error=${encodeURIComponent("Identifiant salarié, mot de passe, article et quantité sont obligatoires")}`);
  }
  if(identifiantEmploye.toUpperCase().startsWith("LGP-EMP-")){
    const{data,error}=await supabase.rpc("identifiant_employe_depuis_qr_borne",{p_entreprise_id:ctx.entrepriseId,p_code:identifiantEmploye});
    if(error||!data)redirect(`/stock/borne?error=${encodeURIComponent("QR salarié inconnu ou inactif")}`);
    identifiantEmploye=data;
  }
  const { error } = await supabase.rpc("enregistrer_mouvement_stock_borne_v4", {
    p_entreprise_id: ctx.entrepriseId,
    p_identifiant_employe: identifiantEmploye,
    p_mot_de_passe: motDePasse,
    p_code_article: codeArticle,
    p_type: type,
    p_quantite: quantite,
    p_chantier_id: champ(fd, "chantier_id"),
    p_code_chantier: champ(fd, "code_chantier"),
    p_vehicule_id: champ(fd, "vehicule_id"),
    p_code_vehicule: champ(fd, "code_vehicule"),
    p_outil_id: champ(fd, "outil_id"),
    p_code_outil: champ(fd, "code_outil"),
    p_teinte_id: null,
    p_motif: champ(fd, "motif"),
  });
  if (error) redirect(`/stock/borne?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock");
  revalidatePath("/stock/borne");
  redirect(`/stock/borne?succes=${encodeURIComponent("Mouvement enregistré à votre nom")}`);
}

export async function definirMotDePasseStockPersonnelAction(fd: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const motDePasse = champ(fd, "mot_de_passe_stock") ?? "";
  const confirmation = champ(fd, "mot_de_passe_stock_confirmation") ?? "";
  if (motDePasse !== confirmation) {
    redirect(`/mon-espace?error=${encodeURIComponent("Les deux mots de passe ne correspondent pas")}`);
  }
  if (motDePasse.length < 8 || motDePasse.length > 72 || !/[A-Za-zÀ-ÿ]/.test(motDePasse) || !/[0-9]/.test(motDePasse)) {
    redirect(`/mon-espace?error=${encodeURIComponent("Utilisez 8 à 72 caractères avec au moins une lettre et un chiffre")}`);
  }
  const { error } = await supabase.rpc("definir_mot_de_passe_stock_personnel", {
    p_entreprise_id: ctx.entrepriseId,
    p_mot_de_passe: motDePasse,
  });
  if (error) redirect(`/mon-espace?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/mon-espace");
  redirect(`/mon-espace?succes=${encodeURIComponent("Votre accès personnel à la borne stock est actif")}`);
}

export async function importerStockAction(fd:FormData){const ctx=await getContexteEntreprise(),supabase=await createClient(),fichier=fd.get("fichier"),type=String(fd.get("type_import")??"");if(!(fichier instanceof File)||!fichier.size)redirect(`/stock?error=${encodeURIComponent("Choisissez un fichier")}`);if(fichier.size>20*1024*1024)redirect(`/stock?error=${encodeURIComponent("Le fichier dépasse 20 Mo")}`);try{const lignes=await lireImportStock(fichier);if(!lignes.length)throw new Error("Aucune ligne produit détectée");const{data,error}=await supabase.rpc("importer_articles_stock",{p_entreprise_id:ctx.entrepriseId,p_type:type,p_lignes:lignes});if(error)throw error;revalidatePath("/stock");revalidatePath("/inventaires");redirect(`/stock?succes=${encodeURIComponent(`${data} ligne(s) importée(s)`)}`)}catch(e){if(e&&typeof e==="object"&&"digest"in e)throw e;redirect(`/stock?error=${encodeURIComponent(e instanceof Error?e.message:"Import impossible")}`)}}
export async function ajouterTeinteAction(articleId:string,fd:FormData){const ctx=await getContexteEntreprise(),supabase=await createClient(),nom=champ(fd,"nom"),hex=champ(fd,"code_hex");if(!nom)redirect(`/stock/${articleId}?error=${encodeURIComponent("Nom de teinte obligatoire")}`);const{data:a}=await supabase.from("articles_stock").select("id").eq("id",articleId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();if(!a)redirect("/stock");const{error}=await supabase.from("article_teintes").insert({entreprise_id:ctx.entrepriseId,article_id:articleId,nom,reference:champ(fd,"reference"),code_hex:hex});if(error)redirect(`/stock/${articleId}?error=${encodeURIComponent(error.message)}`);revalidatePath("/stock");revalidatePath(`/stock/${articleId}`);redirect(`/stock/${articleId}?success=Teinte ajoutée`)}

export async function ajouterFicheTechniqueArticleAction(articleId:string,fd:FormData){
  const ctx=await getContexteEntreprise(),supabase=await createClient();const fichier=fd.get("fichier");
  if(!(fichier instanceof File)||!fichier.size)redirect(`/stock/${articleId}?error=${encodeURIComponent("Choisissez une fiche technique")}`);
  if(fichier.size>20*1024*1024)redirect(`/stock/${articleId}?error=${encodeURIComponent("Le fichier dépasse 20 Mo")}`);
  if(!["application/pdf","image/png","image/jpeg","image/webp"].includes(fichier.type))redirect(`/stock/${articleId}?error=${encodeURIComponent("Format accepté : PDF, PNG, JPG ou WebP")}`);
  const{data:article}=await supabase.from("articles_stock").select("id").eq("id",articleId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();if(!article)redirect("/stock");
  const path=`${ctx.entrepriseId}/${articleId}/${crypto.randomUUID()}-${nomFichierSecurise(fichier.name)}`;
  const{error:uploadError}=await supabase.storage.from("fiches-techniques").upload(path,fichier,{contentType:fichier.type,upsert:false});
  if(uploadError)redirect(`/stock/${articleId}?error=${encodeURIComponent(uploadError.message)}`);
  const titre=champ(fd,"titre")??fichier.name;
  const{error}=await supabase.from("fiches_techniques_articles").insert({entreprise_id:ctx.entrepriseId,article_id:articleId,
    type_document:champ(fd,"type_document")??"fiche_technique",titre,fabricant:champ(fd,"fabricant"),reference_fabricant:champ(fd,"reference_fabricant"),
    storage_path:path,nom_original:fichier.name,mime_type:fichier.type,taille_octets:fichier.size,source_url:champ(fd,"source_url"),version:champ(fd,"version")});
  if(error){await supabase.storage.from("fiches-techniques").remove([path]);redirect(`/stock/${articleId}?error=${encodeURIComponent(error.message)}`);}
  revalidatePath(`/stock/${articleId}`);redirect(`/stock/${articleId}?success=${encodeURIComponent("Fiche technique ajoutée au dossier produit")}`);
}
