"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import { adminSocial, AccesSocialRefuse, consommerQuota, exigerSocial, type ContexteSocial } from "@/lib/social/acces";
import { difference, journaliser } from "@/lib/social/audit";
import { connecteurPour, enregistrerCompte, jetonDuCompte, rechiffrerJetons } from "@/lib/social/comptes";
import { configMeta, modeSimulation } from "@/lib/social/config";
import { validerContenu, texteDuReseau } from "@/lib/social/contenu";
import { dechiffrerSecret } from "@/lib/social/crypto";
import * as ia from "@/lib/social/ia";
import { revoquerLinkedIn, inspecterJetonLinkedIn, type JetonsLinkedIn } from "@/lib/social/linkedin";
import { extension, typeMedia, validerTeleversement } from "@/lib/social/medias";
import { abonnerWebhooksPage, inspecterJetonMeta, revoquerMeta, verifierApplicationMeta, type ResultatOAuthMeta } from "@/lib/social/meta";
import { diagnostiquerCompte } from "@/lib/social/diagnostic";
import { ErreurSocial, MESSAGE_NON_DISPONIBLE } from "@/lib/social/provider";
import { BUCKET_SOCIAL, chargerPublication, empreinteDe, lancerPublication, relancerCible } from "@/lib/social/publication";
import { estRoleSocial, peut } from "@/lib/social/roles";
import { synchroniserCommentaires, synchroniserMessages, synchroniserStatistiques } from "@/lib/social/synchronisation";
import { APPLICATIONS_ELSATIA, estReseau, LIBELLE_RESEAU, type Publication, type Reseau } from "@/lib/social/types";
import { deplacementCalendrier, estModifiable, transitionPossible, verifierDateProgrammation } from "@/lib/social/workflow";

// Actions serveur ELSATIA Social. Chaque action :
//   1. vérifie le rôle de l'utilisateur côté serveur (jamais côté client) ;
//   2. écrit via le client service_role uniquement après ce contrôle ;
//   3. journalise l'action dans social_audit.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Resultat<T = undefined> = { ok: true; message?: string; donnees?: T } | { ok: false; erreur: string };

async function executer<T>(fn: () => Promise<Resultat<T>>): Promise<Resultat<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccesSocialRefuse || e instanceof ErreurSocial || e instanceof Error) return { ok: false, erreur: e.message };
    return { ok: false, erreur: "Erreur inattendue" };
  }
}

function rafraichir() {
  revalidatePath("/plateforme/social", "layout");
}

async function exigerQuotaIA(ctx: ContexteSocial) {
  if (!(await consommerQuota(`ia:${ctx.utilisateurId}`, 60, 3600))) throw new Error("Limite de 60 demandes à l’Assistant Social par heure atteinte.");
}

// ─────────────────────────────────────────────────────────────
// Publications
// ─────────────────────────────────────────────────────────────

export type SaisiePublication = {
  id?: string | null;
  titre: string;
  contenu_principal: string;
  contenu_facebook: string;
  contenu_instagram: string;
  contenu_linkedin: string;
  lien_url: string;
  application: string;
  reseaux: string[];
  programme_at: string | null;
  mediaIds: string[];
  idee?: boolean;
};

function normaliser(s: SaisiePublication) {
  const titre = s.titre.trim().slice(0, 200);
  if (!titre) throw new Error("Le titre est obligatoire.");
  const lien = s.lien_url.trim();
  if (lien && !/^https:\/\/[^\s]+$/.test(lien)) throw new Error("Le lien doit commencer par https://");
  const application = APPLICATIONS_ELSATIA.some((a) => a.cle === s.application) ? s.application : "elsatia";
  const reseaux = [...new Set(s.reseaux.filter(estReseau))];
  const date = s.programme_at ? new Date(s.programme_at) : null;
  if (date && Number.isNaN(date.getTime())) throw new Error("Date invalide.");
  const vide = (v: string) => (v.trim() ? v.trim() : null);
  return {
    titre,
    contenu_principal: s.contenu_principal.trim().slice(0, 10000),
    contenu_facebook: vide(s.contenu_facebook),
    contenu_instagram: vide(s.contenu_instagram),
    contenu_linkedin: vide(s.contenu_linkedin),
    lien_url: lien || null,
    application,
    reseaux,
    programme_at: date ? date.toISOString() : null,
  };
}

