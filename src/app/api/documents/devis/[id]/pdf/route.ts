import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { genererPdfDepuisUrl, nomFichierPdf } from "@/lib/pdf/generer";
import { chargerRenduDocument, estDebordementMiseEnPage, moteurDeReponse } from "@/lib/devis/v2-serveur";

export const runtime = "nodejs";
export const maxDuration = 60;

// Chromium navigue vers /imprimer/devis/[id] en réutilisant le cookie de
// session de la requête entrante : c'est donc exactement la même vérification
// d'accès (getContexteEntreprise + RLS) que si l'utilisateur ouvrait cette
// page lui-même. Un membre de l'entreprise A ne peut jamais obtenir le PDF
// d'un devis de l'entreprise B, quel que soit l'id fourni dans l'URL.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: devis } = await supabase.from("devis").select("numero").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!devis) return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });

  const url = new URL(`/imprimer/devis/${id}`, request.url);
  let pdf: Buffer;
  try {
    // Moteur v2 : pages A4 décidées par les données, imprimées sans marge ni pied Chromium. Moteur 1 :
    // appel strictement identique à celui d'avant.
    const moteur = moteurDeReponse(await chargerRenduDocument(supabase, "devis", id));
    pdf = moteur === 2
      ? await genererPdfDepuisUrl(url.toString(), request.headers.get("cookie"), { moteur: 2 })
      : await genererPdfDepuisUrl(url.toString(), request.headers.get("cookie"));
  } catch (e) {
    if (estDebordementMiseEnPage(e)) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: "Génération du PDF impossible" }, { status: 502 });
  }
  // GP V1 (lot G) : la production d'un PDF est tracée dans l'historique de l'objet ; un historique
  // indisponible (schéma non migré) ne bloque jamais le téléchargement.
  try { await supabase.rpc("journaliser_pdf_document", { p_entreprise_id: ctx.entrepriseId, p_type_document: "devis", p_document_id: id }); } catch { /* sans effet */ }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomFichierPdf(false, devis.numero ?? "brouillon")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
