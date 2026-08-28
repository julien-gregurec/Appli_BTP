import { NextResponse } from "next/server";
import { getContexteColors } from "@/lib/contexte";
import { exigerAccesApplication } from "@/lib/applications-elsatia";
import { resoudreRoleColors } from "@/lib/acces-colors";
import { peutEffectuerColors } from "@/lib/permissions-colors";
import { cheminPhotoColors, validerPhotoColors } from "@/lib/media-colors";
import { createClient } from "@/lib/supabase/server";

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
  const chemin = cheminPhotoColors(contexte.entrepriseId,seauId,photo.name);
  const contenu = new Uint8Array(await photo.arrayBuffer());
  const { error: erreurStockage } = await supabase.storage.from("colors-seaux").upload(chemin,contenu,{contentType:photo.type,cacheControl:"3600",upsert:false});
  if (erreurStockage) return NextResponse.json({erreur:"Téléversement impossible"},{status:400});
  const { error: erreurLiaison } = await supabase.rpc("colors_definir_photo",{p_seau_id:seauId,p_photo_path:chemin});
  if (erreurLiaison) {
    await supabase.storage.from("colors-seaux").remove([chemin]);
    return NextResponse.json({erreur:"Association de la photo impossible"},{status:400});
  }
  let nettoyageRequis=false;
  if(seau.photo_principale_path&&seau.photo_principale_path!==chemin){
    const {error}=await supabase.storage.from("colors-seaux").remove([seau.photo_principale_path]);
    nettoyageRequis=Boolean(error);
  }
  return NextResponse.json({ok:true,nettoyageRequis});
}
