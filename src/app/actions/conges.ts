"use server";
import {redirect} from "next/navigation";import {revalidatePath} from "next/cache";import {getContexteEntreprise} from "@/lib/entreprise";import {createClient} from "@/lib/supabase/server";import {isEmailLoginDisabled} from "@/lib/auth-mode";
const txt=(f:FormData,k:string)=>String(f.get(k)??"").trim();const retour=(m:string,e=false):never=>redirect(`/conges?${e?"error":"succes"}=${encodeURIComponent(m)}`);
export async function creerDemandeCongeAction(formData:FormData){
 if(isEmailLoginDisabled())retour("Compte personnel requis",true);
 const ctx=await getContexteEntreprise(),sb=await createClient();
 const{data:emp}=await sb.from("employes").select("id").eq("entreprise_id",ctx.entrepriseId).eq("utilisateur_id",ctx.userId).maybeSingle();
 const employeId=emp?.id;if(!employeId)retour("Votre compte n’est pas lié à une fiche employé",true);
 const debut=txt(formData,"date_debut"),fin=txt(formData,"date_fin");if(!debut||!fin||fin<debut)retour("Période invalide",true);
 const{data,error}=await sb.from("demandes_conges").insert({entreprise_id:ctx.entrepriseId,employe_id:employeId,type_conge:txt(formData,"type_conge")||"conges_payes",date_debut:debut,date_fin:fin,demi_jour_debut:txt(formData,"demi_jour_debut")||"journee",demi_jour_fin:txt(formData,"demi_jour_fin")||"journee",commentaire:txt(formData,"commentaire")||null,created_by:ctx.userId,statut:"brouillon"}).select("id").single();
 if(error||!data?.id)retour(error?.message??"Création impossible",true);
 const demandeId=data?.id;if(!demandeId)retour("Création impossible",true);
 const{error:transitionError}=await sb.rpc("transition_demande_conge",{p_demande_id:demandeId,p_action:"soumettre",p_message:null});
 if(transitionError)retour(transitionError.message,true);revalidatePath("/conges");retour("Demande envoyée au responsable");
}
export async function transitionDemandeCongeAction(id:string,action:string,formData?:FormData){if(isEmailLoginDisabled())retour("Compte personnel requis",true);const sb=await createClient();const {error}=await sb.rpc("transition_demande_conge",{p_demande_id:id,p_action:action,p_message:formData?txt(formData,"message")||null:null});if(error)retour(error.message,true);revalidatePath("/conges");revalidatePath("/planning");retour(action==="approuver"?"Congé approuvé et ajouté au planning":"Demande mise à jour");}
