"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canPerform, RELEVE_DENIAL_MESSAGES, type ReleveActorContext, type ReleveService } from "@elsatia/releve-domain";
import { ficheHref, RELEVES_PATH } from "@/lib/releve/navigation";
import { Brand } from "../HomeDashboard";
import styles from "./releve.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { useReleveService } from "./use-releve-service";

const EMPTY = { nom: "", reference: "", chantierNom: "", chantierAdresse: "", chantierCodePostal: "", chantierVille: "", clientNom: "", dateReleve: "" };

/** « Nouveau relevé » : crée le projet et son premier chantier, puis ouvre la fiche. */
export function ReleveNewWorkspace() {
  const state = useReleveService();
  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    <section className="tool-hero"><div className="shell">
      <p className="eyebrow">RELEVÉ &amp; MÉTRÉ</p>
      <h1 className="projects-title">Nouveau relevé</h1>
      <p>Un projet relevé regroupe un ou plusieurs chantiers. Le premier chantier est créé à partir du site saisi ici.</p>
    </div></section>
    <div className="shell">
      {state.status === "locked" && <ReleveLocked reason={state.reason} />}
      {state.status === "loading" && <p className={styles.feedback} role="status">Vérification des droits…</p>}
      {state.status === "error" && <p className={styles.feedback} role="alert">{state.message}</p>}
      {state.status === "ready" && <NewReleveForm service={state.service} actor={state.actor} />}
    </div>
  </main>;
}

function NewReleveForm({ service, actor }: { service: ReleveService; actor: ReleveActorContext }) {
  const router = useRouter();
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const canCreate = canPerform(actor, "create");
  if (!canCreate.allowed) return <p className={styles.feedback}>{RELEVE_DENIAL_MESSAGES[canCreate.reason]}</p>;

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback("");
    try {
      const releve = await service.create({ ...draft, dateReleve: draft.dateReleve || null });
      router.push(ficheHref(releve.id));
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Création impossible."); setBusy(false); }
  }

  const field = (key: keyof typeof EMPTY, label: string, required = false, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className={styles.field}><span>{label}{required ? " *" : ""}</span><input value={draft[key]} required={required} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} {...extra} /></label>;

  return <>
    <form className={styles.createForm} onSubmit={(event) => void create(event)} aria-label="Nouveau relevé">
      <h2>Projet</h2>
      {field("nom", "Nom du relevé", true, { maxLength: 160, placeholder: "Résidence des Lilas — état des lieux" })}
      {field("reference", "Référence", false, { maxLength: 80 })}
      {field("clientNom", "Client", false, { maxLength: 180 })}
      {field("dateReleve", "Date du relevé", false, { type: "date" })}
      <h2>Premier chantier</h2>
      {field("chantierNom", "Chantier", true, { maxLength: 180, placeholder: "Résidence des Lilas" })}
      {field("chantierAdresse", "Adresse", false, { maxLength: 400 })}
      {field("chantierCodePostal", "Code postal", false, { maxLength: 12, inputMode: "numeric" })}
      {field("chantierVille", "Ville", false, { maxLength: 120 })}
      <div className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Création…" : "Créer le relevé"}</button>
        <Link className={styles.secondary} href={RELEVES_PATH}>Annuler</Link>
      </div>
    </form>
    <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
  </>;
}
