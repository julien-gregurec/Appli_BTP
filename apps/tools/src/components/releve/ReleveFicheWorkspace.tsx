"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, buildReleveTree, structureStats, VERSION_TYPE_LABELS, VERSION_TYPES,
  type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure, type Version, type VersionType,
} from "@elsatia/releve-domain";
import { readReleveId, RELEVES_PATH, structureHref } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import { RELEVE_STATUT_LABELS } from "./labels";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { useReleveService } from "./use-releve-service";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Fiche relevé : identité du projet, chantiers, versions typées, partage. */
export function ReleveFicheWorkspace() {
  const state = useReleveService();
  const [releveId, setReleveId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const timer = window.setTimeout(() => setReleveId(readReleveId(window.location.search)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${styles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${styles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && releveId === null && <p className={`shell ${styles.feedback}`} role="alert">Relevé introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && releveId && <Fiche key={releveId} service={state.service} actor={state.actor} releveId={releveId as ReleveId} />}
  </main>;
}

function Fiche({ service, actor, releveId }: { service: ReleveService; actor: ReleveActorContext; releveId: ReleveId }) {
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [feedback, setFeedback] = useState("");

  const reload = useCallback(async () => {
    const [loaded, list] = await Promise.all([service.get(releveId), service.listVersions(releveId)]);
    setStructure(loaded); setVersions(list);
  }, [service, releveId]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([service.get(releveId), service.listVersions(releveId)])
      .then(([loaded, list]) => { if (!cancelled) { setStructure(loaded); setVersions(list); } })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [service, releveId]);

  const tree = useMemo(() => (structure ? buildReleveTree(structure) : null), [structure]);
  const actions = useMemo(() => new Set(structure ? allowedActions(actor, structure.releve) : []), [actor, structure]);

  async function run(action: () => Promise<unknown>, message: string) {
    setFeedback("");
    try { await action(); await reload(); setFeedback(message); } catch (error) { setFeedback(error instanceof Error ? error.message : "Action impossible."); }
  }

  if (!structure || !tree) return <p className={`shell ${styles.feedback}`} role="status">{feedback || "Chargement du relevé…"}</p>;
  const { releve } = structure;
  const stats = structureStats(structure);
  const canEdit = actions.has("edit");
  const numeros = new Map(versions.map((version) => [version.id as string, version.numero]));

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={styles.breadcrumb}><li><Link href={RELEVES_PATH}>Mes relevés</Link></li><li>{releve.nom}</li></ol></nav>
      <p className="eyebrow">FICHE RELEVÉ · {RELEVE_STATUT_LABELS[releve.statut].toUpperCase()} · {releve.visibilite === "entreprise" ? "PARTAGÉ AVEC L'ENTREPRISE" : "PRIVÉ"}</p>
      <h1 className="projects-title">{releve.nom}</h1>
      <dl className={styles.facts}>
        <div><dt>Site principal</dt><dd>{releve.chantier.nom}{releve.chantier.ville ? ` — ${releve.chantier.ville}` : ""}</dd></div>
        <div><dt>Client</dt><dd>{releve.client.nom ?? "—"}</dd></div>
        <div><dt>Référence</dt><dd>{releve.reference ?? "—"}</dd></div>
        <div><dt>Gestion Pro</dt><dd>{releve.chantier.gpChantierId ? "Lié à un chantier" : "Non lié"}</dd></div>
        <div><dt>Structure</dt><dd>{stats.chantiers} chantier(s), {stats.batiments} bâtiment(s), {stats.etages} étage(s), {stats.pieces} pièce(s)</dd></div>
      </dl>
      <div className={styles.toolbar}>
        {actions.has("share") && <button className={styles.secondary} type="button" onClick={() => void run(() => service.setVisibility(releveId, releve.visibilite === "prive" ? "entreprise" : "prive"), releve.visibilite === "prive" ? "Relevé partagé avec l'entreprise." : "Relevé redevenu privé.")}>{releve.visibilite === "prive" ? "Partager avec l'entreprise" : "Rendre privé"}</button>}
      </div>
      <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.fiche}`}>
      <section className={styles.column} aria-label="Chantiers">
        <h2>Chantiers</h2>
        {tree.chantiers.map(({ chantier, batiments }) => <article key={chantier.id} className={styles.card}>
          <div>
            <span className={styles.meta}>{batiments.length} bâtiment(s){chantier.gpChantierId ? " · Lié à Gestion Pro" : ""}</span>
            <h2>{chantier.nom}</h2>
            <p>{[chantier.adresse, [chantier.codePostal, chantier.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse non renseignée"}</p>
          </div>
          <Link className={styles.open} href={structureHref({ releveId, chantierId: chantier.id })}>Bâtiments, étages, pièces</Link>
        </article>)}
        {tree.chantiers.length === 0 && <p className={styles.feedback}>Aucun chantier.</p>}
        {canEdit && <ChantierForm onSubmit={(nom, ville) => run(() => service.addChantier(releveId, { nom, ville: ville || null }), "Chantier ajouté.")} />}
      </section>

      <section className={styles.column} aria-label="Versions">
        <h2>Versions</h2>
        {versions.length === 0 && <p className={styles.feedback}>Aucune version figée. La première sera la version initiale.</p>}
        <ul className={styles.pieces}>{versions.map((version) => <li key={version.id} className={styles.piece}>
          <span><strong>V{version.numero} · {VERSION_TYPE_LABELS[version.typeVersion]}</strong> <small>{version.libelle ?? ""}{version.versionBaseId ? ` · depuis V${numeros.get(version.versionBaseId) ?? "?"}` : ""}</small></span>
          <small><time dateTime={version.createdAt}>{dateFormat.format(new Date(version.createdAt))}</time></small>
        </li>)}</ul>
        {canEdit && <VersionForm first={versions.length === 0} onSubmit={(type, libelle) => run(() => service.createVersion(releveId, libelle || null, { type }), "Version figée.")} />}
      </section>
    </div>
  </>;
}

function ChantierForm({ onSubmit }: { onSubmit(nom: string, ville: string): Promise<void> }) {
  const [nom, setNom] = useState(""); const [ville, setVille] = useState("");
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); if (nom.trim()) void onSubmit(nom, ville).then(() => { setNom(""); setVille(""); }); }}>
    <label className={styles.field}><span>Ajouter un chantier</span><input value={nom} maxLength={180} placeholder="Chantier Nord" onChange={(event) => setNom(event.target.value)} /></label>
    <label className={styles.field}><span>Ville</span><input value={ville} maxLength={120} onChange={(event) => setVille(event.target.value)} /></label>
    <button className={styles.secondary} type="submit" disabled={!nom.trim()}>Ajouter</button>
  </form>;
}

function VersionForm({ first, onSubmit }: { first: boolean; onSubmit(type: VersionType, libelle: string): Promise<void> }) {
  const choices = first ? (["initial"] as VersionType[]) : VERSION_TYPES.filter((type) => type !== "initial");
  const [type, setType] = useState<VersionType>(choices[0]);
  const [libelle, setLibelle] = useState("");
  const effective = choices.includes(type) ? type : choices[0];
  return <form className={styles.inline} onSubmit={(event) => { event.preventDefault(); void onSubmit(effective, libelle).then(() => setLibelle("")); }}>
    <label className={styles.field}><span>Type de version</span><select value={effective} onChange={(event) => setType(event.target.value as VersionType)}>{choices.map((value) => <option key={value} value={value}>{VERSION_TYPE_LABELS[value]}</option>)}</select></label>
    <label className={styles.field}><span>Libellé (facultatif)</span><input value={libelle} maxLength={200} onChange={(event) => setLibelle(event.target.value)} /></label>
    <button className={styles.secondary} type="submit">Figer une version</button>
  </form>;
}
