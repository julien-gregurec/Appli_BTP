"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import {
  validerMotifAssistance,
  validerOuvertureAssistance,
} from "@elsatia/platform-support-comms";

const RETOUR = "/plateforme/assistance";

function echec(message: string): never {
  redirect(`${RETOUR}?error=${encodeURIComponent(message)}`);
}

/**
 * Ouverture d'une session d'assistance.
 *
 * Les contrôles du contrat sont rejoués ici pour rendre une erreur lisible AVANT
 * l'aller-retour ; la RPC les réapplique tous côté serveur. Ce module ne décide rien
 * qu'elle ne revérifie — sans quoi contourner l'interface suffirait.
 */
export async function ouvrirAssistanceAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  if (isEmailLoginDisabled()) echec("L’assistance exige un compte plateforme authentifié");

  const entrepriseId = String(formData.get("entrepriseId") ?? "").trim();
  const applications = formData.getAll("applications").map((a) => String(a));
  const abonnees = String(formData.get("abonnees") ?? "").split(",").filter(Boolean);
  const categorie = String(formData.get("motifCategorie") ?? "").trim();
  const detail = String(formData.get("motifDetail") ?? "").trim();
  const perimetre = String(formData.get("perimetre") ?? "lecture_seule").trim();
  const duree = Number.parseInt(String(formData.get("dureeMinutes") ?? "30"), 10);
  const ticket = String(formData.get("ticket") ?? "").trim();
  const incidentGlobal = formData.get("incidentGlobal") === "on";
  const confirmation = formData.get("confirmationRenforcee") === "on";

  if (!entrepriseId) echec("Sélectionnez une entreprise");

  const motif = validerMotifAssistance({ categorie, detail });
  if (!motif.valide) echec(motif.erreur);

  const ouverture = validerOuvertureAssistance({
    entrepriseId,
    applications,
    applicationsAbonnees: abonnees,
    incidentGlobal,
    perimetre,
    dureeMinutes: duree,
    // L'AAL réel est vérifié par la RPC via le claim du JWT. Le layout `/plateforme`
    // impose déjà AAL2 (`exigerAal2Plateforme`) : on l'affirme ici pour que la
    // validation locale porte sur les autres règles, pas pour l'accorder.
    aal: "aal2",
    confirmationRenforcee: confirmation,
  });
  if (!ouverture.valide) echec(ouverture.erreur);

  const supabase = await createClient();
  const { error } = await supabase.rpc("assistance_ouvrir", {
    p_entreprise_id: entrepriseId,
    p_applications: ouverture.applications,
    p_motif_cle: motif.categorie,
    p_motif_detail: motif.detail,
    p_perimetre: ouverture.perimetre,
    p_duree_minutes: ouverture.dureeMinutes,
    p_ticket: ticket === "" ? null : ticket,
    p_incident_global: incidentGlobal,
    p_confirmation_renforcee: confirmation,
  });
  if (error) echec(error.message);

  revalidatePath(RETOUR);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function quitterAssistanceAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assistance_quitter", { p_motif: "sortie_explicite" });
  if (error) echec(error.message);
  revalidatePath(RETOUR);
  redirect(RETOUR);
}

export async function revoquerAssistanceAction(sessionId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const motif = String(formData.get("motifRevocation") ?? "").trim();
  if (motif.length < 5) echec("Indiquez le motif de révocation (5 caractères minimum)");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assistance_revoquer", {
    p_session_id: sessionId,
    p_motif: motif,
  });
  if (error) echec(error.message);
  revalidatePath(RETOUR);
  redirect(`${RETOUR}?succes=${encodeURIComponent("Session révoquée")}`);
}
