/**
 * Banc de mesure (§12 du brief prototype).
 *
 * Le prototype fournit le *protocole* et l'outil de relevé. Il ne fournit
 * **aucun chiffre** : aucune machine GPU n'a été louée (§14, §15), donc aucune
 * mesure réelle n'existe. Chaque relevé porte un drapeau `reelle` ; les relevés
 * issus du moteur fictif sont marqués `false` et ne peuvent pas alimenter une
 * tarification (voir `couts/estimation.ts`).
 *
 * VRAM : non mesurable depuis Node. Le champ existe, il reste `null` tant que
 * la sonde `nvidia-smi` de la machine de test ne l'alimente pas.
 */

import type { EngineSubmission, ReconstructionEngineAdapter } from "@elsatia/drone-core";

import { estTerminal } from "../moteur/base";

export const TAILLES_JEU = ["small", "medium", "large"] as const;
export type TailleJeu = (typeof TAILLES_JEU)[number];

export type JeuBenchmark = {
  code: TailleJeu;
  description: string;
  photosCible: number;
  megapixelsParPhoto: number;
  /** Provenance envisagée — jeu public ou capture anonyme ELSATIA. */
  sourceEnvisagee: string;
  licenceSource: string;
};

/**
 * Trois jeux, du cas « une maison » au cas « petit lotissement ». Les sources
 * restent à constituer : aucune donnée client ne peut servir de jeu de test
 * sans consentement explicite (§49 du brief Drone).
 */
export const JEUX_BENCHMARK: Record<TailleJeu, JeuBenchmark> = {
  small: {
    code: "small",
    description: "Toiture unique, orbite simple",
    photosCible: 40,
    megapixelsParPhoto: 12,
    sourceEnvisagee: "capture ELSATIA anonyme (bâtiment propre), ou jeu public ODM `brighton`",
    licenceSource: "à confirmer avant usage",
  },
  medium: {
    code: "medium",
    description: "Bâtiment complet avec annexes, double grille + obliques",
    photosCible: 150,
    megapixelsParPhoto: 20,
    sourceEnvisagee: "capture ELSATIA anonyme, ou jeu public ODM `sheffield_cross`",
    licenceSource: "à confirmer avant usage",
  },
  large: {
    code: "large",
    description: "Ensemble de bâtiments, vol quadrillé haute densité",
    photosCible: 500,
    megapixelsParPhoto: 20,
    sourceEnvisagee: "jeu public de cartographie aérienne",
    licenceSource: "à confirmer avant usage",
  },
};

export type MesureBenchmark = {
  jeu: TailleJeu;
  moteur: string;
  moteurVersion: string;
  /** Machine de test : modèle GPU, vCPU, RAM. Chaîne libre, obligatoire. */
  machine: string;
  photos: number;
  megapixelsTotal: number;
  tempsS: number;
  ramPicMo: number | null;
  vramPicMo: number | null;
  disquePicMo: number | null;
  sortieMo: number | null;
  executeLe: string;
  /** Faux = moteur fictif ou simulation. Interdit d'en tirer un tarif. */
  reelle: boolean;
  notes: string | null;
};

export type SyntheseBenchmark = {
  jeu: TailleJeu;
  photos: number;
  tempsS: number;
  secondesParPhoto: number;
  secondesParMegapixel: number;
  megaoctetsSortieParPhoto: number | null;
  reelle: boolean;
};

export function resumerMesure(mesure: MesureBenchmark): SyntheseBenchmark {
  return {
    jeu: mesure.jeu,
    photos: mesure.photos,
    tempsS: mesure.tempsS,
    secondesParPhoto: mesure.photos === 0 ? 0 : mesure.tempsS / mesure.photos,
    secondesParMegapixel:
      mesure.megapixelsTotal === 0 ? 0 : mesure.tempsS / mesure.megapixelsTotal,
    megaoctetsSortieParPhoto:
      mesure.sortieMo === null || mesure.photos === 0 ? null : mesure.sortieMo / mesure.photos,
    reelle: mesure.reelle,
  };
}

