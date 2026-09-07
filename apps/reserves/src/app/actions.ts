"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MIMES_PHOTO, MIMES_PLAN, TAILLE_MAX_PHOTO, TAILLE_MAX_PLAN,
} from "@/lib/images";
import { BUCKET_PHOTOS, BUCKET_PLANS } from "@/lib/donnees";
import {
  DUREE_INVITATION_JOURS, creerJetonInvitation, hacherJetonInvitation, urlInvitation,
} from "@/lib/invitations";
import { envoyerInvitation } from "@/lib/emails-reserves";

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

  // V3 — cas de l'entreprise invitée par LIEN : elle n'a encore aucun accès applicatif,
  // et c'est normal : l'accès naît de l'acceptation, pas de l'inverse. La déconnecter ici
  // rendrait tout lien d'invitation inutilisable pour une entreprise qui découvre
  // ELSATIA. La page d'invitation est publique et l'acceptation vérifie elle-même le
  // jeton : laisser passer cette destination n'ouvre donc rien d'autre.
  if (destination.startsWith("/invitation/")) redirect(destination);

  // Cas de l'entreprise extérieure qui se connecte pour la première fois : son
  // organisation a reçu l'accès applicatif, mais elle n'a encore aucune habilitation —
  // c'est précisément ce que « rejoindre l'intervention » va lui donner. La déconnecter
  // ici rendrait l'invitation inatteignable.
  const { data: invitations } = await supabase.rpc("reserves_invitations_en_attente");
  const enAttente = (invitations ?? []) as { intervenant_id: string }[];
  if (enAttente.length > 0) {
    redirect(enAttente.length === 1 ? `/rejoindre/${enAttente[0].intervenant_id}` : "/rejoindre");
  }

  // Sinon, l'authentification est valide mais l'accès ne l'est pas. On ne présente
  // jamais cela comme un mot de passe erroné : la session est fermée et le message dit
  // la vraie raison.
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
  const pageDuPlan = texteOuNull(formData, "plan_page");
  const { data, error } = await supabase.rpc("reserves_creer", {
    p_chantier_id: chantierId,
    p_titre: texte(formData, "titre"),
    p_description: texteOuNull(formData, "description"),
    p_priorite: texte(formData, "priorite") || "normale",
    p_intervenant_id: texteOuNull(formData, "intervenant_id"),
    p_plan_id: texteOuNull(formData, "plan_id"),
    p_position_x: positionX === null ? null : Number(positionX),
    p_position_y: positionY === null ? null : Number(positionY),
    p_plan_page: pageDuPlan === null ? null : Number(pageDuPlan),
    p_photo_obligatoire_levee: formData.get("photo_obligatoire_levee") === "on",
    p_echeance: texteOuNull(formData, "echeance"),
    p_origine_client_id: texteOuNull(formData, "origine_client_id"),
  });
  if (error) {
    redirect(`/chantiers/${chantierId}/nouvelle-reserve?error=${encodeURIComponent(error.message)}`);
  }
  const reserveId = data as string;

  // Photo de constat, facultative : elle suit exactement la même séquence que les autres
  // (emplacement réservé par la base, dépôt, confirmation). Un échec de dépôt ne perd pas
  // la réserve déjà créée — l'utilisateur la retrouve et pourra rattacher la photo.
  const constat = formData.get("photo");
  if (constat instanceof File && constat.size > 0) {
    const resultat = await deposerPhoto(reserveId, constat, "constat", null);
    if (!estIdentifiantPhoto(resultat)) {
      redirect(`/reserves/${reserveId}?error=${encodeURIComponent(resultat)}`);
    }
  }

  revalidatePath(`/chantiers/${chantierId}`);
  redirect(`/reserves/${reserveId}`);
}

/**
 * Séquence commune de dépôt d'une photo. Renvoie l'identifiant de la photo confirmée en
 * cas de succès, sinon le message à afficher. La ligne réservée est retirée si le fichier
 * n'arrive pas : une photo non téléversée ne doit jamais compter comme preuve.
 *
 * V3 : l'identifiant est rendu à l'appelant, parce qu'un commentaire peut rattacher la
 * photo qu'il vient de déposer.
 */
