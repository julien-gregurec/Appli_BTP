"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

function retour(type:"error"|"success",message:string):never{redirect(`/appels-offres?${type}=${encodeURIComponent(message)}`);}

export async function creerAppelOffresAction(formData:FormData){
  const ctx=await getContexteEntreprise();const supabase=await createClient();
  const titre=String(formData.get("titre")??"").trim();
  const reference=String(formData.get("reference")??"").trim()||`AO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  if(!titre)retour("error","Le titre est obligatoire");
  const montant=Number(String(formData.get("montant_estime_ht")??"").replace(",","."));
  const {error}=await supabase.from("appels_offres").insert({entreprise_id:ctx.entrepriseId,reference,titre,
    client_id:String(formData.get("client_id")??"")||null,chantier_id:String(formData.get("chantier_id")??"")||null,
    source_url:String(formData.get("source_url")??"").trim()||null,date_limite:String(formData.get("date_limite")??"")||null,
    montant_estime_ht:Number.isFinite(montant)?montant:null,notes:String(formData.get("notes")??"").trim()||null});
  if(error)retour("error",error.message);revalidatePath("/appels-offres");retour("success","Appel d’offres ajouté");
}

export async function changerStatutAppelOffresAction(id:string,formData:FormData){
  const ctx=await getContexteEntreprise();const supabase=await createClient();
  const statut=String(formData.get("statut")??"");
  if(!["a_etudier","en_preparation","depose","gagne","perdu","abandonne"].includes(statut))retour("error","Statut invalide");
  const {error}=await supabase.from("appels_offres").update({statut,updated_at:new Date().toISOString()}).eq("id",id).eq("entreprise_id",ctx.entrepriseId);
  if(error)retour("error",error.message);revalidatePath("/appels-offres");retour("success","Statut mis à jour");
}
