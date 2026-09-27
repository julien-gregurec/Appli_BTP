"use client";

import { useState } from "react";
import {
  niveauLabel, PHOTO_TARGET_KINDS, PHOTO_TARGET_LABELS,
  type PhotoTarget, type PhotoTargetKind, type ReleveElement, type ReleveStructure,
} from "@elsatia/releve-domain";
import styles from "./photos.module.css";

type Option = { id: string; label: string };

/** Objets actifs proposés pour chaque type de cible. */
export function targetOptions(kind: PhotoTargetKind, structure: ReleveStructure, targets: readonly ReleveElement[]): Option[] {
  const alive = <T extends { deletedAt: string | null }>(rows: readonly T[]) => rows.filter((row) => !row.deletedAt);
  const etageName = (id: string | null) => structure.etages.find((etage) => etage.id === id)?.nom ?? "";
  switch (kind) {
    case "batiment": return alive(structure.batiments).map((row) => ({ id: row.id, label: row.nom }));
    case "etage":
    case "plan": return alive(structure.etages).map((row) => ({ id: row.id, label: `${row.nom} (${niveauLabel(row.niveau)})` }));
    case "zone": return alive(structure.zones).map((row) => ({ id: row.id, label: `${row.nom} · ${etageName(row.etageId)}` }));
    case "piece": return alive(structure.pieces).map((row) => ({ id: row.id, label: `${row.nom} · ${etageName(row.etageId)}` }));
    case "mur": return targets.filter((row) => row.type === "mur").map((row, index) => ({ id: row.id, label: `Mur ${index + 1} · ${etageName(row.etageId)}` }));
    case "equipement": return targets.filter((row) => row.type === "equipement").map((row) => ({ id: row.id, label: `${(row as ReleveElement<"equipement">).donnees.libelle} · ${etageName(row.etageId)}` }));
    case "releve": return [];
  }
}

/**
 * Choix de la cible d'une photo : relevé, bâtiment, étage, zone, pièce, mur, équipement ou
 * point du plan futur (clic dans le cadre de l'étage, position normalisée conservée).
 */
export function PhotoTargetPicker({ structure, targets, value, onChange, idPrefix }: {
  structure: ReleveStructure; targets: readonly ReleveElement[]; value: PhotoTarget; onChange(target: PhotoTarget): void; idPrefix: string;
}) {
  const [point, setPoint] = useState<{ x: number; y: number }>(value.kind === "plan" ? { x: value.x, y: value.y } : { x: 0.5, y: 0.5 });
  const kinds = PHOTO_TARGET_KINDS.filter((kind) => kind === "releve" || targetOptions(kind, structure, targets).length > 0);
  const options = targetOptions(value.kind, structure, targets);
  const currentId = value.kind === "releve" ? "" : value.kind === "plan" ? value.etageId : value.id;

  function select(kind: PhotoTargetKind, id?: string) {
    if (kind === "releve") return onChange({ kind: "releve" });
    const first = id ?? targetOptions(kind, structure, targets)[0]?.id;
    if (!first) return;
    onChange(kind === "plan" ? { kind, etageId: first, x: point.x, y: point.y } : { kind, id: first });
  }

  return <div className={styles.targetPicker}>
    <label className={styles.field}><span>Rattacher à</span>
      <select id={`${idPrefix}-kind`} value={value.kind} onChange={(event) => select(event.target.value as PhotoTargetKind)}>
        {kinds.map((kind) => <option key={kind} value={kind}>{PHOTO_TARGET_LABELS[kind]}</option>)}
      </select>
    </label>
    {value.kind !== "releve" && <label className={styles.field}><span>{value.kind === "plan" ? "Étage du plan" : PHOTO_TARGET_LABELS[value.kind]}</span>
      <select id={`${idPrefix}-id`} value={currentId} onChange={(event) => select(value.kind, event.target.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>}
    {value.kind === "plan" && <div className={styles.planPicker}>
      <span>Position sur le plan (à venir) — touchez pour placer</span>
      <button type="button" className={styles.planBox} aria-label="Placer le point sur le plan futur"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const next = { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
          setPoint(next); onChange({ kind: "plan", etageId: value.etageId, ...next });
        }}>
        <span className={styles.planDot} style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }} />
      </button>
      <small>{Math.round(value.x * 100)} % × {Math.round(value.y * 100)} %</small>
    </div>}
  </div>;
}
