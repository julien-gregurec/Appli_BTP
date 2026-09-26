"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, buildReleveTree, niveauLabel, PIECE_USAGES, structureStats,
  type PieceUsage, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure, type StructureKind,
} from "@elsatia/releve-domain";
import { readStructureSelection, RELEVES_PATH, structureHref, type StructureSelection } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { useReleveService } from "./use-releve-service";

const USAGE_LABELS: Record<PieceUsage, string> = {
  sejour: "Séjour", chambre: "Chambre", cuisine: "Cuisine", salle_de_bain: "Salle de bain", salle_d_eau: "Salle d'eau", wc: "WC",
  entree: "Entrée", degagement: "Dégagement", bureau: "Bureau", cellier: "Cellier", buanderie: "Buanderie", garage: "Garage",
  cave: "Cave", combles: "Combles", escalier: "Escalier", exterieur: "Extérieur", autre: "Autre",
};

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

function StructureEditor({ service, actor, selection, navigate }: EditorProps) {
  const releveId = selection.releveId as ReleveId;
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [feedback, setFeedback] = useState("");
  const [versions, setVersions] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      setStructure(await service.get(releveId));
      setVersions((await service.listVersions(releveId)).length);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [service, releveId]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([service.get(releveId), service.listVersions(releveId)])
      .then(([loaded, list]) => { if (!cancelled) { setStructure(loaded); setVersions(list.length); } })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [service, releveId]);

  const tree = useMemo(() => (structure ? buildReleveTree(structure) : null), [structure]);
  const actions = useMemo(() => new Set(structure ? allowedActions(actor, structure.releve) : []), [actor, structure]);
  const canEdit = actions.has("edit");

  async function run(action: () => Promise<unknown>, message: string) {
    setFeedback("");
    try { await action(); await reload(); setFeedback(message); } catch (error) { setFeedback(error instanceof Error ? error.message : "Action impossible."); }
  }
  function remove(kind: StructureKind, id: string, label: string) {
    if (window.confirm(`Retirer « ${label} » du relevé ? Les éléments qu'il contient sont retirés avec lui et restent restaurables.`)) void run(() => service.removeNode(releveId, kind, id), `« ${label} » retiré.`);
  }

  if (!structure || !tree) return <p className={`shell ${styles.feedback}`} role="status">{feedback || "Chargement du relevé…"}</p>;
  const { releve } = structure;
  const batimentNode = tree.batiments.find((node) => node.batiment.id === selection.batimentId) ?? tree.batiments[0] ?? null;
  const etageNode = batimentNode?.etages.find((node) => node.etage.id === selection.etageId) ?? batimentNode?.etages[0] ?? null;
  const stats = structureStats(structure);

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={styles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Relevés</Link></li>
        <li>{releve.chantier.nom}</li>
        {batimentNode && <li>{batimentNode.batiment.nom}</li>}
        {etageNode && <li>{etageNode.etage.nom}</li>}
      </ol></nav>
      <p className="eyebrow">RELEVÉ · {releve.visibilite === "entreprise" ? "PARTAGÉ AVEC L'ENTREPRISE" : "PRIVÉ"}</p>
      <h1 className="projects-title">{releve.nom}</h1>
      <p>Chantier {releve.chantier.nom}{releve.chantier.ville ? ` — ${releve.chantier.ville}` : ""} · {stats.batiments} bâtiment(s), {stats.etages} étage(s), {stats.zones} zone(s), {stats.pieces} pièce(s) · {versions ?? "…"} version(s)</p>
      <div className={styles.toolbar}>
        {actions.has("share") && <button className={styles.secondary} type="button" onClick={() => void run(() => service.setVisibility(releveId, releve.visibilite === "prive" ? "entreprise" : "prive"), releve.visibilite === "prive" ? "Relevé partagé avec l'entreprise." : "Relevé redevenu privé.")}>{releve.visibilite === "prive" ? "Partager avec l'entreprise" : "Rendre privé"}</button>}
        {canEdit && <button className={styles.secondary} type="button" onClick={() => void run(() => service.createVersion(releveId, window.prompt("Libellé de la version (facultatif)") ?? null), "Version figée.")}>Figer une version</button>}
      </div>
      <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.levels}`}>
      <section className={styles.column} aria-label="Bâtiments">
        <h2>Bâtiments</h2>
        {tree.batiments.map(({ batiment }) => <div key={batiment.id} className={styles.node} aria-current={batiment.id === batimentNode?.batiment.id}>
          <button type="button" className={styles.select} onClick={() => navigate({ releveId, batimentId: batiment.id, etageId: null })}><span>{batiment.nom}</span></button>
          {canEdit && <button type="button" className={styles.remove} aria-label={`Retirer ${batiment.nom}`} onClick={() => remove("batiment", batiment.id, batiment.nom)}>×</button>}
        </div>)}
        {tree.batiments.length === 0 && <p className={styles.feedback}>Aucun bâtiment.</p>}
        {canEdit && <InlineForm label="Ajouter un bâtiment" placeholder="Bâtiment A" onSubmit={(nom) => run(() => service.addBatiment(releveId, { nom }), "Bâtiment ajouté.")} />}
      </section>

      <section className={styles.column} aria-label="Étages">
        <h2>Étages{batimentNode ? ` · ${batimentNode.batiment.nom}` : ""}</h2>
        {batimentNode?.etages.map(({ etage }) => <div key={etage.id} className={styles.node} aria-current={etage.id === etageNode?.etage.id}>
          <button type="button" className={styles.select} onClick={() => navigate({ releveId, batimentId: batimentNode.batiment.id, etageId: etage.id })}><span>{etage.nom}</span> <small>{niveauLabel(etage.niveau)}{etage.etat === "projet" ? " · projet" : ""}</small></button>
          {canEdit && <button type="button" className={styles.remove} aria-label={`Retirer ${etage.nom}`} onClick={() => remove("etage", etage.id, etage.nom)}>×</button>}
        </div>)}
        {batimentNode && batimentNode.etages.length === 0 && <p className={styles.feedback}>Aucun étage.</p>}
        {canEdit && batimentNode && <EtageForm onSubmit={(nom, niveau, hsp) => run(() => service.addEtage(releveId, batimentNode.batiment.id, { nom, niveau, hauteurSousPlafondMm: hsp }), "Étage ajouté.")} nextNiveau={batimentNode.etages.reduce((max, node) => Math.max(max, node.etage.niveau + 1), 0)} />}
      </section>

      <section className={styles.column} aria-label="Zones et pièces">
        <h2>Zones et pièces{etageNode ? ` · ${etageNode.etage.nom}` : ""}</h2>
        {etageNode?.zones.map(({ zone, pieces }) => <div key={zone.id} className={styles.zone}>
          <h3><span>{zone.nom}</span>{canEdit && <button type="button" className={styles.remove} aria-label={`Retirer la zone ${zone.nom}`} onClick={() => remove("zone", zone.id, zone.nom)}>×</button>}</h3>
          <PieceList pieces={pieces} canEdit={canEdit} onRemove={(id, nom) => remove("piece", id, nom)} />
        </div>)}
        {etageNode && etageNode.piecesSansZone.length > 0 && <div className={styles.zone}><h3>Hors zone</h3><PieceList pieces={etageNode.piecesSansZone} canEdit={canEdit} onRemove={(id, nom) => remove("piece", id, nom)} /></div>}
        {etageNode && etageNode.zones.length === 0 && etageNode.piecesSansZone.length === 0 && <p className={styles.feedback}>Aucune pièce sur cet étage.</p>}
        {canEdit && etageNode && <>
          <InlineForm label="Ajouter une zone" placeholder="Logement 1" onSubmit={(nom) => run(() => service.addZone(releveId, etageNode.etage.id, { nom }), "Zone ajoutée.")} />
          <PieceForm zones={etageNode.zones.map(({ zone }) => ({ id: zone.id, nom: zone.nom }))} onSubmit={(nom, usage, zoneId) => run(() => service.addPiece(releveId, etageNode.etage.id, { nom, usage, zoneId }), "Pièce ajoutée.")} />
        </>}
      </section>
    </div>
  </>;
}

function PieceList({ pieces, canEdit, onRemove }: { pieces: ReleveStructure["pieces"]; canEdit: boolean; onRemove(id: string, nom: string): void }) {
  return <ul className={styles.pieces}>{pieces.map((piece) => <li key={piece.id} className={styles.piece}>
    <span><strong>{piece.nom}</strong> <small>{USAGE_LABELS[piece.usage]}</small></span>
    {canEdit && <button type="button" className={styles.remove} aria-label={`Retirer ${piece.nom}`} onClick={() => onRemove(piece.id, piece.nom)}>×</button>}
  </li>)}</ul>;
}

function InlineForm({ label, placeholder, onSubmit }: { label: string; placeholder: string; onSubmit(nom: string): Promise<void> }) {
  const [nom, setNom] = useState("");
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom).then(() => setNom("")); }}>
    <label className={styles.field}><span>{label}</span><input value={nom} maxLength={120} placeholder={placeholder} onChange={(event) => setNom(event.target.value)} /></label>
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}

function EtageForm({ nextNiveau, onSubmit }: { nextNiveau: number; onSubmit(nom: string, niveau: number, hsp: number | null): Promise<void> }) {
  const [nom, setNom] = useState(""); const [niveau, setNiveau] = useState<string>(""); const [hsp, setHsp] = useState("");
  const effectiveNiveau = niveau === "" ? nextNiveau : Number(niveau);
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); void onSubmit(nom || niveauLabel(effectiveNiveau), effectiveNiveau, hsp ? Math.round(Number(hsp) * 10) : null).then(() => { setNom(""); setNiveau(""); setHsp(""); }); }}>
    <label className={styles.field}><span>Ajouter un étage</span><input value={nom} maxLength={120} placeholder={niveauLabel(effectiveNiveau)} onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Niveau (0 = RDC)</span><input type="number" min={-10} max={200} step={1} value={niveau} placeholder={String(nextNiveau)} onChange={(event) => setNiveau(event.target.value)} /></label>
    <label className={styles.field}><span>Hauteur sous plafond (cm)</span><input type="number" min={50} max={2000} step={0.5} value={hsp} placeholder="250" onChange={(event) => setHsp(event.target.value)} /></label>
    <button className={styles.secondary} type="submit">Ajouter</button>
  </form>;
}

function PieceForm({ zones, onSubmit }: { zones: Array<{ id: string; nom: string }>; onSubmit(nom: string, usage: PieceUsage, zoneId: string | null): Promise<void> }) {
  const [nom, setNom] = useState(""); const [usage, setUsage] = useState<PieceUsage>("sejour"); const [zoneId, setZoneId] = useState("");
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom, usage, zoneId || null).then(() => setNom("")); }}>
    <label className={styles.field}><span>Ajouter une pièce</span><input value={nom} maxLength={120} placeholder="Séjour" onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Usage</span><select value={usage} onChange={(event) => setUsage(event.target.value as PieceUsage)}>{PIECE_USAGES.map((value) => <option key={value} value={value}>{USAGE_LABELS[value]}</option>)}</select></label>
    {zones.length > 0 && <label className={styles.field}><span>Zone</span><select value={zoneId} onChange={(event) => setZoneId(event.target.value)}><option value="">Hors zone</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom}</option>)}</select></label>}
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}
