/**
 * §5 — Récupération de brouillon.
 *
 * L'autosave (§4) écrit le projet complet dans IndexedDB ET dépose ici un *pointeur* léger
 * (identifiant + horodatages + drapeau « fermé proprement »). Le pointeur seul vit en
 * `localStorage` : synchrone — donc fiable depuis `pagehide` — et minuscule, ce qui reste
 * conforme au §2 (« aucun localStorage pour stocker tout un projet complexe »).
 *
 * Au démarrage de l'Atelier, `evaluateDraftRecovery` croise le pointeur et le projet
 * réellement stocké pour décider s'il faut proposer :
 *   « Un tracé non terminé a été retrouvé. »  [ REPRENDRE ] [ IGNORER ]
 * Un projet plus récent que le brouillon n'est jamais écrasé automatiquement.
 */

import type { TracingProject } from "./project";
import type { TracingStorageScope } from "./repository";

export type TracingDraftPointer = {
  projectId: string;
  /** `updatedAt` du projet au moment du dernier autosave. */
  updatedAt: string;
  /** Horodatage de l'autosave lui-même (sert de garde d'ancienneté). */
  savedAt: string;
  /** `true` seulement après une sortie explicite (étape terminée / brouillon ignoré). */
  closedCleanly: boolean;
};

const DRAFT_KEY = "elsatia.atelier.draft";

export function tracingDraftStorageKey(scope: TracingStorageScope): string {
  return scope === "local" ? DRAFT_KEY : `${DRAFT_KEY}.${scope}`;
}

export interface TracingDraftStore {
  read(): TracingDraftPointer | null;
  write(pointer: TracingDraftPointer): void;
  clear(): void;
}

type WebStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class WebStorageTracingDraftStore implements TracingDraftStore {
  constructor(private readonly storage: WebStorageLike, private readonly key: string = DRAFT_KEY) {}

  read(): TracingDraftPointer | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<TracingDraftPointer> | null;
      if (
        !parsed ||
        typeof parsed.projectId !== "string" ||
        typeof parsed.updatedAt !== "string" ||
        typeof parsed.savedAt !== "string"
      ) {
        return null;
      }
      return {
        projectId: parsed.projectId,
        updatedAt: parsed.updatedAt,
        savedAt: parsed.savedAt,
        closedCleanly: parsed.closedCleanly === true,
      };
    } catch {
      return null;
    }
  }

  write(pointer: TracingDraftPointer): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(pointer));
    } catch {
      /* stockage plein ou indisponible : best-effort, le projet reste dans IndexedDB */
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      /* idem */
    }
  }
}

export class MemoryTracingDraftStore implements TracingDraftStore {
  private pointer: TracingDraftPointer | null = null;
  read(): TracingDraftPointer | null {
    return this.pointer ? { ...this.pointer } : null;
  }
  write(pointer: TracingDraftPointer): void {
    this.pointer = { ...pointer };
  }
  clear(): void {
    this.pointer = null;
  }
}

export type DraftRecovery =
  | { status: "none" }
  | { status: "stale"; reason: "closed" | "expired" | "missing" | "superseded" }
  | { status: "recoverable"; pointer: TracingDraftPointer; project: TracingProject };

/** Un brouillon plus vieux que ça n'est plus proposé à la reprise. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function evaluateDraftRecovery(
  pointer: TracingDraftPointer | null,
  project: TracingProject | null,
  now: number = Date.now(),
  maxAgeMs: number = DRAFT_MAX_AGE_MS,
): DraftRecovery {
  if (!pointer) return { status: "none" };
  if (pointer.closedCleanly) return { status: "stale", reason: "closed" };

  const savedAt = Date.parse(pointer.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > maxAgeMs) {
    return { status: "stale", reason: "expired" };
  }
  if (!project) return { status: "stale", reason: "missing" };

  // §5 — le projet stocké a avancé au-delà du brouillon : on ne revient pas en arrière.
  if (Date.parse(project.updatedAt) > Date.parse(pointer.updatedAt)) {
    return { status: "stale", reason: "superseded" };
  }
  return { status: "recoverable", pointer, project };
}
