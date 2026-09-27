"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AutosaveController, type AutosaveState } from "@/lib/releve/autosave";
import type { ParsedNumber } from "@/lib/releve/forms";
import styles from "./releve.module.css";

type Patch = Record<string, unknown>;

export type AutosaveApi = {
  state: AutosaveState;
  queue(patch: Patch, options?: { immediate?: boolean }): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  overwrite(): Promise<void>;
  reload(): Promise<void>;
};

/**
 * Sauvegarde automatique d'UN objet. `save` écrit avec la révision attendue ; `fetchRevision`
 * relit la révision serveur (résolution de conflit) ; `onReloaded` rafraîchit l'écran après
 * « Recharger ». La saisie en attente est envoyée à la fermeture de l'écran.
 */
export function useAutosave(options: {
  revision: number;
  save(patch: Patch, expectedRevision: number): Promise<{ revision: number }>;
  fetchRevision(): Promise<number>;
  onSaved?(): void;
  onReloaded?(): void;
}): AutosaveApi {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });
  const [state, setState] = useState<AutosaveState>({ status: "idle", message: null, revision: options.revision });
  // La référence n'est lue que dans les rappels asynchrones (écriture), jamais pendant le rendu.
  // eslint-disable-next-line react-hooks/refs
  const [controller] = useState(() => new AutosaveController<Patch>({
    revision: options.revision,
    save: async (patch, revision) => { const result = await optionsRef.current.save(patch, revision); optionsRef.current.onSaved?.(); return result; },
    onState: setState,
  }));
  useEffect(() => { controller.syncRevision(options.revision); }, [controller, options.revision]);
  useEffect(() => () => { void controller.flush(); controller.dispose(); }, [controller]);

  const overwrite = useCallback(async () => controller.overwrite(await optionsRef.current.fetchRevision()), [controller]);
  const reload = useCallback(async () => {
    controller.reloadFromServer(await optionsRef.current.fetchRevision());
    optionsRef.current.onReloaded?.();
  }, [controller]);
  return {
    state,
    queue: useCallback((patch: Patch, queueOptions?: { immediate?: boolean }) => controller.queue(patch, queueOptions), [controller]),
    flush: useCallback(() => controller.flush(), [controller]),
    retry: useCallback(() => controller.retry(), [controller]),
    overwrite, reload,
  };
}

/** Indicateur d'état : Enregistrement… / Enregistré / Erreur + Réessayer / Conflit + choix. */
export function SaveStatus({ api, label }: { api: AutosaveApi; label?: string }) {
  const { status, message } = api.state;
  return <div className={styles.saveStatus} data-status={status} role="status" aria-live="polite" aria-label={label ? `État de sauvegarde — ${label}` : "État de sauvegarde"}>
    <span>{status === "idle" ? "Sauvegarde automatique" : message}</span>
    {status === "error" && <button type="button" className={styles.secondary} onClick={() => void api.retry()}>Réessayer</button>}
    {status === "conflict" && <>
      <button type="button" className={styles.secondary} onClick={() => void api.reload()}>Recharger la version à jour</button>
      <button type="button" className={styles.danger} onClick={() => void api.overwrite()}>Garder ma saisie</button>
    </>}
  </div>;
}

type FieldBase = { api: AutosaveApi; name: string; label: string; hint?: ReactNode };

/** Texte (ou zone de texte) : enregistrement après une courte pause de frappe et à la sortie du champ. */
export function AutoText({ api, name, label, value, required, multiline, maxLength, placeholder, inputMode, type = "text", hint }: FieldBase & {
  value: string | null; required?: boolean; multiline?: boolean; maxLength?: number; placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; type?: "text" | "date";
}) {
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(value);
  if (shown !== value && !focused) { setShown(value); setText(value ?? ""); }
  const change = (next: string) => {
    setText(next);
    if (required && !next.trim()) { setError("Champ obligatoire."); return; }
    setError("");
    api.queue({ [name]: next.trim() ? next : null }, { immediate: type === "date" });
  };
  const common = {
    id: `f-${name}`, value: text, maxLength, placeholder, "aria-invalid": Boolean(error) || undefined,
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); void api.flush(); },
  };
  return <label className={styles.field}><span>{label}{required ? " *" : ""}</span>
    {multiline
      ? <textarea {...common} rows={3} onChange={(event) => change(event.target.value)} />
      : <input {...common} type={type} inputMode={inputMode} onChange={(event) => change(event.target.value)} />}
    {error ? <small className={styles.fieldError}>{error}</small> : hint ? <small>{hint}</small> : null}
  </label>;
}

/** Liste de choix : enregistrement immédiat. */
export function AutoSelect<T extends string>({ api, name, label, value, options, allowEmpty }: FieldBase & {
  value: T | null; options: ReadonlyArray<{ value: T; label: string }>; allowEmpty?: string;
}) {
  const [current, setCurrent] = useState<string>(value ?? "");
  const [shown, setShown] = useState(value);
  if (shown !== value) { setShown(value); setCurrent(value ?? ""); }
  return <label className={styles.field}><span>{label}</span>
    <select value={current} onChange={(event) => { setCurrent(event.target.value); api.queue({ [name]: event.target.value || null }, { immediate: true }); }}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

/** Nombre saisi dans une unité terrain (cm, m), converti avant enregistrement. */
export function AutoNumber({ api, name, label, value, parse, format, placeholder, hint }: FieldBase & {
  value: number | null; parse(input: string): ParsedNumber; format(value: number | null): string; placeholder?: string;
}) {
  const [text, setText] = useState(format(value));
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(value);
  if (shown !== value && !focused) { setShown(value); setText(format(value)); }
  return <label className={styles.field}><span>{label}</span>
    <input id={`f-${name}`} inputMode="decimal" value={text} placeholder={placeholder} aria-invalid={Boolean(error) || undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); void api.flush(); }}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = parse(event.target.value);
        if (!parsed.ok) { setError(parsed.message); return; }
        setError("");
        api.queue({ [name]: parsed.value });
      }} />
    {error ? <small className={styles.fieldError}>{error}</small> : hint ? <small>{hint}</small> : null}
  </label>;
}
