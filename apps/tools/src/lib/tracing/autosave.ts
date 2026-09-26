/**
 * §4 — Contrôleur d'autosave d'un `TracingProject`.
 *
 * Cible :
 *   - debounce ~1,5 s : les modifications rapprochées ne déclenchent qu'une écriture ;
 *   - flush immédiat sur `visibilitychange` (onglet masqué) et `pagehide` ;
 *   - aucune boucle permanente (`setInterval`) — uniquement un `setTimeout` de debounce ;
 *   - aucune requête cloud : `save` est une closure fournie par l'appelant (IndexedDB local).
 *
 * Le contrôleur ne connaît ni IndexedDB ni le DOM : `save` et la liaison au cycle de vie
 * sont injectées, ce qui le rend testable en environnement `node` (fake timers).
 */

import type { TracingProject } from "./project";

/** Branche `flush` sur le cycle de vie de la page ; retourne la fonction de débranchement. */
export type AutosaveLifecycleBinder = (flush: () => void) => () => void;

export type AutosaveOptions = {
  /** Écriture réelle (repository local). Peut rejeter : l'état est alors remis en file. */
  save: (project: TracingProject) => Promise<void>;
  /** Délai de debounce, défaut 1500 ms. */
  delayMs?: number;
  now?: () => number;
  /** Défaut : `browserLifecycleBinder`. Injectable pour les tests. */
  bindLifecycle?: AutosaveLifecycleBinder;
  onError?: (error: unknown) => void;
};

export const DEFAULT_AUTOSAVE_DELAY_MS = 1500;

/** Liaison par défaut : flush quand l'onglet passe masqué et sur `pagehide`. */
export function browserLifecycleBinder(flush: () => void): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  const onPageHide = () => flush();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}

export class AutosaveController {
  private readonly delayMs: number;
  private readonly now: () => number;
  private readonly unbind: () => void;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private queued: TracingProject | null = null;
  private inFlight: Promise<void> | null = null;
  private lastError: unknown = null;
  private lastSavedAt: number | null = null;
  private disposed = false;

  constructor(private readonly options: AutosaveOptions) {
    this.delayMs = Math.max(0, options.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS);
    this.now = options.now ?? (() => Date.now());
    const binder = options.bindLifecycle ?? browserLifecycleBinder;
    this.unbind = binder(() => {
      void this.flush();
    });
  }

  /** Un état est en attente d'écriture. */
  get pending(): boolean {
    return this.queued !== null;
  }

  /** Horodatage (`now()`) de la dernière écriture réussie, ou `null`. */
  get savedAt(): number | null {
    return this.lastSavedAt;
  }

  get lastFailure(): unknown {
    return this.lastError;
  }

  /** §4 — planifie une écriture debouncée du dernier état fourni. */
  schedule(project: TracingProject): void {
    if (this.disposed) return;
    this.queued = project;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  /** Écrit immédiatement l'état en attente (cycle de vie, changement d'étape, démontage). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      // Une écriture est déjà en cours : on l'attend ; l'état arrivé entre-temps
      // sera repris par la queue de l'appel en cours.
      await this.inFlight;
      return;
    }
    const project = this.queued;
    if (!project) return;
    this.queued = null;

    this.inFlight = this.persist(project);
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }

    // Un `schedule()` survenu pendant l'écriture a laissé un nouvel état :
    // on le persiste aussi — mais jamais après une erreur (pas de boucle serrée).
    if (this.queued !== null && this.lastError === null && !this.disposed) {
      await this.flush();
    }
  }

  private async persist(project: TracingProject): Promise<void> {
    try {
      await this.options.save(project);
      this.lastSavedAt = this.now();
      this.lastError = null;
    } catch (error) {
      this.lastError = error;
      if (this.queued === null) this.queued = project; // ne pas perdre l'état
      this.options.onError?.(error);
    }
  }

  /** Débranche le cycle de vie et annule le debounce. Faire un `flush()` avant si besoin. */
  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.unbind();
  }
}
