import { NextResponse } from "next/server";
import { genererPdfDepuisUrl, nomFichierPdf, reponseErreurPdf } from "@/lib/pdf/generer";
import { urlImpressionPartage } from "@/lib/documents-partage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Jeton de partage : 32 octets aléatoires en base64url (genererTokenPartage), soit 43 caractères.
const FORMAT_JETON = /^[A-Za-z0-9_-]{43}$/;

const introuvable = () =>
  NextResponse.json({ error: "Lien invalide, expiré, ou document introuvable" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

// Chromium navigue vers /imprimer/partage/[token] (page publique, gardée par
// le token lui-même — voir cette page pour la résolution). Aucune session ni
// cookie n'est transmis : la sécurité vient exclusivement du token dans
// l'URL, jamais d'un paramètre client de plus haut niveau.
//
// SEC-5 (post-V9) : le jeton est résolu en base AVANT de lancer Chromium (un jeton
// inconnu, expiré ou révoqué ne coûte plus de rendu), l'origine visitée par Chromium est
// l'URL publique configurée et jamais l'en-tête Host de la requête (pas de SSRF), et la
// route est plafonnée par IP dans le proxy (politique `api:shared-pdf`).
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!FORMAT_JETON.test(token)) return introuvable();

  const { data, error } = await createAdminClient().rpc("document_commercial_public_par_token", { p_token: token });
  if (error || !data) return introuvable();

  const url = urlImpressionPartage(token);
  if (!url) {
    return NextResponse.json({ error: "Partage de documents indisponible" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  // Nom du fichier : numéro et type du document résolu, jamais des paramètres de requête.
  const resolu = data as { type_document?: string; document?: { numero?: string | null } | null };
  const estFacture = resolu.type_document === "facture";
  const numero = resolu.document?.numero || token.slice(0, 8);

  let pdf: Buffer;
  try {
    pdf = await genererPdfDepuisUrl(url, null, { signal: request.signal });
  } catch (erreur) {
    // File saturée → 503 (Retry-After), délai → 504 ; sinon statut historique.
    return reponseErreurPdf(erreur, 404, "Lien invalide, expiré, ou document introuvable");
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomFichierPdf(estFacture, numero)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
