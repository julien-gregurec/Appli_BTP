"use client";

/**
 * Relevé Lot 7 — panneaux des objets du plan : palette (catalogue par groupe), fiche de l'objet
 * sélectionné, calques (visible / masqué / verrouillé), groupes (tout masquer, tout supprimer avec
 * confirmation) et corbeille (restauration). Ne décide rien : chaque action remonte à l'éditeur,
 * qui la valide, l'inscrit dans l'historique (annuler / rétablir) et l'enregistre.
 */
import { useState } from "react";
import {
  EQUIPEMENT_CATALOGUE, EQUIPEMENT_CATEGORIE_LABELS, EQUIPEMENT_ETAT_PROJET_LABELS, EQUIPEMENT_ETATS_PROJET, EQUIPEMENT_GROUPES,
  PLAN_CALQUE_LABELS, PLAN_CALQUES, catalogueEntry,
  type EquipementCategorie, type EquipementEtatProjet, type PlanCalque, type PlanCalques, type PlanEquipement,
} from "@elsatia/releve-domain";
import { formatLongueurCm, parseAngleDegres, parseLongueurCm } from "@/lib/releve/plan/render";
import type { EquipmentPatch } from "@/lib/releve/plan/equipments";
import releveStyles from "../releve.module.css";
import styles from "./plan.module.css";

type Parsed = { ok: true; value: number | null } | { ok: false; message: string };

function Field({ label, value, testId, parse, format, onCommit, disabled }: {
  label: string; value: number | null; testId: string; parse(input: string): Parsed; format(value: number | null): string;
  onCommit(value: number | null): void; disabled?: boolean;
}) {
  const [text, setText] = useState(format(value)); const [error, setError] = useState("");
  const submit = () => {
    const parsed = parse(text);
    if (!parsed.ok) { setError(parsed.message); return; }
    setError("");
    if (parsed.value !== value) onCommit(parsed.value);
  };
  return <label className={releveStyles.field}><span>{label}</span>
    <input data-testid={testId} inputMode="decimal" value={text} disabled={disabled} aria-invalid={Boolean(error) || undefined}
      onChange={(event) => setText(event.target.value)} onBlur={submit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} />
    {error && <small className={releveStyles.fieldError}>{error}</small>}
  </label>;
}

const cm = (input: string): Parsed => parseLongueurCm(input);
const cmOrNull = (input: string): Parsed => (input.trim() ? parseLongueurCm(input) : { ok: true, value: null });
/** Niveau de pose (cm) : 0 (au sol) admis, vide = inconnu. */
const niveauCm = (input: string): Parsed => {
  const text = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, message: "Niveau en centimètres attendu (ex. 140)." };
  const mm = Math.round(Number(text) * 100) / 10;
  return mm > 20_000 ? { ok: false, message: "Niveau entre 0 et 2 000 cm." } : { ok: true, value: mm };
};

/** Palette : groupes puis objets du groupe (boutons ≥ 44 px, tablette d'abord). */
export function EquipmentPalette({ groupe, objet, onGroupe, onObjet }: {
  groupe: EquipementCategorie; objet: string; onGroupe(groupe: EquipementCategorie): void; onObjet(objet: string): void;
}) {
  const groupes = EQUIPEMENT_GROUPES.filter((item) => EQUIPEMENT_CATALOGUE.some((entry) => entry.categorie === item));
  return <div className={styles.palette} data-testid="plan-objets-palette">
    <div className={styles.toolbar} role="toolbar" aria-label="Groupes d'objets">
      {groupes.map((item) => <button key={item} type="button" aria-pressed={groupe === item} data-testid={`plan-groupe-${item}`} onClick={() => onGroupe(item)}>
        {EQUIPEMENT_CATEGORIE_LABELS[item]}
      </button>)}
    </div>
    <div className={styles.toolbar} role="toolbar" aria-label="Objets">
      {EQUIPEMENT_CATALOGUE.filter((entry) => entry.categorie === groupe).map((entry) => <button key={entry.objet} type="button" aria-pressed={objet === entry.objet}
        data-testid={`plan-objet-${entry.objet}`} onClick={() => onObjet(entry.objet)}>{entry.libelle}</button>)}
    </div>
  </div>;
}

export type ObjectPanelProps = {
  objet: PlanEquipement;
  editable: boolean;
  pieces: readonly { id: string; nom: string }[];
  murLabel: string | null;
  projete: boolean;
  onPatch(patch: EquipmentPatch, label: string): void;
  onKind(objet: string): void;
  onSize(largeurMm: number, profondeurMm: number): void;
  onRotation(degrees: number): void;
  onTurn(degrees: number): void;
  onPiece(pieceId: string | null): void;
  onDetach(): void;
  onDuplicate(): void;
  onDelete(): void;
};

