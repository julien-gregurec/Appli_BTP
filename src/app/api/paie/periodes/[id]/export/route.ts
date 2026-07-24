import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { NextResponse } from "next/server";
import { csv, reponseCsv } from "@/lib/csv";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { reponseXlsx } from "@/lib/xlsx";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type EmployeLie = { prenom: string | null; nom: string | null; reference_interne: string | null; poste: string | null };
type DossierExport = {
  id: string; employe_id: string; statut: string; heures_normales: number; heures_sup_25: number; heures_sup_50: number;
  heures_absence: number; jours_conges: number; total_paniers: number; total_trajets: number; total_transports: number;
  total_grands_deplacements: number; total_kilometres: number; total_primes: number; total_acomptes: number;
  total_notes_frais: number; commentaire_comptable: string | null; employe: EmployeLie | EmployeLie[] | null;
};

const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;
const nomPropre = (valeur: string) => valeur.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
const sha256 = (contenu: Uint8Array) => createHash("sha256").update(contenu).digest("hex");
async function journaliserExport(entrepriseId:string,userId:string,periodeId:string,format:string,nombreDossiers:number){
  const admin=createAdminClient();
  const maintenant=new Date().toISOString();
  const [{error:erreurAudit},{error:erreurPeriode}]=await Promise.all([
    admin.from("journal_audit_paie").insert({entreprise_id:entrepriseId,periode_id:periodeId,utilisateur_id:userId,action:"export_periode_paie",ressource_type:"periode_paie",ressource_id:periodeId,nouvelle_valeur:{format,nombre_dossiers:nombreDossiers,date_export:maintenant}}),
    admin.from("periodes_paie").update({date_export:maintenant,updated_at:maintenant}).eq("id",periodeId).eq("entreprise_id",entrepriseId),
  ]);
  if(erreurAudit||erreurPeriode) throw new Error(erreurAudit?.message??erreurPeriode?.message);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, ctx] = await Promise.all([params, getContexteEntreprise()]);
    const supabase = await createClient();
    const permissions = await permissionsUtilisateur(ctx);
    if (permissions !== null && !permissions.includes("exporter_paie")) return NextResponse.json({ error: "Autorisation d’export paie requise" }, { status: 403 });

    const [{ data: periode, error: erreurPeriode }, { data: dossiers, error: erreurDossiers }] = await Promise.all([
      supabase.from("periodes_paie").select("id,mois,date_debut,date_fin,statut,date_validation,date_export").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
      supabase.from("dossiers_paie_salaries").select("id,employe_id,statut,heures_normales,heures_sup_25,heures_sup_50,heures_absence,jours_conges,total_paniers,total_trajets,total_transports,total_grands_deplacements,total_kilometres,total_primes,total_acomptes,total_notes_frais,commentaire_comptable,employe:employes(prenom,nom,reference_interne,poste)").eq("periode_id", id).eq("entreprise_id", ctx.entrepriseId).order("employe_id"),
    ]);
    if (erreurPeriode || erreurDossiers) throw new Error(erreurPeriode?.message ?? erreurDossiers?.message);
    if (!periode) return NextResponse.json({ error: "Période introuvable" }, { status: 404 });

    const lignes: unknown[][] = [["PRÉPARATION DES VARIABLES DE PAIE"], ["Entreprise", ctx.entrepriseNom], ["Mois", periode.mois], ["Période", `${periode.date_debut} au ${periode.date_fin}`], ["Statut", periode.statut], ["Export UTC", new Date().toISOString()], [], ["Référence salarié", "Salarié", "Poste", "Statut dossier", "Heures normales", "HS 25 %", "HS 50 %", "Absences (h)", "Congés (j)", "Paniers", "Trajets", "Transports", "Grands déplacements", "Kilomètres", "Primes", "Acomptes / avances", "Notes de frais", "Commentaire comptable"]];
    for (const dossier of (dossiers ?? []) as DossierExport[]) {
      const employe = un(dossier.employe);
      lignes.push([employe?.reference_interne ?? dossier.employe_id, `${employe?.prenom ?? ""} ${employe?.nom ?? ""}`.trim(), employe?.poste ?? "", dossier.statut, Number(dossier.heures_normales), Number(dossier.heures_sup_25), Number(dossier.heures_sup_50), Number(dossier.heures_absence), Number(dossier.jours_conges), Number(dossier.total_paniers), Number(dossier.total_trajets), Number(dossier.total_transports), Number(dossier.total_grands_deplacements), Number(dossier.total_kilometres), Number(dossier.total_primes), Number(dossier.total_acomptes), Number(dossier.total_notes_frais), dossier.commentaire_comptable ?? ""]);
    }
    lignes.push([], ["Document préparatoire uniquement. Il ne constitue ni un bulletin de paie, ni une déclaration sociale, ni un calcul officiel de cotisations."]);

    const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
    const base = nomPropre(`variables-paie-${periode.mois}`);
    if (format === "csv") { await journaliserExport(ctx.entrepriseId,ctx.userId,id,format,(dossiers??[]).length); return reponseCsv(lignes, `${base}.csv`); }
    if (format === "xlsx") { await journaliserExport(ctx.entrepriseId,ctx.userId,id,format,(dossiers??[]).length); return reponseXlsx(lignes, `${base}.xlsx`, { nomFeuille: "Variables de paie", ligneEntetes: 8 }); }
    if (format !== "zip") return NextResponse.json({ error: "Format d’export non reconnu" }, { status: 400 });

    const fichiers: Record<string, Uint8Array> = { "variables-paie.csv": strToU8(csv(lignes)) };
    const dossierIds = ((dossiers ?? []) as DossierExport[]).map((dossier) => dossier.id);
    const { data: pieces, error: erreurPieces } = dossierIds.length
      ? await supabase.from("pieces_jointes_paie").select("id,dossier_id,type_document,nom_original,storage_path,mime_type,taille_octets,empreinte_sha256").in("dossier_id", dossierIds)
      : { data: [], error: null };
    if (erreurPieces) throw new Error(erreurPieces.message);
    const manifeste: Array<Record<string, string | number | null>> = [];
    for (const piece of pieces ?? []) {
      const { data, error } = await supabase.storage.from("documents-paie").download(piece.storage_path);
      if (error || !data) throw new Error(`Pièce jointe inaccessible : ${piece.nom_original}`);
      const contenu = new Uint8Array(await data.arrayBuffer());
      const empreinte = sha256(contenu);
      if (piece.empreinte_sha256 && piece.empreinte_sha256 !== empreinte) throw new Error(`Anomalie d’intégrité détectée : ${piece.nom_original}`);
      const chemin = `pieces/${piece.dossier_id}/${piece.id}-${nomPropre(piece.nom_original)}`;
      fichiers[chemin] = contenu;
      manifeste.push({ chemin, type_document: piece.type_document, taille: contenu.byteLength, sha256: empreinte, dossier_id: piece.dossier_id });
    }
    fichiers["manifeste.json"] = strToU8(JSON.stringify({ version: 1, entreprise_id: ctx.entrepriseId, entreprise: ctx.entrepriseNom, periode, genere_at: new Date().toISOString(), fichiers: manifeste }, null, 2));
    fichiers["AVERTISSEMENT.txt"] = strToU8("Export préparatoire des variables de paie. À contrôler et valider par le gestionnaire de paie ou l’expert-comptable.\n");
    const zip = zipSync(fichiers, { level: 6 });
    const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    await journaliserExport(ctx.entrepriseId,ctx.userId,id,format,(dossiers??[]).length);
    return new Response(body, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${base}.zip"`, "Cache-Control": "private, no-store", "X-Content-SHA256": sha256(zip) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export de paie impossible" }, { status: 400 });
  }
}
