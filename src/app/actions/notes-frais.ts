"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { permissionsUtilisateur } from "@/lib/permissions";

const FORMATS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function creerNoteFraisAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const prototype = isEmailLoginDisabled();
  if (prototype) {
    redirect(`/notes-frais?error=${encodeURIComponent("Les notes de frais personnelles nécessitent l’activation des comptes sécurisés")}`);
  }

  const montant = Number(String(formData.get("montant_ttc") ?? "").replace(",", "."));
  if (!Number.isFinite(montant) || montant < 0) {
    redirect(`/notes-frais?error=${encodeURIComponent("Montant invalide")}`);
  }
  const { data: employePersonnel } = prototype
    ? { data: null }
    : await supabase
        .from("employes")
        .select("id")
        .eq("entreprise_id", ctx.entrepriseId)
        .eq("utilisateur_id", ctx.userId)
        .not("statut", "in", "(sorti,suspendu)")
        .maybeSingle();
  const employeId = employePersonnel?.id ?? null;
  if (!employeId) {
    redirect(`/notes-frais?error=${encodeURIComponent("Votre compte doit être lié à une fiche employé active")}`);
  }
  const dateFrais = String(formData.get("date_frais") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const categorie = String(formData.get("categorie") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const chantierId = String(formData.get("chantier_id") ?? "").trim() || null;
  if (chantierId) {
    const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
    if (!chantier) redirect(`/notes-frais?error=${encodeURIComponent("Chantier invalide ou inaccessible")}`);
  }

  // Justificatif (facultatif mais recommandé).
  const fichier = formData.get("justificatif");
  let storagePath: string | null = null;
  let nom: string | null = null;
  let mime: string | null = null;
  if (fichier instanceof File && fichier.size > 0) {
    const ext = FORMATS[fichier.type];
    if (!ext) redirect(`/notes-frais?error=${encodeURIComponent("Justificatif : PDF, PNG, JPG ou WebP")}`);
    if (fichier.size > 10 * 1024 * 1024) redirect(`/notes-frais?error=${encodeURIComponent("Justificatif : 10 Mo maximum")}`);
    const path = `${ctx.entrepriseId}/${employeId}/${crypto.randomUUID()}.${ext}`;
    const { error: up } = await supabase.storage.from("notes-frais").upload(path, fichier, { contentType: fichier.type, upsert: false });
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
    chantier_id: chantierId,
    cree_par_utilisateur_id: ctx.userId,
    justificatif_storage_path: storagePath,
    justificatif_nom: nom,
    justificatif_mime_type: mime,
  });
  if (error) {
    if (storagePath) await supabase.storage.from("notes-frais").remove([storagePath]);
    redirect(`/notes-frais?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/notes-frais");
  redirect("/notes-frais?succes=1");
}

export async function changerStatutNoteFraisAction(id: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (isEmailLoginDisabled()) redirect(`/notes-frais?error=${encodeURIComponent("Gestion indisponible sans compte sécurisé")}`);
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && (!permissions.includes("gerer_notes_frais") || !permissions.includes("voir_indicateurs_financiers"))) {
    redirect(`/notes-frais?error=${encodeURIComponent("Vous ne pouvez pas gérer les notes de frais des autres salariés")}`);
  }
  if (!["soumise", "validee", "remboursee", "refusee"].includes(statut)) return;
  await supabase.from("notes_frais").update({ statut }).eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/notes-frais");
}

export async function supprimerNoteFraisAction(id: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (isEmailLoginDisabled()) redirect(`/notes-frais?error=${encodeURIComponent("Gestion indisponible sans compte sécurisé")}`);
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && (!permissions.includes("gerer_notes_frais") || !permissions.includes("voir_indicateurs_financiers"))) {
    redirect(`/notes-frais?error=${encodeURIComponent("Vous ne pouvez pas supprimer cette note de frais")}`);
  }
  const { data: note } = await supabase.from("notes_frais").select("justificatif_storage_path").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (note?.justificatif_storage_path) await supabase.storage.from("notes-frais").remove([note.justificatif_storage_path]);
  await supabase.from("notes_frais").delete().eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/notes-frais");
}
