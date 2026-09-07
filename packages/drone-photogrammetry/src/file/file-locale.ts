/**
 * File de travaux locale (§6, §7, §20, §21 du brief prototype).
 *
 * Abstraction volontairement pauvre : un dépôt (`DepotTravaux`), une horloge et
 * un adaptateur moteur. L'implémentation fournie est en mémoire — **aucune
 * infrastructure de Production n'est introduite ici**. Un dépôt Postgres/pgmq
 * viendra le jour où le besoin sera prouvé par les mesures, pas avant.
 *
 * La file ne réinvente rien du noyau : statuts, transitions autorisées,
 * catégories d'erreur et clé d'idempotence viennent de `@elsatia/drone-core`.
 *
 * Ce qu'elle garantit :
 *  - idempotence à la soumission (§20) : deux demandes de même clé ne créent
 *    jamais deux tâches moteur ;
 *  - retry borné puis lettre morte (§20, §21) ;
 *  - conservation intégrale du contexte d'échec : catégorie, message moteur,
 *    logs, artefacts partiels (§21).
 */

import {
  computeIdempotencyKey,
  peutTransitionnerReconstruction,
  type DroneProjectId,
  type EngineJobHandle,
  type EngineOutcome,
  type EntrepriseId,
  type MediaAssetId,
  type ReconstructionArtifacts,
  type ReconstructionEngine,
  type ReconstructionEngineAdapter,
  type ReconstructionErrorCategory,
  type ReconstructionJobId,
  type ReconstructionParameters,
  type ReconstructionStatus,
} from "@elsatia/drone-core";

import {
  ARTEFACTS_VIDES,
  ErreurMoteur,
  estTerminal,
  horlogeSysteme,
  journaliser,
  type Horloge,
  type LigneLog,
} from "../moteur/base";

export type EchecTravail = {
  category: ReconstructionErrorCategory;
  message: string;
  engineMessage: string | null;
  partialArtifacts: ReconstructionArtifacts;
  survenuLe: string;
};

export type TravailFile = {
  jobId: ReconstructionJobId;
  entrepriseId: EntrepriseId;
  projetId: DroneProjectId;
  idempotencyKey: string;
  inputSet: readonly MediaAssetId[];
  /** URL signées de lecture, transmises au moteur. Jamais persistées ailleurs. */
  inputUrls: readonly string[];
  parameters: ReconstructionParameters;
  engine: ReconstructionEngine;
  engineVersion: string;
  statut: ReconstructionStatus;
  /** 0 → 100, ou `null` quand le moteur ne sait pas estimer. */
  percent: number | null;
  stage: string | null;
  attempts: number;
  maxAttempts: number;
  handle: EngineJobHandle | null;
  outcome: EngineOutcome | null;
  echec: EchecTravail | null;
  logs: LigneLog[];
  dureeS: number | null;
  creeLe: string;
  majLe: string;
  demarreLe: string | null;
  termineLe: string | null;
};

export type DemandeTravail = {
  jobId: ReconstructionJobId;
  entrepriseId: EntrepriseId;
  projetId: DroneProjectId;
  inputSet: readonly MediaAssetId[];
  inputUrls: readonly string[];
  parameters: ReconstructionParameters;
};

export interface DepotTravaux {
  enregistrer(travail: TravailFile): void;
  lire(jobId: string): TravailFile | null;
  lireParCle(idempotencyKey: string): TravailFile | null;
  lister(): TravailFile[];
}

export function creerDepotMemoire(): DepotTravaux {
  const parId = new Map<string, TravailFile>();
  return {
    enregistrer(travail) {
      parId.set(travail.jobId, travail);
    },
    lire(jobId) {
      return parId.get(jobId) ?? null;
    },
    lireParCle(idempotencyKey) {
      return [...parId.values()].find((travail) => travail.idempotencyKey === idempotencyKey) ?? null;
    },
    lister() {
      return [...parId.values()];
    },
  };
}

export class ErreurFile extends Error {
  readonly code: "travail_inconnu" | "transition_invalide";

  constructor(code: "travail_inconnu" | "transition_invalide", message: string) {
    super(message);
    this.name = "ErreurFile";
    this.code = code;
  }
}

/** Un travail en échec qui a épuisé ses tentatives : lettre morte (§20, §94 du brief drone). */
export function estEnLettreMorte(travail: TravailFile): boolean {
  return travail.statut === "failed" && travail.attempts >= travail.maxAttempts;
}

