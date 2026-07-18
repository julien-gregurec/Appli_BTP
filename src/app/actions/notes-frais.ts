"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { permissionsUtilisateur } from "@/lib/permissions";
import { calculerTotauxDepense, verifierTotaux } from "@/lib/expenses/workflow";
import { ajouterAudit } from "@/lib/expenses/audit";
import { analyserAffectationDepense } from "@/lib/expenses/affectation";

const TYPES_DOCUMENT = new Set([
  "facture", "ticket_caisse", "recu_paiement", "recu_carte_bancaire",
  "facture_electronique_originale", "autre_justificatif",
]);

function texte(formData: FormData, nom: string) {
  return String(formData.get(nom) ?? "").trim() || null;
}

function nombre(formData: FormData, nom: string): number | null {
  const brut = texte(formData, nom);
  if (brut === null) return null;
  const valeur = Number(brut.replace(",", "."));
  return Number.isFinite(valeur) ? valeur : Number.NaN;
}

async function employeDuCompte(entrepriseId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("employes").select("id")
    .eq("entreprise_id", entrepriseId).eq("utilisateur_id", userId)
    .not("statut", "in", "(sorti,suspendu)").maybeSingle();
  return data?.id ?? null;
}

function erreur(message: string, noteId?: string): never {
  redirect(`${noteId ? `/notes-frais/${noteId}` : "/notes-frais"}?error=${encodeURIComponent(message)}`);
}

function verifierAuthentification(): void {
  if (isEmailLoginDisabled()) erreur("Les notes de frais nécessitent un compte personnel sécurisé");
}

export async function creerNoteFraisAction(formData: FormData) {
  verifierAuthentification();
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const employeId = await employeDuCompte(ctx.entrepriseId, ctx.userId);
  if (!employeId) erreur("Votre compte doit être lié à une fiche employé active");
  const totaux = calculerTotauxDepense(nombre(formData, "montant_ht"), nombre(formData, "montant_tva"), nombre(formData, "montant_ttc"), nombre(formData, "taux_tva"));
  const montantTtc = totaux.ttc;
  if (montantTtc === null || !Number.isFinite(montantTtc) || montantTtc < 0) erreur("Montant TTC invalide");
  const montantHt = totaux.ht;
  const montantTva = totaux.tva;
  const erreursTotaux = verifierTotaux(montantHt, montantTva, montantTtc);
  if (erreursTotaux.length) erreur(erreursTotaux.join(" · "));
  let affectation;
  try {
    affectation = analyserAffectationDepense(texte(formData, "chantier_id"));
  } catch (error) {
    erreur(error instanceof Error ? error.message : "Lieu de dépense invalide");
  }
  const { chantierId, lieuHorsChantier } = affectation;
  if (chantierId) {
    const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
    if (!chantier) erreur("Chantier invalide ou inaccessible");
  }
  const typeDocument = texte(formData, "type_document_principal");
  if (typeDocument && !TYPES_DOCUMENT.has(typeDocument)) erreur("Type de justificatif invalide");
  const dateFrais = texte(formData, "date_frais") ?? new Date().toISOString().slice(0, 10);
  if (dateFrais > new Date().toISOString().slice(0, 10)) erreur("La date du justificatif ne peut pas être dans le futur");
  const { data, error: insertError } = await supabase.from("notes_frais").insert({
    entreprise_id: ctx.entrepriseId,
    employe_id: employeId,
    chantier_id: chantierId,
    lieu_hors_chantier: lieuHorsChantier,
    date_frais: dateFrais,
    montant_ht: montantHt,
    montant_tva: montantTva,
    taux_tva: totaux.taux,
    montant_ttc: montantTtc,
    devise: texte(formData, "devise") ?? "EUR",
    categorie: texte(formData, "categorie"),
    fournisseur: texte(formData, "fournisseur"),
    moyen_paiement: texte(formData, "moyen_paiement"),
    commentaire_salarie: texte(formData, "commentaire_salarie"),
    description: texte(formData, "commentaire_salarie"),
    type_document_principal: typeDocument,
    statut: "brouillon",
    cree_par_utilisateur_id: ctx.userId,
  }).select("id").single();
  if (insertError || !data) erreur(insertError?.message ?? "Création impossible");
  await ajouterAudit(supabase, {
    entrepriseId: ctx.entrepriseId,
    action: "document_cree",
    ressourceType: "note_frais",
    ressourceId: data.id,
    nouveauStatut: "brouillon",
  });
  revalidatePath("/notes-frais");
  if (chantierId) revalidatePath(`/chantiers/${chantierId}`);
  redirect(`/notes-frais/${data.id}?succes=${encodeURIComponent("Brouillon créé. Ajoutez le justificatif puis soumettez-le.")}`);
}

