"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

function nombre(formData: FormData, nom: string): number | null {
  const value = champ(formData, nom);
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function exigerGestionEmployes(ctx: Awaited<ReturnType<typeof getContexteEntreprise>>, retour = "/employes") {
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && !permissions.includes("gerer_employes")) {
    redirect(`${retour}?error=${encodeURIComponent("Votre poste permet de consulter les employés, mais pas de les modifier.")}`);
  }
}

function payloadEmploye(formData: FormData) {
  const statut = champ(formData, "statut") ?? "actif";
  return {
    prenom: champ(formData, "prenom"),
    nom: champ(formData, "nom"),
    email: champ(formData, "email"),
    telephone: champ(formData, "telephone"),
    poste: champ(formData, "poste"),
    poste_id: champ(formData, "poste_id"),
    type_contrat: champ(formData, "type_contrat") ?? "cdi",
    date_entree: champ(formData, "date_entree"),
    date_sortie: statut === "sorti" ? champ(formData, "date_sortie") : null,
    taux_horaire: nombre(formData, "taux_horaire"),
    cout_horaire: nombre(formData, "cout_horaire"),
    statut,
    notes: champ(formData, "notes"),
  };
}

export async function creerEmployeAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  await exigerGestionEmployes(ctx);
  const supabase = await createClient();
  const payload = payloadEmploye(formData);

  if (!payload.prenom || !payload.nom) {
    redirect(`/employes/nouveau?error=${encodeURIComponent("Prénom et nom obligatoires")}`);
  }
  if (payload.statut === "sorti" && !payload.date_sortie) {
    redirect(`/employes/nouveau?error=${encodeURIComponent("La date de sortie est obligatoire pour un salarié sorti")}`);
  }

  const { data, error } = await supabase
    .from("employes")
    .insert({
      entreprise_id: ctx.entrepriseId,
      ...payload,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/employes/nouveau?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  revalidatePath("/employes");
  redirect(`/employes/${data.id}`);
}

export async function modifierEmployeAction(employeId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  await exigerGestionEmployes(ctx, `/employes/${employeId}`);
  const supabase = await createClient();
  const payload = payloadEmploye(formData);

  if (!payload.prenom || !payload.nom) {
    redirect(`/employes/${employeId}/modifier?error=${encodeURIComponent("Prénom et nom obligatoires")}`);
  }
  if (payload.statut === "sorti" && !payload.date_sortie) {
    redirect(`/employes/${employeId}/modifier?error=${encodeURIComponent("La date de sortie est obligatoire pour un salarié sorti")}`);
  }

  const { error } = await supabase
    .from("employes")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employeId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (error) {
    redirect(`/employes/${employeId}/modifier?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/employes");
  revalidatePath(`/employes/${employeId}`);
  redirect(`/employes/${employeId}`);
}

export async function changerStatutEmployeAction(employeId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  await exigerGestionEmployes(ctx, `/employes/${employeId}`);
  const supabase = await createClient();

  const { error } = await supabase
    .from("employes")
    .update({ statut, date_sortie: statut === "sorti" ? new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() })
    .eq("id", employeId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath("/employes");
    revalidatePath(`/employes/${employeId}`);
  }
}

export async function changerStatutCompteApplicationAction(employeId:string,statut:string){const ctx=await getContexteEntreprise();await exigerGestionEmployes(ctx,`/employes/${employeId}`);const supabase=await createClient();const{error}=await supabase.rpc("changer_statut_compte_application",{p_entreprise_id:ctx.entrepriseId,p_employe_id:employeId,p_statut:statut});if(error)redirect(`/employes/${employeId}?error=${encodeURIComponent(error.message)}`);revalidatePath("/employes");revalidatePath(`/employes/${employeId}`);redirect(`/employes/${employeId}?success=${encodeURIComponent(statut==="pause"?"Compte mis en pause — il reste facturable pour le mois":"Statut du compte mis à jour")}`);}

export async function reinitialiserMotDePasseStockEmployeAction(employeId: string) {
  const ctx = await getContexteEntreprise();
  await exigerGestionEmployes(ctx, `/employes/${employeId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reinitialiser_mot_de_passe_stock_employe", {
    p_entreprise_id: ctx.entrepriseId,
    p_employe_id: employeId,
  });
  if (error) redirect(`/employes/${employeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/employes/${employeId}`);
  redirect(`/employes/${employeId}?success=${encodeURIComponent("Accès stock réinitialisé. L’employé doit créer un nouveau mot de passe depuis Mon espace")}`);
}

export async function importerCarteBtpAction(employeId:string,formData:FormData){
  const ctx=await getContexteEntreprise();
  await exigerGestionEmployes(ctx,`/employes/${employeId}`);
  const supabase=await createClient();
  const fichier=formData.get("carte_btp"),numero=champ(formData,"carte_btp_numero"),expiration=champ(formData,"carte_btp_expiration");
  const formats:Record<string,string>={"application/pdf":"pdf","image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
  const{data:employe}=await supabase.from("employes").select("id,carte_btp_storage_path").eq("id",employeId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();
  if(!employe)redirect(`/employes/${employeId}?error=${encodeURIComponent("Employé introuvable")}`);
  if(!(fichier instanceof File)||!fichier.size||!formats[fichier.type]||fichier.size>10*1024*1024)redirect(`/employes/${employeId}?error=${encodeURIComponent("Ajoutez une carte en PDF, PNG, JPG ou WebP de moins de 10 Mo")}`);
  const path=`${ctx.entrepriseId}/${employeId}/carte-btp-${crypto.randomUUID()}.${formats[fichier.type]}`;
  const{error:uploadError}=await supabase.storage.from("documents-employes").upload(path,fichier,{contentType:fichier.type,upsert:false});
  if(uploadError)redirect(`/employes/${employeId}?error=${encodeURIComponent(uploadError.message)}`);
  const{error}=await supabase.from("employes").update({carte_btp_storage_path:path,carte_btp_nom:fichier.name,carte_btp_mime_type:fichier.type,carte_btp_taille_octets:fichier.size,carte_btp_numero:numero,carte_btp_expiration:expiration,updated_at:new Date().toISOString()}).eq("id",employeId).eq("entreprise_id",ctx.entrepriseId);
  if(error){await supabase.storage.from("documents-employes").remove([path]);redirect(`/employes/${employeId}?error=${encodeURIComponent(error.message)}`);}
  if(employe.carte_btp_storage_path)await supabase.storage.from("documents-employes").remove([employe.carte_btp_storage_path]);
  revalidatePath(`/employes/${employeId}`);redirect(`/employes/${employeId}?success=${encodeURIComponent("Carte BTP enregistrée")}`);
}

export async function supprimerCarteBtpAction(employeId:string){const ctx=await getContexteEntreprise();await exigerGestionEmployes(ctx,`/employes/${employeId}`);const supabase=await createClient(),{data:employe}=await supabase.from("employes").select("carte_btp_storage_path").eq("id",employeId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();if(employe?.carte_btp_storage_path)await supabase.storage.from("documents-employes").remove([employe.carte_btp_storage_path]);await supabase.from("employes").update({carte_btp_storage_path:null,carte_btp_nom:null,carte_btp_mime_type:null,carte_btp_taille_octets:null,carte_btp_numero:null,carte_btp_expiration:null,updated_at:new Date().toISOString()}).eq("id",employeId).eq("entreprise_id",ctx.entrepriseId);revalidatePath(`/employes/${employeId}`);redirect(`/employes/${employeId}?success=${encodeURIComponent("Carte BTP supprimée")}`);}

export async function importerPhotoEmployeAction(employeId:string,formData:FormData){
  const ctx=await getContexteEntreprise();await exigerGestionEmployes(ctx,`/employes/${employeId}`);
  const supabase=await createClient(),fichier=formData.get("photo");
  const formats:Record<string,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
  const{data:employe}=await supabase.from("employes").select("id,photo_storage_path").eq("id",employeId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();
  if(!employe)redirect(`/employes/${employeId}?error=${encodeURIComponent("Employé introuvable")}`);
  if(!(fichier instanceof File)||!fichier.size||!formats[fichier.type]||fichier.size>10*1024*1024)redirect(`/employes/${employeId}?error=${encodeURIComponent("Ajoutez une photo JPG, PNG ou WebP de moins de 10 Mo")}`);
  const path=`${ctx.entrepriseId}/${employeId}/portrait-${crypto.randomUUID()}.${formats[fichier.type]}`;
  const{error:upload}=await supabase.storage.from("documents-employes").upload(path,fichier,{contentType:fichier.type,upsert:false});
  if(upload)redirect(`/employes/${employeId}?error=${encodeURIComponent(upload.message)}`);
  const{error}=await supabase.from("employes").update({photo_storage_path:path,photo_url:null,photo_nom:fichier.name,photo_mime_type:fichier.type,photo_taille_octets:fichier.size,updated_at:new Date().toISOString()}).eq("id",employeId).eq("entreprise_id",ctx.entrepriseId);
  if(error){await supabase.storage.from("documents-employes").remove([path]);redirect(`/employes/${employeId}?error=${encodeURIComponent(error.message)}`);}
  if(employe.photo_storage_path)await supabase.storage.from("documents-employes").remove([employe.photo_storage_path]);
  revalidatePath("/employes");revalidatePath(`/employes/${employeId}`);redirect(`/employes/${employeId}?success=${encodeURIComponent("Photo de l’employé enregistrée")}`);
}

export async function supprimerPhotoEmployeAction(employeId:string){
  const ctx=await getContexteEntreprise();await exigerGestionEmployes(ctx,`/employes/${employeId}`);const supabase=await createClient();
  const{data:employe}=await supabase.from("employes").select("photo_storage_path").eq("id",employeId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();
  if(employe?.photo_storage_path)await supabase.storage.from("documents-employes").remove([employe.photo_storage_path]);
  await supabase.from("employes").update({photo_storage_path:null,photo_url:null,photo_nom:null,photo_mime_type:null,photo_taille_octets:null,updated_at:new Date().toISOString()}).eq("id",employeId).eq("entreprise_id",ctx.entrepriseId);
  revalidatePath("/employes");revalidatePath(`/employes/${employeId}`);redirect(`/employes/${employeId}?success=${encodeURIComponent("Photo supprimée")}`);
}

export async function revoquerAppareilEmployeAction(employeId:string,appareilId:string){
  const ctx=await getContexteEntreprise();await exigerGestionEmployes(ctx,`/employes/${employeId}`);const supabase=await createClient();
  const{error}=await supabase.rpc("revoquer_appareil_compte",{p_entreprise_id:ctx.entrepriseId,p_appareil_id:appareilId});
  if(error)redirect(`/employes/${employeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/employes/${employeId}`);revalidatePath("/plateforme");redirect(`/employes/${employeId}?success=${encodeURIComponent("Appareil révoqué")}`);
}
