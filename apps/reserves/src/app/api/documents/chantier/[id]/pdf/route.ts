import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererPdfDepuisUrl } from "@/lib/pdf/generer";
import {
  lireOptionsExport, nomFichierExport, parametresExport,
} from "@/lib/export/options";

export const runtime = "nodejs";
export const maxDuration = 60;

// Les paramètres ne sont plus recopiés à l'aveugle : ils sont RELUS par le contrat
// d'export commun, puis réémis sous leur forme canonique. Une valeur hors contrat ne
// traverse donc pas jusqu'au document, et l'URL imprimée est exactement celle que
// l'aperçu annonçait.

/**
 * PDF serveur d'un chantier, éventuellement restreint à une entreprise.
 *
 * Chromium navigue vers `/imprimer/chantier/[id]` en réutilisant le cookie de session de
 * la requête entrante : c'est donc la même vérification d'accès que si l'utilisateur
 * ouvrait cette page lui-même. Un membre de l'organisation A ne peut jamais obtenir le
 * PDF d'un chantier de l'organisation B, quel que soit l'identifiant fourni dans l'URL —
 * et une entreprise intervenante n'obtient que ses propres réserves.
 *
 * La vérification préalable ci-dessous n'est pas la sécurité (les RLS le sont) : elle
 * évite de démarrer un navigateur pour rien et de rendre un 502 là où un 404 est la
 * réponse honnête.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });

  const { data: entete } = await supabase
    .rpc("reserves_export_entete", { p_chantier_id: id })
    .maybeSingle();
  const details = entete as { chantier: string } | null;
  if (!details) return NextResponse.json({ error: "Chantier introuvable" }, { status: 404 });

  const entrant = new URL(request.url);
  const options = lireOptionsExport(
    Object.fromEntries(entrant.searchParams.entries()),
  );
  const cible = new URL(`/imprimer/chantier/${id}`, request.url);
  for (const [cle, valeur] of parametresExport(options)) {
    cible.searchParams.set(cle, valeur);
  }

  let nomEntreprise: string | null = null;
  const intervenantId = options.intervenantId;
  if (intervenantId) {
    const { data: intervenants } = await supabase
      .rpc("reserves_export_intervenants", { p_chantier_id: id });
    const trouve = ((intervenants ?? []) as { intervenant_id: string; nom: string }[])
      .find((i) => i.intervenant_id === intervenantId);
    nomEntreprise = trouve?.nom ?? null;
  }

  let pdf: Buffer;
  try {
    pdf = await genererPdfDepuisUrl(cible.toString(), request.headers.get("cookie"), {
      paysage: options.orientation === "paysage",
      pied: [details.chantier, nomEntreprise].filter(Boolean).join(" — "),
    });
  } catch {
    return NextResponse.json({ error: "Génération du PDF impossible" }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomFichierExport(details.chantier, nomEntreprise, options)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