/** Fiche de l'objet sélectionné : tous ses attributs, modifiables tant qu'il n'est pas verrouillé. */
export function ObjectPanel({ objet, editable, pieces, murLabel, projete, onPatch, onKind, onSize, onRotation, onTurn, onPiece, onDetach, onDuplicate, onDelete }: ObjectPanelProps) {
  const locked = objet.verrouille;
  const disabled = !editable || locked;
  const degrees = Math.round(((((objet.rotationRad * 180) / Math.PI) % 360 + 360) % 360) * 10) / 10 % 360;
  const [libelle, setLibelle] = useState(objet.libelle);
  const [commentaire, setCommentaire] = useState(objet.commentaire ?? "");
  const entry = catalogueEntry(objet.objet);
  return <section className={styles.section} aria-label="Objet sélectionné" data-testid="plan-objet-panel" data-locked={locked}>
    <h2>{objet.libelle} · {EQUIPEMENT_CATEGORIE_LABELS[objet.categorie]}</h2>
    {locked && <p className={releveStyles.feedback} role="status">Objet verrouillé : déverrouillez-le pour le modifier.</p>}
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Type</span>
        <select data-testid="plan-objet-type" value={objet.objet} disabled={disabled} onChange={(event) => onKind(event.target.value)}>
          {EQUIPEMENT_GROUPES.map((groupe) => <optgroup key={groupe} label={EQUIPEMENT_CATEGORIE_LABELS[groupe]}>
            {EQUIPEMENT_CATALOGUE.filter((item) => item.categorie === groupe).map((item) => <option key={item.objet} value={item.objet}>{item.libelle}</option>)}
          </optgroup>)}
        </select>
      </label>
      <label className={releveStyles.field}><span>Libellé</span>
        <input data-testid="plan-objet-libelle" value={libelle} disabled={disabled} maxLength={200} onChange={(event) => setLibelle(event.target.value)}
          onBlur={() => { if (libelle.trim() && libelle !== objet.libelle) onPatch({ libelle: libelle.trim() }, "Libellé de l'objet"); }} />
      </label>
      <Field label="Largeur (cm)" testId="plan-objet-largeur" value={objet.largeurMm} disabled={disabled} parse={cm} format={formatLongueurCm}
        onCommit={(v) => v !== null && onSize(v, objet.profondeurMm)} />
      <Field label="Profondeur (cm)" testId="plan-objet-profondeur" value={objet.profondeurMm} disabled={disabled} parse={cm} format={formatLongueurCm}
        onCommit={(v) => v !== null && onSize(objet.largeurMm, v)} />
      <Field label="Hauteur (cm)" testId="plan-objet-hauteur" value={objet.hauteurMm} disabled={disabled} parse={cmOrNull} format={formatLongueurCm}
        onCommit={(v) => onPatch({ hauteurMm: v }, "Hauteur de l'objet")} />
      <Field label="Niveau de pose (cm)" testId="plan-objet-niveau" value={objet.niveauMm} disabled={disabled} parse={niveauCm} format={formatLongueurCm}
        onCommit={(v) => onPatch({ niveauMm: v }, "Niveau de pose")} />
      <Field label="Rotation (°)" testId="plan-objet-rotation" value={degrees} disabled={disabled} parse={parseAngleDegres} format={(v) => (v === null ? "" : String(v))}
        onCommit={(v) => v !== null && onRotation(v)} />
      <label className={releveStyles.field}><span>Pièce</span>
        <select data-testid="plan-objet-piece" value={objet.pieceAuto ? "" : objet.pieceId ?? ""} disabled={disabled} onChange={(event) => onPiece(event.target.value || null)}>
          <option value="">Automatique{objet.pieceAuto && objet.pieceId ? ` (${pieces.find((piece) => piece.id === objet.pieceId)?.nom ?? "pièce"})` : objet.pieceAuto ? " (hors pièce)" : ""}</option>
          {pieces.map((piece) => <option key={piece.id} value={piece.id}>{piece.nom}</option>)}
        </select>
      </label>
      {(projete || objet.etatProjet) && <label className={releveStyles.field}><span>État projeté</span>
        <select data-testid="plan-objet-etat" value={objet.etatProjet ?? "existant"} disabled={disabled} onChange={(event) => onPatch({ etatProjet: event.target.value as EquipementEtatProjet }, "État projeté")}>
          {EQUIPEMENT_ETATS_PROJET.map((etat) => <option key={etat} value={etat}>{EQUIPEMENT_ETAT_PROJET_LABELS[etat]}</option>)}
        </select>
      </label>}
    </div>
    <label className={releveStyles.field}><span>Commentaire</span>
      <textarea data-testid="plan-objet-commentaire" value={commentaire} disabled={disabled} maxLength={2000} rows={2} onChange={(event) => setCommentaire(event.target.value)}
        onBlur={() => { if (commentaire !== (objet.commentaire ?? "")) onPatch({ commentaire: commentaire.trim() ? commentaire : null }, "Commentaire de l'objet"); }} />
    </label>
    <p className={releveStyles.feedback} data-testid="plan-objet-liaison">
      {murLabel ? `Lié au mur ${murLabel} (face ${objet.face === "droite" ? "droite" : "de référence"}) : il suit le mur.` : entry.mural ? "Objet mural : posez-le contre un mur pour le lier." : "Objet libre."}
    </p>
    {editable && <div className={releveStyles.toolbar}>
      <button type="button" className={releveStyles.secondary} disabled={locked} data-testid="plan-objet-tourner-gauche" onClick={() => onTurn(90)}>↺ 90°</button>
      <button type="button" className={releveStyles.secondary} disabled={locked} data-testid="plan-objet-tourner-droite" onClick={() => onTurn(-90)}>↻ 90°</button>
      {murLabel && <button type="button" className={releveStyles.secondary} disabled={locked} onClick={onDetach}>Détacher du mur</button>}
      <button type="button" className={releveStyles.secondary} data-testid="plan-objet-dupliquer" onClick={onDuplicate}>Dupliquer</button>
      <button type="button" className={releveStyles.secondary} disabled={locked} data-testid="plan-objet-visible" onClick={() => onPatch({ visible: !objet.visible }, objet.visible ? "Masquer l'objet" : "Afficher l'objet")}>
        {objet.visible ? "Masquer" : "Afficher"}
      </button>
      <button type="button" className={releveStyles.secondary} data-testid="plan-objet-verrou" onClick={() => onPatch({ verrouille: !locked }, locked ? "Déverrouiller l'objet" : "Verrouiller l'objet")}>
        {locked ? "Déverrouiller" : "Verrouiller"}
      </button>
      <button type="button" className={releveStyles.danger} disabled={locked} data-testid="plan-objet-supprimer" onClick={onDelete}>Supprimer</button>
    </div>}
  </section>;
}