export type ConfigFile = {
  moteur: ReconstructionEngineAdapter;
  depot?: DepotTravaux;
  horloge?: Horloge;
  maxAttempts?: number;
};

export type FileReconstruction = {
  soumettre(demande: DemandeTravail): Promise<TravailFile>;
  /** Prend le plus ancien travail en attente et le soumet au moteur. */
  demarrerProchain(): Promise<TravailFile | null>;
  /** Interroge le moteur et fait progresser le travail. */
  rafraichir(jobId: string): Promise<TravailFile>;
  /** Relance un travail en échec encore dans son quota de tentatives. */
  reessayer(jobId: string): Promise<TravailFile>;
  annuler(jobId: string): Promise<TravailFile>;
  lire(jobId: string): TravailFile;
  lister(statut?: ReconstructionStatus): TravailFile[];
};

export function creerFileReconstruction(config: ConfigFile): FileReconstruction {
  const depot = config.depot ?? creerDepotMemoire();
  const horloge = config.horloge ?? horlogeSysteme;
  const maxAttempts = config.maxAttempts ?? 3;
  const descripteur = config.moteur.describe();

  const exiger = (jobId: string): TravailFile => {
    const travail = depot.lire(jobId);
    if (travail === null) throw new ErreurFile("travail_inconnu", `Travail inconnu : ${jobId}`);
    return travail;
  };

  const toucher = (travail: TravailFile): void => {
    travail.majLe = horloge().toISOString();
    depot.enregistrer(travail);
  };

  /** Toute transition passe par la table du noyau : la file n'a pas sa propre machine à états. */
  const changerStatut = (travail: TravailFile, vers: ReconstructionStatus): void => {
    if (travail.statut === vers) return;
    if (!peutTransitionnerReconstruction(travail.statut, vers)) {
      throw new ErreurFile(
        "transition_invalide",
        `Transition refusée : ${travail.statut} → ${vers}`,
      );
    }
    travail.statut = vers;
  };

  const enregistrerEchec = (travail: TravailFile, erreur: unknown): void => {
    const estErreurMoteur = erreur instanceof ErreurMoteur;
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    changerStatut(travail, "failed");
    travail.echec = {
      category: estErreurMoteur ? erreur.category : "unknown",
      message,
      engineMessage: estErreurMoteur ? erreur.engineMessage : null,
      partialArtifacts: estErreurMoteur ? erreur.partialArtifacts : ARTEFACTS_VIDES,
      survenuLe: horloge().toISOString(),
    };
    if (estErreurMoteur && erreur.logs.length > 0) travail.logs.push(...erreur.logs);
    travail.logs.push(journaliser(horloge, "erreur", message));
    travail.termineLe = horloge().toISOString();

    // Retry borné : la tentative suivante repart d'une file propre, sans
    // poignée moteur, pour ne jamais réutiliser une tâche corrompue.
    const reessayable = estErreurMoteur ? erreur.retryable : false;
    if (reessayable && travail.attempts < travail.maxAttempts) {
      changerStatut(travail, "queued");
      travail.handle = null;
      travail.percent = null;
      travail.stage = null;
      travail.termineLe = null;
      travail.logs.push(
        journaliser(
          horloge,
          "avertissement",
          `Nouvelle tentative programmée (${travail.attempts}/${travail.maxAttempts})`,
        ),
      );
    }
    toucher(travail);
  };

  return {
    async soumettre(demande) {
      // §20/§95 — la clé est calculée par le noyau, à partir du moteur réel.
      const idempotencyKey = await computeIdempotencyKey({
        project_id: demande.projetId,
        input_set: demande.inputSet,
        engine: descripteur.engine,
        engine_version: descripteur.version,
        parameters: demande.parameters,
      });

      const existant = depot.lireParCle(idempotencyKey);
      if (existant !== null) return existant;

      const maintenant = horloge().toISOString();
      const travail: TravailFile = {
        jobId: demande.jobId,
        entrepriseId: demande.entrepriseId,
        projetId: demande.projetId,
        idempotencyKey,
        inputSet: demande.inputSet,
        inputUrls: demande.inputUrls,
        parameters: demande.parameters,
        engine: descripteur.engine,
        engineVersion: descripteur.version,
        statut: "queued",
        percent: null,
        stage: null,
        attempts: 0,
        maxAttempts,
        handle: null,
        outcome: null,
        echec: null,
        logs: [journaliser(horloge, "info", "Travail mis en file")],
        dureeS: null,
        creeLe: maintenant,
        majLe: maintenant,
        demarreLe: null,
        termineLe: null,
      };
      depot.enregistrer(travail);
      return travail;
    },

    async demarrerProchain() {
      const candidat = depot
        .lister()
        .filter((travail) => travail.statut === "queued")
        .sort((a, b) => a.creeLe.localeCompare(b.creeLe))[0];
      if (candidat === undefined) return null;

      // Reprise d'un travail déjà soumis au moteur : on ne resoumet pas.
      if (candidat.handle !== null) {
        changerStatut(candidat, "processing");
        toucher(candidat);
        return candidat;
      }

      candidat.attempts += 1;
      candidat.demarreLe = horloge().toISOString();
      try {
        candidat.handle = await config.moteur.submit({
          job_id: candidat.jobId,
          input_urls: candidat.inputUrls,
          parameters: candidat.parameters,
        });
        changerStatut(candidat, "processing");
        candidat.logs.push(
          journaliser(horloge, "info", `Soumis à ${descripteur.engine} ${descripteur.version}`),
        );
        toucher(candidat);
      } catch (erreur) {
        enregistrerEchec(candidat, erreur);
      }
      return depot.lire(candidat.jobId);
    },

    async rafraichir(jobId) {
      const travail = exiger(jobId);
      if (travail.handle === null || estTerminal(travail.statut)) return travail;

      try {
        const avancement = await config.moteur.poll(travail.handle);
        travail.percent = avancement.percent;
        travail.stage = avancement.stage;

        if (avancement.status === "completed") {
          const outcome = await config.moteur.fetchOutcome(travail.handle);
          travail.outcome = outcome;
          travail.dureeS = outcome.duration_s;
          changerStatut(travail, "completed");
          travail.percent = 100;
          travail.termineLe = horloge().toISOString();
          travail.logs.push(journaliser(horloge, "info", "Reconstruction terminée"));
          toucher(travail);
          return travail;
        }
        if (avancement.status === "failed") {
          // Le moteur détient le contexte complet de l'échec — message brut,
          // logs et artefacts partiels (§21). On le lui demande plutôt que de
          // le reconstituer de l'extérieur.
          await config.moteur.fetchOutcome(travail.handle);
          throw new ErreurMoteur("engine_failure", "Le moteur signale un échec", {
            retryable: true,
            engineMessage: avancement.error_message,
          });
        }
        changerStatut(travail, avancement.status);
        toucher(travail);
        return travail;
      } catch (erreur) {
        enregistrerEchec(travail, erreur);
        return exiger(jobId);
      }
    },

    async reessayer(jobId) {
      const travail = exiger(jobId);
      if (travail.statut !== "failed") {
        throw new ErreurFile(
          "transition_invalide",
          `Seul un travail en échec se relance (statut actuel : ${travail.statut})`,
        );
      }
      if (estEnLettreMorte(travail)) {
        throw new ErreurFile(
          "transition_invalide",
          `Travail en lettre morte après ${travail.attempts} tentative(s)`,
        );
      }
      changerStatut(travail, "queued");
      travail.handle = null;
      travail.percent = null;
      travail.stage = null;
      travail.termineLe = null;
      travail.logs.push(journaliser(horloge, "info", "Relance manuelle"));
      toucher(travail);
      return travail;
    },

    async annuler(jobId) {
      const travail = exiger(jobId);
      if (travail.statut === "completed") {
        throw new ErreurFile("transition_invalide", "Un travail terminé ne s'annule pas");
      }
      if (travail.handle !== null) {
        try {
          await config.moteur.cancel(travail.handle);
        } catch (erreur) {
          // L'annulation côté moteur peut échouer (tâche déjà purgée) : le
          // travail ELSATIA est annulé quand même, l'incident est tracé.
          travail.logs.push(
            journaliser(
              horloge,
              "avertissement",
              `Annulation moteur refusée : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
            ),
          );
        }
      }
      changerStatut(travail, "cancelled");
      travail.termineLe = horloge().toISOString();
      travail.logs.push(journaliser(horloge, "info", "Travail annulé"));
      toucher(travail);
      return travail;
    },

    lire(jobId) {
      return exiger(jobId);
    },

    lister(statut) {
      const travaux = depot.lister();
      return statut === undefined ? travaux : travaux.filter((travail) => travail.statut === statut);
    },
  };
}
