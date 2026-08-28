import { NextResponse } from "next/server";
import { getContexteColors } from "@/lib/contexte";
import { exigerAccesApplication } from "@/lib/applications-elsatia";
import { resoudreRoleColors } from "@/lib/acces-colors";
import { peutEffectuerColors } from "@/lib/permissions-colors";
import { cheminPhotoColors, validerPhotoColors, validerSignaturePhotoColors } from "@/lib/media-colors";
import { createClient } from "@/lib/supabase/server";
import { createAdminStorageClient } from "@/lib/supabase/admin-storage";

export async function POST(request: Request) {
  const contexte = await getContexteColors();
  await exigerAccesApplication(contexte,"colors");
  if (!contexte.entrepriseId) return NextResponse.json({erreur:"Organisation requise"},{status:403});
  const role = await resoudreRoleColors(contexte);
  if (!peutEffectuerColors(role,"ocr")) return NextResponse.json({erreur:"Action non autorisée"},{status:403});

  const formulaire = await request.formData();
  const seauId = String(formulaire.get("seauId") ?? "");
  const photo = formulaire.get("photo");
  if (!/^[0-9a-f-]{36}$/i.test(seauId) || !(photo instanceof File)) {
    return NextResponse.json({erreur:"Photo ou seau invalide"},{status:400});
  }
  const erreurPhoto = validerPhotoColors({mime:photo.type,taille:photo.size});
  if (erreurPhoto) return NextResponse.json({erreur:erreurPhoto},{status:400});

  const supabase = await createClient();
  const { data: seau } = await supabase.from("colors_seaux").select("id,photo_principale_path").eq("entreprise_id",contexte.entrepriseId).eq("id",seauId).maybeSingle();
  if (!seau) return NextResponse.json({erreur:"Seau introuvable"},{status:404});
  const contenu = new Uint8Array(await photo.arrayBuffer());
  const signature = validerSignaturePhotoColors(contenu,photo.type);
  if (signature.erreur || !signature.mime) return NextResponse.json({erreur:signature.erreur},{status:400});
  const chemin = cheminPhotoColors(contexte.entrepriseId,seauId,signature.mime);
  let stockage;
  try { stockage=createAdminStorageClient().storage.from("colors-seaux"); }
  catch { return NextResponse.json({erreur:"Stockage Colors indisponible"},{status:503}); }
  const { error: erreurStockage } = await stockage.upload(chemin,contenu,{contentType:signature.mime,cacheControl:"3600",upsert:false});
  if (erreurStockage) return NextResponse.json({erreur:"Téléversement impossible"},{status:400});
  const { error: erreurLiaison } = await supabase.rpc("colors_definir_photo",{p_seau_id:seauId,p_photo_path:chemin});
  if (erreurLiaison) {
    await stockage.remove([chemin]);
    return NextResponse.json({erreur:"Association de la photo impossible"},{status:400});
  }
  let nettoyageRequis=false;let nettoyageSuivi=true;
  if(seau.photo_principale_path&&seau.photo_principale_path!==chemin){
    const ancienChemin=seau.photo_principale_path;
    const {error:erreurSuivi}=await supabase.rpc("colors_signaler_nettoyage_photo",{p_seau_id:seauId,p_photo_path:ancienChemin,p_erreur:null});
    nettoyageSuivi=!erreurSuivi;
    const {error}=await stockage.remove([ancienChemin]);
    nettoyageRequis=Boolean(error);
    if(!error&&nettoyageSuivi){
      const {error:erreurResolution}=await supabase.rpc("colors_resoudre_nettoyage_photo",{p_seau_id:seauId,p_photo_path:ancienChemin});
      nettoyageRequis=Boolean(erreurResolution);
    }
    if(error&&nettoyageSuivi)await supabase.rpc("colors_signaler_nettoyage_photo",{p_seau_id:seauId,p_photo_path:ancienChemin,p_erreur:"Suppression Storage différée"});
  }
  return NextResponse.json({ok:true,nettoyageRequis,nettoyageSuivi});
}
