// Adaptateurs de production des ports du worker : RPC service_role (projet partagé) et Storage.
// La clé service ne lit AUCUNE table directement : tout passe par les RPC rgpd_export_*, qui
// dérivent le périmètre du job et vérifient le bail.
import { createReadStream } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ErreurBailPerdu,
  ErreurTransitoire,
  type ExportDbPort,
  type FichierBase,
  type Materialisation,
  type Reclamation,
  type SectionBase,
  type StockagePort,
} from "./runner";

export const BUCKET_ARCHIVES = "rgpd-exports";

type ErreurRpc = { code?: string; message?: string } | null;

function verifier(erreur: ErreurRpc): void {
  if (!erreur) return;
  if (erreur.code === "55P03") throw new ErreurBailPerdu();
  // Aucun détail de base remonté dans les journaux : le code SQL suffit au diagnostic.
  throw new ErreurTransitoire("RPC_ECHEC", { cause: erreur.code });
}

export function supabaseExportDb(admin: SupabaseClient): ExportDbPort {
  const rpc = async <T>(nom: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await admin.rpc(nom, args);
    verifier(error as ErreurRpc);
    return data as T;
  };
  return {
    async reclamer() {
      const lignes = await rpc<Reclamation[]>("rgpd_export_reclamer");
      return lignes?.[0] ?? null;
    },
    async prolonger(job, bail) {
      await rpc("rgpd_export_prolonger", { p_job: job, p_bail: bail });
    },
    materialiser: (job, bail) => rpc<Materialisation>("rgpd_export_materialiser", { p_job: job, p_bail: bail }),
    sections: (job, bail) => rpc<SectionBase[]>("rgpd_export_sections", { p_job: job, p_bail: bail }),
    page: (job, bail, section, apres, limite) =>
      rpc("rgpd_export_page", { p_job: job, p_bail: bail, p_section: section, p_apres: apres, p_limite: limite }),
    fichiers: (job, bail, apres, limite) =>
      rpc<FichierBase[]>("rgpd_export_fichiers_page", { p_job: job, p_bail: bail, p_apres: apres, p_limite: limite }),
    classification: () => rpc<unknown[]>("rgpd_export_classification"),
    terminer: (job, bail, chemin, sha256, octets, complet, resume) =>
      rpc("rgpd_export_terminer", {
        p_job: job, p_bail: bail, p_archive_chemin: chemin, p_sha256: sha256, p_octets: octets,
        p_complet_worker: complet, p_resume_worker: resume,
      }),
    echouer: (job, bail, code, reessayable) =>
      rpc("rgpd_export_echouer", { p_job: job, p_bail: bail, p_code: code, p_reessayable: reessayable }),
  };
}

/** Lecture en flux d'une URL (corps HTTP), sans jamais charger le fichier entier. */
export async function lireFlux(url: string, fetcher: typeof fetch = fetch): Promise<AsyncIterable<Uint8Array> | null> {
  let reponse: Response;
  try {
    reponse = await fetcher(url, { cache: "no-store" });
  } catch (cause) {
    throw new ErreurTransitoire("STOCKAGE_INJOIGNABLE", { cause });
  }
  if (reponse.status === 404 || reponse.status === 400) return null;
  if (!reponse.ok || !reponse.body) throw new ErreurTransitoire("STOCKAGE_ERREUR");
  return reponse.body as unknown as AsyncIterable<Uint8Array>;
}

export function supabaseStockage(admin: SupabaseClient, fetcher: typeof fetch = fetch): StockagePort {
  return {
    async lire(bucket, chemin) {
      // URL signée très courte : la clé service ne télécharge jamais un Blob entier en mémoire.
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(chemin, 120);
      if (error || !data?.signedUrl) {
        const statut = (error as { statusCode?: string | number } | null)?.statusCode;
        if (String(statut) === "404" || /not.?found/i.test(error?.message ?? "")) return null;
        throw new ErreurTransitoire("STOCKAGE_ERREUR");
      }
      return lireFlux(data.signedUrl, fetcher);
    },
    async televerserArchive(chemin, fichierLocal) {
      const { error } = await admin.storage.from(BUCKET_ARCHIVES).upload(chemin, createReadStream(fichierLocal), {
        contentType: "application/zip",
        upsert: true, // même chemin = même tentative : un rejeu remplace, ne duplique pas
        duplex: "half",
      } as Parameters<ReturnType<SupabaseClient["storage"]["from"]>["upload"]>[2]);
      if (error) throw new ErreurTransitoire("ARCHIVE_DEPOT_ECHEC");
    },
    async supprimerArchives(chemins) {
      if (chemins.length === 0) return;
      const { error } = await admin.storage.from(BUCKET_ARCHIVES).remove(chemins);
      if (error) throw new ErreurTransitoire("ARCHIVE_SUPPRESSION_ECHEC");
    },
  };
}