export async function enregistrerPublicationAction(saisie: SaisiePublication): Promise<Resultat<{ id: string }>> {
  return executer(async () => {
    const ctx = await exigerSocial("rediger");
    const admin = adminSocial();
    const valeurs = normaliser(saisie);
    const mediaIds = [...new Set(saisie.mediaIds)].slice(0, 10);
    let id = saisie.id ?? null;

    if (id) {
      const actuelle = await chargerPublication(admin, id);
      if (!actuelle) throw new Error("Publication introuvable.");
      if (!estModifiable(actuelle.publication.statut)) throw new Error("Une publication envoyée ne peut plus être modifiée.");
      const medias = actuelle.medias.map((m) => m.id);
      // Dates comparées sous la même forme ISO (Postgres renvoie « +00:00 », le navigateur « Z »).
      const avantNormalise = { ...actuelle.publication, programme_at: actuelle.publication.programme_at ? new Date(actuelle.publication.programme_at).toISOString() : null };
      const diff = difference(avantNormalise as unknown as Record<string, unknown>, valeurs);
      const mediasChanges = JSON.stringify(medias) !== JSON.stringify(mediaIds);
      if (!diff.change && !mediasChanges) return { ok: true, message: "Aucune modification.", donnees: { id } };
      // La date d'un contenu validé ou programmé relève du validateur (comme dans le calendrier).
      if ("programme_at" in diff.apres && ["valide", "programme"].includes(actuelle.publication.statut)) {
        if (!peut(ctx.role, "publier")) throw new Error("Changer la date d’un contenu validé est réservé aux validateurs.");
        if (actuelle.publication.statut === "programme") {
          const erreurDate = valeurs.programme_at ? verifierDateProgrammation(new Date(valeurs.programme_at)) : "Une publication programmée doit garder une date : annuler d’abord la programmation.";
          if (erreurDate) throw new Error(erreurDate);
        }
      }
      // Les médias font partie du contenu validé : leur modification annule la validation.
      const invaliderValidation = mediasChanges && ["a_valider", "valide", "programme", "echec"].includes(actuelle.publication.statut);
      const { error } = await admin
        .from("social_publications")
        .update({
          ...valeurs,
          modifie_par: ctx.email,
          ...(invaliderValidation ? { statut: "brouillon", approuve_par: null, approuve_par_id: null, approuve_at: null, empreinte_validee: null, soumis_at: null, soumis_par: null } : {}),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
      if (mediasChanges) await remplacerMedias(id, mediaIds);
      await journaliser(admin, { acteur: ctx, action: "publication_modifiee", publicationId: id, avant: { ...diff.avant, ...(mediasChanges ? { medias } : {}) }, apres: { ...diff.apres, ...(mediasChanges ? { medias: mediaIds } : {}) } });
    } else {
      const { data, error } = await admin
        .from("social_publications")
        .insert({ ...valeurs, statut: saisie.idee ? "idee" : "brouillon", cree_par: ctx.email, cree_par_id: ctx.utilisateurId, modifie_par: ctx.email })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Création impossible.");
      id = data.id as string;
      await remplacerMedias(id, mediaIds);
      await journaliser(admin, { acteur: ctx, action: "publication_creee", publicationId: id, apres: { ...valeurs, medias: mediaIds } });
    }
    rafraichir();
    return { ok: true, message: "Brouillon enregistré.", donnees: { id } };
  });
}

async function remplacerMedias(publicationId: string, mediaIds: string[]) {
  const admin = adminSocial();
  await admin.from("social_publication_medias").delete().eq("publication_id", publicationId);
  if (mediaIds.length) {
    const { error } = await admin.from("social_publication_medias").insert(mediaIds.map((media_id, ordre) => ({ publication_id: publicationId, media_id, ordre })));
    if (error) throw new Error(error.message);
  }
}

function erreursValidation(p: NonNullable<Awaited<ReturnType<typeof chargerPublication>>>) {
  const erreurs: string[] = [];
  if (p.publication.reseaux.length === 0) erreurs.push("Choisir au moins un réseau.");
  for (const reseau of p.publication.reseaux) {
    const v = validerContenu(reseau, {
      texte: texteDuReseau(p.publication, reseau),
      lienUrl: p.publication.lien_url,
      medias: p.medias.map((m) => ({ type: m.type, mimeType: m.mime_type, tailleOctets: Number(m.taille_octets), largeur: m.largeur, hauteur: m.hauteur, dureeSecondes: m.duree_secondes === null ? null : Number(m.duree_secondes) })),
    });
    erreurs.push(...v.erreurs.map((e) => `${LIBELLE_RESEAU[reseau]} : ${e}`));
  }
  return erreurs;
}

async function changerStatut(id: string, ctx: ContexteSocial, action: string, attendus: string[], maj: Partial<Publication> & Record<string, unknown>, details?: Record<string, unknown>) {
  const admin = adminSocial();
  const { data, error } = await admin.from("social_publications").update(maj).eq("id", id).in("statut", attendus).select("id,statut");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("La publication a changé entre-temps : recharger la page.");
  await journaliser(admin, { acteur: ctx, action, publicationId: id, apres: { statut: data[0].statut, ...maj }, details });
  rafraichir();
}

export async function soumettreAction(id: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("rediger");
    const p = await chargerPublication(adminSocial(), id);
    if (!p) throw new Error("Publication introuvable.");
    if (!transitionPossible(p.publication.statut, "soumettre")) throw new Error("Cette publication ne peut pas être soumise dans son état actuel.");
    const erreurs = erreursValidation(p);
    if (erreurs.length) throw new Error(erreurs.join(" "));
    await changerStatut(id, ctx, "publication_soumise", ["idee", "brouillon", "echec"], { statut: "a_valider", soumis_at: new Date().toISOString(), soumis_par: ctx.email });
    return { ok: true, message: "Soumise à validation." };
  });
}

export async function validerAction(id: string, commentaire: string): Promise<Resultat> {
  return executer(async () => {
    await exigerSocial("valider");
    const p = await chargerPublication(adminSocial(), id);
    if (!p) throw new Error("Publication introuvable.");
    if (!transitionPossible(p.publication.statut, "valider")) throw new Error("Seule une publication « À valider » peut être validée.");
    const erreurs = erreursValidation(p);
    if (erreurs.length) throw new Error(erreurs.join(" "));
    // L'empreinte fige le contenu exact validé (textes, réseaux, médias, lien).
    // La validation passe par la RPC sous le JWT de la personne qui valide : la
    // base impose AAL2, le rôle et l'état, fige son UID et journalise. Le
    // service_role ne peut pas poser une validation (trigger garde-fou).
    const supabase = await createClient();
    const { error } = await supabase.rpc("social_valider_publication", { p_publication_id: id, p_empreinte: empreinteDe(p), p_commentaire: commentaire.trim().slice(0, 1000) });
    if (error) throw new Error(error.message);
    rafraichir();
    return { ok: true, message: "Publication validée." };
  });
}

