import { NextResponse } from "next/server";
import { getContexteColors } from "@/lib/contexte";
import { exigerAccesApplication } from "@/lib/applications-elsatia";
import { resoudreRoleColors } from "@/lib/acces-colors";
import { peutEffectuerColors } from "@/lib/permissions-colors";
import { createClient } from "@/lib/supabase/server";
import { nuancierColors } from "@/lib/nuancier/source";
import { journaliserEchecTechnique } from "@/lib/journal-securite";
import {
  composerExport,
  nomFichierExport,
  PLAFOND_EXPORT,
  TAILLE_PAGE_EXPORT,
  type LigneExport,
} from "@/lib/export-inventaire";

const COLONNES = "marque,produit,reference_produit,teinte_nom,teinte_reference,couleur_hex,"
  + "mode_quantite,quantite_nominale,quantite_restante,unite,pourcentage_restant,etat,notes,"
  + "created_at,updated_at,archived_at,colors_emplacements(nom)";

/**
 * Export CSV de l'inventaire.
 *
 * La lecture est paginée jusqu'à épuisement. La version précédente s'arrêtait à
 * `.limit(5000)` sans rien dire : au-delà de cinq mille seaux, l'organisation
 * recevait un fichier amputé qui avait toutes les apparences d'un inventaire
 * complet. Le plafond subsiste — une requête doit se terminer — mais il est dix
 * fois plus haut et il s'annonce, dans le fichier comme dans son nom.
 *
 * Le cloisonnement reste porté par la RLS : `entreprise_id` vient du contexte
 * canonique et le filtre explicite ci-dessous ne fait que le redire.
 */
export async function GET() {
  const contexte = await getContexteColors();
  await exigerAccesApplication(contexte, "colors");
  if (!contexte.entrepriseId || !peutEffectuerColors(await resoudreRoleColors(contexte), "exporter")) {
    return NextResponse.json({ erreur: "Export non autorisé" }, { status: 403 });
  }

  const supabase = await createClient();
  const seaux: LigneExport[] = [];
  let tronque = false;

  for (let debut = 0; debut < PLAFOND_EXPORT; debut += TAILLE_PAGE_EXPORT) {
    const fin = Math.min(debut + TAILLE_PAGE_EXPORT, PLAFOND_EXPORT) - 1;
    const { data, error } = await supabase.from("colors_seaux")
      .select(COLONNES)
      .eq("entreprise_id", contexte.entrepriseId)
      // Un ordre stable et total : `marque` seule laisserait deux pages se
      // recouvrir ou s'omettre entre deux requêtes sur des lignes homonymes.
      .order("marque").order("produit").order("id")
      .range(debut, fin);
    if (error) {
      journaliserEchecTechnique("colors_seaux.export", error);
      return NextResponse.json({ erreur: "Export indisponible" }, { status: 500 });
    }
    const page = (data ?? []) as unknown as LigneExport[];
    seaux.push(...page);
    if (page.length < fin - debut + 1) break;
    if (seaux.length >= PLAFOND_EXPORT) { tronque = true; break; }
  }

  const nom = nomFichierExport(new Date(), tronque);
  return new NextResponse(composerExport(seaux, nuancierColors(), tronque), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
    },
  });
}
