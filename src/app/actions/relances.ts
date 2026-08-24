"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { chargerParametresRelances } from "@/lib/relances-config";
import {
  evaluerEligibiliteDevis,
  evaluerEligibiliteFacture,
  executerRelance,
  listerCandidatsAutoDevis,
  listerCandidatsAutoFactures,
  type CandidatRelance,
} from "@/lib/relances-moteur";
import { contenuEmailRelanceDevis, contenuEmailRelanceFacture } from "@/lib/relances-email";
import { PARAMETRES_RELANCES_DEFAUT, type TypeDocumentRelance } from "@/lib/relances";

function verifierPermissionParametres(permissions: string[] | null): boolean {
  return permissions === null || permissions.includes("gerer_parametres");
}
function verifierPermissionDocument(permissions: string[] | null, type: TypeDocumentRelance): boolean {
  if (permissions === null) return true;
  return permissions.includes(type === "devis" ? "gerer_devis" : "gerer_factures");
}

export async function enregistrerParametresRelancesAction(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!verifierPermissionParametres(permissions)) return { error: "Votre poste ne permet pas de modifier les paramètres." };

  const nombre = (cle: string, min: number, max: number, defaut: number) => {
    const v = Number(formData.get(cle));
    return Number.isFinite(v) && v >= min && v <= max ? v : defaut;
  };

  const valeurs = {
    entreprise_id: ctx.entrepriseId,
    devis_auto_actif: formData.get("devis_auto_actif") === "on",
    devis_delai_premiere_relance_jours: nombre("devis_delai_premiere_relance_jours", 1, 90, PARAMETRES_RELANCES_DEFAUT.devisDelaiPremiereRelanceJours),
    devis_delai_entre_relances_jours: nombre("devis_delai_entre_relances_jours", 1, 90, PARAMETRES_RELANCES_DEFAUT.devisDelaiEntreRelancesJours),
    devis_nombre_max_relances: nombre("devis_nombre_max_relances", 1, 5, PARAMETRES_RELANCES_DEFAUT.devisNombreMaxRelances),
    factures_auto_actif: formData.get("factures_auto_actif") === "on",
    factures_delai_premiere_relance_jours: nombre("factures_delai_premiere_relance_jours", 1, 90, PARAMETRES_RELANCES_DEFAUT.facturesDelaiPremiereRelanceJours),
    factures_delai_entre_relances_jours: nombre("factures_delai_entre_relances_jours", 1, 90, PARAMETRES_RELANCES_DEFAUT.facturesDelaiEntreRelancesJours),
    factures_nombre_max_relances: nombre("factures_nombre_max_relances", 1, 5, PARAMETRES_RELANCES_DEFAUT.facturesNombreMaxRelances),
    envoyer_weekend: formData.get("envoyer_weekend") === "on",
    pause_jusqu_au: (() => { const v = String(formData.get("pause_jusqu_au") ?? "").trim(); return v || null; })(),
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  };

  const { error } = await supabase.from("parametres_relances").upsert(valeurs, { onConflict: "entreprise_id" });
  if (error) return { error: messageErreurUtilisateur("enregistrerParametresRelancesAction", error, "Impossible d'enregistrer ces paramètres.") };

  revalidatePath("/parametres/relances");
  return { ok: true };
}

// §11 : première activation — un résumé est déjà affiché côté client avant l'appel (voir la
// page), cette action ne fait qu'enregistrer ce que l'admin a explicitement confirmé. Aucun
// envoi immédiat : le prochain passage du cron (ou une relance manuelle) est seul à écrire
// dans relances_documents.
export async function activerRelancesAutoAction(volet: "devis" | "factures"): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!verifierPermissionParametres(permissions)) return { error: "Votre poste ne permet pas de modifier les paramètres." };

  const config = await chargerParametresRelances(supabase, ctx.entrepriseId);
  const valeurs = {
    entreprise_id: ctx.entrepriseId,
    devis_auto_actif: volet === "devis" ? true : config.devisAutoActif,
    devis_delai_premiere_relance_jours: config.devisDelaiPremiereRelanceJours,
    devis_delai_entre_relances_jours: config.devisDelaiEntreRelancesJours,
    devis_nombre_max_relances: config.devisNombreMaxRelances,
    factures_auto_actif: volet === "factures" ? true : config.facturesAutoActif,
    factures_delai_premiere_relance_jours: config.facturesDelaiPremiereRelanceJours,
    factures_delai_entre_relances_jours: config.facturesDelaiEntreRelancesJours,
    factures_nombre_max_relances: config.facturesNombreMaxRelances,
    envoyer_weekend: config.envoyerWeekend,
    pause_jusqu_au: config.pauseJusquAu,
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  };
  const { error } = await supabase.from("parametres_relances").upsert(valeurs, { onConflict: "entreprise_id" });
  if (error) return { error: messageErreurUtilisateur("activerRelancesAutoAction", error, "Impossible d'activer les relances automatiques.") };

  revalidatePath("/parametres/relances");
  return { ok: true };
}

