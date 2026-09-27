"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, buildReleveTree, CHANTIER_STATUTS, structureStats, trashOf, VERSION_TYPE_LABELS, VERSION_TYPES,
  type Chantier, type ChantierStatut, type JournalEntry, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure, type Version, type VersionType,
} from "@elsatia/releve-domain";
import { readReleveId, RELEVES_PATH, structureHref } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import { CHANTIER_STATUT_LABELS, ENTITE_LABELS, JOURNAL_ACTION_LABELS, RELEVE_STATUT_LABELS } from "./labels";
import { AutosaveBadge, useNodeAutosave } from "./useNodeAutosave";
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
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [generation, setGeneration] = useState(0);
  const [feedback, setFeedback] = useState("");

  const reload = useCallback(async () => {
    const [loaded, list, entries] = await Promise.all([service.get(releveId), service.listVersions(releveId), service.journal(releveId, 30)]);
    setStructure(loaded); setVersions(list); setJournal(entries);
  }, [service, releveId]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([service.get(releveId), service.listVersions(releveId), service.journal(releveId, 30)])
      .then(([loaded, list, entries]) => { if (!cancelled) { setStructure(loaded); setVersions(list); setJournal(entries); } })
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
        {tree.chantiers.map(({ chantier, batiments }) => <ChantierCard key={`${chantier.id}:${generation}`} service={service} releveId={releveId} chantier={chantier} batiments={batiments.length} canEdit={canEdit} reload={reload} hardReload={() => reload().then(() => setGeneration((value) => value + 1))} />)}
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

        <h2>Corbeille</h2>
        {trashOf(structure).length === 0 ? <p className={styles.feedback}>Rien à restaurer.</p> : <ul className={styles.pieces} aria-label="Corbeille">{trashOf(structure).map((entry) => <li key={entry.id} className={styles.piece}>
          <span><strong>{entry.nom}</strong> <small>{ENTITE_LABELS[entry.kind]} · {entry.contexte} · {dateFormat.format(new Date(entry.deletedAt))}</small></span>
          {canEdit && <button type="button" className={styles.secondary} onClick={() => void run(() => service.restoreNode(releveId, entry.kind, entry.id), `« ${entry.nom} » restauré.`)}>Restaurer</button>}
        </li>)}</ul>}

        <h2>Historique</h2>
        <ul className={styles.journal} aria-label="Historique">{journal.map((entry) => <li key={entry.id}>
          <time dateTime={entry.createdAt}>{dateFormat.format(new Date(entry.createdAt))}</time>
          <span>{JOURNAL_ACTION_LABELS[entry.action]} · {ENTITE_LABELS[entry.entite] ?? entry.entite} {nomEntite(structure, entry)}</span>
        </li>)}</ul>
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

function nomEntite(structure: ReleveStructure, entry: JournalEntry): string {
  const rows: Array<{ id: string; nom: string }> = [...structure.chantiers, ...structure.batiments, ...structure.etages, ...structure.zones, ...structure.pieces];
  if (entry.entite === "releve") return `« ${structure.releve.nom} »`;
  const row = rows.find((item) => item.id === entry.entiteId);
  return row ? `« ${row.nom} »` : "";
}

type ChantierFields = {
  nom: string; clientNom: string | null; adresse: string | null; codePostal: string | null; ville: string | null;
  reference: string | null; description: string | null; dateReleve: string | null; statut: ChantierStatut;
};

/** Chantier : champs métier enregistrés automatiquement, sans bouton Enregistrer. */
function ChantierCard({ service, releveId, chantier, batiments, canEdit, reload, hardReload }: { service: ReleveService; releveId: ReleveId; chantier: Chantier; batiments: number; canEdit: boolean; reload(): Promise<void>; hardReload(): Promise<void> }) {
  const initial = useMemo<ChantierFields>(() => ({
    nom: chantier.nom, clientNom: chantier.clientNom ?? null, adresse: chantier.adresse, codePostal: chantier.codePostal, ville: chantier.ville,
    reference: chantier.reference ?? null, description: chantier.description ?? null, dateReleve: chantier.dateReleve ?? null, statut: chantier.statut ?? "en_cours",
  }), [chantier]);
  const save = useCallback(async (patch: Partial<ChantierFields>, expected: number) => {
    const next = await service.updateNode(releveId, "chantier", chantier.id, patch, expected);
    await reload();
    return next;
  }, [service, releveId, chantier.id, reload]);
  const autosave = useNodeAutosave<ChantierFields>(initial, chantier.revision, save);
  const values = autosave.values;
  const text = (key: keyof ChantierFields, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className={styles.field}><span>{label}</span><input value={String(values[key] ?? "")} disabled={!canEdit} {...extra}
      onChange={(event) => autosave.set(key, (event.target.value || (key === "nom" ? "" : null)) as never)} onBlur={() => void autosave.flush()} /></label>;
  return <article className={styles.chantierCard} aria-label={`Chantier ${chantier.nom}`}>
    <header>
      <span className={styles.meta}>{batiments} bâtiment(s) · {CHANTIER_STATUT_LABELS[values.statut]}{chantier.gpChantierId ? " · Lié à Gestion Pro" : ""}</span>
      <h2>{values.nom || chantier.nom}</h2>
      <AutosaveBadge label={`Chantier ${chantier.nom}`} state={autosave.state} onRetry={() => void autosave.retry()} onReload={() => void hardReload()} />
    </header>
    <div className={styles.formGrid}>
      {text("nom", "Nom du chantier", { maxLength: 180, required: true })}
      {text("clientNom", "Client", { maxLength: 180 })}
      {text("adresse", "Adresse", { maxLength: 400 })}
      {text("codePostal", "Code postal", { maxLength: 12, inputMode: "numeric" })}
      {text("ville", "Ville", { maxLength: 120 })}
      {text("reference", "Référence", { maxLength: 80 })}
      {text("dateReleve", "Date", { type: "date" })}
      <label className={styles.field}><span>Statut</span><select value={values.statut} disabled={!canEdit} onChange={(event) => autosave.set("statut", event.target.value as ChantierStatut)}>
        {CHANTIER_STATUTS.map((statut) => <option key={statut} value={statut}>{CHANTIER_STATUT_LABELS[statut]}</option>)}</select></label>
    </div>
    <label className={styles.field}><span>Description</span><textarea rows={2} maxLength={4000} value={values.description ?? ""} disabled={!canEdit}
      onChange={(event) => autosave.set("description", event.target.value || null)} onBlur={() => void autosave.flush()} /></label>
    <Link className={styles.open} href={structureHref({ releveId, chantierId: chantier.id })}>Bâtiments, étages, pièces</Link>
  </article>;
}
