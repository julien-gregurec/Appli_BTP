import { NextResponse } from "next/server";
import { genererPdfDepuisUrl, nomFichierPdf } from "@/lib/pdf/generer";

export const runtime = "nodejs";
export const maxDuration = 60;

// Chromium navigue vers /imprimer/partage/[token] (page publique, gardée par
// le token lui-même — voir cette page pour la résolution). Aucune session ni
// cookie n'est transmis : la sécurité vient exclusivement du token dans
// l'URL, jamais d'un paramètre client de plus haut niveau.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(`/imprimer/partage/${token}`, request.url);
  // Purement cosmétique (nom du fichier téléchargé) : la page publique
  // elle-même connaît déjà le vrai numéro et le type, on les lui laisse passer ici.
  const recherche = new URL(request.url).searchParams;
  const numero = recherche.get("numero") || token.slice(0, 8);
  const estFacture = recherche.get("type") === "facture";

  let pdf: Buffer;
  try {
    pdf = await genererPdfDepuisUrl(url.toString());
  } catch {
    return NextResponse.json({ error: "Lien invalide, expiré, ou document introuvable" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomFichierPdf(estFacture, numero)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