export async function refuserAction(id: string, motif: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("valider");
    if (!motif.trim()) throw new Error("Indiquer le motif du refus.");
    await changerStatut(id, ctx, "publication_refusee", ["a_valider", "valide", "programme"], { statut: "brouillon", approuve_par: null, approuve_par_id: null, approuve_at: null, empreinte_validee: null, commentaire_validation: motif.trim().slice(0, 1000) });
    return { ok: true, message: "Renvoyée en brouillon." };
  });
}

export async function programmerAction(id: string, dateIso: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("publier");
    const date = new Date(dateIso);
    const erreur = verifierDateProgrammation(date);
    if (erreur) throw new Error(erreur);
    const p = await chargerPublication(adminSocial(), id);
    if (!p) throw new Error("Publication introuvable.");
    if (p.publication.empreinte_validee !== empreinteDe(p)) throw new Error("Le contenu a changé depuis la validation.");
    await changerStatut(id, ctx, "publication_programmee", ["valide"], { statut: "programme", programme_at: date.toISOString() });
    return { ok: true, message: `Programmée le ${date.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.` };
  });
}

export async function deprogrammerAction(id: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("publier");
    await changerStatut(id, ctx, "programmation_annulee", ["programme"], { statut: "valide" });
    return { ok: true, message: "Programmation annulée." };
  });
}

export async function publierMaintenantAction(id: string, confirmation: boolean): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("publier");
    if (!confirmation) throw new Error("Confirmer explicitement la publication.");
    if (!(await consommerQuota(`publication:${ctx.utilisateurId}`, 20, 3600))) throw new Error("Limite de 20 publications par heure atteinte.");
    const admin = adminSocial();
    await journaliser(admin, { acteur: ctx, action: "publication_demandee", publicationId: id, details: { simulation: modeSimulation() } });
    await lancerPublication(admin, id, ctx);
    rafraichir();
    const p = await chargerPublication(admin, id);
    const bilan = (p?.cibles ?? []).map((c) => `${LIBELLE_RESEAU[c.reseau]} : ${c.statut === "simule" ? "simulé" : c.statut === "publie" ? "publié" : c.erreur ?? c.statut}`).join(" · ");
    return { ok: true, message: modeSimulation() ? `Simulation (dry-run) : rien n’a été publié. ${bilan}` : bilan };
  });
}

export async function relancerCibleAction(cibleId: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("publier");
    await relancerCible(adminSocial(), cibleId, ctx);
    rafraichir();
    return { ok: true, message: "Nouvelle tentative effectuée." };
  });
}

export async function annulerAction(id: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("rediger");
    const p = await chargerPublication(adminSocial(), id);
    if (!p) throw new Error("Publication introuvable.");
    // Annuler un contenu déjà validé est une décision de validateur.
    if (["valide", "programme"].includes(p.publication.statut) && !peut(ctx.role, "valider")) throw new Error("Seul un validateur peut annuler un contenu validé.");
    await changerStatut(id, ctx, "publication_annulee", ["idee", "brouillon", "a_valider", "valide", "programme"], { statut: "annule" });
    return { ok: true, message: "Publication annulée." };
  });
}

export async function remettreEnBrouillonAction(id: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("rediger");
    await changerStatut(id, ctx, "publication_remise_en_brouillon", ["idee", "annule", "echec"], { statut: "brouillon" });
    return { ok: true };
  });
}

export async function supprimerAction(id: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("rediger");
    const admin = adminSocial();
    const p = await chargerPublication(admin, id);
    if (!p) throw new Error("Publication introuvable.");
    if (!["idee", "brouillon", "annule"].includes(p.publication.statut) || p.cibles.some((c) => c.external_post_id)) throw new Error("Seules les idées, brouillons et publications annulées jamais envoyées peuvent être supprimés.");
    await admin.from("social_publications").delete().eq("id", id);
    await journaliser(admin, { acteur: ctx, action: "publication_supprimee", publicationId: id, avant: p.publication });
    rafraichir();
    return { ok: true, message: "Supprimée." };
  });
}

export async function deplacerCalendrierAction(id: string, dateIso: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("consulter");
    if (!peut(ctx.role, "planifier") && !peut(ctx.role, "publier")) throw new Error("Votre rôle ne permet pas de planifier.");
    const admin = adminSocial();
    const { data: p } = await admin.from("social_publications").select("statut,programme_at").eq("id", id).maybeSingle();
    if (!p) throw new Error("Publication introuvable.");
    const regle = deplacementCalendrier(p.statut);
    if (regle === "interdit") throw new Error("Une publication envoyée ne se déplace pas.");
    if (regle === "validateur" && !peut(ctx.role, "publier")) throw new Error("Déplacer un contenu validé est réservé aux validateurs.");
    const date = new Date(dateIso);
    if (p.statut === "programme") {
      const erreur = verifierDateProgrammation(date);
      if (erreur) throw new Error(erreur);
    } else if (Number.isNaN(date.getTime())) throw new Error("Date invalide.");
    await admin.from("social_publications").update({ programme_at: date.toISOString(), modifie_par: ctx.email }).eq("id", id);
    await journaliser(admin, { acteur: ctx, action: "publication_deplacee", publicationId: id, avant: { programme_at: p.programme_at }, apres: { programme_at: date.toISOString() } });
    rafraichir();
    return { ok: true };
  });
}

// ─────────────────────────────────────────────────────────────
// Médias
// ─────────────────────────────────────────────────────────────

export type SaisieMedia = { chemin: string; mime: string; nom: string; taille: number; largeur: number | null; hauteur: number | null; duree: number | null; texteAlternatif: string };

