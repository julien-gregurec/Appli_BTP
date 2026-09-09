import { NextResponse } from "next/server";
import { getContexteColors } from "@/lib/contexte";
import { exigerAccesApplication } from "@/lib/applications-elsatia";
import { resoudreRoleColors } from "@/lib/acces-colors";
import { peutEffectuerColors } from "@/lib/permissions-colors";
import { validerPhotoColors, validerSignaturePhotoColors } from "@/lib/media-colors";
import { createClient } from "@/lib/supabase/server";
import { analyserEtiquetteColors } from "@/lib/ocr-colors";
import { etatOcrColors, fournisseurOcrActif } from "@/lib/ocr/fournisseurs";
import { RAISONS_OCR_INACTIF } from "@/lib/ocr/politique";
import { champsAConfirmer } from "@/lib/ocr/confirmation";
import { journaliserEchecTechnique } from "@/lib/journal-securite";

/**
 * Lecture d'étiquette d'un seau.
 *
 * ### L'ordre des contrôles est le contrat
 *
 * L'état de l'OCR est décidé **avant que le corps de la requête ne soit lu**.
 * Ce n'est pas une optimisation : tant que la lecture d'étiquette est inactive,
 * aucune image ne doit être reçue, mise en mémoire, ni a fortiori transmise.
 * Un refus prononcé après avoir lu le fichier laisserait passer précisément ce
 * que le refus existe pour empêcher.
 *
 * ### Consentement
 *
 * L'appel exige `consentement=oui`, posé par une case à cocher que rien ne
 * pré-coche. Le geste est distinct de l'envoi de la photo à ELSATIA : envoyer
 * une image à son propre outil de gestion et l'envoyer à un prestataire tiers
 * ne sont pas la même décision, et un seul bouton pour les deux la
 * confisquerait.
 *
 * ### Rien n'est écrit dans la fiche
 *
 * La réponse ne contient que des champs **à confirmer**. L'analyse est
 * enregistrée au statut `a_confirmer` par `colors_creer_analyse_ocr` ; aucune
 * valeur ne rejoint `colors_seaux` avant une confirmation champ par champ.
 */
export async function POST(request: Request) {
  const contexte = await getContexteColors();
  await exigerAccesApplication(contexte, "colors");
  if (!contexte.entrepriseId) return NextResponse.json({ erreur: "Organisation requise" }, { status: 403 });
  const role = await resoudreRoleColors(contexte);
  if (!peutEffectuerColors(role, "ocr")) return NextResponse.json({ erreur: "Action non autorisée" }, { status: 403 });

  // Décision d'abord, corps ensuite. Voir l'en-tête.
  const etat = etatOcrColors();
  if (!etat.actif) {
    return NextResponse.json({ erreur: RAISONS_OCR_INACTIF[etat.raison], code: etat.raison }, { status: 409 });
  }
  const fournisseur = fournisseurOcrActif();
  if (!fournisseur) {
    return NextResponse.json(
      { erreur: RAISONS_OCR_INACTIF.fournisseur_inconnu, code: "fournisseur_inconnu" },
      { status: 409 },
    );
  }

  const formulaire = await request.formData();
  if (String(formulaire.get("consentement") ?? "") !== "oui") {
    return NextResponse.json(
      { erreur: "La lecture d’étiquette suppose votre accord explicite pour cette image.", code: "consentement_requis" },
      { status: 400 },
    );
  }

  const seauId = String(formulaire.get("seauId") ?? "");
  const photo = formulaire.get("photo");
  if (!/^[0-9a-f-]{36}$/i.test(seauId) || !(photo instanceof File)) {
    return NextResponse.json({ erreur: "Photo ou seau invalide" }, { status: 400 });
  }
  const erreurPhoto = validerPhotoColors({ mime: photo.type, taille: photo.size });
  if (erreurPhoto) return NextResponse.json({ erreur: erreurPhoto }, { status: 400 });

  const supabase = await createClient();
  const { data: seau } = await supabase.from("colors_seaux")
    .select("id,photo_principale_path")
    .eq("entreprise_id", contexte.entrepriseId).eq("id", seauId).maybeSingle();
  if (!seau) return NextResponse.json({ erreur: "Seau introuvable" }, { status: 404 });

  const contenu = new Uint8Array(await photo.arrayBuffer());
  const signature = validerSignaturePhotoColors(contenu, photo.type);
  if (signature.erreur || !signature.mime) return NextResponse.json({ erreur: signature.erreur }, { status: 400 });

  let proposition;
  try {
    // Le prestataire ne reçoit que des octets et un type : ni identifiant
    // d'organisation, ni identifiant de seau, ni nom de fichier.
    proposition = await analyserEtiquetteColors(fournisseur, { mime: signature.mime, bytes: contenu });
  } catch (erreur) {
    // Le message du prestataire reste dans les journaux serveur : il peut
    // contenir une référence de requête, voire un extrait de l'image lue.
    journaliserEchecTechnique("ocr.analyse", erreur as { message?: string });
    return NextResponse.json({ erreur: "La lecture d’étiquette a échoué. Réessayez ou saisissez les champs à la main.", code: "echec_lecture" }, { status: 502 });
  }

  const champs = champsAConfirmer(proposition);
  const { data: analyse, error } = await supabase.rpc("colors_creer_analyse_ocr", {
    p_entreprise_id: contexte.entrepriseId,
    p_seau_id: seauId,
    p_photo_path: seau.photo_principale_path,
    p_resultat: { champs: Object.fromEntries(champs.map((c) => [c.champ, c.valeurProposee])) },
    p_confiance: null,
  });
  if (error) {
    journaliserEchecTechnique("colors_creer_analyse_ocr", error);
    return NextResponse.json({ erreur: "Analyse non enregistrée" }, { status: 500 });
  }

  return NextResponse.json({
    analyseId: (analyse as { id: string } | null)?.id ?? null,
    statut: "a_confirmer",
    fournisseur: etat.fournisseur,
    champs,
  });
}
