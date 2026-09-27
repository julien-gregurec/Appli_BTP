"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, breadcrumbOf, buildReleveTree, deletionImpact, etageLabel, PIECE_TYPES_PRINCIPAUX, suggestNextEtage,
  type EtageCategorie, type NodeKind, type PieceUsage, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure, type ZoneType,
} from "@elsatia/releve-domain";
import { ficheHref, pieceHref, readStructureSelection, RELEVES_PATH, structureHref, type StructureSelection } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import { ETAGE_CATEGORIE_CHOIX, PIECE_STATUT_LABELS, USAGE_LABELS, ZONE_TYPE_LABELS, ZONE_TYPES_PROPOSES } from "./labels";
import { ETAGE_CATEGORIE_LABELS } from "@elsatia/releve-domain";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { AutosaveBadge, useNodeAutosave } from "./useNodeAutosave";
import { useReleveService } from "./use-releve-service";

export function ReleveStructureWorkspace() {
  const state = useReleveService();
  const [selection, setSelection] = useState<StructureSelection | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setSelection(readStructureSelection(window.location.search));
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, []);

  const navigate = useCallback((next: StructureSelection) => {
    window.history.pushState(null, "", structureHref(next));
    setSelection(next);
  }, []);

  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${styles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${styles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && selection === null && <p className={`shell ${styles.feedback}`} role="alert">Relevé introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && selection && <StructureEditor key={selection.releveId} service={state.service} actor={state.actor} selection={selection} navigate={navigate} />}
  </main>;
}

type EditorProps = { service: ReleveService; actor: ReleveActorContext; selection: StructureSelection; navigate(next: StructureSelection): void };
type Ctx = { service: ReleveService; releveId: ReleveId; canEdit: boolean; run(action: () => Promise<unknown>, message: string): Promise<void>; reload(): Promise<void>; hardReload(): Promise<void>; generation: number; structure: ReleveStructure };

/**
 * Projet › Bâtiment › Étage › Zone › Pièce. Desktop / tablette paysage : trois colonnes
 * visibles. Téléphone : une seule colonne, celle du niveau sélectionné, et le fil d'Ariane
 * permanent pour remonter. Chaque nœud sélectionné offre renommer (enregistrement
 * automatique), monter / descendre, dupliquer, supprimer (confirmation + corbeille).
 */
