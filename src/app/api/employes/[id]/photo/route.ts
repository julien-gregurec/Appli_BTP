import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { reponseErreurStorage } from "@/lib/observability/storage-error";
import { obtenirIdCorrelation } from "@/lib/observability/request-id";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const requestId=obtenirIdCorrelation(request);
  const{id}=await params,ctx=await getContexteEntreprise(),supabase=await createClient();
  const{data:employe}=await supabase.from("employes").select("photo_storage_path").eq("id",id).eq("entreprise_id",ctx.entrepriseId).maybeSingle();
  if(!employe?.photo_storage_path)return NextResponse.json({error:"Photo introuvable"},{status:404});
  const{data,error}=await supabase.storage.from("documents-employes").createSignedUrl(employe.photo_storage_path,120);
  if(error||!data){
    return reponseErreurStorage(error,{introuvable:"Photo introuvable",indisponible:"Photo indisponible"},{requestId,route:"/api/employes/[id]/photo",operation:"createSignedUrl"});
  }
  return NextResponse.redirect(data.signedUrl,{headers:{"Cache-Control":"private, max-age=90"}});
}