export async function desactiverRelancesAutoAction(volet: "devis" | "factures"): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!verifierPermissionParametres(permissions)) return { error: "Votre poste ne permet pas de modifier les paramètres." };

  const champ = volet === "devis" ? "devis_auto_actif" : "factures_auto_actif";
  const { error } = await supabase.from("parametres_relances").update({ [champ]: false, updated_at: new Date().toISOString(), updated_by: ctx.userId }).eq("entreprise_id", ctx.entrepriseId);
  if (error) return { error: messageErreurUtilisateur("desactiverRelancesAutoAction", error, "Impossible de désactiver.") };

  revalidatePath("/parametres/relances");
  return { ok: true };
}

// §12 : simulation pure lecture — aucune écriture, aucun envoi. Réutilise le même moteur que
// le cron réel (listerCandidatsAutoDevis/Factures), donc ce qui est affiché ici est
// exactement ce qui partirait au prochain passage du cron.
export type LigneSimulation = { candidat: CandidatRelance; sujet: string };
export async function simulerRelancesAction(): Promise<{ error: string } | { ok: true; lignes: LigneSimulation[] }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!verifierPermissionParametres(permissions)) return { error: "Votre poste ne permet pas de voir cette simulation." };

  const config = await chargerParametresRelances(supabase, ctx.entrepriseId);
  const aujourdhui = new Date();
  const [devisResultat, facturesResultat] = await Promise.all([
    listerCandidatsAutoDevis(supabase, ctx.entrepriseId, config, aujourdhui),
    listerCandidatsAutoFactures(supabase, ctx.entrepriseId, config, aujourdhui),
  ]);
  const lignes: LigneSimulation[] = [...devisResultat.candidats, ...facturesResultat.candidats].map((candidat) => {
    const contenu =
      candidat.typeDocument === "devis"
        ? contenuEmailRelanceDevis({ numero: candidat.numero, client: { nom: null, prenom: null, societe: candidat.clientNom, email: candidat.clientEmail }, montantTtc: candidat.montant, dateEmission: candidat.dateReference, entrepriseNom: ctx.entrepriseNom, prenomEmetteur: ctx.prenom, niveau: candidat.niveau, nombreMax: config.devisNombreMaxRelances })
        : contenuEmailRelanceFacture({ numero: candidat.numero, client: { nom: null, prenom: null, societe: candidat.clientNom, email: candidat.clientEmail }, resteAPayer: candidat.montant, dateEcheance: candidat.dateReference, entrepriseNom: ctx.entrepriseNom, prenomEmetteur: ctx.prenom, niveau: candidat.niveau, nombreMax: config.facturesNombreMaxRelances });
    return { candidat, sujet: contenu?.sujet ?? "" };
  });
  return { ok: true, lignes };
}

// Relance manuelle, déclenchée depuis la fiche devis/facture. Passe par exactement le même
// moteur (evaluerEligibilite*/executerRelance) que le cron — seule différence : automatique:false
// et declenchePar renseigné, et l'exclusion auto-only (relance_auto_exclue) n'est pas
// appliquée ici (un document exclu de l'auto reste relançable manuellement, à la demande).
export async function relancerDocumentManuellementAction(
  typeDocument: TypeDocumentRelance,
  documentId: string,
): Promise<{ error: string } | { ok: true; niveau: number }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!verifierPermissionDocument(permissions, typeDocument)) return { error: "Votre poste ne permet pas d'envoyer de relance." };

  const config = await chargerParametresRelances(supabase, ctx.entrepriseId);
  const resultat =
    typeDocument === "devis"
      ? await evaluerEligibiliteDevis(supabase, ctx.entrepriseId, documentId, config, { pourAuto: false })
      : await evaluerEligibiliteFacture(supabase, ctx.entrepriseId, documentId, config, { pourAuto: false });
  if (!resultat.eligible) return { error: resultat.motif };

  const execution = await executerRelance(supabase, ctx.entrepriseId, config, resultat.candidat, {
    automatique: false,
    declenchePar: ctx.userId,
    entrepriseNom: ctx.entrepriseNom,
    prenomEmetteur: ctx.prenom,
  });
  if (execution.statut === "envoyee") {
    revalidatePath(`/${typeDocument === "devis" ? "devis" : "factures"}/${documentId}`);
    return { ok: true, niveau: resultat.candidat.niveau };
  }
  if (execution.statut === "deja_en_cours") return { error: "Une relance est déjà en cours pour ce document." };
  return { error: "motif" in execution ? execution.motif : "La relance n'a pas pu être envoyée. Réessayez." };
}