async function deposerPhoto(
  reserveId: string,
  fichier: File,
  usage: string,
  legende: string | null,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("reserves_ajouter_photo", {
      p_reserve_id: reserveId,
      p_usage: usage,
      p_legende: legende,
      p_mime_type: fichier.type,
      p_taille_octets: fichier.size,
      p_nom_fichier: fichier.name,
    })
    .maybeSingle();
  if (error || !data) return error?.message ?? "Photo refusée.";

  const { photo_id: photoId, storage_path: chemin } = data as {
    photo_id: string; storage_path: string;
  };
  const { error: erreurDepot } = await supabase.storage
    .from(BUCKET_PHOTOS)
    .upload(chemin, fichier, { contentType: fichier.type, upsert: false });
  if (erreurDepot) {
    await supabase.rpc("reserves_supprimer_photo", {
      p_photo_id: photoId, p_motif: "Téléversement interrompu",
    });
    return "Le dépôt de la photo a échoué. Réessayez depuis la fiche de la réserve.";
  }
  const { error: erreurConfirmation } = await supabase.rpc("reserves_confirmer_photo", {
    p_photo_id: photoId,
  });
  return erreurConfirmation ? erreurConfirmation.message : photoId;
}

/** Un identifiant de photo est un UUID ; tout le reste est un message d'erreur. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function estIdentifiantPhoto(resultat: string) {
  return UUID.test(resultat);
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
  const retour = `/reserves/${id}`;

  // Pièce jointe facultative : elle emprunte la séquence de dépôt de photo déjà en place
  // (emplacement réservé par la base, dépôt, confirmation), avec l'usage « echange » qui
  // la distingue d'une preuve — elle ne satisfait jamais l'exigence de photo à la levée.
  let photoId: string | null = null;
  const piece = formData.get("piece_jointe");
  if (piece instanceof File && piece.size > 0) {
    const fichier = fichierDeposeValide(piece, MIMES_PHOTO, TAILLE_MAX_PHOTO);
    if (typeof fichier === "string") redirect(`${retour}?error=${encodeURIComponent(fichier)}`);
    const resultat = await deposerPhoto(id, fichier, "echange", null);
    if (!estIdentifiantPhoto(resultat)) redirect(`${retour}?error=${encodeURIComponent(resultat)}`);
    photoId = resultat;
  }

  return appeler("reserves_commenter", {
    p_reserve_id: id,
    p_contenu: texte(formData, "contenu"),
    p_photo_id: photoId,
  }, retour);
}

export async function marquerConversationLueAction(formData: FormData) {
  const retour = cheminSur(texte(formData, "retour"), "/messages");
  return appeler("reserves_conversation_marquer_lue", {
    p_conversation_id: texte(formData, "conversation_id"),
  }, retour);
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

// ── V2 : téléversement réel ─────────────────────────────────────────────────
// Séquence en trois temps, identique pour les photos et les plans :
//   1. la BASE réserve l'emplacement et compose le chemin ;
//   2. le fichier est déposé à cet emplacement exact ;
//   3. la base confirme, après avoir vérifié que l'objet existe réellement.
//
// L'appelant ne choisit jamais le chemin. Si le dépôt échoue, la ligne est retirée par
// une suppression douce : aucun objet orphelin, aucune photo fantôme qui satisferait à
// tort l'exigence de preuve à la levée.


function fichierDeposeValide(
  valeur: FormDataEntryValue | null,
  mimes: readonly string[],
  tailleMax: number,
): File | string {
  if (!(valeur instanceof File) || valeur.size === 0) return "Aucun fichier sélectionné.";
  if (!mimes.includes(valeur.type)) {
    return valeur.type === "image/heic" || valeur.type === "image/heif"
      ? "Le format HEIC n’est pas pris en charge. Réglez l’appareil photo sur « Le plus compatible »."
      : `Format non pris en charge (${valeur.type || "inconnu"}).`;
  }
  if (valeur.size > tailleMax) return "Fichier trop volumineux.";
  return valeur;
}

export async function televerserPhotoAction(formData: FormData) {
  const reserveId = texte(formData, "reserve_id");
  const retour = `/reserves/${reserveId}`;
  const fichier = fichierDeposeValide(formData.get("photo"), MIMES_PHOTO, TAILLE_MAX_PHOTO);
  if (typeof fichier === "string") redirect(`${retour}?error=${encodeURIComponent(fichier)}`);

  const resultat = await deposerPhoto(
    reserveId, fichier, texte(formData, "usage") || "constat", texteOuNull(formData, "legende"),
  );
  if (!estIdentifiantPhoto(resultat)) redirect(`${retour}?error=${encodeURIComponent(resultat)}`);
  revalidatePath(retour);
  redirect(retour);
}

export async function supprimerPhotoAction(formData: FormData) {
  const reserveId = texte(formData, "reserve_id");
  return appeler("reserves_supprimer_photo", {
    p_photo_id: texte(formData, "photo_id"),
    p_motif: texteOuNull(formData, "motif"),
  }, `/reserves/${reserveId}`);
}

// ── V2 : chantiers ──────────────────────────────────────────────────────────
export async function creerChantierAction(formData: FormData) {
  const supabase = await createClient();
  const { data: contexte } = await supabase.rpc("contexte_application_courant").maybeSingle();
  const entrepriseId = (contexte as { entreprise_id: string | null } | null)?.entreprise_id;
  if (!entrepriseId) redirect("/chantiers?error=Aucune organisation active");

  const { data, error } = await supabase
    .from("reserves_chantiers")
    .insert({
      entreprise_id: entrepriseId,
      nom: texte(formData, "nom"),
      reference: texteOuNull(formData, "reference"),
      client: texteOuNull(formData, "client"),
      adresse: texteOuNull(formData, "adresse"),
      code_postal: texteOuNull(formData, "code_postal"),
      ville: texteOuNull(formData, "ville"),
      description: texteOuNull(formData, "description"),
      date_debut: texteOuNull(formData, "date_debut"),
      date_fin_prevue: texteOuNull(formData, "date_fin_prevue"),
      statut: texte(formData, "statut") || "en_cours",
    })
    .select("id")
    .single();
  if (error || !data) {
    redirect(`/chantiers/nouveau?error=${encodeURIComponent(error?.message ?? "Création impossible")}`);
  }
  revalidatePath("/chantiers");
  redirect(`/chantiers/${data.id}`);
}

export async function modifierChantierAction(formData: FormData) {
  const id = texte(formData, "chantier_id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("reserves_chantiers")
    .update({
      nom: texte(formData, "nom"),
      reference: texteOuNull(formData, "reference"),
      client: texteOuNull(formData, "client"),
      adresse: texteOuNull(formData, "adresse"),
      ville: texteOuNull(formData, "ville"),
      description: texteOuNull(formData, "description"),
      date_debut: texteOuNull(formData, "date_debut"),
      date_fin_prevue: texteOuNull(formData, "date_fin_prevue"),
      statut: texte(formData, "statut") || "en_cours",
      date_reception: texteOuNull(formData, "date_reception"),
    })
    .eq("id", id);
  if (error) redirect(`/chantiers/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/chantiers/${id}`);
  redirect(`/chantiers/${id}`);
}

// ── V2 : plans ──────────────────────────────────────────────────────────────
export async function ajouterPlanAction(formData: FormData) {
  const chantierId = texte(formData, "chantier_id");
  const retour = `/chantiers/${chantierId}/plans`;
  const fichier = fichierDeposeValide(formData.get("document"), MIMES_PLAN, TAILLE_MAX_PLAN);
  if (typeof fichier === "string") redirect(`${retour}?error=${encodeURIComponent(fichier)}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("reserves_ajouter_plan", {
      p_chantier_id: chantierId,
      p_nom: texte(formData, "nom"),
      p_niveau: texteOuNull(formData, "niveau"),
      p_zone: texteOuNull(formData, "zone"),
      p_mime_type: fichier.type,
      p_taille_octets: fichier.size,
      p_nom_fichier: fichier.name,
      p_ordre: Number(texte(formData, "ordre") || "0"),
    })
    .maybeSingle();
  if (error || !data) {
    redirect(`${retour}?error=${encodeURIComponent(error?.message ?? "Plan refusé.")}`);
  }
  const { plan_id: planId, storage_path: chemin } = data as { plan_id: string; storage_path: string };

  const { error: erreurDepot } = await supabase.storage
    .from(BUCKET_PLANS)
    .upload(chemin, fichier, { contentType: fichier.type, upsert: false });
  if (erreurDepot) {
    await supabase.rpc("reserves_supprimer_plan", { p_plan_id: planId });
    redirect(`${retour}?error=${encodeURIComponent("Le dépôt du plan a échoué. Réessayez.")}`);
  }

  const { error: erreurConfirmation } = await supabase.rpc("reserves_confirmer_plan", {
    p_plan_id: planId, p_storage_path: chemin,
  });
  if (erreurConfirmation) {
    redirect(`${retour}?error=${encodeURIComponent(erreurConfirmation.message)}`);
  }
  revalidatePath(retour);
  redirect(retour);
}

export async function supprimerPlanAction(formData: FormData) {
  const chantierId = texte(formData, "chantier_id");
  return appeler("reserves_supprimer_plan", {
    p_plan_id: texte(formData, "plan_id"),
  }, `/chantiers/${chantierId}/plans`);
}

// ── V2 : membres de l'organisation ──────────────────────────────────────────
export async function attribuerRoleAction(formData: FormData) {
  return appeler("reserves_attribuer_role", {
    p_utilisateur_id: texte(formData, "utilisateur_id"),
    p_entreprise_id: texte(formData, "entreprise_id"),
    p_role_code: texte(formData, "role_code"),
  }, "/parametres/membres");
}

export async function retirerAccesMembreAction(formData: FormData) {
  return appeler("reserves_retirer_acces_membre", {
    p_utilisateur_id: texte(formData, "utilisateur_id"),
    p_entreprise_id: texte(formData, "entreprise_id"),
  }, "/parametres/membres");
}

export async function ajouterIntervenantAction(formData: FormData) {
  const supabase = await createClient();
  const chantierId = texte(formData, "chantier_id");
  const { data: chantier } = await supabase
    .from("reserves_chantiers").select("entreprise_id").eq("id", chantierId).maybeSingle();
  if (!chantier) redirect("/intervenants?error=Chantier introuvable");

  const { error } = await supabase.from("reserves_intervenants").insert({
    entreprise_id: (chantier as { entreprise_id: string }).entreprise_id,
    chantier_id: chantierId,
    nom: texte(formData, "nom"),
    corps_etat: texteOuNull(formData, "corps_etat"),
    raison_sociale: texteOuNull(formData, "raison_sociale"),
    siret: texteOuNull(formData, "siret"),
    contact_nom: texteOuNull(formData, "contact_nom"),
    email_contact: texteOuNull(formData, "email_contact"),
    telephone_contact: texteOuNull(formData, "telephone_contact"),
    onboarding_statut: texteOuNull(formData, "email_contact") ? "a_inviter" : "inconnu",
  });
  if (error) redirect(`/intervenants?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/intervenants");
  revalidatePath(`/chantiers/${chantierId}`);
  redirect("/intervenants");
}

/**
 * Révocation d'une entreprise intervenante. La base renvoie combien de réserves restaient
 * ouvertes sur elle : c'est exactement la liste de ce qu'il reste à transférer, et
 * l'utilisateur doit le savoir au moment où il révoque, pas le découvrir après.
 */