function StructureEditor({ service, actor, selection, navigate }: EditorProps) {
  const releveId = selection.releveId as ReleveId;
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [feedback, setFeedback] = useState("");
  const [generation, setGeneration] = useState(0);

  const reload = useCallback(async () => {
    try { setStructure(await service.get(releveId)); } catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [service, releveId]);
  useEffect(() => {
    let cancelled = false;
    service.get(releveId)
      .then((loaded) => { if (!cancelled) setStructure(loaded); })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [service, releveId]);

  const tree = useMemo(() => (structure ? buildReleveTree(structure) : null), [structure]);
  const actions = useMemo(() => new Set(structure ? allowedActions(actor, structure.releve) : []), [actor, structure]);
  const canEdit = actions.has("edit");

  const run = useCallback(async (action: () => Promise<unknown>, message: string) => {
    setFeedback("");
    try { await action(); await reload(); setFeedback(message); } catch (error) { setFeedback(error instanceof Error ? error.message : "Action impossible."); await reload(); }
  }, [reload]);

  if (!structure || !tree) return <p className={`shell ${styles.feedback}`} role="status">{feedback || "Chargement du relevé…"}</p>;
  const hardReload = async () => { await reload(); setGeneration((value) => value + 1); };
  const ctx: Ctx = { service, releveId, canEdit, run, reload, hardReload, generation, structure };
  const { releve } = structure;
  const chantierNode = tree.chantiers.find((node) => node.chantier.id === selection.chantierId) ?? tree.chantiers[0] ?? null;
  const batiments = chantierNode?.batiments ?? [];
  const batimentNode = batiments.find((node) => node.batiment.id === selection.batimentId) ?? batiments[0] ?? null;
  const etageNode = batimentNode?.etages.find((node) => node.etage.id === selection.etageId) ?? batimentNode?.etages[0] ?? null;
  const chantierId = chantierNode?.chantier.id ?? null;
  // Téléphone : colonne active = niveau explicitement choisi le plus profond.
  const active = selection.etageId && etageNode ? "pieces" : selection.batimentId && batimentNode ? "etages" : "batiments";
  const crumbs = breadcrumbOf(structure, etageNode && selection.etageId ? { kind: "etage", id: etageNode.etage.id } : batimentNode && selection.batimentId ? { kind: "batiment", id: batimentNode.batiment.id } : null);
  const go = (level: "releve" | "batiment" | "etage", id?: string) => {
    if (level === "releve") navigate({ releveId, chantierId, batimentId: null, etageId: null });
    else if (level === "batiment") navigate({ releveId, chantierId, batimentId: id ?? null, etageId: null });
    else navigate({ releveId, chantierId, batimentId: batimentNode?.batiment.id ?? null, etageId: id ?? null });
  };

  return <>
    <section className="tool-hero"><div className="shell">
      <p className="eyebrow">STRUCTURE · {releve.visibilite === "entreprise" ? "PARTAGÉ AVEC L'ENTREPRISE" : "PRIVÉ"}</p>
      <h1 className="projects-title">{releve.nom}</h1>
      <div className={styles.toolbar}>
        {tree.chantiers.length > 1 && <label className={styles.field}><span>Chantier</span>
          <select value={chantierId ?? ""} onChange={(event) => navigate({ releveId, chantierId: event.target.value, batimentId: null, etageId: null })}>
            {tree.chantiers.map(({ chantier }) => <option key={chantier.id} value={chantier.id}>{chantier.nom}</option>)}
          </select></label>}
        <Link className={styles.secondary} href={ficheHref(releveId)}>Fiche du relevé</Link>
      </div>
      <p className={styles.feedback} role="status" aria-live="polite" data-testid="structure-feedback">{feedback}</p>
    </div></section>

    <nav className={styles.crumbBar} aria-label="Fil d'Ariane"><div className="shell">
      <ol className={styles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const onClick = () => go(crumb.kind === "batiment" ? "batiment" : "etage", crumb.id);
          // Le projet ouvre toujours sa fiche ; les niveaux inférieurs restent dans l'écran structure.
          return <li key={crumb.id}>{crumb.kind === "releve" ? <Link href={ficheHref(releveId)}>{crumb.label}</Link>
            : last ? <span aria-current="location">{crumb.label}</span>
              : <button type="button" className={styles.crumbButton} onClick={onClick}>{crumb.label}</button>}</li>;
        })}
      </ol>
    </div></nav>

    <div className={`shell ${styles.levels}`} data-active={active}>
      <section className={styles.column} aria-label="Bâtiments" data-column="batiments">
        <h2>Bâtiments</h2>
        {batiments.map(({ batiment, etages }) => {
          const selected = batiment.id === batimentNode?.batiment.id;
          return <div key={batiment.id} className={styles.nodeBlock}>
            <div className={styles.node} aria-current={selected}>
              <button type="button" className={styles.select} onClick={() => navigate({ releveId, chantierId, batimentId: batiment.id, etageId: null })}><span>{batiment.nom}</span></button>
              <small className={styles.count}>{etages.length} ét.</small>
            </div>
            {selected && canEdit && <NodeTools key={`${batiment.id}:${generation}`} ctx={ctx} kind="batiment" id={batiment.id} nom={batiment.nom} revision={batiment.revision} duplicable onDeleted={() => go("releve")} />}
          </div>;
        })}
        {batiments.length === 0 && <p className={styles.feedback}>Aucun bâtiment.</p>}
        {canEdit && <InlineForm label="Ajouter un bâtiment" placeholder="Bâtiment A" onSubmit={(nom) => run(() => service.addBatiment(releveId, { nom, chantierId }), "Bâtiment ajouté.")} />}
      </section>

      <section className={styles.column} aria-label="Étages" data-column="etages">
        <h2>Étages{batimentNode ? ` · ${batimentNode.batiment.nom}` : ""}</h2>
        {batimentNode?.etages.map(({ etage, zones, piecesSansZone }) => {
          const selected = etage.id === etageNode?.etage.id;
          const pieces = zones.reduce((total, zone) => total + zone.pieces.length, piecesSansZone.length);
          return <div key={etage.id} className={styles.nodeBlock}>
            <div className={styles.node} aria-current={selected}>
              <button type="button" className={styles.select} onClick={() => navigate({ releveId, chantierId, batimentId: batimentNode.batiment.id, etageId: etage.id })}><span>{etage.nom}</span> <small>{etageLabel(etage)}{etage.etat === "projet" ? " · projet" : ""}</small></button>
              <small className={styles.count}>{pieces} p.</small>
            </div>
            {selected && canEdit && <NodeTools key={`${etage.id}:${generation}`} ctx={ctx} kind="etage" id={etage.id} nom={etage.nom} revision={etage.revision} duplicable onDeleted={() => go("batiment", batimentNode.batiment.id)} />}
          </div>;
        })}
        {batimentNode && batimentNode.etages.length === 0 && <p className={styles.feedback}>Aucun étage.</p>}
        {!batimentNode && <p className={styles.feedback}>Ajoutez d’abord un bâtiment.</p>}
        {canEdit && batimentNode && <EtageForm etages={batimentNode.etages.map((node) => node.etage)} onSubmit={(nom, niveau, categorie, hsp) => run(() => service.addEtage(releveId, batimentNode.batiment.id, { nom, niveau, categorieNiveau: categorie, hauteurSousPlafondMm: hsp }), "Étage ajouté.")} />}
      </section>

      <section className={styles.column} aria-label="Zones et pièces" data-column="pieces">
        <h2>Zones et pièces{etageNode ? ` · ${etageNode.etage.nom}` : ""}</h2>
        {etageNode?.zones.map(({ zone, pieces }) => <div key={zone.id} className={styles.zone}>
          <h3><span>{zone.nom} <small>{ZONE_TYPE_LABELS[zone.type]}</small></span></h3>
          {canEdit && <NodeTools key={`${zone.id}:${generation}`} ctx={ctx} kind="zone" id={zone.id} nom={zone.nom} revision={zone.revision} compact />}
          <PieceList ctx={ctx} pieces={pieces} />
        </div>)}
        {etageNode && etageNode.piecesSansZone.length > 0 && <div className={styles.zone}><h3>Hors zone</h3><PieceList ctx={ctx} pieces={etageNode.piecesSansZone} /></div>}
        {etageNode && etageNode.zones.length === 0 && etageNode.piecesSansZone.length === 0 && <p className={styles.feedback}>Aucune pièce sur cet étage.</p>}
        {!etageNode && <p className={styles.feedback}>Ajoutez d’abord un étage.</p>}
        {canEdit && etageNode && <>
          <ZoneForm onSubmit={(nom, type) => run(() => service.addZone(releveId, etageNode.etage.id, { nom, type }), "Zone ajoutée.")} />
          <PieceForm zones={etageNode.zones.map(({ zone }) => ({ id: zone.id, nom: zone.nom }))} onSubmit={(nom, usage, zoneId) => run(() => service.addPiece(releveId, etageNode.etage.id, { nom, usage, zoneId }), "Pièce ajoutée.")} />
        </>}
      </section>
    </div>
  </>;
}

