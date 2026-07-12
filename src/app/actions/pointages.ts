"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

const texte = (formData: FormData, nom: string) => String(formData.get(nom) ?? "").trim() || null;

export async function creerPointageAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const employeId = texte(formData, "employe_id");
  const chantierId = texte(formData, "chantier_id");
  const date = texte(formData, "date");
  const heuresNormales = Number(formData.get("heures_normales"));
  const heuresSupplementaires = Number(formData.get("heures_supplementaires")) || 0;
  const pauseMinutes = Number(formData.get("pause_minutes")) || 0;
  const retour = texte(formData, "mois") ?? new Date().toISOString().slice(0, 7);
  const latitude=Number(formData.get("latitude")),longitude=Number(formData.get("longitude")),precision=Number(formData.get("precision_metres")),photo=formData.get("photo");
  if (!employeId || !chantierId || !date || heuresNormales < 0 || heuresSupplementaires < 0 || heuresNormales + heuresSupplementaires <= 0 || heuresNormales + heuresSupplementaires > 24) {
    redirect(`/pointage?mois=${retour}&error=${encodeURIComponent("Le pointage doit contenir entre 0,25 h et 24 h")}`);
  }
  const [{ data: employe }, { data: chantier }] = await Promise.all([
    supabase.from("employes").select("id").eq("id", employeId).eq("entreprise_id", ctx.entrepriseId).single(),
    supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).single(),
  ]);
  if (!employe || !chantier) redirect(`/pointage?mois=${retour}&error=${encodeURIComponent("Employé ou chantier introuvable")}`);
  if(!Number.isFinite(latitude)||latitude < -90||latitude>90||!Number.isFinite(longitude)||longitude < -180||longitude>180)redirect(`/pointage?mois=${retour}&error=${encodeURIComponent("La position GPS est obligatoire")}`);
  const formats:Record<string,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};if(!(photo instanceof File)||!photo.size||!formats[photo.type]||photo.size>10*1024*1024)redirect(`/pointage?mois=${retour}&error=${encodeURIComponent("Ajoutez une photo PNG, JPG ou WebP de moins de 10 Mo")}`);
  const { data:pointage,error } = await supabase.from("pointages").insert({ entreprise_id: ctx.entrepriseId, employe_id: employeId, chantier_id: chantierId, date, heures_normales: heuresNormales, heures_supplementaires: heuresSupplementaires, pause_minutes: Math.max(0, Math.min(1440, pauseMinutes)), tache: texte(formData, "tache"), commentaire: texte(formData, "commentaire"),latitude,longitude,precision_metres:Number.isFinite(precision)?precision:null,verification_statut:"a_verifier" }).select("id").single();
  if (error) redirect(`/pointage?mois=${retour}&error=${encodeURIComponent(error.message)}`);
  const path=`${ctx.entrepriseId}/${date}/${pointage.id}-${crypto.randomUUID()}.${formats[photo.type]}`,{error:uploadError}=await supabase.storage.from("pointage-preuves").upload(path,photo,{contentType:photo.type,upsert:false});if(uploadError){await supabase.from("pointages").delete().eq("id",pointage.id).eq("entreprise_id",ctx.entrepriseId);redirect(`/pointage?mois=${retour}&error=${encodeURIComponent(uploadError.message)}`)}
  const{error:updateError}=await supabase.from("pointages").update({photo_storage_path:path}).eq("id",pointage.id).eq("entreprise_id",ctx.entrepriseId);if(updateError){await supabase.storage.from("pointage-preuves").remove([path]);await supabase.from("pointages").delete().eq("id",pointage.id);redirect(`/pointage?mois=${retour}&error=${encodeURIComponent(updateError.message)}`)}
  revalidatePath("/pointage");
  revalidatePath(`/chantiers/${chantierId}`);
  redirect(`/pointage?mois=${date.slice(0, 7)}&succes=1`);
}

export async function supprimerPointageAction(pointageId: string, mois: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const{data:p}=await supabase.from("pointages").select("photo_storage_path").eq("id",pointageId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();if(p?.photo_storage_path)await supabase.storage.from("pointage-preuves").remove([p.photo_storage_path]);await supabase.from("pointages").delete().eq("id", pointageId).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/pointage");
  redirect(`/pointage?mois=${mois}`);
}

export async function validerPointageAction(pointageId:string,statut:"valide"|"rejete",mois:string,formData:FormData){const ctx=await getContexteEntreprise(),supabase=await createClient(),{error}=await supabase.rpc("valider_preuve_pointage",{p_entreprise_id:ctx.entrepriseId,p_pointage_id:pointageId,p_statut:statut,p_commentaire:texte(formData,"commentaire_verification")});if(error)redirect(`/pointage?mois=${mois}&error=${encodeURIComponent(error.message)}`);revalidatePath("/pointage");redirect(`/pointage?mois=${mois}&succes=validation`)}
