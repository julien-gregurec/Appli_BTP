import { NextResponse, type NextRequest } from "next/server";
import { studioAuthAdmin, studioExportVerifier } from "../../../../lib/identity";
import { storageAdmin } from "../../../../lib/storage-admin";
import { servirExport } from "../../../../lib/rgpd-export";

// Export RGPD d'un sujet ELSATIA, appelé serveur à serveur par la plateforme (worker d'export).
// Corps : {"token": "<elsatia-export-request+jwt>"}. 200 = données ; 400/401 = demande refusée ;
// 409 = rejeu ou compte inactif ; 503 = à réessayer. Jamais de contenu dans les journaux.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const texte = await request.text().catch(() => "");
  if (texte.length > 8192) return NextResponse.json({ code: "MALFORMED" }, { status: 400 });
  let corps: unknown = null;
  try {
    corps = JSON.parse(texte);
  } catch {
    return NextResponse.json({ code: "MALFORMED" }, { status: 400 });
  }
  let r;
  try {
    const admin = studioAuthAdmin();
    const verifier = studioExportVerifier();
    r = await servirExport(corps, {
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
  } catch {
    return NextResponse.json({ code: "CONFIG_INVALID" }, { status: 503 });
  }
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
