// RELANCES-AUTO-V1 : moteur d'éligibilité et d'exécution UNIQUE, partagé par la relance
// manuelle (Server Action), la relance automatique (cron) et la simulation (§5 — "les deux
// [manuel et auto] doivent utiliser le même moteur métier d'éligibilité, pas deux règles
// différentes"). Aucune logique d'éligibilité ne doit exister ailleurs dans le code.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brevoEstConfigure, envoyerEmailBrevo } from "@/lib/brevo";
import { corpsHtmlEmailDocument } from "@/lib/email";
import { contenuEmailRelanceDevis, contenuEmailRelanceFacture } from "@/lib/relances-email";
import { obtenirNouveauTokenPartage, urlDocumentPartage } from "@/lib/documents-partage";
import { resteAPayerFacture } from "@/lib/factures";
import { estEnPause, estWeekend, type ParametresRelances, type TypeDocumentRelance } from "@/lib/relances";

export type CandidatRelance = {
  typeDocument: TypeDocumentRelance;
  documentId: string;
  entrepriseId: string;
  numero: string | null;
  niveau: number;
  clientNom: string;
  clientEmail: string;
  montant: number;
  dateReference: string | null; // date_emission (devis) ou date_echeance (facture)
};

export type Ineligibilite = { typeDocument: TypeDocumentRelance; documentId: string; motif: string };

type LigneDevisEligibilite = {
  id: string;
  entreprise_id: string;
  numero: string | null;
  statut: string;
  date_emission: string;
  montant_ttc: number;
  relance_auto_exclue: boolean;
  client_id: string;
  client: { nom: string | null; prenom: string | null; societe: string | null; email: string | null; relance_auto_exclue: boolean } | null;
};

type LigneFactureEligibilite = {
  id: string;
  entreprise_id: string;
  numero: string | null;
  statut: string;
  date_echeance: string | null;
  montant_ttc: number;
  montant_paye: number;
  relance_auto_exclue: boolean;
  client_id: string;
  client: { nom: string | null; prenom: string | null; societe: string | null; email: string | null; relance_auto_exclue: boolean } | null;
};

function normaliserClient(brut: unknown): { nom: string | null; prenom: string | null; societe: string | null; email: string | null; relance_auto_exclue: boolean } | null {
  const c = Array.isArray(brut) ? brut[0] : brut;
  return (c as ReturnType<typeof normaliserClient>) ?? null;
}

function nomAffiche(client: { nom: string | null; prenom: string | null; societe: string | null } | null): string {
  if (!client) return "Client";
  return client.societe || [client.prenom, client.nom].filter(Boolean).join(" ") || "Client";
}

async function niveauSuivant(supabase: SupabaseClient, typeDocument: TypeDocumentRelance, documentId: string): Promise<number> {
  const { count } = await supabase
    .from("relances_documents")
    .select("id", { count: "exact", head: true })
    .eq("type_document", typeDocument)
    .eq("document_id", documentId)
    .eq("statut", "envoyee");
  return (count ?? 0) + 1;
}

