"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, breadcrumbFor, PIECE_STATUTS, siblingsOf,
  type Piece, type PieceStatut, type PieceUsage, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure,
} from "@elsatia/releve-domain";
import { confirmRemovalMessage, formatHauteurCm, formatSurfaceM2, formatVolumeM3, parseHauteurCm } from "@/lib/releve/forms";
import { ficheHref, pieceHref, readPieceSelection, RELEVES_PATH, structureHref } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import { AutoNumber, AutoSelect, AutoText, SaveStatus, useAutosave } from "./autosave-ui";
import { PIECE_STATUT_LABELS, USAGE_LABELS } from "./labels";
import { PiecePhotosPanel } from "./PiecePhotosPanel";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { UsageOptions } from "./ReleveStructureWorkspace";
import { useReleveService } from "./use-releve-service";

/** Fiche pièce (Lot 3) : saisie terrain en sauvegarde automatique, navigation entre pièces. */
export function RelevePieceWorkspace() {
  const state = useReleveService();
  const [target, setTarget] = useState<{ releveId: string; pieceId: string } | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setTarget(readPieceSelection(window.location.search));
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, []);
  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${styles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${styles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && target === null && <p className={`shell ${styles.feedback}`} role="alert">Pièce introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && target && <PieceFiche key={`${target.releveId}:${target.pieceId}`} service={state.service} actor={state.actor} releveId={target.releveId as ReleveId} pieceId={target.pieceId} />}
  </main>;
}

