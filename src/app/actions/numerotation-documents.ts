"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { LIBELLES_TYPES_DOCUMENT, SEPARATEURS, TYPES_DOCUMENT_NUMEROTES, validerFormatNumerotation, type FormatNumerotation, type Separateur } from "@/lib/numerotation-documents";

const PAGE = "/parametres/numerotation";
const texte = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** Enregistre le format de numérotation des documents de l'entreprise (droit `gerer_parametres`). Les
 * numéros restent attribués en base : ce réglage ne renumérote rien et ne touche pas aux compteurs. */
export async function modifierNumerotationDocumentsAction(formData: FormData): Promise<void> {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!(permissions === null || permissions.includes("gerer_parametres"))) redirect(`${PAGE}?error=${encodeURIComponent("Votre poste ne permet pas de modifier la numérotation.")}`);
  const supabase = await createClient();
  const lignes = [];
  for (const type of TYPES_DOCUMENT_NUMEROTES) {
    // Un avoir « comme les factures » (case décochée) = aucun réglage propre : séquence des factures conservée.
    if (type === "avoir" && formData.get("avoir_propre") !== "on") continue;
    const separateur = texte(formData.get(`separateur_${type}`));
    const f: FormatNumerotation = {
      prefixe: texte(formData.get(`prefixe_${type}`)).toUpperCase(),
      avecAnnee: formData.get(`annee_${type}`) === "on",
      avecMois: formData.get(`mois_${type}`) === "on",
      separateur: (SEPARATEURS.some((s) => s.cle === separateur) ? separateur : "-") as Separateur,
      largeur: Number(texte(formData.get(`largeur_${type}`))),
      compteurAnnuel: formData.get(`annuel_${type}`) === "on",
    };
    const refus = validerFormatNumerotation(f);
    if (refus) redirect(`${PAGE}?error=${encodeURIComponent(`${LIBELLES_TYPES_DOCUMENT[type]} : ${refus}`)}`);
    lignes.push({ entreprise_id: ctx.entrepriseId, type_document: type, prefixe: f.prefixe, avec_annee: f.avecAnnee, avec_mois: f.avecMois, separateur: f.separateur, largeur: f.largeur, compteur_annuel: f.compteurAnnuel, maj_le: new Date().toISOString(), maj_par: ctx.userId });
  }
  if (formData.get("avoir_propre") !== "on") {
    const { error } = await supabase.from("numerotation_documents").delete().eq("entreprise_id", ctx.entrepriseId).eq("type_document", "avoir");
    if (error) redirect(`${PAGE}?error=${encodeURIComponent(messageErreurUtilisateur("modifierNumerotationDocumentsAction", error, "Impossible d’enregistrer la numérotation."))}`);
  }
  const { error } = await supabase.from("numerotation_documents").upsert(lignes, { onConflict: "entreprise_id,type_document" });
  if (error) redirect(`${PAGE}?error=${encodeURIComponent(messageErreurUtilisateur("modifierNumerotationDocumentsAction", error, "Impossible d’enregistrer la numérotation."))}`);
  revalidatePath(PAGE);
  redirect(`${PAGE}?succes=1`);
}
