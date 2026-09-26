// Planificateur de purge RGPD (art. 17) — DÉSACTIVÉ PAR DÉFAUT.
//
// Rattache au cron quotidien existant (/api/cron/abonnements) l'exécution de la purge
// d'entreprise après l'échéance de 30 jours (CGV art. 10), avec la même logique que
// scripts/purger-entreprise.mjs (ordre topologique, rattrapage, anonymisation, Storage,
// marquage). Il n'est PAS activé : l'automatisation de la purge dépend de décisions
// propriétaire encore ouvertes (docs/qualification/ELSATIA_OWNER_DECISIONS_FINAL_V1.md
// P1-6, registre D4 ; PROMPT_CODEX_RGPD.md « validation plateforme ») — voir
// docs/qualification/ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md §3.
//
// Fail-closed :
//   - RGPD_PURGE_PLANIFICATEUR_MODE absent, vide ou inconnu → "off" : aucun accès base.
//   - "dry-run" → lecture seule (rapport + Storage), aucune écriture, pas même d'audit.
//   - "execute" → exige en plus RGPD_PURGE_DECISION_REF (référence de la décision écrite
//     du propriétaire), sinon retombe sur "off". La référence est consignée dans
//     platform.purge_audit à chaque exécution.
//
// Sûreté :
//   - la base reste seule juge de l'échéance (purger_table_entreprise refuse si
//     suppression_prevue_at > now() côté serveur) ; le filtre applicatif ci-dessous ne
//     fait qu'écarter en amont les dates absentes, invalides, futures ou incohérentes ;
//   - run_id déterministe par (entreprise, échéance) : une reprise le lendemain
//     prolonge le même run dans l'audit ; toutes les étapes serveur sont idempotentes ;
//   - ne lève jamais d'exception vers le cron appelant.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ModePlanificateur = "off" | "dry-run" | "execute";

export type ConfigPlanificateur = {
  mode: ModePlanificateur;
  maxEntreprises: number;
  decisionRef: string | null;
  raison: string;
};

export const MAX_ENTREPRISES_DEFAUT = 1;
export const MAX_ENTREPRISES_PLAFOND = 10;
export const PASSES_RATTRAPAGE = 5;
/** Relectures du rapport après anonymisation (lignes recréées par trigger). */
export const BALAYAGES_FINAUX = 3;
/** Délai de réversibilité des CGV (art. 10), déjà appliqué par demander_suppression_entreprise. */
export const DELAI_SUPPRESSION_MS = 30 * 24 * 60 * 60 * 1000;
const TOLERANCE_DELAI_MS = 60 * 60 * 1000;

export function lireConfigPlanificateurPurge(env: Record<string, string | undefined>): ConfigPlanificateur {
  const brut = (env.RGPD_PURGE_PLANIFICATEUR_MODE ?? "").trim().toLowerCase();
  const maxBrut = Number.parseInt(env.RGPD_PURGE_MAX_ENTREPRISES ?? "", 10);
  const maxEntreprises = Number.isFinite(maxBrut)
    ? Math.min(Math.max(maxBrut, 1), MAX_ENTREPRISES_PLAFOND)
    : MAX_ENTREPRISES_DEFAUT;
  const decisionRef = (env.RGPD_PURGE_DECISION_REF ?? "").trim() || null;

  if (brut === "" || brut === "off") return { mode: "off", maxEntreprises, decisionRef, raison: "desactive_par_defaut" };
  if (brut === "dry-run") return { mode: "dry-run", maxEntreprises, decisionRef, raison: "simulation" };
  if (brut === "execute") {
    if (!decisionRef) return { mode: "off", maxEntreprises, decisionRef, raison: "execute_sans_reference_de_decision" };
    return { mode: "execute", maxEntreprises, decisionRef, raison: "execute_autorise" };
  }
  return { mode: "off", maxEntreprises, decisionRef, raison: `mode_inconnu:${brut}` };
}

