import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { genererPdfDepuisUrl, nomFichierPdf, reponseErreurPdf } from "@/lib/pdf/generer";
import { urlImpressionInterne } from "@/lib/pdf/url-impression";

export const runtime = "nodejs";
export const maxDuration = 60;

// Même garantie que /api/documents/devis/[id]/pdf : Chromium navigue vers
// /imprimer/factures/[id] avec le cookie de session entrant, donc la même
// vérification d'accès (getContexteEntreprise + RLS).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: facture } = await supabase.from("factures").select("numero").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!facture) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  // Origine configurée, jamais `request.url` (dérivée de l'en-tête Host) : cf. urlImpressionInterne.
  const url = urlImpressionInterne(`/imprimer/factures/${encodeURIComponent(id)}`, BRAND.urlPublique);
  if (!url) return NextResponse.json({ error: "Génération du PDF indisponible" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  let pdf: Buffer;
  try {
    pdf = await genererPdfDepuisUrl(url, request.headers.get("cookie"), { signal: request.signal });
  } catch (erreur) {
    // File saturée → 503 (Retry-After), délai → 504 ; sinon statut historique.
    return reponseErreurPdf(erreur, 502, "Génération du PDF impossible");
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomFichierPdf(true, facture.numero ?? "brouillon")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
