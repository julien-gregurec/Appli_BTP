import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EmplacementColors, MouvementColors, SeauColors } from "@/lib/colors-types";

export type FiltresServeurColors = { q?: string; etat?: string; emplacement?: string; faible?: boolean; sansPhoto?: boolean; archives?: boolean };

export async function listerEmplacementsColors(entrepriseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors_emplacements").select("id,entreprise_id,parent_id,nom,type,description,actif").eq("entreprise_id",entrepriseId).eq("actif",true).order("ordre").order("nom");
  if (error) throw new Error("Impossible de charger les emplacements Colors");
  return (data ?? []) as EmplacementColors[];
}

export async function listerSeauxColors(entrepriseId: string, filtres: FiltresServeurColors = {}) {
  const supabase = await createClient();
  let requete = supabase.from("colors_seaux")
    .select("*,colors_emplacements(id,nom,type)")
    .eq("entreprise_id",entrepriseId)
    .order("updated_at",{ascending:false})
    .limit(60);
  if (!filtres.archives && filtres.etat !== "archive") requete = requete.neq("etat","archive");
  if (filtres.etat && filtres.etat !== "tous") requete = requete.eq("etat",filtres.etat);
  if (filtres.emplacement) requete = requete.eq("emplacement_id",filtres.emplacement);
  if (filtres.faible) requete = requete.lte("pourcentage_restant",20).neq("etat","archive");
  if (filtres.sansPhoto) requete = requete.is("photo_principale_path",null);
  const q = (filtres.q ?? "").replace(/[%(),]/g," ").trim();
  if (q) requete = requete.or(`marque.ilike.%${q}%,produit.ilike.%${q}%,reference_produit.ilike.%${q}%,teinte_nom.ilike.%${q}%,teinte_reference.ilike.%${q}%,couleur_hex.ilike.%${q}%,ral_approxime.ilike.%${q}%`);
  const { data, error } = await requete;
  if (error) throw new Error("Impossible de charger l’inventaire Colors");
  return (data ?? []) as SeauColors[];
}

export async function obtenirSeauColors(entrepriseId: string, seauId: string) {
  const supabase = await createClient();
  const [{data:seau,error},{data:mouvements}] = await Promise.all([
    supabase.from("colors_seaux").select("*,colors_emplacements(id,nom,type)").eq("entreprise_id",entrepriseId).eq("id",seauId).maybeSingle(),
    supabase.from("colors_mouvements").select("*").eq("entreprise_id",entrepriseId).eq("seau_id",seauId).order("created_at",{ascending:false}).limit(100),
  ]);
  if (error || !seau) return null;
  let photoUrl: string | null = null;
  if (seau.photo_principale_path) {
    const { data } = await supabase.storage.from("colors-seaux").createSignedUrl(seau.photo_principale_path,300,{transform:{width:900,height:900,resize:"contain"}});
    photoUrl = data?.signedUrl ?? null;
  }
  return { seau: seau as SeauColors, mouvements: (mouvements ?? []) as MouvementColors[], photoUrl };
}

export async function statistiquesColors(entrepriseId: string) {
  const seaux = await listerSeauxColors(entrepriseId,{archives:true});
  return {
    actifs: seaux.filter((s)=>s.etat!=="archive").length,
    ouverts: seaux.filter((s)=>s.etat==="ouvert").length,
    faibles: seaux.filter((s)=>s.etat!=="archive"&&s.pourcentage_restant<=20).length,
    vides: seaux.filter((s)=>s.etat==="vide").length,
  };
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
