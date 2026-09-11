import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { reponseTexteCsv } from "@/lib/csv";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { chargerCatalogueV2 } from "@/lib/devis/catalogue-serveur";
import { catalogueCsvDepuisBase, droitsExportDevis, nomFichierCsv } from "@/lib/devis/exports-csv";

/**
 * GET /api/exports/catalogue — catalogue des devis au format CSV de réimport (moteur v2).
 *
 * - Moteur v2 éteint : 404, sans lire la session ni la base (les colonnes n'existent pas).
 * - `acces_devis` requis (403 sinon) ; lecture sous la RLS de l'utilisateur, filtrée sur son entreprise.
 * - `prix_achat_ht` : colonne présente SEULEMENT avec `voir_couts_devis` ; sans ce droit, les coûts
 *   ne sont pas même lus.
 */
export async function GET() {
  if (!devisV2Actif()) return Response.json({ error: "Introuvable" }, { status: 404 });

  const ctx = await getContexteEntreprise();
  const droits = droitsExportDevis(await permissionsUtilisateur(ctx));
  if (!droits.acces) return Response.json({ error: "Accès au catalogue des devis non autorisé" }, { status: 403 });

  const supabase = await createClient();
  const catalogue = await chargerCatalogueV2(supabase, ctx.entrepriseId, { voirCouts: droits.voirCouts });
  if ("erreur" in catalogue) {
    console.error("GET /api/exports/catalogue", catalogue.erreur);
    return Response.json({ error: "Export temporairement indisponible" }, { status: 503 });
  }

  const texte = catalogueCsvDepuisBase(catalogue.prestations, catalogue.fournisseurs, catalogue.couts, {
    inclurePrixAchat: droits.voirCouts,
  });
  return reponseTexteCsv(texte, nomFichierCsv(`catalogue-articles-${new Date().toISOString().slice(0, 10)}`));
}
