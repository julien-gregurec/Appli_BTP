/**
 * Enregistrement automatique « terrain » (Lot 3) : pas de bouton Enregistrer par champ.
 *
 * Machine d'état pure, sans React ni minuterie globale (minuteries injectables pour les tests) :
 *
 *   idle ──edit──▶ dirty ──(délai | flush)──▶ saving ──ok──▶ saved
 *                                              │  └──erreur réseau──▶ error ──retry──▶ saving
 *                                              └──révision périmée──▶ conflict (jamais d'écrasement)
 *
 * - Les saisies rapprochées sont regroupées (une écriture par pause de frappe).
 * - Une saisie pendant un enregistrement est rejouée ensuite, avec la NOUVELLE révision.
 * - Conflit : la valeur locale est conservée pour l'utilisateur, rien n'est réécrit tant qu'il
 *   n'a pas rechargé (`reset`) — pas d'écrasement silencieux entre deux onglets ou utilisateurs.
 */

export const AUTOSAVE_STATUSES = ["idle", "dirty", "saving", "saved", "error", "conflict"] as const;
export type AutosaveStatus = (typeof AUTOSAVE_STATUSES)[number];

export const AUTOSAVE_LABELS: Record<AutosaveStatus, string> = {
  idle: "", dirty: "Modification…", saving: "Enregistrement…", saved: "Enregistré", error: "Échec — réessayer", conflict: "Modifié ailleurs — recharger",
};

export type AutosaveState<T> = {
  readonly status: AutosaveStatus;
  /** Valeur affichée (saisie locale). */
  readonly value: T;
  /** Dernière valeur confirmée par le serveur. */
  readonly savedValue: T;
  readonly revision: number;
  readonly error: string | null;
};

export type AutosaveTimers = { set(callback: () => void, ms: number): unknown; clear(handle: unknown): void };

export type AutosaveOptions<T> = {
  value: T;
  revision: number;
  /** Écrit `value` en exigeant `revision` ; renvoie la nouvelle révision. */
  save(value: T, revision: number): Promise<number>;
  isConflict(error: unknown): boolean;
  onChange?(state: AutosaveState<T>): void;
  delayMs?: number;
  timers?: AutosaveTimers;
  equals?(a: T, b: T): boolean;
};

const defaultTimers: AutosaveTimers = { set: (callback, ms) => setTimeout(callback, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export class AutosaveController<T> {
  private state: AutosaveState<T>;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private readonly timers: AutosaveTimers;
  private readonly delay: number;
  private readonly equals: (a: T, b: T) => boolean;

  constructor(private readonly options: AutosaveOptions<T>) {
    this.state = { status: "idle", value: options.value, savedValue: options.value, revision: options.revision, error: null };
    this.timers = options.timers ?? defaultTimers;
    this.delay = options.delayMs ?? 700;
    this.equals = options.equals ?? Object.is;
  }

  get current(): AutosaveState<T> { return this.state; }

  private set(patch: Partial<AutosaveState<T>>) {
    this.state = { ...this.state, ...patch };
    this.options.onChange?.(this.state);
  }

  private cancelTimer() { if (this.timer !== null) { this.timers.clear(this.timer); this.timer = null; } }

  /** Saisie : programme l'écriture après une pause de frappe. */
  edit(value: T) {
    if (this.state.status === "conflict") { this.set({ value }); return; }
    const unchanged = this.equals(value, this.state.savedValue);
    const repos: AutosaveStatus = this.state.status === "idle" ? "idle" : "saved";
    this.set({ value, status: unchanged && !this.inFlight ? repos : "dirty", error: null });
    this.cancelTimer();
    if (!unchanged) this.timer = this.timers.set(() => { this.timer = null; void this.flush(); }, this.delay);
  }

  /** Écrit tout de suite (perte de focus, navigation). */
  async flush(): Promise<void> {
    this.cancelTimer();
    if (this.inFlight) { await this.inFlight; if (this.state.status === "dirty") return this.flush(); return; }
    if (this.state.status === "conflict" || this.equals(this.state.value, this.state.savedValue)) return;
    const value = this.state.value;
    this.set({ status: "saving", error: null });
    this.inFlight = (async () => {
      try {
        const revision = await this.options.save(value, this.state.revision);
        const again = !this.equals(this.state.value, value);
        this.set({ savedValue: value, revision, status: again ? "dirty" : "saved" });
      } catch (error) {
        if (this.options.isConflict(error)) this.set({ status: "conflict", error: error instanceof Error ? error.message : "Conflit." });
        else this.set({ status: "error", error: error instanceof Error ? error.message : "Enregistrement impossible." });
      }
    })();
    await this.inFlight;
    this.inFlight = null;
    if (this.state.status === "dirty") await this.flush();
  }

  /** Nouvel essai après une erreur (réseau). */
  retry(): Promise<void> {
    if (this.state.status !== "error") return Promise.resolve();
    this.set({ status: "dirty" });
    return this.flush();
  }

  /** Après rechargement (conflit ou donnée externe) : repart de la valeur serveur. */
  reset(value: T, revision: number) {
    this.cancelTimer();
    this.set({ status: "idle", value, savedValue: value, revision, error: null });
  }

  dispose() { this.cancelTimer(); }
}
