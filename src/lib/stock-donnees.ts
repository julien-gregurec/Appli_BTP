import type { SupabaseClient } from "@supabase/supabase-js";
import { lireParCurseur, lireToutesLesLignes } from "@/lib/supabase/lecture-complete";

// Lectures du stock et des inventaires dont dépendent des totaux (valeur du
// stock, alertes, synthèse et clôture d'inventaire) ou une écriture (comptage
// d'inventaire). Chaque lecture est complète (pagination serveur stricte,
// ordre total) : PostgREST plafonnait chacune à 1 000 lignes, sans erreur —
// ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1. Les RPC appelées restent
// celles d'origine (mêmes contrôles d'accès) ; seule la lecture change :
// pages `.range()` pour les RPC SECURITY DEFINER (sans coût RLS par ligne),
// curseur sur `id` pour les tables sous RLS, puis ordre d'affichage restitué.
const parDesignation = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
const trierArticles = (articles: ArticleStockLu[]) => articles.sort((a, b) => parDesignation.compare(String(a.designation), String(b.designation)) || a.id.localeCompare(b.id));
const trierLignes = (lignes: LigneInventaireLue[]) => lignes.sort((a, b) => (Date.parse(a.created_at ?? "") || 0) - (Date.parse(b.created_at ?? "") || 0) || a.id.localeCompare(b.id));

export type ArticleStockLu = { id: string; reference: string; designation: string; unite: string; quantite_stock: number; seuil_alerte: number; prix_achat_ht?: number | null; [cle: string]: unknown };
export type LigneInventaireLue = { id: string; quantite_theorique: number; quantite_comptee: number | null; prix_achat_ht_snapshot?: number; reference?: string; designation?: string; unite?: string; article?: unknown; created_at?: string };

export async function chargerArticlesStock(supabase: SupabaseClient, entrepriseId: string, avecPrix: boolean): Promise<ArticleStockLu[]> {
  const { data, error } = avecPrix
    ? await lireToutesLesLignes<ArticleStockLu>((options) => supabase.rpc("articles_stock_avec_prix", { p_entreprise_id: entrepriseId }, options).order("designation").order("id"))
    : await lireParCurseur<ArticleStockLu>(() => supabase.from("articles_stock").select("id,reference,designation,unite,quantite_stock,seuil_alerte,emplacement,marque,code_barres,actif").eq("entreprise_id", entrepriseId).eq("actif", true), "id");
  if (error) throw new Error(error.message);
  return avecPrix ? data : trierArticles(data);
}

export function indicateursStock(articles: ArticleStockLu[], avecPrix: boolean) {
  const alertes = articles.filter((article) => Number(article.quantite_stock) <= Number(article.seuil_alerte));
  const valeur = avecPrix ? articles.reduce((total, article) => total + Number(article.quantite_stock) * Number(article.prix_achat_ht ?? 0), 0) : null;
  return { alertes, valeur };
}

export async function chargerLignesInventaire(supabase: SupabaseClient, entrepriseId: string, inventaireId: string, avecPrix: boolean): Promise<LigneInventaireLue[]> {
  const { data, error } = avecPrix
    ? await lireToutesLesLignes<LigneInventaireLue>((options) => supabase.rpc("lignes_inventaire_avec_prix", { p_entreprise_id: entrepriseId, p_inventaire_id: inventaireId }, options).order("created_at").order("id"))
    : await lireParCurseur<LigneInventaireLue>(() => supabase.from("lignes_inventaire").select("id,quantite_theorique,quantite_comptee,created_at,article:articles_stock(reference,designation,unite)").eq("inventaire_id", inventaireId).eq("entreprise_id", entrepriseId), "id");
  if (error) throw new Error(error.message);
  return avecPrix ? data : trierLignes(data);
}

// Toutes les lignes d'un inventaire, pour composer un comptage complet :
// la RPC d'enregistrement refuse un comptage partiel, si bien qu'au-delà de
// 1 000 articles l'inventaire ne pouvait plus être enregistré ni validé.
export async function chargerIdsLignesInventaire(supabase: SupabaseClient, entrepriseId: string, inventaireId: string): Promise<string[] | null> {
  const { data, error } = await lireParCurseur<{ id: string }>(() => supabase.from("lignes_inventaire").select("id").eq("inventaire_id", inventaireId).eq("entreprise_id", entrepriseId), "id");
  if (error) return null;
  return data.map((ligne) => ligne.id);
}