export async function revoquerIntervenantAction(formData: FormData) {
  const intervenantId = texte(formData, "intervenant_id");
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("reserves_revoquer_intervenant", {
      p_intervenant_id: intervenantId,
      p_motif: texteOuNull(formData, "motif"),
    })
    .maybeSingle();
  if (error) redirect(`/intervenants?error=${encodeURIComponent(error.message)}`);

  const resultat = data as { reserves_ouvertes: number; acces_retire: boolean } | null;
  revalidatePath("/intervenants");
  const ouvertes = resultat?.reserves_ouvertes ?? 0;
  if (ouvertes > 0) {
    redirect(`/intervenants?message=${encodeURIComponent(
      `Accès révoqué. ${ouvertes} réserve${ouvertes > 1 ? "s" : ""} restait${ouvertes > 1 ? "ent" : ""} `
      + "ouverte(s) sur cette entreprise : transférez-la(les) à un autre intervenant.",
    )}&transfert=${intervenantId}`);
  }
  redirect("/intervenants?message=Acc%C3%A8s%20r%C3%A9voqu%C3%A9.");
}

export async function reactiverIntervenantAction(formData: FormData) {
  return appeler("reserves_reactiver_intervenant", {
    p_intervenant_id: texte(formData, "intervenant_id"),
  }, "/intervenants");
}

