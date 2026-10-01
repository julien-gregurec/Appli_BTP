import { readdirSync, readFileSync } from "node:fs";

/**
 * File de génération PDF : concurrence plafonnée, file d'attente bornée, délais, arrêt forcé
 * de Chromium et nettoyage garanti (ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1).
 *
 * Mesuré (ELSATIA_NEXT_MEMORY_CAPACITY_V1 § 9) : un Chromium coûte 300 à 400 Mo HORS du processus
 * Node (invisible dans process.memoryUsage(), mais pas dans la limite du conteneur) ; 10 PDF
 * simultanés = 4,1 Go d'arbre de processus ; des générations bloquées jusqu'au délai du client ;
 * des Chromium rattachés à init à l'arrêt du serveur.
 *
 * Règles :
 *   • au plus `concurrence` navigateurs vivants par instance ; au-delà, file d'attente FIFO de
 *     `fileMax` places, chacune attendant au plus `attenteMaxMs` → sinon SaturationPdfError (503) ;
 *   • chaque génération a un délai global `dureeMaxMs` (lancement compris) → DelaiPdfError ;
 *   • l'appelant peut annuler (AbortSignal de la requête) → AnnulationPdfError, en file comme en cours ;
 *   • quelle que soit l'issue, `finally` ferme le navigateur : close() borné par `delaiFermetureMs`,
 *     puis SIGKILL du GROUPE de processus (puppeteer lance Chromium en `detached`, groupe = pid) ;
 *   • à la sortie du processus Node, tout navigateur encore vivant est tué (synchrone, 'exit') ;
 *   • Chromium est marqué `--elsatia-pdf-proprietaire=<pid Node>` : un Chromium dont le
 *     propriétaire n'existe plus (serveur tué par SIGKILL / OOM) est retrouvé et tué au lancement
 *     suivant (balayage /proc, Linux uniquement) ;
 *   • chaque génération écrit une ligne JSON `pdf_job` (attente, durée, issue, occupation).
 */

export class SaturationPdfError extends Error {
  readonly code = "pdf_saturation";
  constructor(message = "Trop de PDF en cours de génération, réessayez dans quelques secondes") {
    super(message);
    this.name = "SaturationPdfError";
  }
}
export class DelaiPdfError extends Error {
  readonly code = "pdf_delai";
  constructor(message = "Génération du PDF trop longue") {
    super(message);
    this.name = "DelaiPdfError";
  }
}
export class AnnulationPdfError extends Error {
  readonly code = "pdf_annulation";
  constructor(message = "Génération du PDF annulée") {
    super(message);
    this.name = "AnnulationPdfError";
  }
}

/** Navigateur vu par la file : seul ce qui sert à le fermer ou le tuer. */
export type NavigateurGere<N> = {
  navigateur: N;
  pid: number | null;
  fermer: () => Promise<void>;
};

export type LanceurNavigateur<N> = (signal: AbortSignal) => Promise<NavigateurGere<N>>;

export type OptionsFilePdf = {
  concurrence: number;
  fileMax: number;
  attenteMaxMs: number;
  dureeMaxMs: number;
  delaiFermetureMs: number;
};

export type IssuePdf = "succes" | "echec" | "delai" | "annulation" | "saturation";

export type EtatFilePdf = {
  options: OptionsFilePdf;
  actifs: number;
  enFile: number;
  navigateursVivants: number;
  compteurs: Record<IssuePdf, number> & { total: number; tuesForce: number; orphelinsTues: number };
  dureeMs: { p50: number | null; p95: number | null; max: number | null };
  attenteMs: { p50: number | null; p95: number | null; max: number | null };
};

type Journal = (entree: Record<string, unknown>) => void;

const journalParDefaut: Journal = (entree) => {
  const ligne = JSON.stringify({ event: "pdf_job", ...entree });
  if (entree.issue === "succes") console.info(ligne);
  else console.warn(ligne);
};

export const MARQUEUR_PROPRIETAIRE = "--elsatia-pdf-proprietaire=";

function entier(valeur: string | undefined, defaut: number, min: number) {
  const n = Number(valeur);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : defaut;
}

/** Réglages par variables d'environnement (documentés dans le rapport de capacité). */
export function optionsDepuisEnv(env: Record<string, string | undefined> = process.env): OptionsFilePdf {
  return {
    concurrence: entier(env.PDF_CONCURRENCE, 2, 1),
    fileMax: entier(env.PDF_FILE_MAX, 10, 0),
    attenteMaxMs: entier(env.PDF_ATTENTE_MAX_MS, 20_000, 0),
    dureeMaxMs: entier(env.PDF_DUREE_MAX_MS, 35_000, 1_000),
    delaiFermetureMs: entier(env.PDF_DELAI_FERMETURE_MS, 3_000, 100),
  };
}

