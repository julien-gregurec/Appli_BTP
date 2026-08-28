"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteColors } from "@/lib/contexte";
import { exigerAccesApplication } from "@/lib/applications-elsatia";
import { resoudreRoleColors } from "@/lib/acces-colors";
import { peutEffectuerColors, type ActionColors } from "@/lib/permissions-colors";
import { validerQuantite } from "@/lib/quantites";
import type { EtatSeau, ModeQuantite, UniteQuantite } from "@/lib/colors-types";

const texte=(f:FormData,k:string,max=500)=>String(f.get(k)??"").trim().slice(0,max);
const nullable=(f:FormData,k:string,max=500)=>texte(f,k,max)||null;
const nombre=(f:FormData,k:string)=>{const v=Number(String(f.get(k)??"").replace(",","."));return Number.isFinite(v)?v:null;};

async function contexteAction(action:ActionColors){
  const contexte=await getContexteColors();
  await exigerAccesApplication(contexte,"colors");
  if(!contexte.entrepriseId)throw new Error("Une entreprise active est requise");
  const role=await resoudreRoleColors(contexte);
  if(!peutEffectuerColors(role,action))throw new Error("Cette action n’est pas autorisée pour votre rôle Colors");
  return {...contexte,entrepriseId:contexte.entrepriseId,role};
}
function retour(path:string,message:string,type:"ok"|"erreur"="ok"){redirect(`${path}?${type}=${encodeURIComponent(message)}`);}

export async function creerSeauAction(formData:FormData){
  const contexte=await contexteAction("ajouter_seau");
  const mode=texte(formData,"mode_quantite") as ModeQuantite;
  const unite=texte(formData,"unite") as UniteQuantite;
  const saisie={mode,unite,nominale:nombre(formData,"quantite_nominale"),restante:nombre(formData,"quantite_restante"),pourcentage:nombre(formData,"pourcentage_saisi")};
  const erreur=validerQuantite(saisie);
  if(erreur)retour("/inventaire",erreur,"erreur");
  const supabase=await createClient();
  const {data,error:erreurDb}=await supabase.from("colors_seaux").insert({
    entreprise_id:contexte.entrepriseId,emplacement_id:nullable(formData,"emplacement_id"),
    marque:texte(formData,"marque",120),produit:texte(formData,"produit",180),reference_produit:nullable(formData,"reference_produit",120),
    teinte_nom:nullable(formData,"teinte_nom",180),teinte_reference:nullable(formData,"teinte_reference",120),couleur_hex:nullable(formData,"couleur_hex",7)?.toUpperCase(),
    mode_quantite:mode,unite,quantite_nominale:mode==="pourcentage"?null:saisie.nominale,quantite_restante:mode==="pourcentage"?null:saisie.restante,
    pourcentage_saisi:mode==="pourcentage"?saisie.pourcentage:null,etat:texte(formData,"etat")||"ferme",notes:nullable(formData,"notes",4000),created_by:contexte.userId,
  }).select("id").single();
  if(erreurDb||!data)retour("/inventaire",erreurDb?.message??"Création impossible","erreur");
  const seauId=(data as {id:string}).id;
  revalidatePath("/inventaire");revalidatePath("/dashboard");redirect(`/inventaire/${seauId}?ok=${encodeURIComponent("Seau ajouté")}`);
}

export async function creerEmplacementAction(formData:FormData){
  const contexte=await contexteAction("gerer_emplacements");const supabase=await createClient();
  const {error}=await supabase.from("colors_emplacements").insert({entreprise_id:contexte.entrepriseId,nom:texte(formData,"nom",120),type:texte(formData,"type"),description:nullable(formData,"description",1000),parent_id:nullable(formData,"parent_id"),created_by:contexte.userId});
  if(error)retour("/depots",error.message,"erreur");revalidatePath("/depots");revalidatePath("/inventaire");retour("/depots","Emplacement ajouté");
}

export async function ajusterQuantiteAction(seauId:string,formData:FormData){
  await contexteAction("ajuster_quantite");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_ajuster_quantite",{p_seau_id:seauId,p_valeur:nombre(formData,"valeur"),p_type:texte(formData,"type")||"ajustement",p_motif:nullable(formData,"motif")});
  if(error)retour(`/inventaire/${seauId}`,error.message,"erreur");revalidatePath(`/inventaire/${seauId}`);revalidatePath("/inventaire");retour(`/inventaire/${seauId}`,"Quantité mise à jour");
}

export async function deplacerSeauAction(seauId:string,formData:FormData){
  await contexteAction("deplacer");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_deplacer_seau",{p_seau_id:seauId,p_emplacement_id:texte(formData,"emplacement_id"),p_motif:nullable(formData,"motif")});
  if(error)retour(`/inventaire/${seauId}`,error.message,"erreur");revalidatePath(`/inventaire/${seauId}`);revalidatePath("/inventaire");retour(`/inventaire/${seauId}`,"Seau déplacé");
}

export async function changerEtatAction(seauId:string,formData:FormData){
  const etat=texte(formData,"etat") as EtatSeau;await contexteAction(etat==="vide"?"marquer_vide":"ajuster_quantite");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_changer_etat",{p_seau_id:seauId,p_etat:etat,p_motif:nullable(formData,"motif")});
  if(error)retour(`/inventaire/${seauId}`,error.message,"erreur");revalidatePath(`/inventaire/${seauId}`);revalidatePath("/inventaire");retour(`/inventaire/${seauId}`,"État mis à jour");
}

export async function archiverSeauAction(seauId:string,archiver:boolean){
  await contexteAction(archiver?"archiver":"restaurer");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_archiver_seau",{p_seau_id:seauId,p_archiver:archiver,p_motif:archiver?"Archivage manuel":"Restauration manuelle"});
  if(error)retour(`/inventaire/${seauId}`,error.message,"erreur");revalidatePath(`/inventaire/${seauId}`);revalidatePath("/inventaire");retour(`/inventaire/${seauId}`,archiver?"Seau archivé":"Seau restauré");
}

export async function modifierSeauAction(seauId:string,formData:FormData){
  const contexte=await contexteAction("modifier_seau");const supabase=await createClient();
  const {error}=await supabase.from("colors_seaux").update({marque:texte(formData,"marque",120),produit:texte(formData,"produit",180),reference_produit:nullable(formData,"reference_produit",120),teinte_nom:nullable(formData,"teinte_nom",180),teinte_reference:nullable(formData,"teinte_reference",120),couleur_hex:nullable(formData,"couleur_hex",7)?.toUpperCase(),notes:nullable(formData,"notes",4000)}).eq("entreprise_id",contexte.entrepriseId).eq("id",seauId);
  if(error)retour(`/inventaire/${seauId}`,error.message,"erreur");revalidatePath(`/inventaire/${seauId}`);retour(`/inventaire/${seauId}`,"Informations mises à jour");
}

export async function enregistrerParametresAction(formData:FormData){
  const contexte=await contexteAction("gerer_parametres");const supabase=await createClient();const seuil=nombre(formData,"seuil");
  if(seuil==null||seuil<0||seuil>100)retour("/parametres","Seuil invalide","erreur");
  const {error}=await supabase.from("colors_parametres").upsert({entreprise_id:contexte.entrepriseId,seuil_stock_faible_pourcent:seuil});
  if(error)retour("/parametres",error.message,"erreur");revalidatePath("/parametres");retour("/parametres","Paramètres enregistrés");
}
