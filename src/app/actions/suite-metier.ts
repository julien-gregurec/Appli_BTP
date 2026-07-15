"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

const texte = (formData: FormData, cle: string) => String(formData.get(cle) ?? "").trim();
const nombre = (formData: FormData, cle: string, defaut = 0) => {
  const valeur = Number(formData.get(cle));
  return Number.isFinite(valeur) ? valeur : defaut;
};
const optionnel = (formData: FormData, cle: string) => texte(formData, cle) || null;
const retourErreur = (chemin: string, message: string): never =>
  redirect(`${chemin}?error=${encodeURIComponent(message)}`);

export async function creerSituationAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.rpc("creer_situation_travaux", {
    p_entreprise_id: ctx.entrepriseId,
    p_devis_id: texte(formData, "devis_id"),
    p_avancement_pct: nombre(formData, "avancement_pct"),
    p_retenue_garantie_pct: nombre(formData, "retenue_garantie_pct"),
    p_notes: optionnel(formData, "notes"),
  });
  if (error) retourErreur("/facturation-avancee", error.message);
  revalidatePath("/facturation-avancee");
  redirect("/facturation-avancee?success=Situation créée");
}

export async function facturerSituationAction(situationId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("facturer_situation_travaux", {
    p_entreprise_id: ctx.entrepriseId,
    p_situation_id: situationId,
  });
  if (error || !data) retourErreur("/facturation-avancee", error?.message ?? "Facturation impossible");
  revalidatePath("/facturation-avancee");
  revalidatePath("/factures");
  redirect(`/factures/${data}`);
}

export async function creerFactureAvanceeAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const type = texte(formData, "type");
  const { data, error } = await supabase.rpc("creer_facture_avancee", {
    p_entreprise_id: ctx.entrepriseId,
    p_devis_id: texte(formData, "devis_id"),
    p_type: type,
    p_pourcentage: nombre(formData, "pourcentage", 100),
    p_est_dgd: texte(formData, "est_dgd") === "true",
  });
  if (error || !data) retourErreur("/facturation-avancee", error?.message ?? "Création impossible");
  revalidatePath("/factures");
  redirect(`/factures/${data}`);
}

export async function creerContratEntretienAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.from("contrats_entretien").insert({
    entreprise_id: ctx.entrepriseId,
    numero: "",
    client_id: texte(formData, "client_id"),
    chantier_id: optionnel(formData, "chantier_id"),
    libelle: texte(formData, "libelle"),
    description: optionnel(formData, "description"),
    date_debut: texte(formData, "date_debut"),
    date_fin: optionnel(formData, "date_fin"),
    periodicite: texte(formData, "periodicite") || "annuelle",
    prochaine_intervention: optionnel(formData, "prochaine_intervention"),
    montant_ht: nombre(formData, "montant_ht"),
    taux_tva: nombre(formData, "taux_tva", 20),
    reconduction_tacite: texte(formData, "reconduction_tacite") === "on",
  });
  if (error) retourErreur("/interventions", error.message);
  revalidatePath("/interventions");
  redirect("/interventions?success=Contrat créé");
}

export async function creerInterventionAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.from("interventions").insert({
    entreprise_id: ctx.entrepriseId,
    numero: "",
    client_id: texte(formData, "client_id"),
    chantier_id: optionnel(formData, "chantier_id"),
    contrat_id: optionnel(formData, "contrat_id"),
    employe_id: optionnel(formData, "employe_id"),
    type: texte(formData, "type") || "depannage",
    priorite: texte(formData, "priorite") || "normale",
    objet: texte(formData, "objet"),
    description: optionnel(formData, "description"),
    date_prevue: optionnel(formData, "date_prevue"),
    heure_prevue: optionnel(formData, "heure_prevue"),
    duree_prevue: nombre(formData, "duree_prevue") || null,
  });
  if (error) retourErreur("/interventions", error.message);
  revalidatePath("/interventions");
  redirect("/interventions?success=Intervention créée");
}

export async function changerStatutInterventionAction(id: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  await supabase.from("interventions").update({ statut, updated_at: new Date().toISOString() })
    .eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/interventions");
}