function PieceFiche({ service, actor, releveId, pieceId }: { service: ReleveService; actor: ReleveActorContext; releveId: ReleveId; pieceId: string }) {
  const router = useRouter();
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [feedback, setFeedback] = useState("");
  const [resetKey, setResetKey] = useState(0);

  const reload = useCallback(async () => {
    try { setStructure(await service.get(releveId)); } catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [service, releveId]);
  useEffect(() => {
    let cancelled = false;
    service.get(releveId)
      .then((loaded) => { if (!cancelled) setStructure(loaded); })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Relevé introuvable ou non accessible."); });
    return () => { cancelled = true; };
  }, [service, releveId]);

  const piece = structure?.pieces.find((item) => item.id === pieceId && !item.deletedAt) ?? null;
  const canEdit = useMemo(() => (structure ? allowedActions(actor, structure.releve).includes("edit") : false), [actor, structure]);

  if (!structure) return <p className={`shell ${styles.feedback}`} role="status">{feedback || "Chargement de la pièce…"}</p>;
  if (!piece) return <p className={`shell ${styles.feedback}`} role="alert">Pièce introuvable ou retirée. <Link href={ficheHref(releveId)}>Fiche du relevé</Link></p>;

  const etage = structure.etages.find((item) => item.id === piece.etageId)!;
  const batiment = structure.batiments.find((item) => item.id === etage.batimentId)!;
  const chantierId = batiment.chantierId;
  const etageHref = structureHref({ releveId, chantierId, batimentId: batiment.id, etageId: etage.id });
  const crumbs = breadcrumbFor(structure, { kind: "piece", id: piece.id });
  const hrefOf = (level: string, id: string) => level === "projet" ? ficheHref(releveId)
    : level === "chantier" ? structureHref({ releveId, chantierId: id })
    : level === "batiment" ? structureHref({ releveId, chantierId, batimentId: id })
    : level === "etage" || level === "zone" ? etageHref : null;
  const siblings = siblingsOf(structure, "piece", piece.id);
  const index = siblings.findIndex((item) => item.id === piece.id);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  async function act(action: () => Promise<unknown>, message: string) {
    setFeedback("");
    try { await action(); await reload(); setFeedback(message); } catch (error) { setFeedback(error instanceof Error ? error.message : "Action impossible."); }
  }

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={styles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        {crumbs.map((crumb) => {
          const href = crumb.level === "piece" ? null : hrefOf(crumb.level, crumb.id);
          return <li key={`${crumb.level}:${crumb.id}`} aria-current={crumb.level === "piece" ? "page" : undefined}>{href ? <Link href={href}>{crumb.label}</Link> : crumb.label}</li>;
        })}
      </ol></nav>
      <p className="eyebrow">FICHE PIÈCE · {USAGE_LABELS[piece.usage].toUpperCase()} · {PIECE_STATUT_LABELS[piece.statut].toUpperCase()}</p>
      <h1 className="projects-title">{piece.nom}</h1>
      <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.pieceSheet}`}>
      {canEdit
        ? <PieceForm key={`${piece.id}:${resetKey}`} service={service} releveId={releveId} piece={piece} structure={structure} onChanged={reload} onReloaded={() => { void reload(); setResetKey((value) => value + 1); }} />
        : <dl className={styles.facts}>
          <div><dt>Type</dt><dd>{USAGE_LABELS[piece.usage]}</dd></div>
          <div><dt>Statut</dt><dd>{PIECE_STATUT_LABELS[piece.statut]}</dd></div>
          <div><dt>Hauteur</dt><dd>{piece.hauteurSousPlafondMm ? `${formatHauteurCm(piece.hauteurSousPlafondMm)} cm` : "—"}</dd></div>
          <div><dt>Commentaire</dt><dd>{piece.commentaire ?? "—"}</dd></div>
        </dl>}

      <PiecePhotosPanel releveId={releveId} pieceId={piece.id} actor={actor} canEdit={canEdit} />

      <section className={styles.column} aria-label="Métré calculé">
        <h2>Métré calculé</h2>
        <dl className={styles.facts}>
          <div><dt>Surface</dt><dd>{formatSurfaceM2(piece.surfaceCalculeeMm2)}</dd></div>
          <div><dt>Volume</dt><dd>{formatVolumeM3(piece.volumeCalculeMm3)}</dd></div>
        </dl>
        <p className={styles.feedback}>Calculés automatiquement à partir des murs relevés (lots suivants) : jamais saisis à la main.</p>
      </section>

      {canEdit && <section className={styles.column} aria-label="Actions sur la pièce">
        <h2>Actions</h2>
        <div className={styles.toolbar}>
          <button type="button" className={styles.secondary} onClick={() => void act(async () => {
            const copie = await service.duplicateNode(releveId, "piece", piece.id);
            router.push(pieceHref(releveId, copie));
          }, "Pièce dupliquée (sans photo ni mesure).")}>Dupliquer la pièce</button>
          <button type="button" className={styles.danger} onClick={() => {
            if (!window.confirm(confirmRemovalMessage(structure, "piece", piece.id, piece.nom))) return;
            void act(async () => { await service.removeNode(releveId, "piece", piece.id); router.push(etageHref); }, "Pièce retirée.");
          }}>Retirer la pièce</button>
        </div>
      </section>}
    </div>

    <nav className={styles.thumbBar} aria-label="Navigation entre pièces">
      {previous ? <Link className={styles.secondary} href={pieceHref(releveId, previous.id)}>‹ {previous.nom}</Link> : <span />}
      <Link className={styles.primary} href={etageHref}>{etage.nom}</Link>
      {next ? <Link className={styles.secondary} href={pieceHref(releveId, next.id)}>{next.nom} ›</Link> : <span />}
    </nav>
  </>;
}

function PieceForm({ service, releveId, piece, structure, onChanged, onReloaded }: {
  service: ReleveService; releveId: ReleveId; piece: Piece; structure: ReleveStructure; onChanged(): Promise<void>; onReloaded(): void;
}) {
  const api = useAutosave({
    revision: piece.revision,
    save: async (patch, revision) => ({ revision: (await service.updateNode(releveId, "piece", piece.id, patch, revision)).revision }),
    fetchRevision: async () => (await service.get(releveId)).pieces.find((item) => item.id === piece.id)?.revision ?? piece.revision,
    onSaved: () => void onChanged(),
    onReloaded,
  });
  const etage = structure.etages.find((item) => item.id === piece.etageId);
  const zones = structure.zones.filter((zone) => zone.etageId === piece.etageId && !zone.deletedAt);
  return <section className={styles.column} aria-label="Informations de la pièce">
    <h2>Pièce</h2>
    <SaveStatus api={api} label="pièce" />
    <div className={styles.propertiesGrid}>
      <AutoText api={api} name="nom" label="Nom" value={piece.nom} required maxLength={120} />
      <label className={styles.field}><span>Type</span>
        <TypeSelect value={piece.usage} onChange={(usage) => api.queue({ usage }, { immediate: true })} /></label>
      <AutoSelect<PieceStatut> api={api} name="statut" label="Statut" value={piece.statut} options={PIECE_STATUTS.map((value) => ({ value, label: PIECE_STATUT_LABELS[value] }))} />
      {zones.length > 0 && <AutoSelect api={api} name="zoneId" label="Zone" value={piece.zoneId} allowEmpty="Hors zone" options={zones.map((zone) => ({ value: zone.id as string, label: zone.nom }))} />}
      <AutoNumber api={api} name="hauteurSousPlafondMm" label="Hauteur sous plafond (cm)" value={piece.hauteurSousPlafondMm} parse={parseHauteurCm} format={formatHauteurCm}
        placeholder={etage?.hauteurSousPlafondMm ? formatHauteurCm(etage.hauteurSousPlafondMm) : "250"}
        hint={etage?.hauteurSousPlafondMm ? `Vide = hauteur de l'étage (${formatHauteurCm(etage.hauteurSousPlafondMm)} cm).` : undefined} />
    </div>
    <AutoText api={api} name="commentaire" label="Commentaire" value={piece.commentaire} multiline maxLength={4000} placeholder="Constats, réserves, points à vérifier…" />
  </section>;
}

function TypeSelect({ value, onChange }: { value: PieceUsage; onChange(usage: PieceUsage): void }) {
  const [current, setCurrent] = useState(value);
  return <select value={current} onChange={(event) => { setCurrent(event.target.value as PieceUsage); onChange(event.target.value as PieceUsage); }}><UsageOptions /></select>;
}