/** Outils d'un nœud sélectionné : nom (enregistrement automatique), ordre, duplication, suppression. */
function NodeTools({ ctx, kind, id, nom, revision, duplicable = false, compact = false, onDeleted }: { ctx: Ctx; kind: NodeKind; id: string; nom: string; revision: number; duplicable?: boolean; compact?: boolean; onDeleted?(): void }) {
  const { service, releveId, run, structure, reload, hardReload } = ctx;
  const save = useCallback(async (patch: Partial<{ nom: string }>, expected: number) => {
    const next = await service.updateNode(releveId, kind, id, patch, expected);
    await reload();
    return next;
  }, [service, releveId, kind, id, reload]);
  const autosave = useNodeAutosave({ nom }, revision, save);
  const [label, du, le] = ({ chantier: ["chantier", "du chantier", "le chantier"], batiment: ["bâtiment", "du bâtiment", "le bâtiment"], etage: ["étage", "de l’étage", "l’étage"], zone: ["zone", "de la zone", "la zone"], piece: ["pièce", "de la pièce", "la pièce"] } as const)[kind];

  function remove() {
    const impact = deletionImpact(structure, { kind, id });
    const parts = [impact.etages && `${impact.etages} étage(s)`, impact.zones && `${impact.zones} zone(s)`, impact.pieces && `${impact.pieces} pièce(s)`].filter(Boolean);
    const detail = kind === "zone" ? (impact.piecesDetachees ? ` Ses ${impact.piecesDetachees} pièce(s) restent sur l'étage, sans zone.` : "")
      : parts.length ? ` Sont aussi retirés : ${parts.join(", ")}.` : "";
    if (window.confirm(`Supprimer ${le} « ${nom} » ?${detail} Tout reste restaurable depuis la corbeille de la fiche du relevé.`)) {
      void run(() => service.removeNode(releveId, kind, id), `« ${nom} » supprimé (restaurable).`).then(() => onDeleted?.());
    }
  }

  return <div className={compact ? styles.toolsCompact : styles.tools} aria-label={`Actions sur ${label} ${nom}`}>
    <label className={styles.field}><span>Nom {du}</span>
      <input value={String(autosave.values.nom ?? "")} maxLength={120} onChange={(event) => autosave.set("nom", event.target.value)} onBlur={() => void autosave.flush()} aria-label={`Nom ${du} ${nom}`} />
    </label>
    <AutosaveBadge state={autosave.state} onRetry={() => void autosave.retry()} onReload={() => void hardReload()} />
    <div className={styles.toolButtons}>
      <button type="button" className={styles.iconButton} aria-label={`Monter ${nom}`} onClick={() => void run(() => service.move(releveId, kind, id, -1), "Ordre modifié.")}>↑</button>
      <button type="button" className={styles.iconButton} aria-label={`Descendre ${nom}`} onClick={() => void run(() => service.move(releveId, kind, id, 1), "Ordre modifié.")}>↓</button>
      {duplicable && (kind === "batiment" || kind === "etage") && <button type="button" className={styles.secondary} onClick={() => void run(() => service.duplicate(releveId, kind, id), `« ${nom} » dupliqué (structure seule, sans photos ni mesures).`)}>Dupliquer</button>}
      <button type="button" className={styles.danger} onClick={remove}>Supprimer</button>
    </div>
  </div>;
}

