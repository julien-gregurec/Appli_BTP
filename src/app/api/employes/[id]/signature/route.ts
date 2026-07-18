import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, ctx = await getContexteEntreprise(), supabase = await createClient();
  const documentSignatureId = new URL(request.url).searchParams.get("document");
  let path: string | null = null;
  if (documentSignatureId) {
    const { data: signature } = await supabase.from("signatures_documents").select("signature_storage_path,employe_id")
      .eq("id", documentSignatureId).eq("employe_id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
    path = signature?.signature_storage_path ?? null;
  } else {
    const { data: employe } = await supabase.from("employes").select("signature_storage_path")
      .eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
    path = employe?.signature_storage_path ?? null;
  }
  if (!path) return NextResponse.json({ error: "Signature introuvable" }, { status: 404 });
  const { data, error } = await supabase.storage.from("documents-employes").createSignedUrl(path, 120);
  if (error || !data) return NextResponse.json({ error: "Signature indisponible" }, { status: 503 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=90" } });
}
