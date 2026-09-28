"use client";

/**
 * Quantitatifs (Lot 9) : transforme le métré du Lot 8 en QUANTITÉS TECHNIQUES par ouvrage.
 *
 * Les quantités sont CALCULÉES PAR LE SERVEUR (moteur déterministe, miroir exact du domaine) à partir du
 * métré et des murs du plan ; le client n'envoie jamais une quantité calculée. Chaque ouvrage porte une
 * règle fermée (source + opérations + perte + arrondi) : aucun code n'est exécuté. Les quantités sont
 * séparées par état projeté (conservé / à déposer / à créer / déplacé), ajustables avec raison obligatoire
 * (la quantité calculée reste visible), agrégées par chantier, bâtiment, étage, zone, pièce, lot ou ouvrage,
 * exportées en CSV et en contrat Gestion Pro (JSON, sans prix, sans devis).
 *
 * Tablette d'abord : cartes repliables (le détail d'un ouvrage n'est rendu qu'à l'ouverture), aucune table
 * à défilement horizontal, cibles ≥ 40 px.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  agregerQuantitatif, allowedActions, ARRONDI_MODE_LABELS, ARRONDI_MODES, breadcrumbFor, buildQuantitatifGpPayload, decimalString, EQUIPEMENT_CATEGORIE_LABELS,
  EQUIPEMENT_CATEGORIES, ETAT_PROJET_LABELS, ETATS_PROJET, formatQuantiteOuvrage, formuleTexte, METRE_SYNTHESE_ETAT_LABELS, METRE_SYNTHESE_ETATS, newUuid,
  OUVERTURE_TYPES, OUVRAGE_CATALOGUE_STANDARD, OUVRAGE_CATEGORIE_LABELS, OUVRAGE_CATEGORIES, OUVRAGE_ISSUE_MESSAGES, OUVRAGE_LOT_PAR_CATEGORIE, OUVRAGE_OPERATION_LABELS,
  OUVRAGE_OPERATIONS, OUVRAGE_SOURCE_LABELS, OUVRAGE_SOURCES, OUVRAGE_SOURCES_A_ETAT, OUVRAGE_UNITE_LABELS, OUVRAGE_UNITES, ouvrageAnomalie, ouvrageLot, ouvrageModele, ouvrageOrigine,
  PLAN_ETAT_LABELS, QUANTITATIF_ANOMALIE_LABELS, QUANTITATIF_NIVEAU_LABELS, QUANTITATIF_NIVEAUX, quantitatifDetails, quantitatifToCsv, regleUnite, REVETEMENT_FAMILLE_LABELS,
  REVETEMENT_FAMILLES, REVETEMENT_SUPPORT_LABELS, REVETEMENT_SUPPORTS, syntheseTravaux, toMilli,
  type ArrondiMode, type BibliothequeOuvrage, type EquipementCategorie, type EtatProjet, type MetreSyntheseEtat, type OuvertureType, type OuvrageCategorie, type OuvrageDonnees,
  type OuvrageOperation, type OuvrageOperationCode, type OuvrageRecord, type OuvrageSource, type OuvrageUnite, type QuantitatifLigne, type QuantitatifNiveau,
  type QuantitatifSource, type QuantitatifTotal, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure, type RevetementSupport,
} from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { ficheHref, metreHref, planHref, quantitatifsHref, readQuantitatifsSelection, RELEVES_PATH, type QuantitatifsSelection } from "@/lib/releve/navigation";
import { SupabaseQuantitatifRepository } from "@/lib/releve/plan/supabase-quantitatif-repository";
import { OUVERTURE_TYPE_LABELS } from "../plan/PlanLayers";
import { Brand } from "../../HomeDashboard";
import releveStyles from "../releve.module.css";
import { ReleveLocked } from "../ReleveLocked";
import { useReleveService } from "../use-releve-service";
import styles from "../metre/metre.module.css";
import q from "./quantitatifs.module.css";

export function ReleveQuantitatifsWorkspace() {
  const state = useReleveService();
  const [target, setTarget] = useState<QuantitatifsSelection | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setTarget(readQuantitatifsSelection(window.location.search));
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, []);
  const navigate = (next: QuantitatifsSelection) => { window.history.pushState(null, "", quantitatifsHref(next)); setTarget(readQuantitatifsSelection(window.location.search)); };
  return <main className={`projects-page ${styles.page}`}>
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${releveStyles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${releveStyles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && target === null && <p className={`shell ${releveStyles.feedback}`} role="alert">Relevé introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && target && <QuantitatifsLoader key={`${target.releveId}:${target.etat}`} service={state.service} actor={state.actor} selection={target}
      onEtat={(etat) => navigate({ ...target, etat })} onNiveau={(niveau) => navigate({ ...target, niveau })} />}
  </main>;
}

type Ctx = {
  releveId: ReleveId; structure: ReleveStructure; repository: SupabaseQuantitatifRepository; canEdit: boolean; etat: MetreSyntheseEtat;
  bibliotheque: BibliothequeOuvrage[] | null; loadBibliotheque(): Promise<BibliothequeOuvrage[]>;
  setFeedback(message: string): void; refreshPlan(planId: string): Promise<void>;
};

function QuantitatifsLoader({ service, actor, selection, onEtat, onNiveau }: {
  service: ReleveService; actor: ReleveActorContext; selection: QuantitatifsSelection; onEtat(etat: MetreSyntheseEtat): void; onNiveau(niveau: QuantitatifNiveau): void;
}) {
  const client = getElsatiaClient();
  const repository = useMemo(() => new SupabaseQuantitatifRepository(client), [client]);
  const releveId = selection.releveId as ReleveId;
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [sources, setSources] = useState<QuantitatifSource[] | null>(null);
  const [bibliotheque, setBibliotheque] = useState<BibliothequeOuvrage[] | null>(null);
  const [feedback, setFeedback] = useState("");
  const [timing, setTiming] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    Promise.all([service.get(releveId), repository.synthese(releveId, selection.etat)])
      .then(([loaded, synthese]) => { if (!cancelled) { setStructure(loaded); setSources(synthese); setTiming(Math.round(performance.now() - started)); } })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Quantitatifs non accessibles."); });
    return () => { cancelled = true; };
  }, [service, repository, releveId, selection.etat]);

  /** Après une modification : seul le plan concerné est relu (calcul serveur). */
  const refreshPlan = useCallback(async (planId: string) => {
    const quantitatif = await repository.planQuantitatif(planId);
    setSources((current) => current?.map((source) => (source.planId === planId ? { ...source, quantitatif } : source)) ?? current);
  }, [repository]);
  const loadBibliotheque = useCallback(async () => { const list = await repository.bibliotheque(releveId); setBibliotheque(list); return list; }, [repository, releveId]);

  const details = useMemo(() => (structure && sources ? quantitatifDetails(structure, sources) : null), [structure, sources]);
  const groupes = useMemo(() => (details ? agregerQuantitatif(details, selection.niveau) : null), [details, selection.niveau]);
  if (!structure || !sources || !details || !groupes) return <p className={`shell ${releveStyles.feedback}`} role="status">{feedback || "Calcul des quantitatifs…"}</p>;

  const canEdit = allowedActions(actor, structure.releve).includes("edit");
  const crumbs = breadcrumbFor(structure, null);
  const anomalies = sources.flatMap((source) => source.quantitatif.anomalies.map((a) => ({ ...a, planId: source.planId, ouvrage: source.quantitatif.ouvrages.find((o) => o.id === a.ouvrageId) })));
  const erreurs = anomalies.filter((a) => a.gravite === "erreur").length;
  const nbOuvrages = sources.reduce((s, source) => s + source.quantitatif.ouvrages.length, 0);
  const ajustees = details.filter((d) => d.ligne.ajustement).length;
  const ctx: Ctx = { releveId, structure, repository, canEdit, etat: selection.etat, bibliotheque, loadBibliotheque, setFeedback, refreshPlan };
  const baseName = `quantitatifs-${structure.releve.nom}-${selection.etat}`;
  const pieceNom = new Map(structure.pieces.map((p) => [p.id as string, p.nom]));

  function download(content: string, type: string, name: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name.replace(/\s+/g, "-");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={releveStyles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        {crumbs.map((crumb) => <li key={`${crumb.level}:${crumb.id}`}><Link href={ficheHref(releveId)}>{crumb.label}</Link></li>)}
        <li aria-current="page">Quantitatifs</li>
      </ol></nav>
      <p className="eyebrow">QUANTITATIFS · {METRE_SYNTHESE_ETAT_LABELS[selection.etat].toUpperCase()}</p>
      <h1 className="projects-title">Quantitatifs · {structure.releve.nom}</h1>
      <div className={`${releveStyles.tabs} ${styles.noPrint}`} role="tablist" aria-label="État documenté">
        {METRE_SYNTHESE_ETATS.map((etat) => <button key={etat} type="button" role="tab" className={releveStyles.tab} aria-selected={etat === selection.etat}
          data-testid={`qt-etat-${etat}`} onClick={() => onEtat(etat)}>{METRE_SYNTHESE_ETAT_LABELS[etat]}</button>)}
      </div>
      <p className={releveStyles.feedback} role="status" aria-live="polite" data-testid="qt-message">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.body}`} data-testid="qt-vue" data-calcul-ms={timing ?? undefined}>
      <div className={`${styles.bar} ${styles.noPrint}`}>
        <label className={releveStyles.field}><span>Regrouper par</span>
          <select data-testid="qt-niveau" value={selection.niveau} onChange={(event) => onNiveau(event.target.value as QuantitatifNiveau)}>
            {QUANTITATIF_NIVEAUX.map((niveau) => <option key={niveau} value={niveau}>{QUANTITATIF_NIVEAU_LABELS[niveau]}</option>)}
          </select>
        </label>
        <button type="button" className={releveStyles.secondary} data-testid="qt-export-csv" onClick={() => download(quantitatifToCsv(details), "text/csv;charset=utf-8", `${baseName}.csv`)}>Exporter CSV</button>
        <button type="button" className={releveStyles.secondary} data-testid="qt-export-json" title="Contrat de données vers Gestion Pro (préparé, non transmis ; aucun devis créé)"
          onClick={() => download(JSON.stringify(buildQuantitatifGpPayload(releveId, selection.etat, sources, details), null, 2), "application/json", `${baseName}.gp.json`)}>Transfert GP (JSON)</button>
        <Link className={releveStyles.secondary} href={metreHref({ releveId, etat: selection.etat })} data-testid="qt-lien-metre">Métré</Link>
      </div>

      <dl className={styles.tiles} data-testid="qt-totaux">
        <div className={styles.tile}><dt>Ouvrages</dt><dd data-testid="qt-total-ouvrages">{nbOuvrages}</dd></div>
        <div className={styles.tile}><dt>Lignes</dt><dd data-testid="qt-total-lignes">{details.length}</dd></div>
        <div className={styles.tile}><dt>Ajustées</dt><dd data-testid="qt-total-ajustees">{ajustees}</dd></div>
        <div className={styles.tile}><dt>Anomalies</dt><dd data-testid="qt-total-anomalies">{erreurs} erreur(s) · {anomalies.length - erreurs} avert.</dd></div>
      </dl>

      {sources.length === 0 && <section className={styles.section}><h2>Aucun plan</h2>
        <p className={styles.muted}>Aucun étage n&apos;a de plan « {METRE_SYNTHESE_ETAT_LABELS[selection.etat]} ». Les quantités se calculent à partir du métré des plans.</p></section>}

      {anomalies.length > 0 && <details className={styles.piece} data-testid="qt-anomalies" open={erreurs > 0}>
        <summary><strong>Anomalies ({anomalies.length})</strong><span className={styles.badge} data-tone={erreurs ? "alerte" : undefined}>{erreurs} erreur(s)</span></summary>
        <ul className={`${styles.rows} ${styles.pieceBody}`}>{anomalies.map((a, i) => <li key={`${a.planId}:${i}`} data-testid="qt-anomalie" data-code={a.code} data-gravite={a.gravite}>
          <span>{a.ouvrage?.nom ?? "Ouvrage"}{a.pieceId ? ` · ${pieceNom.get(a.pieceId) ?? "pièce"}` : ""}{a.etatProjet ? ` · ${ETAT_PROJET_LABELS[a.etatProjet]}` : ""}
            <small className={styles.muted}> — {a.message}</small></span>
          <span className={styles.badge} data-tone={a.gravite === "erreur" ? "alerte" : undefined}>{QUANTITATIF_ANOMALIE_LABELS[a.code]}</span>
        </li>)}</ul>
      </details>}

      <section className={styles.section} aria-label="Synthèse" data-testid="qt-synthese">
        <h2>Synthèse par {QUANTITATIF_NIVEAU_LABELS[selection.niveau].toLowerCase()}</h2>
        {groupes.length === 0 ? <p className={styles.muted}>Aucune quantité : ajoutez des ouvrages aux plans ci-dessous.</p>
          : groupes.map((groupe, index) => <details key={groupe.cle} className={styles.piece} data-testid="qt-groupe" data-cle={groupe.cle} open={index === 0 && groupes.length <= 20}>
            <summary><strong>{groupe.libelle}</strong><span className={styles.muted}>{groupe.chemin.slice(0, -1).join(" › ")} · {groupe.totaux.length} ouvrage(s) · {groupe.lignes} ligne(s)</span></summary>
            <ul className={`${styles.rows} ${styles.pieceBody}`}>{groupe.totaux.map((total) => <TotalRow key={total.cle} total={total} />)}</ul>
          </details>)}
      </section>

      {sources.map((source) => <PlanOuvrages key={source.planId} source={source} ctx={ctx} />)}
    </div>
  </>;
}

function TotalRow({ total }: { total: QuantitatifTotal }) {
  const t = syntheseTravaux(total);
  const chip = (label: string, value: bigint, testId: string) => (value !== BigInt(0) ? <span className={q.chip} data-testid={testId}>{label} {formatQuantiteOuvrage(value, total.unite)}</span> : null);
  return <li data-testid="qt-total" data-cle={total.cle}>
    <span>{total.nom} <small className={styles.muted}>· {total.lot} · {total.lignes} ligne(s){total.ajustees ? ` · ${total.ajustees} ajustée(s)` : ""}{total.nonCalculables ? ` · ${total.nonCalculables} non calculable(s)` : ""}</small></span>
    <span className={styles.value} data-testid="qt-total-quantite">{formatQuantiteOuvrage(total.total, total.unite)}</span>
    <span className={q.chips}>
      {chip("conservé", t.conservee, "qt-conserve")}{chip("à déposer", t.aDeposer, "qt-a-deposer")}{chip("à créer", t.aCreer, "qt-a-creer")}{chip("déplacé", t.deplacee, "qt-deplace")}
      {(total.erreurs > 0 || total.avertissements > 0) && <span className={styles.badge} data-tone={total.erreurs ? "alerte" : undefined}>{total.erreurs + total.avertissements} anomalie(s)</span>}
    </span>
  </li>;
}

// ── Ouvrages d'un plan ────────────────────────────────────────────────────────

function PlanOuvrages({ source, ctx }: { source: QuantitatifSource; ctx: Ctx }) {
  const quantitatif = source.quantitatif;
  const etage = ctx.structure.etages.find((e) => e.id === source.etageId);
  const editable = ctx.canEdit && !source.figeLe;
  const [adding, setAdding] = useState<"form" | "catalogue" | "bibliotheque" | null>(null);
  const [busy, setBusy] = useState(false);
  const lignesParOuvrage = useMemo(() => {
    const map = new Map<string, QuantitatifLigne[]>();
    for (const ligne of quantitatif.lignes) map.set(ligne.ouvrageId, [...(map.get(ligne.ouvrageId) ?? []), ligne]);
    return map;
  }, [quantitatif.lignes]);
  const pieces = ctx.structure.pieces.filter((p) => p.etageId === source.etageId && !p.deletedAt);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try { await action(); await ctx.refreshPlan(source.planId); ctx.setFeedback(message); } catch (error) { ctx.setFeedback(error instanceof Error ? error.message : "Action impossible."); } finally { setBusy(false); }
  };
  const importer = (entries: readonly { donnees: OuvrageDonnees; bibliothequeId?: string | null }[], message: string) =>
    run(() => ctx.repository.importOuvrages(source.planId, entries.map((entry) => ({ id: newUuid(), donnees: entry.donnees, bibliothequeId: entry.bibliothequeId ?? null }))), message);

  return <section className={styles.section} aria-label={`Ouvrages · ${etage?.nom ?? "étage"}`} data-testid="qt-plan" data-plan={source.planId}>
    <h2 className={styles.levelTitle}>
      <span>Ouvrages · {etage?.nom ?? "Étage"}</span>
      <span className={styles.badge} data-tone={source.figeLe ? "fige" : undefined} data-testid="qt-plan-badge">
        Plan {source.numero} · {PLAN_ETAT_LABELS[source.etat]}{source.figeLe ? " · quantitatif figé" : " · calculé"}
      </span>
      <Link className={styles.noPrint} href={planHref({ releveId: ctx.releveId, etageId: source.etageId, planId: source.planId })}>Voir le plan</Link>
    </h2>
    {source.figeLe && <p className={styles.muted}>Plan figé : ouvrages, règles et ajustements sont figés avec lui. Dérivez un plan (corrigé, projeté) pour recalculer.</p>}
    {quantitatif.ouvrages.length === 0 && <p className={styles.muted}>Aucun ouvrage sur ce plan.</p>}
    <div className={q.list}>
      {quantitatif.ouvrages.map((ouvrage) => <OuvrageCard key={ouvrage.id} ouvrage={ouvrage} lignes={lignesParOuvrage.get(ouvrage.id) ?? []} source={source} ctx={ctx} editable={editable} pieces={pieces} run={run} busy={busy} />)}
    </div>
    {editable && <div className={`${styles.inlineActions} ${styles.noPrint}`}>
      <button type="button" className={releveStyles.primary} data-testid="qt-ajouter" onClick={() => setAdding(adding === "form" ? null : "form")}>+ Ouvrage</button>
      <button type="button" className={releveStyles.secondary} data-testid="qt-ajouter-catalogue" onClick={() => setAdding(adding === "catalogue" ? null : "catalogue")}>Depuis le catalogue</button>
      <button type="button" className={releveStyles.secondary} data-testid="qt-ajouter-bibliotheque" onClick={() => { setAdding(adding === "bibliotheque" ? null : "bibliotheque"); void ctx.loadBibliotheque(); }}>Depuis la bibliothèque</button>
    </div>}
    {editable && adding === "form" && <OuvrageForm initial={null} pieces={pieces} ctx={ctx} onCancel={() => setAdding(null)}
      onSave={(donnees) => run(() => ctx.repository.saveOuvrage(source.planId, newUuid(), donnees), `Ouvrage « ${donnees.nom} » ajouté.`).then(() => setAdding(null))} />}
    {editable && adding === "catalogue" && <Catalogue busy={busy} onImport={(entries, message) => importer(entries.map((donnees) => ({ donnees: adapterEtats(donnees, source.etat) })), message).then(() => setAdding(null))} />}
    {editable && adding === "bibliotheque" && <Bibliotheque ctx={ctx} busy={busy}
      onImport={(entries) => importer(entries.map((entry) => ({ donnees: entry.donnees as OuvrageDonnees, bibliothequeId: entry.id })), `${entries.length} ouvrage(s) ajouté(s) depuis la bibliothèque.`).then(() => setAdding(null))} />}
  </section>;
}

/**
 * Catalogue sur un plan EXISTANT (initial / corrigé) : tous les éléments y sont « existants » ; les ouvrages
 * qui ne sont pas de dépose retiennent donc aussi l'état existant (sinon ils ne compteraient rien).
 */
function adapterEtats(donnees: OuvrageDonnees, etatPlan: QuantitatifSource["etat"]): OuvrageDonnees {
  if ((etatPlan !== "initial" && etatPlan !== "corrige") || donnees.etatTravaux === "a_deposer" || donnees.etats.includes("existant")) return donnees;
  return { ...donnees, etats: ["existant", ...donnees.etats] };
}

function OuvrageCard({ ouvrage, lignes, source, ctx, editable, pieces, run, busy }: {
  ouvrage: OuvrageRecord; lignes: QuantitatifLigne[]; source: QuantitatifSource; ctx: Ctx; editable: boolean; pieces: ReleveStructure["pieces"];
  run(action: () => Promise<unknown>, message: string): Promise<void>; busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  let totalMilli = BigInt(0); let nonCalc = 0;
  for (const l of lignes) { if (l.quantiteRetenue === null) nonCalc += 1; else totalMilli += toMilli(l.quantiteRetenue); }
  const anomalies = source.quantitatif.anomalies.filter((a) => a.ouvrageId === ouvrage.id);
  return <details className={styles.piece} data-testid="qt-ouvrage" data-ouvrage={ouvrage.id} data-code={ouvrage.code ?? undefined} open={open}
    onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary>
      <strong data-testid="qt-ouvrage-nom">{ouvrage.nom}</strong>
      <span className={styles.value} data-testid="qt-ouvrage-total">{formatQuantiteOuvrage(totalMilli, ouvrage.unite)}{nonCalc ? ` (+ ${nonCalc} non calculable)` : ""}</span>
      <span className={styles.badge}>{OUVRAGE_CATEGORIE_LABELS[ouvrage.categorie]}</span>
      {ouvrageOrigine(ouvrage) === "manuelle" && <span className={styles.badge}>manuel</span>}
      {anomalies.length > 0 && <span className={styles.badge} data-tone={anomalies.some((a) => a.gravite === "erreur") ? "alerte" : undefined} data-testid="qt-ouvrage-anomalies">{anomalies.length} anomalie(s)</span>}
    </summary>
    {open && <div className={styles.pieceBody}>
      <p className={styles.muted} data-testid="qt-formule">{formuleTexte(ouvrage)}</p>
      <p className={styles.muted}>Lot : {ouvrageLot(ouvrage)} · {OUVRAGE_SOURCES_A_ETAT.includes(ouvrage.regle.source)
        ? `états retenus : ${ouvrage.etats.map((e) => ETAT_PROJET_LABELS[e]).join(", ")}` : `quantités ${ETAT_PROJET_LABELS[ouvrage.etatTravaux].toLowerCase()}`}
        {ouvrage.pieceIds?.length ? ` · ${ouvrage.pieceIds.length} pièce(s) visée(s)` : " · toutes les pièces"}{ouvrage.commentaire ? ` · ${ouvrage.commentaire}` : ""}</p>
      <ul className={styles.rows} data-testid="qt-lignes">{lignes.map((ligne) => <LigneRow key={`${ligne.pieceId}:${ligne.etatProjet}`} ligne={ligne} ouvrage={ouvrage} source={source} ctx={ctx} editable={editable} run={run} />)}</ul>
      {lignes.length === 0 && <p className={styles.muted}>Aucune ligne : aucune donnée du plan ne correspond à la règle.</p>}
      {anomalies.map((a, i) => <p key={i} className={a.gravite === "erreur" ? styles.stale : styles.muted} data-testid="qt-ouvrage-anomalie">{QUANTITATIF_ANOMALIE_LABELS[a.code]} — {a.message}</p>)}
      {editable && !editing && <div className={`${styles.inlineActions} ${styles.noPrint}`}>
        <button type="button" className={releveStyles.secondary} data-testid="qt-ouvrage-modifier" onClick={() => setEditing(true)}>Modifier</button>
        <button type="button" className={releveStyles.secondary} data-testid="qt-ouvrage-bibliotheque" disabled={busy} onClick={() => {
          void run(() => ctx.repository.saveBibliotheque(ctx.releveId, newUuid(), ouvrageModele(ouvrage)).then(() => ctx.loadBibliotheque()), `« ${ouvrage.nom} » enregistré dans la bibliothèque.`);
        }}>Enregistrer dans la bibliothèque</button>
        <button type="button" className={releveStyles.danger} data-testid="qt-ouvrage-supprimer" disabled={busy} onClick={() => {
          if (!window.confirm(`Supprimer l'ouvrage « ${ouvrage.nom} » ? Ses ajustements seront retirés (tracés).`)) return;
          void run(() => ctx.repository.deleteOuvrage(source.planId, ouvrage.id), "Ouvrage supprimé.");
        }}>Supprimer</button>
      </div>}
      {editable && editing && <OuvrageForm initial={ouvrage} pieces={pieces} ctx={ctx} onCancel={() => setEditing(false)}
        onSave={(donnees) => run(() => ctx.repository.saveOuvrage(source.planId, ouvrage.id, donnees), `Ouvrage « ${donnees.nom} » enregistré.`).then(() => setEditing(false))} />}
    </div>}
  </details>;
}

