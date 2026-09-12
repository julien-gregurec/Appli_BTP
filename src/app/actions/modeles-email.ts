"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

const RETOUR = "/parametres/emails";
const TYPES = new Set(["devis", "facture", "tous"]);

async function verifier() {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!(permissions === null || permissions.includes("gerer_parametres"))) redirect(`${RETOUR}?error=${encodeURIComponent("Votre poste ne permet pas de gérer les modèles d’e-mail.")}`);
  return ctx;
}

function lire(formData: FormData) {
  const nom = String(formData.get("nom") ?? "").trim().slice(0, 80);
  const type = String(formData.get("type_document") ?? "tous");
  const objet = String(formData.get("objet") ?? "").trim().slice(0, 200);
  const corps = String(formData.get("corps") ?? "").replace(/\r/g, "").trim().slice(0, 8000);
  if (!nom || !objet || !corps) redirect(`${RETOUR}?error=${encodeURIComponent("Nom, objet et message sont obligatoires.")}`);
  return { nom, type_document: TYPES.has(type) ? type : "tous", objet, corps, par_defaut: formData.get("par_defaut") === "on" };
}

/** Modèles d'e-mail (GP V1, lot G) : la RLS n'accepte l'écriture que de `gerer_parametres`. */
export async function creerModeleEmailAction(formData: FormData) {
  const ctx = await verifier();
  const supabase = await createClient();
  const { error } = await supabase.from("modeles_email").insert({ entreprise_id: ctx.entrepriseId, ...lire(formData) });
  if (error) redirect(`${RETOUR}?error=${encodeURIComponent(messageErreurUtilisateur("creerModeleEmailAction", error, "Impossible d’enregistrer le modèle."))}`);
  revalidatePath(RETOUR);
  redirect(`${RETOUR}?succes=1`);
}

export async function modifierModeleEmailAction(id: string, formData: FormData) {
  const ctx = await verifier();
  const supabase = await createClient();
  const { error } = await supabase.from("modeles_email").update(lire(formData)).eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  if (error) redirect(`${RETOUR}?error=${encodeURIComponent(messageErreurUtilisateur("modifierModeleEmailAction", error, "Impossible d’enregistrer le modèle."))}`);
  revalidatePath(RETOUR);
  redirect(`${RETOUR}?succes=1`);
}

export async function supprimerModeleEmailAction(id: string) {
  const ctx = await verifier();
  const supabase = await createClient();
  const { error } = await supabase.from("modeles_email").delete().eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  if (error) redirect(`${RETOUR}?error=${encodeURIComponent(messageErreurUtilisateur("supprimerModeleEmailAction", error, "Impossible de supprimer le modèle."))}`);
  revalidatePath(RETOUR);
  redirect(`${RETOUR}?succes=1`);
}
