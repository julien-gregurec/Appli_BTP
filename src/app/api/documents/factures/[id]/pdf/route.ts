import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { genererPdfDepuisUrl, nomFichierPdf } from "@/lib/pdf/generer";
import { chargerRenduDocument, estDebordementMiseEnPage, moteurDeReponse } from "@/lib/devis/v2-serveur";

export const runtime = "nodejs";
export const maxDuration = 60;

// Même garantie que /api/documents/devis/[id]/pdf : Chromium navigue vers
// /imprimer/factures/[id] avec le cookie de session entrant, donc la même
// vérification d'accès (getContexteEntreprise + RLS).
//
// `?duplicata=1` : duplicata du document FIGÉ (moteur v2), marqué comme tel. L'original n'est jamais
// modifié ; une facture en brouillon n'a pas de duplicata.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const duplicata = new URL(request.url).searchParams.get("duplicata") === "1";

  const { data: facture } = await supabase.from("factures").select("numero").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!facture) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  const url = new URL(`/imprimer/factures/${id}${duplicata ? "?duplicata=1" : ""}`, request.url);
  let pdf: Buffer;
  try {
    const moteur = moteurDeReponse(await chargerRenduDocument(supabase, "facture", id));
    if (duplicata && moteur !== 2) {
      return NextResponse.json({ error: "Duplicata disponible pour les factures émises avec le nouvel éditeur uniquement" }, { status: 409 });
    }
    pdf = moteur === 2
      ? await genererPdfDepuisUrl(url.toString(), request.headers.get("cookie"), { moteur: 2 })
      : await genererPdfDepuisUrl(url.toString(), request.headers.get("cookie"));
  } catch (e) {
    if (estDebordementMiseEnPage(e)) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: "Génération du PDF impossible" }, { status: 502 });
  }

  const nom = facture.numero ?? "brouillon";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomFichierPdf(true, duplicata ? `${nom}-duplicata` : nom)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
