"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { planningV2Actif } from "@/lib/planning/v2-serveur";
import { STATUTS_EVENEMENT, TYPES_EVENEMENT, type Evenement } from "@/lib/planning/modele";

// Planning v2 : chaque action revérifie le drapeau, l'entreprise et le droit avant la base (RPC SECURITY
// DEFINER à vérifications explicites, déclencheurs de compatibilité et de ressources).
const INACTIF = { error: "Le nouveau planning n’est pas encore activé." };

export async function enregistrerEvenementAction(e: Evenement): Promise<{ id: string } | { error: string }> {
  if (!planningV2Actif()) return INACTIF;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!(permissions === null || permissions.includes("gerer_planning"))) return { error: "Votre poste ne permet pas de modifier le planning." };
  const titre = String(e.titre ?? "").trim().slice(0, 200);
  if (!titre) return { error: "Donnez un titre à l’évènement." };
  if (!TYPES_EVENEMENT.some((t) => t.cle === e.type)) return { error: "Type d’évènement inconnu." };
  if (!STATUTS_EVENEMENT.includes(e.statut)) return { error: "Statut inconnu." };
  const debut = new Date(e.debut), fin = new Date(e.fin);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin <= debut) return { error: "La fin doit suivre le début." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enregistrer_evenement_planning", {
    p_entreprise_id: ctx.entrepriseId,
    p_evenement: {
      id: e.id && !e.id.startsWith("nouveau:") ? e.id : null, titre, type: e.type, statut: e.statut, debut: debut.toISOString(), fin: fin.toISOString(),
      journee_entiere: e.journeeEntiere === true, couleur: e.couleur ?? null, chantier_id: e.chantierId ?? null, client_id: e.clientId ?? null,
      adresse: e.adresse ?? null, notes: e.notes ?? null,
    },
    p_affectations: (e.affectations ?? []).map((a) => ({ employe_id: a.employeId ?? null, equipe_id: a.equipeId ?? null, ressource_id: a.ressourceId ?? null })),
  });
  if (error || !data) return { error: messageErreurUtilisateur("enregistrerEvenementAction", error, "Impossible d’enregistrer cet évènement.") };
  revalidatePath("/planning");
  return { id: String(data) };
}

export async function supprimerEvenementAction(id: string): Promise<{ ok: true } | { error: string }> {
  if (!planningV2Actif()) return INACTIF;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!(permissions === null || permissions.includes("gerer_planning"))) return { error: "Votre poste ne permet pas de modifier le planning." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("supprimer_evenement_planning", { p_evenement_id: id });
  if (error) return { error: messageErreurUtilisateur("supprimerEvenementAction", error, "Impossible de supprimer cet évènement.") };
  revalidatePath("/planning");
  return { ok: true };
}
