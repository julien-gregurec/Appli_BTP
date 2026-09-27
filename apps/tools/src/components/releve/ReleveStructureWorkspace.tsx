"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, buildReleveTree, ETAGE_TYPE_NIVEAU_LABELS, ETAGE_TYPES_NIVEAU, etageNiveauLabel, PIECE_USAGES, PIECE_USAGES_SUGGERES,
  searchStructure, siblingsOf, suggestEtages, ZONE_TYPES,
  type DuplicableKind, type EtageTypeNiveau, type Piece, type PieceUsage, type ReleveActorContext, type ReleveId, type ReleveService,
  type ReleveStructure, type StructureKind, type ZoneType,
} from "@elsatia/releve-domain";
import { formatAltitudeM, formatHauteurCm, confirmRemovalMessage, parseAltitudeM, parseHauteurCm, parseNiveau } from "@/lib/releve/forms";
import {
  ficheHref, photosHref, pieceHref, readStructureSelection, RELEVES_PATH, searchHitHref, structureFocus, structureHref, type StructureSelection,
} from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import { AutoNumber, AutoSelect, AutoText, SaveStatus, useAutosave } from "./autosave-ui";
import { PIECE_STATUT_LABELS, USAGE_LABELS, ZONE_TYPE_LABELS } from "./labels";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
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
type RunAction = (action: () => Promise<unknown>, message: string) => Promise<void>;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === "ReleveConflictError") return "Modifié ailleurs entre-temps : l'écran a été rechargé, rien n'a été écrasé.";
  return error instanceof Error && error.message ? error.message : fallback;
}