export type CandidatPurge = {
  id: string;
  suppression_demandee_at: string | null;
  suppression_prevue_at: string | null;
  purgee_at: string | null;
};

export type Eligibilite = { eligible: boolean; raison: string };

function lireDate(valeur: unknown): Date | null | "invalide" {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  if (typeof valeur !== "string" && !(valeur instanceof Date)) return "invalide";
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? "invalide" : date;
}

/** Écarte toute échéance absente, illisible, future ou incohérente avec le délai de 30 jours. */
export function evaluerEcheance(candidat: CandidatPurge, maintenant: Date): Eligibilite {
  if (Number.isNaN(maintenant.getTime())) return { eligible: false, raison: "horloge_invalide" };
  if (candidat.purgee_at) return { eligible: false, raison: "deja_purgee" };
  const prevue = lireDate(candidat.suppression_prevue_at);
  if (prevue === null) return { eligible: false, raison: "aucune_echeance" };
  if (prevue === "invalide") return { eligible: false, raison: "echeance_invalide" };
  if (prevue.getTime() > maintenant.getTime()) return { eligible: false, raison: "echeance_future" };
  const demandee = lireDate(candidat.suppression_demandee_at);
  if (demandee === null) return { eligible: false, raison: "demande_absente" };
  if (demandee === "invalide") return { eligible: false, raison: "demande_invalide" };
  if (demandee.getTime() > maintenant.getTime()) return { eligible: false, raison: "demande_future" };
  // Une échéance posée à la main (ou corrompue) plus tôt que demande + 30 jours n'est
  // jamais purgée automatiquement : seule la voie manuelle supervisée reste possible.
  if (prevue.getTime() - demandee.getTime() < DELAI_SUPPRESSION_MS - TOLERANCE_DELAI_MS) {
    return { eligible: false, raison: "delai_incoherent" };
  }
  return { eligible: true, raison: "echue" };
}

