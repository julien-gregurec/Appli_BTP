import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { peutExporterComptabilite } from "@/lib/permissions-financieres";
import { periodeDepuisUrl, reponseCsv } from "@/lib/csv";
import { reponseXlsx } from "@/lib/xlsx";
import { construireExportComptable, exportTropVolumineux, TYPES_EXPORT_COMPTABLE, type TypeExportComptable } from "@/lib/exports-comptables";
const reponseExport = (lignes: unknown[][], nom: string, feuille: string, format: string) => format === "csv"
  ? reponseCsv(lignes, `${nom}.csv`)
  : reponseXlsx(lignes, `${nom}.xlsx`, { nomFeuille: feuille });
export async function GET(request: Request) {
  const periode = periodeDepuisUrl(request.url); if (!periode) return Response.json({ error: "Période invalide" }, { status: 400 });
  const url = new URL(request.url); const type = url.searchParams.get("type") ?? "ventes"; const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx"; if (!(TYPES_EXPORT_COMPTABLE as readonly string[]).includes(type)) return Response.json({ error: "Export inconnu" }, { status: 400 });
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!peutExporterComptabilite(permissions)) {
    return Response.json({ error: "Accès aux exports comptables non autorisé" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: exportComptable, error } = await construireExportComptable(supabase, ctx.entrepriseId, type as TypeExportComptable, periode);
  if (exportTropVolumineux(error)) return Response.json({ error: "Export trop volumineux pour une seule période : réduisez la période" }, { status: 413 });
  if (error || !exportComptable) return Response.json({ error: "Export temporairement indisponible" }, { status: 503 });
  return reponseExport(exportComptable.lignes, exportComptable.nom, exportComptable.feuille, format);
}
