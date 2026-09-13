"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { validerParametresDevis, type ParametresDevis } from "@/lib/devis/parametres-devis";

const PAGE = "/parametres/devis";
const texte = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const nombre = (v: FormDataEntryValue | null) => Number(texte(v).replace(",", "."));

/** Paramètres > Devis : défauts des nouveaux devis et rappel de sauvegarde (droit `gerer_parametres`). */
export async function modifierParametresDevisAction(formData: FormData): Promise<void> {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!(permissions === null || permissions.includes("gerer_parametres"))) redirect(`${PAGE}?error=${encodeURIComponent("Votre poste ne permet pas de modifier les réglages de devis.")}`);
  const frequence = texte(formData.get("rappel_frequence"));
  const p: ParametresDevis = {
    validiteJours: nombre(formData.get("validite_jours")),
    conditionsDefaut: texte(formData.get("conditions_defaut")) || null,
    modeReglementDefaut: texte(formData.get("mode_reglement_defaut")) || null,
    conditionsPaiementDefaut: texte(formData.get("conditions_paiement_defaut")) || null,
    uniteDefaut: texte(formData.get("unite_defaut")) || "u",
    tauxTvaDefaut: nombre(formData.get("taux_tva_defaut")),
    rappelSauvegardeActif: formData.get("rappel_actif") === "on",
    rappelSauvegardeMinutes: frequence === "personnalise" ? nombre(formData.get("rappel_minutes")) : Number(frequence),
  };
  const refus = validerParametresDevis(p);
  if (refus) redirect(`${PAGE}?error=${encodeURIComponent(refus)}`);
  const supabase = await createClient();
  const { error } = await supabase.from("parametres_devis").upsert({
    entreprise_id: ctx.entrepriseId, validite_jours: p.validiteJours, conditions_defaut: p.conditionsDefaut, mode_reglement_defaut: p.modeReglementDefaut,
    conditions_paiement_defaut: p.conditionsPaiementDefaut, unite_defaut: p.uniteDefaut, taux_tva_defaut: p.tauxTvaDefaut,
    rappel_sauvegarde_actif: p.rappelSauvegardeActif, rappel_sauvegarde_minutes: p.rappelSauvegardeMinutes, maj_le: new Date().toISOString(), maj_par: ctx.userId,
  }, { onConflict: "entreprise_id" });
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(messageErreurUtilisateur("modifierParametresDevisAction", error, "Impossible d’enregistrer les réglages de devis."))}`);
  revalidatePath(PAGE);
  revalidatePath("/devis/nouveau");
  redirect(`${PAGE}?succes=1`);
}
