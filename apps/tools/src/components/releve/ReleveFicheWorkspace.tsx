"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVITY_ACTION_LABELS, ACTIVITY_ENTITY_LABELS, activityEntityName, allowedActions, buildReleveTree, CHANTIER_STATUTS, deletedNodes,
  RELEVE_STATUTS, siblingsOf, structureStats, VERSION_TYPE_LABELS, VERSION_TYPES,
  type ActivityEntry, type Chantier, type ChantierStatut, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure,
  type Version, type VersionType,
} from "@elsatia/releve-domain";
import { confirmRemovalMessage, KIND_LABELS } from "@/lib/releve/forms";
import { metreHref, photosHref, readReleveId, RELEVES_PATH, structureHref } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import { AutoSelect, AutoText, SaveStatus, useAutosave } from "./autosave-ui";
import { CHANTIER_STATUT_LABELS, RELEVE_STATUT_LABELS } from "./labels";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { useReleveService } from "./use-releve-service";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Fiche relevé : identité du projet, chantiers, versions typées, activité, corbeille. */
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
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [feedback, setFeedback] = useState("");
  const [resetKey, setResetKey] = useState(0);

  const load = useCallback(() => Promise.all([service.get(releveId), service.listVersions(releveId), service.listActivity(releveId, 30)]), [service, releveId]);
  const reload = useCallback(async () => {
    try { const [loaded, list, journal] = await load(); setStructure(loaded); setVersions(list); setActivity(journal); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    load()
      .then(([loaded, list, journal]) => { if (!cancelled) { setStructure(loaded); setVersions(list); setActivity(journal); } })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [load]);

  const tree = useMemo(() => (structure ? buildReleveTree(structure) : null), [structure]);
  const actions = useMemo(() => new Set(structure ? allowedActions(actor, structure.releve) : []), [actor, structure]);

  async function run(action: () => Promise<unknown>, message: string) {
    setFeedback("");
    try { await action(); await reload(); setFeedback(message); } catch (error) { await reload(); setFeedback(error instanceof Error ? error.message : "Action impossible."); }
  }

  if (!structure || !tree) return <p className={`shell ${styles.feedback}`} role="status">{feedback || "Chargement du relevé…"}</p>;
  const { releve } = structure;
  const stats = structureStats(structure);
  const deleted = Boolean(releve.deletedAt);
  const canEdit = actions.has("edit") && !deleted;
  const numeros = new Map(versions.map((version) => [version.id as string, version.numero]));
  const corbeille = deletedNodes(structure);

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={styles.breadcrumb}><li><Link href={RELEVES_PATH}>Mes relevés</Link></li><li aria-current="page">{releve.nom}</li></ol></nav>
      <p className="eyebrow">FICHE RELEVÉ · {RELEVE_STATUT_LABELS[releve.statut].toUpperCase()} · {releve.visibilite === "entreprise" ? "PARTAGÉ AVEC L'ENTREPRISE" : "PRIVÉ"}{deleted ? " · DANS LA CORBEILLE" : ""}</p>
      <h1 className="projects-title">{releve.nom}</h1>
      <dl className={styles.facts}>
        <div><dt>Site principal</dt><dd>{releve.chantier.nom}{releve.chantier.ville ? ` — ${releve.chantier.ville}` : ""}</dd></div>
        <div><dt>Client</dt><dd>{releve.client.nom ?? "—"}</dd></div>
        <div><dt>Référence</dt><dd>{releve.reference ?? "—"}</dd></div>
        <div><dt>Gestion Pro</dt><dd>{releve.chantier.gpChantierId ? "Lié à un chantier" : "Non lié"}</dd></div>
        <div><dt>Structure</dt><dd>{stats.chantiers} chantier(s), {stats.batiments} bâtiment(s), {stats.etages} étage(s), {stats.pieces} pièce(s)</dd></div>
      </dl>
      <div className={styles.toolbar}>
        <Link className={styles.secondary} href={photosHref(releveId)}>Photos terrain</Link>
        <Link className={styles.secondary} href={metreHref({ releveId })} data-testid="lien-metre">Métré</Link>
        {actions.has("share") && !deleted && <button className={styles.secondary} type="button" onClick={() => void run(() => service.setVisibility(releveId, releve.visibilite === "prive" ? "entreprise" : "prive"), releve.visibilite === "prive" ? "Relevé partagé avec l'entreprise." : "Relevé redevenu privé.")}>{releve.visibilite === "prive" ? "Partager avec l'entreprise" : "Rendre privé"}</button>}
        {actions.has("delete") && (deleted
          ? <button className={styles.primary} type="button" onClick={() => void run(() => service.restore(releveId), "Relevé restauré.")}>Restaurer le relevé</button>
          : <button className={styles.danger} type="button" onClick={() => {
            if (window.confirm(`Mettre « ${releve.nom} » à la corbeille ? Toute sa structure reste conservée et restaurable depuis « Mes relevés › Corbeille ».`)) void run(() => service.remove(releveId), "Relevé placé dans la corbeille.");
          }}>Mettre à la corbeille</button>)}
      </div>
      <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.fiche}`}>
      <div className={styles.column}>
        {canEdit && <ReleveIdentity key={`releve:${resetKey}`} service={service} structure={structure} onChanged={reload} onReloaded={() => { void reload(); setResetKey((value) => value + 1); }} />}

        <section className={styles.column} aria-label="Chantiers">
          <h2>Chantiers</h2>
          {tree.chantiers.map(({ chantier, batiments }) => <article key={chantier.id} className={styles.card}>
            <div>
              <span className={styles.meta}>{CHANTIER_STATUT_LABELS[chantier.statut]} · {batiments.length} bâtiment(s){chantier.gpChantierId ? " · Lié à Gestion Pro" : ""}{chantier.reference ? ` · ${chantier.reference}` : ""}</span>
              <h2>{chantier.nom}</h2>
              <p>{[chantier.clientNom, chantier.adresse, [chantier.codePostal, chantier.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Adresse non renseignée"}</p>
            </div>
            <Link className={styles.open} href={structureHref({ releveId, chantierId: chantier.id })}>Bâtiments, étages, pièces</Link>
            {canEdit && <ChantierEditor key={`${chantier.id}:${resetKey}`} service={service} releveId={releveId} chantier={chantier} structure={structure} run={run}
              onChanged={reload} onReloaded={() => { void reload(); setResetKey((value) => value + 1); }} />}
          </article>)}
          {tree.chantiers.length === 0 && <p className={styles.feedback}>Aucun chantier.</p>}
          {canEdit && <ChantierForm onSubmit={(nom, ville) => run(() => service.addChantier(releveId, { nom, ville: ville || null }), "Chantier ajouté.")} />}
        </section>
      </div>

      <div className={styles.column}>
        <section className={styles.column} aria-label="Versions">
          <h2>Versions</h2>
          {versions.length === 0 && <p className={styles.feedback}>Aucune version figée. Figez la version <strong>initiale</strong> une fois la structure relevée : elle servira de référence aux versions corrigée, projetée et tel que construit.</p>}
          <ul className={styles.pieces}>{versions.map((version) => <li key={version.id} className={styles.piece}>
            <span><strong>V{version.numero} · {VERSION_TYPE_LABELS[version.typeVersion]}</strong> <small>{version.libelle ?? ""}{version.versionBaseId ? ` · depuis V${numeros.get(version.versionBaseId) ?? "?"}` : ""}</small></span>
            <small><time dateTime={version.createdAt}>{dateFormat.format(new Date(version.createdAt))}</time></small>
          </li>)}</ul>
          {canEdit && <VersionForm first={versions.length === 0} onSubmit={(type, libelle) => run(() => service.createVersion(releveId, libelle || null, { type }), "Version figée.")} />}
        </section>

        <section className={styles.column} aria-label="Activité">
          <h2>Activité</h2>
          {activity.length === 0 && <p className={styles.feedback}>Aucune activité.</p>}
          <ul className={styles.activity}>{activity.map((entry) => {
            const name = activityEntityName(structure, entry);
            return <li key={entry.id}>
              <time dateTime={entry.createdAt}>{dateFormat.format(new Date(entry.createdAt))}</time>
              <span><strong>{ACTIVITY_ACTION_LABELS[entry.action]}</strong> · {ACTIVITY_ENTITY_LABELS[entry.entite]}{name ? ` « ${name} »` : ""}
                {entry.action === "duplication" && entry.details ? ` · ${String(entry.details.noeuds ?? "")} élément(s) de structure, 0 photo / mesure` : ""}
                {entry.action === "modification" && entry.champs.length ? ` · ${entry.champs.join(", ")}` : ""}</span>
            </li>;
          })}</ul>
        </section>

        <section className={styles.column} aria-label="Corbeille du relevé">
          <h2>Corbeille du relevé</h2>
          {corbeille.length === 0 && <p className={styles.feedback}>Aucun élément retiré.</p>}
          <ul className={styles.pieces}>{corbeille.map((node) => <li key={`${node.kind}:${node.id}`} className={styles.piece}>
            <span><strong>{node.nom}</strong> <small>{KIND_LABELS[node.kind].nom} · retiré le {dateFormat.format(new Date(node.deletedAt))}</small></span>
            {canEdit && <button type="button" className={styles.secondary} onClick={() => void run(() => service.restoreNode(releveId, node.kind, node.id), `« ${node.nom} » restauré avec son contenu.`)}>Restaurer</button>}
          </li>)}</ul>
        </section>
      </div>
    </div>
  </>;
}

function ReleveIdentity({ service, structure, onChanged, onReloaded }: { service: ReleveService; structure: ReleveStructure; onChanged(): Promise<void>; onReloaded(): void }) {
  const { releve } = structure;
  const api = useAutosave({
    revision: releve.revision,
    save: async (patch, revision) => ({ revision: (await service.updateReleve(releve.id, patch, revision)).revision }),
    fetchRevision: async () => (await service.get(releve.id)).releve.revision,
    onSaved: () => void onChanged(),
    onReloaded,
  });
  return <details className={styles.properties}>
    <summary>Informations du relevé</summary>
    <div className={styles.propertiesGrid}>
      <AutoText api={api} name="nom" label="Nom du relevé" value={releve.nom} required maxLength={160} />
      <AutoText api={api} name="reference" label="Référence" value={releve.reference} maxLength={80} />
      <AutoText api={api} name="clientNom" label="Client" value={releve.client.nom} maxLength={180} />
      <AutoText api={api} name="dateReleve" label="Date du relevé" value={releve.dateReleve} type="date" />
      <AutoSelect api={api} name="statut" label="Statut" value={releve.statut} options={RELEVE_STATUTS.map((value) => ({ value, label: RELEVE_STATUT_LABELS[value] }))} />
    </div>
    <AutoText api={api} name="notes" label="Notes" value={releve.notes} multiline maxLength={4000} />
    <SaveStatus api={api} label="relevé" />
  </details>;
}

/** Chantier : nom, client, adresse, CP, ville, référence, description, date, statut — sauvegarde automatique. */
function ChantierEditor({ service, releveId, chantier, structure, run, onChanged, onReloaded }: {
  service: ReleveService; releveId: ReleveId; chantier: Chantier; structure: ReleveStructure;
  run(action: () => Promise<unknown>, message: string): Promise<void>; onChanged(): Promise<void>; onReloaded(): void;
}) {
  const api = useAutosave({
    revision: chantier.revision,
    save: async (patch, revision) => ({ revision: (await service.updateNode(releveId, "chantier", chantier.id, patch, revision)).revision }),
    fetchRevision: async () => (await service.get(releveId)).chantiers.find((item) => item.id === chantier.id)?.revision ?? chantier.revision,
    onSaved: () => void onChanged(),
    onReloaded,
  });
  const siblings = siblingsOf(structure, "chantier", chantier.id);
  const index = siblings.findIndex((item) => item.id === chantier.id);
  return <details className={styles.properties}>
    <summary>Informations du chantier {chantier.nom}</summary>
    <div className={styles.propertiesGrid}>
      <AutoText api={api} name="nom" label="Nom du chantier" value={chantier.nom} required maxLength={180} />
      <AutoText api={api} name="clientNom" label="Client" value={chantier.clientNom} maxLength={180} />
      <AutoText api={api} name="adresse" label="Adresse" value={chantier.adresse} maxLength={400} />
      <AutoText api={api} name="codePostal" label="Code postal" value={chantier.codePostal} maxLength={12} inputMode="numeric" />
      <AutoText api={api} name="ville" label="Ville" value={chantier.ville} maxLength={120} />
      <AutoText api={api} name="reference" label="Référence" value={chantier.reference} maxLength={80} />
      <AutoText api={api} name="dateReleve" label="Date du relevé" value={chantier.dateReleve} type="date" />
      <AutoSelect<ChantierStatut> api={api} name="statut" label="Statut" value={chantier.statut} options={CHANTIER_STATUTS.map((value) => ({ value, label: CHANTIER_STATUT_LABELS[value] }))} />
    </div>
    <AutoText api={api} name="description" label="Description" value={chantier.description} multiline maxLength={4000} />
    <p className={styles.feedback}>{chantier.gpChantierId ? "Rattaché à un chantier Gestion Pro." : "Rattachement Gestion Pro : prévu (synchronisation non activée)."}</p>
    <SaveStatus api={api} label="chantier" />
    <div className={styles.toolbar}>
      <button type="button" className={styles.secondary} disabled={index <= 0} onClick={() => void run(() => service.move(releveId, "chantier", chantier.id, -1), "Ordre enregistré.")}>Monter</button>
      <button type="button" className={styles.secondary} disabled={index >= siblings.length - 1} onClick={() => void run(() => service.move(releveId, "chantier", chantier.id, 1), "Ordre enregistré.")}>Descendre</button>
      {siblings.length > 1 && <button type="button" className={styles.danger} onClick={() => {
        if (window.confirm(confirmRemovalMessage(structure, "chantier", chantier.id, chantier.nom))) void run(() => service.removeNode(releveId, "chantier", chantier.id), `« ${chantier.nom} » retiré (restaurable).`);
      }}>Retirer le chantier</button>}
    </div>
  </details>;
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
    <button className={styles.secondary} type="submit">{first ? "Figer la version initiale" : "Figer une version"}</button>
  </form>;
}