export async function finaliserMediaAction(m: SaisieMedia): Promise<Resultat<{ id: string; type: "image" | "video"; largeur: number | null; hauteur: number | null }>> {
  return executer(async () => {
    const ctx = await exigerSocial("televerser");
    if (!/^televersements\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov)$/.test(m.chemin)) throw new Error("Chemin de média invalide.");
    const erreur = validerTeleversement(m.mime, m.taille);
    if (erreur) throw new Error(erreur);
    const type = typeMedia(m.mime)!;
    const admin = adminSocial();
    const stockage = admin.storage.from(BUCKET_SOCIAL);
    let chemin = m.chemin;
    let mime = m.mime;
    let taille = m.taille;
    let largeur = m.largeur;
    let hauteur = m.hauteur;

    if (type === "image") {
      // Conversion JPEG (exigence Instagram), orientation EXIF appliquée, métadonnées retirées.
      const { data, error } = await stockage.download(m.chemin);
      if (error || !data) throw new Error("Fichier introuvable dans le stockage.");
      const { data: jpeg, info } = await sharp(Buffer.from(await data.arrayBuffer()))
        .rotate()
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      chemin = m.chemin.replace(/\.(png|webp|jpg)$/, ".jpg").replace("televersements/", "medias/");
      const envoi = await stockage.upload(chemin, jpeg, { contentType: "image/jpeg", upsert: false });
      if (envoi.error) throw new Error(envoi.error.message);
      await stockage.remove([m.chemin]);
      mime = "image/jpeg";
      taille = jpeg.byteLength;
      largeur = info.width;
      hauteur = info.height;
    }

    const { data, error } = await admin
      .from("social_medias")
      .insert({
        type,
        chemin_objet: chemin,
        mime_type: mime,
        nom_original: m.nom.slice(0, 200) || `media.${extension(mime)}`,
        taille_octets: taille,
        largeur: largeur && largeur > 0 ? Math.round(largeur) : null,
        hauteur: hauteur && hauteur > 0 ? Math.round(hauteur) : null,
        duree_secondes: type === "video" && m.duree && m.duree > 0 ? Math.round(m.duree * 100) / 100 : null,
        texte_alternatif: m.texteAlternatif.trim().slice(0, 1000) || null,
        cree_par: ctx.email,
        cree_par_id: ctx.utilisateurId,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Enregistrement du média impossible.");
    await journaliser(admin, { acteur: ctx, action: "media_televerse", objetId: data.id, details: { type, taille, largeur, hauteur } });
    return { ok: true, donnees: { id: data.id as string, type, largeur, hauteur } };
  });
}

export async function lienApercuMediaAction(mediaId: string): Promise<Resultat<{ url: string }>> {
  return executer(async () => {
    await exigerSocial("consulter");
    const admin = adminSocial();
    const { data: media } = await admin.from("social_medias").select("chemin_objet").eq("id", mediaId).maybeSingle();
    if (!media) throw new Error("Média introuvable.");
    const { data } = await admin.storage.from(BUCKET_SOCIAL).createSignedUrl(media.chemin_objet, 900);
    if (!data) throw new Error("Aperçu indisponible.");
    return { ok: true, donnees: { url: data.signedUrl } };
  });
}

// ─────────────────────────────────────────────────────────────
// Assistant Social ELSATIA (propositions uniquement)
// ─────────────────────────────────────────────────────────────

export async function genererVariantesAction(params: { texte: string; application: string; lien: string; reseaux: string[] }): Promise<Resultat<ia.Variantes>> {
  return executer(async () => {
    const ctx = await exigerSocial("rediger");
    await exigerQuotaIA(ctx);
    const v = await ia.genererVariantes({ texte: params.texte, application: params.application, lien: params.lien || null, reseaux: params.reseaux.filter(estReseau) });
    await journaliser(adminSocial(), { acteur: ctx, action: "ia_variantes" });
    return { ok: true, donnees: v };
  });
}

export async function transformerTexteAction(texte: string, reseau: string, operation: ia.OperationTexte): Promise<Resultat<{ texte: string }>> {
  return executer(async () => {
    const ctx = await exigerSocial("rediger");
    if (!estReseau(reseau)) throw new Error("Réseau inconnu.");
    if (!["reformuler", "raccourcir", "hashtags", "cta", "adapter"].includes(operation)) throw new Error("Opération inconnue.");
    await exigerQuotaIA(ctx);
    return { ok: true, donnees: { texte: await ia.transformerTexte(texte, reseau, operation) } };
  });
}

export async function proposerSujetsAction(consigne: string): Promise<Resultat<ia.SujetPropose[]>> {
  return executer(async () => {
    const ctx = await exigerSocial("rediger");
    await exigerQuotaIA(ctx);
    const admin = adminSocial();
    const { data: recentes } = await admin.from("social_publications").select("titre").order("created_at", { ascending: false }).limit(20);
    const meilleures = await meilleuresPublications(5);
    return { ok: true, donnees: await ia.proposerSujets({ publicationsRecentes: (recentes ?? []).map((r) => r.titre), meilleures: meilleures.map((m) => `${m.titre} (${m.resume})`), consigne }) };
  });
}

export async function genererCalendrierAction(debut: string, semaines: number, parSemaine: number, consigne: string): Promise<Resultat<ia.EntreeCalendrier[]>> {
  return executer(async () => {
    const ctx = await exigerSocial("planifier");
    await exigerQuotaIA(ctx);
    return { ok: true, donnees: await ia.genererCalendrier({ debut, semaines: Math.min(Math.max(1, semaines), 8), parSemaine: Math.min(Math.max(1, parSemaine), 7), consigne }) };
  });
}

/** Ajoute des idées au calendrier (jamais de brouillon validé automatiquement). */
export async function ajouterIdeesAction(idees: Array<{ titre: string; angle: string; application: string; reseaux: string[]; date: string | null }>): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("planifier");
    const admin = adminSocial();
    const lignes = idees.slice(0, 60).map((i) => ({
      titre: i.titre.trim().slice(0, 200) || "Idée",
      contenu_principal: i.angle.trim().slice(0, 2000),
      application: APPLICATIONS_ELSATIA.some((a) => a.cle === i.application) ? i.application : "elsatia",
      reseaux: i.reseaux.filter(estReseau),
      programme_at: i.date && !Number.isNaN(new Date(i.date).getTime()) ? new Date(i.date).toISOString() : null,
      statut: "idee",
      cree_par: ctx.email,
      cree_par_id: ctx.utilisateurId,
      modifie_par: ctx.email,
    }));
    const { error } = await admin.from("social_publications").insert(lignes);
    if (error) throw new Error(error.message);
    await journaliser(admin, { acteur: ctx, action: "idees_ajoutees", details: { nombre: lignes.length } });
    rafraichir();
    return { ok: true, message: `${lignes.length} idée(s) ajoutée(s) au calendrier.` };
  });
}

