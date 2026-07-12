"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_TAILLE_MAX,
  nomFichierSecurise,
} from "@/lib/documents";

const BUCKET = "chantier-documents";

function retour(chantierId: string, type: "error" | "success", message: string): never {
  redirect(`/chantiers/${chantierId}/documents?${type}=${encodeURIComponent(message)}`);
}

export async function ajouterDocumentChantierAction(chantierId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const fichier = formData.get("fichier");
  const categorie = String(formData.get("categorie") ?? "autre");
  const note = String(formData.get("note") ?? "").trim();

  const { data: chantier } = await supabase.from("chantiers").select("id")
    .eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!chantier) retour(chantierId, "error", "Chantier introuvable");
  if (!(fichier instanceof File) || fichier.size === 0) retour(chantierId, "error", "Choisissez un fichier");
  if (fichier.size > DOCUMENT_TAILLE_MAX) retour(chantierId, "error", "Le fichier dépasse la limite de 15 Mo");
  if (!DOCUMENT_MIME_TYPES.includes(fichier.type as (typeof DOCUMENT_MIME_TYPES)[number])) {
    retour(chantierId, "error", "Format de fichier non pris en charge");
  }
  if (!DOCUMENT_CATEGORIES.some((item) => item.value === categorie)) {
    retour(chantierId, "error", "Catégorie invalide");
  }

  const path = `${ctx.entrepriseId}/${chantierId}/${crypto.randomUUID()}-${nomFichierSecurise(fichier.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, fichier, {
    contentType: fichier.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) retour(chantierId, "error", uploadError.message);

  const { error: insertError } = await supabase.from("documents_chantier").insert({
    entreprise_id: ctx.entrepriseId,
    chantier_id: chantierId,
    nom: fichier.name,
    categorie,
    storage_path: path,
    mime_type: fichier.type,
    taille_octets: fichier.size,
    note: note || null,
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    retour(chantierId, "error", insertError.message);
  }

  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath(`/chantiers/${chantierId}/documents`);
  retour(chantierId, "success", "Document ajouté");
}

export async function supprimerDocumentChantierAction(chantierId: string, documentId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: document } = await supabase.from("documents_chantier")
    .select("storage_path").eq("id", documentId).eq("chantier_id", chantierId)
    .eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!document) retour(chantierId, "error", "Document introuvable");

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([document.storage_path]);
  if (storageError) retour(chantierId, "error", storageError.message);

  const { error } = await supabase.from("documents_chantier").delete()
    .eq("id", documentId).eq("chantier_id", chantierId).eq("entreprise_id", ctx.entrepriseId);
  if (error) retour(chantierId, "error", error.message);

  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath(`/chantiers/${chantierId}/documents`);
  retour(chantierId, "success", "Document supprimé");
}
