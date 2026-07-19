import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

export const dynamic = "force-dynamic";

// Export RGPD : renvoie l'intégralité des données de l'entreprise en JSON téléchargeable.
// Le contrôle de droit (gerer_parametres) est fait par la fonction SQL elle-même.
export async function GET() {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) {
    return NextResponse.json({ error: "Aucune entreprise active" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exporter_donnees_entreprise", {
    p_entreprise_id: entrepriseId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const horodatage = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="export-donnees-liria-${horodatage}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
