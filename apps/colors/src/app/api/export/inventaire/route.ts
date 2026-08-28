import { NextResponse } from "next/server";
import { getContexteColors } from "@/lib/contexte";
import { exigerAccesApplication } from "@/lib/applications-elsatia";
import { resoudreRoleColors } from "@/lib/acces-colors";
import { peutEffectuerColors } from "@/lib/permissions-colors";
import { createClient } from "@/lib/supabase/server";
import { celluleCsvColors as csv } from "@/lib/csv-colors";

export async function GET() {
  const contexte = await getContexteColors();
  await exigerAccesApplication(contexte,"colors");
  if (!contexte.entrepriseId || !peutEffectuerColors(await resoudreRoleColors(contexte),"exporter")) return NextResponse.json({erreur:"Export non autorisé"},{status:403});
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors_seaux")
    .select("marque,produit,reference_produit,teinte_nom,teinte_reference,couleur_hex,mode_quantite,quantite_nominale,quantite_restante,unite,pourcentage_restant,etat,updated_at,colors_emplacements(nom)")
    .eq("entreprise_id",contexte.entrepriseId).order("marque").limit(5000);
  if (error) return NextResponse.json({erreur:"Export indisponible"},{status:500});
  const entetes = ["Marque","Produit","Référence","Teinte","Référence teinte","HEX","Mode","Quantité nominale","Quantité restante","Unité","Pourcentage restant","État","Emplacement","Mise à jour"];
  const lignes = (data ?? []).map((s) => [s.marque,s.produit,s.reference_produit,s.teinte_nom,s.teinte_reference,s.couleur_hex,s.mode_quantite,s.quantite_nominale,s.quantite_restante,s.unite,s.pourcentage_restant,s.etat,(s.colors_emplacements as {nom?:string}|null)?.nom,s.updated_at].map(csv).join(";"));
  return new NextResponse(`\uFEFF${entetes.map(csv).join(";")}\n${lignes.join("\n")}`,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="elsatia-colors-inventaire-${new Date().toISOString().slice(0,10)}.csv"`}});
}
