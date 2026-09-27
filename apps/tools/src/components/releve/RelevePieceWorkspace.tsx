"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, breadcrumbOf, deletionImpact, pieceFiche, PIECE_STATUTS, PIECE_TYPES_PRINCIPAUX, surfaceM2, surfaceMm2FromM2, volumeM3,
  type Piece, type PieceStatut, type PieceUsage, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure,
} from "@elsatia/releve-domain";
import { ficheHref, pieceHref, readPieceSelection, RELEVES_PATH, structureHref } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import { PIECE_STATUT_LABELS, USAGE_LABELS } from "./labels";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { AutosaveBadge, useNodeAutosave } from "./useNodeAutosave";
import { useReleveService } from "./use-releve-service";

export function RelevePieceWorkspace() {
  const state = useReleveService();
  const [selection, setSelection] = useState<{ releveId: string; pieceId: string } | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setSelection(readPieceSelection(window.location.search));
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, []);
  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${styles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${styles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && selection === null && <p className={`shell ${styles.feedback}`} role="alert">Pièce introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && selection && <PieceEditor key={selection.pieceId} service={state.service} actor={state.actor} releveId={selection.releveId as ReleveId} pieceId={selection.pieceId} />}
  </main>;
}

type Fields = { nom: string; usage: PieceUsage; statut: PieceStatut; hauteurSousPlafondMm: number | null; surfaceDeclareeMm2: number | null; commentaire: string | null; zoneId: string | null };
const fieldsOf = (piece: Piece): Fields => ({
  nom: piece.nom, usage: piece.usage, statut: piece.statut ?? "a_relever", hauteurSousPlafondMm: piece.hauteurSousPlafondMm,
  surfaceDeclareeMm2: piece.surfaceDeclareeMm2 ?? null, commentaire: piece.commentaire ?? null, zoneId: piece.zoneId,
});