function StructureEditor({ service, actor, selection, navigate }: EditorProps) {
  const releveId = selection.releveId as ReleveId;
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [feedback, setFeedback] = useState("");
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    try { setStructure(await service.get(releveId)); } catch (error) { setFeedback(errorMessage(error, "Chargement impossible.")); }
  }, [service, releveId]);
  useEffect(() => {
    let cancelled = false;
    service.get(releveId)
      .then((loaded) => { if (!cancelled) setStructure(loaded); })
      .catch((error: unknown) => { if (!cancelled) setFeedback(errorMessage(error, "Chargement impossible.")); });
    return () => { cancelled = true; };
  }, [service, releveId]);

  const tree = useMemo(() => (structure ? buildReleveTree(structure) : null), [structure]);
  const actions = useMemo(() => new Set(structure ? allowedActions(actor, structure.releve) : []), [actor, structure]);
  const canEdit = actions.has("edit");
  const hits = useMemo(() => (structure && query.trim().length >= 2 ? searchStructure(structure, query).filter((hit) => hit.entite !== "releve") : []), [structure, query]);

  const run: RunAction = async (action, message) => {
    setFeedback("");
    try { await action(); await reload(); setFeedback(message); } catch (error) { await reload(); setFeedback(errorMessage(error, "Action impossible.")); }
  };

  if (!structure || !tree) return <p className={`shell ${styles.feedback}`} role="status">{feedback || "Chargement du relevé…"}</p>;
  const { releve } = structure;
  const chantierNode = tree.chantiers.find((node) => node.chantier.id === selection.chantierId) ?? tree.chantiers[0] ?? null;
  const batiments = chantierNode?.batiments ?? [];
  const batimentNode = batiments.find((node) => node.batiment.id === selection.batimentId) ?? batiments[0] ?? null;
  const etageNode = batimentNode?.etages.find((node) => node.etage.id === selection.etageId) ?? batimentNode?.etages[0] ?? null;
  const chantierId = chantierNode?.chantier.id ?? null;
  const focus = structureFocus(selection);
  const nodeProps = { service, releveId, structure, canEdit, run };
  const addTarget = focus === "batiments" ? "add-batiment" : focus === "etages" ? "add-etage" : "add-piece";

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={styles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        <li><Link href={ficheHref(releveId)}>{releve.nom}</Link></li>
        {chantierNode && <li><Link href={structureHref({ releveId, chantierId })}>{chantierNode.chantier.nom}</Link></li>}
        {batimentNode && <li><Link href={structureHref({ releveId, chantierId, batimentId: batimentNode.batiment.id })} onClick={(event) => { event.preventDefault(); navigate({ releveId, chantierId, batimentId: batimentNode.batiment.id, etageId: null }); }}>{batimentNode.batiment.nom}</Link></li>}
        {etageNode && <li aria-current="page">{etageNode.etage.nom}</li>}
      </ol></nav>
      <p className="eyebrow">STRUCTURE · {releve.visibilite === "entreprise" ? "PARTAGÉ AVEC L'ENTREPRISE" : "PRIVÉ"}{canEdit ? "" : " · LECTURE SEULE"}</p>
      <h1 className="projects-title">{releve.nom}</h1>
      <div className={styles.toolbar}>
        {tree.chantiers.length > 1 && <label className={styles.field}><span>Chantier</span>
          <select value={chantierId ?? ""} onChange={(event) => navigate({ releveId, chantierId: event.target.value, batimentId: null, etageId: null })}>
            {tree.chantiers.map(({ chantier }) => <option key={chantier.id} value={chantier.id}>{chantier.nom}</option>)}
          </select></label>}
        <label className={`${styles.field} ${styles.search}`}><span>Rechercher dans ce relevé</span>
          <input type="search" value={query} maxLength={80} placeholder="Bâtiment, étage, pièce…" onChange={(event) => setQuery(event.target.value)} /></label>
        <Link className={styles.secondary} href={ficheHref(releveId)}>Fiche du relevé</Link>
        <Link className={styles.secondary} href={photosHref(releveId)}>Photos terrain</Link>
      </div>
      {query.trim().length >= 2 && <ul className={styles.hits} aria-label="Résultats dans ce relevé">
        {hits.length === 0 && <li className={styles.feedback}>Aucun résultat.</li>}
        {hits.map((hit) => <li key={`${hit.entite}:${hit.entiteId}`}><Link href={searchHitHref(hit)} onClick={(event) => {
          if (hit.entite === "piece") return;
          event.preventDefault(); setQuery("");
          navigate({ releveId, chantierId: hit.chantierId, batimentId: hit.batimentId, etageId: hit.etageId });
        }}><small>{hit.entite === "zone" ? "Zone" : hit.entite === "etage" ? "Étage" : hit.entite === "batiment" ? "Bâtiment" : hit.entite === "chantier" ? "Chantier" : "Pièce"}</small> {hit.libelle}</Link></li>)}
      </ul>}
      <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.levels}`} data-focus={focus}>
      <section className={styles.column} aria-label="Bâtiments" data-level="batiments">
        <h2>Bâtiments{chantierNode ? ` · ${chantierNode.chantier.nom}` : ""}</h2>
        {batiments.map(({ batiment, etages }) => <NodeRow key={batiment.id} {...nodeProps} kind="batiment" id={batiment.id} nom={batiment.nom} revision={batiment.revision}
          current={batiment.id === batimentNode?.batiment.id} meta={`${etages.length} niveau(x)`}
          onSelect={() => navigate({ releveId, chantierId, batimentId: batiment.id, etageId: null })}
          chantiers={tree.chantiers.length > 1 ? tree.chantiers.map(({ chantier }) => ({ id: chantier.id, nom: chantier.nom })) : undefined} />)}
        {batiments.length === 0 && <p className={styles.feedback}>Aucun bâtiment.</p>}
        {canEdit && <InlineForm id="add-batiment" label="Ajouter un bâtiment" placeholder="Bâtiment A" onSubmit={(nom) => run(() => service.addBatiment(releveId, { nom, chantierId }), "Bâtiment ajouté.")} />}
      </section>

      <section className={styles.column} aria-label="Étages" data-level="etages">
        <button type="button" className={styles.back} onClick={() => navigate({ releveId, chantierId, batimentId: null, etageId: null })}>‹ Bâtiments</button>
        <h2>Étages{batimentNode ? ` · ${batimentNode.batiment.nom}` : ""}</h2>
        {batimentNode?.etages.map(({ etage, zones, piecesSansZone }) => <NodeRow key={etage.id} {...nodeProps} kind="etage" id={etage.id} nom={etage.nom} revision={etage.revision}
          current={etage.id === etageNode?.etage.id}
          meta={`${etageNiveauLabel(etage)}${etage.etat === "projet" ? " · projet" : ""} · ${zones.reduce((total, zone) => total + zone.pieces.length, piecesSansZone.length)} pièce(s)`}
          onSelect={() => navigate({ releveId, chantierId, batimentId: batimentNode.batiment.id, etageId: etage.id })} />)}
        {batimentNode && batimentNode.etages.length === 0 && <p className={styles.feedback}>Aucun étage.</p>}
        {canEdit && batimentNode && <>
          <div className={styles.quick} aria-label="Ajout rapide d'un étage">
            {suggestEtages(batimentNode.etages.map(({ etage }) => etage)).map((suggestion) => <button key={suggestion.nom} type="button" className={styles.secondary}
              onClick={() => void run(() => service.addEtage(releveId, batimentNode.batiment.id, suggestion), `${suggestion.nom} ajouté.`)}>+ {suggestion.nom}</button>)}
          </div>
          <EtageForm onSubmit={(draft) => run(() => service.addEtage(releveId, batimentNode.batiment.id, draft), "Étage ajouté.")} nextNiveau={batimentNode.etages.reduce((max, node) => Math.max(max, node.etage.niveau + 1), 0)} />
        </>}
      </section>

      <section className={styles.column} aria-label="Zones et pièces" data-level="pieces">
        <button type="button" className={styles.back} onClick={() => navigate({ releveId, chantierId, batimentId: batimentNode?.batiment.id ?? null, etageId: null })}>‹ Étages</button>
        <h2>Zones et pièces{etageNode ? ` · ${etageNode.etage.nom}` : ""}</h2>
        {etageNode && <EtageProperties key={etageNode.etage.id} service={service} releveId={releveId} etageId={etageNode.etage.id} structure={structure} canEdit={canEdit} onChanged={reload} />}
        {etageNode?.zones.map(({ zone, pieces }) => <div key={zone.id} className={styles.zone}>
          <NodeRow {...nodeProps} kind="zone" id={zone.id} nom={zone.nom} revision={zone.revision} meta={`${ZONE_TYPE_LABELS[zone.type]} · ${pieces.length} pièce(s)`} zoneType={zone.type} />
          <PieceList {...nodeProps} pieces={pieces} />
        </div>)}
        {etageNode && etageNode.piecesSansZone.length > 0 && <div className={styles.zone}><h3>{etageNode.zones.length ? "Hors zone" : "Pièces"}</h3><PieceList {...nodeProps} pieces={etageNode.piecesSansZone} /></div>}
        {etageNode && etageNode.zones.length === 0 && etageNode.piecesSansZone.length === 0 && <p className={styles.feedback}>Aucune pièce sur cet étage.</p>}
        {canEdit && etageNode && <>
          <ZoneForm onSubmit={(nom, type) => run(() => service.addZone(releveId, etageNode.etage.id, { nom, type }), "Zone ajoutée.")} />
          <PieceForm zones={etageNode.zones.map(({ zone }) => ({ id: zone.id, nom: zone.nom }))} onSubmit={(nom, usage, zoneId) => run(() => service.addPiece(releveId, etageNode.etage.id, { nom, usage, zoneId }), "Pièce ajoutée.")} />
        </>}
      </section>
    </div>

    {canEdit && <div className={styles.thumbBar}>
      <button type="button" className={styles.primary} onClick={() => { const input = document.getElementById(addTarget); input?.scrollIntoView({ block: "center" }); input?.focus(); }}>
        + {focus === "batiments" ? "Bâtiment" : focus === "etages" ? "Étage" : "Pièce"}
      </button>
    </div>}
  </>;
}

type NodeProps = { service: ReleveService; releveId: ReleveId; structure: ReleveStructure; canEdit: boolean; run: RunAction };

/**
 * Ligne d'un nœud : sélection (gros bouton, nom exact comme nom accessible) et menu
 * d'actions terrain — renommer, monter, descendre, dupliquer, déplacer, retirer.
 */
function NodeRow({ service, releveId, structure, canEdit, run, kind, id, nom, revision, meta, current, onSelect, chantiers, zoneType }: NodeProps & {
  kind: StructureKind; id: string; nom: string; revision: number; meta?: string; current?: boolean; onSelect?(): void;
  chantiers?: Array<{ id: string; nom: string }>; zoneType?: ZoneType;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // Le menu se referme après chaque action : l'écran reflète aussitôt le résultat.
  const act: RunAction = (action, message) => { setOpen(false); setRenaming(false); return run(action, message); };
  const siblings = siblingsOf(structure, kind, id);
  const index = siblings.findIndex((item) => item.id === id);
  const duplicable = kind !== "chantier";
  const body = <><span>{nom}</span>{meta && <small>{meta}</small>}</>;
  return <div className={styles.node} aria-current={current ? "true" : undefined} data-kind={kind}>
    <div className={styles.nodeMain}>
      {onSelect ? <button type="button" className={styles.select} onClick={onSelect} aria-label={nom}>{body}</button> : <div className={styles.select}>{body}</div>}
      {canEdit && <button type="button" className={styles.more} aria-expanded={open} aria-label={`Actions ${nom}`} onClick={() => setOpen(!open)}>⋯</button>}
    </div>
    {canEdit && open && <div className={styles.nodeActions}>
      {renaming
        ? <RenameForm nom={nom} onCancel={() => setRenaming(false)} onSubmit={(next) => act(async () => { await service.updateNode(releveId, kind, id, { nom: next }, revision); setRenaming(false); }, "Renommé.")} />
        : <button type="button" className={styles.secondary} onClick={() => setRenaming(true)}>Renommer</button>}
      <button type="button" className={styles.secondary} disabled={index <= 0} onClick={() => void act(() => service.move(releveId, kind, id, -1), "Ordre enregistré.")}>Monter</button>
      <button type="button" className={styles.secondary} disabled={index < 0 || index >= siblings.length - 1} onClick={() => void act(() => service.move(releveId, kind, id, 1), "Ordre enregistré.")}>Descendre</button>
      {duplicable && <button type="button" className={styles.secondary} onClick={() => void act(() => service.duplicateNode(releveId, kind as DuplicableKind, id), "Copie créée (structure seule : ni photo ni mesure).")}>Dupliquer</button>}
      {zoneType && <label className={styles.field}><span>Type de zone</span>
        <select value={zoneType} onChange={(event) => void act(() => service.updateNode(releveId, "zone", id, { type: event.target.value as ZoneType }, revision), "Type de zone enregistré.")}>
          {ZONE_TYPES.map((value) => <option key={value} value={value}>{ZONE_TYPE_LABELS[value]}</option>)}
        </select></label>}
      {chantiers && <label className={styles.field}><span>Déplacer vers le chantier</span>
        <select value="" onChange={(event) => event.target.value && void act(() => service.updateNode(releveId, "batiment", id, { chantierId: event.target.value }, revision), "Bâtiment déplacé.")}>
          <option value="">Choisir…</option>
          {chantiers.filter((chantier) => chantier.id !== (structure.batiments.find((item) => item.id === id)?.chantierId)).map((chantier) => <option key={chantier.id} value={chantier.id}>{chantier.nom}</option>)}
        </select></label>}
      <button type="button" className={styles.danger} onClick={() => {
        if (window.confirm(confirmRemovalMessage(structure, kind, id, nom))) void act(() => service.removeNode(releveId, kind, id), `« ${nom} » retiré (restaurable depuis la fiche du relevé).`);
      }}>Retirer</button>
    </div>}
  </div>;
}

function RenameForm({ nom, onSubmit, onCancel }: { nom: string; onSubmit(nom: string): Promise<void>; onCancel(): void }) {
  const [value, setValue] = useState(nom);
  return <form className={styles.renameForm} onSubmit={(event) => { event.preventDefault(); if (value.trim() && value.trim() !== nom) void onSubmit(value.trim()); else onCancel(); }}>
    <label className={styles.field}><span>Nouveau nom</span><input autoFocus value={value} maxLength={120} onChange={(event) => setValue(event.target.value)} /></label>
    <button type="submit" className={styles.secondary} disabled={!value.trim()}>Valider</button>
    <button type="button" className={styles.secondary} onClick={onCancel}>Annuler</button>
  </form>;
}

function PieceList({ pieces, service, releveId, structure, canEdit, run }: NodeProps & { pieces: readonly Piece[] }) {
  return <ul className={styles.pieces}>{pieces.map((piece) => <li key={piece.id} className={styles.piece}>
    <Link className={styles.pieceLink} href={pieceHref(releveId, piece.id)} aria-label={`Ouvrir la fiche ${piece.nom}`}>
      <strong>{piece.nom}</strong> <small>{USAGE_LABELS[piece.usage]}</small>
      <span className={styles.badge} data-statut={piece.statut}>{PIECE_STATUT_LABELS[piece.statut]}</span>
    </Link>
    {canEdit && <PieceActions piece={piece} service={service} releveId={releveId} structure={structure} canEdit={canEdit} run={run} />}
  </li>)}</ul>;
}

function PieceActions({ piece, service, releveId, structure, run }: NodeProps & { piece: Piece }) {
  const [open, setOpen] = useState(false);
  const act: RunAction = (action, message) => { setOpen(false); return run(action, message); };
  const siblings = siblingsOf(structure, "piece", piece.id);
  const index = siblings.findIndex((item) => item.id === piece.id);
  return <div className={styles.pieceActions}>
    <button type="button" className={styles.more} aria-expanded={open} aria-label={`Actions ${piece.nom}`} onClick={() => setOpen(!open)}>⋯</button>
    {open && <div className={styles.nodeActions}>
      <button type="button" className={styles.secondary} disabled={index <= 0} onClick={() => void act(() => service.move(releveId, "piece", piece.id, -1), "Ordre enregistré.")}>Monter</button>
      <button type="button" className={styles.secondary} disabled={index >= siblings.length - 1} onClick={() => void act(() => service.move(releveId, "piece", piece.id, 1), "Ordre enregistré.")}>Descendre</button>
      <button type="button" className={styles.secondary} onClick={() => void act(() => service.duplicateNode(releveId, "piece", piece.id), "Pièce dupliquée (sans photo ni mesure).")}>Dupliquer</button>
      <button type="button" className={styles.danger} onClick={() => {
        if (window.confirm(confirmRemovalMessage(structure, "piece", piece.id, piece.nom))) void act(() => service.removeNode(releveId, "piece", piece.id), `« ${piece.nom} » retirée (restaurable).`);
      }}>Retirer</button>
    </div>}
  </div>;
}

/** Propriétés de l'étage sélectionné, en sauvegarde automatique. */
function EtageProperties({ service, releveId, etageId, structure, canEdit, onChanged }: {
  service: ReleveService; releveId: ReleveId; etageId: string; structure: ReleveStructure; canEdit: boolean; onChanged(): Promise<void>;
}) {
  const etage = structure.etages.find((item) => item.id === etageId)!;
  const [resetKey, setResetKey] = useState(0);
  const api = useAutosave({
    revision: etage.revision,
    save: async (patch, revision) => ({ revision: (await service.updateNode(releveId, "etage", etageId, patch, revision)).revision }),
    fetchRevision: async () => (await service.get(releveId)).etages.find((item) => item.id === etageId)?.revision ?? etage.revision,
    onSaved: () => void onChanged(),
    onReloaded: () => { void onChanged(); setResetKey((value) => value + 1); },
  });
  if (!canEdit) return <p className={styles.feedback}>{etageNiveauLabel(etage)} · hauteur sous plafond {etage.hauteurSousPlafondMm ? `${formatHauteurCm(etage.hauteurSousPlafondMm)} cm` : "non renseignée"}</p>;
  return <details className={styles.properties}>
    <summary>Propriétés de l&apos;étage</summary>
    <div key={resetKey} className={styles.propertiesGrid}>
      <AutoText api={api} name="nom" label="Nom de l'étage" value={etage.nom} required maxLength={120} />
      <AutoSelect<EtageTypeNiveau> api={api} name="typeNiveau" label="Type de niveau" value={etage.typeNiveau}
        allowEmpty="Déduit du niveau" options={ETAGE_TYPES_NIVEAU.map((value) => ({ value, label: ETAGE_TYPE_NIVEAU_LABELS[value] }))} />
      <AutoNumber api={api} name="niveau" label="Niveau (ordre, 0 = RDC)" value={etage.niveau} format={(value) => String(value ?? "")}
        parse={(input) => { const niveau = parseNiveau(input); return niveau === null ? { ok: false, message: "Entier entre -10 et 200." } : { ok: true, value: niveau }; }} />
      <AutoNumber api={api} name="altitudeMm" label="Altitude (m, facultatif)" value={etage.altitudeMm} parse={parseAltitudeM} format={formatAltitudeM} placeholder="2,80" />
      <AutoNumber api={api} name="hauteurSousPlafondMm" label="Hauteur sous plafond (cm)" value={etage.hauteurSousPlafondMm} parse={parseHauteurCm} format={formatHauteurCm} placeholder="250" />
      <AutoSelect api={api} name="etat" label="État" value={etage.etat} options={[{ value: "existant", label: "Existant" }, { value: "projet", label: "Projet" }]} />
    </div>
    <SaveStatus api={api} label="étage" />
  </details>;
}

function InlineForm({ id, label, placeholder, onSubmit }: { id: string; label: string; placeholder: string; onSubmit(nom: string): Promise<void> }) {
  const [nom, setNom] = useState("");
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom).then(() => setNom("")); }}>
    <label className={styles.field}><span>{label}</span><input id={id} value={nom} maxLength={120} placeholder={placeholder} onChange={(event) => setNom(event.target.value)} /></label>
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}

function EtageForm({ nextNiveau, onSubmit }: { nextNiveau: number; onSubmit(draft: { nom: string; niveau: number; hauteurSousPlafondMm: number | null; typeNiveau: EtageTypeNiveau | null }): Promise<void> }) {
  const [nom, setNom] = useState(""); const [niveau, setNiveau] = useState<string>(""); const [hsp, setHsp] = useState(""); const [type, setType] = useState("");
  const effectiveNiveau = niveau === "" ? nextNiveau : Number(niveau);
  const parsedHsp = parseHauteurCm(hsp);
  const placeholder = etageNiveauLabel({ niveau: effectiveNiveau, typeNiveau: (type || null) as EtageTypeNiveau | null });
  return <form className={styles.inline} onSubmit={(event) => {
    event.preventDefault();
    if (!parsedHsp.ok) return;
    void onSubmit({ nom: nom || placeholder, niveau: effectiveNiveau, hauteurSousPlafondMm: parsedHsp.value, typeNiveau: (type || null) as EtageTypeNiveau | null })
      .then(() => { setNom(""); setNiveau(""); setHsp(""); setType(""); });
  }}>
    <label className={styles.field}><span>Ajouter un étage</span><input id="add-etage" value={nom} maxLength={120} placeholder={placeholder} onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Type de niveau</span><select value={type} onChange={(event) => setType(event.target.value)}>
      <option value="">Déduit du niveau</option>
      {ETAGE_TYPES_NIVEAU.map((value) => <option key={value} value={value}>{ETAGE_TYPE_NIVEAU_LABELS[value]}</option>)}
    </select></label>
    <label className={styles.field}><span>Niveau (0 = RDC)</span><input type="number" min={-10} max={200} step={1} value={niveau} placeholder={String(nextNiveau)} onChange={(event) => setNiveau(event.target.value)} /></label>
    <label className={styles.field}><span>Hauteur sous plafond (cm)</span><input inputMode="decimal" value={hsp} placeholder="250" aria-invalid={!parsedHsp.ok || undefined} onChange={(event) => setHsp(event.target.value)} />
      {!parsedHsp.ok && <small className={styles.fieldError}>{parsedHsp.message}</small>}</label>
    <button className={styles.secondary} type="submit" disabled={!parsedHsp.ok}>Ajouter</button>
  </form>;
}

function ZoneForm({ onSubmit }: { onSubmit(nom: string, type: ZoneType): Promise<void> }) {
  const [nom, setNom] = useState(""); const [type, setType] = useState<ZoneType>("appartement");
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom, type).then(() => setNom("")); }}>
    <label className={styles.field}><span>Ajouter une zone (facultatif)</span><input value={nom} maxLength={120} placeholder="Zone Est, Appartement 12…" onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Type de zone</span><select value={type} onChange={(event) => setType(event.target.value as ZoneType)}>
      {ZONE_TYPES.map((value) => <option key={value} value={value}>{ZONE_TYPE_LABELS[value]}</option>)}
    </select></label>
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}

const OTHER_USAGES = PIECE_USAGES.filter((usage) => !(PIECE_USAGES_SUGGERES as readonly string[]).includes(usage));

export function UsageOptions() {
  return <>
    <optgroup label="Types courants">{PIECE_USAGES_SUGGERES.map((value) => <option key={value} value={value}>{USAGE_LABELS[value]}</option>)}</optgroup>
    <optgroup label="Autres types">{OTHER_USAGES.map((value) => <option key={value} value={value}>{USAGE_LABELS[value]}</option>)}</optgroup>
  </>;
}

function PieceForm({ zones, onSubmit }: { zones: Array<{ id: string; nom: string }>; onSubmit(nom: string, usage: PieceUsage, zoneId: string | null): Promise<void> }) {
  const [nom, setNom] = useState(""); const [usage, setUsage] = useState<PieceUsage>("sejour"); const [zoneId, setZoneId] = useState("");
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom, usage, zoneId || null).then(() => setNom("")); }}>
    <label className={styles.field}><span>Ajouter une pièce</span><input id="add-piece" value={nom} maxLength={120} placeholder="Séjour" onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Type de pièce</span><select value={usage} onChange={(event) => setUsage(event.target.value as PieceUsage)}><UsageOptions /></select></label>
    {zones.length > 0 && <label className={styles.field}><span>Zone</span><select value={zoneId} onChange={(event) => setZoneId(event.target.value)}><option value="">Hors zone</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom}</option>)}</select></label>}
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}
