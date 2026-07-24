"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { bornesMois, montantIndemnite } from "@/lib/paie";

const texte = (form: FormData, cle: string) => String(form.get(cle) ?? "").trim();
const nombre = (form: FormData, cle: string, valeur = 0) => {
  const resultat = Number(texte(form, cle).replace(",", "."));
  return Number.isFinite(resultat) ? resultat : valeur;
};
const optionnel = (form: FormData, cle: string) => texte(form, cle) || null;
const retour = (chemin: string, message: string, erreur = false): never =>
  redirect(`${chemin}${chemin.includes("?") ? "&" : "?"}${erreur ? "error" : "success"}=${encodeURIComponent(message)}`);

async function contexteAvecDroit(droits: string[]) {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && !droits.some((droit) => permissions.includes(droit))) throw new Error("Action de paie non autorisée");
  return { ctx, supabase: await createClient(), permissions };
}

async function dossierModifiable(dossierId: string) {
  const { ctx, supabase } = await contexteAvecDroit(["saisir_variables_paie", "controler_variables_paie", "gerer_paie"]);
  const { data: dossier } = await supabase.from("dossiers_paie_salaries")
    .select("id,periode_id,entreprise_id,periode:periodes_paie(statut)")
    .eq("id", dossierId).eq("entreprise_id", ctx.entrepriseId).single();
  const periode = Array.isArray(dossier?.periode) ? dossier.periode[0] : dossier?.periode;
  if (!dossier || !periode || !["brouillon", "saisie_en_cours", "a_controler"].includes(periode.statut)) throw new Error("Cette période n’est plus modifiable");
  return { ctx, supabase, dossier };
}

export async function creerPeriodePaieAction(formData: FormData) {
  let bornes: ReturnType<typeof bornesMois>;
  try { bornes = bornesMois(texte(formData, "mois")); } catch { retour("/paie", "Mois invalide", true); }
  const { ctx, supabase } = await contexteAvecDroit(["gerer_paie"]);
  const { data: parametres } = await supabase.from("parametres_paie_entreprise").select("jour_cloture").eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  const jour = Math.min(Number(parametres?.jour_cloture ?? 25), Number(bornes!.fin.slice(-2)));
  const { data, error } = await supabase.from("periodes_paie").insert({
    entreprise_id: ctx.entrepriseId, mois: bornes!.mois, date_debut: bornes!.debut, date_fin: bornes!.fin,
    date_limite_saisie: `${bornes!.debut.slice(0, 8)}${String(jour).padStart(2, "0")}`, cree_par: ctx.userId,
  }).select("id").single();
  if (error || !data) retour("/paie", error?.message ?? "Création impossible", true);
  const periodeId = data!.id;
  const { error: syncError } = await supabase.rpc("synchroniser_periode_paie", { p_periode_id: periodeId });
  if (syncError) retour(`/paie/${periodeId}`, syncError.message, true);
  revalidatePath("/paie");
  redirect(`/paie/${periodeId}?success=${encodeURIComponent("Période créée et données synchronisées")}`);
}

export async function synchroniserPeriodePaieAction(id: string) {
  const { supabase } = await contexteAvecDroit(["saisir_variables_paie", "gerer_paie"]);
  const { error } = await supabase.rpc("synchroniser_periode_paie", { p_periode_id: id });
  if (error) retour(`/paie/${id}`, error.message, true);
  revalidatePath(`/paie/${id}`); retour(`/paie/${id}`, "Pointages, congés, frais et déplacements synchronisés");
}

export async function transitionPeriodePaieAction(id: string, statut: string, formData: FormData) {
  const { supabase } = await contexteAvecDroit(["controler_variables_paie", "gerer_paie", "exporter_paie"]);
  const { error } = await supabase.rpc("transition_periode_paie", { p_periode_id: id, p_nouveau_statut: statut, p_commentaire: optionnel(formData, "commentaire") });
  if (error) retour(`/paie/${id}`, error.message, true);
  revalidatePath(`/paie/${id}`); retour(`/paie/${id}`, "Statut de la période mis à jour");
}

export async function enregistrerDossierPaieAction(dossierId: string, formData: FormData) {
  const { supabase, dossier } = await dossierModifiable(dossierId);
  const statut = texte(formData, "statut");
  if (!["saisie_en_cours", "a_controler", "correction_demandee", "valide", "refuse"].includes(statut)) retour(`/paie/${dossier.periode_id}/${dossierId}`, "Statut invalide", true);
  const { error } = await supabase.from("dossiers_paie_salaries").update({ statut, commentaire_comptable: optionnel(formData, "commentaire_comptable") }).eq("id", dossierId);
  if (error) retour(`/paie/${dossier.periode_id}/${dossierId}`, error.message, true);
  revalidatePath(`/paie/${dossier.periode_id}`); retour(`/paie/${dossier.periode_id}/${dossierId}`, "Dossier salarié mis à jour");
}

