import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { reponseTexteCsv } from "@/lib/csv";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import type { LigneDevisBase, OuvrageDevisBase } from "@/lib/devis/brouillon-v2";
import { chargerParPages, COLONNES_LIGNES_DEVIS_V2, COLONNES_OUVRAGES_DEVIS_V2 } from "@/lib/devis/catalogue-base";
import { droitsExportDevis, lignesDevisCsvDepuisBase, nomFichierCsv } from "@/lib/devis/exports-csv";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CoutLigneBase = { cle_ligne: string; prix_achat_ht: number | string | null };

/**
 * GET /api/devis/[id]/lignes — lignes internes d'un devis au format CSV (moteur v2) : lignes libres
 * et composants d'ouvrages, avec `ouvrage_reference`, `ouvrage_nom`, `ouvrage_version`.
 *
 * - Moteur v2 éteint : 404, sans lire la session ni la base.
 * - `acces_devis` requis (403) ; le devis doit appartenir à l'entreprise de l'utilisateur (404 sinon).
 * - Coûts (`lignes_devis_couts`) lus et exportés SEULEMENT avec `voir_couts_devis`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!devisV2Actif()) return Response.json({ error: "Introuvable" }, { status: 404 });
  const { id } = await params;

  const ctx = await getContexteEntreprise();
  const droits = droitsExportDevis(await permissionsUtilisateur(ctx));
  if (!droits.acces) return Response.json({ error: "Accès aux devis non autorisé" }, { status: 403 });
  if (!UUID.test(id)) return Response.json({ error: "Devis introuvable" }, { status: 404 });

  const supabase = await createClient();
  const { data: devis, error } = await supabase.from("devis").select("id, numero")
    .eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (error) {
    console.error("GET /api/devis/[id]/lignes", error);
    return Response.json({ error: "Export temporairement indisponible" }, { status: 503 });
  }
  if (!devis) return Response.json({ error: "Devis introuvable" }, { status: 404 });

  const [lignes, ouvrages, couts] = await Promise.all([
    chargerParPages<LigneDevisBase>((de, a) =>
      supabase.from("lignes_devis").select(COLONNES_LIGNES_DEVIS_V2).eq("devis_id", id).order("ordre").order("cle_ligne").range(de, a)),
    chargerParPages<OuvrageDevisBase>((de, a) =>
      supabase.from("devis_ouvrages").select(COLONNES_OUVRAGES_DEVIS_V2).eq("devis_id", id).order("ordre").order("cle").range(de, a)),
    droits.voirCouts
      ? chargerParPages<CoutLigneBase>((de, a) =>
        supabase.from("lignes_devis_couts").select("cle_ligne, prix_achat_ht").eq("devis_id", id).order("cle_ligne").range(de, a))
      : Promise.resolve({ data: [] as CoutLigneBase[], erreur: null as unknown }),
  ]);
  const erreurLecture = lignes.erreur ?? ouvrages.erreur ?? couts.erreur;
  if (erreurLecture) {
    console.error("GET /api/devis/[id]/lignes", erreurLecture);
    return Response.json({ error: "Export temporairement indisponible" }, { status: 503 });
  }

  const texte = lignesDevisCsvDepuisBase(lignes.data, ouvrages.data, couts.data, { inclureCouts: droits.voirCouts });
  return reponseTexteCsv(texte, nomFichierCsv(`devis-${devis.numero ?? "brouillon"}-lignes`));
}
