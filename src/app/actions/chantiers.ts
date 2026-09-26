"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { ROLES_CHANTIER, type RoleChantier } from "@/lib/chantier-statuts";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

async function peutGererChantiers(ctx: Awaited<ReturnType<typeof getContexteEntreprise>>) {
  const permissions = await permissionsUtilisateur(ctx);
  return permissions === null || permissions.includes("gerer_chantiers");
}

export async function creerChantierAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) {
    redirect(`/chantiers?error=${encodeURIComponent("Vous pouvez consulter les chantiers, mais pas en créer.")}`);
  }

  const clientId = champ(formData, "client_id");
  if (!clientId) {
    redirect(`/chantiers/nouveau?error=${encodeURIComponent("Client obligatoire")}`);
  }

  const latitudeBrute = champ(formData, "latitude");
  const longitudeBrute = champ(formData, "longitude");
  const rayonBrut = Number(champ(formData, "rayon_metres") ?? 300);
  const distanceSiegeBrute = champ(formData, "distance_siege_km");

  const { data, error } = await supabase
    .from("chantiers")
    .insert({
      entreprise_id: ctx.entrepriseId,
      client_id: clientId,
      nom: champ(formData, "nom"),
      adresse: champ(formData, "adresse"),
      code_postal: champ(formData, "code_postal"),
      ville: champ(formData, "ville"),
      type_chantier_id: champ(formData, "type_chantier_id"),
      statut: champ(formData, "statut") ?? "prospect",
      date_debut_prevue: champ(formData, "date_debut_prevue"),
      date_fin_prevue: champ(formData, "date_fin_prevue"),
      budget_previsionnel: champ(formData, "budget_previsionnel"),
      latitude: latitudeBrute ? Number(latitudeBrute) : null,
      longitude: longitudeBrute ? Number(longitudeBrute) : null,
      rayon_metres: Number.isFinite(rayonBrut) && rayonBrut > 0 ? rayonBrut : 300,
      distance_siege_km: distanceSiegeBrute ? Number(distanceSiegeBrute) : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/chantiers/nouveau?error=${encodeURIComponent(messageErreurUtilisateur("creerChantierAction", error, "Impossible de créer ce chantier. Vérifiez les informations saisies."))}`);
  }

  revalidatePath("/chantiers");
  redirect(`/chantiers/${data.id}`);
}

// Position GPS + rayon du chantier, utilisés par le suivi de zone pendant le pointage.
export async function modifierLocalisationChantierAction(chantierId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) {
    redirect(`/chantiers/${chantierId}/localisation?error=${encodeURIComponent("Votre poste ne permet pas de modifier les chantiers")}`);
  }

  const latitudeBrute = champ(formData, "latitude");
  const longitudeBrute = champ(formData, "longitude");
  const rayonBrut = Number(champ(formData, "rayon_metres") ?? 300);
  if (!Number.isFinite(rayonBrut) || rayonBrut <= 0 || rayonBrut > 5000) {
    redirect(`/chantiers/${chantierId}/localisation?error=${encodeURIComponent("Rayon invalide (entre 10 et 5000 m)")}`);
  }
  const distanceSiegeBrute = champ(formData, "distance_siege_km");
  const distanceSiege = distanceSiegeBrute ? Number(distanceSiegeBrute) : null;
  if (distanceSiege !== null && (!Number.isFinite(distanceSiege) || distanceSiege < 0)) {
    redirect(`/chantiers/${chantierId}/localisation?error=${encodeURIComponent("Distance au siège invalide")}`);
  }

  const { error } = await supabase
    .from("chantiers")
    .update({
      latitude: latitudeBrute ? Number(latitudeBrute) : null,
      longitude: longitudeBrute ? Number(longitudeBrute) : null,
      rayon_metres: rayonBrut,
      distance_siege_km: distanceSiege,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chantierId)
    .eq("entreprise_id", ctx.entrepriseId);
  if (error) redirect(`/chantiers/${chantierId}/localisation?error=${encodeURIComponent(messageErreurUtilisateur("modifierLocalisationChantierAction", error, "Impossible d’enregistrer ces modifications."))}`);

  revalidatePath(`/chantiers/${chantierId}/localisation`);
  redirect(`/chantiers/${chantierId}/localisation?succes=1`);
}

// Création rapide d'un chantier depuis l'éditeur de devis (retourne du JSON, pas de redirect).
export type ChantierRapide = {
  client_id: string;
  nom: string;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
};

export async function creerChantierRapideAction(
  data: ChantierRapide,
): Promise<{ id: string; label: string } | { error: string }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) return { error: "Votre poste ne permet pas de créer un chantier." };

  if (!data.client_id) return { error: "Choisis d'abord un client." };
  const nom = data.nom?.trim();
  if (!nom) return { error: "Donne un nom au chantier." };

  const { data: cree, error } = await supabase
    .from("chantiers")
    .insert({
      entreprise_id: ctx.entrepriseId,
      client_id: data.client_id,
      nom,
      adresse: data.adresse?.trim() || null,
      code_postal: data.code_postal?.trim() || null,
      ville: data.ville?.trim() || null,
      statut: "prospect",
    })
    .select("id, nom")
    .single();

  if (error || !cree) return { error: messageErreurUtilisateur("creerChantierRapideAction", error, "Impossible de créer le chantier.") };
  revalidatePath("/chantiers");
  return { id: cree.id, label: cree.nom };
}

export async function changerStatutChantierAction(chantierId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) return;

  const { error } = await supabase
    .from("chantiers")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", chantierId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath(`/chantiers/${chantierId}`);
    revalidatePath("/chantiers");
  }
}

export async function ajouterTacheAction(chantierId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) return;

  const libelle = String(formData.get("libelle") ?? "").trim();
  if (libelle === "") return;
  const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!chantier) return;

  await supabase.from("taches").insert({
    chantier_id: chantierId,
    libelle,
    echeance: champ(formData, "echeance"),
  });

  revalidatePath(`/chantiers/${chantierId}`);
}

export async function basculerTacheAction(tacheId: string, chantierId: string, fait: boolean) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) return;

  const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!chantier) return;

  await supabase
    .from("taches")
    .update({ statut: fait ? "fait" : "a_faire" })
    .eq("id", tacheId)
    .eq("chantier_id", chantierId);

  revalidatePath(`/chantiers/${chantierId}`);
}

export async function affecterEmployeChantierAction(chantierId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!(await peutGererChantiers(ctx))) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent("Votre poste ne permet pas de modifier l’équipe du chantier.")}`);
  }

  const employeId = champ(formData, "employe_id");
  const roleSaisi = champ(formData, "role_chantier") ?? "ouvrier";
  const role = ROLES_CHANTIER.some((option) => option.cle === roleSaisi)
    ? (roleSaisi as RoleChantier)
    : null;
  const dateDebut = champ(formData, "date_debut") ?? new Date().toISOString().slice(0, 10);
  if (!employeId || !role || !/^\d{4}-\d{2}-\d{2}$/.test(dateDebut)) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent("Affectation incomplète ou invalide.")}`);
  }

  const [{ data: chantier }, { data: employe }] = await Promise.all([
    supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("employes").select("id").eq("id", employeId).eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(sorti,suspendu)").maybeSingle(),
  ]);
  if (!chantier || !employe) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent("Chantier ou collaborateur introuvable dans cette entreprise.")}`);
  }

  const { data: existante } = await supabase
    .from("equipes_chantiers")
    .select("id")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("chantier_id", chantierId)
    .eq("employe_id", employeId)
    .is("date_fin", null)
    .maybeSingle();

  const valeurs = {
    role_chantier: role,
    date_debut: dateDebut,
    note: champ(formData, "note"),
    updated_at: new Date().toISOString(),
  };
  const resultat = existante
    ? await supabase.from("equipes_chantiers").update(valeurs).eq("id", existante.id).eq("entreprise_id", ctx.entrepriseId)
    : await supabase.from("equipes_chantiers").insert({
        entreprise_id: ctx.entrepriseId,
        chantier_id: chantierId,
        employe_id: employeId,
        ...valeurs,
      });

  if (resultat.error) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent(messageErreurUtilisateur("affecterEmployeChantierAction", resultat.error, "Impossible d’affecter cet employé au chantier."))}`);
  }
  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath("/mes-travaux");
  redirect(`/chantiers/${chantierId}?success=${encodeURIComponent("Employé affecté au chantier.")}`);
}

export async function retirerEmployeChantierAction(chantierId: string, affectationId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!(await peutGererChantiers(ctx))) return;

  const { error } = await supabase
    .from("equipes_chantiers")
    .update({ date_fin: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
    .eq("id", affectationId)
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", ctx.entrepriseId)
    .is("date_fin", null);
  if (error) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent(messageErreurUtilisateur("retirerEmployeChantierAction", error, "Impossible de retirer cet employé de l’équipe."))}`);
  }
  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath("/mes-travaux");
}