export async function transfererResponsabiliteAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  return appeler("reserves_transferer_responsabilite", {
    p_reserve_id: id,
    p_intervenant_cible_id: texte(formData, "intervenant_cible_id"),
    p_motif: texte(formData, "motif"),
  }, `/reserves/${id}`);
}

// ── V3 : annuaire des organisations ─────────────────────────────────────────

export async function publierAnnuaireAction(formData: FormData) {
  return appeler("reserves_annuaire_publier", {
    p_entreprise_id: texte(formData, "entreprise_id"),
    p_publiee: formData.get("publiee") === "on",
    p_corps_etat: texteOuNull(formData, "corps_etat"),
    p_zone_intervention: texteOuNull(formData, "zone_intervention"),
    p_email_contact: texteOuNull(formData, "email_contact"),
    p_telephone_contact: texteOuNull(formData, "telephone_contact"),
  }, "/parametres/annuaire");
}

// ── V3 : invitation d'une entreprise intervenante ───────────────────────────

/**
 * Émission d'un lien d'invitation, puis envoi par le canal e-mail commun.
 *
 * L'ordre compte. Le jeton est tiré ICI et n'existe en clair que dans cette fonction et
 * dans l'URL envoyée ; la base ne reçoit que son empreinte. Si l'e-mail ne part pas —
 * canal non configuré, adresse invalide — l'invitation reste valide et l'écran affiche
 * le lien à transmettre autrement. Un échec d'envoi ne doit pas détruire un accès
 * légitimement accordé.
 */
