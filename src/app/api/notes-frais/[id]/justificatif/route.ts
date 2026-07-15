import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isEmailLoginDisabled()) return NextResponse.json({ error: "Accès personnel sécurisé requis" }, { status: 403 });
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: note } = await supabase
    .from("notes_frais")
    .select("justificatif_storage_path, justificatif_nom")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!note?.justificatif_storage_path) return NextResponse.json({ error: "Justificatif introuvable" }, { status: 404 });

  const telecharger = new URL(request.url).searchParams.get("download") === "1";
  const {data:fichier,error}=await supabase.storage.from("notes-frais").download(note.justificatif_storage_path);
  if(error||!fichier)return NextResponse.json({error:"Document indisponible"},{status:503});
  const bytes=new Uint8Array(await fichier.arrayBuffer()),nom=(note.justificatif_nom??"justificatif").replace(/[\r\n"]/g,"_");
  const contenu=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  return new NextResponse(contenu,{headers:{
    "Content-Type":fichier.type||"application/octet-stream",
    "Content-Length":String(bytes.byteLength),
    "Cache-Control":"private, no-store",
    "Content-Disposition":`${telecharger?"attachment":"inline"}; filename="justificatif"; filename*=UTF-8''${encodeURIComponent(nom)}`,
  }});
}
