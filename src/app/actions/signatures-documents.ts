"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  cheminRetourSignature,
  estTypeDocumentSignature,
  serialiserDocumentStable,
  type TypeDocumentSignature,
} from "@/lib/signatures-documents";

type DocumentCharge = { document: Record<string, unknown>; lignes?: Record<string, unknown>[] };

async function chargerDocument(
  type: TypeDocumentSignature,
  documentId: string,
  entrepriseId: string,
): Promise<DocumentCharge | null> {
  const supabase = await createClient();
  if (type === "devis") {
    const [{ data: document }, { data: lignes }] = await Promise.all([
      supabase.from("devis").select("*").eq("id", documentId).eq("entreprise_id", entrepriseId).maybeSingle(),
      supabase.from("lignes_devis").select("*").eq("devis_id", documentId).order("ordre"),
    ]);
    return document ? { document, lignes: lignes ?? [] } : null;
  }
  if (type === "facture") {
    const [{ data: document }, { data: lignes }] = await Promise.all([
      supabase.from("factures").select("*").eq("id", documentId).eq("entreprise_id", entrepriseId).maybeSingle(),
      supabase.from("lignes_factures").select("*").eq("facture_id", documentId).order("ordre"),
    ]);
    return document ? { document, lignes: lignes ?? [] } : null;
  }
  if (type === "commande") {
    const [{ data: document }, { data: lignes }] = await Promise.all([
      supabase.from("commandes_fournisseurs").select("*").eq("id", documentId).eq("entreprise_id", entrepriseId).maybeSingle(),
      supabase.from("lignes_commande").select("*").eq("commande_id", documentId).order("ordre"),
    ]);
    return document ? { document, lignes: lignes ?? [] } : null;
  }
  const table = type === "intervention" ? "interventions" : "bons_livraison";
  const { data: document } = await supabase.from(table).select("*")
    .eq("id", documentId).eq("entreprise_id", entrepriseId).maybeSingle();
  return document ? { document } : null;
}

function permissionRequise(type: TypeDocumentSignature) {
  switch (type) {
    case "devis": return "gerer_devis";
    case "facture": return "gerer_factures";
    case "commande": return "gerer_achats";
    case "intervention":
    case "bon_livraison": return "gerer_interventions";
  }
}

export async function signerDocumentMetierAction(typeBrut: string, documentId: string) {
  if (!estTypeDocumentSignature(typeBrut)) redirect("/dashboard?error=Type de document invalide");
  const type = typeBrut;
  const retour = cheminRetourSignature(type, documentId);
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);

  const { data: employe } = await supabase.from("employes")
    .select("id,prenom,nom,poste,signature_storage_path,statut")
    .eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  if (!employe || ["sorti", "suspendu"].includes(employe.statut)) {
    redirect(`${retour}?error=${encodeURIComponent("Votre compte doit être relié à une fiche employé active pour signer")}`);
  }
  if (!employe.signature_storage_path) {
    redirect(`${retour}?error=${encodeURIComponent("Enregistrez d’abord votre signature dans votre fiche employé")}`);
  }

  const documentCharge = await chargerDocument(type, documentId, ctx.entrepriseId);
  if (!documentCharge) redirect(`${retour}?error=${encodeURIComponent("Document introuvable ou inaccessible")}`);

  const gestionAutorisee = permissions === null || permissions.includes(permissionRequise(type));
  const employeDocument = documentCharge.document.employe_id ?? documentCharge.document.livre_par;
  const personnelAutorise = (type === "intervention" || type === "bon_livraison") && employeDocument === employe.id;
  if (!gestionAutorisee && !personnelAutorise) {
    redirect(`${retour}?error=${encodeURIComponent("Votre poste ne permet pas de signer ce document")}`);
  }

  const admin = createAdminClient();
  const { data: existante } = await admin.from("signatures_documents").select("id")
    .eq("entreprise_id", ctx.entrepriseId).eq("type_document", type)
    .eq("document_id", documentId).eq("employe_id", employe.id).maybeSingle();
  if (existante) redirect(`${retour}?success=${encodeURIComponent("Ce document est déjà signé en votre nom")}`);

  const { data: fichier, error: lectureErreur } = await admin.storage
    .from("documents-employes").download(employe.signature_storage_path);
  if (lectureErreur || !fichier) {
    redirect(`${retour}?error=${encodeURIComponent("La signature enregistrée est indisponible")}`);
  }
  const signatureBuffer = Buffer.from(await fichier.arrayBuffer());
  const signatureSha256 = createHash("sha256").update(signatureBuffer).digest("hex");
  const documentSha256 = createHash("sha256")
    .update(serialiserDocumentStable(documentCharge)).digest("hex");
  const signatureId = randomUUID();
  const copiePath = `${ctx.entrepriseId}/${employe.id}/signatures-documents/${type}/${documentId}/${signatureId}.png`;
  const { error: copieErreur } = await admin.storage.from("documents-employes")
    .upload(copiePath, signatureBuffer, { contentType: "image/png", upsert: false });
  if (copieErreur) redirect(`${retour}?error=${encodeURIComponent(copieErreur.message)}`);

  const nomSignataire = `${employe.prenom ?? ""} ${employe.nom ?? ""}`.trim() || "Employé";
  const { error: insertionErreur } = await admin.from("signatures_documents").insert({
    id: signatureId,
    entreprise_id: ctx.entrepriseId,
    employe_id: employe.id,
    type_document: type,
    document_id: documentId,
    signature_storage_path: copiePath,
    signature_sha256: signatureSha256,
    document_sha256: documentSha256,
    nom_signataire: nomSignataire,
    fonction_signataire: employe.poste,
    created_by: ctx.userId,
  });
  if (insertionErreur) {
    await admin.storage.from("documents-employes").remove([copiePath]);
    redirect(`${retour}?error=${encodeURIComponent(insertionErreur.message)}`);
  }
  await admin.from("journal_activite").insert({
    entreprise_id: ctx.entrepriseId,
    utilisateur_id: ctx.userId,
    action: "document_signe",
    ressource: type,
    ressource_id: documentId,
    description: `${nomSignataire} a signé le document en son nom propre`,
    metadata: { signature_id: signatureId, signature_sha256: signatureSha256, document_sha256: documentSha256 },
  });

  revalidatePath(retour);
  if (type === "devis" || type === "facture" || type === "commande") {
    revalidatePath(`/imprimer/${type === "commande" ? "commandes" : `${type}s`}/${documentId}`);
  }
  redirect(`${retour}?success=${encodeURIComponent("Document signé et empreintes enregistrées")}`);
}