function PieceEditor({ service, actor, releveId, pieceId }: { service: ReleveService; actor: ReleveActorContext; releveId: ReleveId; pieceId: string }) {
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [feedback, setFeedback] = useState("");
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(async () => {
    try { setStructure(await service.get(releveId)); } catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [service, releveId]);
  // Après un conflit : recharger ET repartir des valeurs serveur (remontage du formulaire).
  const hardReload = useCallback(async () => { await reload(); setGeneration((value) => value + 1); }, [reload]);
  useEffect(() => {
    let cancelled = false;
    service.get(releveId).then((loaded) => { if (!cancelled) setStructure(loaded); })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [service, releveId]);

  const piece = structure?.pieces.find((item) => item.id === pieceId && !item.deletedAt) ?? null;
  if (!structure) return <p className={`shell ${styles.feedback}`} role="status">{feedback || "Chargement de la pièce…"}</p>;
  if (!piece) return <p className={`shell ${styles.feedback}`} role="alert">Pièce introuvable ou supprimée. <Link href={ficheHref(releveId)}>Retour au relevé</Link></p>;
  return <PieceForm key={`${piece.id}:${generation}`} service={service} actor={actor} structure={structure} piece={piece} reload={reload} hardReload={hardReload} feedback={feedback} setFeedback={setFeedback} />;
}

function PieceForm({ service, actor, structure, piece, reload, hardReload, feedback, setFeedback }: { service: ReleveService; actor: ReleveActorContext; structure: ReleveStructure; piece: Piece; reload(): Promise<void>; hardReload(): Promise<void>; feedback: string; setFeedback(value: string): void }) {
  const router = useRouter();
  const releveId = structure.releve.id;
  const canEdit = useMemo(() => allowedActions(actor, structure.releve).includes("edit"), [actor, structure]);
  const save = useCallback(async (patch: Partial<Fields>, expected: number) => {
    const next = await service.updateNode(releveId, "piece", piece.id, patch, expected);
    await reload();
    return next;
  }, [service, releveId, piece.id, reload]);
  const initial = useMemo(() => fieldsOf(piece), [piece]);
  const autosave = useNodeAutosave<Fields>(initial, piece.revision, save);
  const values = autosave.values;
  const fiche = pieceFiche(structure, piece.id)!;
  const zones = structure.zones.filter((zone) => zone.etageId === piece.etageId && !zone.deletedAt);
  const crumbs = breadcrumbOf(structure, { kind: "piece", id: piece.id });
  const etageHref = fiche.etage && fiche.batiment ? structureHref({ releveId, chantierId: fiche.batiment.chantierId, batimentId: fiche.batiment.id, etageId: fiche.etage.id }) : ficheHref(releveId);
  const [surfaceText, setSurfaceText] = useState(values.surfaceDeclareeMm2 == null ? "" : String(surfaceM2(values.surfaceDeclareeMm2)).replace(".", ","));
  const [hauteurText, setHauteurText] = useState(values.hauteurSousPlafondMm == null ? "" : String(values.hauteurSousPlafondMm / 10).replace(".", ","));
  const numberOrNull = (text: string) => { const value = Number(text.replace(",", ".").trim()); return text.trim() === "" || !Number.isFinite(value) ? null : value; };
  const autres = (Object.keys(USAGE_LABELS) as PieceUsage[]).filter((value) => !(PIECE_TYPES_PRINCIPAUX as readonly string[]).includes(value));
  const hauteurAffichee = values.hauteurSousPlafondMm ?? fiche.etage?.hauteurSousPlafondMm ?? null;
  const volume = values.surfaceDeclareeMm2 != null && hauteurAffichee != null ? values.surfaceDeclareeMm2 * hauteurAffichee : null;

  async function action(run: () => Promise<unknown>, message: string) {
    setFeedback("");
    try { await run(); setFeedback(message); } catch (error) { setFeedback(error instanceof Error ? error.message : "Action impossible."); }
  }

  return <>
    <nav className={styles.crumbBar} aria-label="Fil d'Ariane"><div className="shell">
      <ol className={styles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        {crumbs.map((crumb, index) => <li key={crumb.id}>{index === crumbs.length - 1 ? <span aria-current="location">{crumb.label}</span>
          : <Link href={crumb.kind === "releve" ? ficheHref(releveId) : crumb.kind === "batiment" ? structureHref({ releveId, chantierId: fiche.batiment?.chantierId ?? null, batimentId: crumb.id }) : etageHref}>{crumb.label}</Link>}</li>)}
      </ol>
    </div></nav>
    <section className="tool-hero"><div className="shell">
      <p className="eyebrow">FICHE PIÈCE · {PIECE_STATUT_LABELS[values.statut].toUpperCase()}</p>
      <h1 className="projects-title">{values.nom || piece.nom}</h1>
      <AutosaveBadge label="Fiche pièce" state={autosave.state} onRetry={() => void autosave.retry()} onReload={() => void hardReload()} />
      <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.fiche}`}>
      <section className={styles.column} aria-label="Identité de la pièce">
        <h2>Pièce</h2>
        <div className={styles.formGrid}>
          <label className={styles.field}><span>Nom</span><input value={values.nom} maxLength={120} disabled={!canEdit} onChange={(event) => autosave.set("nom", event.target.value)} onBlur={() => void autosave.flush()} /></label>
          <label className={styles.field}><span>Type</span><select value={values.usage} disabled={!canEdit} onChange={(event) => autosave.set("usage", event.target.value as PieceUsage)}>
            <optgroup label="Principaux">{PIECE_TYPES_PRINCIPAUX.map((value) => <option key={value} value={value}>{USAGE_LABELS[value]}</option>)}</optgroup>
            <optgroup label="Autres">{autres.map((value) => <option key={value} value={value}>{USAGE_LABELS[value]}</option>)}</optgroup>
          </select></label>
          <label className={styles.field}><span>Hauteur sous plafond (cm)</span><input inputMode="decimal" value={hauteurText} disabled={!canEdit} placeholder={fiche.etage?.hauteurSousPlafondMm ? `${fiche.etage.hauteurSousPlafondMm / 10} (étage)` : "250"}
            onChange={(event) => { setHauteurText(event.target.value); const cm = numberOrNull(event.target.value); autosave.set("hauteurSousPlafondMm", cm === null ? null : Math.round(cm * 10)); }} onBlur={() => void autosave.flush()} /></label>
          <label className={styles.field}><span>Zone</span><select value={values.zoneId ?? ""} disabled={!canEdit} onChange={(event) => autosave.set("zoneId", event.target.value || null)}>
            <option value="">Hors zone</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom}</option>)}</select></label>
        </div>
        <fieldset className={styles.segmented} disabled={!canEdit}><legend>Statut du relevé</legend>
          {PIECE_STATUTS.map((statut) => <label key={statut} data-checked={values.statut === statut}><input type="radio" name="statut" value={statut} checked={values.statut === statut} onChange={() => autosave.set("statut", statut)} />{PIECE_STATUT_LABELS[statut]}</label>)}
        </fieldset>
        <label className={styles.field}><span>Commentaire</span><textarea rows={4} maxLength={4000} value={values.commentaire ?? ""} disabled={!canEdit} onChange={(event) => autosave.set("commentaire", event.target.value || null)} onBlur={() => void autosave.flush()} /></label>
      </section>

      <section className={styles.column} aria-label="Métré préparé">
        <h2>Surfaces et volume</h2>
        <label className={styles.field}><span>Surface déclarée (m²)</span><input inputMode="decimal" value={surfaceText} disabled={!canEdit} placeholder="Saisie terrain"
          onChange={(event) => { setSurfaceText(event.target.value); autosave.set("surfaceDeclareeMm2", surfaceMm2FromM2(numberOrNull(event.target.value))); }} onBlur={() => void autosave.flush()} /></label>
        <dl className={styles.facts}>
          <div><dt>Hauteur retenue</dt><dd>{hauteurAffichee == null ? "Inconnue" : `${(hauteurAffichee / 1000).toFixed(2).replace(".", ",")} m`}{values.hauteurSousPlafondMm == null && hauteurAffichee != null ? " (étage)" : ""}</dd></div>
          <div><dt>Volume</dt><dd data-testid="volume">{volume == null ? "Surface et hauteur nécessaires" : `${String(volumeM3(volume)).replace(".", ",")} m³`}</dd></div>
          <div><dt>Surface calculée</dt><dd>Plan de la pièce (lot 5)</dd></div>
        </dl>
        <h2>Préparé pour la suite</h2>
        <ul className={styles.pieces}>
          {([["Revêtements", fiche.preparation.revetements, "lot 10"], ["Photos", fiche.preparation.photos, "lot 4"], ["Mesures", fiche.preparation.mesures, "lot 4"], ["Équipements", fiche.preparation.equipements, "lot 8"]] as const)
            .map(([label, count, lot]) => <li key={label} className={styles.piece}><span><strong>{label}</strong> <small>{count ? `${count} rattaché(s)` : `à venir (${lot})`}</small></span></li>)}
        </ul>
        {canEdit && <div className={styles.toolButtons}>
          <button type="button" className={styles.secondary} onClick={() => void action(async () => { const id = await service.duplicate(releveId, "piece", piece.id); await reload(); router.push(pieceHref(releveId, id)); }, "Pièce dupliquée (sans photos ni mesures).")}>Dupliquer la pièce</button>
          <button type="button" className={styles.danger} onClick={() => {
            const impact = deletionImpact(structure, { kind: "piece", id: piece.id });
            if (window.confirm(`Supprimer la pièce « ${piece.nom} » ?${impact.pieces ? "" : " Elle reste restaurable depuis la corbeille de la fiche du relevé."}`)) {
              void action(async () => { await service.removeNode(releveId, "piece", piece.id); router.push(etageHref); }, "Pièce supprimée (restaurable).");
            }
          }}>Supprimer la pièce</button>
        </div>}
      </section>
    </div>
  </>;
}
