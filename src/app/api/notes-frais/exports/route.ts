import { NextResponse } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { permissionsUtilisateur } from "@/lib/permissions";
import { creerCsv, creerManifeste, nomJustificatifExport } from "@/lib/expenses/export";
import { sha256, verifierEmpreinte } from "@/lib/expenses/integrity";
import { ajouterAudit } from "@/lib/expenses/audit";

export const runtime="nodejs";
export const maxDuration=60;

const extensionMime:Record<string,string>={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"};
const eligible=["valide","validee","remboursee","exporte_comptabilite","verrouille","archive"];

export async function GET(request:Request) {
  if(isEmailLoginDisabled()) return NextResponse.json({error:"Compte personnel sécurisé requis"},{status:403});
  let exportId:string|null=null;
  try {
    const ctx=await getContexteEntreprise(); const supabase=await createClient(); const permissions=await permissionsUtilisateur(ctx);
    if(!permissions?.includes("exporter_notes_frais")) return NextResponse.json({error:"Autorisation d’export requise"},{status:403});
    const url=new URL(request.url); const debut=url.searchParams.get("debut")||new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10); const fin=url.searchParams.get("fin")||new Date().toISOString().slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(debut)||!/^\d{4}-\d{2}-\d{2}$/.test(fin)||fin<debut) return NextResponse.json({error:"Période invalide"},{status:400});
    const filtres={employe:url.searchParams.get("employe")||null,chantier:url.searchParams.get("chantier")||null,categorie:url.searchParams.get("categorie")||null,fournisseur:url.searchParams.get("fournisseur")||null,taux_tva:url.searchParams.get("taux_tva")||null,statut_export:url.searchParams.get("statut_export")||null};
    let q=supabase.from("notes_frais").select("id,reference,date_frais,fournisseur,categorie,montant_ht,montant_tva,taux_tva,montant_ttc,devise,moyen_paiement,statut,statut_export,reference_comptable,employe_id,chantier_id,employe:employes(prenom,nom),chantier:chantiers!notes_frais_chantier_entreprise_fkey(nom)").eq("entreprise_id",ctx.entrepriseId).gte("date_frais",debut).lte("date_frais",fin).in("statut",eligible).order("date_frais").limit(500);
    if(filtres.employe)q=q.eq("employe_id",filtres.employe); if(filtres.chantier)q=q.eq("chantier_id",filtres.chantier); if(filtres.categorie)q=q.eq("categorie",filtres.categorie); if(filtres.fournisseur)q=q.ilike("fournisseur",`%${filtres.fournisseur.replace(/[%_]/g,"")}%`); if(filtres.taux_tva)q=q.eq("taux_tva",Number(filtres.taux_tva)); if(filtres.statut_export)q=q.eq("statut_export",filtres.statut_export);
    const {data:notes,error:notesError}=await q; if(notesError)throw new Error(notesError.message); if(!notes?.length)return NextResponse.json({error:"Aucune dépense validée pour ces filtres"},{status:404});
    const {data:creation,error:creationError}=await supabase.from("exports_notes_frais").insert({entreprise_id:ctx.entrepriseId,periode_debut:debut,periode_fin:fin,filtres,cree_par:ctx.userId}).select("id").single(); if(creationError||!creation)throw new Error(creationError?.message||"Création de l’export impossible"); exportId=creation.id;
    const noteIds=notes.map(n=>n.id); const {data:documents,error:documentsError}=await supabase.from("documents_notes_frais").select("id,note_frais_id,type_document").in("note_frais_id",noteIds); if(documentsError)throw new Error(documentsError.message);
    const documentIds=(documents??[]).map(d=>d.id); if(!documentIds.length)throw new Error("Aucun justificatif original dans la sélection");
    const {data:versions,error:versionsError}=await supabase.from("versions_documents_notes_frais").select("id,document_id,numero_page,role_fichier,storage_path,nom_fichier_original,type_mime_detecte,taille_octets,empreinte_sha256").in("document_id",documentIds).in("role_fichier",["original","archive_figee","consultation"]).order("numero_page"); if(versionsError)throw new Error(versionsError.message);
    const fichiers:Record<string,Uint8Array>={}; const manifesteFichiers:{chemin:string;sha256:string;taille:number;noteReference:string;documentVersionId:string}[]=[]; const items:{note_id:string;version_id:string;chemin:string;sha256:string}[]=[];
    const noteMap=new Map(notes.map(n=>[n.id,n])); const documentMap=new Map((documents??[]).map(d=>[d.id,d]));
    for(const version of versions??[]){const document=documentMap.get(version.document_id);const note=document?noteMap.get(document.note_frais_id):null;if(!document||!note)continue;const {data,error}=await supabase.storage.from("notes-frais").download(version.storage_path);if(error||!data)throw new Error(`Lecture impossible pour ${note.reference}`);const bytes=new Uint8Array(await data.arrayBuffer());if(!verifierEmpreinte(bytes,version.empreinte_sha256)){await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:"anomalie_integrite_detectee",ressourceType:"document_note_frais",ressourceId:document.id,empreinteDocument:sha256(bytes),metadata:{attendue:version.empreinte_sha256}});throw new Error(`Anomalie d’intégrité détectée pour ${note.reference}`);}const extension=extensionMime[version.type_mime_detecte]||"bin";const base=nomJustificatifExport(note.date_frais,note.fournisseur,Number(note.montant_ttc),note.reference,extension);const chemin=`justificatifs/${note.reference}/${version.role_fichier}-page-${version.numero_page}-${base}`;fichiers[chemin]=bytes;manifesteFichiers.push({chemin,sha256:version.empreinte_sha256,taille:bytes.length,noteReference:note.reference,documentVersionId:version.id});items.push({note_id:note.id,version_id:version.id,chemin,sha256:version.empreinte_sha256});}
    const valeurLiee=<T extends {prenom?:string;nom?:string} | {nom?:string}>(v:T|T[]|null)=>Array.isArray(v)?v[0]??null:v;
    const entetes=["Référence","Date","Salarié","Chantier","Fournisseur","Catégorie","HT","TVA","Taux TVA","TTC","Devise","Paiement","Statut","Référence comptable"];
    const lignes=notes.map(n=>{const e=valeurLiee(n.employe as {prenom:string;nom:string}|{prenom:string;nom:string}[]|null);const c=valeurLiee(n.chantier as {nom:string}|{nom:string}[]|null);return[n.reference,n.date_frais,e?`${e.prenom} ${e.nom}`:"",c?.nom??"Frais généraux",n.fournisseur,n.categorie,n.montant_ht,n.montant_tva,n.taux_tva,n.montant_ttc,n.devise,n.moyen_paiement,n.statut,n.reference_comptable];});
    fichiers["recapitulatif.csv"]=strToU8(`\uFEFF${creerCsv(entetes,lignes)}`); const {data:validations}=await supabase.from("validations_notes_frais").select("note_frais_id,action,ancien_statut,nouveau_statut,message,utilisateur_id,role_utilisateur,created_at").in("note_frais_id",noteIds).order("created_at"); fichiers["historique-validations.json"]=strToU8(JSON.stringify(validations??[],null,2));
    const genereAt=new Date().toISOString(); const manifeste=creerManifeste({entrepriseId:ctx.entrepriseId,entrepriseNom:ctx.entrepriseNom,periodeDebut:debut,periodeFin:fin,genereAt,fichiers:manifesteFichiers}); fichiers["manifeste.json"]=strToU8(JSON.stringify(manifeste,null,2));
    const zip=zipSync(fichiers,{level:6}); if(zip.byteLength>250*1024*1024)throw new Error("Export supérieur à 250 Mo : réduisez la période"); const zipHash=sha256(zip); const nom=`notes-frais_${debut}_${fin}_${exportId}.zip`; const path=`companies/${ctx.entrepriseId}/exports/${nom}`; const {error:uploadError}=await supabase.storage.from("notes-frais-exports").upload(path,zip,{contentType:"application/zip",cacheControl:"0",upsert:false});if(uploadError)throw new Error(uploadError.message);
    const {error:finalError}=await supabase.rpc("finaliser_export_notes_frais",{p_export_id:exportId,p_storage_path:path,p_nom_fichier:nom,p_empreinte:zipHash,p_taille:zip.byteLength,p_items:items});if(finalError)throw new Error(finalError.message);
    await ajouterAudit(supabase,{entrepriseId:ctx.entrepriseId,action:"export_comptable_cree",ressourceType:"export_note_frais",ressourceId:creation.id,empreinteDocument:zipHash,metadata:{debut,fin,nombre:notes.length,taille:zip.byteLength}});
    const body=zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength) as ArrayBuffer; return new Response(body,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${nom}"`,"Cache-Control":"private, no-store","X-Content-SHA256":zipHash}});
  } catch(error){if(exportId){try{const supabase=await createClient();await supabase.from("exports_notes_frais").update({statut:"erreur",termine_at:new Date().toISOString()}).eq("id",exportId);}catch{}}return NextResponse.json({error:error instanceof Error?error.message:"Export impossible"},{status:400});}
}
