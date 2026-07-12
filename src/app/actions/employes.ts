"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

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

function payloadEmploye(formData: FormData) {
  return {
    prenom: champ(formData, "prenom"),
    nom: champ(formData, "nom"),
    email: champ(formData, "email"),
    telephone: champ(formData, "telephone"),
    poste: champ(formData, "poste"),
    type_contrat: champ(formData, "type_contrat") ?? "cdi",
    date_entree: champ(formData, "date_entree"),
    date_sortie: champ(formData, "date_sortie"),
    taux_horaire: nombre(formData, "taux_horaire"),
    cout_horaire: nombre(formData, "cout_horaire"),
    statut: champ(formData, "statut") ?? "actif",
    notes: champ(formData, "notes"),
  };
}

export async function creerEmployeAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const payload = payloadEmploye(formData);

  if (!payload.prenom || !payload.nom) {
    redirect(`/employes/nouveau?error=${encodeURIComponent("Prénom et nom obligatoires")}`);
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
  const supabase = await createClient();
  const payload = payloadEmploye(formData);

  if (!payload.prenom || !payload.nom) {
    redirect(`/employes/${employeId}/modifier?error=${encodeURIComponent("Prénom et nom obligatoires")}`);
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
  const supabase = await createClient();

  const { error } = await supabase
    .from("employes")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", employeId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath("/employes");
    revalidatePath(`/employes/${employeId}`);
  }
}

export async function importerCarteBtpAction(employeId:string,formData:FormData){
  const ctx=await getContexteEntreprise(),supabase=await createClient();
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

export async function supprimerCarteBtpAction(employeId:string){const ctx=await getContexteEntreprise(),supabase=await createClient(),{data:employe}=await supabase.from("employes").select("carte_btp_storage_path").eq("id",employeId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();if(employe?.carte_btp_storage_path)await supabase.storage.from("documents-employes").remove([employe.carte_btp_storage_path]);await supabase.from("employes").update({carte_btp_storage_path:null,carte_btp_nom:null,carte_btp_mime_type:null,carte_btp_taille_octets:null,carte_btp_numero:null,carte_btp_expiration:null,updated_at:new Date().toISOString()}).eq("id",employeId).eq("entreprise_id",ctx.entrepriseId);revalidatePath(`/employes/${employeId}`);redirect(`/employes/${employeId}?success=${encodeURIComponent("Carte BTP supprimée")}`);}
