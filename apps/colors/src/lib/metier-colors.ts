import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EmplacementColors, MouvementColors, NettoyagePhotoColors, SeauColors } from "@/lib/colors-types";

export type FiltresServeurColors = { q?: string; etat?: string; emplacement?: string; faible?: boolean; sansPhoto?: boolean; archives?: boolean };

export async function listerEmplacementsColors(entrepriseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors_emplacements").select("id,entreprise_id,parent_id,nom,type,description,actif").eq("entreprise_id",entrepriseId).eq("actif",true).order("ordre").order("nom");
  if (error) throw new Error("Impossible de charger les emplacements Colors");
  return (data ?? []) as EmplacementColors[];
}

export async function listerSeauxColors(entrepriseId: string, filtres: FiltresServeurColors = {}) {
  const supabase = await createClient();
  const seuil = filtres.faible ? (await obtenirParametresColors(entrepriseId)).seuil_stock_faible_pourcent : 20;
  let requete = supabase.from("colors_seaux")
    .select("*,colors_emplacements(id,nom,type)")
    .eq("entreprise_id",entrepriseId)
    .order("updated_at",{ascending:false})
    .limit(60);
  if (!filtres.archives && filtres.etat !== "archive") requete = requete.neq("etat","archive");
  if (filtres.etat && filtres.etat !== "tous") requete = requete.eq("etat",filtres.etat);
  if (filtres.emplacement) requete = requete.eq("emplacement_id",filtres.emplacement);
  if (filtres.faible) requete = requete.lte("pourcentage_restant",seuil).not("etat","in",'(archive,vide)');
  if (filtres.sansPhoto) requete = requete.is("photo_principale_path",null);
  const q = (filtres.q ?? "").replace(/[%(),]/g," ").trim();
  if (q) requete = requete.ilike("recherche_text",`%${q}%`);
  const { data, error } = await requete;
  if (error) throw new Error("Impossible de charger l’inventaire Colors");
  return (data ?? []) as SeauColors[];
}

export async function obtenirNettoyagesPhotoSeau(seauId: string) {
  const supabase = await createClient();
  // Surface de consultation persistante et cloisonnée (RPC SECURITY DEFINER,
  // filtrage tenant + habilitation côté serveur). Ne jamais lire la table
  // colors_nettoyages_photos directement : aucun rôle API n'y a accès.
  const { data, error } = await supabase.rpc("colors_nettoyages_photos_seau", { p_seau_id: seauId });
  if (error) return [] as NettoyagePhotoColors[];
  return (data ?? []) as NettoyagePhotoColors[];
}

export async function obtenirSeauColors(entrepriseId: string, seauId: string) {
  const supabase = await createClient();
  const [{data:seau,error},{data:mouvements},nettoyages] = await Promise.all([
    supabase.from("colors_seaux").select("*,colors_emplacements(id,nom,type)").eq("entreprise_id",entrepriseId).eq("id",seauId).maybeSingle(),
    supabase.from("colors_mouvements").select("*").eq("entreprise_id",entrepriseId).eq("seau_id",seauId).order("created_at",{ascending:false}).limit(100),
    obtenirNettoyagesPhotoSeau(seauId),
  ]);
  if (error || !seau) return null;
  let photoUrl: string | null = null;
  if (seau.photo_principale_path) {
    const { data } = await supabase.storage.from("colors-seaux").createSignedUrl(seau.photo_principale_path,300,{transform:{width:900,height:900,resize:"contain"}});
    photoUrl = data?.signedUrl ?? null;
  }
  return {
    seau: seau as SeauColors,
    mouvements: (mouvements ?? []) as MouvementColors[],
    photoUrl,
    nettoyages,
    nettoyageRequis: nettoyages.some((n) => n.nettoyage_requis),
  };
}

export async function statistiquesColors(entrepriseId: string) {
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("colors_statistiques",{p_entreprise_id:entrepriseId}).single();
  if(error)throw new Error("Impossible de charger les statistiques Colors");
  const statistiques=data as {actifs:number|string;ouverts:number|string;faibles:number|string;vides:number|string;seuil_stock_faible_pourcent:number|string};
  return {actifs:Number(statistiques.actifs),ouverts:Number(statistiques.ouverts),faibles:Number(statistiques.faibles),vides:Number(statistiques.vides),seuil_stock_faible_pourcent:Number(statistiques.seuil_stock_faible_pourcent)};
}

export async function listerMouvementsColors(entrepriseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors_mouvements")
    .select("*,colors_seaux(id,marque,produit,teinte_nom)")
    .eq("entreprise_id",entrepriseId)
    .order("created_at",{ascending:false})
    .limit(100);
  if (error) throw new Error("Impossible de charger les mouvements Colors");
  return data ?? [];
}

export async function obtenirParametresColors(entrepriseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors_parametres")
    .select("seuil_stock_faible_pourcent")
    .eq("entreprise_id",entrepriseId)
    .maybeSingle();
  if (error) throw new Error("Impossible de charger les paramètres Colors");
  return { seuil_stock_faible_pourcent: Number(data?.seuil_stock_faible_pourcent ?? 20) };
}
