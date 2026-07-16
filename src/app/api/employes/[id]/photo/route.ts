import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const{id}=await params,ctx=await getContexteEntreprise(),supabase=await createClient();
  const{data:employe}=await supabase.from("employes").select("photo_storage_path").eq("id",id).eq("entreprise_id",ctx.entrepriseId).maybeSingle();
  if(!employe?.photo_storage_path)return NextResponse.json({error:"Photo introuvable"},{status:404});
  const{data,error}=await supabase.storage.from("documents-employes").createSignedUrl(employe.photo_storage_path,120);
  if(error||!data)return NextResponse.json({error:"Photo indisponible"},{status:503});
  return NextResponse.redirect(data.signedUrl,{headers:{"Cache-Control":"private, max-age=90"}});
}
