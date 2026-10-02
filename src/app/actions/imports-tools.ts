"use server";

/**
 * Imports Tools / Relevé (Lot 11) : actions Gestion Pro. Toutes passent par les RPC de la migration 20261002001116,
 * qui vérifient l'entreprise, la permission GP (`gerer_devis`) et l'immutabilité du snapshot. Aucune n'écrit dans Tools.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { IMPORTS_TOOLS_CHEMIN, importToolsHref, messageErreurImport } from "@/lib/imports-tools";

const texte = (fd: FormData, cle: string) => {
  const v = fd.get(cle);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function retour(importId: string | null, cle: "error" | "success", message: string): never {
  const base = importId && UUID.test(importId) ? importToolsHref(importId) : IMPORTS_TOOLS_CHEMIN;
  redirect(`${base}${base.includes("?") ? "&" : "?"}${cle}=${encodeURIComponent(message)}`);
}

/** Crée, sur action EXPLICITE, un devis brouillon (sans numéro) depuis un import. Une seule fois par import. */
export async function creerDevisDepuisImportAction(formData: FormData) {
  const importId = texte(formData, "import_id");
  if (!importId || !UUID.test(importId)) retour(null, "error", "Import introuvable.");
  const clientId = texte(formData, "client_id");
  const chantierId = texte(formData, "chantier_id");
  await getContexteEntreprise();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gp_tools_import_creer_devis", {
    p_import_id: importId, p_client_id: clientId && UUID.test(clientId) ? clientId : null, p_chantier_id: chantierId && UUID.test(chantierId) ? chantierId : null,
  });
  if (error || typeof data !== "string") retour(importId, "error", messageErreurImport(error));
  revalidatePath("/devis");
  revalidatePath(IMPORTS_TOOLS_CHEMIN);
  redirect(`/devis/${data}?success=${encodeURIComponent("Devis brouillon créé depuis l'import Tools : fixez prix de vente, marge, remise et TVA.")}`);
}

/** Correspondance ouvrage Tools → prestation GP (vide = retirer), puis réapplication à l'import courant. */
export async function enregistrerCorrespondanceAction(formData: FormData) {
  const importId = texte(formData, "import_id");
  const cle = texte(formData, "tools_cle");
  const libelle = texte(formData, "tools_libelle");
  const prestationId = texte(formData, "prestation_id");
  if (!importId || !UUID.test(importId) || !cle || !libelle) retour(importId, "error", "Correspondance incomplète.");
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.rpc("gp_tools_correspondance_enregistrer", {
    p_entreprise_id: ctx.entrepriseId, p_tools_cle: cle, p_tools_libelle: libelle, p_prestation_id: prestationId && UUID.test(prestationId) ? prestationId : null,
  });
  if (error) retour(importId, "error", messageErreurImport(error));
  const { error: errApplique } = await supabase.rpc("gp_tools_import_appliquer_correspondances", { p_import_id: importId });
  if (errApplique) retour(importId, "error", messageErreurImport(errApplique));
  revalidatePath(importToolsHref(importId));
  retour(importId, "success", prestationId ? "Correspondance enregistrée : les lignes de cet ouvrage sont liées à la prestation." : "Correspondance retirée : lignes non liées.");
}

/** Réapplique les correspondances actuelles (après une modification du catalogue de prestations). */
export async function appliquerCorrespondancesAction(formData: FormData) {
  const importId = texte(formData, "import_id");
  if (!importId || !UUID.test(importId)) retour(null, "error", "Import introuvable.");
  await getContexteEntreprise();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gp_tools_import_appliquer_correspondances", { p_import_id: importId });
  if (error) retour(importId, "error", messageErreurImport(error));
  revalidatePath(importToolsHref(importId));
  retour(importId, "success", `${Number(data ?? 0)} ligne(s) mise(s) à jour.`);
}