// WORKFLOW-DEVIS-V1 : préparer/créer un chantier depuis un devis accepté. Le préremplissage
// est un simple calcul de lecture (aucune écriture) — la création réelle passe par le RPC
// creer_chantier_depuis_devis (security definer), qui revérifie tout côté serveur
// (permission, éligibilité, cross-tenant, idempotence) indépendamment de ce préremplissage.
export type PrevisualisationChantierDepuisDevis =
  | {
      eligible: true;
      devisId: string;
      devisNumero: string | null;
      clientId: string;
      clientNom: string;
      nomSuggere: string;
      adresseSuggeree: string;
      codePostalSuggere: string;
      villeSuggeree: string;
      descriptionSuggeree: string;
      montantHt: number;
      chantierExistantId: string | null;
    }
  | { eligible: false; motif: string };

export async function previsualiserChantierDepuisDevis(devisId: string): Promise<PrevisualisationChantierDepuisDevis> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: devis } = await supabase
    .from("devis")
    .select("id, numero, statut, montant_ht, notes_client, client_id, chantier_id")
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!devis) return { eligible: false, motif: "Devis introuvable" };

  const { data: chantierExistant } = await supabase
    .from("chantiers")
    .select("id")
    .eq("devis_source_id", devisId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();

  if (devis.statut !== "accepte") {
    return { eligible: false, motif: "Ce devis doit être accepté avant de créer un chantier." };
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, nom, prenom, societe, adresse_chantier_defaut, code_postal, ville")
    .eq("id", devis.client_id)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!client) return { eligible: false, motif: "Le client de ce devis est introuvable." };

  // Adresse : (1) le devis lui-même ne porte pas d'adresse propre — n'existe pas dans le
  // modèle actuel, non inventée ; (2) le chantier déjà lié au devis (cas d'un devis de
  // travaux complémentaires sur un chantier existant) ; (3) l'adresse chantier par défaut
  // du client ; (4) vide.
  let adresseSuggeree = "";
  let codePostalSuggere = "";
  let villeSuggeree = "";
  if (devis.chantier_id) {
    const { data: chantierLie } = await supabase
      .from("chantiers")
      .select("adresse, code_postal, ville")
      .eq("id", devis.chantier_id)
      .eq("entreprise_id", ctx.entrepriseId)
      .maybeSingle();
    if (chantierLie?.adresse) {
      adresseSuggeree = chantierLie.adresse ?? "";
      codePostalSuggere = chantierLie.code_postal ?? "";
      villeSuggeree = chantierLie.ville ?? "";
    }
  }
  if (!adresseSuggeree && client.adresse_chantier_defaut) {
    adresseSuggeree = client.adresse_chantier_defaut;
    codePostalSuggere = client.code_postal ?? "";
    villeSuggeree = client.ville ?? "";
  }

  const nomClient = client.societe || [client.prenom, client.nom].filter(Boolean).join(" ") || "Client";
  const nomSuggere = devis.numero ? `${nomClient} — ${devis.numero}` : nomClient;

  return {
    eligible: true,
    devisId,
    devisNumero: devis.numero,
    clientId: client.id,
    clientNom: nomClient,
    nomSuggere,
    adresseSuggeree,
    codePostalSuggere,
    villeSuggeree,
    descriptionSuggeree: devis.notes_client?.trim() || "",
    montantHt: Number(devis.montant_ht),
    chantierExistantId: chantierExistant?.id ?? null,
  };
}