function PieceList({ ctx, pieces }: { ctx: Ctx; pieces: ReleveStructure["pieces"] }) {
  const { service, releveId, run, canEdit } = ctx;
  return <ul className={styles.pieces}>{pieces.map((piece, index) => <li key={piece.id} className={styles.piece}>
    <Link className={styles.pieceLink} href={pieceHref(releveId, piece.id)}><strong>{piece.nom}</strong> <small>{USAGE_LABELS[piece.usage]}{piece.statut ? ` · ${PIECE_STATUT_LABELS[piece.statut]}` : ""}</small></Link>
    {canEdit && <span className={styles.toolButtons}>
      <button type="button" className={styles.iconButton} aria-label={`Monter ${piece.nom}`} disabled={index === 0} onClick={() => void run(() => service.move(releveId, "piece", piece.id, -1), "Ordre modifié.")}>↑</button>
      <button type="button" className={styles.iconButton} aria-label={`Descendre ${piece.nom}`} disabled={index === pieces.length - 1} onClick={() => void run(() => service.move(releveId, "piece", piece.id, 1), "Ordre modifié.")}>↓</button>
    </span>}
  </li>)}</ul>;
}

function InlineForm({ label, placeholder, onSubmit }: { label: string; placeholder: string; onSubmit(nom: string): Promise<void> }) {
  const [nom, setNom] = useState("");
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom).then(() => setNom("")); }}>
    <label className={styles.field}><span>{label}</span><input value={nom} maxLength={120} placeholder={placeholder} onChange={(event) => setNom(event.target.value)} /></label>
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}

