"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { lireDemandeBascule, lireDemandeStatut, messageRefusConsole } from "@/lib/incident/console";

const RETOUR = "/plateforme/incident";

function retour(cle: "error" | "succes", message: string): never {
  redirect(`${RETOUR}?${cle}=${encodeURIComponent(message)}`);
}

/**
 * Bascule d'un contrôle du mode sûr. La base décide seule de l'autorisation (rôle `total`, AAL2,
 * motif) et journalise ; cette action ne fait que transmettre et expliquer.
 */
export async function basculerControleIncidentAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const lecture = lireDemandeBascule(formData);
  if (!lecture.ok) retour("error", lecture.erreur);
  const { demande } = lecture;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plateforme_incident_basculer", {
    p_portee: demande.portee,
    p_controle: demande.controle,
    p_actif: demande.actif,
    p_motif: demande.motif,
    p_incident_ref: demande.incidentRef,
    p_expire_dans_minutes: demande.expireDansMinutes,
  });
  if (error) retour("error", messageRefusConsole(error));
  revalidatePath(RETOUR);
  const change = (data as { change?: boolean } | null)?.change !== false;
  retour("succes", change
    ? `${demande.controle} ${demande.actif ? "activé" : "désactivé"} (${demande.portee}). Propagation ≤ 10 s.`
    : "Aucun changement : le contrôle était déjà dans cet état.");
}

export async function definirStatutServiceAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const lecture = lireDemandeStatut(formData);
  if (!lecture.ok) retour("error", lecture.erreur);
  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_incident_statut_definir", {
    p_service: lecture.service,
    p_statut: lecture.statut,
    p_message_public: lecture.message,
    p_motif: lecture.motif,
  });
  if (error) retour("error", messageRefusConsole(error));
  revalidatePath(RETOUR);
  retour("succes", `Statut ${lecture.service} : ${lecture.statut}.`);
}
