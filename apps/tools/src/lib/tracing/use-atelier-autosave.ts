"use client";

/**
 * §4 / §5 — Pont React entre l'UI de l'Atelier et le socle de persistance.
 *
 * Fournit un repository local scellé au bon scope entreprise, un `AutosaveController`
 * (debounce + flush cycle de vie) et le pointeur de brouillon. Dégrade proprement quand
 * IndexedDB / localStorage sont indisponibles (`available === false`).
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { AutosaveController } from "./autosave";
import { WebStorageTracingDraftStore, tracingDraftStorageKey, type TracingDraftStore } from "./draft";
import {
  createTracingProjectRepository,
  tracingStorageScope,
  type TracingProjectRepository,
} from "./repository";
import type { TracingProject } from "./project";

export type AtelierPersistence = {
  /** `false` pendant le premier rendu (SSR + hydratation), `true` une fois monté côté client. */
  ready: boolean;
  available: boolean;
  repository: TracingProjectRepository | null;
  draftStore: TracingDraftStore | null;
  scheduleAutosave: (project: TracingProject) => void;
  flushAutosave: () => Promise<void>;
  /** Enregistre l'état final et marque le brouillon comme fermé proprement (§5). */
  markClosed: (project: TracingProject) => Promise<void>;
};

function nowIso() {
  return new Date().toISOString();
}

const NEVER_CHANGES = () => () => {};
/** `false` au rendu serveur et pendant l'hydratation, `true` ensuite — sans setState dans un effet. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

export function useAtelierPersistence(companyId?: string | null): AtelierPersistence {
  const scope = tracingStorageScope(companyId);

  // Le stockage n'existe que côté client : on ne l'annonce qu'après hydratation pour éviter
  // un écart entre le HTML statique et le premier rendu client.
  const ready = useHydrated();

  const setup = useMemo(() => {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
      return { available: false, repository: null as TracingProjectRepository | null, draftStore: null as TracingDraftStore | null };
    }
    let repository: TracingProjectRepository | null = null;
    try {
      repository = createTracingProjectRepository(scope);
    } catch {
      return { available: false, repository: null, draftStore: null as TracingDraftStore | null };
    }
    let draftStore: TracingDraftStore | null = null;
    try {
      draftStore = new WebStorageTracingDraftStore(window.localStorage, tracingDraftStorageKey(scope));
    } catch {
      draftStore = null;
    }
    return { available: true, repository, draftStore };
  }, [scope]);

  const controllerRef = useRef<AutosaveController | null>(null);
  const latestRef = useRef<TracingProject | null>(null);

  useEffect(() => {
    if (!setup.available || !setup.repository) return;
    const repository = setup.repository;
    const draftStore = setup.draftStore;

    const writePointer = (project: TracingProject, closedCleanly: boolean) => {
      draftStore?.write({ projectId: project.id, updatedAt: project.updatedAt, savedAt: nowIso(), closedCleanly });
    };

    const controller = new AutosaveController({
      save: async (project) => {
        await repository.save(project);
        writePointer(project, false);
      },
      bindLifecycle: (flush) => {
        if (typeof document === "undefined" || typeof window === "undefined") return () => {};
        const onHidden = () => {
          if (document.visibilityState !== "hidden") return;
          // Pointeur synchrone d'abord : il survit même si l'écriture IndexedDB n'aboutit pas.
          if (latestRef.current) writePointer(latestRef.current, false);
          flush();
        };
        const onPageHide = () => {
          if (latestRef.current) writePointer(latestRef.current, false);
          flush();
        };
        document.addEventListener("visibilitychange", onHidden);
        window.addEventListener("pagehide", onPageHide);
        return () => {
          document.removeEventListener("visibilitychange", onHidden);
          window.removeEventListener("pagehide", onPageHide);
        };
      },
    });
    controllerRef.current = controller;

    return () => {
      controllerRef.current = null;
      void controller.flush().finally(() => controller.dispose());
    };
  }, [setup]);

  const scheduleAutosave = useCallback((project: TracingProject) => {
    latestRef.current = project;
    controllerRef.current?.schedule(project);
  }, []);

  const flushAutosave = useCallback(async () => {
    await controllerRef.current?.flush();
  }, []);

  const markClosed = useCallback(
    async (project: TracingProject) => {
      latestRef.current = project;
      if (controllerRef.current) {
        controllerRef.current.schedule(project);
        await controllerRef.current.flush();
      } else if (setup.repository) {
        await setup.repository.save(project);
      }
      setup.draftStore?.write({ projectId: project.id, updatedAt: project.updatedAt, savedAt: nowIso(), closedCleanly: true });
    },
    [setup],
  );

  return {
    ready,
    available: ready && setup.available,
    repository: setup.repository,
    draftStore: setup.draftStore,
    scheduleAutosave,
    flushAutosave,
    markClosed,
  };
}
