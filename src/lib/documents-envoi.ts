import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brevoEstConfigure, envoyerEmailBrevo } from "@/lib/brevo";
import { contenuEmailDocument, corpsHtmlEmailDocument } from "@/lib/email";
import { chargerDonneesDevisImprimable, chargerDonneesFactureImprimable } from "@/lib/documents-commerciaux";
import { genererPdfDepuisHtml, genererPdfDepuisUrl, nomFichierPdf } from "@/lib/pdf/generer";
import { adresseRemisePlausible } from "@/lib/document-resend-override";
import { echapperHtml } from "@/lib/brevo";
import { chargerRenduDocument, moteurDeReponse } from "@/lib/devis/v2-serveur";
import { obtenirNouveauTokenPartage, urlDocumentPartage, urlImpressionPartage } from "@/lib/documents-partage";
import {
  construireEntreeJournalSurcharge,
  resoudreDestinataireEnvoi,
  type SurchargeDestinataire,
} from "@/lib/document-resend-override";

// Au-delà de cette taille, on n'attache plus le PDF (l'e-mail resterait
// bloqué par Brevo) : le lien sécurisé /document/[token] reste toujours
// présent et suffit à consulter/télécharger le document.
const TAILLE_MAX_PIECE_JOINTE_OCTETS = 8 * 1024 * 1024;

type TypeDocument = "devis" | "facture";

/**
 * Options d'envoi (GP V1, lot G) : copies, objet et message (issus d'un modèle ou saisis), CGV de
 * l'entreprise en pièce jointe, pièces complémentaires prises dans les documents du chantier.
 * Chaque envoi — réussi ou refusé par le transport — est consigné (`documents_envois`, historique).
 */
export type OptionsEnvoiDocument = {
  cc?: string[];
  cci?: string[];
  objet?: string | null;
  corps?: string | null;
  joindreCgv?: boolean;
  /** Identifiants de `documents_chantier` (bucket `chantier-documents`) — vérifiés côté serveur. */
  piecesComplementaires?: string[];
};

const MAX_COPIES = 10;
const MAX_PIECES_COMPLEMENTAIRES = 5;

export type PieceJointe = { nom: string; contenu: Buffer; source: "document" | "cgv" | "chantier" };

