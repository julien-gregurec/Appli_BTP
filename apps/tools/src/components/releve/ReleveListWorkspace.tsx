"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { canPerform, RELEVE_DENIAL_MESSAGES, type Releve, type ReleveActorContext, type ReleveService, type SearchFilter, type SearchResult } from "@elsatia/releve-domain";
import { ficheHref, pieceHref, RELEVE_NEW_PATH, structureHref } from "@/lib/releve/navigation";
import { ENTITE_LABELS, RELEVE_STATUT_LABELS } from "./labels";
import { Brand } from "../HomeDashboard";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { useReleveService } from "./use-releve-service";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

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
  const [feedback, setFeedback] = useState("");
  const canCreate = canPerform(actor, "create");
  const [texte, setTexte] = useState("");
  const [filtre, setFiltre] = useState<SearchFilter>("actif");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const searching = texte.trim() !== "" || filtre !== "actif";

  // Recherche serveur (RLS) avec une courte pause de frappe.
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      service.search(texte, filtre).then((items) => { if (!cancelled) setResults(items); })
        .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Recherche impossible."); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [service, texte, filtre, searching]);

  useEffect(() => {
    let cancelled = false;
    service.list().then((items) => { if (!cancelled) setReleves(items); }).catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [service]);

  return <>
    <div className={styles.toolbar}>
      {canCreate.allowed
        ? <Link className={styles.open} href={RELEVE_NEW_PATH}>Nouveau relevé</Link>
        : <p className={styles.feedback}>{RELEVE_DENIAL_MESSAGES[canCreate.reason]}</p>}
    </div>
    <form className={styles.search} role="search" onSubmit={(event) => event.preventDefault()}>
      <label className={styles.field}><span>Rechercher un chantier, un bâtiment, une pièce</span>
        <input type="search" value={texte} maxLength={120} placeholder="Résidence, ville, « séjour »…" onChange={(event) => setTexte(event.target.value)} /></label>
      <div className={styles.chips} role="radiogroup" aria-label="Filtre">
        {([["actif", "Actifs"], ["recent", "Récents"], ["archive", "Archivés"], ["tous", "Tous"]] as const).map(([value, label]) =>
          <button key={value} type="button" role="radio" aria-checked={filtre === value} className={styles.chip} onClick={() => setFiltre(value)}>{label}</button>)}
      </div>
    </form>
    <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    {searching && <section className={styles.list} aria-label="Résultats">
      {results === null ? <p className={styles.feedback}>Recherche…</p> : results.length === 0 ? <p className={styles.feedback}>Aucun résultat.</p>
        : results.map((result) => <article className={styles.card} key={`${result.type}:${result.id}`}>
          <div>
            <span className={styles.meta}>{ENTITE_LABELS[result.type]} · {RELEVE_STATUT_LABELS[result.releveStatut]}</span>
            <h2>{result.libelle}</h2>
            <p>{result.contexte || result.releveNom}</p>
          </div>
          <Link className={styles.open} href={result.type === "piece" ? pieceHref(result.releveId, result.id) : result.type === "batiment" ? structureHref({ releveId: result.releveId }) : ficheHref(result.releveId)}>Ouvrir</Link>
        </article>)}
    </section>}
    {!searching && <section className={styles.list} aria-label="Relevés">
      {releves === null ? <p className={styles.feedback}>Chargement…</p> : releves.length === 0
        ? <div className={styles.empty}><strong>Aucun relevé</strong><span>Créez un premier relevé : la structure chantier → bâtiment → étage → pièce se saisit sans scan.</span></div>
        : releves.map((releve) => <article className={styles.card} key={releve.id}>
          <div>
            <span className={styles.meta}>{RELEVE_STATUT_LABELS[releve.statut]} · {releve.visibilite === "entreprise" ? "Partagé" : "Privé"}{releve.chantier.gpChantierId ? " · Lié à Gestion Pro" : ""}</span>
            <h2>{releve.nom}</h2>
            <p>Site : {releve.chantier.nom}{releve.chantier.ville ? ` — ${releve.chantier.ville}` : ""}</p>
            <small>Modifié le <time dateTime={releve.updatedAt}>{dateFormat.format(new Date(releve.updatedAt))}</time></small>
          </div>
          <Link className={styles.open} href={ficheHref(releve.id)}>Ouvrir la fiche</Link>
        </article>)}
    </section>}
  </>;
}