function percentile(valeurs: number[], p: number) {
  if (!valeurs.length) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  return Math.round(tri[Math.min(tri.length - 1, Math.floor((p / 100) * tri.length))]);
}

function processusVivant(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** SIGKILL du groupe (Chromium et ses fils), puis du seul pid si le groupe est inaccessible. */
export function tuerGroupe(pid: number): boolean {
  try {
    process.kill(-pid, "SIGKILL");
    return true;
  } catch {
    try {
      process.kill(pid, "SIGKILL");
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Chromium marqués par une instance Node qui n'existe plus. Linux uniquement (/proc) ; ailleurs,
 * liste vide. Ne touche jamais un Chromium sans marqueur, ni un Chromium d'une instance vivante.
 */
export function chromiumsOrphelins(racineProc = "/proc"): number[] {
  let entrees: string[];
  try {
    entrees = readdirSync(racineProc);
  } catch {
    return [];
  }
  const orphelins: number[] = [];
  for (const nom of entrees) {
    if (!/^\d+$/.test(nom)) continue;
    let ligne: string;
    try {
      ligne = readFileSync(`${racineProc}/${nom}/cmdline`, "utf8");
    } catch {
      continue;
    }
    const argument = ligne.split("\0").find((a) => a.startsWith(MARQUEUR_PROPRIETAIRE));
    if (!argument) continue;
    const proprietaire = Number(argument.slice(MARQUEUR_PROPRIETAIRE.length));
    if (!Number.isInteger(proprietaire) || proprietaire <= 0) continue;
    if (proprietaire === process.pid || processusVivant(proprietaire)) continue;
    orphelins.push(Number(nom));
  }
  return orphelins;
}

type Attente = {
  demarrer: () => void;
  rejeter: (erreur: Error) => void;
};

export function creerFilePdf<N>(lanceur: LanceurNavigateur<N>, options: OptionsFilePdf, journal: Journal = journalParDefaut) {
  let actifs = 0;
  const file: Attente[] = [];
  const vivants = new Set<NavigateurGere<N>>();
  const compteurs = { succes: 0, echec: 0, delai: 0, annulation: 0, saturation: 0, total: 0, tuesForce: 0, orphelinsTues: 0 };
  const durees: number[] = [];
  const attentes: number[] = [];
  const memoriser = (liste: number[], valeur: number) => {
    liste.push(valeur);
    if (liste.length > 500) liste.shift();
  };

  function libererPlace() {
    actifs -= 1;
    const suivant = file.shift();
    if (suivant) suivant.demarrer();
  }

  function obtenirPlace(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new AnnulationPdfError());
    if (actifs < options.concurrence) {
      actifs += 1;
      return Promise.resolve();
    }
    if (file.length >= options.fileMax) return Promise.reject(new SaturationPdfError());
    return new Promise<void>((resolve, reject) => {
      const nettoyer = () => {
        clearTimeout(minuterie);
        signal?.removeEventListener("abort", surAnnulation);
        const index = file.indexOf(attente);
        if (index >= 0) file.splice(index, 1);
      };
      const attente: Attente = {
        demarrer: () => {
          nettoyer();
          actifs += 1;
          resolve();
        },
        rejeter: (erreur) => {
          nettoyer();
          reject(erreur);
        },
      };
      const surAnnulation = () => attente.rejeter(new AnnulationPdfError());
      const minuterie = setTimeout(() => attente.rejeter(new SaturationPdfError()), options.attenteMaxMs);
      signal?.addEventListener("abort", surAnnulation, { once: true });
      file.push(attente);
    });
  }

  async function fermer(gere: NavigateurGere<N>) {
    let fermeProprement = false;
    try {
      fermeProprement = await Promise.race([
        gere.fermer().then(() => true, () => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), options.delaiFermetureMs).unref?.()),
      ]);
    } finally {
      // Même après un close() réussi, le groupe est vérifié : un fils de Chromium peut survivre.
      if (gere.pid && (!fermeProprement || processusVivant(gere.pid))) {
        if (tuerGroupe(gere.pid) && !fermeProprement) compteurs.tuesForce += 1;
      }
      vivants.delete(gere);
    }
  }

  function balayerOrphelins() {
    for (const pid of chromiumsOrphelins()) {
      if (tuerGroupe(pid)) compteurs.orphelinsTues += 1;
    }
  }

  /**
   * Exécute `tache` avec un navigateur dédié. Le navigateur est TOUJOURS fermé (ou tué) au retour,
   * quelle que soit l'issue. `signal` : annulation par l'appelant (déconnexion du client).
   */
  async function executer<T>(tache: (navigateur: N, signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const debut = performance.now();
    compteurs.total += 1;
    let issue: IssuePdf = "echec";
    let attenteMs = 0;
    let erreurNom: string | undefined;
    try {
      await obtenirPlace(signal);
    } catch (erreur) {
      issue = erreur instanceof SaturationPdfError ? "saturation" : "annulation";
      compteurs[issue] += 1;
      journal({ issue, attente_ms: Math.round(performance.now() - debut), actifs, en_file: file.length });
      throw erreur;
    }
    attenteMs = performance.now() - debut;
    memoriser(attentes, attenteMs);
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(new DelaiPdfError()), options.dureeMaxMs);
    const surAnnulation = () => controleur.abort(new AnnulationPdfError());
    signal?.addEventListener("abort", surAnnulation, { once: true });
    const interruption = new Promise<never>((_, reject) => {
      const rejeter = () => reject(controleur.signal.reason);
      if (controleur.signal.aborted) rejeter();
      else controleur.signal.addEventListener("abort", rejeter, { once: true });
    });
    interruption.catch(() => undefined);
    // Porte-référence (et non une variable) : renseigné depuis la promesse de lancement.
    const lance: { gere: NavigateurGere<N> | null; termine: boolean } = { gere: null, termine: false };
    let lancement: Promise<NavigateurGere<N>> | null = null;
    const debutExecution = performance.now();
    try {
      balayerOrphelins();
      lancement = lanceur(controleur.signal).then((navigateur) => {
        lance.gere = navigateur;
        vivants.add(navigateur);
        // Lancement abouti alors que la génération est déjà terminée (délai, annulation) :
        // fermé ici, la place est déjà rendue.
        if (lance.termine) void fermer(navigateur);
        return navigateur;
      });
      const navigateur = await Promise.race([lancement, interruption]);
      const resultat = await Promise.race([tache(navigateur.navigateur, controleur.signal), interruption]);
      issue = "succes";
      return resultat;
    } catch (erreur) {
      const raison = controleur.signal.aborted ? controleur.signal.reason : erreur;
      issue = raison instanceof DelaiPdfError ? "delai" : raison instanceof AnnulationPdfError ? "annulation" : "echec";
      erreurNom = raison instanceof Error ? raison.name : "inconnue";
      throw raison;
    } finally {
      clearTimeout(delai);
      signal?.removeEventListener("abort", surAnnulation);
      if (!controleur.signal.aborted) controleur.abort(new AnnulationPdfError("fin de génération"));
      // Lancement encore en cours (interrompu pendant le démarrage de Chromium) : on lui laisse
      // le temps de se conclure — le lanceur reçoit le signal et abandonne de lui-même.
      if (!lance.gere && lancement) {
        await Promise.race([
          lancement.then(() => undefined, () => undefined),
          new Promise<void>((resolve) => setTimeout(resolve, options.delaiFermetureMs).unref?.()),
        ]);
      }
      lance.termine = true;
      if (lance.gere) await fermer(lance.gere);
      const dureeMs = performance.now() - debutExecution;
      memoriser(durees, dureeMs);
      compteurs[issue] += 1;
      libererPlace();
      journal({
        issue,
        erreur: erreurNom,
        attente_ms: Math.round(attenteMs),
        duree_ms: Math.round(dureeMs),
        actifs,
        en_file: file.length,
        navigateurs_vivants: vivants.size,
      });
    }
  }

  /** Tue de façon synchrone tous les navigateurs vivants (sortie du processus). */
  function tuerTout() {
    for (const gere of vivants) if (gere.pid) tuerGroupe(gere.pid);
    vivants.clear();
  }

  function etat(): EtatFilePdf {
    return {
      options,
      actifs,
      enFile: file.length,
      navigateursVivants: vivants.size,
      compteurs: { ...compteurs },
      dureeMs: { p50: percentile(durees, 50), p95: percentile(durees, 95), max: percentile(durees, 100) },
      attenteMs: { p50: percentile(attentes, 50), p95: percentile(attentes, 95), max: percentile(attentes, 100) },
    };
  }

  return { executer, etat, tuerTout, balayerOrphelins };
}

export type FilePdf<N> = ReturnType<typeof creerFilePdf<N>>;
