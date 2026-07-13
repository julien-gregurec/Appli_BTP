import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

export async function GET(request:Request){
  const ctx=await getContexteEntreprise(),supabase=await createClient();
  const{data:employe}=await supabase.from("employes").select("carte_btp_storage_path,carte_btp_nom").eq("entreprise_id",ctx.entrepriseId).eq("utilisateur_id",ctx.userId).maybeSingle();
  if(!employe?.carte_btp_storage_path)return NextResponse.json({error:"Carte BTP introuvable"},{status:404});
  const telecharger=new URL(request.url).searchParams.get("download")==="1";
  const{data,error}=await supabase.storage.from("documents-employes").createSignedUrl(employe.carte_btp_storage_path,120,telecharger?{download:employe.carte_btp_nom??"carte-btp"}:undefined);
  if(error||!data)return NextResponse.json({error:"Document indisponible"},{status:503});
  return NextResponse.redirect(data.signedUrl);
}