/** CGV de l'entreprise en HTML autonome, imprimé par Chromium (jamais de HTML venu de la base sans échappement). */
export function htmlCgv(entreprise: { nom: string; cgv: string }): string {
  const paragraphes = entreprise.cgv.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 8px;white-space:pre-wrap;">${echapperHtml(p)}</p>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Conditions générales de vente</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;color:#0d1b2a;">
<h1 style="font-size:16px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #c9a24a;padding-bottom:6px;margin:0 0 12px;">Conditions générales de vente — ${echapperHtml(entreprise.nom)}</h1>
${paragraphes}</body></html>`;
}

/** Nettoie et borne les listes de copies ; une adresse inexploitable fait refuser l'envoi (jamais ignorée en silence). */
export function validerCopies(cc: string[] | undefined, cci: string[] | undefined): { ok: true; cc: string[]; cci: string[] } | { ok: false; erreur: string } {
  const nettoyer = (liste: string[] | undefined) => [...new Set((liste ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean))];
  const ccN = nettoyer(cc), cciN = nettoyer(cci);
  const mauvaise = [...ccN, ...cciN].find((a) => !adresseRemisePlausible(a));
  if (mauvaise) return { ok: false, erreur: `Adresse en copie inexploitable : ${mauvaise}` };
  if (ccN.length + cciN.length > MAX_COPIES) return { ok: false, erreur: `Au plus ${MAX_COPIES} adresses en copie.` };
  return { ok: true, cc: ccN, cci: cciN };
}

export async function envoyerDocumentCommercialParEmail(
  supabase: SupabaseClient,
  params: {
    entrepriseId: string;
    entrepriseNom: string;
    prenomEmetteur: string | null;
    userId: string;
    typeDocument: TypeDocument;
    documentId: string;
    complementCorps?: string;
    // Adresse de substitution saisie explicitement par un utilisateur autorisé.
    // Absente = envoi vers l'adresse figée du document (cas nominal).
    surchargeDestinataire?: SurchargeDestinataire | null;
    peutSurchargerDestinataire?: boolean;
    options?: OptionsEnvoiDocument | null;
  },
): Promise<{ error: string } | { ok: true }> {
  const options = params.options ?? {};
  const copies = validerCopies(options.cc, options.cci);
  if (!copies.ok) return { error: copies.erreur };
  const donnees =
    params.typeDocument === "devis"
      ? await chargerDonneesDevisImprimable(supabase, { id: params.documentId, entrepriseId: params.entrepriseId })
      : await chargerDonneesFactureImprimable(supabase, { id: params.documentId, entrepriseId: params.entrepriseId });
  if (!donnees) return { error: `${params.typeDocument === "devis" ? "Devis" : "Facture"} introuvable` };

  if (!brevoEstConfigure()) return { error: "L'envoi automatique par e-mail n'est pas encore configuré" };

  // `donnees.clientEmail` est l'adresse FIGÉE sur le document (snapshot). Elle
  // reste la destination par défaut ; seule une saisie explicite d'un
  // utilisateur autorisé peut s'en écarter, et jamais l'adresse courante de la
  // fiche client, qui n'est pas consultée ici.
  const destinataire = resoudreDestinataireEnvoi({
    adresseFigee: donnees.clientEmail,
    surcharge: params.surchargeDestinataire,
    peutSurcharger: params.peutSurchargerDestinataire === true,
  });
  if (!destinataire.ok) return { error: destinataire.erreur };

  const email = contenuEmailDocument({
    typeDoc: params.typeDocument === "facture" && donnees.estAvoir ? "avoir" : params.typeDocument,
    numero: donnees.numero,
    // Le corps du message garde l'identité figée du document : seule l'adresse
    // d'acheminement peut différer, jamais le destinataire imprimé.
    client: { nom: donnees.client.nom_affiche, prenom: null, societe: null, email: destinataire.email },
    montantTtc: Number(donnees.montantTtc),
    entrepriseNom: params.entrepriseNom,
    prenomEmetteur: params.prenomEmetteur,
  });
  if (!email) return { error: "Ce client n'a pas d'adresse e-mail renseignée" };
  // Objet et message : ceux du modèle ou de la saisie s'ils sont fournis, sinon le texte historique.
  const objet = options.objet?.trim() ? options.objet.trim().slice(0, 200) : email.sujet;
  const corpsBase = options.corps?.trim() ? options.corps.replace(/\r/g, "").slice(0, 8000) : email.corps;
  const corpsComplet = params.complementCorps ? `${corpsBase}\n\n${params.complementCorps}` : corpsBase;

  let token: string;
  try {
    token = await obtenirNouveauTokenPartage(supabase, {
      entrepriseId: params.entrepriseId,
      typeDocument: params.typeDocument,
      documentId: params.documentId,
      creePar: params.userId,
    });
  } catch {
    return { error: "Impossible de créer le lien d'accès sécurisé" };
  }
  const lien = urlDocumentPartage(token);
  const urlImpression = urlImpressionPartage(token);

  // Le PDF joint est généré via la même page publique que le lien de
  // consultation (/imprimer/partage/[token]) : un seul mécanisme pour les
  // deux usages, jamais de rendu dupliqué.
  let pdf: Buffer | null = null;
  if (urlImpression) {
    try {
      // Moteur v2 : pages A4 décidées par les données, imprimées sans marge Chromium (sinon elles
      // seraient décalées). Moteur 1 : appel strictement identique à celui d'avant.
      const moteur = moteurDeReponse(await chargerRenduDocument(supabase, params.typeDocument, params.documentId));
      pdf = moteur === 2 ? await genererPdfDepuisUrl(urlImpression, null, { moteur: 2 }) : await genererPdfDepuisUrl(urlImpression);
    } catch {
      pdf = null; // Le lien de consultation reste envoyé même si la PJ échoue.
    }
  }

  // Pièces jointes (GP V1, lot G) : le document, puis les CGV, puis les pièces du chantier — dans la
  // limite de taille du transport. Une pièce demandée mais introuvable ou trop lourde fait refuser
  // l'envoi : l'utilisateur ne doit jamais croire qu'elle est partie.
  const pieces: PieceJointe[] = [];
  if (pdf && pdf.byteLength <= TAILLE_MAX_PIECE_JOINTE_OCTETS) pieces.push({ nom: nomFichierPdf(donnees.estFacture, donnees.numero), contenu: pdf, source: "document" });
  if (options.joindreCgv) {
    const { data: entreprise } = await supabase.from("entreprises").select("nom, cgv_texte").eq("id", params.entrepriseId).maybeSingle();
    const cgv = typeof entreprise?.cgv_texte === "string" ? entreprise.cgv_texte.trim() : "";
    if (!cgv) return { error: "Aucune condition générale de vente n'est renseignée dans les paramètres." };
    try {
      pieces.push({ nom: "conditions-generales-de-vente.pdf", contenu: await genererPdfDepuisHtml(htmlCgv({ nom: String(entreprise?.nom ?? params.entrepriseNom), cgv })), source: "cgv" });
    } catch {
      return { error: "Impossible de produire le PDF des conditions générales de vente." };
    }
  }
  const idsPieces = [...new Set((options.piecesComplementaires ?? []).filter((x) => typeof x === "string" && x))];
  if (idsPieces.length > MAX_PIECES_COMPLEMENTAIRES) return { error: `Au plus ${MAX_PIECES_COMPLEMENTAIRES} pièces complémentaires.` };
  if (idsPieces.length) {
    const { data: docs } = await supabase.from("documents_chantier").select("id, nom, storage_path, taille_octets").eq("entreprise_id", params.entrepriseId).in("id", idsPieces);
    const trouves = (docs ?? []) as Array<{ id: string; nom: string; storage_path: string; taille_octets: number | null }>;
    if (trouves.length !== idsPieces.length) return { error: "Une pièce complémentaire est introuvable ou n'appartient pas à cette entreprise." };
    for (const d of trouves) {
      const { data: fichier, error: erreurFichier } = await supabase.storage.from("chantier-documents").download(d.storage_path);
      if (erreurFichier || !fichier) return { error: `Impossible de lire la pièce « ${d.nom} ».` };
      pieces.push({ nom: d.nom, contenu: Buffer.from(await fichier.arrayBuffer()), source: "chantier" });
    }
  }
  const total = pieces.reduce((n, p) => n + p.contenu.byteLength, 0);
  if (total > TAILLE_MAX_PIECE_JOINTE_OCTETS && pieces.some((p) => p.source !== "document")) {
    return { error: "Les pièces jointes dépassent 8 Mo : retirez une pièce complémentaire." };
  }
  const journaliserEnvoi = async (statut: "envoye" | "echec", erreur?: string) => {
    try {
      await supabase.rpc("journaliser_envoi_document", {
        p_entreprise_id: params.entrepriseId, p_type_document: params.typeDocument, p_document_id: params.documentId,
        p_destinataire: email.to, p_copies: copies.cc, p_copies_cachees: copies.cci, p_objet: objet,
        p_pieces: pieces.map((p) => ({ nom: p.nom, taille: p.contenu.byteLength, source: p.source })), p_canal: "brevo", p_statut: statut, p_erreur: erreur ?? null,
      });
    } catch {
      // Historique indisponible (schéma non migré) : l'issue réelle de l'envoi prime.
    }
  };

  // Journalise l'écart d'adresse, quelle que soit l'issue de l'envoi : un envoi
  // refusé doit laisser la même trace qu'un envoi réussi, et chaque nouvelle
  // tentative ajoute sa propre entrée (le journal est un historique, jamais un
  // état). L'écriture d'audit ne peut pas faire échouer l'envoi lui-même.
  const journaliserEcart = async (resultat: "succes" | "echec", erreur?: string) => {
    if (!destinataire.surchargee) return;
    try {
      await supabase.from("journal_activite").insert(
        construireEntreeJournalSurcharge({
          entrepriseId: params.entrepriseId,
          utilisateurId: params.userId,
          typeDocument: params.typeDocument,
          documentId: params.documentId,
          numero: donnees.numero === "BROUILLON" ? null : donnees.numero,
          adresseFigee: destinataire.adresseFigee,
          adresseUtilisee: destinataire.email,
          motif: destinataire.motif,
          typeEnvoi: donnees.emailEnvoyeLe ? "renvoi" : "envoi_initial",
          resultat,
          erreur,
        }),
      );
    } catch {
      // Journal indisponible : on ne masque pas l'issue réelle de l'envoi.
    }
  };

  try {
    await envoyerEmailBrevo({
      to: email.to,
      sujet: objet,
      texte: corpsComplet,
      html: corpsHtmlEmailDocument(corpsComplet, lien),
      cc: copies.cc.length ? copies.cc : undefined,
      cci: copies.cci.length ? copies.cci : undefined,
      piecesJointes: pieces.length ? pieces.map((p) => ({ nom: p.nom, contenuBase64: p.contenu.toString("base64") })) : undefined,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Envoi de l'e-mail impossible";
    await journaliserEcart("echec", message);
    await journaliserEnvoi("echec", message);
    return { error: message };
  }

  await journaliserEcart("succes");
  await journaliserEnvoi("envoye");

  const table = params.typeDocument === "devis" ? "devis" : "factures";
  await supabase
    .from(table)
    .update({ email_envoye_le: new Date().toISOString(), email_envoye_a: email.to })
    .eq("id", params.documentId)
    .eq("entreprise_id", params.entrepriseId);

  return { ok: true };
}
