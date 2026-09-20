import { NextResponse } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContexteEntreprise } from "@/lib/entreprise";
import { sha256 } from "@/lib/expenses/integrity";
import { listerFichiersEntreprise } from "@/lib/rgpd/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TAILLE_MAX_OCTETS = 500 * 1024 * 1024;

// Export RGPD complet (art. 15 & 20) : ZIP contenant les données structurées
// (toutes les tables entreprise_id, via exporter_donnees_entreprise) et les
// fichiers Storage réellement présents (documents, photos, signatures,
// justificatifs...), avec un manifeste (chemin, bucket, checksum sha256,
// taille) qui trace aussi les fichiers référencés en base mais absents du
// Storage (orphelins) sans faire échouer l'export entier. Le contrôle de
// droit (gerer_parametres) est fait par les fonctions SQL elles-mêmes.
export async function GET() {
  const { entrepriseId } = await getContexteEntreprise();
  if (!entrepriseId) {
    return NextResponse.json({ error: "Aucune entreprise active" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: donnees, error } = await supabase.rpc("exporter_donnees_entreprise", { p_entreprise_id: entrepriseId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const { data: referencesMetier, error: erreurReferences } = await supabase.rpc("manifeste_storage_entreprise", { p_entreprise_id: entrepriseId });
  if (erreurReferences) {
    return NextResponse.json({ error: erreurReferences.message }, { status: 403 });
  }

  const admin = createAdminClient();
  const inventaire = await listerFichiersEntreprise(admin, entrepriseId);

  const fichiers: Record<string, Uint8Array> = {};
  const manifesteFichiers: Array<{ bucket: string; chemin: string; sha256: string; taille: number; absent: boolean }> = [];
  let tailleTotale = 0;

  for (const { bucket, chemins, erreurs } of inventaire) {
    for (const chemin of chemins) {
      const { data, error: erreurTelechargement } = await admin.storage.from(bucket).download(chemin);
      if (erreurTelechargement || !data) {
        // Fichier référencé par la liste du bucket mais illisible/disparu entre
        // le listing et le téléchargement : on le trace comme absent plutôt
        // que de faire échouer tout l'export.
        manifesteFichiers.push({ bucket, chemin, sha256: "", taille: 0, absent: true });
        continue;
      }
      const octets = new Uint8Array(await data.arrayBuffer());
      tailleTotale += octets.byteLength;
      if (tailleTotale > TAILLE_MAX_OCTETS) {
        return NextResponse.json({ error: "Export supérieur à 500 Mo : contactez le support pour un export assisté." }, { status: 413 });
      }
      const cheminZip = `storage/${bucket}/${chemin}`;
      fichiers[cheminZip] = octets;
      manifesteFichiers.push({ bucket, chemin, sha256: sha256(octets), taille: octets.byteLength, absent: false });
    }
    for (const erreurBucket of erreurs) {
      manifesteFichiers.push({ bucket, chemin: erreurBucket, sha256: "", taille: 0, absent: true });
    }
  }

  const genereLe = new Date().toISOString();
  fichiers["donnees.json"] = strToU8(JSON.stringify(donnees, null, 2));
  fichiers["references-metier-storage.json"] = strToU8(JSON.stringify(referencesMetier ?? [], null, 2));
  fichiers["manifeste.json"] = strToU8(JSON.stringify({
    entreprise_id: entrepriseId,
    genere_le: genereLe,
    nombre_fichiers: manifesteFichiers.filter((f) => !f.absent).length,
    nombre_fichiers_absents: manifesteFichiers.filter((f) => f.absent).length,
    fichiers: manifesteFichiers,
  }, null, 2));

  const zip = zipSync(fichiers, { level: 6 });
  const nomFichier = `export-donnees-liria-${genereLe.slice(0, 10)}.zip`;
  const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
      "Cache-Control": "no-store",
    },
  });
}
