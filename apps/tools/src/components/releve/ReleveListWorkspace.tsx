"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { canPerform, RELEVE_DENIAL_MESSAGES, type Releve, type ReleveActorContext, type ReleveService } from "@elsatia/releve-domain";
import { structureHref } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { useReleveService } from "./use-releve-service";

const STATUTS: Record<Releve["statut"], string> = { brouillon: "Brouillon", en_cours: "En cours", termine: "Terminé", archive: "Archivé" };
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function ReleveListWorkspace() {
  const state = useReleveService();
  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href="/" className="all-tools">Accueil <span>×</span></Link></header>
    <section className="tool-hero"><div className="shell">
      <p className="eyebrow">TOOLS · <span className={styles.premium}>RELEVÉ &amp; MÉTRÉ</span></p>
      <h1 className="projects-title">Mes relevés</h1>
      <p>Structurez chaque chantier en bâtiments, étages, zones et pièces avant la prise de cotes.</p>
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
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ nom: "", chantierNom: "", chantierAdresse: "", chantierCodePostal: "", chantierVille: "", clientNom: "" });
  const canCreate = canPerform(actor, "create");

  const refresh = useCallback(async () => {
    try { setReleves(await service.list()); } catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [service]);
  useEffect(() => {
    let cancelled = false;
    service.list().then((items) => { if (!cancelled) setReleves(items); }).catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [service]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback("");
    try {
      const releve = await service.create(draft);
      setDraft({ nom: "", chantierNom: "", chantierAdresse: "", chantierCodePostal: "", chantierVille: "", clientNom: "" });
      setFeedback(`Relevé « ${releve.nom} » créé.`);
      await refresh();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Création impossible."); }
    finally { setBusy(false); }
  }

  const field = (key: keyof typeof draft, label: string, required = false, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className={styles.field}><span>{label}{required ? " *" : ""}</span><input value={draft[key]} required={required} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} {...extra} /></label>;

  return <>
    {canCreate.allowed ? <form className={styles.createForm} onSubmit={(event) => void create(event)} aria-label="Nouveau relevé">
      <h2>Nouveau relevé</h2>
      {field("nom", "Nom du relevé", true, { maxLength: 160, placeholder: "Appartement T3 — état des lieux" })}
      {field("chantierNom", "Chantier", true, { maxLength: 180, placeholder: "Résidence des Lilas" })}
      {field("chantierAdresse", "Adresse", false, { maxLength: 400 })}
      {field("chantierCodePostal", "Code postal", false, { maxLength: 12, inputMode: "numeric" })}
      {field("chantierVille", "Ville", false, { maxLength: 120 })}
      {field("clientNom", "Client", false, { maxLength: 180 })}
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={busy}>{busy ? "Création…" : "Créer le relevé"}</button></div>
    </form> : <p className={styles.feedback}>{RELEVE_DENIAL_MESSAGES[canCreate.reason]}</p>}
    <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    <section className={styles.list} aria-label="Relevés">
      {releves === null ? <p className={styles.feedback}>Chargement…</p> : releves.length === 0
        ? <div className={styles.empty}><strong>Aucun relevé</strong><span>Créez un premier relevé : la structure bâtiment → étage → pièce se saisit sans scan.</span></div>
        : releves.map((releve) => <article className={styles.card} key={releve.id}>
          <div>
            <span className={styles.meta}>{STATUTS[releve.statut]} · {releve.visibilite === "entreprise" ? "Partagé" : "Privé"}{releve.chantier.gpChantierId ? " · Lié à Gestion Pro" : ""}</span>
            <h2>{releve.nom}</h2>
            <p>Chantier : {releve.chantier.nom}{releve.chantier.ville ? ` — ${releve.chantier.ville}` : ""}</p>
            <small>Modifié le <time dateTime={releve.updatedAt}>{dateFormat.format(new Date(releve.updatedAt))}</time></small>
          </div>
          <Link className={styles.open} href={structureHref({ releveId: releve.id })}>Ouvrir la structure</Link>
        </article>)}
    </section>
  </>;
}
