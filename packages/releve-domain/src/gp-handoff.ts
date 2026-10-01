/**
 * Lot 11 — Transmission réelle de l'estimation Tools vers Gestion Pro (contrat `elsatia.tools.estimation` 1.x).
 *
 * Tools ENVOIE ; Gestion Pro IMPORTE (RPC `gp_tools_importer_estimation`, migration 20260930001501) et reste seul
 * propriétaire du prix de vente, de la marge, de la remise, de la TVA, du devis et de sa version commerciale.
 *
 * Règles (vérifiées par le serveur, rappelées ici pour l'interface et les tests) :
 * - idempotence : même relevé, même état, même contenu (empreinte SERVEUR) → même import, jamais de doublon ;
 * - nouvelle version : un contenu différent crée la version n + 1 ; un devis GP déjà tiré d'une version précédente
 *   n'est JAMAIS modifié, il est signalé « nouvelle version disponible » avec comparaison ;
 * - le serveur fait foi : un contrat dont les lignes ne correspondent plus à l'estimation serveur est refusé (PT409).
 */
import { ESTIMATION_GP_CONTRACT, type EstimationGpPayload } from "./estimation";

export const GP_HANDOFF_RPC = { importer: "gp_tools_importer_estimation", envois: "gp_tools_imports_releve" } as const;

/** Résumé montré AVANT l'envoi (et repris par l'écran d'import GP). Montants en chaînes décimales exactes (HT). */
export type GpEnvoiResume = {
  readonly contrat: string;
  readonly ouvrages: number;
  readonly lignes: number;
  readonly lignesSansPrix: number;
  readonly montantHt: string;
  readonly plans: number;
  readonly photos: number;
  readonly annotations: number;
  readonly anomalies: number;
  readonly revetements: number;
};

export function resumeEnvoiGp(payload: EstimationGpPayload): GpEnvoiResume {
  return {
    contrat: `${payload.contract.name} ${payload.contract.version}`,
    ouvrages: payload.quantitatif.ouvrages.length,
    lignes: payload.lignes.length,
    lignesSansPrix: payload.lignes.filter((l) => l.montantRetenu === null).length,
    montantHt: payload.totaux.total,
    plans: payload.source.plans.length,
    photos: payload.photos.length,
    annotations: payload.annotations.length,
    anomalies: payload.anomalies.length,
    revetements: payload.revetements.length,
  };
}

export type GpImportStatut = "importe" | "nouvelle_version" | "deja_importe";
export type GpImportResultat = {
  readonly statut: GpImportStatut;
  readonly importId: string;
  readonly version: number;
  readonly montant: number;
  readonly lignes: number;
  readonly ouvrages: number;
  readonly devisPrecedent: boolean;
  readonly devisCree: boolean;
};

const num = (v: unknown, fallback = 0) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

export function gpImportResultatFromJson(raw: unknown): GpImportResultat {
  const r = (raw ?? {}) as Record<string, unknown>;
  const statut = r.statut === "importe" || r.statut === "nouvelle_version" || r.statut === "deja_importe" ? r.statut : null;
  if (!statut || typeof r.importId !== "string") throw new Error("Réponse de Gestion Pro illisible");
  return {
    statut, importId: r.importId, version: num(r.version, 1), montant: num(r.montant), lignes: num(r.lignes), ouvrages: num(r.ouvrages),
    devisPrecedent: r.devisPrecedent === true, devisCree: r.devisCree === true,
  };
}