export async function exclureRelanceAutoDocumentAction(typeDocument: TypeDocumentRelance, documentId: string, exclure: boolean): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!verifierPermissionDocument(permissions, typeDocument)) return { error: "Votre poste ne permet pas cette action." };

  const table = typeDocument === "devis" ? "devis" : "factures";
  const { error } = await supabase.from(table).update({ relance_auto_exclue: exclure }).eq("id", documentId).eq("entreprise_id", ctx.entrepriseId);
  if (error) return { error: messageErreurUtilisateur("exclureRelanceAutoDocumentAction", error, "Impossible de modifier ce réglage.") };

  revalidatePath(`/${table}/${documentId}`);
  return { ok: true };
}

export async function exclureRelanceAutoClientAction(clientId: string, exclure: boolean): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!(permissions === null || permissions.includes("gerer_clients"))) return { error: "Votre poste ne permet pas cette action." };

  const { error } = await supabase.from("clients").update({ relance_auto_exclue: exclure }).eq("id", clientId).eq("entreprise_id", ctx.entrepriseId);
  if (error) return { error: messageErreurUtilisateur("exclureRelanceAutoClientAction", error, "Impossible de modifier ce réglage.") };

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

// §57 : uniquement vers l'adresse du compte connecté — jamais un client réel.
export async function envoyerEmailTestRelanceAction(typeDocument: TypeDocumentRelance): Promise<{ error: string } | { ok: true }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!verifierPermissionParametres(permissions)) return { error: "Votre poste ne permet pas cette action." };

  const { data: auth } = await supabase.auth.getUser();
  const adresseControlee = auth?.user?.email;
  if (!adresseControlee) return { error: "Votre compte n'a pas d'adresse e-mail." };

  const { brevoEstConfigure, envoyerEmailBrevo } = await import("@/lib/brevo");
  const { corpsHtmlEmailDocument } = await import("@/lib/email");
  if (!brevoEstConfigure()) return { error: "L'envoi d'e-mail n'est pas configuré dans cet environnement." };

  const contenu =
    typeDocument === "devis"
      ? contenuEmailRelanceDevis({ numero: "DEV-TEST-0001", client: { nom: null, prenom: ctx.prenom, societe: null, email: adresseControlee }, montantTtc: 1234.56, dateEmission: new Date().toISOString().slice(0, 10), entrepriseNom: ctx.entrepriseNom, prenomEmetteur: ctx.prenom, niveau: 1, nombreMax: 2 })
      : contenuEmailRelanceFacture({ numero: "FAC-TEST-0001", client: { nom: null, prenom: ctx.prenom, societe: null, email: adresseControlee }, resteAPayer: 1234.56, dateEcheance: new Date().toISOString().slice(0, 10), entrepriseNom: ctx.entrepriseNom, prenomEmetteur: ctx.prenom, niveau: 1, nombreMax: 3 });
  if (!contenu) return { error: "Adresse e-mail invalide." };

  try {
    await envoyerEmailBrevo({
      to: contenu.to,
      toName: ctx.prenom,
      sujet: `[TEST] ${contenu.sujet}`,
      texte: `Ceci est un e-mail de test — aucun document réel n'est concerné.\n\n${contenu.corps}`,
      html: corpsHtmlEmailDocument(`Ceci est un e-mail de test — aucun document réel n'est concerné.\n\n${contenu.corps}`, null),
    });
  } catch (erreur) {
    return { error: messageErreurUtilisateur("envoyerEmailTestRelanceAction", erreur, "L'e-mail de test n'a pas pu être envoyé.") };
  }
  return { ok: true };
}
