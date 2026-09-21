"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteColors } from "@/lib/contexte";
import { exigerAccesApplication } from "@/lib/applications-elsatia";
import { resoudreRoleColors } from "@/lib/acces-colors";
import { peutEffectuerColors, type ActionColors } from "@/lib/permissions-colors";
import { validerQuantite } from "@/lib/quantites";
import { journaliserEchecTechnique } from "@/lib/journal-securite";
import {
  CODE_EMPLACEMENT_AJOUTE,
  CODE_ERREUR_GENERIQUE,
  CODE_ETAT_MIS_A_JOUR,
  CODE_INFORMATIONS_MISES_A_JOUR,
  CODE_PARAMETRES_ENREGISTRES,
  CODE_QUANTITE_MISE_A_JOUR,
  CODE_SEAU_AJOUTE,
  CODE_SEAU_ARCHIVE,
  CODE_SEAU_DEPLACE,
  CODE_SEAU_RESTAURE,
  CODE_SEUIL_INVALIDE,
} from "@/lib/messages-metier";
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

/**
 * Seul point de sortie vers une page après action. `code` appartient toujours au
 * jeu fermé de `messages-metier.ts` : aucune valeur issue d'un message d'erreur
 * PostgreSQL, d'un formulaire ou d'une exception ne peut atteindre l'URL.
 */
function retour(path:string,code:string,type:"ok"|"erreur"="ok"){redirect(`${path}?${type}=${encodeURIComponent(code)}`);}

/**
 * Traduit un échec base en code affichable. Le message technique — nom de
 * relation, contrainte violée, extrait de requête — n'est écrit que dans les
 * journaux serveur, jamais dans l'URL ni dans le HTML.
 */
function echecBase(operation:string,erreur:{message?:string}|null|undefined):string{
  journaliserEchecTechnique(operation,erreur);
  return CODE_ERREUR_GENERIQUE;
}

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
    pourcentage_saisi:mode==="pourcentage"?saisie.pourcentage:null,etat:texte(formData,"etat")||"ferme",notes:nullable(formData,"notes",4000),
  }).select("id").single();
  if(erreurDb||!data)retour("/inventaire",echecBase("colors_seaux.insert",erreurDb),"erreur");
  const seauId=(data as {id:string}).id;
  revalidatePath("/inventaire");revalidatePath("/dashboard");retour(`/inventaire/${seauId}`,CODE_SEAU_AJOUTE);
}

export async function creerEmplacementAction(formData:FormData){
  const contexte=await contexteAction("gerer_emplacements");const supabase=await createClient();
  const {error}=await supabase.from("colors_emplacements").insert({entreprise_id:contexte.entrepriseId,nom:texte(formData,"nom",120),type:texte(formData,"type"),description:nullable(formData,"description",1000),parent_id:nullable(formData,"parent_id")});
  if(error)retour("/depots",echecBase("colors_emplacements.insert",error),"erreur");revalidatePath("/depots");revalidatePath("/inventaire");retour("/depots",CODE_EMPLACEMENT_AJOUTE);
}

export async function ajusterQuantiteAction(seauId:string,formData:FormData){
  await contexteAction("ajuster_quantite");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_ajuster_quantite",{p_seau_id:seauId,p_valeur:nombre(formData,"valeur"),p_type:texte(formData,"type")||"ajustement",p_motif:nullable(formData,"motif")});
  if(error)retour(`/inventaire/${seauId}`,echecBase("colors_ajuster_quantite",error),"erreur");revalidatePath(`/inventaire/${seauId}`);revalidatePath("/inventaire");retour(`/inventaire/${seauId}`,CODE_QUANTITE_MISE_A_JOUR);
}

export async function deplacerSeauAction(seauId:string,formData:FormData){
  await contexteAction("deplacer");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_deplacer_seau",{p_seau_id:seauId,p_emplacement_id:texte(formData,"emplacement_id"),p_motif:nullable(formData,"motif")});
  if(error)retour(`/inventaire/${seauId}`,echecBase("colors_deplacer_seau",error),"erreur");revalidatePath(`/inventaire/${seauId}`);revalidatePath("/inventaire");retour(`/inventaire/${seauId}`,CODE_SEAU_DEPLACE);
}

export async function changerEtatAction(seauId:string,formData:FormData){
  const etat=texte(formData,"etat") as EtatSeau;await contexteAction(etat==="vide"?"marquer_vide":"ajuster_quantite");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_changer_etat",{p_seau_id:seauId,p_etat:etat,p_motif:nullable(formData,"motif")});
  if(error)retour(`/inventaire/${seauId}`,echecBase("colors_changer_etat",error),"erreur");revalidatePath(`/inventaire/${seauId}`);revalidatePath("/inventaire");retour(`/inventaire/${seauId}`,CODE_ETAT_MIS_A_JOUR);
}

export async function archiverSeauAction(seauId:string,archiver:boolean){
  await contexteAction(archiver?"archiver":"restaurer");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_archiver_seau",{p_seau_id:seauId,p_archiver:archiver,p_motif:archiver?"Archivage manuel":"Restauration manuelle"});
  if(error)retour(`/inventaire/${seauId}`,echecBase("colors_archiver_seau",error),"erreur");revalidatePath(`/inventaire/${seauId}`);revalidatePath("/inventaire");retour(`/inventaire/${seauId}`,archiver?CODE_SEAU_ARCHIVE:CODE_SEAU_RESTAURE);
}

export async function modifierSeauAction(seauId:string,formData:FormData){
  await contexteAction("modifier_seau");const supabase=await createClient();
  const {error}=await supabase.rpc("colors_modifier_seau",{p_seau_id:seauId,p_marque:texte(formData,"marque",120),p_produit:texte(formData,"produit",180),p_reference_produit:nullable(formData,"reference_produit",120),p_teinte_nom:nullable(formData,"teinte_nom",180),p_teinte_reference:nullable(formData,"teinte_reference",120),p_couleur_hex:nullable(formData,"couleur_hex",7)?.toUpperCase()??null,p_notes:nullable(formData,"notes",4000)});
  if(error)retour(`/inventaire/${seauId}`,echecBase("colors_modifier_seau",error),"erreur");revalidatePath(`/inventaire/${seauId}`);retour(`/inventaire/${seauId}`,CODE_INFORMATIONS_MISES_A_JOUR);
}

export async function enregistrerParametresAction(formData:FormData){
  const contexte=await contexteAction("gerer_parametres");const supabase=await createClient();const seuil=nombre(formData,"seuil");
  if(seuil==null||seuil<0||seuil>100)retour("/parametres",CODE_SEUIL_INVALIDE,"erreur");
  const {error}=await supabase.rpc("colors_enregistrer_parametres",{p_entreprise_id:contexte.entrepriseId,p_seuil:seuil});
  if(error)retour("/parametres",echecBase("colors_enregistrer_parametres",error),"erreur");revalidatePath("/parametres");retour("/parametres",CODE_PARAMETRES_ENREGISTRES);
}
