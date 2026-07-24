import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { sha256 } from "@/lib/expenses/integrity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, getContexteEntreprise()]);
  const supabase = await createClient();
  const { data: piece } = await supabase.from("pieces_jointes_paie").select("id,entreprise_id,dossier_id,nom_original,storage_path,mime_type,empreinte_sha256").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!piece) return NextResponse.json({ error: "Document inaccessible" }, { status: 404 });
  const { data: fichier, error } = await supabase.storage.from("documents-paie").download(piece.storage_path);
  if (error || !fichier) return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
  const contenu = new Uint8Array(await fichier.arrayBuffer());
  const empreinte = sha256(contenu);
  if (piece.empreinte_sha256 && piece.empreinte_sha256 !== empreinte) {
    const admin = createAdminClient();
    await admin.from("journal_audit_paie").insert({ entreprise_id: ctx.entrepriseId, periode_id: null, dossier_id: piece.dossier_id, utilisateur_id: ctx.userId, action: "anomalie_integrite_detectee", ressource_type: "piece_jointe_paie", ressource_id: piece.id, nouvelle_valeur: { attendue: piece.empreinte_sha256, obtenue: empreinte } });
    return NextResponse.json({ error: "Anomalie d’intégrité détectée" }, { status: 409 });
  }
  const admin = createAdminClient();
  await admin.from("journal_audit_paie").insert({ entreprise_id: ctx.entrepriseId, periode_id: null, dossier_id: piece.dossier_id, utilisateur_id: ctx.userId, action: "telechargement_piece", ressource_type: "piece_jointe_paie", ressource_id: piece.id, nouvelle_valeur: { empreinte } });
  const telecharger = new URL(request.url).searchParams.get("download") === "1";
  const body = contenu.buffer.slice(contenu.byteOffset, contenu.byteOffset + contenu.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { "Content-Type": piece.mime_type, "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="document"; filename*=UTF-8''${encodeURIComponent(piece.nom_original)}`, "Cache-Control": "private, no-store", "X-Content-SHA256": empreinte } });
}