export async function ajouterTempsPaieAction(dossierId: string, formData: FormData) {
  const { ctx, supabase, dossier } = await dossierModifiable(dossierId);
  const heures = nombre(formData, "quantite_heures");
  if (heures <= 0 || heures > 24) retour(`/paie/${dossier.periode_id}/${dossierId}`, "Nombre d’heures invalide", true);
  const { error } = await supabase.from("temps_travail_paie").insert({ entreprise_id: ctx.entrepriseId, dossier_id: dossierId,
    date: optionnel(formData, "date"), chantier_id: optionnel(formData, "chantier_id"), categorie: texte(formData, "categorie"),
    quantite_heures: heures, majoration: nombre(formData, "majoration"), commentaire: optionnel(formData, "commentaire"), cree_par: ctx.userId });
  if (error) retour(`/paie/${dossier.periode_id}/${dossierId}`, error.message, true);
  revalidatePath(`/paie/${dossier.periode_id}`); retour(`/paie/${dossier.periode_id}/${dossierId}`, "Temps ajouté");
}

export async function ajouterAbsencePaieAction(dossierId: string, formData: FormData) {
  const { ctx, supabase, dossier } = await dossierModifiable(dossierId);
  const debut = texte(formData, "date_debut"), fin = texte(formData, "date_fin");
  if (!debut || !fin || fin < debut) retour(`/paie/${dossier.periode_id}/${dossierId}`, "Dates d’absence invalides", true);
  const { error } = await supabase.from("absences_paie").insert({ entreprise_id: ctx.entrepriseId, dossier_id: dossierId,
    type_absence: texte(formData, "type_absence"), date_debut: debut, date_fin: fin, duree_jours: nombre(formData, "duree_jours"),
    duree_heures: nombre(formData, "duree_heures"), maintien_salaire: texte(formData, "maintien_salaire") || "a_controler",
    motif: optionnel(formData, "motif"), commentaire: optionnel(formData, "commentaire"), cree_par: ctx.userId });
  if (error) retour(`/paie/${dossier.periode_id}/${dossierId}`, error.message, true);
  revalidatePath(`/paie/${dossier.periode_id}`); retour(`/paie/${dossier.periode_id}/${dossierId}`, "Absence ajoutée");
}

export async function ajouterPrimePaieAction(dossierId: string, formData: FormData) {
  const { ctx, supabase, dossier } = await dossierModifiable(dossierId); const montant = nombre(formData, "montant");
  if (montant < 0) retour(`/paie/${dossier.periode_id}/${dossierId}`, "Montant invalide", true);
  const { error } = await supabase.from("primes_paie").insert({ entreprise_id: ctx.entrepriseId, dossier_id: dossierId,
    type_prime: texte(formData, "type_prime"), libelle: texte(formData, "libelle"), montant,
    cotisations: texte(formData, "cotisations") || "a_determiner", recurrent: formData.get("recurrent") === "on",
    commentaire: optionnel(formData, "commentaire"), cree_par: ctx.userId });
  if (error) retour(`/paie/${dossier.periode_id}/${dossierId}`, error.message, true);
  revalidatePath(`/paie/${dossier.periode_id}`); retour(`/paie/${dossier.periode_id}/${dossierId}`, "Prime ajoutée");
}

export async function ajouterIndemnitePaieAction(dossierId: string, formData: FormData) {
  const { ctx, supabase, dossier } = await dossierModifiable(dossierId); const quantite = nombre(formData, "quantite", 1), tarif = nombre(formData, "tarif_unitaire");
  const { error } = await supabase.from("indemnites_deplacement_paie").insert({ entreprise_id: ctx.entrepriseId, dossier_id: dossierId,
    date: texte(formData, "date"), chantier_id: optionnel(formData, "chantier_id"), type_indemnite: texte(formData, "type_indemnite"),
    zone_deplacement: optionnel(formData, "zone_deplacement"), quantite, tarif_unitaire: tarif, montant_total: montantIndemnite(quantite, tarif),
    traitement: texte(formData, "traitement") || "integre_paie", cotisations: texte(formData, "cotisations") || "a_controler",
    commentaire: optionnel(formData, "commentaire"), cree_par: ctx.userId });
  if (error) retour(`/paie/${dossier.periode_id}/${dossierId}`, error.message, true);
  revalidatePath(`/paie/${dossier.periode_id}`); retour(`/paie/${dossier.periode_id}/${dossierId}`, "Indemnité ajoutée");
}