/** UUID stable par (entreprise, échéance) : une reprise prolonge le même run dans l'audit. */
export function runIdPlanifie(entrepriseId: string, suppressionPrevueAt: string): string {
  const h = createHash("sha256").update(`elsatia:rgpd-purge:${entrepriseId}:${new Date(suppressionPrevueAt).toISOString()}`).digest("hex");
  // Mise en forme UUID version 8 (RFC 9562, « custom »), variante RFC.
  const variante = ((Number.parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type LigneRapport = { table_nom: string; categorie: "DELETE" | "ANONYMIZE" | "RETAIN" | string; ordre: number | null; nb_lignes: number };
export type FichierStorage = { bucket_id: string; chemin: string; categorie: "ORPHELIN" | "RETAIN" | "A_PURGER" | string };
export type ResultatEtape = { ok: boolean; lignes: number | null; erreur: string | null };

/** Opérations serveur utilisées par le planificateur (adaptateur Supabase plus bas, faux en test). */
export type PortPurge = {
  listerEcheances(maintenantIso: string, limite: number): Promise<CandidatPurge[]>;
  rapport(entrepriseId: string): Promise<LigneRapport[]>;
  fichiersStorage(entrepriseId: string): Promise<FichierStorage[]>;
  purgerTable(entrepriseId: string, table: string, runId: string): Promise<ResultatEtape>;
  anonymiserTable(entrepriseId: string, table: string, runId: string): Promise<ResultatEtape>;
  supprimerFichiers(bucket: string, chemins: string[]): Promise<{ ok: boolean; erreur: string | null }>;
  marquerPurgee(entrepriseId: string, runId: string): Promise<{ ok: boolean; erreur: string | null }>;
  consigner(entrepriseId: string, runId: string, ok: boolean, detail: Record<string, unknown>): Promise<void>;
};

export type StatutPurge = "simulee" | "complete" | "incomplete" | "erreur";

export type ResultatPurgeEntreprise = {
  entrepriseId: string;
  runId: string;
  statut: StatutPurge;
  tablesPurgees: number;
  tablesAnonymisees: number;
  fichiersSupprimes: number;
  aSupprimer?: number;
  aAnonymiser?: number;
  fichiersAPurger?: number;
  echecs: Array<{ etape: string; cible: string; erreur: string }>;
};

function message(erreur: unknown) {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Déroule la purge d'UNE entreprise (ou sa simulation). Ne lève jamais : toute erreur
 * est rendue dans le résultat. Rejouable à l'identique : une table déjà vide ou déjà
 * anonymisée renvoie ok côté serveur, 0 ligne.
 */
export async function executerPurgeEntreprise(
  port: PortPurge,
  entrepriseId: string,
  runId: string,
  mode: "dry-run" | "execute",
): Promise<ResultatPurgeEntreprise> {
  const resultat: ResultatPurgeEntreprise = {
    entrepriseId, runId, statut: "erreur", tablesPurgees: 0, tablesAnonymisees: 0, fichiersSupprimes: 0, echecs: [],
  };
  try {
    const lignes = await port.rapport(entrepriseId);
    const aSupprimer = lignes
      .filter((l) => l.categorie === "DELETE")
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    const aAnonymiser = lignes.filter((l) => l.categorie === "ANONYMIZE");

    if (mode === "dry-run") {
      const fichiers = await port.fichiersStorage(entrepriseId);
      return {
        ...resultat,
        statut: "simulee",
        aSupprimer: aSupprimer.length,
        aAnonymiser: aAnonymiser.length,
        fichiersAPurger: fichiers.filter((f) => f.categorie === "A_PURGER" || f.categorie === "ORPHELIN").length,
      };
    }

    // Passe principale dans l'ordre topologique, puis rattrapage tant qu'il y a progrès.
    const echecs = new Map<string, string>();
    for (const l of aSupprimer) {
      const r = await port.purgerTable(entrepriseId, l.table_nom, runId);
      if (r.ok) resultat.tablesPurgees += 1;
      else echecs.set(l.table_nom, r.erreur ?? "échec sans message");
    }
    let passe = 1;
    let progresse = true;
    while (echecs.size > 0 && progresse && passe <= PASSES_RATTRAPAGE) {
      passe += 1;
      progresse = false;
      for (const table of [...echecs.keys()]) {
        const r = await port.purgerTable(entrepriseId, table, runId);
        if (r.ok) {
          echecs.delete(table);
          resultat.tablesPurgees += 1;
          progresse = true;
        } else {
          echecs.set(table, r.erreur ?? "échec sans message");
        }
      }
    }
    if (echecs.size > 0) {
      for (const [table, erreur] of echecs) resultat.echecs.push({ etape: "purge_table", cible: table, erreur });
      return { ...resultat, statut: "incomplete" };
    }

    for (const l of aAnonymiser) {
      const r = await port.anonymiserTable(entrepriseId, l.table_nom, runId);
      if (!r.ok) {
        resultat.echecs.push({ etape: "anonymiser_table", cible: l.table_nom, erreur: r.erreur ?? "échec sans message" });
        return { ...resultat, statut: "incomplete" };
      }
      resultat.tablesAnonymisees += 1;
    }

    // Balayage final (comme scripts/purger-entreprise.mjs) : une suppression tardive
    // (devis, chantiers…) peut recréer par trigger une ligne dans une table DELETE déjà
    // vidée (entreprises_dashboard_cache) ; marquer_entreprise_purgee refuserait alors
    // le marquage. On relit le rapport jusqu'à stabilité.
    for (let balayage = 1; balayage <= BALAYAGES_FINAUX; balayage += 1) {
      const restantes = (await port.rapport(entrepriseId)).filter((l) => l.categorie === "DELETE");
      if (restantes.length === 0) break;
      for (const l of restantes) {
        const r = await port.purgerTable(entrepriseId, l.table_nom, runId);
        if (r.ok) resultat.tablesPurgees += 1;
      }
    }

    const fichiers = await port.fichiersStorage(entrepriseId);
    const aPurger = fichiers.filter((f) => f.categorie === "A_PURGER");
    if (aPurger.length > 0) {
      resultat.echecs.push({ etape: "storage", cible: "A_PURGER", erreur: `${aPurger.length} fichier(s) encore rattaché(s) à des lignes DELETE` });
      return { ...resultat, statut: "incomplete" };
    }
    const parBucket = new Map<string, string[]>();
    for (const f of fichiers.filter((f) => f.categorie === "ORPHELIN")) {
      parBucket.set(f.bucket_id, [...(parBucket.get(f.bucket_id) ?? []), f.chemin]);
    }
    for (const [bucket, chemins] of parBucket) {
      const r = await port.supprimerFichiers(bucket, chemins);
      if (!r.ok) {
        resultat.echecs.push({ etape: "storage", cible: bucket, erreur: r.erreur ?? "échec sans message" });
        return { ...resultat, statut: "incomplete" };
      }
      resultat.fichiersSupprimes += chemins.length;
    }

    const marquage = await port.marquerPurgee(entrepriseId, runId);
    if (!marquage.ok) {
      resultat.echecs.push({ etape: "marquer_purgee", cible: entrepriseId, erreur: marquage.erreur ?? "échec sans message" });
      return { ...resultat, statut: "incomplete" };
    }
    return { ...resultat, statut: "complete" };
  } catch (erreur) {
    resultat.echecs.push({ etape: "exception", cible: entrepriseId, erreur: message(erreur) });
    return { ...resultat, statut: "erreur" };
  }
}

export type BilanPlanificateur = {
  mode: ModePlanificateur;
  raison: string;
  ignorees: Array<{ entrepriseId: string; raison: string }>;
  traitees: ResultatPurgeEntreprise[];
  erreur?: string;
};

// Un échec d'écriture de l'audit du planificateur n'interrompt jamais la purge : chaque
// étape serveur (purge, anonymisation, marquage) est de toute façon consignée par la base.
async function consignerSansInterrompre(
  port: PortPurge, entrepriseId: string, runId: string, ok: boolean, detail: Record<string, unknown>,
) {
  try {
    await port.consigner(entrepriseId, runId, ok, detail);
  } catch {
    // volontairement ignoré (voir ci-dessus)
  }
}

/** Point d'entrée du cron. Mode "off" : retourne immédiatement, aucun appel au port. */
export async function planifierPurgesRgpd(
  port: PortPurge,
  config: ConfigPlanificateur,
  maintenant: Date,
): Promise<BilanPlanificateur> {
  const bilan: BilanPlanificateur = { mode: config.mode, raison: config.raison, ignorees: [], traitees: [] };
  if (config.mode === "off") return bilan;
  if (Number.isNaN(maintenant.getTime())) return { ...bilan, erreur: "horloge_invalide" };

  try {
    // Sur-échantillonne : une entreprise durablement inéligible (délai incohérent) ne doit
    // pas bloquer celles qui la suivent dans l'ordre des échéances.
    const candidats = await port.listerEcheances(maintenant.toISOString(), config.maxEntreprises * 10);
    for (const candidat of candidats) {
      if (bilan.traitees.length >= config.maxEntreprises) break;
      const eligibilite = evaluerEcheance(candidat, maintenant);
      if (!eligibilite.eligible) {
        bilan.ignorees.push({ entrepriseId: candidat.id, raison: eligibilite.raison });
        continue;
      }
      const runId = runIdPlanifie(candidat.id, candidat.suppression_prevue_at as string);
      if (config.mode === "execute") {
        await consignerSansInterrompre(port, candidat.id, runId, true, {
          evenement: "debut", mode: config.mode, decision_ref: config.decisionRef,
          suppression_prevue_at: candidat.suppression_prevue_at,
        });
      }
      const resultat = await executerPurgeEntreprise(port, candidat.id, runId, config.mode);
      if (config.mode === "execute") {
        await consignerSansInterrompre(port, candidat.id, runId, resultat.statut === "complete", {
          evenement: "fin", mode: config.mode, decision_ref: config.decisionRef, statut: resultat.statut,
          tables_purgees: resultat.tablesPurgees, tables_anonymisees: resultat.tablesAnonymisees,
          fichiers_supprimes: resultat.fichiersSupprimes, echecs: resultat.echecs,
          raison: resultat.statut === "complete" ? null : `purge ${resultat.statut}`,
        });
      }
      bilan.traitees.push(resultat);
    }
    return bilan;
  } catch (erreur) {
    return { ...bilan, erreur: message(erreur) };
  }
}

/** Adaptateur service_role vers les RPC de la migration 20260729000185 (+ 20260923000400). */
export function creerPortPurgeSupabase(admin: SupabaseClient): PortPurge {
  const lignesEtape = (data: unknown, champ: string): ResultatEtape => {
    const ligne = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!ligne) return { ok: false, lignes: null, erreur: "réponse RPC vide" };
    return { ok: ligne.ok === true, lignes: (ligne[champ] as number | null) ?? null, erreur: (ligne.erreur as string | null) ?? null };
  };
  return {
    async listerEcheances(_maintenantIso, limite) {
      // L'échéance est filtrée par l'horloge de la base (lister_purges_echues) ; le
      // filtre applicatif evaluerEcheance() s'y ajoute, il ne la remplace pas.
      const { data, error } = await admin.rpc("lister_purges_echues", { p_limite: limite });
      if (error) throw new Error(`Lecture des échéances impossible : ${error.message}`);
      return (data ?? []) as CandidatPurge[];
    },
    async rapport(entrepriseId) {
      const { data, error } = await admin.rpc("rapport_purge_entreprise", { p_entreprise_id: entrepriseId });
      if (error) throw new Error(`Rapport de purge impossible : ${error.message}`);
      return (data ?? []) as LigneRapport[];
    },
    async fichiersStorage(entrepriseId) {
      const { data, error } = await admin.rpc("verifier_storage_entreprise", { p_entreprise_id: entrepriseId });
      if (error) throw new Error(`Vérification Storage impossible : ${error.message}`);
      return (data ?? []) as FichierStorage[];
    },
    async purgerTable(entrepriseId, table, runId) {
      const { data, error } = await admin.rpc("purger_table_entreprise", { p_entreprise_id: entrepriseId, p_table: table, p_run_id: runId });
      if (error) return { ok: false, lignes: null, erreur: `appel RPC échoué : ${error.message}` };
      return lignesEtape(data, "lignes_supprimees");
    },
    async anonymiserTable(entrepriseId, table, runId) {
      const { data, error } = await admin.rpc("anonymiser_table_entreprise", { p_entreprise_id: entrepriseId, p_table: table, p_run_id: runId });
      if (error) return { ok: false, lignes: null, erreur: `appel RPC échoué : ${error.message}` };
      return lignesEtape(data, "lignes_anonymisees");
    },
    async supprimerFichiers(bucket, chemins) {
      const { error } = await admin.storage.from(bucket).remove(chemins);
      return { ok: !error, erreur: error?.message ?? null };
    },
    async marquerPurgee(entrepriseId, runId) {
      const { error } = await admin.rpc("marquer_entreprise_purgee", { p_entreprise_id: entrepriseId, p_run_id: runId });
      return { ok: !error, erreur: error?.message ?? null };
    },
    async consigner(entrepriseId, runId, ok, detail) {
      await admin.rpc("consigner_planificateur_purge", { p_entreprise_id: entrepriseId, p_run_id: runId, p_ok: ok, p_detail: detail });
    },
  };
}