export async function creerAppelAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.from("appels_contacts").insert({
    entreprise_id: ctx.entrepriseId,
    client_id: optionnel(formData, "client_id"),
    type: texte(formData, "type") || "appel",
    sens: texte(formData, "sens") || "sortant",
    objet: texte(formData, "objet"),
    compte_rendu: optionnel(formData, "compte_rendu"),
    a_rappeler_at: optionnel(formData, "a_rappeler_at"),
    created_by: ctx.userId,
  });
  if (error) retourErreur("/crm", error.message);
  revalidatePath("/crm");
  redirect("/crm?success=Activité enregistrée");
}

export async function creerRelanceAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.from("relances_impayes").insert({
    entreprise_id: ctx.entrepriseId,
    facture_id: texte(formData, "facture_id"),
    niveau: nombre(formData, "niveau", 1),
    canal: texte(formData, "canal") || "email",
    date_prevue: texte(formData, "date_prevue") || new Date().toISOString().slice(0, 10),
    destinataire: optionnel(formData, "destinataire"),
    sujet: optionnel(formData, "sujet"),
    message: optionnel(formData, "message"),
    created_by: ctx.userId,
  });
  if (error) retourErreur("/crm", error.message);
  revalidatePath("/crm");
  redirect("/crm?success=Relance programmée");
}

export async function creerModeleDevisAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: modele, error } = await supabase.from("modeles_devis").insert({
    entreprise_id: ctx.entrepriseId,
    nom: texte(formData, "nom"),
    description: optionnel(formData, "description"),
    categorie: optionnel(formData, "categorie"),
  }).select("id").single();
  if (error || !modele) retourErreur("/ouvrages", error?.message ?? "Création impossible");
  const designation = texte(formData, "designation");
  if (designation) {
    const { error: ligneError } = await supabase.from("lignes_modeles_devis").insert({
      entreprise_id: ctx.entrepriseId,
      modele_id: modele!.id,
      designation,
      description: optionnel(formData, "ligne_description"),
      type: texte(formData, "ligne_type") || "forfait",
      quantite: nombre(formData, "quantite", 1),
      unite: texte(formData, "unite") || "u",
      prix_unitaire_ht: nombre(formData, "prix_unitaire_ht"),
      taux_tva: nombre(formData, "taux_tva", 20),
    });
    if (ligneError) retourErreur("/ouvrages", ligneError.message);
  }
  revalidatePath("/ouvrages");
  redirect("/ouvrages?success=Modèle créé");
}

export async function creerMetreAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const longueur = nombre(formData, "longueur");
  const largeur = nombre(formData, "largeur");
  const hauteur = nombre(formData, "hauteur");
  const quantite = nombre(formData, "nombre", 1);
  const deduction = nombre(formData, "deduction");
  const dimension2 = largeur || hauteur || 1;
  const resultat = Math.max(0, longueur * dimension2 * quantite - deduction);
  const { data: metre, error } = await supabase.from("metres").insert({
    entreprise_id: ctx.entrepriseId,
    numero: "",
    chantier_id: optionnel(formData, "chantier_id"),
    devis_id: optionnel(formData, "devis_id"),
    nom: texte(formData, "nom"),
    notes: optionnel(formData, "notes"),
  }).select("id").single();
  if (error || !metre) retourErreur("/ouvrages", error?.message ?? "Création impossible");
  const { error: ligneError } = await supabase.from("lignes_metres").insert({
    entreprise_id: ctx.entrepriseId,
    metre_id: metre!.id,
    designation: texte(formData, "designation"),
    formule: largeur ? "longueur × largeur × nombre − déduction" : hauteur ? "longueur × hauteur × nombre − déduction" : "longueur × nombre − déduction",
    longueur: longueur || null,
    largeur: largeur || null,
    hauteur: hauteur || null,
    nombre: quantite,
    deduction,
    resultat,
    unite: texte(formData, "unite") || "m²",
  });
  if (ligneError) retourErreur("/ouvrages", ligneError.message);
  revalidatePath("/ouvrages");
  redirect("/ouvrages?success=Métré créé");
}

export async function creerConnecteurAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.from("connecteurs_externes").insert({
    entreprise_id: ctx.entrepriseId,
    domaine: texte(formData, "domaine"),
    fournisseur_id: optionnel(formData, "fournisseur_id"),
    nom: texte(formData, "nom"),
    type: texte(formData, "type"),
    statut: "a_configurer",
    secret_reference: optionnel(formData, "secret_reference"),
    configuration: {},
  });
  if (error) retourErreur("/connecteurs", error.message);
  revalidatePath("/connecteurs");
  redirect("/connecteurs?success=Connecteur préparé");
}
