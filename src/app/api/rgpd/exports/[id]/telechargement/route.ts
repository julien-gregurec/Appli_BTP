import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Téléchargement d'une archive d'export RGPD : la RPC relit le droit (demandeur, statut READY, non
// expiré, quota, permission pour un export entreprise) et compte l'usage ; ensuite seulement la clé
// service signe une URL COURTE vers ce seul objet. L'URL n'est ni journalisée ni mise en cache.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Export introuvable" }, { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rgpd_export_autoriser_telechargement", { p_job: id });
  if (error) return NextResponse.json({ error: "Export introuvable" }, { status: 404 });
  const r = data as { statut: string; code?: string; bucket?: string; chemin?: string; url_secondes?: number };
  if (r.statut !== "AUTORISE" || !r.bucket || !r.chemin) {
    const statut = r.code === "INTROUVABLE" ? 404 : r.code === "EXPIRE" ? 410 : r.code === "QUOTA_TELECHARGEMENT" ? 429 : 403;
    return NextResponse.json({ error: "Téléchargement impossible", code: r.code }, { status: statut, headers: { "Cache-Control": "no-store" } });
  }
  const { data: signe, error: erreurSignature } = await createAdminClient()
    .storage.from(r.bucket)
    .createSignedUrl(r.chemin, r.url_secondes ?? 300, { download: `export-elsatia-${id}.zip` });
  if (erreurSignature || !signe?.signedUrl) return NextResponse.json({ error: "Archive indisponible" }, { status: 503 });
  return NextResponse.redirect(signe.signedUrl, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
