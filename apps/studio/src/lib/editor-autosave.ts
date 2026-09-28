import {
  editorFingerprint,
  type TimelineDocument,
} from "@elsatia/studio-domain";
export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";
export class EditorSaveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/** Fixed French message for refusals that retrying cannot fix. */
export function saveFailureMessage(e: unknown): {
  message: string;
  retryable: boolean;
} {
  if (!(e instanceof EditorSaveError))
    return { message: "Connexion interrompue. Nouvelle tentative en cours.", retryable: true };
  if (e.status === 401)
    return {
      message:
        "Votre session a expiré. Reconnectez-vous dans un autre onglet, puis réessayez.",
      retryable: false,
    };
  if (e.status === 403)
    return {
      message: "Vous n'avez plus le droit de modifier ce projet.",
      retryable: false,
    };
  if (e.status === 404)
    return { message: "Ce montage n'existe plus.", retryable: false };
  if (e.status >= 500 || e.status === 429)
    return {
      message: "Le service est momentanément indisponible. Nouvelle tentative en cours.",
      retryable: true,
    };
  return { message: e.message || "Sauvegarde refusée.", retryable: false };
}
/** Single flight with a trailing save. Acknowledgements never overwrite newer local edits. */
export class EditorAutosave {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private stopped = false;
  // Set by dispose(): the last unsaved state is still sent, with no UI notification.
  private closing = false;
  private inFlight = false;
  private current: TimelineDocument;
  private saved: string;
  private revision: number;
  status: SaveStatus = "saved";
  constructor(
    doc: TimelineDocument,
    private write: (
      doc: TimelineDocument,
      revision: number,
    ) => Promise<TimelineDocument>,
    private notify: (
      status: SaveStatus,
      revision: number,
      message: string,
      acknowledged: string,
    ) => void,
    private delay = 600,
  ) {
    this.current = doc;
    this.saved = editorFingerprint(doc);
    this.revision = doc.revision;
  }
  private emit(status: SaveStatus, message = "") {
    this.status = status;
    if (!this.stopped) this.notify(status, this.revision, message, this.saved);
  }
  update(doc: TimelineDocument) {
    this.current = doc;
    clearTimeout(this.timer);
    if (this.status === "conflict" || this.status === "error" || this.inFlight)
      return;
    if (editorFingerprint(doc) === this.saved) {
      this.emit("saved");
      return;
    }
    this.emit("pending");
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }
  async flush() {
    clearTimeout(this.timer);
    if (
      (this.stopped && !this.closing) ||
      this.inFlight ||
      this.status === "conflict"
    )
      return;
    const snapshot = this.current,
      fingerprint = editorFingerprint(snapshot);
    if (fingerprint === this.saved) {
      this.emit("saved");
      return;
    }
    this.inFlight = true;
    this.emit("saving");
    try {
      const result = await this.write(snapshot, this.revision);
      this.revision = result.revision;
      this.saved = fingerprint;
      this.inFlight = false;
      this.attempts = 0;
      clearTimeout(this.retryTimer);
      if (!this.stopped) this.update(this.current);
      else if (this.closing) void this.flush();
    } catch (e) {
      this.inFlight = false;
      if (e instanceof EditorSaveError && e.status === 409) {
        this.emit("conflict", e.message);
        return;
      }
      const failure = saveFailureMessage(e);
      this.emit("error", failure.message);
      // Transient failures recover on their own with a bounded exponential backoff.
      if (failure.retryable && !this.stopped && this.attempts < 6) {
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(
          () => void this.flush(),
          Math.min(30000, 2000 * 2 ** this.attempts++),
        );
      }
    }
  }
  retry() {
    if (this.status !== "conflict") {
      clearTimeout(this.retryTimer);
      this.emit("pending");
      void this.flush();
    }
  }
  /** Stops notifications but flushes unsaved edits once (navigation away, unmount). */
  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
    this.stopped = true;
    this.closing = true;
    if (!this.inFlight) void this.flush();
  }
}