export async function modifierNoteFraisAction(noteId: string, formData: FormData) {
  verifierAuthentification();
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const totaux = calculerTotauxDepense(nombre(formData, "montant_ht"), nombre(formData, "montant_tva"), nombre(formData, "montant_ttc"), nombre(formData, "taux_tva"));
  const montantTtc = totaux.ttc;
  if (montantTtc === null || !Number.isFinite(montantTtc) || montantTtc < 0) erreur("Montant TTC invalide", noteId);
  const montantHt = totaux.ht;
  const montantTva = totaux.tva;
  const erreursTotaux = verifierTotaux(montantHt, montantTva, montantTtc);
  if (erreursTotaux.length) erreur(erreursTotaux.join(" · "), noteId);
  const typeDocument = texte(formData, "type_document_principal");
  if (typeDocument && !TYPES_DOCUMENT.has(typeDocument)) erreur("Type de justificatif invalide", noteId);
  const { data: avant } = await supabase.from("notes_frais").select("id,statut,chantier_id").eq("id", noteId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!avant) erreur("Dépense inaccessible", noteId);
  let nouvelleAffectation;
  try {
    nouvelleAffectation = analyserAffectationDepense(texte(formData, "chantier_id"));
  } catch (error) {
    erreur(error instanceof Error ? error.message : "Lieu de dépense invalide", noteId);
  }
  const { chantierId: nouveauChantierId, lieuHorsChantier } = nouvelleAffectation;
  if (nouveauChantierId) {
    const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", nouveauChantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
    if (!chantier) erreur("Chantier invalide ou inaccessible", noteId);
  }
  const { error: updateError } = await supabase.from("notes_frais").update({
    chantier_id: nouveauChantierId,
    lieu_hors_chantier: lieuHorsChantier,
    date_frais: texte(formData, "date_frais"),
    montant_ht: montantHt,
    montant_tva: montantTva,
    taux_tva: totaux.taux,
    montant_ttc: montantTtc,
    devise: texte(formData, "devise") ?? "EUR",
    categorie: texte(formData, "categorie"),
    fournisseur: texte(formData, "fournisseur"),
    moyen_paiement: texte(formData, "moyen_paiement"),
    commentaire_salarie: texte(formData, "commentaire_salarie"),
    description: texte(formData, "commentaire_salarie"),
    type_document_principal: typeDocument,
  }).eq("id", noteId).eq("entreprise_id", ctx.entrepriseId);
  if (updateError) erreur(updateError.message, noteId);
  await ajouterAudit(supabase, {
    entrepriseId: ctx.entrepriseId,
    action: "informations_modifiees",
    ressourceType: "note_frais",
    ressourceId: noteId,
    ancienStatut: avant.statut,
    nouveauStatut: avant.statut,
  });
  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
  if (avant.chantier_id) revalidatePath(`/chantiers/${avant.chantier_id}`);
  if (nouveauChantierId) revalidatePath(`/chantiers/${nouveauChantierId}`);
  redirect(`/notes-frais/${noteId}?succes=${encodeURIComponent("Informations enregistrées")}`);
}

export async function transitionNoteFraisAction(noteId: string, nouveauStatut: string, formData?: FormData) {
  verifierAuthentification();
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const message = formData ? texte(formData, "message") : null;
  const { data: avant } = await supabase.from("notes_frais").select("statut,chantier_id").eq("id", noteId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!avant) erreur("Dépense inaccessible", noteId);
  const { error: transitionError } = await supabase.rpc("transition_note_frais", {
    p_note_id: noteId,
    p_nouveau_statut: nouveauStatut,
    p_message: message,
  });
  if (transitionError) erreur(transitionError.message, noteId);
  await ajouterAudit(supabase, {
    entrepriseId: ctx.entrepriseId,
    action: nouveauStatut === "correction_demandee" ? "correction_demandee" : nouveauStatut,
    ressourceType: "note_frais",
    ressourceId: noteId,
    ancienStatut: avant.statut,
    nouveauStatut,
    metadata: message ? { message } : {},
  });
  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
  if (avant.chantier_id) revalidatePath(`/chantiers/${avant.chantier_id}`);
  redirect(`/notes-frais/${noteId}?succes=${encodeURIComponent("Statut mis à jour")}`);
}

export async function enregistrerReferenceComptableAction(noteId: string, formData: FormData) {
  verifierAuthentification();
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!permissions?.includes("comptabiliser_notes_frais")) erreur("Autorisation comptable requise", noteId);
  const { error: rpcError } = await supabase.rpc("modifier_reference_comptable_note_frais", {
    p_note_id: noteId,
    p_reference: texte(formData, "reference_comptable"),
  });
  if (rpcError) erreur(rpcError.message, noteId);
  await ajouterAudit(supabase, {
    entrepriseId: ctx.entrepriseId,
    action: "reference_comptable_modifiee",
    ressourceType: "note_frais",
    ressourceId: noteId,
  });
  revalidatePath(`/notes-frais/${noteId}`);
}

// Compatibilité avec l'ancienne interface pendant la migration visuelle.
export async function changerStatutNoteFraisAction(id: string, statut: string) {
  const correspondance: Record<string, string> = { soumise: "soumis", validee: "valide", refusee: "refuse", remboursee: "valide" };
  return transitionNoteFraisAction(id, correspondance[statut] ?? statut);
}

export async function supprimerNoteFraisAction(id: string) {
  verifierAuthentification();
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: note } = await supabase.from("notes_frais").select("statut,chantier_id").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!note || note.statut !== "brouillon") erreur("Seul un brouillon sans archive peut être supprimé", id);
  const { count } = await supabase.from("documents_notes_frais").select("id", { count: "exact", head: true }).eq("note_frais_id", id);
  if (count) erreur("Retirez ce brouillon de la liste sans supprimer son historique documentaire", id);
  const { error: deleteError } = await supabase.from("notes_frais").delete().eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  if (deleteError) erreur(deleteError.message, id);
  revalidatePath("/notes-frais");
  if (note.chantier_id) revalidatePath(`/chantiers/${note.chantier_id}`);
  redirect("/notes-frais");
}