async function meilleuresPublications(limite: number) {
  const admin = adminSocial();
  const { data } = await admin.from("social_statistiques").select("publication_id,reseau,likes,commentaires,partages,clics,collecte_at,publication:social_publications(titre)").order("collecte_at", { ascending: false }).limit(500);
  const dernieres = new Map<string, { titre: string; score: number; resume: string }>();
  for (const s of data ?? []) {
    const cle = `${s.publication_id}:${s.reseau}`;
    if (dernieres.has(cle)) continue;
    const pub = Array.isArray(s.publication) ? s.publication[0] : s.publication;
    const score = Number(s.likes ?? 0) + 2 * Number(s.commentaires ?? 0) + 3 * Number(s.partages ?? 0);
    dernieres.set(cle, { titre: `${pub?.titre ?? "?"} — ${LIBELLE_RESEAU[s.reseau as Reseau]}`, score, resume: `${s.likes ?? "n/d"} j’aime, ${s.commentaires ?? "n/d"} commentaires, ${s.partages ?? "n/d"} partages` });
  }
  return [...dernieres.values()].sort((a, b) => b.score - a.score).slice(0, limite);
}

export async function analyserPerformancesAction(): Promise<Resultat<{ texte: string }>> {
  return executer(async () => {
    const ctx = await exigerSocial("consulter");
    if (!peut(ctx.role, "rediger") && !peut(ctx.role, "valider")) throw new Error("Rôle insuffisant.");
    await exigerQuotaIA(ctx);
    const meilleures = await meilleuresPublications(20);
    if (meilleures.length === 0) return { ok: true, donnees: { texte: "Pas encore de statistiques collectées : publier puis synchroniser avant d’analyser." } };
    return { ok: true, donnees: { texte: await ia.analyserPerformances(meilleures.map((m) => `${m.titre} : ${m.resume}`).join("\n")) } };
  });
}

// ─────────────────────────────────────────────────────────────
// Commentaires et messages : brouillon (IA ou humain) puis envoi validé
// ─────────────────────────────────────────────────────────────

export async function preparerReponseIAAction(type: "commentaire" | "message", id: string): Promise<Resultat<{ texte: string }>> {
  return executer(async () => {
    const ctx = await exigerSocial("preparer_reponse");
    await exigerQuotaIA(ctx);
    const admin = adminSocial();
    const table = type === "commentaire" ? "social_commentaires" : "social_messages";
    const { data: ligne } = await admin.from(table).select("*").eq("id", id).maybeSingle();
    if (!ligne) throw new Error("Élément introuvable.");
    let publication: string | null = null;
    if (type === "commentaire" && ligne.cible_id) {
      const { data: c } = await admin.from("social_publication_cibles").select("publication:social_publications(contenu_principal)").eq("id", ligne.cible_id).maybeSingle();
      const pub = Array.isArray(c?.publication) ? c?.publication[0] : c?.publication;
      publication = pub?.contenu_principal ?? null;
    }
    const texte = await ia.preparerReponse({ reseau: ligne.reseau, commentaire: ligne.contenu, auteur: ligne.auteur_nom, publication, prive: type === "message" });
    await admin.from(table).update({ brouillon_reponse: texte, brouillon_par: ctx.email, brouillon_ia: true, statut: "reponse_preparee" }).eq("id", id);
    await journaliser(admin, { acteur: ctx, action: `ia_reponse_${type}`, reseau: ligne.reseau, objetId: id });
    rafraichir();
    return { ok: true, donnees: { texte }, message: "Brouillon proposé : relire avant envoi." };
  });
}

export async function enregistrerBrouillonReponseAction(type: "commentaire" | "message", id: string, texte: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("preparer_reponse");
    const table = type === "commentaire" ? "social_commentaires" : "social_messages";
    await adminSocial().from(table).update({ brouillon_reponse: texte.trim().slice(0, 2000) || null, brouillon_par: ctx.email, brouillon_ia: false, statut: texte.trim() ? "reponse_preparee" : "lu" }).eq("id", id);
    rafraichir();
    return { ok: true, message: "Brouillon enregistré." };
  });
}

export async function ignorerAction(type: "commentaire" | "message", id: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("preparer_reponse");
    const table = type === "commentaire" ? "social_commentaires" : "social_messages";
    await adminSocial().from(table).update({ statut: "ignore" }).eq("id", id);
    await journaliser(adminSocial(), { acteur: ctx, action: `${type}_ignore`, objetId: id });
    rafraichir();
    return { ok: true };
  });
}

