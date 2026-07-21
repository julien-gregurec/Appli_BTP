"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_TAILLE_MAX,
  nomFichierSecurise,
} from "@/lib/documents";
import { analyserDocumentIA, MIME_ANALYSABLES_IA } from "@/lib/ai/documents";
import { verifierPlafondIA, journaliserAppelIA } from "@/lib/ai/journal";

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
  const audience = String(formData.get("audience") ?? "gestionnaires");

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
  if (!["tous_affectes","encadrement","gestionnaires"].includes(audience)) retour(chantierId,"error","Visibilité invalide");

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
    audience,
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

export async function analyserDocumentIAAction(documentId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };

  const { data: document } = await supabase
    .from("documents_chantier")
    .select("storage_path, mime_type")
    .eq("id", documentId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!document) return { error: "Document introuvable." };
  if (!MIME_ANALYSABLES_IA.includes(document.mime_type)) {
    return { error: "Ce format n'est pas pris en charge par l'analyse IA (images JPEG/PNG/WebP ou PDF)." };
  }

  const { data: fichier, error: telechargementError } = await supabase.storage
    .from("chantier-documents")
    .download(document.storage_path);
  if (telechargementError || !fichier) return { error: "Impossible de récupérer le fichier." };

  const depassement = await verifierPlafondIA(supabase, ctx.entrepriseId);
  if (depassement) return { error: depassement };

  try {
    const octets = Buffer.from(await fichier.arrayBuffer());
    const analyse = await analyserDocumentIA(octets, document.mime_type);
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "documents", statut: "succes" });
    return { analyse };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de l'analyse IA.";
    journaliserAppelIA(supabase, { entrepriseId: ctx.entrepriseId, utilisateurId: ctx.userId, fonctionnalite: "documents", statut: "erreur", messageErreur: message });
    return { error: message };
  }
}
