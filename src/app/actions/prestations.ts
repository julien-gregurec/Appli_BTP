"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise, type ContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import type { LigneDevis } from "@/lib/devis";
import type { PrestationCatalogue } from "@/lib/prestations";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { permissionsUtilisateur } from "@/lib/permissions";
import { lireChampsCatalogueV2, lirePrixAchat, type ChampsCatalogueV2 } from "@/lib/prestations-catalogue-v2";
import { messageErreurReference } from "@/lib/references";
import { lireCoefficient, lireModePrix, prixVenteRetenu, type ModePrix } from "@/lib/catalogue/prix-article";

function champ(formData: FormData, nom: string) {
  return String(formData.get(nom) ?? "").trim();
}

function payloadFormulaire(formData: FormData) {
  return {
    designation: champ(formData, "designation"),
    description: champ(formData, "description") || null,
    type: champ(formData, "type") || "main_oeuvre",
    unite: champ(formData, "unite") || "h",
    prix_unitaire_ht: Number(champ(formData, "prix_unitaire_ht").replace(",", ".")) || 0,
    taux_tva: Number(champ(formData, "taux_tva").replace(",", ".")) || 0,
  };
}

// ── Moteur de devis v2 : champs de catalogue, prix d'achat, coefficient ─────────────────────────
// Chemins empruntés UNIQUEMENT quand `devisV2Actif()` : éteint, les actions ci-dessous gardent leurs
// requêtes historiques, sans aucune colonne nouvelle.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type CoutV2 = { prixAchat: number; coefficient: number | null; modePrix: ModePrix };
type ExtensionV2 = {
  champs: ChampsCatalogueV2;
  /** Prix de vente à enregistrer : saisi, ou recalculé en mode « calculé ». */
  prixVente: number;
  /** `null` : rien à écrire dans la table des coûts. */
  cout: CoutV2 | null;
};