/** Envoi d'une réponse : validation humaine explicite (texte relu + confirmation). */
export async function envoyerReponseAction(type: "commentaire" | "message", id: string, texte: string, confirmation: boolean): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("envoyer_reponse");
    if (!confirmation) throw new Error("Confirmer l’envoi de la réponse.");
    const contenu = texte.trim();
    if (!contenu) throw new Error("Réponse vide.");
    if (!(await consommerQuota(`reponse:${ctx.utilisateurId}`, 60, 3600))) throw new Error("Limite de 60 réponses par heure atteinte.");
    const admin = adminSocial();
    const table = type === "commentaire" ? "social_commentaires" : "social_messages";
    const { data: ligne } = await admin.from(table).select("*").eq("id", id).maybeSingle();
    if (!ligne) throw new Error("Élément introuvable.");
    if (ligne.statut === "repondu") throw new Error("Une réponse a déjà été envoyée.");
    const { connecteur } = await connecteurPour(admin, ligne.reseau);

    let resultat;
    if (type === "commentaire") {
      if (!connecteur.capacites.reponseCommentaire.disponible) throw new Error(`${MESSAGE_NON_DISPONIBLE} : ${connecteur.capacites.reponseCommentaire.raison}`);
      resultat = await connecteur.replyToComment({ externalCommentId: ligne.external_comment_id, externalPostId: ligne.external_post_id }, contenu);
    } else {
      if (!connecteur.capacites.reponseMessage.disponible) throw new Error(`${MESSAGE_NON_DISPONIBLE} : ${connecteur.capacites.reponseMessage.raison}`);
      // Règle Meta : réponse standard uniquement dans les 24 h suivant le dernier message reçu.
      const { data: dernier } = await admin.from("social_messages").select("envoye_externe_at").eq("reseau", ligne.reseau).eq("external_conversation_id", ligne.external_conversation_id).eq("sens", "entrant").order("envoye_externe_at", { ascending: false }).limit(1).maybeSingle();
      const quand = dernier?.envoye_externe_at ? new Date(dernier.envoye_externe_at).getTime() : 0;
      if (Date.now() - quand > 24 * 3600_000) throw new Error("Fenêtre de 24 h dépassée : la plateforme n’autorise plus de réponse standard via API.");
      if (!ligne.auteur_external_id) throw new Error("Destinataire inconnu.");
      resultat = await connecteur.replyToMessage({ externalConversationId: ligne.external_conversation_id, auteurId: ligne.auteur_external_id }, contenu);
    }

    if (resultat.simule) {
      await journaliser(admin, { acteur: ctx, action: `reponse_${type}_simulee`, reseau: ligne.reseau, objetId: id, details: { texte: contenu } });
      return { ok: true, message: "Simulation (dry-run) : la réponse n’a pas été envoyée." };
    }
    await admin
      .from(table)
      .update({ statut: "repondu", brouillon_reponse: contenu, reponse_validee_par: ctx.email, reponse_validee_par_id: ctx.utilisateurId, reponse_envoyee_at: new Date().toISOString(), erreur: null, ...(type === "commentaire" ? { reponse_external_id: resultat.externalId } : {}) })
      .eq("id", id);
    await journaliser(admin, { acteur: ctx, action: `reponse_${type}_envoyee`, reseau: ligne.reseau, objetId: id, details: { texte: contenu, externalId: resultat.externalId } });
    rafraichir();
    return { ok: true, message: "Réponse envoyée." };
  });
}

export async function synchroniserAction(quoi: "statistiques" | "commentaires" | "messages"): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("synchroniser");
    if (!(await consommerQuota(`synchro:${quoi}`, 12, 3600))) throw new Error("Synchronisation trop fréquente : réessayer dans quelques minutes.");
    const admin = adminSocial();
    const bilan = quoi === "statistiques" ? await synchroniserStatistiques(admin) : quoi === "commentaires" ? await synchroniserCommentaires(admin) : await synchroniserMessages(admin);
    await journaliser(admin, { acteur: ctx, action: `synchronisation_${quoi}`, details: bilan });
    rafraichir();
    return { ok: true, message: Object.entries(bilan).map(([r, b]) => `${LIBELLE_RESEAU[r as Reseau]} : ${b}`).join(" · ") };
  });
}

// ─────────────────────────────────────────────────────────────
// Comptes connectés
// ─────────────────────────────────────────────────────────────

async function lireAttente(id: string, utilisateurId: string) {
  const { data } = await adminSocial().from("social_connexions_en_attente").select("*").eq("id", id).eq("cree_par_id", utilisateurId).gt("expire_at", new Date().toISOString()).maybeSingle();
  if (!data) throw new Error("Connexion expirée : recommencer.");
  return { fournisseur: data.fournisseur as "meta" | "linkedin", donnees: JSON.parse(dechiffrerSecret(data.donnees_chiffrees)) as ResultatOAuthMeta | (JetonsLinkedIn & { organisations: Array<{ id: string; nom: string }> }) };
}

/** Choix proposés après OAuth (aucun jeton renvoyé au navigateur). */
export async function choixConnexionAction(attenteId: string): Promise<Resultat<{ fournisseur: "meta" | "linkedin"; options: Array<{ id: string; nom: string; detail: string }>; scopes: string[] }>> {
  return executer(async () => {
    const ctx = await exigerSocial("gerer_comptes");
    const { fournisseur, donnees } = await lireAttente(attenteId, ctx.utilisateurId);
    const options =
      fournisseur === "meta"
        ? (donnees as ResultatOAuthMeta).pages.map((p) => ({ id: p.id, nom: p.nom, detail: p.instagram ? `Instagram lié : @${p.instagram.username ?? p.instagram.id}` : "Aucun compte Instagram professionnel lié" }))
        : (donnees as { organisations: Array<{ id: string; nom: string }> }).organisations.map((o) => ({ id: o.id, nom: o.nom, detail: `urn:li:organization:${o.id}` }));
    return { ok: true, donnees: { fournisseur, options, scopes: donnees.scopes } };
  });
}