const euros = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT`;

/** Message affiché après l'envoi. Jamais « devis » côté Tools : c'est Gestion Pro qui en décide. */
export function gpImportMessage(r: GpImportResultat): string {
  if (r.statut === "deja_importe") {
    return `Déjà transmis à Gestion Pro (version ${r.version}) : contenu identique, aucun doublon créé.`;
  }
  const base = `Transmis à Gestion Pro : import version ${r.version} — ${r.ouvrages} ouvrage${r.ouvrages > 1 ? "s" : ""}, ${r.lignes} ligne${r.lignes > 1 ? "s" : ""}, ${euros(r.montant)} estimatifs.`;
  if (r.statut === "nouvelle_version") {
    return `${base} Nouvelle version : Gestion Pro la signale à côté de la précédente${r.devisPrecedent ? " ; le devis déjà créé n'est pas modifié" : ""}.`;
  }
  return `${base} Le chiffrage (prix de vente, marge, TVA, devis) se fait dans Gestion Pro.`;
}

export type GpEnvoiErreurType = "obsolete" | "contrat" | "droits" | "gp_inaccessible" | "reseau";
export type GpEnvoiErreur = { readonly type: GpEnvoiErreurType; readonly message: string; readonly reessayable: boolean };

/**
 * Classe une erreur d'envoi pour l'interface. `code` = SQLSTATE PostgREST (absent si la requête n'a pas abouti),
 * `hint` = indice posé par le serveur (GP_INACCESSIBLE, SOURCE_OBSOLETE, CONTRAT_INVALIDE).
 */
export function classerErreurEnvoiGp(error: { code?: string | null; message?: string | null; hint?: string | null } | null | undefined): GpEnvoiErreur {
  const code = error?.code ?? null;
  const message = (error?.message ?? "").trim();
  if (code === "PT409" || error?.hint === "SOURCE_OBSOLETE") {
    return { type: "obsolete", message: message || "L'estimation a changé depuis son chargement : rechargez-la puis renvoyez-la.", reessayable: false };
  }
  if (error?.hint === "GP_INACCESSIBLE") {
    return { type: "gp_inaccessible", message: message || "Gestion Pro n'est pas accessible pour cette entreprise.", reessayable: false };
  }
  // Mode sûr incident (lecture seule / application coupée) : Gestion Pro refuse temporairement toute écriture.
  if (code === "PT503") return { type: "gp_inaccessible", message: message || "Gestion Pro est temporairement indisponible.", reessayable: true };
  if (code === "42501") return { type: "droits", message: message || "Envoi vers Gestion Pro non autorisé pour votre compte.", reessayable: false };
  if (code === "22023" || code === "23514") return { type: "contrat", message: `Contrat refusé par Gestion Pro : ${message || "contrat invalide"}`, reessayable: false };
  // Pas de code SQL, ou incident de transport / disponibilité : la requête n'a pas abouti côté Gestion Pro.
  if (!code || /^(08|57|53|PGRST|5\d\d$)/.test(code)) {
    return { type: "reseau", message: "Gestion Pro est injoignable pour le moment. Rien n'a été créé en double : vous pouvez renvoyer sans risque.", reessayable: true };
  }
  return { type: "contrat", message: `Envoi refusé par Gestion Pro : ${message || "erreur inattendue"}`, reessayable: false };
}

export type GpEnvoi = {
  readonly importId: string; readonly etat: string; readonly version: number; readonly le: string; readonly montant: number;
  readonly lignes: number; readonly ouvrages: number; readonly contractVersion: string; readonly priseEnCharge: boolean; readonly nouvelleVersion: boolean;
};

export function gpEnvoisFromJson(raw: unknown): GpEnvoi[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[]).map((r) => ({
    importId: String(r.importId), etat: String(r.etat), version: num(r.version, 1), le: String(r.le), montant: num(r.montant),
    lignes: num(r.lignes), ouvrages: num(r.ouvrages), contractVersion: String(r.contractVersion ?? ESTIMATION_GP_CONTRACT.version),
    priseEnCharge: r.priseEnCharge === true, nouvelleVersion: r.nouvelleVersion === true,
  }));
}

/** Port de transmission (adaptateur Supabase dans apps/tools). */
export interface GpHandoffRepository {
  envoyer(releveId: string, etat: string, payload: EstimationGpPayload): Promise<GpImportResultat>;
  envois(releveId: string): Promise<GpEnvoi[]>;
}