export async function ajouterDeductionPaieAction(dossierId: string, formData: FormData) {
  const { ctx, supabase, dossier } = await dossierModifiable(dossierId);
  const { error } = await supabase.from("deductions_paie").insert({ entreprise_id: ctx.entrepriseId, dossier_id: dossierId,
    type_deduction: texte(formData, "type_deduction"), libelle: texte(formData, "libelle"), montant: nombre(formData, "montant"),
    confidentiel: true, recurrent: formData.get("recurrent") === "on", commentaire: optionnel(formData, "commentaire"), cree_par: ctx.userId });
  if (error) retour(`/paie/${dossier.periode_id}/${dossierId}`, error.message, true);
  revalidatePath(`/paie/${dossier.periode_id}`); retour(`/paie/${dossier.periode_id}/${dossierId}`, "Retenue ajoutée");
}

export async function ajouterRegularisationPaieAction(dossierId: string, formData: FormData) {
  const { ctx, supabase, dossier } = await dossierModifiable(dossierId);
  const { error } = await supabase.from("regularisations_paie").insert({ entreprise_id: ctx.entrepriseId, dossier_id: dossierId,
    type_regularisation: texte(formData, "type_regularisation"), libelle: texte(formData, "libelle"), montant: nombre(formData, "montant"),
    periode_origine: optionnel(formData, "periode_origine"), commentaire: optionnel(formData, "commentaire"), cree_par: ctx.userId });
  if (error) retour(`/paie/${dossier.periode_id}/${dossierId}`, error.message, true);
  revalidatePath(`/paie/${dossier.periode_id}`); retour(`/paie/${dossier.periode_id}/${dossierId}`, "Régularisation ajoutée");
}

export async function supprimerVariablePaieAction(table: string, elementId: string, dossierId: string) {
  const autorisees = ["temps_travail_paie", "absences_paie", "primes_paie", "indemnites_deplacement_paie", "deductions_paie", "regularisations_paie"];
  if (!autorisees.includes(table)) throw new Error("Type de variable invalide");
  const { supabase, dossier } = await dossierModifiable(dossierId);
  let suppression = supabase.from(table).delete().eq("id", elementId).eq("dossier_id", dossierId);
  if (table !== "regularisations_paie") suppression = suppression.eq("source_type", "saisie_manuelle");
  const { error } = await suppression;
  if (error) retour(`/paie/${dossier.periode_id}/${dossierId}`, error.message, true);
  revalidatePath(`/paie/${dossier.periode_id}`); retour(`/paie/${dossier.periode_id}/${dossierId}`, "Variable supprimée");
}

export async function justifierAnomaliePaieAction(periodeId: string, anomalieId: string, formData: FormData) {
  const { ctx, supabase } = await contexteAvecDroit(["controler_variables_paie", "gerer_paie"]); const justification = texte(formData, "justification");
  if (!justification) retour(`/paie/${periodeId}`, "La justification est obligatoire", true);
  const { error } = await supabase.from("anomalies_paie").update({ justification, justifiee_par: ctx.userId, justifiee_at: new Date().toISOString() }).eq("id", anomalieId).eq("periode_id", periodeId).eq("entreprise_id", ctx.entrepriseId);
  if (error) retour(`/paie/${periodeId}`, error.message, true); revalidatePath(`/paie/${periodeId}`); retour(`/paie/${periodeId}`, "Anomalie justifiée");
}

export async function enregistrerParametresPaieAction(formData: FormData) {
  const { ctx, supabase } = await contexteAvecDroit(["parametrer_paie"]);
  const { error } = await supabase.from("parametres_paie_entreprise").upsert({ entreprise_id: ctx.entrepriseId,
    convention_collective: optionnel(formData, "convention_collective"), organisme_mutuelle: optionnel(formData, "organisme_mutuelle"),
    organisme_prevoyance: optionnel(formData, "organisme_prevoyance"), caisse_retraite: optionnel(formData, "caisse_retraite"),
    caisse_cibtp: optionnel(formData, "caisse_cibtp"), taux_accident_travail: nombre(formData, "taux_accident_travail"),
    jour_cloture: nombre(formData, "jour_cloture", 25), jour_paiement: nombre(formData, "jour_paiement", 30),
    cabinet_comptable: optionnel(formData, "cabinet_comptable"), contact_comptable: optionnel(formData, "contact_comptable"),
    email_comptable: optionnel(formData, "email_comptable"), consignes_permanentes: optionnel(formData, "consignes_permanentes"), updated_at: new Date().toISOString() });
  if (error) retour("/paie/parametres", error.message, true); revalidatePath("/paie/parametres"); retour("/paie/parametres", "Paramètres enregistrés");
}

