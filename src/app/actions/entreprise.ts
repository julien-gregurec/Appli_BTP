"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";

function champ(formData: FormData, nom: string) {
  const valeur = String(formData.get(nom) ?? "").trim();
  return valeur || null;
}

export async function createEntrepriseAction(formData: FormData) {
  const nom = String(formData.get("nom") ?? "");
  const siret = String(formData.get("siret") ?? "") || null;
  const adresse = String(formData.get("adresse") ?? "") || null;
  const codePostal = String(formData.get("code_postal") ?? "") || null;
  const ville = String(formData.get("ville") ?? "") || null;

  const supabase = await createClient();

  if (isEmailLoginDisabled()) {
    const { error } = await supabase.from("entreprises").insert({
      nom,
      siret,
      adresse,
      code_postal: codePostal,
      ville,
    });

    if (error) {
      redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
    }

    redirect("/dashboard");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Bootstrap atomique côté base (entreprise + poste Admin/Gérant + membre + droits + entreprise active).
  const { error } = await supabase.rpc("creer_entreprise_bootstrap", {
    p_nom: nom,
    p_siret: siret,
    p_adresse: adresse,
    p_code_postal: codePostal,
    p_ville: ville,
  });
  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  // Nouveau dirigeant : on l'oriente vers le questionnaire de besoins → recommandation d'offre.
  redirect("/onboarding/besoins");
}

// Rejoindre une entreprise existante via son code d'adhésion (réservé au mode auth réelle).
export async function rejoindreEntrepriseAction(formData: FormData) {
  if (isEmailLoginDisabled()) {
    redirect("/dashboard");
  }
  const code = String(formData.get("code") ?? "").trim();
  if (!code) {
    redirect(`/onboarding?error=${encodeURIComponent("Entre le code de ton entreprise.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("rejoindre_entreprise_par_code", { p_code: code });
  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }
  // Le membre arrive "en attente" : getContexteEntreprise le redirige vers /en-attente
  // tant que l'admin ne l'a pas activé en lui affectant un poste.
  redirect("/dashboard");
}

export async function activerCompteEmployeAction(formData: FormData) {
  if (isEmailLoginDisabled()) redirect("/dashboard");
  const numero = String(formData.get("numero") ?? "").trim().toUpperCase();
  if (!numero) redirect(`/onboarding?error=${encodeURIComponent("Saisissez votre numéro d’inscription.")}`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signup?numero=${encodeURIComponent(numero)}`);
  const { error } = await supabase.rpc("activer_compte_employe", { p_numero: numero });
  if (error) redirect(`/onboarding?numero=${encodeURIComponent(numero)}&error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function modifierEntrepriseAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const nom = champ(formData, "nom");
  if (!nom) redirect(`/parametres?error=${encodeURIComponent("Le nom de l’entreprise est obligatoire")}`);

  const tauxBrut = champ(formData, "taux_penalites_retard");
  const taux = tauxBrut ? Number(tauxBrut.replace(",", ".")) : null;
  if (taux !== null && (!Number.isFinite(taux) || taux < 0)) {
    redirect(`/parametres?error=${encodeURIComponent("Taux de pénalités invalide")}`);
  }

  const { error } = await supabase.from("entreprises").update({
    nom,
    raison_sociale: champ(formData, "raison_sociale"),
    siret: champ(formData, "siret"),
    adresse: champ(formData, "adresse"),
    code_postal: champ(formData, "code_postal"),
    ville: champ(formData, "ville"),
    assurance_decennale_numero: champ(formData, "assurance_decennale_numero"),
    assurance_decennale_assureur: champ(formData, "assurance_decennale_assureur"),
    assurance_rc_pro_numero: champ(formData, "assurance_rc_pro_numero"),
    taux_penalites_retard: taux,
    texte_entete: champ(formData, "texte_entete"),
    texte_pied_page: champ(formData, "texte_pied_page"),
    police_documents: champ(formData,"police_documents") ?? "arial",
    taille_police_documents: Math.min(16,Math.max(10,Number(champ(formData,"taille_police_documents"))||13)),
    logo_largeur_documents: Math.min(180,Math.max(60,Number(champ(formData,"logo_largeur_documents"))||105)),
    couleur_documents: /^#[0-9a-f]{6}$/i.test(champ(formData,"couleur_documents")??"") ? champ(formData,"couleur_documents") : "#0d1b2a",
    mise_en_page_documents: champ(formData,"mise_en_page_documents") ?? "classique",
    updated_at: new Date().toISOString(),
  }).eq("id", ctx.entrepriseId);

  if (error) redirect(`/parametres?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  revalidatePath("/parametres");
  redirect("/parametres?succes=1");
}

export async function modifierLogoEntrepriseAction(formData:FormData){
  const ctx=await getContexteEntreprise(),supabase=await createClient(),fichier=formData.get("logo");
  if(!(fichier instanceof File)||!fichier.size)redirect(`/parametres?error=${encodeURIComponent("Choisissez une image")}`);
  const formats:Record<string,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};const ext=formats[fichier.type];
  if(!ext)redirect(`/parametres?error=${encodeURIComponent("Format accepté : PNG, JPG ou WebP")}`);
  if(fichier.size>5*1024*1024)redirect(`/parametres?error=${encodeURIComponent("Le logo dépasse 5 Mo")}`);
  const{data:ancienne}=await supabase.from("entreprises").select("logo_url").eq("id",ctx.entrepriseId).maybeSingle(),path=`${ctx.entrepriseId}/logo-${crypto.randomUUID()}.${ext}`;
  const{error:uploadError}=await supabase.storage.from("entreprise-assets").upload(path,fichier,{contentType:fichier.type,cacheControl:"3600",upsert:false});
  if(uploadError)redirect(`/parametres?error=${encodeURIComponent(uploadError.message)}`);
  const{data:publicData}=supabase.storage.from("entreprise-assets").getPublicUrl(path),{error}=await supabase.from("entreprises").update({logo_url:publicData.publicUrl,updated_at:new Date().toISOString()}).eq("id",ctx.entrepriseId);
  if(error){await supabase.storage.from("entreprise-assets").remove([path]);redirect(`/parametres?error=${encodeURIComponent(error.message)}`)}
  const marqueur="/storage/v1/object/public/entreprise-assets/",ancien=ancienne?.logo_url?.includes(marqueur)?ancienne.logo_url.split(marqueur)[1]:null;if(ancien)await supabase.storage.from("entreprise-assets").remove([decodeURIComponent(ancien)]);
  revalidatePath("/","layout");revalidatePath("/parametres");revalidatePath("/imprimer","layout");redirect("/parametres?succes=logo");
}
