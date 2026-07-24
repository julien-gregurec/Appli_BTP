import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { validerJustificatif } from "@/lib/expenses/files";
import { sha256 } from "@/lib/expenses/integrity";
import { permissionsUtilisateur } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const identifiantValide = (valeur: string) => /^[0-9a-f-]{36}$/i.test(valeur);

export async function POST(request: Request) {
  try {
    const ctx = await getContexteEntreprise();
    const supabase = await createClient();
    const permissions = await permissionsUtilisateur(ctx);
    if (permissions !== null && !permissions.includes("gerer_paie")) return NextResponse.json({ error: "Autorisation de gestion paie requise" }, { status: 403 });
    const form = await request.formData();
    const fichier = form.get("fichier");
    const employeId = String(form.get("employe_id") ?? "");
    const dossierId = String(form.get("dossier_id") ?? "");
    const typeDocument = String(form.get("type_document") ?? "autre").trim() || "autre";
    const retour = String(form.get("retour") ?? "/paie");
    if (!(fichier instanceof File) || fichier.size === 0) return NextResponse.json({ error: "Fichier obligatoire" }, { status: 400 });
    if (!identifiantValide(employeId) && !identifiantValide(dossierId)) return NextResponse.json({ error: "Salarié ou dossier invalide" }, { status: 400 });
    if (fichier.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Fichier supérieur à 20 Mo" }, { status: 413 });

    let employeCible = identifiantValide(employeId) ? employeId : null;
    if (identifiantValide(dossierId)) {
      const { data: dossier } = await supabase.from("dossiers_paie_salaries").select("id,employe_id").eq("id", dossierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
      if (!dossier) return NextResponse.json({ error: "Dossier de paie inaccessible" }, { status: 404 });
      employeCible = dossier.employe_id;
    } else {
      const { data: employe } = await supabase.from("employes").select("id").eq("id", employeCible).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
      if (!employe) return NextResponse.json({ error: "Salarié inaccessible" }, { status: 404 });
    }
    const bytes = new Uint8Array(await fichier.arrayBuffer());
    const format = validerJustificatif(bytes, fichier.name, 20 * 1024 * 1024);
    const empreinte = sha256(bytes);
    const chemin = `${ctx.entrepriseId}/${employeCible}/${dossierId || "permanent"}/${crypto.randomUUID()}.${format.extension}`;
    const { error: erreurUpload } = await supabase.storage.from("documents-paie").upload(chemin, bytes, { contentType: format.mime, cacheControl: "0", upsert: false });
    if (erreurUpload) throw new Error(erreurUpload.message);
    const { error: erreurInsertion } = await supabase.from("pieces_jointes_paie").insert({ entreprise_id: ctx.entrepriseId, employe_id: employeCible, dossier_id: dossierId || null, type_document: typeDocument, nom_original: fichier.name, storage_path: chemin, mime_type: format.mime, taille_octets: bytes.byteLength, empreinte_sha256: empreinte, importe_par: ctx.userId });
    if (erreurInsertion) {
      await supabase.storage.from("documents-paie").remove([chemin]);
      throw new Error(erreurInsertion.message);
    }
    const destination = retour.startsWith("/") && !retour.startsWith("//") ? retour : "/paie";
    return NextResponse.redirect(new URL(`${destination}${destination.includes("?") ? "&" : "?"}success=${encodeURIComponent("Pièce jointe privée ajoutée")}`, request.url), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import impossible" }, { status: 400 });
  }
}
