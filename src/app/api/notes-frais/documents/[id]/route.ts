import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { verifierEmpreinte } from "@/lib/expenses/integrity";
import { ajouterAudit, journaliserAccesRefuse } from "@/lib/expenses/audit";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isEmailLoginDisabled()) return NextResponse.json({ error: "Compte personnel sécurisé requis" }, { status: 403 });
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: version } = await supabase
    .from("versions_documents_notes_frais")
    .select("id,document_id,storage_path,nom_fichier_original,empreinte_sha256,type_mime_detecte")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!version) {
    await journaliserAccesRefuse(supabase,{entrepriseId:ctx.entrepriseId,ressourceType:"version_document_note_frais",ressourceId:id,action:"telechargement",motif:"Document inexistant ou non autorisé"});
    return NextResponse.json({ error: "Document inaccessible" }, { status: 404 });
  }

  const { data: fichier, error: downloadError } = await supabase.storage.from("notes-frais").download(version.storage_path);
  if (downloadError || !fichier) return NextResponse.json({ error: "Fichier indisponible" }, { status: 503 });
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  if (!verifierEmpreinte(bytes, version.empreinte_sha256)) {
    await ajouterAudit(supabase, {
      entrepriseId: ctx.entrepriseId,
      action: "anomalie_integrite_detectee",
      ressourceType: "version_document_note_frais",
      ressourceId: version.id,
      empreinteDocument: version.empreinte_sha256,
    });
    return NextResponse.json({ error: "Anomalie d’intégrité : le fichier ne correspond plus à son empreinte" }, { status: 409 });
  }
  await ajouterAudit(supabase, {
    entrepriseId: ctx.entrepriseId,
    action: "document_telecharge",
    ressourceType: "version_document_note_frais",
    ressourceId: version.id,
    empreinteDocument: version.empreinte_sha256,
  });
  const telecharger = new URL(request.url).searchParams.get("download") === "1";
  const { data: lien, error: signedError } = await supabase.storage.from("notes-frais").createSignedUrl(
    version.storage_path,
    60,
    telecharger ? { download: version.nom_fichier_original } : undefined,
  );
  if (signedError || !lien) return NextResponse.json({ error: "Lien temporaire indisponible" }, { status: 503 });
  return NextResponse.redirect(lien.signedUrl);
}
