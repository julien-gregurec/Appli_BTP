import { cache } from "react";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";
import type { ContexteEntreprise } from "@/lib/entreprise";
import { filtrerPermissionsSelonOffre } from "@/lib/tarification";
import { modeAssistance, permissionsAssistanceGestionPro } from "@/lib/assistance-server";
import { permissionsDeConsultation, resoudrePermissionsAssistance } from "@elsatia/platform-support-comms";

// null signifie « accès complet » (prototype sans connexion).
/**
 * Droits du poste de l'utilisateur. `null` = accès complet (prototype).
 *
 * Mis en cache pour la même raison que getContexteEntreprise : layout et page
 * l'appelaient tous les deux, refaisant 3 allers-retours chacun.
 */
export const permissionsUtilisateur = cache(async function permissionsUtilisateur(ctx:ContexteEntreprise):Promise<string[]|null>{
  if(isEmailLoginDisabled())return null;
  const sb=await createClient();
  // Les deux requetes sont independantes (aucune ne depend du resultat de l'autre) : les
  // lancer en parallele economise un aller-retour reseau sur le chemin le plus frequent
  // (compte sans acces support), au prix d'une requete inutilisee dans le cas rare ou
  // l'acces support est actif.
  const [{data:accesSupport},{data:appartenance},{data:entreprise}]=await Promise.all([
    sb.rpc("est_acces_support_actif",{p_entreprise_id:ctx.entrepriseId}),
    sb.from("utilisateurs_entreprises").select("poste_id,pointage_personnel_actif").eq("utilisateur_id",ctx.userId).eq("entreprise_id",ctx.entrepriseId).eq("statut","actif").maybeSingle(),
    sb.from("entreprises").select("option_ia_statut,option_ia_essai_fin,abonnement_offre").eq("id",ctx.entrepriseId).maybeSingle(),
  ]);
  // ELSATIA-PLATFORM-CROSS-APP-SUPPORT-ACCESS-AND-COMMUNICATIONS-V1.
  // Historiquement, une session support renvoyait `null`, c'est-a-dire TOUS les droits :
  // ni moindre privilege, ni lecture seule, ni distinction de perimetre. Le contrat
  // d'assistance remplace cette regle par la liste exacte du perimetre choisi.
  //
  // Trois cas, dans cet ordre :
  //   * le contrat existe en base -> ses droits font foi ;
  //   * il n'existe pas encore et la posture est STRICTE -> lecture seule. C'est le
  //     defaut : variable absente, vide ou invalide, et toujours en Production ;
  //   * il n'existe pas encore et le mode HERITE a ete explicitement demande hors
  //     Production -> comportement historique, avec avertissement de securite.
  if(accesSupport===true){
    const perimetre=await permissionsAssistanceGestionPro(ctx.entrepriseId);
    const mode=modeAssistance();
    // Le catalogue n'est lu que dans le cas ou il sert reellement : inutile de payer
    // une requete quand le contrat serveur a deja repondu.
    const lectureSeule=perimetre===undefined&&mode.strict
      ?permissionsDeConsultation(((await sb.from("permissions_disponibles").select("cle")).data??[]).map(x=>x.cle))
      :[];
    return resoudrePermissionsAssistance({
      perimetreServeur:perimetre,
      mode,
      permissionsLectureSeule:lectureSeule,
    }).permissions;
  }
  if(!appartenance?.poste_id)return [];
  const {data}=await sb.from("permissions_poste").select("cle_permission").eq("entreprise_id",ctx.entrepriseId).eq("poste_id",appartenance.poste_id).eq("autorise",true);
  const droits=new Set((data??[]).map(x=>x.cle_permission));
  droits.delete("saisir_son_pointage");
  if(appartenance.pointage_personnel_actif){
    droits.add("acces_pointage");
    droits.add("saisir_son_pointage");
  }
  // Option IA payante : au-dela de l'acces par poste, l'entreprise elle-meme doit avoir
  // l'option active (gratuite historique, essai en cours, ou facturee) pour que l'IA reste
  // disponible. Voir option_ia_statut sur entreprises.
  const statutOptionIA=entreprise?.option_ia_statut;
  const optionIAAccordee=statutOptionIA==="gratuit"||statutOptionIA==="actif"||(statutOptionIA==="essai"&&Boolean(entreprise?.option_ia_essai_fin)&&new Date(entreprise!.option_ia_essai_fin!).getTime()>Date.now());
  if(!optionIAAccordee)droits.delete("acces_ia");
  return filtrerPermissionsSelonOffre(droits, entreprise?.abonnement_offre);
});

// null = accès complet (prototype ou support). Sinon, droit explicite requis.
export function aAccesIA(permissions: string[] | null): boolean {
  return permissions === null || permissions.includes("acces_ia");
}