function LigneRow({ ligne, ouvrage, source, ctx, editable, run }: {
  ligne: QuantitatifLigne; ouvrage: OuvrageRecord; source: QuantitatifSource; ctx: Ctx; editable: boolean; run(action: () => Promise<unknown>, message: string): Promise<void>;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const piece = ligne.pieceId ? ctx.structure.pieces.find((p) => p.id === ligne.pieceId)?.nom ?? "Pièce" : ligne.annotations.includes("partage") ? "Étage (partagé entre pièces)" : "Étage";
  const u = ouvrage.unite;
  const fmt = (value: number | null) => formatQuantiteOuvrage(value === null ? null : toMilli(value), u);
  return <li data-testid="qt-ligne" data-piece={ligne.pieceId ?? "etage"} data-etat={ligne.etatProjet}>
    <span>{piece} · {ETAT_PROJET_LABELS[ligne.etatProjet]}<small className={styles.muted}> · {ligne.elements} élément(s) source</small></span>
    <span className={styles.value} data-testid="qt-ligne-quantite">{fmt(ligne.quantiteRetenue)}
      {ligne.ajustement && <small className={ligne.ajustement.perime ? styles.stale : styles.muted}> · calculé {fmt(ligne.quantiteCalculee)}{ligne.ajustement.perime ? " (a changé depuis l'ajustement)" : ""}</small>}
    </span>
    {editable && <span className={`${styles.inlineActions} ${styles.noPrint}`}>
      {ligne.quantiteCalculee !== null && <button type="button" className={releveStyles.secondary} data-testid="qt-ajuster" onClick={() => setAdjusting(true)}>Ajuster</button>}
      {ligne.ajustement && <button type="button" className={releveStyles.secondary} data-testid="qt-retirer"
        onClick={() => void run(() => ctx.repository.retirerAjustement(ligne.ajustement!.id, null), "Ajustement retiré : retour à la quantité calculée.")}>Quantité calculée</button>}
    </span>}
    {ligne.ajustement && <small className={styles.muted} data-testid="qt-ajustement">Retenu {fmt(ligne.ajustement.valeurRetenue)} au lieu de {fmt(ligne.ajustement.valeurCalculee)} — « {ligne.ajustement.raison} »{ligne.ajustement.date ? ` · ${new Date(ligne.ajustement.date).toLocaleString("fr-FR")}` : ""}</small>}
    {adjusting && <AjustementForm unite={u} onCancel={() => setAdjusting(false)} onSave={(valeur, raison) =>
      run(() => ctx.repository.ajuster(source.planId, { ouvrageId: ouvrage.id, pieceId: ligne.pieceId, etatProjet: ligne.etatProjet }, valeur, raison),
        `${ouvrage.nom} ajusté : la quantité calculée reste affichée à côté.`).then(() => setAdjusting(false))} />}
  </li>;
}

/** « 12,5 » → 12.5 ; au plus `decimales` décimales, sans notation exotique. */
function parseDecimal(text: string, decimales: number): number | null {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  const s = decimalString(value);
  const d = s.includes(".") ? s.length - s.indexOf(".") - 1 : 0;
  return Number.isFinite(value) && d <= decimales ? value : null;
}
const numText = (value: number | null | undefined) => (value === null || value === undefined ? "" : decimalString(value).replace(".", ","));

function AjustementForm({ unite, onCancel, onSave }: { unite: OuvrageUnite; onCancel(): void; onSave(valeur: number, raison: string): Promise<void> }) {
  const [valeur, setValeur] = useState(""); const [raison, setRaison] = useState(""); const [error, setError] = useState("");
  return <form className={`${styles.form} ${styles.noPrint}`} data-testid="qt-ajustement-form" onSubmit={(event) => {
    event.preventDefault();
    const parsed = parseDecimal(valeur, 3);
    if (parsed === null || parsed < 0) { setError("Quantité retenue positive attendue (trois décimales au plus)."); return; }
    if (raison.trim().length < 3) { setError("La raison de l'ajustement est obligatoire."); return; }
    setError("");
    void onSave(parsed, raison.trim());
  }}>
    <p className={styles.muted}>La quantité calculée n&apos;est jamais écrasée : la quantité retenue, la raison, l&apos;auteur et la date sont tracés.</p>
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Quantité retenue ({OUVRAGE_UNITE_LABELS[unite]})</span><input data-testid="qt-ajustement-valeur" inputMode="decimal" value={valeur} onChange={(event) => setValeur(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Raison (obligatoire)</span><input data-testid="qt-ajustement-raison" value={raison} maxLength={500} onChange={(event) => setRaison(event.target.value)} /></label>
      <button type="submit" className={releveStyles.primary} data-testid="qt-ajustement-valider">Enregistrer</button>
      <button type="button" className={releveStyles.secondary} onClick={onCancel}>Annuler</button>
    </div>
    {error && <small className={releveStyles.fieldError} role="alert">{error}</small>}
  </form>;
}

// ── Formulaire d'ouvrage (règle fermée, validée en direct comme au serveur) ───

type OpDraft = { op: OuvrageOperationCode; valeur: string };

function OuvrageForm({ initial, pieces, ctx, onCancel, onSave }: {
  initial: OuvrageRecord | null; pieces: ReleveStructure["pieces"]; ctx: Ctx; onCancel(): void; onSave(donnees: OuvrageDonnees): Promise<void>;
}) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [categorie, setCategorie] = useState<OuvrageCategorie>(initial?.categorie ?? "peinture");
  const [lot, setLot] = useState(initial?.lot ?? "");
  const [unite, setUnite] = useState<OuvrageUnite>(initial?.unite ?? "m2");
  const [source, setSource] = useState<OuvrageSource>(initial?.regle.source ?? "surface_murs");
  const [typesOuverture, setTypesOuverture] = useState<OuvertureType[]>([...(initial?.regle.filtre?.typesOuverture ?? [])]);
  const [categories, setCategories] = useState<EquipementCategorie[]>([...(initial?.regle.filtre?.categories ?? [])]);
  const [objets, setObjets] = useState((initial?.regle.filtre?.objets ?? []).join(", "));
  const [support, setSupport] = useState<RevetementSupport>(initial?.regle.filtre?.support ?? "sol");
  const [familles, setFamilles] = useState<string[]>([...(initial?.regle.filtre?.familles ?? [])]);
  const [valeur, setValeur] = useState(numText(initial?.regle.valeur));
  const [ops, setOps] = useState<OpDraft[]>((initial?.regle.operations ?? []).map((op) => ({ op: op.op, valeur: numText(op.valeur) })));
  const [perte, setPerte] = useState(numText(initial?.pertePourcent ?? 0));
  const [arrondi, setArrondi] = useState<ArrondiMode>(initial?.arrondi.mode ?? "aucun");
  const [pas, setPas] = useState(numText(initial?.arrondi.pas ?? 1));
  const [etatTravaux, setEtatTravaux] = useState<EtatProjet>(initial?.etatTravaux ?? (ctx.etat === "projete" ? "nouveau" : "existant"));
  const [etats, setEtats] = useState<EtatProjet[]>([...(initial?.etats ?? (ctx.etat === "projete" ? ["nouveau"] : ["existant"]))]);
  const [toutes, setToutes] = useState(!initial?.pieceIds?.length);
  const [pieceIds, setPieceIds] = useState<string[]>([...(initial?.pieceIds ?? [])]);
  const [commentaire, setCommentaire] = useState(initial?.commentaire ?? "");
  const [busy, setBusy] = useState(false);

  const build = (): { donnees: OuvrageDonnees | null; error: string | null } => {
    const operations: OuvrageOperation[] = [];
    for (const draft of ops) {
      const v = parseDecimal(draft.valeur, 6);
      if (v === null) return { donnees: null, error: `Valeur de l'opération « ${OUVRAGE_OPERATION_LABELS[draft.op]} » invalide (six décimales au plus).` };
      operations.push({ op: draft.op, valeur: v });
    }
    const pertePct = parseDecimal(perte, 2);
    if (pertePct === null) return { donnees: null, error: OUVRAGE_ISSUE_MESSAGES.perte };
    const filtre = source === "nombre_ouvertures" || source === "surface_ouvertures" ? (typesOuverture.length ? { typesOuverture } : undefined)
      : source === "nombre_equipements" ? {
        ...(categories.length ? { categories } : {}),
        ...(objets.trim() ? { objets: [...new Set(objets.split(/[,\s]+/).map((o) => o.trim()).filter(Boolean))] } : {}),
      } : source === "quantite_revetement" ? { support, ...(familles.length ? { familles } : {}) } : undefined;
    const v = source === "saisie" || source === "forfait" ? (valeur.trim() ? parseDecimal(valeur, 6) : null) : null;
    if ((source === "saisie" || (source === "forfait" && valeur.trim())) && v === null) return { donnees: null, error: OUVRAGE_ISSUE_MESSAGES.valeur };
    const pasValue = arrondi === "aucun" ? null : parseDecimal(pas, 6);
    const donnees: OuvrageDonnees = {
      nom: nom.trim(), ...(code.trim() ? { code: code.trim() } : {}), categorie, lot: lot.trim() || OUVRAGE_LOT_PAR_CATEGORIE[categorie], unite,
      regle: { source, ...(filtre && Object.keys(filtre).length ? { filtre } : {}), ...(v !== null ? { valeur: v } : {}), ...(operations.length ? { operations } : {}) },
      pertePourcent: pertePct, arrondi: arrondi === "aucun" ? { mode: "aucun" } : { mode: arrondi, pas: pasValue ?? 0 },
      ...(toutes ? {} : { pieceIds }), etatTravaux, etats, ...(commentaire.trim() ? { commentaire: commentaire.trim() } : {}),
    };
    const issue = ouvrageAnomalie(donnees);
    return issue ? { donnees: null, error: OUVRAGE_ISSUE_MESSAGES[issue] } : { donnees, error: null };
  };
  const draft = build();
  const produite = regleUnite({ source, ...(source === "quantite_revetement" ? { filtre: { support } } : {}), operations: ops.map((o) => ({ op: o.op, valeur: 1 })) }, unite);
  const aEtat = OUVRAGE_SOURCES_A_ETAT.includes(source);
  const toggle = <T,>(list: T[], item: T, on: boolean) => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item));

  return <form className={`${styles.form} ${styles.noPrint}`} data-testid="qt-ouvrage-form" onSubmit={(event) => {
    event.preventDefault();
    if (!draft.donnees) return;
    setBusy(true);
    void onSave(draft.donnees).finally(() => setBusy(false));
  }}>
    <strong>{initial ? "Modifier l'ouvrage" : "Nouvel ouvrage"}</strong>
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Nom</span><input data-testid="qt-f-nom" value={nom} maxLength={160} onChange={(event) => setNom(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Code (facultatif)</span><input data-testid="qt-f-code" value={code} maxLength={40} onChange={(event) => setCode(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Catégorie</span>
        <select data-testid="qt-f-categorie" value={categorie} onChange={(event) => setCategorie(event.target.value as OuvrageCategorie)}>
          {OUVRAGE_CATEGORIES.map((c) => <option key={c} value={c}>{OUVRAGE_CATEGORIE_LABELS[c]}</option>)}
        </select>
      </label>
      <label className={releveStyles.field}><span>Lot</span><input data-testid="qt-f-lot" value={lot} maxLength={80} placeholder={OUVRAGE_LOT_PAR_CATEGORIE[categorie]} onChange={(event) => setLot(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Source de quantité</span>
        <select data-testid="qt-f-source" value={source} onChange={(event) => setSource(event.target.value as OuvrageSource)}>
          {OUVRAGE_SOURCES.map((s) => <option key={s} value={s}>{OUVRAGE_SOURCE_LABELS[s]}</option>)}
        </select>
      </label>
      <label className={releveStyles.field}><span>Unité</span>
        <select data-testid="qt-f-unite" value={unite} onChange={(event) => setUnite(event.target.value as OuvrageUnite)}>
          {OUVRAGE_UNITES.map((u) => <option key={u} value={u}>{OUVRAGE_UNITE_LABELS[u]}</option>)}
        </select>
      </label>
      {(source === "saisie" || source === "forfait") && <label className={releveStyles.field}><span>{source === "saisie" ? `Quantité (${OUVRAGE_UNITE_LABELS[unite]})` : "Nombre de forfaits (1 par défaut)"}</span>
        <input data-testid="qt-f-valeur" inputMode="decimal" value={valeur} onChange={(event) => setValeur(event.target.value)} /></label>}
    </div>
    {(source === "nombre_ouvertures" || source === "surface_ouvertures") && <fieldset className={styles.checks}><legend>Types d&apos;ouverture (vide = toutes)</legend>
      {OUVERTURE_TYPES.map((t) => <label key={t}><input type="checkbox" data-testid={`qt-f-ouverture-${t}`} checked={typesOuverture.includes(t)} onChange={(event) => setTypesOuverture(toggle(typesOuverture, t, event.target.checked))} /> {OUVERTURE_TYPE_LABELS[t]}</label>)}
    </fieldset>}
    {source === "nombre_equipements" && <>
      <fieldset className={styles.checks}><legend>Catégories d&apos;objets (vide = toutes)</legend>
        {EQUIPEMENT_CATEGORIES.map((c) => <label key={c}><input type="checkbox" data-testid={`qt-f-categorie-objet-${c}`} checked={categories.includes(c)} onChange={(event) => setCategories(toggle(categories, c, event.target.checked))} /> {EQUIPEMENT_CATEGORIE_LABELS[c]}</label>)}
      </fieldset>
      <label className={releveStyles.field}><span>Objets par type (codes, ex. « prise, radiateur »)</span><input data-testid="qt-f-objets" value={objets} onChange={(event) => setObjets(event.target.value)} /></label>
    </>}
    {source === "quantite_revetement" && <div className={styles.grid}>
      <label className={releveStyles.field}><span>Support</span>
        <select data-testid="qt-f-support" value={support} onChange={(event) => { setSupport(event.target.value as RevetementSupport); setFamilles([]); }}>
          {REVETEMENT_SUPPORTS.map((s) => <option key={s} value={s}>{REVETEMENT_SUPPORT_LABELS[s]}</option>)}
        </select>
      </label>
      <fieldset className={styles.checks}><legend>Familles (vide = toutes)</legend>
        {REVETEMENT_FAMILLES[support].map((f) => <label key={f}><input type="checkbox" data-testid={`qt-f-famille-${f}`} checked={familles.includes(f)} onChange={(event) => setFamilles(toggle(familles, f, event.target.checked))} /> {REVETEMENT_FAMILLE_LABELS[f] ?? f}</label>)}
      </fieldset>
    </div>}

    <fieldset className={styles.form}><legend>Formule (opérations successives, aucune expression libre)</legend>
      {ops.map((draftOp, index) => <div key={index} className={styles.grid} data-testid="qt-f-operation">
        <label className={releveStyles.field}><span>Opération {index + 1}</span>
          <select data-testid="qt-f-op" value={draftOp.op} onChange={(event) => setOps(ops.map((o, i) => (i === index ? { ...o, op: event.target.value as OuvrageOperationCode } : o)))}>
            {OUVRAGE_OPERATIONS.map((op) => <option key={op} value={op}>{OUVRAGE_OPERATION_LABELS[op]}</option>)}
          </select>
        </label>
        <label className={releveStyles.field}><span>Valeur</span><input data-testid="qt-f-op-valeur" inputMode="decimal" value={draftOp.valeur} onChange={(event) => setOps(ops.map((o, i) => (i === index ? { ...o, valeur: event.target.value } : o)))} /></label>
        <button type="button" className={releveStyles.secondary} onClick={() => setOps(ops.filter((_, i) => i !== index))}>Retirer</button>
      </div>)}
      {ops.length < 8 && <button type="button" className={releveStyles.secondary} data-testid="qt-f-op-ajouter" onClick={() => setOps([...ops, { op: "coefficient", valeur: "1" }])}>+ Opération</button>}
      <p className={produite === unite ? styles.muted : styles.stale} data-testid="qt-f-unite-produite">
        Unité produite : {produite ? OUVRAGE_UNITE_LABELS[produite] : "incohérente"}{produite !== unite ? ` ≠ ${OUVRAGE_UNITE_LABELS[unite]} (aucune conversion implicite)` : ""}
      </p>
    </fieldset>

    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Perte (%)</span><input data-testid="qt-f-perte" inputMode="decimal" value={perte} onChange={(event) => setPerte(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Arrondi</span>
        <select data-testid="qt-f-arrondi" value={arrondi} onChange={(event) => setArrondi(event.target.value as ArrondiMode)}>
          {ARRONDI_MODES.map((m) => <option key={m} value={m}>{ARRONDI_MODE_LABELS[m]}</option>)}
        </select>
      </label>
      {arrondi !== "aucun" && <label className={releveStyles.field}><span>Pas d&apos;arrondi</span><input data-testid="qt-f-pas" inputMode="decimal" value={pas} onChange={(event) => setPas(event.target.value)} /></label>}
      {!aEtat && <label className={releveStyles.field}><span>État des travaux</span>
        <select data-testid="qt-f-etat-travaux" value={etatTravaux} onChange={(event) => setEtatTravaux(event.target.value as EtatProjet)}>
          {ETATS_PROJET.map((e) => <option key={e} value={e}>{ETAT_PROJET_LABELS[e]}</option>)}
        </select>
      </label>}
    </div>
    {aEtat && <fieldset className={styles.checks}><legend>États retenus (existant / dépose / neuf / déplacé)</legend>
      {ETATS_PROJET.map((e) => <label key={e}><input type="checkbox" data-testid={`qt-f-etat-${e}`} checked={etats.includes(e)} onChange={(event) => setEtats(toggle(etats, e, event.target.checked))} /> {ETAT_PROJET_LABELS[e]}</label>)}
    </fieldset>}
    <fieldset className={styles.checks}><legend>Pièces</legend>
      <label><input type="checkbox" data-testid="qt-f-toutes-pieces" checked={toutes} onChange={(event) => setToutes(event.target.checked)} /> Toutes les pièces (et éléments d&apos;étage)</label>
      {!toutes && pieces.map((p) => <label key={p.id}><input type="checkbox" data-testid="qt-f-piece" checked={pieceIds.includes(p.id)} onChange={(event) => setPieceIds(toggle(pieceIds, p.id as string, event.target.checked))} /> {p.nom}</label>)}
    </fieldset>
    <label className={releveStyles.field}><span>Commentaire</span><textarea data-testid="qt-f-commentaire" value={commentaire} maxLength={1000} onChange={(event) => setCommentaire(event.target.value)} /></label>
    {draft.donnees && <p className={styles.muted} data-testid="qt-f-formule">{formuleTexte(draft.donnees)}</p>}
    {draft.error && <small className={releveStyles.fieldError} role="alert" data-testid="qt-f-erreur">{draft.error}</small>}
    <div className={styles.inlineActions}>
      <button type="submit" className={releveStyles.primary} data-testid="qt-f-enregistrer" disabled={busy || !draft.donnees}>Enregistrer</button>
      <button type="button" className={releveStyles.secondary} onClick={onCancel}>Annuler</button>
    </div>
  </form>;
}

function Catalogue({ busy, onImport }: { busy: boolean; onImport(entries: readonly OuvrageDonnees[], message: string): Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const strip = (entry: (typeof OUVRAGE_CATALOGUE_STANDARD)[number]): OuvrageDonnees => entry;
  return <div className={`${styles.form} ${styles.noPrint}`} data-testid="qt-catalogue">
    <strong>Catalogue standard ({OUVRAGE_CATALOGUE_STANDARD.length} ouvrages, sans prix)</strong>
    <div className={styles.checks}>{OUVRAGE_CATALOGUE_STANDARD.map((entry) => <label key={entry.code}>
      <input type="checkbox" data-testid={`qt-catalogue-${entry.code}`} checked={selected.includes(entry.code)} onChange={(event) => setSelected(event.target.checked ? [...selected, entry.code] : selected.filter((c) => c !== entry.code))} />
      {entry.nom} <small className={styles.muted}>({OUVRAGE_UNITE_LABELS[entry.unite]})</small></label>)}</div>
    <div className={styles.inlineActions}>
      <button type="button" className={releveStyles.primary} data-testid="qt-catalogue-ajouter" disabled={busy || selected.length === 0}
        onClick={() => void onImport(OUVRAGE_CATALOGUE_STANDARD.filter((e) => selected.includes(e.code)).map(strip), `${selected.length} ouvrage(s) ajouté(s) depuis le catalogue.`)}>Ajouter la sélection</button>
      <button type="button" className={releveStyles.secondary} data-testid="qt-catalogue-tout" disabled={busy}
        onClick={() => void onImport(OUVRAGE_CATALOGUE_STANDARD.map(strip), `${OUVRAGE_CATALOGUE_STANDARD.length} ouvrages ajoutés depuis le catalogue.`)}>Tout ajouter</button>
    </div>
  </div>;
}

function Bibliotheque({ ctx, busy, onImport }: { ctx: Ctx; busy: boolean; onImport(entries: readonly BibliothequeOuvrage[]): Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const list = ctx.bibliotheque;
  return <div className={`${styles.form} ${styles.noPrint}`} data-testid="qt-bibliotheque">
    <strong>Bibliothèque de l&apos;entreprise</strong>
    {list === null && <p className={styles.muted}>Chargement…</p>}
    {list?.length === 0 && <p className={styles.muted}>Bibliothèque vide : ouvrez un ouvrage et « Enregistrer dans la bibliothèque ».</p>}
    {list && list.length > 0 && <ul className={styles.rows}>{list.map((entry) => <li key={entry.id} data-testid="qt-bibliotheque-entree">
      <label className={styles.checks}><input type="checkbox" data-testid="qt-bibliotheque-choix" checked={selected.includes(entry.id)}
        onChange={(event) => setSelected(event.target.checked ? [...selected, entry.id] : selected.filter((id) => id !== entry.id))} /> {entry.donnees.nom}</label>
      <small className={styles.muted}>{formuleTexte(entry.donnees)}</small>
      {ctx.canEdit && <button type="button" className={releveStyles.danger} disabled={busy} onClick={() => {
        if (!window.confirm(`Retirer « ${entry.donnees.nom} » de la bibliothèque ? (les ouvrages déjà ajoutés aux plans restent inchangés)`)) return;
        void ctx.repository.deleteBibliotheque(ctx.releveId, entry.id).then(() => ctx.loadBibliotheque()).then(() => ctx.setFeedback("Ouvrage retiré de la bibliothèque."), (error: unknown) => ctx.setFeedback(error instanceof Error ? error.message : "Action impossible."));
      }}>Retirer</button>}
    </li>)}</ul>}
    <button type="button" className={releveStyles.primary} data-testid="qt-bibliotheque-ajouter" disabled={busy || selected.length === 0}
      onClick={() => void onImport((list ?? []).filter((entry) => selected.includes(entry.id)))}>Ajouter au plan</button>
  </div>;
}