export async function finaliserConnexionAction(attenteId: string, choixId: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("gerer_comptes");
    const admin = adminSocial();
    const { fournisseur, donnees } = await lireAttente(attenteId, ctx.utilisateurId);
    const connectes: string[] = [];
    const ids: string[] = [];
    if (fournisseur === "meta") {
      const d = donnees as ResultatOAuthMeta;
      const page = d.pages.find((p) => p.id === choixId);
      if (!page) throw new Error("Page introuvable.");
      // Jeton de Page dérivé d'un jeton longue durée : pas d'expiration fixe, mais
      // l'accès aux données expire (data_access_expires_at) sans reconnexion.
      const debug = await inspecterJetonMeta(page.jeton);
      ids.push(await enregistrerCompte(admin, { fournisseur: "meta", reseau: "facebook", nom_compte: page.nom, external_account_id: page.id, scopes: debug.scopes.length ? debug.scopes : d.scopes, token_expires_at: debug.expireAt, data_access_expires_at: debug.dataAccessExpireAt ?? d.dataAccessExpireAt, connecte_par: ctx.email, connecte_par_id: ctx.utilisateurId }, page.jeton, null));
      connectes.push(`Facebook « ${page.nom} »`);
      if (page.instagram) {
        ids.push(await enregistrerCompte(admin, { fournisseur: "meta", reseau: "instagram", nom_compte: page.instagram.nom ?? page.instagram.username ?? "Instagram", nom_utilisateur: page.instagram.username, external_account_id: page.instagram.id, external_parent_id: page.id, scopes: debug.scopes.length ? debug.scopes : d.scopes, token_expires_at: debug.expireAt, data_access_expires_at: debug.dataAccessExpireAt ?? d.dataAccessExpireAt, connecte_par: ctx.email, connecte_par_id: ctx.utilisateurId }, page.jeton, null));
        connectes.push(`Instagram @${page.instagram.username ?? page.instagram.id}`);
      }
    } else {
      const d = donnees as JetonsLinkedIn & { organisations: Array<{ id: string; nom: string }> };
      const org = d.organisations.find((o) => o.id === choixId);
      if (!org) throw new Error("Organisation introuvable.");
      ids.push(await enregistrerCompte(admin, { fournisseur: "linkedin", reseau: "linkedin", nom_compte: org.nom, external_account_id: org.id, scopes: d.scopes, token_expires_at: d.expireAt, refresh_expires_at: d.refreshExpireAt, connecte_par: ctx.email, connecte_par_id: ctx.utilisateurId }, d.jeton, d.refresh));
      connectes.push(`LinkedIn « ${org.nom} »`);
    }
    await admin.from("social_connexions_en_attente").delete().eq("id", attenteId);
    // Diagnostic immédiat en lecture seule : identité, ID externe, permissions, expiration.
    const bilans: string[] = [];
    for (const id of ids) {
      const { data: compte } = await admin.from("social_comptes").select("*").eq("id", id).maybeSingle();
      if (!compte) continue;
      try {
        const diagnostic = await diagnostiquerCompte(admin, compte);
        await admin.from("social_comptes").update({ dernier_diagnostic: diagnostic, derniere_verification_at: diagnostic.date }).eq("id", id);
        bilans.push(`${LIBELLE_RESEAU[compte.reseau as Reseau]} ${diagnostic.ok ? "✓" : "✕ (voir le diagnostic)"}`);
      } catch (e) {
        bilans.push(`${LIBELLE_RESEAU[compte.reseau as Reseau]} : diagnostic impossible (${e instanceof Error ? e.message : "erreur"})`);
      }
    }
    await journaliser(admin, { acteur: ctx, action: "compte_connecte", reseau: fournisseur, details: { comptes: connectes } });
    rafraichir();
    return { ok: true, message: `Connecté : ${connectes.join(", ")}. Diagnostic lecture seule : ${bilans.join(" · ") || "non exécuté"}.` };
  });
}

export async function verifierCompteAction(compteId: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("gerer_comptes");
    const admin = adminSocial();
    const { data: compte } = await admin.from("social_comptes").select("*").eq("id", compteId).maybeSingle();
    if (!compte) throw new Error("Compte introuvable.");
    const jeton = await jetonDuCompte(admin, compteId);
    const info = compte.fournisseur === "meta" ? await inspecterJetonMeta(jeton) : await inspecterJetonLinkedIn(jeton);
    const valide = "valide" in info ? info.valide : info.actif;
    await admin
      .from("social_comptes")
      .update({
        statut: valide ? "connecte" : "a_reconnecter",
        scopes: info.scopes.length ? info.scopes : compte.scopes,
        token_expires_at: info.expireAt,
        ...("dataAccessExpireAt" in info ? { data_access_expires_at: info.dataAccessExpireAt } : {}),
        derniere_verification_at: new Date().toISOString(),
        derniere_erreur: valide ? null : "Jeton invalide ou révoqué",
      })
      .eq("id", compteId);
    await journaliser(admin, { acteur: ctx, action: "compte_verifie", reseau: compte.reseau, objetId: compteId, details: { valide, scopes: info.scopes } });
    rafraichir();
    return valide ? { ok: true, message: `Jeton valide. Permissions : ${info.scopes.join(", ") || "non communiquées"}.` } : { ok: false, erreur: "Jeton invalide : reconnecter le compte." };
  });
}

export async function abonnerWebhooksAction(compteId: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("gerer_comptes");
    const admin = adminSocial();
    const { data: compte } = await admin.from("social_comptes").select("*").eq("id", compteId).maybeSingle();
    if (!compte || compte.reseau !== "facebook") throw new Error("L’abonnement s’effectue sur la Page Facebook (il couvre aussi l’Instagram lié).");
    if (!configMeta().webhookVerifyToken) throw new Error("META_WEBHOOK_VERIFY_TOKEN n’est pas configuré.");
    const jeton = await jetonDuCompte(admin, compteId);
    await abonnerWebhooksPage(compte.external_account_id, jeton, compte.scopes.includes("pages_messaging"));
    await journaliser(admin, { acteur: ctx, action: "webhooks_abonnes", reseau: "facebook", objetId: compteId });
    return { ok: true, message: "Page abonnée aux webhooks (feed" + (compte.scopes.includes("pages_messaging") ? ", messages" : "") + ")." };
  });
}