async function dateDerniereRelanceEnvoyee(supabase: SupabaseClient, typeDocument: TypeDocumentRelance, documentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("relances_documents")
    .select("date_envoi")
    .eq("type_document", typeDocument)
    .eq("document_id", documentId)
    .eq("statut", "envoyee")
    .order("date_envoi", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.date_envoi ?? null;
}

function joursDepuis(dateIso: string, aujourdhui: Date): number {
  const debut = new Date(dateIso).getTime();
  return Math.floor((aujourdhui.getTime() - debut) / (24 * 3600 * 1000));
}

// §6 : statuts réels audités (src/lib/devis.ts, TRANSITIONS_DEVIS). Un devis "expire" est un
// état atteignable depuis "envoye" mais distinct — relancer un devis déjà expiré n'a pas de
// sens métier (le client ne peut plus l'accepter tel quel) : décision volontaire de ne PAS le
// considérer éligible, plutôt que d'inventer une règle de relance sur devis expiré non prévue
// ailleurs dans le produit. Seul "envoye" est éligible.
export async function evaluerEligibiliteDevis(
  supabase: SupabaseClient,
  entrepriseId: string,
  devisId: string,
  config: ParametresRelances,
  opts: { pourAuto: boolean; aujourdhui?: Date },
): Promise<{ eligible: true; candidat: CandidatRelance } | { eligible: false; motif: string }> {
  const aujourdhui = opts.aujourdhui ?? new Date();
  const { data } = await supabase
    .from("devis")
    .select("id, entreprise_id, numero, statut, date_emission, montant_ttc, relance_auto_exclue, client_id, client:clients!devis_client_id_fkey(nom, prenom, societe, email, relance_auto_exclue)")
    .eq("id", devisId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  if (!data) return { eligible: false, motif: "Devis introuvable" };
  const devis = data as unknown as LigneDevisEligibilite;
  const client = normaliserClient(devis.client);

  if (devis.statut !== "envoye") return { eligible: false, motif: `Statut "${devis.statut}" non éligible (seul "envoyé" l'est)` };
  if (opts.pourAuto && devis.relance_auto_exclue) return { eligible: false, motif: "Relance automatique exclue sur ce devis" };
  if (opts.pourAuto && client?.relance_auto_exclue) return { eligible: false, motif: "Relance automatique exclue pour ce client" };
  if (!client?.email?.trim()) return { eligible: false, motif: "Aucune adresse e-mail client" };

  const niveau = await niveauSuivant(supabase, "devis", devisId);
  if (niveau > config.devisNombreMaxRelances) return { eligible: false, motif: "Nombre maximum de relances déjà atteint" };

  const derniereRelance = await dateDerniereRelanceEnvoyee(supabase, "devis", devisId);
  const delaiRequis = derniereRelance ? config.devisDelaiEntreRelancesJours : config.devisDelaiPremiereRelanceJours;
  const dateReference = derniereRelance ?? devis.date_emission;
  if (joursDepuis(dateReference, aujourdhui) < delaiRequis) return { eligible: false, motif: "Délai avant relance pas encore écoulé" };

  if (opts.pourAuto) {
    if (estEnPause(config, aujourdhui)) return { eligible: false, motif: "Relances automatiques en pause pour cette entreprise" };
    if (!config.envoyerWeekend && estWeekend(aujourdhui)) return { eligible: false, motif: "Envoi le week-end désactivé" };
  }

  return {
    eligible: true,
    candidat: {
      typeDocument: "devis",
      documentId: devis.id,
      entrepriseId: devis.entreprise_id,
      numero: devis.numero,
      niveau,
      clientNom: nomAffiche(client),
      clientEmail: client.email.trim(),
      montant: Number(devis.montant_ttc),
      dateReference: devis.date_emission,
    },
  };
}

// §7 : statuts réels audités (src/lib/factures.ts). "en_retard" n'est recalculé qu'à chaque
// mouvement de règlement (trigger recalc_paiements_facture), pas par un job quotidien — une
// facture réellement en retard peut donc rester affichée "envoyee" en base tant qu'aucun
// paiement n'a bougé. L'éligibilité calcule donc le retard elle-même à partir de
// date_echeance, plutôt que de faire confiance au seul statut stocké.
export async function evaluerEligibiliteFacture(
  supabase: SupabaseClient,
  entrepriseId: string,
  factureId: string,
  config: ParametresRelances,
  opts: { pourAuto: boolean; aujourdhui?: Date },
): Promise<{ eligible: true; candidat: CandidatRelance } | { eligible: false; motif: string }> {
  const aujourdhui = opts.aujourdhui ?? new Date();
  const { data } = await supabase
    .from("factures")
    .select("id, entreprise_id, numero, statut, date_echeance, montant_ttc, montant_paye, relance_auto_exclue, client_id, client:clients!factures_client_id_fkey(nom, prenom, societe, email, relance_auto_exclue)")
    .eq("id", factureId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  if (!data) return { eligible: false, motif: "Facture introuvable" };
  const facture = data as unknown as LigneFactureEligibilite;
  const client = normaliserClient(facture.client);

  if (!["envoyee", "en_retard", "payee_partiel"].includes(facture.statut)) {
    return { eligible: false, motif: `Statut "${facture.statut}" non éligible` };
  }
  if (!facture.date_echeance) return { eligible: false, motif: "Aucune date d'échéance" };
  if (facture.date_echeance >= aujourdhui.toISOString().slice(0, 10)) return { eligible: false, motif: "Échéance pas encore dépassée" };

  const reste = resteAPayerFacture(facture);
  if (reste <= 0) return { eligible: false, motif: "Facture soldée" };
  if (opts.pourAuto && facture.relance_auto_exclue) return { eligible: false, motif: "Relance automatique exclue sur cette facture" };
  if (opts.pourAuto && client?.relance_auto_exclue) return { eligible: false, motif: "Relance automatique exclue pour ce client" };
  if (!client?.email?.trim()) return { eligible: false, motif: "Aucune adresse e-mail client" };

  const niveau = await niveauSuivant(supabase, "facture", factureId);
  if (niveau > config.facturesNombreMaxRelances) return { eligible: false, motif: "Nombre maximum de relances déjà atteint" };

  const derniereRelance = await dateDerniereRelanceEnvoyee(supabase, "facture", factureId);
  const delaiRequis = derniereRelance ? config.facturesDelaiEntreRelancesJours : config.facturesDelaiPremiereRelanceJours;
  const dateReference = derniereRelance ?? facture.date_echeance;
  if (joursDepuis(dateReference, aujourdhui) < delaiRequis) return { eligible: false, motif: "Délai avant relance pas encore écoulé" };

  if (opts.pourAuto) {
    if (estEnPause(config, aujourdhui)) return { eligible: false, motif: "Relances automatiques en pause pour cette entreprise" };
    if (!config.envoyerWeekend && estWeekend(aujourdhui)) return { eligible: false, motif: "Envoi le week-end désactivé" };
  }

  return {
    eligible: true,
    candidat: {
      typeDocument: "facture",
      documentId: facture.id,
      entrepriseId: facture.entreprise_id,
      numero: facture.numero,
      niveau,
      clientNom: nomAffiche(client),
      clientEmail: client.email.trim(),
      montant: reste,
      dateReference: facture.date_echeance,
    },
  };
}

// §44 : plafond de lot volontairement bas pour ce lancement V1 (documenté), pas d'architecture
// de file d'attente — voir docs/commercial/RELANCES_AUTO_V1.md.
const PLAFOND_CANDIDATS_PAR_TYPE = 200;

export async function listerCandidatsAutoDevis(
  supabase: SupabaseClient,
  entrepriseId: string,
  config: ParametresRelances,
  aujourdhui: Date,
): Promise<{ candidats: CandidatRelance[]; ineligibles: Ineligibilite[] }> {
  const { data } = await supabase
    .from("devis")
    .select("id")
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "envoye")
    .eq("relance_auto_exclue", false)
    .limit(PLAFOND_CANDIDATS_PAR_TYPE);
  const candidats: CandidatRelance[] = [];
  const ineligibles: Ineligibilite[] = [];
  for (const ligne of data ?? []) {
    const resultat = await evaluerEligibiliteDevis(supabase, entrepriseId, ligne.id, config, { pourAuto: true, aujourdhui });
    if (resultat.eligible) candidats.push(resultat.candidat);
    else ineligibles.push({ typeDocument: "devis", documentId: ligne.id, motif: resultat.motif });
  }
  return { candidats, ineligibles };
}

export async function listerCandidatsAutoFactures(
  supabase: SupabaseClient,
  entrepriseId: string,
  config: ParametresRelances,
  aujourdhui: Date,
): Promise<{ candidats: CandidatRelance[]; ineligibles: Ineligibilite[] }> {
  const { data } = await supabase
    .from("factures")
    .select("id")
    .eq("entreprise_id", entrepriseId)
    .in("statut", ["envoyee", "en_retard", "payee_partiel"])
    .eq("relance_auto_exclue", false)
    .limit(PLAFOND_CANDIDATS_PAR_TYPE);
  const candidats: CandidatRelance[] = [];
  const ineligibles: Ineligibilite[] = [];
  for (const ligne of data ?? []) {
    const resultat = await evaluerEligibiliteFacture(supabase, entrepriseId, ligne.id, config, { pourAuto: true, aujourdhui });
    if (resultat.eligible) candidats.push(resultat.candidat);
    else ineligibles.push({ typeDocument: "facture", documentId: ligne.id, motif: resultat.motif });
  }
  return { candidats, ineligibles };
}

export type ResultatExecutionRelance =
  | { statut: "envoyee"; candidat: CandidatRelance }
  | { statut: "ignoree"; candidat: CandidatRelance; motif: string }
  | { statut: "echec"; candidat: CandidatRelance; motif: string }
  | { statut: "deja_en_cours"; candidat: CandidatRelance };

// Exécute réellement UNE relance pour un candidat déjà jugé éligible par
// evaluerEligibiliteDevis/Facture — réclame le verrou (RPC relance_reclamer), revalide juste
// avant l'envoi (§23-25 : le document a pu changer entre la sélection et maintenant), envoie
// via Brevo si toujours éligible, puis finalise (RPC relance_finaliser). Utilisée à
// l'identique par la relance manuelle et par le cron.
export async function executerRelance(
  supabase: SupabaseClient,
  entrepriseId: string,
  config: ParametresRelances,
  candidat: CandidatRelance,
  opts: { automatique: boolean; declenchePar: string | null; entrepriseNom: string; prenomEmetteur: string | null; aujourdhui?: Date },
): Promise<ResultatExecutionRelance> {
  const contenu =
    candidat.typeDocument === "devis"
      ? contenuEmailRelanceDevis({
          numero: candidat.numero,
          client: { nom: null, prenom: null, societe: candidat.clientNom, email: candidat.clientEmail },
          montantTtc: candidat.montant,
          dateEmission: candidat.dateReference,
          entrepriseNom: opts.entrepriseNom,
          prenomEmetteur: opts.prenomEmetteur,
          niveau: candidat.niveau,
          nombreMax: config.devisNombreMaxRelances,
        })
      : contenuEmailRelanceFacture({
          numero: candidat.numero,
          client: { nom: null, prenom: null, societe: candidat.clientNom, email: candidat.clientEmail },
          resteAPayer: candidat.montant,
          dateEcheance: candidat.dateReference,
          entrepriseNom: opts.entrepriseNom,
          prenomEmetteur: opts.prenomEmetteur,
          niveau: candidat.niveau,
          nombreMax: config.facturesNombreMaxRelances,
        });
  if (!contenu) return { statut: "echec", candidat, motif: "Adresse e-mail invalide" };

  const { data: idReclame, error: erreurReclamation } = await supabase.rpc("relance_reclamer", {
    p_entreprise_id: entrepriseId,
    p_type_document: candidat.typeDocument,
    p_document_id: candidat.documentId,
    p_niveau: candidat.niveau,
    p_destinataire: contenu.to,
    p_sujet: contenu.sujet,
    p_automatique: opts.automatique,
    p_declenche_par: opts.declenchePar,
  });
  if (erreurReclamation || !idReclame) return { statut: "deja_en_cours", candidat };

  // §23-25 : revalidation juste avant l'envoi — le document a pu changer entre la sélection
  // (evaluerEligibilite*, potentiellement plusieurs secondes/minutes plus tôt dans un batch)
  // et maintenant.
  const revalidation =
    candidat.typeDocument === "devis"
      ? await evaluerEligibiliteDevis(supabase, entrepriseId, candidat.documentId, config, { pourAuto: opts.automatique, aujourdhui: opts.aujourdhui })
      : await evaluerEligibiliteFacture(supabase, entrepriseId, candidat.documentId, config, { pourAuto: opts.automatique, aujourdhui: opts.aujourdhui });
  if (!revalidation.eligible) {
    await supabase.rpc("relance_finaliser", { p_id: idReclame, p_statut: "ignoree", p_provider_message_id: null, p_erreur_public_safe: null, p_motif: revalidation.motif });
    return { statut: "ignoree", candidat, motif: revalidation.motif };
  }

  if (!brevoEstConfigure()) {
    await supabase.rpc("relance_finaliser", { p_id: idReclame, p_statut: "echec", p_provider_message_id: null, p_erreur_public_safe: "Envoi e-mail non configuré", p_motif: null });
    return { statut: "echec", candidat, motif: "Envoi e-mail non configuré" };
  }

  let messageId: string | null = null;
  try {
    let lien: string | null = null;
    try {
      const token = await obtenirNouveauTokenPartage(supabase, {
        entrepriseId,
        typeDocument: candidat.typeDocument,
        documentId: candidat.documentId,
        creePar: opts.declenchePar ?? entrepriseId,
      });
      lien = urlDocumentPartage(token);
    } catch {
      lien = null; // Le lien est un plus, pas un pré-requis : l'email de relance reste utile sans.
    }
    const resultat = await envoyerEmailBrevo({
      to: contenu.to,
      toName: candidat.clientNom,
      sujet: contenu.sujet,
      texte: contenu.corps,
      html: corpsHtmlEmailDocument(contenu.corps, lien),
    });
    messageId = resultat.messageId;
  } catch (erreur) {
    const messageSurUtilisateur = erreur instanceof Error ? erreur.message : "Envoi impossible";
    await supabase.rpc("relance_finaliser", { p_id: idReclame, p_statut: "echec", p_provider_message_id: null, p_erreur_public_safe: messageSurUtilisateur, p_motif: null });
    return { statut: "echec", candidat, motif: messageSurUtilisateur };
  }

  await supabase.rpc("relance_finaliser", { p_id: idReclame, p_statut: "envoyee", p_provider_message_id: messageId, p_erreur_public_safe: null, p_motif: null });
  return { statut: "envoyee", candidat };
}