export async function enregistrerProfilPaieAction(employeId: string, formData: FormData) {
  const { ctx, supabase } = await contexteAvecDroit(["gerer_paie"]);
  const { data: employe } = await supabase.from("employes").select("id").eq("id", employeId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!employe) retour(`/employes/${employeId}`, "Employé inaccessible", true);
  const { error } = await supabase.from("profils_paie_employes").upsert({ employe_id: employeId, entreprise_id: ctx.entrepriseId,
    adresse: optionnel(formData, "adresse"), date_naissance: optionnel(formData, "date_naissance"), lieu_naissance: optionnel(formData, "lieu_naissance"),
    numero_securite_sociale: optionnel(formData, "numero_securite_sociale"), contact_urgence_nom: optionnel(formData, "contact_urgence_nom"),
    contact_urgence_telephone: optionnel(formData, "contact_urgence_telephone"), type_contrat: optionnel(formData, "type_contrat"),
    date_fin_prevue: optionnel(formData, "date_fin_prevue"), fin_periode_essai: optionnel(formData, "fin_periode_essai"),
    qualification: optionnel(formData, "qualification"), classification: optionnel(formData, "classification"), coefficient: optionnel(formData, "coefficient"),
    categorie_statut: optionnel(formData, "categorie_statut"), salaire_horaire_brut: nombre(formData, "salaire_horaire_brut") || null,
    salaire_mensuel_brut: nombre(formData, "salaire_mensuel_brut") || null, duree_hebdomadaire: nombre(formData, "duree_hebdomadaire") || null,
    duree_mensuelle: nombre(formData, "duree_mensuelle") || null, temps_travail: optionnel(formData, "temps_travail"), forfait_jours: nombre(formData, "forfait_jours") || null,
    convention_collective: optionnel(formData, "convention_collective"), etablissement: optionnel(formData, "etablissement"),
    mutuelle: optionnel(formData, "mutuelle"), prevoyance: optionnel(formData, "prevoyance"), dispense_mutuelle: formData.get("dispense_mutuelle") === "on",
    beneficiaires: optionnel(formData, "beneficiaires"), avantages_nature: optionnel(formData, "avantages_nature"), vehicule_fonction: formData.get("vehicule_fonction") === "on",
    logement: formData.get("logement") === "on", telephone: formData.get("telephone") === "on", saisie_salaire: nombre(formData, "saisie_salaire") || null,
    pension_alimentaire: nombre(formData, "pension_alimentaire") || null, acompte_permanent: nombre(formData, "acompte_permanent") || null,
    titre_sejour: optionnel(formData, "titre_sejour"), titre_sejour_expiration: optionnel(formData, "titre_sejour_expiration"),
    autorisation_travail: optionnel(formData, "autorisation_travail"), remarques_confidentielles: optionnel(formData, "remarques_confidentielles"), updated_at: new Date().toISOString() });
  if (error) retour(`/paie/profils/${employeId}`, error.message, true); revalidatePath(`/paie/profils/${employeId}`); retour(`/paie/profils/${employeId}`, "Profil de paie enregistré");
}

export async function ajouterZonePaieAction(formData: FormData) {
  const { ctx, supabase } = await contexteAvecDroit(["parametrer_paie"]);
  const { error } = await supabase.from("zones_deplacement_paie").insert({ entreprise_id: ctx.entrepriseId, nom: texte(formData, "nom"),
    distance_min_km: nombre(formData, "distance_min_km"), distance_max_km: nombre(formData, "distance_max_km") || null,
    indemnite_trajet: nombre(formData, "indemnite_trajet"), indemnite_transport: nombre(formData, "indemnite_transport"), panier: nombre(formData, "panier"),
    valide_du: texte(formData, "valide_du"), valide_au: optionnel(formData, "valide_au") });
  if (error) retour("/paie/parametres", error.message, true); revalidatePath("/paie/parametres"); retour("/paie/parametres", "Zone BTP ajoutée");
}