export type LayersPanelProps = {
  calques: PlanCalques;
  editable: boolean;
  counts: Partial<Record<EquipementCategorie, { total: number; masques: number }>>;
  trash: readonly { objet: PlanEquipement }[];
  onCalque(calque: PlanCalque, patch: { visible?: boolean; verrouille?: boolean }): void;
  onGroup(categorie: EquipementCategorie, action: "masquer" | "afficher" | "supprimer"): void;
  onRestore(ids: readonly string[]): void;
};

/** Calques, groupes (tout masquer / tout supprimer) et corbeille. */
export function LayersPanel({ calques, editable, counts, trash, onCalque, onGroup, onRestore }: LayersPanelProps) {
  return <section className={styles.section} aria-label="Calques" data-testid="plan-calques">
    <h2>Calques</h2>
    <ul className={styles.list}>{PLAN_CALQUES.map((calque) => <li key={calque} className={styles.layerRow} data-testid={`plan-calque-${calque}`}
      data-visible={calques[calque].visible} data-locked={calques[calque].verrouille}>
      <span>{PLAN_CALQUE_LABELS[calque]}</span>
      <label className={styles.toggle}><input type="checkbox" data-testid={`plan-calque-${calque}-visible`} checked={calques[calque].visible}
        onChange={(event) => onCalque(calque, { visible: event.target.checked })} /> Visible</label>
      <label className={styles.toggle}><input type="checkbox" data-testid={`plan-calque-${calque}-verrou`} checked={calques[calque].verrouille} disabled={!editable}
        onChange={(event) => onCalque(calque, { verrouille: event.target.checked })} /> Verrouillé</label>
    </li>)}</ul>
    <h3>Groupes d&apos;objets</h3>
    <ul className={styles.list}>{EQUIPEMENT_GROUPES.filter((groupe) => (counts[groupe]?.total ?? 0) > 0).map((groupe) => {
      const count = counts[groupe]!;
      return <li key={groupe} data-testid={`plan-groupe-ligne-${groupe}`}>
        <span>{EQUIPEMENT_CATEGORIE_LABELS[groupe]} · {count.total} objet(s){count.masques ? ` dont ${count.masques} masqué(s)` : ""}</span>
        {editable && <div className={releveStyles.toolbar}>
          {count.masques < count.total && <button type="button" className={releveStyles.secondary} data-testid={`plan-groupe-masquer-${groupe}`} onClick={() => onGroup(groupe, "masquer")}>Tout masquer</button>}
          {count.masques > 0 && <button type="button" className={releveStyles.secondary} data-testid={`plan-groupe-afficher-${groupe}`} onClick={() => onGroup(groupe, "afficher")}>Tout afficher</button>}
          <button type="button" className={releveStyles.danger} data-testid={`plan-groupe-supprimer-${groupe}`} onClick={() => onGroup(groupe, "supprimer")}>Tout supprimer</button>
        </div>}
      </li>;
    })}</ul>
    {trash.length > 0 && <>
      <h3>Objets supprimés ({trash.length})</h3>
      {editable && <button type="button" className={releveStyles.secondary} data-testid="plan-corbeille-tout" onClick={() => onRestore(trash.map((item) => item.objet.id))}>Tout restaurer</button>}
      <ul className={styles.list} data-testid="plan-corbeille">{trash.slice(0, 50).map((item) => <li key={item.objet.id}>
        <span>{item.objet.libelle} · {EQUIPEMENT_CATEGORIE_LABELS[item.objet.categorie]}</span>
        {editable && <button type="button" className={styles.linkButton} data-testid="plan-corbeille-restaurer" onClick={() => onRestore([item.objet.id])}>Restaurer</button>}
      </li>)}</ul>
    </>}
  </section>;
}