export type Releve = {
  ajouter(mesure: MesureBenchmark): void;
  mesures(): MesureBenchmark[];
  syntheses(): SyntheseBenchmark[];
  /** Vrai seulement si les trois jeux ont été mesurés pour de vrai. */
  complet(): boolean;
  exporterJson(): string;
};

export function creerReleve(): Releve {
  const mesures: MesureBenchmark[] = [];
  return {
    ajouter(mesure) {
      mesures.push(mesure);
    },
    mesures: () => [...mesures],
    syntheses: () => mesures.map(resumerMesure),
    complet: () =>
      TAILLES_JEU.every((jeu) => mesures.some((mesure) => mesure.jeu === jeu && mesure.reelle)),
    exporterJson: () => JSON.stringify({ mesures }, null, 2),
  };
}

export type SondesRessources = {
  maintenantMs: () => number;
  /** Pic mémoire du processus orchestrateur, en Mo. `null` si non mesuré. */
  ramMo: () => number | null;
  /** Pic VRAM, en Mo. Alimenté par une sonde externe (`nvidia-smi`) ou `null`. */
  vramMo: () => number | null;
  disqueMo: () => number | null;
};

export const SONDES_PAR_DEFAUT: SondesRessources = {
  maintenantMs: () => Date.now(),
  ramMo: () =>
    typeof process === "undefined" ? null : process.memoryUsage().rss / (1024 * 1024),
  vramMo: () => null,
  disqueMo: () => null,
};

export type DemandeBenchmark = {
  jeu: TailleJeu;
  soumission: EngineSubmission;
  megapixelsTotal: number;
  machine: string;
  /** Déclaré par l'appelant : une exécution sur moteur fictif n'est jamais réelle. */
  reelle: boolean;
  notes?: string | null;
  /** Volume des artefacts écrits au stockage, en Mo, quand il est connu. */
  sortieMo?: number | null;
  /** Nombre maximal d'interrogations d'état avant abandon. */
  maxIterations?: number;
};

/**
 * Déroule un travail complet sur un adaptateur et relève les mesures. Utilisable
 * tel quel contre une instance NodeODM de test — c'est le harnais prêt à
 * l'emploi du jour où une machine GPU est disponible.
 */
export async function executerBenchmark(
  adaptateur: ReconstructionEngineAdapter,
  demande: DemandeBenchmark,
  sondes: SondesRessources = SONDES_PAR_DEFAUT,
  avantChaqueEtat?: () => void | Promise<void>,
): Promise<MesureBenchmark> {
  const descripteur = adaptateur.describe();
  const debut = sondes.maintenantMs();
  let ramPic: number | null = sondes.ramMo();
  let vramPic: number | null = sondes.vramMo();

  const handle = await adaptateur.submit(demande.soumission);
  const maxIterations = demande.maxIterations ?? 10_000;

  let statut = "queued";
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (avantChaqueEtat !== undefined) await avantChaqueEtat();
    const avancement = await adaptateur.poll(handle);
    statut = avancement.status;
    const ram = sondes.ramMo();
    if (ram !== null) ramPic = ramPic === null ? ram : Math.max(ramPic, ram);
    const vram = sondes.vramMo();
    if (vram !== null) vramPic = vramPic === null ? vram : Math.max(vramPic, vram);
    if (estTerminal(avancement.status)) break;
  }

  const outcome = statut === "completed" ? await adaptateur.fetchOutcome(handle) : null;
  const tempsMesureS = (sondes.maintenantMs() - debut) / 1000;

  return {
    jeu: demande.jeu,
    moteur: descripteur.engine,
    moteurVersion: descripteur.version,
    machine: demande.machine,
    photos: demande.soumission.input_urls.length,
    megapixelsTotal: demande.megapixelsTotal,
    tempsS: outcome?.duration_s ?? tempsMesureS,
    ramPicMo: ramPic,
    vramPicMo: vramPic,
    disquePicMo: sondes.disqueMo(),
    // La taille des sorties se mesure au stockage, pas au contrat moteur :
    // le noyau ne transporte que des références.
    sortieMo: demande.sortieMo ?? null,
    executeLe: new Date().toISOString(),
    reelle: demande.reelle,
    notes: demande.notes ?? (statut === "completed" ? null : `terminé en statut ${statut}`),
  };
}
