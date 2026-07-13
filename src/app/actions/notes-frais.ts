"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

const FORMATS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function creerNoteFraisAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const montant = Number(String(formData.get("montant_ttc") ?? "").replace(",", "."));
  if (!Number.isFinite(montant) || montant < 0) {
    redirect(`/notes-frais?error=${encodeURIComponent("Montant invalide")}`);
  }
  const employeId = String(formData.get("employe_id") ?? "").trim() || null;
  const dateFrais = String(formData.get("date_frais") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const categorie = String(formData.get("categorie") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;

  // Justificatif (facultatif mais recommandé).
  const fichier = formData.get("justificatif");
  let storagePath: string | null = null;
  let nom: string | null = null;
  let mime: string | null = null;
  if (fichier instanceof File && fichier.size > 0) {
    const ext = FORMATS[fichier.type];
    if (!ext) redirect(`/notes-frais?error=${encodeURIComponent("Justificatif : PDF, PNG, JPG ou WebP")}`);
    if (fichier.size > 10 * 1024 * 1024) redirect(`/notes-frais?error=${encodeURIComponent("Justificatif : 10 Mo maximum")}`);
    const path = `${ctx.entrepriseId}/notes-frais/${crypto.randomUUID()}.${ext}`;
    const { error: up } = await supabase.storage.from("documents-employes").upload(path, fichier, { contentType: fichier.type, upsert: false });
    if (up) redirect(`/notes-frais?error=${encodeURIComponent(up.message)}`);
    storagePath = path;
    nom = fichier.name;
    mime = fichier.type;
  }

  const { error } = await supabase.from("notes_frais").insert({
    entreprise_id: ctx.entrepriseId,
    employe_id: employeId,
    date_frais: dateFrais,
    montant_ttc: montant,
    categorie,
    description,
    justificatif_storage_path: storagePath,
    justificatif_nom: nom,
    justificatif_mime_type: mime,
  });
  if (error) {
    if (storagePath) await supabase.storage.from("documents-employes").remove([storagePath]);
    redirect(`/notes-frais?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/notes-frais");
  redirect("/notes-frais?succes=1");
}

export async function changerStatutNoteFraisAction(id: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!["soumise", "validee", "remboursee", "refusee"].includes(statut)) return;
  await supabase.from("notes_frais").update({ statut }).eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/notes-frais");
}

export async function supprimerNoteFraisAction(id: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: note } = await supabase.from("notes_frais").select("justificatif_storage_path").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (note?.justificatif_storage_path) await supabase.storage.from("documents-employes").remove([note.justificatif_storage_path]);
  await supabase.from("notes_frais").delete().eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/notes-frais");
}
