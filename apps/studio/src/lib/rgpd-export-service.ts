import "server-only";
import { studioAuthAdmin, studioExportVerifier } from "./identity";
import { storageAdmin } from "./storage-admin";
import { servirExport, type ReponseExport } from "./rgpd-export";

// Adaptateurs serveur (clés service Studio) de l'export RGPD : RPC du chemin système rgpd_export
// et URL signées courtes du Storage Studio. Aucune clé plateforme.
export async function servirExportStudio(corps: unknown): Promise<ReponseExport> {
  const admin = studioAuthAdmin();
  const verifier = studioExportVerifier();
  return servirExport(corps, {
    verifier: (t) => verifier.verifyExportRequest(t),
    consommer: async (jti, job, exp) => {
      const { data, error } = await admin.rpc("studio_export_consume", { p_jti: jti, p_job: job, p_expires_at: exp });
      if (error) throw new Error("consume");
      return data === true;
    },
    lireSujet: async (sujet, job) => {
      const { data, error } = await admin.rpc("studio_export_subject", { p_subject: sujet, p_job: job });
      if (error || !data) throw new Error("subject");
      return data as Record<string, unknown>;
    },
    signer: async (bucket, cle, secondes) => {
      const { data } = await storageAdmin().storage.from(bucket).createSignedUrl(cle, secondes);
      return data?.signedUrl ?? null;
    },
    log: (evenement, detail) => console.info(JSON.stringify({ scope: "studio-rgpd-export", evenement, ...detail })),
  });
}