export async function creerChantierDepuisDevisAction(devisId: string, formData: FormData) {
  const supabase = await createClient();
  const nom = champ(formData, "nom");
  const adresse = champ(formData, "adresse");
  const codePostal = champ(formData, "code_postal");
  const ville = champ(formData, "ville");
  const description = champ(formData, "description");

  if (!nom) redirect(`/devis/${devisId}/creer-chantier?error=${encodeURIComponent("Donnez un nom au chantier.")}`);

  const { data, error } = await supabase.rpc("creer_chantier_depuis_devis", {
    p_devis_id: devisId,
    p_nom: nom,
    p_adresse: adresse,
    p_code_postal: codePostal,
    p_ville: ville,
    p_description: description,
  });

  if (error || !data) {
    const brut = error?.message ?? "";
    const dejaExistant = brut.match(/chantier_existant:([0-9a-f-]{36})/i);
    if (dejaExistant) redirect(`/chantiers/${dejaExistant[1]}?success=${encodeURIComponent("Ce chantier existait déjà pour ce devis.")}`);
    if (brut.includes("Accès refusé")) {
      redirect(`/devis/${devisId}?error=${encodeURIComponent("Votre poste ne permet pas de créer un chantier.")}`);
    }
    if (brut.includes("doit être accepté")) {
      redirect(`/devis/${devisId}?error=${encodeURIComponent("Ce devis doit être accepté avant de créer un chantier.")}`);
    }
    redirect(`/devis/${devisId}/creer-chantier?error=${encodeURIComponent(messageErreurUtilisateur("creerChantierDepuisDevisAction", error, "Impossible de créer le chantier depuis ce devis."))}`);
  }

  revalidatePath("/chantiers");
  revalidatePath(`/devis/${devisId}`);
  redirect(`/chantiers/${data}?success=${encodeURIComponent("Chantier créé avec succès")}`);
}
