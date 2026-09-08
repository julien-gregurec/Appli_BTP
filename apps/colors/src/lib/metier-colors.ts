import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EmplacementColors, NettoyagePhotoColors, SeauColors } from "@/lib/colors-types";
import { TAILLE_PAGE_ACTIVITE, type EvenementActiviteColors } from "@/lib/activite-colors";
import { colonnesTri, fenetrePage, TAILLE_PAGE_INVENTAIRE, TRI_PAR_DEFAUT, type TriInventaire } from "@/lib/tri-inventaire";

export type FiltresServeurColors = {
  q?: string;
  etat?: string;
  emplacement?: string;
  faible?: boolean;
  sansPhoto?: boolean;
  archives?: boolean;
  tri?: TriInventaire;
  page?: number;
};

export type FiltresActiviteColors = {
  seauId?: string | null;
  depuis?: string | null;
  types?: string[] | null;
  auteurId?: string | null;
  emplacementId?: string | null;
  limite?: number;
  avant?: string | null;
  avantId?: string | null;
};

export async function listerEmplacementsColors(entrepriseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors_emplacements").select("id,entreprise_id,parent_id,nom,type,description,actif").eq("entreprise_id",entrepriseId).eq("actif",true).order("ordre").order("nom");
  if (error) throw new Error("Impossible de charger les emplacements Colors");
  return (data ?? []) as EmplacementColors[];
}

/**
 * Une page d'inventaire. Le tri et la pagination sont demandés à la base : ni
 * l'ordre ni la découpe ne sont reconstitués côté navigateur.
 */
export async function listerSeauxColors(entrepriseId: string, filtres: FiltresServeurColors = {}) {
  const supabase = await createClient();
  const seuil = filtres.faible ? (await obtenirParametresColors(entrepriseId)).seuil_stock_faible_pourcent : 20;
  const page = filtres.page && filtres.page >= 1 ? filtres.page : 1;
  const { debut, fin } = fenetrePage(page, TAILLE_PAGE_INVENTAIRE);
  // Une ligne de plus que la page : elle ne sert qu'à savoir s'il en reste.
  let requete = supabase.from("colors_seaux")
    .select("*,colors_emplacements(id,nom,type)")
    .eq("entreprise_id",entrepriseId)
    .range(debut, fin + 1);
  for (const ordre of colonnesTri(filtres.tri ?? TRI_PAR_DEFAUT)) {
    requete = requete.order(ordre.colonne,{ascending:ordre.ascendant});
  }
  if (!filtres.archives && filtres.etat !== "archive") requete = requete.neq("etat","archive");
  if (filtres.etat && filtres.etat !== "tous") requete = requete.eq("etat",filtres.etat);
  if (filtres.emplacement) requete = requete.eq("emplacement_id",filtres.emplacement);
  if (filtres.faible) requete = requete.lte("pourcentage_restant",seuil).not("etat","in",'(archive,vide)');
  if (filtres.sansPhoto) requete = requete.is("photo_principale_path",null);
  const q = (filtres.q ?? "").replace(/[%(),]/g," ").trim();
  if (q) requete = requete.ilike("recherche_text",`%${q}%`);
  const { data, error } = await requete;
  if (error) throw new Error("Impossible de charger l’inventaire Colors");
  const lignes = (data ?? []) as SeauColors[];
  return { seaux: lignes.slice(0, TAILLE_PAGE_INVENTAIRE), page, pageSuivante: lignes.length > TAILLE_PAGE_INVENTAIRE };
}

/**
 * Activité produit de l'organisation, ou historique d'un seul produit.
 *
 * Passe systématiquement par `colors_activite_recente` : c'est la seule surface
 * qui joint l'auteur (table `utilisateurs`, hors périmètre d'un rôle Colors) et
 * qui décide du cloisonnement côté serveur. `entrepriseId` vient du contexte
 * canonique, jamais de l'URL.
 */
export async function listerActiviteColors(entrepriseId: string, filtres: FiltresActiviteColors = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("colors_activite_recente", {
    p_entreprise_id: entrepriseId,
    p_seau_id: filtres.seauId ?? null,
    p_depuis: filtres.depuis ?? null,
    p_types: filtres.types ?? null,
    p_auteur_id: filtres.auteurId ?? null,
    p_emplacement_id: filtres.emplacementId ?? null,
    p_limite: filtres.limite ?? TAILLE_PAGE_ACTIVITE,
    p_avant_created_at: filtres.avant ?? null,
    p_avant_id: filtres.avantId ?? null,
  });
  if (error) throw new Error("Impossible de charger l’activité Colors");
  return (data ?? []) as EvenementActiviteColors[];
}

/** Personnes ayant laissé une trace dans le journal de l'organisation. */
export async function listerActeursColors(entrepriseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("colors_acteurs_activite", { p_entreprise_id: entrepriseId });
  if (error) return [] as { auteur_id: string; auteur_nom: string }[];
  return (data ?? []) as { auteur_id: string; auteur_nom: string }[];
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
  const [{data:seau,error},mouvements,nettoyages] = await Promise.all([
    supabase.from("colors_seaux").select("*,colors_emplacements(id,nom,type)").eq("entreprise_id",entrepriseId).eq("id",seauId).maybeSingle(),
    listerActiviteColors(entrepriseId,{seauId,limite:100}),
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
    mouvements,
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

export async function obtenirParametresColors(entrepriseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors_parametres")
    .select("seuil_stock_faible_pourcent")
    .eq("entreprise_id",entrepriseId)
    .maybeSingle();
  if (error) throw new Error("Impossible de charger les paramètres Colors");
  return { seuil_stock_faible_pourcent: Number(data?.seuil_stock_faible_pourcent ?? 20) };
}
