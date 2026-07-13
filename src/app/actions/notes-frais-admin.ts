"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { permissionsUtilisateur } from "@/lib/permissions";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { ajouterAudit } from "@/lib/expenses/audit";

function valeur(formData: FormData, cle: string) { return String(formData.get(cle) ?? "").trim(); }
function retour(message: string, erreur = false): never { redirect(`/parametres/notes-frais?${erreur ? "error" : "succes"}=${encodeURIComponent(message)}`); }

async function contexteAdmin() {
  if (isEmailLoginDisabled()) retour("Les réglages sécurisés nécessitent un compte personnel", true);
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!permissions?.includes("administrer_archivage_notes_frais")) retour("Autorisation administrateur requise", true);
  return { ctx, supabase };
}

export async function modifierPolitiqueNotesFraisAction(formData: FormData) {
  const { ctx, supabase } = await contexteAdmin();
  const mode = valeur(formData, "mode_archivage");
  const duree = Number(valeur(formData, "duree_conservation_annees"));
  const tailleMo = Number(valeur(formData, "taille_max_mo"));
  if (!["simple_document_storage", "reinforced_archive"].includes(mode)) retour("Mode d’archivage invalide", true);
  if (!Number.isInteger(duree) || duree < 1 || duree > 50) retour("Durée de conservation invalide", true);
  if (!Number.isFinite(tailleMo) || tailleMo < 1 || tailleMo > 50) retour("La limite doit être comprise entre 1 et 50 Mo", true);
  const antivirus = formData.get("analyse_antivirus_obligatoire") === "on";
  const { error } = await supabase.from("politiques_conservation_notes_frais").update({
    mode_archivage: mode, duree_conservation_annees: duree,
    taille_max_octets: Math.round(tailleMo * 1024 * 1024),
    analyse_antivirus_obligatoire: antivirus, suppression_automatique: false,
    updated_at: new Date().toISOString(), updated_by: ctx.userId,
  }).eq("entreprise_id", ctx.entrepriseId);
  if (error) retour(error.message, true);
  await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:"politique_archivage_modifiee",ressourceType:"entreprise",ressourceId:ctx.entrepriseId,metadata:{mode,duree,tailleMo,antivirus}});
  revalidatePath("/parametres/notes-frais"); retour("Politique enregistrée");
}

export async function ajouterCategorieNoteFraisAction(formData: FormData) {
  const { ctx, supabase } = await contexteAdmin(); const libelle = valeur(formData,"libelle");
  const code = (valeur(formData,"code") || libelle).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,50);
  if (!libelle || !code) retour("Libellé obligatoire", true);
  const {error}=await supabase.from("categories_notes_frais").insert({entreprise_id:ctx.entrepriseId,code,libelle,ordre:Number(valeur(formData,"ordre"))||500});
  if(error) retour(error.code==="23505"?"Cette catégorie existe déjà":error.message,true);
  await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:"categorie_depense_creee",ressourceType:"entreprise",ressourceId:ctx.entrepriseId,metadata:{code,libelle}});
  revalidatePath("/parametres/notes-frais"); retour("Catégorie ajoutée");
}

export async function changerCategorieNoteFraisAction(id:string,actif:boolean) {
  const {ctx,supabase}=await contexteAdmin();
  const {error}=await supabase.from("categories_notes_frais").update({actif,updated_at:new Date().toISOString()}).eq("id",id).eq("entreprise_id",ctx.entrepriseId);
  if(error) retour(error.message,true);
  await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:actif?"categorie_depense_activee":"categorie_depense_desactivee",ressourceType:"categorie_note_frais",ressourceId:id});
  revalidatePath("/parametres/notes-frais"); retour(actif?"Catégorie activée":"Catégorie désactivée");
}

export async function poserLegalHoldNoteFraisAction(noteId:string,formData:FormData) {
  const {ctx,supabase}=await contexteAdmin(); const motif=valeur(formData,"motif"); if(!motif) redirect(`/notes-frais/${noteId}?error=${encodeURIComponent("Motif obligatoire")}`);
  const {error}=await supabase.from("legal_holds_notes_frais").insert({entreprise_id:ctx.entrepriseId,note_frais_id:noteId,motif,pose_par:ctx.userId});
  if(error) redirect(`/notes-frais/${noteId}?error=${encodeURIComponent(error.message)}`);
  await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:"legal_hold_pose",ressourceType:"note_frais",ressourceId:noteId,metadata:{motif}});
  revalidatePath(`/notes-frais/${noteId}`); redirect(`/notes-frais/${noteId}?succes=${encodeURIComponent("Suspension de suppression activée")}`);
}

export async function leverLegalHoldNoteFraisAction(noteId:string,holdId:string) {
  const {ctx,supabase}=await contexteAdmin();
  const {error}=await supabase.from("legal_holds_notes_frais").update({actif:false,leve_par:ctx.userId,leve_at:new Date().toISOString()}).eq("id",holdId).eq("entreprise_id",ctx.entrepriseId).eq("actif",true);
  if(error) redirect(`/notes-frais/${noteId}?error=${encodeURIComponent(error.message)}`);
  await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:"legal_hold_leve",ressourceType:"note_frais",ressourceId:noteId});
  revalidatePath(`/notes-frais/${noteId}`); redirect(`/notes-frais/${noteId}?succes=${encodeURIComponent("Suspension de suppression levée")}`);
}
