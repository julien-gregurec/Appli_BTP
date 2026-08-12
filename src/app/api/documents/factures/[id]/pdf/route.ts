import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { genererPdfDepuisUrl, nomFichierPdf } from "@/lib/pdf/generer";

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

  const url = new URL(`/imprimer/factures/${id}`, request.url);
  let pdf: Buffer;
  try {
    pdf = await genererPdfDepuisUrl(url.toString(), request.headers.get("cookie"));
  } catch {
    return NextResponse.json({ error: "Génération du PDF impossible" }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomFichierPdf(true, facture.numero ?? "brouillon")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
