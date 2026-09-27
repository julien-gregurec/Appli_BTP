"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  canPerform, filterReleves, isSearchable, matchReleve, RELEVE_DENIAL_MESSAGES, RELEVE_FILTER_LABELS, RELEVE_FILTERS,
  type Releve, type ReleveActorContext, type ReleveFilter, type ReleveService, type SearchHit,
} from "@elsatia/releve-domain";
import { ficheHref, RELEVE_NEW_PATH, searchHitHref } from "@/lib/releve/navigation";
import { RELEVE_STATUT_LABELS } from "./labels";
import { Brand } from "../HomeDashboard";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { useReleveService } from "./use-releve-service";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const ENTITE_LABELS: Record<SearchHit["entite"], string> = { releve: "Relevé", chantier: "Chantier", batiment: "Bâtiment", etage: "Étage", zone: "Zone", piece: "Pièce" };

export function ReleveListWorkspace() {
  const state = useReleveService();
  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href="/" className="all-tools">Accueil <span>×</span></Link></header>
    <section className="tool-hero"><div className="shell">
      <p className="eyebrow">TOOLS · <span className={styles.premium}>RELEVÉ &amp; MÉTRÉ</span></p>
      <h1 className="projects-title">Mes relevés</h1>
      <p>Structurez chaque projet en chantiers, bâtiments, étages, zones et pièces avant la prise de cotes.</p>
    </div></section>
    <div className="shell">
      {state.status === "locked" && <ReleveLocked reason={state.reason} />}
      {state.status === "loading" && <p className={styles.feedback} role="status">Vérification des droits…</p>}
      {state.status === "error" && <p className={styles.feedback} role="alert">{state.message}</p>}
      {state.status === "ready" && <ReleveList service={state.service} actor={state.actor} />}
    </div>
  </main>;
}

function ReleveList({ service, actor }: { service: ReleveService; actor: ReleveActorContext }) {
  const [releves, setReleves] = useState<Releve[] | null>(null);
  const [filter, setFilter] = useState<ReleveFilter>("actifs");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [feedback, setFeedback] = useState("");
  const canCreate = canPerform(actor, "create");

  const load = useCallback(async () => {
    const [actifs, supprimes] = await Promise.all([service.list(), service.listDeleted()]);
    return [...actifs, ...supprimes];
  }, [service]);
  useEffect(() => {
    let cancelled = false;
    load().then((items) => { if (!cancelled) setReleves(items); }).catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [load]);

  // Recherche serveur (chantier, bâtiment, étage, zone, pièce) après une courte pause de frappe.
  useEffect(() => {
    if (!isSearchable(query)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      service.search(query).then((result) => { if (!cancelled) setHits(result); }).catch(() => { if (!cancelled) setHits([]); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [service, query]);

  async function restore(releve: Releve) {
    try { await service.restore(releve.id); setReleves(await load()); setFeedback(`« ${releve.nom} » restauré.`); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Restauration impossible."); }
  }

  const searching = isSearchable(query);
  const visible = releves ? filterReleves(releves, filter).filter((releve) => matchReleve(releve, query)) : null;

  return <>
    <div className={styles.toolbar}>
      {canCreate.allowed
        ? <Link className={styles.open} href={RELEVE_NEW_PATH}>Nouveau relevé</Link>
        : <p className={styles.feedback}>{RELEVE_DENIAL_MESSAGES[canCreate.reason]}</p>}
      <label className={`${styles.field} ${styles.search}`}><span>Rechercher</span>
        <input type="search" value={query} maxLength={80} placeholder="Chantier, bâtiment, pièce…" onChange={(event) => { setQuery(event.target.value); if (!isSearchable(event.target.value)) setHits(null); }} /></label>
    </div>
    <div className={styles.tabs} role="group" aria-label="Filtres">
      {RELEVE_FILTERS.map((value) => <button key={value} type="button" className={styles.tab} aria-pressed={filter === value} onClick={() => setFilter(value)}>{RELEVE_FILTER_LABELS[value]}</button>)}
    </div>
    <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    {searching && <section className={styles.column} aria-label="Résultats de recherche">
      <h2>Résultats dans la structure</h2>
      {hits === null ? <p className={styles.feedback}>Recherche…</p> : hits.length === 0 ? <p className={styles.feedback}>Aucun chantier, bâtiment ni pièce ne correspond.</p>
        : <ul className={styles.hits}>{hits.map((hit) => <li key={`${hit.entite}:${hit.entiteId}`}><Link href={searchHitHref(hit)}>
          <small>{ENTITE_LABELS[hit.entite]}</small> {hit.libelle}{hit.entite !== "releve" ? <small> · {hit.releveNom}</small> : null}
        </Link></li>)}</ul>}
    </section>}
    <section className={styles.list} aria-label="Relevés">
      {visible === null ? <p className={styles.feedback}>Chargement…</p> : visible.length === 0
        ? <div className={styles.empty}><strong>{filter === "corbeille" ? "Corbeille vide" : "Aucun relevé"}</strong><span>{filter === "actifs" && !query ? "Créez un premier relevé : la structure chantier → bâtiment → étage → pièce se saisit sans scan." : "Aucun relevé ne correspond à ce filtre."}</span></div>
        : visible.map((releve) => <article className={styles.card} key={releve.id}>
          <div>
            <span className={styles.meta}>{releve.deletedAt ? "Dans la corbeille" : RELEVE_STATUT_LABELS[releve.statut]} · {releve.visibilite === "entreprise" ? "Partagé" : "Privé"}{releve.chantier.gpChantierId ? " · Lié à Gestion Pro" : ""}</span>
            <h2>{releve.nom}</h2>
            <p>Site : {releve.chantier.nom}{releve.chantier.ville ? ` — ${releve.chantier.ville}` : ""}{releve.client.nom ? ` · ${releve.client.nom}` : ""}</p>
            <small>Modifié le <time dateTime={releve.updatedAt}>{dateFormat.format(new Date(releve.updatedAt))}</time></small>
          </div>
          {releve.deletedAt
            ? <button type="button" className={styles.primary} onClick={() => void restore(releve)}>Restaurer</button>
            : <Link className={styles.open} href={ficheHref(releve.id)}>Ouvrir la fiche</Link>}
        </article>)}
    </section>
  </>;
}