/** Étage : nom libre (Sous-sol, Combles…), niveau FACULTATIF et décimal, catégorie. */
function EtageForm({ etages, onSubmit }: { etages: ReleveStructure["etages"]; onSubmit(nom: string, niveau: number | null, categorie: EtageCategorie, hsp: number | null): Promise<void> }) {
  const suggestion = suggestNextEtage(etages);
  const [nom, setNom] = useState(""); const [niveau, setNiveau] = useState<string>(""); const [categorie, setCategorie] = useState<EtageCategorie | "">(""); const [hsp, setHsp] = useState("");
  const sansNiveau = categorie === "combles" || categorie === "toiture" || categorie === "exterieur" || categorie === "autre";
  const effectiveNiveau = niveau.trim() === "" ? (sansNiveau ? null : suggestion.niveau) : Number(niveau.replace(",", "."));
  const effectiveCategorie: EtageCategorie = categorie || (effectiveNiveau === null ? "autre" : effectiveNiveau < 0 ? "sous_sol" : effectiveNiveau === 0 ? "rdc" : "etage");
  const placeholder = sansNiveau ? ETAGE_CATEGORIE_LABELS[effectiveCategorie] : suggestion.nom;
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); void onSubmit(nom || placeholder, effectiveNiveau, effectiveCategorie, hsp ? Math.round(Number(hsp.replace(",", ".")) * 10) : null).then(() => { setNom(""); setNiveau(""); setHsp(""); setCategorie(""); }); }}>
    <label className={styles.field}><span>Ajouter un étage</span><input value={nom} maxLength={120} placeholder={placeholder} onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Type de niveau</span><select value={categorie} onChange={(event) => setCategorie(event.target.value as EtageCategorie | "")}>
      <option value="">Automatique</option>{ETAGE_CATEGORIE_CHOIX.map((value) => <option key={value} value={value}>{ETAGE_CATEGORIE_LABELS[value]}</option>)}</select></label>
    <label className={styles.field}><span>Niveau (0 = RDC)</span><input inputMode="decimal" value={niveau} placeholder={sansNiveau ? "facultatif" : String(suggestion.niveau)} onChange={(event) => setNiveau(event.target.value)} /></label>
    <label className={styles.field}><span>Hauteur sous plafond (cm)</span><input type="number" min={50} max={2000} step={0.5} value={hsp} placeholder="250" onChange={(event) => setHsp(event.target.value)} /></label>
    <button className={styles.secondary} type="submit">Ajouter</button>
  </form>;
}

function ZoneForm({ onSubmit }: { onSubmit(nom: string, type: ZoneType): Promise<void> }) {
  const [nom, setNom] = useState(""); const [type, setType] = useState<ZoneType>("appartement");
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom, type).then(() => setNom("")); }}>
    <label className={styles.field}><span>Ajouter une zone (facultatif)</span><input value={nom} maxLength={120} placeholder="Appartement 12, aile est…" onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Type de zone</span><select value={type} onChange={(event) => setType(event.target.value as ZoneType)}>{ZONE_TYPES_PROPOSES.map((value) => <option key={value} value={value}>{ZONE_TYPE_LABELS[value]}</option>)}</select></label>
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}

function PieceForm({ zones, onSubmit }: { zones: Array<{ id: string; nom: string }>; onSubmit(nom: string, usage: PieceUsage, zoneId: string | null): Promise<void> }) {
  const [nom, setNom] = useState(""); const [usage, setUsage] = useState<PieceUsage>("sejour"); const [zoneId, setZoneId] = useState("");
  const autres = (Object.keys(USAGE_LABELS) as PieceUsage[]).filter((value) => !(PIECE_TYPES_PRINCIPAUX as readonly string[]).includes(value));
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom, usage, zoneId || null).then(() => setNom("")); }}>
    <label className={styles.field}><span>Ajouter une pièce</span><input value={nom} maxLength={120} placeholder="Séjour" onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Type</span><select value={usage} onChange={(event) => setUsage(event.target.value as PieceUsage)}>
      <optgroup label="Principaux">{PIECE_TYPES_PRINCIPAUX.map((value) => <option key={value} value={value}>{USAGE_LABELS[value]}</option>)}</optgroup>
      <optgroup label="Autres">{autres.map((value) => <option key={value} value={value}>{USAGE_LABELS[value]}</option>)}</optgroup>
    </select></label>
    {zones.length > 0 && <label className={styles.field}><span>Zone</span><select value={zoneId} onChange={(event) => setZoneId(event.target.value)}><option value="">Hors zone</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom}</option>)}</select></label>}
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}
