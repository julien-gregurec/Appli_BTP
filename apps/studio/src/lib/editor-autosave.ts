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
/** Single flight with a trailing save. Acknowledgements never overwrite newer local edits. */
export class EditorAutosave {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
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
    if (this.stopped || this.inFlight || this.status === "conflict") return;
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
      if (!this.stopped) this.update(this.current);
    } catch (e) {
      this.inFlight = false;
      this.emit(
        e instanceof EditorSaveError && e.status === 409 ? "conflict" : "error",
        e instanceof Error ? e.message : "Sauvegarde indisponible.",
      );
    }
  }
  retry() {
    if (this.status !== "conflict") {
      this.emit("pending");
      void this.flush();
    }
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
