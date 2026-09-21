"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import {
  detecterFormatImage,
  validerCommunication,
  validerImageCommunication,
  type CanalCommunication,
  type CleRoleDemande,
  type FrequenceAffichage,
  type ModeAffichage,
  type PrioriteCommunication,
  type SegmentAbonnement,
} from "@elsatia/platform-support-comms";

const RETOUR = "/plateforme/communications";

function echec(message: string): never {
  redirect(`${RETOUR}?error=${encodeURIComponent(message)}`);
}

function listeOuNull(valeurs: string[]): string[] | null {
  const propres = valeurs.map((v) => v.trim()).filter((v) => v !== "");
  return propres.length === 0 ? null : propres;
}

/**
 * Création d'une communication.
 *
 * L'image est validée sur ses OCTETS, jamais sur son nom ni sur le `Content-Type`
 * annoncé par le navigateur : c'est le seul contrôle qui empêche un SVG porteur de
 * script d'entrer déguisé en PNG.
 */
export async function creerCommunicationAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  if (isEmailLoginDisabled()) echec("Le centre de communications exige un compte plateforme authentifié");

  const fichier = formData.get("image");
  let image = null;
  if (fichier instanceof File && fichier.size > 0) {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    if (detecterFormatImage(octets) === null) {
      echec("Format d’image non reconnu (PNG, JPEG ou WebP attendus). Le SVG n’est pas accepté.");
    }
    image = {
      octets,
      mimeDeclare: fichier.type === "" ? null : fichier.type,
      // Les dimensions sont mesurées côté navigateur : les recevoir permet de refuser
      // tôt une image hors bornes, et elles sont recontrôlées au stockage.
      largeur: Number.parseInt(String(formData.get("imageLargeur") ?? "0"), 10),
      hauteur: Number.parseInt(String(formData.get("imageHauteur") ?? "0"), 10),
      texteAlternatif: String(formData.get("imageAlt") ?? ""),
    };
    const controle = validerImageCommunication(image);
    if (!controle.valide) echec(controle.message);
  }

  const brouillon = {
    titre: String(formData.get("titre") ?? ""),
    texteCourt: String(formData.get("texteCourt") ?? ""),
    contenu: String(formData.get("contenu") ?? ""),
    type: String(formData.get("type") ?? "information"),
    priorite: String(formData.get("priorite") ?? "normale") as PrioriteCommunication,
    debutAt: String(formData.get("debutAt") ?? new Date().toISOString()),
    finAt: String(formData.get("finAt") ?? "").trim() === "" ? null : String(formData.get("finAt")),
    modeAffichage: String(formData.get("modeAffichage") ?? "banniere") as ModeAffichage,
    frequence: String(formData.get("frequence") ?? "une_seule_fois") as FrequenceAffichage,
    canaux: formData.getAll("canaux").map((c) => String(c) as CanalCommunication),
    lien: String(formData.get("lien") ?? ""),
    libelleBouton: String(formData.get("libelleBouton") ?? ""),
    image,
  };

  const resultat = validerCommunication(brouillon);
  if (!resultat.valide) echec(resultat.message);
  const communication = resultat.communication;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("communications_creer", {
    p_titre: communication.titre,
    p_texte_court: communication.texteCourt,
    p_type: communication.type,
    p_mode_affichage: communication.modeAffichage,
    p_debut_at: communication.debutAt,
    p_fin_at: communication.finAt,
    p_contenu: communication.contenu,
    p_priorite: communication.priorite,
    p_frequence: communication.frequence,
    p_canaux: communication.canaux,
    p_lien: communication.lien,
    p_libelle_bouton: communication.libelleBouton,
    p_applications: listeOuNull(formData.getAll("applications").map(String)),
    p_entreprises: listeOuNull(formData.getAll("entreprises").map(String)),
    p_segments: listeOuNull(formData.getAll("segments").map(String)) as SegmentAbonnement[] | null,
    p_roles: listeOuNull(formData.getAll("roles").map(String)) as CleRoleDemande[] | null,
    p_permissions: null,
    p_roles_applicatifs: null,
  });
  if (error) echec(error.message);

  // L'image n'est téléversée qu'APRÈS création : un objet orphelin dans le bucket est
  // moins gênant qu'une communication référençant un fichier absent.
  if (image && typeof data === "string") {
    const chemin = `${data}/visuel`;
    const { error: erreurStockage } = await supabase.storage
      .from("communications-elsatia")
      .upload(chemin, image.octets, { contentType: fichier instanceof File ? fichier.type : undefined });
    if (erreurStockage) echec(`Communication créée, mais l’image n’a pas pu être stockée : ${erreurStockage.message}`);
    await supabase.from("communications_pieces_jointes").insert({
      communication_id: data,
      chemin_stockage: chemin,
      mime: fichier instanceof File ? fichier.type : "image/png",
      octets: image.octets.byteLength,
      largeur: image.largeur,
      hauteur: image.hauteur,
      texte_alternatif: image.texteAlternatif,
    });
  }

  revalidatePath(RETOUR);
  redirect(`${RETOUR}?succes=${encodeURIComponent("Communication enregistrée en brouillon")}`);
}

export async function changerStatutCommunicationAction(id: string, transition: string) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const supabase = await createClient();
  const { error } = await supabase.rpc("communications_changer_statut", {
    p_id: id,
    p_transition: transition,
  });
  if (error) echec(error.message);
  revalidatePath(RETOUR);
  redirect(`${RETOUR}?succes=${encodeURIComponent("Statut mis à jour")}`);
}
