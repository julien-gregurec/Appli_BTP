import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityIssuer } from "@/lib/elsatia-identity/config";
import { executerUnExport, type ResultatRunner, type StudioPort } from "./runner";
import { BUCKET_ARCHIVES, supabaseExportDb, supabaseStockage } from "./supabase-ports";
import { studioExportClient } from "./studio-client";

// Assemblage serveur du worker d'export RGPD. Variables (serveur uniquement) :
//   ELSATIA_STUDIO_EXPORT_URL      https://<studio>/api/elsatia/export (absente : Studio non
//                                  configuré → tout export d'un sujet Studio connu est INCOMPLET)
//   ELSATIA_STUDIO_STORAGE_ORIGIN  origine du Storage du projet Studio dédié (URL de fichiers)

export function studioDepuisEnvironnement(): StudioPort | null {
  const url = process.env.ELSATIA_STUDIO_EXPORT_URL;
  if (!url) return null;
  const origine = process.env.ELSATIA_STUDIO_STORAGE_ORIGIN;
  return studioExportClient({ issuer: identityIssuer(), url, originesFichiers: origine ? [origine] : [] });
}

const journal = (evenement: string, detail: Record<string, unknown>) =>
  console.info(JSON.stringify({ scope: "rgpd-export", evenement, ...detail }));

/** Traite des jobs jusqu'à épuisement ou jusqu'au budget de temps (fonction serverless bornée). */
export async function traiterExports(admin: SupabaseClient, budgetMs: number): Promise<ResultatRunner[]> {
  const debut = Date.now();
  const resultats: ResultatRunner[] = [];
  let studio: StudioPort | null = null;
  try {
    studio = studioDepuisEnvironnement();
  } catch {
    studio = null; // configuration d'identité invalide : Studio traité comme non configuré
  }
  while (Date.now() - debut < budgetMs) {
    const r = await executerUnExport({ db: supabaseExportDb(admin), stockage: supabaseStockage(admin), studio, log: journal });
    if (r.etat === "aucun_job") break;
    resultats.push(r);
  }
  return resultats;
}

/** Expiration : archives échues supprimées du Storage, suppression constatée en base. */
export async function expirerArchives(admin: SupabaseClient): Promise<{ supprimees: number; erreurs: number }> {
  const { data, error } = await admin.rpc("rgpd_export_expirer", { p_limite: 200 });
  if (error) throw new Error("Expiration impossible");
  const lignes = (data ?? []) as Array<{ job_id: string; objet: string }>;
  let erreurs = 0;
  const parJob = new Map<string, string[]>();
  for (const l of lignes) parJob.set(l.job_id, [...(parJob.get(l.job_id) ?? []), l.objet]);
  for (const [job, objets] of parJob) {
    const { error: e1 } = await admin.storage.from(BUCKET_ARCHIVES).remove(objets);
    if (e1) {
      erreurs++;
      continue;
    }
    const { error: e2 } = await admin.rpc("rgpd_export_constater_suppression", { p_job: job });
    if (e2) erreurs++;
    journal("archive_deleted", { job, objets: objets.length });
  }
  return { supprimees: lignes.length, erreurs };
}