async function lireExtensionV2(formData: FormData, ctx: ContexteEntreprise, supabase: Supabase, prixSaisi: number): Promise<ExtensionV2 | { erreur: string }> {
  const lu = lireChampsCatalogueV2((nom) => formData.get(nom));
  if ("erreur" in lu) return lu;
  if (lu.valeurs.fournisseur_id) {
    const { data } = await supabase.from("fournisseurs").select("id")
      .eq("id", lu.valeurs.fournisseur_id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
    if (!data) return { erreur: "Fournisseur introuvable." };
  }
  if (lu.valeurs.famille_id) {
    const { data } = await supabase.from("catalogue_familles").select("id")
      .eq("id", lu.valeurs.famille_id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
    if (!data) return { erreur: "Famille introuvable." };
  }
  // Prix d'achat, coefficient et mode de prix ne sont pris en compte qu'avec le droit de gérer les
  // coûts ; sinon ils sont ignorés, quel que soit le contenu du formulaire reçu, et le prix de vente
  // saisi fait foi (les coûts enregistrés restent intacts).
  const permissions = await permissionsUtilisateur(ctx);
  const peutGererCouts = permissions === null || permissions.includes("gerer_couts_devis");
  if (!peutGererCouts) return { champs: lu.valeurs, prixVente: prixSaisi, cout: null };
  const prix = lirePrixAchat(formData.get("prix_achat_ht"));
  if ("erreur" in prix) return prix;
  const coefficient = lireCoefficient(formData.get("coefficient"));
  if ("erreur" in coefficient) return coefficient;
  const modePrix = lireModePrix(formData.get("mode_prix"));
  const vente = prixVenteRetenu(modePrix, prixSaisi, prix.valeur, coefficient.valeur);
  if ("erreur" in vente) return vente;
  if (prix.valeur === null) {
    if (coefficient.valeur !== null) return { erreur: "Le coefficient demande un prix d’achat." };
    return { champs: lu.valeurs, prixVente: vente.valeur, cout: null };
  }
  return { champs: lu.valeurs, prixVente: vente.valeur, cout: { prixAchat: prix.valeur, coefficient: coefficient.valeur, modePrix } };
}

/** Écrit prix d'achat, coefficient et mode dans la table protégée ; `null` si tout va bien, sinon un message. */
async function enregistrerPrixAchat(supabase: Supabase, ctx: ContexteEntreprise, prestationId: string, cout: CoutV2): Promise<string | null> {
  const { error } = await supabase.from("prestations_catalogue_couts").upsert(
    {
      prestation_id: prestationId, entreprise_id: ctx.entrepriseId, prix_achat_ht: cout.prixAchat,
      coefficient: cout.coefficient, mode_prix: cout.modePrix, maj_le: new Date().toISOString(), maj_par: ctx.userId,
    },
    { onConflict: "prestation_id" },
  );
  return error ? messageErreurUtilisateur("enregistrerPrixAchat", error, "le prix d’achat n’a pas pu être enregistré.") : null;
}

async function creerPrestationV2(formData: FormData, ctx: ContexteEntreprise, supabase: Supabase, payload: ReturnType<typeof payloadFormulaire>): Promise<never> {
  const extension = await lireExtensionV2(formData, ctx, supabase, payload.prix_unitaire_ht);
  if ("erreur" in extension) redirect(`/prestations/nouveau?error=${encodeURIComponent(extension.erreur)}`);

  const { data, error } = await supabase
    .from("prestations_catalogue")
    .insert({ entreprise_id: ctx.entrepriseId, ...payload, prix_unitaire_ht: extension.prixVente, ...extension.champs })
    .select("id")
    .single();
  if (error || !data) {
    const message = messageErreurReference(error) ?? (error?.code === "23505" ? "Une prestation porte déjà ce nom" : messageErreurUtilisateur("creerPrestationAction", error, "Impossible de créer cette prestation."));
    redirect(`/prestations/nouveau?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
  if (extension.cout) {
    const echec = await enregistrerPrixAchat(supabase, ctx, String(data.id), extension.cout);
    if (echec) redirect(`/prestations/${data.id}/modifier?error=${encodeURIComponent(`Prestation créée, mais ${echec}`)}`);
  }
  redirect("/prestations");
}

async function modifierPrestationV2(id: string, formData: FormData, ctx: ContexteEntreprise, supabase: Supabase, payload: ReturnType<typeof payloadFormulaire>): Promise<never> {
  const extension = await lireExtensionV2(formData, ctx, supabase, payload.prix_unitaire_ht);
  if ("erreur" in extension) redirect(`/prestations/${id}/modifier?error=${encodeURIComponent(extension.erreur)}`);

  const { data, error } = await supabase
    .from("prestations_catalogue")
    .update({ ...payload, prix_unitaire_ht: extension.prixVente, ...extension.champs, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .select("id");
  if (error) redirect(`/prestations/${id}/modifier?error=${encodeURIComponent(messageErreurUtilisateur("modifierPrestationAction", error, "Impossible d’enregistrer cette prestation."))}`);
  if (!data || data.length === 0) redirect(`/prestations?error=${encodeURIComponent("Prestation introuvable.")}`);

  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
  if (extension.cout) {
    const echec = await enregistrerPrixAchat(supabase, ctx, id, extension.cout);
    if (echec) redirect(`/prestations/${id}/modifier?error=${encodeURIComponent(`Prestation enregistrée, mais ${echec}`)}`);
  }
  redirect("/prestations");
}

export async function creerPrestationDepuisLigneAction(ligne: LigneDevis) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const designation = ligne.designation.trim();

  if (!designation) return { error: "La prestation doit avoir une désignation." };
  if (Number(ligne.prix_unitaire_ht) < 0) return { error: "Le prix ne peut pas être négatif." };

  const { data, error } = await supabase
    .from("prestations_catalogue")
    .insert({
      entreprise_id: ctx.entrepriseId,
      designation,
      description: ligne.description?.trim() || null,
      type: ligne.type,
      unite: ligne.unite || "u",
      prix_unitaire_ht: Number(ligne.prix_unitaire_ht) || 0,
      taux_tva: Number(ligne.taux_tva) || 0,
    })
    .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva")
    .single();

  if (error || !data) {
    const doublon = error?.code === "23505";
    return { error: messageErreurReference(error) ?? (doublon ? "Une prestation porte déjà ce nom." : messageErreurUtilisateur("creerPrestationDepuisLigneAction", error, "Impossible d’enregistrer la prestation.")) };
  }

  return { prestation: data as PrestationCatalogue };
}

export async function creerPrestationAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const payload = payloadFormulaire(formData);

  if (!payload.designation) redirect(`/prestations/nouveau?error=${encodeURIComponent("Désignation obligatoire")}`);
  if (payload.prix_unitaire_ht < 0) redirect(`/prestations/nouveau?error=${encodeURIComponent("Le prix ne peut pas être négatif")}`);

  if (devisV2Actif()) await creerPrestationV2(formData, ctx, supabase, payload);

  const { error } = await supabase.from("prestations_catalogue").insert({
    entreprise_id: ctx.entrepriseId,
    ...payload,
  });

  if (error) {
    const message = messageErreurReference(error) ?? (error.code === "23505" ? "Une prestation porte déjà ce nom" : messageErreurUtilisateur("creerPrestationAction", error, "Impossible de créer cette prestation."));
    redirect(`/prestations/nouveau?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
  redirect("/prestations");
}

export async function modifierPrestationAction(id: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const payload = payloadFormulaire(formData);

  if (!payload.designation) redirect(`/prestations/${id}/modifier?error=${encodeURIComponent("Désignation obligatoire")}`);

  if (devisV2Actif()) await modifierPrestationV2(id, formData, ctx, supabase, payload);

  const { error } = await supabase
    .from("prestations_catalogue")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId);

  if (error) redirect(`/prestations/${id}/modifier?error=${encodeURIComponent(messageErreurUtilisateur("modifierPrestationAction", error, "Impossible d’enregistrer cette prestation."))}`);

  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
  redirect("/prestations");
}

export async function changerActivationPrestationAction(id: string, actif: boolean) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  await supabase
    .from("prestations_catalogue")
    .update({ actif, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
}
