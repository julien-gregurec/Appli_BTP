import { cache } from "react";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";
import type { ContexteEntreprise } from "@/lib/entreprise";

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
  const {data:accesSupport}=await sb.rpc("est_acces_support_actif",{p_entreprise_id:ctx.entrepriseId});
  if(accesSupport===true)return null;
  const {data:appartenance}=await sb.from("utilisateurs_entreprises").select("poste_id,pointage_personnel_actif").eq("utilisateur_id",ctx.userId).eq("entreprise_id",ctx.entrepriseId).eq("statut","actif").maybeSingle();
  if(!appartenance?.poste_id)return [];
  const {data}=await sb.from("permissions_poste").select("cle_permission").eq("entreprise_id",ctx.entrepriseId).eq("poste_id",appartenance.poste_id).eq("autorise",true);
  const droits=new Set((data??[]).map(x=>x.cle_permission));
  droits.delete("saisir_son_pointage");
  if(appartenance.pointage_personnel_actif){
    droits.add("acces_pointage");
    droits.add("saisir_son_pointage");
  }
  return [...droits];
});

// null = accès complet (prototype ou support). Sinon, droit explicite requis.
export function aAccesIA(permissions: string[] | null): boolean {
  return permissions === null || permissions.includes("acces_ia");
}
