"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MESSAGE_SANS_RESERVES = "Votre compte ELSATIA ne dispose pas d’un accès actif à Réserves.";

type ContexteCanonique = { entreprise_id: string | null };

function texte(formData: FormData, cle: string) {
  return String(formData.get(cle) ?? "").trim();
}

function texteOuNull(formData: FormData, cle: string) {
  const valeur = texte(formData, cle);
  return valeur === "" ? null : valeur;
}

function cheminSur(valeur: string, defaut: string) {
  return valeur.startsWith("/") && !valeur.startsWith("//") ? valeur : defaut;
}

export async function connexionAction(formData: FormData) {
  const email = texte(formData, "email");
  const password = texte(formData, "password");
  const destination = cheminSur(texte(formData, "next"), "/dashboard");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent("Identifiants incorrects.")}`);

  const { data: contexte, error: erreurContexte } = await supabase
    .rpc("contexte_application_courant")
    .maybeSingle();
  if (erreurContexte || !contexte) {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent(MESSAGE_SANS_RESERVES)}`);
  }

  const canonique = contexte as ContexteCanonique;
  const { data: autorise, error: erreurAcces } = await supabase.rpc("a_acces_application", {
    p_entreprise_id: canonique.entreprise_id,
    p_application_code: "reserves",
  });
  if (erreurAcces) {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent(MESSAGE_SANS_RESERVES)}`);
  }
  if (autorise === true) redirect(destination);

  // Une authentification valide n'est jamais présentée comme un mot de passe erroné :
  // la session non autorisée est fermée, et le message dit la vraie raison.
  await supabase.auth.signOut();
  redirect(`/login?error=${encodeURIComponent(MESSAGE_SANS_RESERVES)}`);
}

export async function deconnexionAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?message=Vous êtes déconnecté");
}

// ── Actions métier ──────────────────────────────────────────────────────────
// Chacune n'est qu'un appel à la RPC correspondante : aucune règle de workflow n'est
// rejouée ici. Une erreur remontée par la base est affichée telle quelle, parce qu'elle
// dit exactement pourquoi l'action a été refusée (motif manquant, photo exigée, etc.).

async function appeler(
  fonction: string,
  parametres: Record<string, unknown>,
  retour: string,
): Promise<never> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fonction, parametres);
  if (error) redirect(`${retour}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(retour);
  redirect(retour);
}

export async function creerReserveAction(formData: FormData) {
  const chantierId = texte(formData, "chantier_id");
  const supabase = await createClient();
  const positionX = texteOuNull(formData, "position_x");
  const positionY = texteOuNull(formData, "position_y");
  const { data, error } = await supabase.rpc("reserves_creer", {
    p_chantier_id: chantierId,
    p_titre: texte(formData, "titre"),
    p_description: texteOuNull(formData, "description"),
    p_priorite: texte(formData, "priorite") || "normale",
    p_intervenant_id: texteOuNull(formData, "intervenant_id"),
    p_plan_id: texteOuNull(formData, "plan_id"),
    p_position_x: positionX === null ? null : Number(positionX),
    p_position_y: positionY === null ? null : Number(positionY),
    p_photo_obligatoire_levee: formData.get("photo_obligatoire_levee") === "on",
    p_echeance: texteOuNull(formData, "echeance"),
    p_origine_client_id: texteOuNull(formData, "origine_client_id"),
  });
  if (error) {
    redirect(`/chantiers/${chantierId}/nouvelle-reserve?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/chantiers/${chantierId}`);
  redirect(`/reserves/${data as string}`);
}

export async function assignerAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  return appeler("reserves_assigner", {
    p_reserve_id: id,
    p_intervenant_id: texte(formData, "intervenant_id"),
    p_commentaire: texteOuNull(formData, "commentaire"),
  }, `/reserves/${id}`);
}

export async function repondreResponsabiliteAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  return appeler("reserves_repondre_responsabilite", {
    p_reserve_id: id,
    p_accepte: texte(formData, "accepte") === "oui",
    p_motif: texteOuNull(formData, "motif"),
    p_photo_path: texteOuNull(formData, "photo_path"),
  }, `/reserves/${id}`);
}

export async function demanderLeveeAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  return appeler("reserves_demander_levee", {
    p_reserve_id: id,
    p_commentaire: texteOuNull(formData, "commentaire"),
  }, `/reserves/${id}`);
}

export async function statuerLeveeAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  return appeler("reserves_statuer_levee", {
    p_reserve_id: id,
    p_validee: texte(formData, "validee") === "oui",
    p_commentaire: texteOuNull(formData, "commentaire"),
  }, `/reserves/${id}`);
}

export async function rouvrirAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  return appeler("reserves_rouvrir", {
    p_reserve_id: id,
    p_commentaire: texte(formData, "commentaire"),
  }, `/reserves/${id}`);
}

export async function commenterAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  return appeler("reserves_commenter", {
    p_reserve_id: id,
    p_contenu: texte(formData, "contenu"),
  }, `/reserves/${id}`);
}

export async function ajouterPhotoAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  return appeler("reserves_ajouter_photo", {
    p_reserve_id: id,
    p_storage_path: texte(formData, "storage_path"),
    p_usage: texte(formData, "usage") || "constat",
    p_legende: texteOuNull(formData, "legende"),
  }, `/reserves/${id}`);
}

export async function designerEntrepriseAction(formData: FormData) {
  return appeler("reserves_designer_entreprise_intervenante", {
    p_intervenant_id: texte(formData, "intervenant_id"),
    p_entreprise_intervenante_id: texte(formData, "entreprise_intervenante_id"),
  }, "/intervenants");
}

export async function rejoindreInterventionAction(formData: FormData) {
  return appeler("reserves_rejoindre_intervention", {
    p_intervenant_id: texte(formData, "intervenant_id"),
  }, "/dashboard");
}
