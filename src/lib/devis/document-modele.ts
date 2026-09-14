/**
 * Modèle de présentation UNIQUE des devis et factures — moteur de présentation v2.
 *
 * L'aperçu de l'éditeur, la page d'impression, le PDF, le portail client et la pièce jointe
 * d'e-mail consomment tous une `VueDocument` construite ICI, à partir d'une même source. Il n'y
 * a pas de second calcul ailleurs : ce que l'utilisateur voit en tapant est ce que le client
 * recevra.
 *
 * Module PUR : il tourne aussi bien dans le navigateur (aperçu en direct) que sur le serveur.
 *
 * ── Compatibilité ascendante ─────────────────────────────────────────────────────────────
 * Les documents émis AVANT ce moteur restent rendus par `DocumentImprimable` (moteur v1), à
 * l'identique. Seuls les brouillons et les documents émis avec un instantané v2 passent ici.
 */

import type { TotauxDocument } from "@/lib/devis/montants";
import { descriptionAccessible, type FiligraneResolu } from "@/lib/devis/filigrane";
import { lignesClient, totauxDevis, type ElementDevis, type LigneClient } from "@/lib/devis/presentation";

export const MOTEUR_PRESENTATION_VERSION = 2 as const;

export type IdentiteEmetteur = {
  nom: string;
  raisonSociale: string | null;
  siret: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  logoUrl: string | null;
  assuranceDecennaleNumero: string | null;
  assuranceDecennaleAssureur: string | null;
  assuranceRcProNumero: string | null;
  tauxPenalitesRetard: number | null;
  texteEntete: string | null;
  textePiedPage: string | null;
};

export type PoliceDocument = "arial" | "georgia" | "trebuchet" | "verdana";
export type MiseEnPage = "classique" | "compacte" | "epuree" | "moderne" | "elegante" | "technique";

export type StyleDocument = {
  police: PoliceDocument;
  taillePolice: number;
  logoLargeur: number;
  couleur: string;
  couleurSecondaire: string;
  miseEnPage: MiseEnPage;
  positionLogo: "gauche" | "centre" | "droite";
  afficherLogo: boolean;
  afficherDescriptions: boolean;
  afficherTvaLignes: boolean;
  /** GP V1 (lot G) : imprimer la référence interne des lignes. Faux par défaut. */
  afficherReferences: boolean;
};

/** Références imprimées en en-tête (GP V1, lot G) ; toutes facultatives. */
export type ReferencesDocument = {
  interne: string | null;
  client: string | null;
  chantierNom: string | null;
  chantierReference: string | null;
  chantierAdresse: string | null;
};

export type IdentiteDestinataire = {
  nomAffiche: string;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  siret: string | null;
};

export type SourceDocument = {
  typeDocument: "devis" | "facture";
  /** Titre imprimé (« Devis », « Facture — Acompte »…), fourni par le chargeur. */
  titre: string;
  statut: string;
  numero: string | null;
  dateEmission: string | null;
  dateSecondaire: { libelle: string; valeur: string } | null;
  emetteur: IdentiteEmetteur;
  style: Partial<StyleDocument> | null;
  destinataire: IdentiteDestinataire;
  elements: readonly ElementDevis[];
  remiseGlobalePct: number;
  /** Montants enregistrés en base, qui font foi quand ils existent. */
  totauxEnregistres?: { totalHt: number; totalTva: number; totalTtc: number } | null;
  conditions: string | null;
  notesClient: string | null;
  filigrane: FiligraneResolu;
  duplicata?: { numeroOriginal: string; dateEmissionOriginal: string | null } | null;
  nomProduit: string;
  /** GP V1 (lot G) : références (en-tête) et conditions générales de vente (annexe, devis seulement). */
  references?: Partial<ReferencesDocument> | null;
  cgv?: string | null;
};

