import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

export const dynamic = "force-dynamic";

// Export RGPD personnel (art. 15 & 20), distinct de l'export entreprise : un
// salarié ne récupère que son propre profil et ses propres lignes, jamais
// celles de ses collègues (contrôle fait par exporter_donnees_utilisateur,
// qui exige auth.uid() = p_utilisateur_id).
export async function GET() {
  const { userId } = await getContexteEntreprise();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exporter_donnees_utilisateur", { p_utilisateur_id: userId });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const horodatage = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="export-personnel-liria-${horodatage}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