export async function inviterIntervenantAction(formData: FormData) {
  const intervenantId = texte(formData, "intervenant_id");
  const retour = cheminSur(texte(formData, "retour"), "/intervenants");
  const email = texte(formData, "email");
  if (email === "") redirect(`${retour}?error=${encodeURIComponent("Indiquez l’adresse du contact.")}`);

  const supabase = await createClient();
  const jeton = creerJetonInvitation();
  const { data, error } = await supabase.rpc("reserves_inviter_intervenant", {
    p_intervenant_id: intervenantId,
    p_token_hash: hacherJetonInvitation(jeton),
    p_email: email,
    p_contact_nom: texteOuNull(formData, "contact_nom"),
    p_entreprise_cible_id: texteOuNull(formData, "entreprise_cible_id"),
    p_duree_jours: DUREE_INVITATION_JOURS,
  });
  if (error || !data) {
    redirect(`${retour}?error=${encodeURIComponent(error?.message ?? "Invitation impossible.")}`);
  }
  const invitationId = data as string;
  const lien = urlInvitation(jeton);

  // Contexte du message : lu depuis la base, jamais reconstitué à partir du formulaire.
  const { data: contexte } = await supabase
    .from("reserves_intervenants")
    .select("nom, contact_nom, chantier_id, entreprise_id, reserves_chantiers(nom), entreprises!reserves_intervenants_entreprise_id_fkey(nom, raison_sociale)")
    .eq("id", intervenantId)
    .maybeSingle();

  const details = contexte as {
    nom: string;
    contact_nom: string | null;
    reserves_chantiers: { nom: string } | null;
    entreprises: { nom: string; raison_sociale: string | null } | null;
  } | null;

  const resultat = await envoyerInvitation({
    destinataire: email,
    organisationHote: details?.entreprises?.raison_sociale?.trim()
      || details?.entreprises?.nom
      || "Votre donneur d’ordre",
    chantier: details?.reserves_chantiers?.nom ?? "Chantier",
    intervenant: details?.nom ?? "Entreprise intervenante",
    contactNom: texteOuNull(formData, "contact_nom") ?? details?.contact_nom ?? null,
    url: lien,
    expireLe: new Date(Date.now() + DUREE_INVITATION_JOURS * 24 * 60 * 60 * 1000),
  });

  await supabase.rpc("reserves_invitation_marquer_envoyee", {
    p_invitation_id: invitationId,
    p_echec: resultat.envoye ? null : (resultat.motif ?? "Envoi impossible"),
  });

  revalidatePath(retour);
  if (resultat.envoye) {
    redirect(`${retour}?message=${encodeURIComponent(`Invitation envoyée à ${email}.`)}`);
  }
  // Le lien voyage dans l'URL de retour : c'est le seul moyen de le remettre à
  // l'utilisateur sans le persister, puisqu'il n'existe nulle part ailleurs en clair.
  redirect(`${retour}?lien=${encodeURIComponent(lien)}&error=${encodeURIComponent(
    `${resultat.motif ?? "Envoi impossible."} Le lien reste valide : transmettez-le vous-même.`,
  )}`);
}