export type VueDocument = {
  moteurVersion: typeof MOTEUR_PRESENTATION_VERSION;
  typeDocument: "devis" | "facture";
  titre: string;
  numero: string;
  statut: string;
  dateEmission: string;
  dateSecondaire: { libelle: string; valeur: string } | null;
  emetteur: IdentiteEmetteur;
  style: StyleDocument;
  destinataire: IdentiteDestinataire;
  lignes: LigneClient[];
  remiseGlobalePct: number;
  totaux: TotauxDocument;
  /** Montants imprimés : ceux de la base quand ils existent, sinon ceux calculés. */
  totauxAffiches: { totalHt: number; totalTva: number; totalTtc: number };
  /** Renseigné si la base et le calcul divergent — ne devrait jamais arriver ; signalé, pas masqué. */
  ecartTotaux: string | null;
  conditions: string | null;
  notes: string | null;
  mentions: string[];
  bonPourAccord: boolean;
  filigrane: FiligraneResolu;
  duplicata: { numeroOriginal: string; dateEmissionOriginal: string } | null;
  /** Résumé textuel : propriétés du PDF, lecteurs d'écran. */
  resumeAccessible: string;
  piedProduit: string;
  /** Lignes « libellé : valeur » sous le titre (réf. interne, votre référence, chantier). Vide : rien. */
  references: Array<{ libelle: string; valeur: string }>;
  /** Paragraphes des CGV imprimés en annexe ; vide : pas d'annexe. */
  cgv: string[];
};

const HEX = /^#[0-9a-f]{6}$/i;
const POLICES: readonly PoliceDocument[] = ["arial", "georgia", "trebuchet", "verdana"];
const MISES_EN_PAGE: readonly MiseEnPage[] = ["classique", "compacte", "epuree", "moderne", "elegante", "technique"];

/** Style assaini, avec les mêmes valeurs par défaut que le moteur v1. */
export function normaliserStyle(s: Partial<StyleDocument> | null | undefined): StyleDocument {
  const t = Number(s?.taillePolice);
  const l = Number(s?.logoLargeur);
  return {
    police: POLICES.includes(s?.police as PoliceDocument) ? (s!.police as PoliceDocument) : "arial",
    taillePolice: Number.isFinite(t) && t >= 10 && t <= 16 ? t : 13,
    logoLargeur: Number.isFinite(l) && l >= 60 && l <= 180 ? l : 105,
    couleur: HEX.test(s?.couleur ?? "") ? s!.couleur! : "#0d1b2a",
    couleurSecondaire: HEX.test(s?.couleurSecondaire ?? "") ? s!.couleurSecondaire! : "#c9a24a",
    miseEnPage: MISES_EN_PAGE.includes(s?.miseEnPage as MiseEnPage) ? (s!.miseEnPage as MiseEnPage) : "classique",
    positionLogo: s?.positionLogo === "centre" || s?.positionLogo === "droite" ? s.positionLogo : "gauche",
    afficherLogo: s?.afficherLogo !== false,
    afficherDescriptions: s?.afficherDescriptions !== false,
    afficherTvaLignes: s?.afficherTvaLignes !== false,
    afficherReferences: s?.afficherReferences === true,
  };
}

function referencesImprimees(r: Partial<ReferencesDocument> | null | undefined): Array<{ libelle: string; valeur: string }> {
  if (!r) return [];
  const lignes: Array<{ libelle: string; valeur: string }> = [];
  if (r.interne) lignes.push({ libelle: "Réf. interne", valeur: r.interne });
  if (r.client) lignes.push({ libelle: "Votre référence", valeur: r.client });
  if (r.chantierNom || r.chantierReference) lignes.push({ libelle: "Chantier", valeur: [r.chantierReference, r.chantierNom].filter(Boolean).join(" — ") });
  if (r.chantierAdresse) lignes.push({ libelle: "Adresse du chantier", valeur: r.chantierAdresse });
  return lignes;
}