export async function revoquerCompteAction(compteId: string, confirmation: boolean): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("gerer_comptes");
    if (!confirmation) throw new Error("Confirmer la révocation.");
    const admin = adminSocial();
    const { data: compte } = await admin.from("social_comptes").select("*").eq("id", compteId).maybeSingle();
    if (!compte) throw new Error("Compte introuvable.");
    let distante = "non tentée";
    try {
      const jeton = await jetonDuCompte(admin, compteId);
      // Révoquer l'autorisation Meta coupe aussi l'Instagram lié (même jeton de Page).
      if (compte.fournisseur === "meta") await revoquerMeta(jeton);
      else await revoquerLinkedIn(jeton);
      distante = "effectuée";
    } catch (e) {
      distante = `échec : ${e instanceof Error ? e.message : "erreur"}`;
    }
    const lies = compte.fournisseur === "meta" ? (await admin.from("social_comptes").select("id").eq("fournisseur", "meta").neq("statut", "revoque")).data?.map((c) => c.id) ?? [compteId] : [compteId];
    await admin.from("social_identifiants").delete().in("compte_id", lies);
    await admin.from("social_comptes").update({ statut: "revoque" }).in("id", lies);
    await journaliser(admin, { acteur: ctx, action: "compte_revoque", reseau: compte.reseau, objetId: compteId, details: { revocation_distante: distante, comptes: lies } });
    rafraichir();
    return { ok: true, message: `Compte révoqué localement, jetons supprimés. Révocation chez la plateforme : ${distante}.` };
  });
}

export async function rechiffrerJetonsAction(): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("gerer_comptes");
    const total = await rechiffrerJetons(adminSocial());
    await journaliser(adminSocial(), { acteur: ctx, action: "jetons_rechiffres", details: { total } });
    return { ok: true, message: `${total} jeton(s) rechiffré(s) avec la clé courante.` };
  });
}

// ─────────────────────────────────────────────────────────────
// Équipe
// ─────────────────────────────────────────────────────────────

/**
 * Rôle ELSATIA Social d'un administrateur plateforme actif, désigné par son UID.
 * La RPC s'exécute sous le JWT de l'utilisateur : AAL2, rôle Administrateur,
 * cible active, interdiction de se retirer soi-même et journal sont imposés en base.
 */
export async function definirRoleAction(utilisateurId: string, role: string): Promise<Resultat> {
  return executer(async () => {
    await exigerSocial("gerer_equipe");
    if (!UUID_RE.test(utilisateurId)) throw new Error("Identifiant de membre invalide.");
    if (!estRoleSocial(role)) throw new Error("Rôle inconnu.");
    const supabase = await createClient();
    const { error } = await supabase.rpc("social_definir_role", { p_utilisateur_id: utilisateurId, p_role: role });
    if (error) throw new Error(error.message);
    rafraichir();
    return { ok: true, message: "Rôle enregistré." };
  });
}

// ─────────────────────────────────────────────────────────────
// Diagnostic en lecture seule (aucune écriture chez les plateformes)
// ─────────────────────────────────────────────────────────────

export async function diagnostiquerCompteAction(compteId: string): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("gerer_comptes");
    if (!(await consommerQuota(`diagnostic:${compteId}`, 10, 3600))) throw new Error("Diagnostic trop fréquent : réessayer plus tard.");
    const admin = adminSocial();
    const { data: compte } = await admin.from("social_comptes").select("*").eq("id", compteId).neq("statut", "revoque").maybeSingle();
    if (!compte) throw new Error("Compte introuvable.");
    const diagnostic = await diagnostiquerCompte(admin, compte);
    await admin
      .from("social_comptes")
      .update({
        dernier_diagnostic: diagnostic,
        derniere_verification_at: diagnostic.date,
        scopes: diagnostic.permissions.length ? diagnostic.permissions : compte.scopes,
        token_expires_at: diagnostic.expiration.jeton,
        ...(compte.fournisseur === "meta" ? { data_access_expires_at: diagnostic.expiration.accesDonnees } : {}),
        ...(diagnostic.ok ? { statut: "connecte", derniere_erreur: null } : {}),
      })
      .eq("id", compteId);
    await journaliser(admin, { acteur: ctx, action: "compte_diagnostique", reseau: compte.reseau, objetId: compteId, details: { ok: diagnostic.ok, etapes: diagnostic.etapes.map((e) => `${e.ok ? "✓" : "✕"} ${e.libelle}`) } });
    rafraichir();
    return diagnostic.ok ? { ok: true, message: "Diagnostic réussi (lectures uniquement)." } : { ok: false, erreur: `Diagnostic incomplet : ${diagnostic.etapes.filter((e) => !e.ok).map((e) => `${e.libelle} — ${e.detail}`).join(" ; ")}` };
  });
}

export async function testerApplicationMetaAction(): Promise<Resultat> {
  return executer(async () => {
    const ctx = await exigerSocial("gerer_comptes");
    const app = await verifierApplicationMeta();
    await journaliser(adminSocial(), { acteur: ctx, action: "application_meta_testee", reseau: "meta", details: { app: app.name ?? app.id } });
    return { ok: true, message: `Application Meta reconnue : « ${app.name ?? app.id} ». Identifiant et clé secrète cohérents.` };
  });
}
