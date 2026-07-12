"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { TRANSITIONS_COMMANDES, type LigneCommande } from "@/lib/commandes";

function champ(formData: FormData, nom: string) {
  return String(formData.get(nom) ?? "").trim();
}

// ---- Fournisseurs ----

export async function creerFournisseurAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const nom = champ(formData, "nom");
  if (!nom) redirect(`/fournisseurs?error=${encodeURIComponent("Le nom du fournisseur est obligatoire")}`);

  const { error } = await supabase.from("fournisseurs").insert({
    entreprise_id: ctx.entrepriseId,
    nom,
    contact_nom: champ(formData, "contact_nom") || null,
    email: champ(formData, "email") || null,
    telephone: champ(formData, "telephone") || null,
    adresse: champ(formData, "adresse") || null,
    code_postal: champ(formData, "code_postal") || null,
    ville: champ(formData, "ville") || null,
    siret: champ(formData, "siret") || null,
    notes: champ(formData, "notes") || null,
  });

  if (error) redirect(`/fournisseurs?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/fournisseurs");
  revalidatePath("/commandes/nouveau");
  redirect("/fournisseurs");
}

export async function changerActivationFournisseurAction(id: string, actif: boolean) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  await supabase
    .from("fournisseurs")
    .update({ actif, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/fournisseurs");
}

export type FournisseurRapide = {
  nom: string;
  contact_nom?: string | null;
  email?: string | null;
  telephone?: string | null;
  ville?: string | null;
};

export async function creerFournisseurRapideAction(
  data: FournisseurRapide,
): Promise<{ id: string; label: string } | { error: string }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const nom = data.nom?.trim();
  if (!nom) return { error: "Le nom du fournisseur est obligatoire." };

  const { data: cree, error } = await supabase
    .from("fournisseurs")
    .insert({
      entreprise_id: ctx.entrepriseId,
      nom,
      contact_nom: data.contact_nom?.trim() || null,
      email: data.email?.trim() || null,
      telephone: data.telephone?.trim() || null,
      ville: data.ville?.trim() || null,
    })
    .select("id, nom")
    .single();

  if (error || !cree) return { error: error?.message ?? "Impossible de créer le fournisseur." };
  revalidatePath("/fournisseurs");
  return { id: cree.id, label: cree.nom };
}

// ---- Commandes ----

export type CommandePayload = {
  fournisseur_id: string;
  chantier_id: string | null;
  date_commande: string | null;
  date_livraison_prevue: string | null;
  notes: string | null;
  lignes: LigneCommande[];
};

export async function creerCommandeAction(
  payload: CommandePayload,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!payload.fournisseur_id) return { error: "Choisis un fournisseur." };
  const lignes = payload.lignes.filter((l) => l.designation.trim() !== "");
  if (lignes.length === 0) return { error: "Ajoute au moins une ligne." };
  const { data: commandeId, error } = await supabase.rpc("creer_commande_fournisseur", {
    p_entreprise_id: ctx.entrepriseId,
    p_commande: {
      fournisseur_id: payload.fournisseur_id,
      chantier_id: payload.chantier_id,
      date_commande: payload.date_commande,
      date_livraison_prevue: payload.date_livraison_prevue,
      notes: payload.notes,
    },
    p_lignes: lignes.map((l, i) => ({
      designation: l.designation.trim(), description: l.description?.trim() || null,
      quantite: Number(l.quantite), unite: l.unite || "u",
      prix_unitaire_ht: Number(l.prix_unitaire_ht), taux_tva: Number(l.taux_tva), ordre: i,
    })),
  });
  if (error || !commandeId) return { error: error?.message ?? "Impossible de créer la commande." };
  revalidatePath("/commandes");
  return { id: commandeId as string };
}

export async function changerStatutCommandeAction(id: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: commande } = await supabase
    .from("commandes_fournisseurs")
    .select("statut")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();
  if (!commande) redirect(`/commandes/${id}?error=${encodeURIComponent("Commande introuvable")}`);

  const autorises = TRANSITIONS_COMMANDES[commande.statut] ?? [];
  if (statut !== commande.statut && !autorises.includes(statut)) {
    redirect(`/commandes/${id}?error=${encodeURIComponent("Transition de statut non autorisée")}`);
  }

  const { error } = await supabase.rpc("changer_statut_commande", {
    p_entreprise_id: ctx.entrepriseId, p_commande_id: id, p_statut: statut,
  });
  if (error) redirect(`/commandes/${id}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/commandes/${id}`);
  revalidatePath("/commandes");
}

export async function enregistrerReceptionCommandeAction(id: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: commande } = await supabase.from("commandes_fournisseurs")
    .select("id, statut").eq("id", id).eq("entreprise_id", ctx.entrepriseId).single();
  if (!commande || !["envoyee", "confirmee", "recue_partiel"].includes(commande.statut)) {
    redirect(`/commandes/${id}?error=${encodeURIComponent("Cette commande ne peut pas être réceptionnée")}`);
  }
  const { data: lignes } = await supabase.from("lignes_commande")
    .select("id, quantite").eq("commande_id", id).eq("entreprise_id", ctx.entrepriseId);
  const receptions = (lignes ?? []).map((ligne) => ({
    ligne_id: ligne.id,
    quantite_recue: Number(formData.get(`reception_${ligne.id}`)),
  }));
  const { error } = await supabase.rpc("enregistrer_reception_commande", {
    p_entreprise_id: ctx.entrepriseId, p_commande_id: id, p_receptions: receptions,
  });
  if (error) redirect(`/commandes/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/commandes/${id}`);
  revalidatePath("/commandes");
  redirect(`/commandes/${id}?reception=1`);
}

export async function supprimerCommandeAction(id: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: commande } = await supabase
    .from("commandes_fournisseurs")
    .select("statut")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();
  if (!commande) redirect("/commandes");
  if (!["brouillon", "annulee"].includes(commande.statut)) {
    redirect(`/commandes/${id}?error=${encodeURIComponent("Seules les commandes en brouillon ou annulées peuvent être supprimées")}`);
  }

  await supabase.from("commandes_fournisseurs").delete().eq("id", id).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/commandes");
  redirect("/commandes");
}
