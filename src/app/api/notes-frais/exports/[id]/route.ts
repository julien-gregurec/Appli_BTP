import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { sha256 } from "@/lib/expenses/integrity";
import { ajouterAudit } from "@/lib/expenses/audit";

export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  if(isEmailLoginDisabled())return NextResponse.json({error:"Compte personnel sécurisé requis"},{status:403});
  const {id}=await params;const supabase=await createClient();const {data:exportFrais}=await supabase.from("exports_notes_frais").select("id,entreprise_id,storage_path,nom_fichier,empreinte_sha256").eq("id",id).eq("statut","termine").maybeSingle();if(!exportFrais?.storage_path)return NextResponse.json({error:"Export inaccessible"},{status:404});
  const {data,error}=await supabase.storage.from("notes-frais-exports").download(exportFrais.storage_path);if(error||!data)return NextResponse.json({error:"Archive indisponible"},{status:404});const bytes=new Uint8Array(await data.arrayBuffer());const obtenue=sha256(bytes);if(obtenue!==exportFrais.empreinte_sha256){await ajouterAudit(supabase,{entrepriseId:exportFrais.entreprise_id,action:"anomalie_integrite_detectee",ressourceType:"export_note_frais",ressourceId:id,empreinteDocument:obtenue,metadata:{attendue:exportFrais.empreinte_sha256}});return NextResponse.json({error:"Anomalie d’intégrité de l’export"},{status:409});}
  await ajouterAudit(supabase,{entrepriseId:exportFrais.entreprise_id,action:"export_comptable_telecharge",ressourceType:"export_note_frais",ressourceId:id,empreinteDocument:obtenue});const body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;return new Response(body,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${exportFrais.nom_fichier??`export-${id}.zip`}"`,"Cache-Control":"private, no-store","X-Content-SHA256":obtenue}});
}