/** Paragraphes des CGV : lignes vides = séparateurs ; jamais d'annexe sur une facture. */
export function paragraphesCgv(texte: string | null | undefined, typeDocument: "devis" | "facture"): string[] {
  if (typeDocument !== "devis" || !texte) return [];
  return texte.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/** « 2026-09-11 » → « 11/09/2026 », sans passer par un fuseau horaire. */
export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const eur = (x: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(x);

function mentionsLegales(s: SourceDocument): string[] {
  const e = s.emetteur;
  const mentions: string[] = [];
  if (e.assuranceDecennaleNumero) {
    mentions.push(`Assurance décennale : ${e.assuranceDecennaleNumero}${e.assuranceDecennaleAssureur ? ` (${e.assuranceDecennaleAssureur})` : ""}`);
  }
  if (e.assuranceRcProNumero) mentions.push(`RC Pro : ${e.assuranceRcProNumero}`);
  if (s.typeDocument === "facture") {
    mentions.push(
      `Pénalités de retard : ${e.tauxPenalitesRetard ? `${e.tauxPenalitesRetard} %` : "3× le taux d'intérêt légal"} · Indemnité forfaitaire de recouvrement : 40 €`,
    );
  }
  if (e.textePiedPage) mentions.push(e.textePiedPage);
  return mentions;
}

export function construireVueDocument(s: SourceDocument): VueDocument {
  const totaux = totauxDevis(s.elements, s.remiseGlobalePct);
  const calcules = { totalHt: totaux.totalHt, totalTva: totaux.totalTva, totalTtc: totaux.totalTtc };
  const enregistres = s.totauxEnregistres ?? null;
  const ecart = enregistres
    && (enregistres.totalHt !== calcules.totalHt || enregistres.totalTva !== calcules.totalTva || enregistres.totalTtc !== calcules.totalTtc)
    ? `Montants enregistrés (${eur(enregistres.totalTtc)} TTC) différents du calcul (${eur(calcules.totalTtc)} TTC).`
    : null;
  const numero = s.numero ?? "BROUILLON";
  const duplicata = s.duplicata
    ? { numeroOriginal: s.duplicata.numeroOriginal, dateEmissionOriginal: dateFr(s.duplicata.dateEmissionOriginal) }
    : null;
  const mentions = mentionsLegales(s);
  if (duplicata) {
    mentions.unshift(`Duplicata de la facture n° ${duplicata.numeroOriginal} émise le ${duplicata.dateEmissionOriginal}. L’original n’est pas modifié.`);
  }
  const affiches = enregistres ?? calcules;
  const filigraneTexte = descriptionAccessible(s.filigrane);
  return {
    moteurVersion: MOTEUR_PRESENTATION_VERSION,
    typeDocument: s.typeDocument,
    titre: s.titre,
    numero,
    statut: s.statut,
    dateEmission: dateFr(s.dateEmission),
    dateSecondaire: s.dateSecondaire ? { libelle: s.dateSecondaire.libelle, valeur: dateFr(s.dateSecondaire.valeur) } : null,
    emetteur: { ...s.emetteur },
    style: normaliserStyle(s.style),
    destinataire: { ...s.destinataire },
    lignes: lignesClient(s.elements),
    remiseGlobalePct: s.remiseGlobalePct,
    totaux,
    totauxAffiches: { ...affiches },
    ecartTotaux: ecart,
    conditions: s.conditions?.trim() || null,
    notes: s.notesClient?.trim() || null,
    mentions,
    bonPourAccord: s.typeDocument === "devis",
    filigrane: s.filigrane,
    duplicata,
    resumeAccessible: [
      `${s.titre} ${numero}`,
      s.emetteur.nom,
      `destinataire ${s.destinataire.nomAffiche}`,
      `total ${eur(affiches.totalTtc)} TTC`,
      filigraneTexte,
    ].filter(Boolean).join(" — "),
    piedProduit: `Document généré par ${s.nomProduit}`,
    references: referencesImprimees(s.references),
    cgv: paragraphesCgv(s.cgv, s.typeDocument),
  };
}
