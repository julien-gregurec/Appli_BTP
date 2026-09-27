/**
 * Sauvegarde automatique d'un objet Relevé (relevé, chantier, bâtiment, étage, zone, pièce).
 *
 * Pas de bouton « Enregistrer » : chaque modification est mise en file, regroupée pendant
 * `delayMs`, puis envoyée avec la RÉVISION lue par l'écran (contrôle optimiste). Une seule
 * écriture à la fois ; ce qui est saisi pendant une écriture part juste après.
 *
 * États : `idle` → `pending` (saisie en attente) → `saving` → `saved`
 *         ↘ `error` (réseau, refus) : la modification est conservée, `retry()` la renvoie ;
 *         ↘ `conflict` (l'objet a été modifié dans un autre onglet ou sur un autre appareil) :
 *           RIEN n'est écrasé ; l'utilisateur choisit `reloadFromServer()` (abandonner sa
 *           saisie) ou `overwrite(revisionServeur)` (réappliquer sa saisie sur la version
 *           serveur, choix explicite).
 *
 * Aucune dépendance React : testable avec des minuteries factices.
 */

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "conflict";
export type AutosaveState = { readonly status: AutosaveStatus; readonly message: string | null; readonly revision: number };

export type AutosaveSaveResult = { readonly revision: number };
export type AutosaveOptions<P extends Record<string, unknown>> = {
  revision: number;
  save(patch: P, expectedRevision: number): Promise<AutosaveSaveResult>;
  onState?(state: AutosaveState): void;
  delayMs?: number;
  setTimer?(callback: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
};

/** Reconnaît un conflit de révision sans dépendre de l'identité de classe (bundles multiples). */
export function isConflictError(error: unknown): boolean {
  return error instanceof Error && error.name === "ReleveConflictError";
}

export const AUTOSAVE_MESSAGES: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Modification en attente…",
  saving: "Enregistrement…",
  saved: "Enregistré",
  error: "Échec de l'enregistrement.",
  conflict: "Modifié ailleurs entre-temps : rien n'a été écrasé.",
};

export class AutosaveController<P extends Record<string, unknown>> {
  private pending: Partial<P> = {};
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private state: AutosaveState;
  private readonly delayMs: number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: AutosaveOptions<P>) {
    this.state = { status: "idle", message: null, revision: options.revision };
    this.delayMs = options.delayMs ?? 700;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get current(): AutosaveState { return this.state; }
  get hasPending(): boolean { return Object.keys(this.pending).length > 0; }

  private emit(status: AutosaveStatus, message: string | null = null, revision = this.state.revision) {
    this.state = { status, message: message ?? (AUTOSAVE_MESSAGES[status] || null), revision };
    this.options.onState?.(this.state);
  }

  /** Nouvelle révision connue (rechargement de l'écran) : sans effet sur une saisie en attente. */
  syncRevision(revision: number) {
    if (this.state.status === "conflict" || this.hasPending || this.inFlight) return;
    this.state = { ...this.state, revision };
  }

  /** Met une modification en file ; les modifications rapprochées sont fusionnées. */
  queue(patch: Partial<P>, options: { immediate?: boolean } = {}) {
    this.pending = { ...this.pending, ...patch };
    if (this.state.status === "conflict") return; // on attend le choix de l'utilisateur
    this.emit("pending");
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    if (options.immediate) void this.flush();
    else this.timer = this.setTimer(() => { this.timer = null; void this.flush(); }, this.delayMs);
  }

  /** Envoie immédiatement la saisie en attente (perte de focus, navigation, `retry`). */
  async flush(): Promise<void> {
    if (this.timer !== null) { this.clearTimer(this.timer); this.timer = null; }
    if (this.inFlight) { await this.inFlight; if (this.hasPending && this.state.status !== "conflict" && this.state.status !== "error") return this.flush(); return; }
    if (!this.hasPending || this.state.status === "conflict") return;
    const patch = this.pending as P;
    this.pending = {};
    this.emit("saving");
    this.inFlight = (async () => {
      try {
        const result = await this.options.save(patch, this.state.revision);
        this.emit(this.hasPending ? "pending" : "saved", null, result.revision);
      } catch (error) {
        // La saisie non enregistrée est conservée (fusionnée sous la saisie plus récente).
        this.pending = { ...patch, ...this.pending };
        if (isConflictError(error)) this.emit("conflict");
        else this.emit("error", error instanceof Error && error.message ? error.message : AUTOSAVE_MESSAGES.error);
      }
    })();
    try { await this.inFlight; } finally { this.inFlight = null; }
    if (this.hasPending && this.state.status === "pending") await this.flush();
  }

  retry(): Promise<void> {
    if (this.state.status !== "error") return Promise.resolve();
    this.emit("pending");
    return this.flush();
  }

  /** Conflit : l'utilisateur garde SA saisie et l'applique sur la version serveur. */
  overwrite(serverRevision: number): Promise<void> {
    if (this.state.status !== "conflict") return Promise.resolve();
    this.state = { ...this.state, revision: serverRevision };
    this.emit("pending", null, serverRevision);
    return this.flush();
  }

  /** Conflit ou erreur : l'utilisateur abandonne sa saisie et repart de la version serveur. */
  reloadFromServer(serverRevision: number) {
    this.pending = {};
    if (this.timer !== null) { this.clearTimer(this.timer); this.timer = null; }
    this.emit("idle", null, serverRevision);
  }

  dispose() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
}
