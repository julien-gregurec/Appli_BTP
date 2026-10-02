import { NextResponse } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { permissionsUtilisateur } from "@/lib/permissions";
import { creerCsv, creerManifeste, nomJustificatifExport } from "@/lib/expenses/export";
import { sha256, verifierEmpreinte } from "@/lib/expenses/integrity";
import { ajouterAudit } from "@/lib/expenses/audit";
import { lireJustificatifsExport, lireValidationsExport, selectionnerNotesExport, type FiltresExportNotesFrais } from "@/lib/expenses/export-selection";

export const runtime="nodejs";
export const maxDuration=60;

const extensionMime:Record<string,string>={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"};

export async function GET(request:Request) {
  if(isEmailLoginDisabled()) return NextResponse.json({error:"Compte personnel sécurisé requis"},{status:403});
  let exportId:string|null=null;
  try {
    const ctx=await getContexteEntreprise(); const supabase=await createClient(); const permissions=await permissionsUtilisateur(ctx);
    if(!permissions?.includes("exporter_notes_frais")) return NextResponse.json({error:"Autorisation d’export requise"},{status:403});
    const url=new URL(request.url); const debut=url.searchParams.get("debut")||new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10); const fin=url.searchParams.get("fin")||new Date().toISOString().slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(debut)||!/^\d{4}-\d{2}-\d{2}$/.test(fin)||fin<debut) return NextResponse.json({error:"Période invalide"},{status:400});
    const filtres:FiltresExportNotesFrais={employe:url.searchParams.get("employe")||null,chantier:url.searchParams.get("chantier")||null,categorie:url.searchParams.get("categorie")||null,fournisseur:url.searchParams.get("fournisseur")||null,taux_tva:url.searchParams.get("taux_tva")||null,statut_export:url.searchParams.get("statut_export")||null};
    const selection=await selectionnerNotesExport(supabase,ctx.entrepriseId,debut,fin,filtres); if(selection.statut==="trop_volumineux")return NextResponse.json({error:`Plus de ${selection.limite} dépenses validées pour ces filtres : réduisez la période ou ajoutez un filtre`},{status:413}); const notes=selection.notes; if(!notes.length)return NextResponse.json({error:"Aucune dépense validée pour ces filtres"},{status:404});
    const {data:creation,error:creationError}=await supabase.from("exports_notes_frais").insert({entreprise_id:ctx.entrepriseId,periode_debut:debut,periode_fin:fin,filtres,cree_par:ctx.userId}).select("id").single(); if(creationError||!creation)throw new Error(creationError?.message||"Création de l’export impossible"); exportId=creation.id;
    const noteIds=notes.map(n=>n.id); const {documents,versions}=await lireJustificatifsExport(supabase,noteIds);
    if(!documents.length)throw new Error("Aucun justificatif original dans la sélection");
    const fichiers:Record<string,Uint8Array>={}; const manifesteFichiers:{chemin:string;sha256:string;taille:number;noteReference:string;documentVersionId:string}[]=[]; const items:{note_id:string;version_id:string;chemin:string;sha256:string}[]=[];
    const noteMap=new Map(notes.map(n=>[n.id,n])); const documentMap=new Map(documents.map(d=>[d.id,d]));
    for(const version of versions){const document=documentMap.get(version.document_id);const note=document?noteMap.get(document.note_frais_id):null;if(!document||!note)continue;const {data,error}=await supabase.storage.from("notes-frais").download(version.storage_path);if(error||!data)throw new Error(`Lecture impossible pour ${note.reference}`);const bytes=new Uint8Array(await data.arrayBuffer());if(!verifierEmpreinte(bytes,version.empreinte_sha256)){await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:"anomalie_integrite_detectee",ressourceType:"document_note_frais",ressourceId:document.id,empreinteDocument:sha256(bytes),metadata:{attendue:version.empreinte_sha256}});throw new Error(`Anomalie d’intégrité détectée pour ${note.reference}`);}const extension=extensionMime[version.type_mime_detecte]||"bin";const base=nomJustificatifExport(note.date_frais,note.fournisseur,Number(note.montant_ttc),note.reference,extension);const chemin=`justificatifs/${note.reference}/${version.role_fichier}-page-${version.numero_page}-${base}`;fichiers[chemin]=bytes;manifesteFichiers.push({chemin,sha256:version.empreinte_sha256,taille:bytes.length,noteReference:note.reference,documentVersionId:version.id});items.push({note_id:note.id,version_id:version.id,chemin,sha256:version.empreinte_sha256});}
    const valeurLiee=<T extends {prenom?:string;nom?:string} | {nom?:string}>(v:T|T[]|null)=>Array.isArray(v)?v[0]??null:v;
    const entetes=["Référence","Date","Salarié","Chantier","Fournisseur","Catégorie","HT","TVA","Taux TVA","TTC","Devise","Paiement","Statut","Référence comptable"];
    const lignes=notes.map(n=>{const e=valeurLiee(n.employe as {prenom:string;nom:string}|{prenom:string;nom:string}[]|null);const c=valeurLiee(n.chantier as {nom:string}|{nom:string}[]|null);return[n.reference,n.date_frais,e?`${e.prenom} ${e.nom}`:"",c?.nom??"Frais généraux",n.fournisseur,n.categorie,n.montant_ht,n.montant_tva,n.taux_tva,n.montant_ttc,n.devise,n.moyen_paiement,n.statut,n.reference_comptable];});
    fichiers["recapitulatif.csv"]=strToU8(`\uFEFF${creerCsv(entetes,lignes)}`); const validations=await lireValidationsExport(supabase,noteIds); fichiers["historique-validations.json"]=strToU8(JSON.stringify(validations,null,2));
    const genereAt=new Date().toISOString(); const manifeste=creerManifeste({entrepriseId:ctx.entrepriseId,entrepriseNom:ctx.entrepriseNom,periodeDebut:debut,periodeFin:fin,genereAt,fichiers:manifesteFichiers}); fichiers["manifeste.json"]=strToU8(JSON.stringify(manifeste,null,2));
    const zip=zipSync(fichiers,{level:6}); if(zip.byteLength>250*1024*1024)throw new Error("Export supérieur à 250 Mo : réduisez la période"); const zipHash=sha256(zip); const nom=`notes-frais_${debut}_${fin}_${exportId}.zip`; const path=`companies/${ctx.entrepriseId}/exports/${nom}`; const {error:uploadError}=await supabase.storage.from("notes-frais-exports").upload(path,zip,{contentType:"application/zip",cacheControl:"0",upsert:false});if(uploadError)throw new Error(uploadError.message);
    const {error:finalError}=await supabase.rpc("finaliser_export_notes_frais",{p_export_id:exportId,p_storage_path:path,p_nom_fichier:nom,p_empreinte:zipHash,p_taille:zip.byteLength,p_items:items});if(finalError)throw new Error(finalError.message);
    await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:"export_comptable_cree",ressourceType:"export_note_frais",ressourceId:creation.id,empreinteDocument:zipHash,metadata:{debut,fin,nombre:notes.length,taille:zip.byteLength}});
    const body=zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength) as ArrayBuffer; return new Response(body,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${nom}"`,"Cache-Control":"private, no-store","X-Content-SHA256":zipHash}});
  } catch(error){console.error("Échec d'export des notes de frais",error);if(exportId){try{const supabase=await createClient();await supabase.from("exports_notes_frais").update({statut:"erreur",termine_at:new Date().toISOString()}).eq("id",exportId);}catch{}}return NextResponse.json({error:"Export impossible"},{status:400});}
}