export async function revoquerInvitationAction(formData: FormData) {
  const retour = cheminSur(texte(formData, "retour"), "/intervenants");
  return appeler("reserves_invitation_revoquer", {
    p_invitation_id: texte(formData, "invitation_id"),
  }, retour);
}

/**
 * Acceptation d'une invitation. L'organisation qui rejoint est celle de la session
 * courante : elle n'est jamais choisie dans le formulaire, pour qu'un identifiant
 * d'organisation ne redevienne pas, par la porte de derrière, un mécanisme d'accès.
 */
export async function accepterInvitationAction(formData: FormData) {
  const jeton = texte(formData, "jeton");
  const supabase = await createClient();
  const { data: contexte } = await supabase.rpc("contexte_application_courant").maybeSingle();
  const entrepriseId = (contexte as ContexteCanonique | null)?.entreprise_id;
  if (!entrepriseId) {
    redirect(`/invitation/${encodeURIComponent(jeton)}?error=${encodeURIComponent(
      "Votre compte n’est rattaché à aucune organisation active.",
    )}`);
  }

  const { data, error } = await supabase.rpc("reserves_invitation_accepter", {
    p_token_hash: hacherJetonInvitation(jeton),
    p_entreprise_id: entrepriseId,
  });
  if (error) {
    redirect(`/invitation/${encodeURIComponent(jeton)}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?message=${encodeURIComponent("Vous êtes rattaché à l’intervention.")}&intervenant=${data as string}`);
}

// ── V3 : notifications ──────────────────────────────────────────────────────

export async function marquerNotificationsLuesAction(formData: FormData) {
  const id = texteOuNull(formData, "notification_id");
  return appeler("reserves_notifications_marquer_lues", {
    p_ids: id ? [id] : null,
  }, "/notifications");
}

export async function definirPreferenceAction(formData: FormData) {
  return appeler("reserves_preferences_definir", {
    p_entreprise_id: texte(formData, "entreprise_id"),
    p_categorie: texte(formData, "categorie"),
    p_email: formData.get("email") === "on",
  }, "/parametres/notifications");
}

// ── V3 : repérage sur plan ──────────────────────────────────────────────────

export async function repositionnerAction(formData: FormData) {
  const id = texte(formData, "reserve_id");
  const planId = texteOuNull(formData, "plan_id");
  const page = texteOuNull(formData, "plan_page");
  const x = texteOuNull(formData, "position_x");
  const y = texteOuNull(formData, "position_y");
  return appeler("reserves_repositionner", {
    p_reserve_id: id,
    p_plan_id: planId,
    p_plan_page: page === null ? null : Number(page),
    p_position_x: x === null ? null : Number(x),
    p_position_y: y === null ? null : Number(y),
  }, `/reserves/${id}`);
}

/**
 * Pagination réelle d'un plan PDF, constatée par le rendu côté navigateur : PostgreSQL
 * ne sait pas ouvrir un PDF, et rasteriser le document côté serveur pour compter ses
 * pages coûterait bien plus que de lire le nombre que pdf.js vient d'exposer.
 */
export async function enregistrerPaginationAction(planId: string, nbPages: number) {
  const supabase = await createClient();
  await supabase.rpc("reserves_enregistrer_pagination", {
    p_plan_id: planId,
    p_nb_pages: nbPages,
  });
}
