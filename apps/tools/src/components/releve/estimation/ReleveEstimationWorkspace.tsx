"use client";

/**
 * Estimation simplifiée (Lot 10) : prix estimatifs HT sur les quantités du Lot 9.
 *
 * TOOLS = estimation simplifiée ; GESTION PRO = chiffrage complet (prix de vente, marge, remise, TVA, devis). Cette
 * vue n'émet ni devis, ni facture, ni commande : aucun numéro officiel, aucune signature, aucun workflow devis.
 *
 * Les montants sont CALCULÉS PAR LE SERVEUR (moteur déterministe, miroir exact du domaine) : quantité RETENUE du
 * quantitatif (pertes et arrondis du Lot 9 compris, jamais réappliqués) × prix structuré (matériau, main d'œuvre,
 * forfait, autre, coefficient). Un ouvrage sans prix reste exploitable en quantitatif. Toute correction garde le
 * montant automatique, le montant retenu, la raison, l'auteur et la date.
 *
 * Tablette d'abord : cartes repliables, aucune table à défilement horizontal, cibles ≥ 40 px.
 */
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  agregerEstimation, allowedActions, breadcrumbFor, buildEstimationGpPayload, centimesText, comparerEstimations, decimalString, ETAT_PROJET_LABELS, estimationDetails,
  estimationToCsv, formatHeures, formatMontant, formatPrixUnitaire, formatQuantiteOuvrage, METRE_SYNTHESE_ETAT_LABELS, METRE_SYNTHESE_ETATS, OUVRAGE_UNITE_LABELS,
  PLAN_ETAT_LABELS, PRIX_ISSUE_MESSAGES, PRIX_TYPE_LABELS, PRIX_TYPES, prixAnomalie, prixTexte, prixUnitaireComposite, QUANTITATIF_NIVEAU_LABELS, QUANTITATIF_NIVEAUX,
  scaled, syntheseCouts, toMilli, totalEstimation, ESTIMATION_ANOMALIE_LABELS,
  type BibliothequeOuvrage, type BibliothequePrix, type EstimationComparaison, type EstimationGroupe, type EstimationLigne, type EstimationSource, type MetreSyntheseEtat,
  type OuvrageRecord, type OuvrageUnite, type PlanEtat, type PrixComposante, type PrixDonnees, type PrixOuvrage, type PrixType, type QuantitatifNiveau,
  type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure,
  gpImportMessage, resumeEnvoiGp, type EstimationGpPayload, type GpEnvoi, type GpEnvoiErreur, type GpImportResultat,
} from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { estimationHref, ficheHref, metreHref, planHref, quantitatifsHref, readEstimationSelection, RELEVES_PATH, type EstimationSelection } from "@/lib/releve/navigation";
import { estimationPiecesJointes } from "@/lib/releve/plan/estimation-export";
import { SupabaseEstimationRepository } from "@/lib/releve/plan/supabase-estimation-repository";
import { GpEnvoiError, SupabaseGpHandoffRepository } from "@/lib/releve/plan/supabase-gp-handoff-repository";
import { SupabaseMetreRepository } from "@/lib/releve/plan/supabase-metre-repository";
import { SupabaseQuantitatifRepository } from "@/lib/releve/plan/supabase-quantitatif-repository";
import { SupabaseReleveMediaRepository } from "@/lib/releve/supabase-media-repository";
import { Brand } from "../../HomeDashboard";
import releveStyles from "../releve.module.css";
import { ReleveLocked } from "../ReleveLocked";
import { useReleveService } from "../use-releve-service";
import styles from "../metre/metre.module.css";
import q from "../quantitatifs/quantitatifs.module.css";

export function ReleveEstimationWorkspace() {
  const state = useReleveService();
  const [target, setTarget] = useState<EstimationSelection | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setTarget(readEstimationSelection(window.location.search));
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, []);
  const navigate = (next: EstimationSelection) => { window.history.pushState(null, "", estimationHref(next)); setTarget(readEstimationSelection(window.location.search)); };
  return <main className={`projects-page ${styles.page}`}>
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${releveStyles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${releveStyles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && target === null && <p className={`shell ${releveStyles.feedback}`} role="alert">Relevé introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && target && <EstimationLoader key={`${target.releveId}:${target.etat}`} service={state.service} actor={state.actor} selection={target}
      onEtat={(etat) => navigate({ ...target, etat })} onNiveau={(niveau) => navigate({ ...target, niveau })} />}
  </main>;
}

type Ctx = {
  releveId: ReleveId; structure: ReleveStructure; repository: SupabaseEstimationRepository; quantitatifs: SupabaseQuantitatifRepository; canEdit: boolean;
  setFeedback(message: string): void; refreshPlan(planId: string): Promise<void>;
};

function download(content: string, type: string, name: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name.replace(/\s+/g, "-");
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function EstimationLoader({ service, actor, selection, onEtat, onNiveau }: {
  service: ReleveService; actor: ReleveActorContext; selection: EstimationSelection; onEtat(etat: MetreSyntheseEtat): void; onNiveau(niveau: QuantitatifNiveau): void;
}) {
  const client = getElsatiaClient();
  const repository = useMemo(() => new SupabaseEstimationRepository(client), [client]);
  const quantitatifs = useMemo(() => new SupabaseQuantitatifRepository(client), [client]);
  const releveId = selection.releveId as ReleveId;
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [sources, setSources] = useState<EstimationSource[] | null>(null);
  const [feedback, setFeedback] = useState("");
  const [timing, setTiming] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [envoiOuvert, setEnvoiOuvert] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    Promise.all([service.get(releveId), repository.synthese(releveId, selection.etat)])
      .then(([loaded, synthese]) => { if (!cancelled) { setStructure(loaded); setSources(synthese); setTiming(Math.round(performance.now() - started)); } })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Estimation non accessible."); });
    return () => { cancelled = true; };
  }, [service, repository, releveId, selection.etat]);

  /** Après une modification : seul le plan concerné est relu (calcul serveur). */
  const refreshPlan = useCallback(async (planId: string) => {
    const { quantitatif, estimation } = await repository.planEstimation(planId);
    setSources((current) => current?.map((source) => (source.planId === planId ? { ...source, quantitatif, estimation } : source)) ?? current);
  }, [repository]);

  const canEdit = structure ? allowedActions(actor, structure.releve).includes("edit") : false;
  // Contexte stable : un changement de niveau ne re-rend pas les cartes de prix (plans mémoïsés).
  const ctx = useMemo<Ctx | null>(() => (structure ? { releveId, structure, repository, quantitatifs, canEdit, setFeedback, refreshPlan } : null),
    [releveId, structure, repository, quantitatifs, canEdit, refreshPlan]);
  const details = useMemo(() => (structure && sources ? estimationDetails(structure, sources) : null), [structure, sources]);
  const groupes = useMemo(() => (details ? agregerEstimation(details, selection.niveau) : null), [details, selection.niveau]);
  const total = useMemo(() => (details ? totalEstimation(details) : null), [details]);
  if (!structure || !sources || !details || !groupes || !total || !ctx) return <p className={`shell ${releveStyles.feedback}`} role="status">{feedback || "Calcul de l'estimation…"}</p>;

  const crumbs = breadcrumbFor(structure, null);
  const couts = syntheseCouts(total);
  const pieceNom = new Map(structure.pieces.map((p) => [p.id as string, p.nom]));
  const anomalies = sources.flatMap((source) => source.estimation.anomalies.filter((a) => a.gravite !== "info").map((a) => ({ ...a, planId: source.planId, ouvrage: source.quantitatif.ouvrages.find((o) => o.id === a.ouvrageId) })));
  const erreurs = anomalies.filter((a) => a.gravite === "erreur").length;
  const baseName = `estimation-${structure.releve.nom}-${selection.etat}`;

  /** Contrat `elsatia.tools.estimation` (Lot 10) : métré, photos et annotations chargés au moment de l'export / de l'envoi. */
  const preparerContrat = async () => {
    const [metre, medias] = await Promise.all([
      new SupabaseMetreRepository(client).synthese(releveId, selection.etat).catch(() => []),
      new SupabaseReleveMediaRepository(client).loadMediaContext(releveId).catch(() => ({ medias: [], elements: [] })),
    ]);
    const jointes = estimationPiecesJointes(medias.medias, medias.elements);
    return buildEstimationGpPayload({ releveId, etat: selection.etat, structure, sources, details, metre, ...jointes });
  };
  const canSync = allowedActions(actor, structure.releve).includes("sync-gp");

  const exporterGp = async () => {
    setExporting(true);
    try {
      const payload = await preparerContrat();
      download(JSON.stringify(payload, null, 2), "application/json", `${baseName}.gp.json`);
      setFeedback("Contrat d'estimation préparé (non transmis) : Gestion Pro décidera prix de vente, marge, remise, TVA et devis.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Export impossible."); } finally { setExporting(false); }
  };

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={releveStyles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        {crumbs.map((crumb) => <li key={`${crumb.level}:${crumb.id}`}><Link href={ficheHref(releveId)}>{crumb.label}</Link></li>)}
        <li aria-current="page">Estimation</li>
      </ol></nav>
      <p className="eyebrow">ESTIMATION SIMPLIFIÉE · {METRE_SYNTHESE_ETAT_LABELS[selection.etat].toUpperCase()}</p>
      <h1 className="projects-title">Estimation · {structure.releve.nom}</h1>
      <p className={styles.muted} data-testid="est-avertissement">
        Estimation HT indicative, calculée sur les quantités retenues (pertes comprises). Ce n&apos;est ni un devis ni une facture :
        prix de vente, marge, remise, TVA et devis sont décidés dans Gestion Pro.
      </p>
      <div className={`${releveStyles.tabs} ${styles.noPrint}`} role="tablist" aria-label="État documenté">
        {METRE_SYNTHESE_ETATS.map((etat) => <button key={etat} type="button" role="tab" className={releveStyles.tab} aria-selected={etat === selection.etat}
          data-testid={`est-etat-${etat}`} onClick={() => onEtat(etat)}>{METRE_SYNTHESE_ETAT_LABELS[etat]}</button>)}
      </div>
      <p className={releveStyles.feedback} role="status" aria-live="polite" data-testid="est-message">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.body}`} data-testid="est-vue" data-calcul-ms={timing ?? undefined}>
      <div className={`${styles.bar} ${styles.noPrint}`}>
        <label className={releveStyles.field}><span>Sous-totaux par</span>
          <select data-testid="est-niveau" value={selection.niveau} onChange={(event) => onNiveau(event.target.value as QuantitatifNiveau)}>
            {QUANTITATIF_NIVEAUX.map((niveau) => <option key={niveau} value={niveau}>{QUANTITATIF_NIVEAU_LABELS[niveau]}</option>)}
          </select>
        </label>
        <button type="button" className={releveStyles.secondary} data-testid="est-export-csv" onClick={() => download(estimationToCsv(details), "text/csv;charset=utf-8", `${baseName}.csv`)}>Exporter CSV</button>
        <button type="button" className={releveStyles.secondary} data-testid="est-export-json" disabled={exporting} title="Contrat de données vers Gestion Pro (préparé, non transmis ; aucun devis créé)"
          onClick={() => void exporterGp()}>Transfert GP (JSON)</button>
        <button type="button" className={releveStyles.primary} data-testid="est-envoyer-gp" disabled={!canSync || sources.length === 0}
          title={canSync ? "Transmettre cette estimation à Gestion Pro (chiffrage complet, prix de vente, marge, TVA, devis)"
            : "Envoi réservé au métreur ou à l'administrateur Relevé disposant de la permission Gestion Pro « gérer les ouvrages »"}
          onClick={() => setEnvoiOuvert(true)}>Envoyer vers Gestion Pro</button>
        <button type="button" className={releveStyles.secondary} data-testid="est-imprimer" onClick={() => {
          for (const node of document.querySelectorAll<HTMLDetailsElement>("details[data-print]")) node.open = true;
          window.setTimeout(() => window.print(), 50);
        }}>Imprimer / PDF</button>
        <Link className={releveStyles.secondary} href={quantitatifsHref({ releveId, etat: selection.etat })} data-testid="est-lien-quantitatifs">Quantitatifs</Link>
        <Link className={releveStyles.secondary} href={metreHref({ releveId, etat: selection.etat })}>Métré</Link>
      </div>

      <GpEnvoiPanel key={selection.etat} releveId={releveId} etat={selection.etat} releveNom={structure.releve.nom} chantierNom={structure.releve.chantier.nom}
        clientNom={structure.releve.client.nom} ouvert={envoiOuvert} onFermer={() => setEnvoiOuvert(false)} preparer={preparerContrat} canSync={canSync} />

      <dl className={styles.tiles} data-testid="est-totaux">
        <div className={styles.tile}><dt>Total projet HT</dt><dd data-testid="est-total">{formatMontant(couts.total)}</dd></div>
        <div className={styles.tile}><dt>Dépose</dt><dd data-testid="est-depose">{formatMontant(couts.depose)}</dd></div>
        <div className={styles.tile}><dt>Neuf</dt><dd data-testid="est-neuf">{formatMontant(couts.neuf)}</dd></div>
        <div className={styles.tile}><dt>Déplacement</dt><dd data-testid="est-deplacement">{formatMontant(couts.deplacement)}</dd></div>
        <div className={styles.tile}><dt>Travaux sur existant</dt><dd data-testid="est-existant">{formatMontant(couts.existant)}</dd></div>
        <div className={styles.tile}><dt>Main d&apos;œuvre</dt><dd data-testid="est-heures">{formatHeures(total.heures)}</dd></div>
        <div className={styles.tile}><dt>Lignes</dt><dd data-testid="est-compteurs">{total.lignes} · {total.sansPrix} sans prix · {total.ajustees} corrigée(s)</dd></div>
      </dl>
      <p className={q.chips} data-testid="est-par-type">
        {PRIX_TYPES.map((t) => <span key={t} className={q.chip} data-testid={`est-type-${t}`}>{PRIX_TYPE_LABELS[t]} {formatMontant(total.parType[t])}</span>)}
        {total.ecart !== BigInt(0) && <span className={q.chip} data-testid="est-ecart">Corrections {formatMontant(total.ecart)}</span>}
      </p>

      {sources.length === 0 && <section className={styles.section}><h2>Aucun plan</h2>
        <p className={styles.muted}>Aucun étage n&apos;a de plan « {METRE_SYNTHESE_ETAT_LABELS[selection.etat]} ». L&apos;estimation se calcule sur les quantitatifs des plans.</p></section>}

      {anomalies.length > 0 && <details className={styles.piece} data-testid="est-anomalies" open={erreurs > 0}>
        <summary><strong>À vérifier ({anomalies.length})</strong><span className={styles.badge} data-tone={erreurs ? "alerte" : undefined}>{erreurs} erreur(s)</span></summary>
        <ul className={`${styles.rows} ${styles.pieceBody}`}>{anomalies.map((a, i) => <li key={`${a.planId}:${i}`} data-testid="est-anomalie" data-code={a.code}>
          <span>{a.ouvrage?.nom ?? "Ouvrage"}{a.pieceId ? ` · ${pieceNom.get(a.pieceId) ?? "pièce"}` : ""}{a.etatProjet ? ` · ${ETAT_PROJET_LABELS[a.etatProjet]}` : ""}
            <small className={styles.muted}> — {a.message}</small></span>
          <span className={styles.badge} data-tone={a.gravite === "erreur" ? "alerte" : undefined}>{ESTIMATION_ANOMALIE_LABELS[a.code]}</span>
        </li>)}</ul>
      </details>}

      <section className={styles.section} aria-label="Sous-totaux" data-testid="est-synthese">
        <h2>Sous-totaux par {QUANTITATIF_NIVEAU_LABELS[selection.niveau].toLowerCase()}</h2>
        {groupes.length === 0 ? <p className={styles.muted}>Aucune ligne : ajoutez des ouvrages dans les quantitatifs.</p>
          : groupes.map((groupe, index) => <GroupeCard key={groupe.cle} groupe={groupe} open={index === 0 && groupes.length <= 20} />)}
        <p className={styles.levelTitle} data-testid="est-total-chantier"><strong>Total chantier HT (estimation)</strong><span className={styles.value}>{formatMontant(total.montant)}</span></p>
      </section>

      {sources.map((source) => <PlanPrix key={source.planId} source={source} ctx={ctx} />)}
      {canEdit && <BibliothequePrixPanel ctx={ctx} />}
      <Comparaison ctx={ctx} sources={sources} />
    </div>
  </>;
}

/**
 * Lot 11 — « Envoyer vers Gestion Pro » : résumé, confirmation explicite, envoi RÉEL (RPC d'import GP), résultat.
 * Tools ne crée aucun devis : Gestion Pro reçoit un import (source, version, snapshot) et décide du chiffrage.
 */
function GpEnvoiPanel({ releveId, etat, releveNom, chantierNom, clientNom, ouvert, onFermer, preparer, canSync }: {
  releveId: string; etat: MetreSyntheseEtat; releveNom: string; chantierNom: string; clientNom: string | null; ouvert: boolean; onFermer(): void;
  preparer(): Promise<EstimationGpPayload>; canSync: boolean;
}) {
  const client = getElsatiaClient();
  const repository = useMemo(() => new SupabaseGpHandoffRepository(client), [client]);
  const [envois, setEnvois] = useState<GpEnvoi[]>([]);
  const [payload, setPayload] = useState<EstimationGpPayload | null>(null);
  const [phase, setPhase] = useState<"idle" | "preparation" | "confirmation" | "envoi">("idle");
  const [resultat, setResultat] = useState<GpImportResultat | null>(null);
  const [erreur, setErreur] = useState<GpEnvoiErreur | null>(null);
  const [duree, setDuree] = useState<number | null>(null);

  const relire = useCallback(() => repository.envois(releveId).then(setEnvois).catch(() => undefined), [repository, releveId]);
  useEffect(() => { void relire(); }, [relire]);
  // Préparation à l'ouverture seulement (le contrat est relu au moment de l'envoi, jamais mis en cache).
  const preparerRef = useRef(preparer);
  const fermerRef = useRef(onFermer);
  useEffect(() => { preparerRef.current = preparer; fermerRef.current = onFermer; });
  useEffect(() => {
    if (!ouvert) return;
    let annule = false;
    const timer = window.setTimeout(() => {
      setPhase("preparation"); setErreur(null); setResultat(null);
      preparerRef.current().then((p) => { if (!annule) { setPayload(p); setPhase("confirmation"); } })
        .catch((error: unknown) => {
          if (annule) return;
          setErreur({ type: "contrat", message: error instanceof Error ? error.message : "Préparation impossible.", reessayable: true });
          setPhase("idle"); fermerRef.current();
        });
    }, 0);
    return () => { annule = true; window.clearTimeout(timer); };
  }, [ouvert]);

  const envoyer = async () => {
    if (!payload) return;
    setPhase("envoi"); setErreur(null);
    const debut = performance.now();
    try {
      const r = await repository.envoyer(releveId, etat, payload);
      setResultat(r); setPayload(null); setPhase("idle"); onFermer();
      void relire();
    } catch (error) {
      setErreur(error instanceof GpEnvoiError ? error.erreur : { type: "reseau", message: "Gestion Pro est injoignable pour le moment.", reessayable: true });
      setPhase("confirmation");
    } finally { setDuree(Math.round(performance.now() - debut)); }
  };
  const annuler = () => { setPayload(null); setPhase("idle"); setErreur(null); onFermer(); };
  const envoisEtat = envois.filter((e) => e.etat === etat);
  const resume = payload ? resumeEnvoiGp(payload) : null;
  if (!ouvert && !resultat && !erreur && envoisEtat.length === 0) return null;

  return <section className={`${styles.section} ${styles.noPrint}`} aria-label="Envoi vers Gestion Pro" data-testid="gp-envoi" data-duree-ms={duree ?? undefined}>
    <h2>Gestion Pro</h2>
    {phase === "preparation" && <p className={styles.muted} role="status">Préparation du contrat d&apos;estimation…</p>}
    {resume && payload && (phase === "confirmation" || phase === "envoi") && <div data-testid="gp-envoi-resume">
      <p className={styles.muted}>Vérifiez avant l&apos;envoi. Gestion Pro recevra un <strong>import</strong> (et non un devis) : prix de vente, marge, remise, TVA et devis y sont décidés.</p>
      <dl className={styles.tiles}>
        <div className={styles.tile}><dt>Source</dt><dd data-testid="gp-resume-source">Tools · Relevé &amp; Métré</dd></div>
        <div className={styles.tile}><dt>Relevé</dt><dd>{releveNom}</dd></div>
        <div className={styles.tile}><dt>Chantier</dt><dd data-testid="gp-resume-chantier">{chantierNom}</dd></div>
        <div className={styles.tile}><dt>Client</dt><dd>{clientNom ?? "—"}</dd></div>
        <div className={styles.tile}><dt>État</dt><dd>{METRE_SYNTHESE_ETAT_LABELS[etat]}</dd></div>
        <div className={styles.tile}><dt>Contrat</dt><dd data-testid="gp-resume-contrat">{resume.contrat}</dd></div>
        <div className={styles.tile}><dt>Ouvrages</dt><dd data-testid="gp-resume-ouvrages">{resume.ouvrages}</dd></div>
        <div className={styles.tile}><dt>Lignes</dt><dd data-testid="gp-resume-lignes">{resume.lignes} · {resume.lignesSansPrix} sans prix</dd></div>
        <div className={styles.tile}><dt>Montant estimatif Tools</dt><dd data-testid="gp-resume-montant">{formatMontant(scaled(Number(resume.montantHt), 2))} HT</dd></div>
        <div className={styles.tile}><dt>Pièces jointes</dt><dd>{resume.photos} photo(s) · {resume.annotations} annotation(s) · {resume.anomalies} anomalie(s)</dd></div>
      </dl>
      <div className={styles.bar}>
        <button type="button" className={releveStyles.primary} data-testid="gp-envoi-confirmer" disabled={phase === "envoi" || !canSync} onClick={() => void envoyer()}>
          {phase === "envoi" ? "Envoi en cours…" : erreur?.reessayable ? "Renvoyer" : "Confirmer l'envoi"}</button>
        <button type="button" className={releveStyles.secondary} data-testid="gp-envoi-annuler" disabled={phase === "envoi"} onClick={annuler}>Annuler</button>
      </div>
    </div>}
    {resultat && <p className={releveStyles.feedback} role="status" data-testid="gp-envoi-message" data-statut={resultat.statut} data-version={resultat.version}>{gpImportMessage(resultat)}</p>}
    {erreur && <p className={releveStyles.feedback} role="alert" data-testid="gp-envoi-erreur" data-type={erreur.type}>
      {erreur.message}{erreur.type === "obsolete" && <> <button type="button" className={releveStyles.secondary} data-testid="gp-envoi-recharger" onClick={() => window.location.reload()}>Recharger l&apos;estimation</button></>}
    </p>}
    {envoisEtat.length > 0 && <ul className={styles.rows} data-testid="gp-envois">
      {envoisEtat.map((e) => <li key={e.importId} data-testid="gp-envoi-historique" data-version={e.version}>
        <span>Version {e.version} · {new Date(e.le).toLocaleString("fr-FR")} · {e.ouvrages} ouvrage(s), {e.lignes} ligne(s) · {formatMontant(scaled(e.montant, 2))} HT estimatifs</span>
        <span className={styles.badge}>{e.priseEnCharge ? "Prise en charge dans Gestion Pro" : e.nouvelleVersion ? "Remplacée par une version plus récente" : "Reçue par Gestion Pro"}</span>
      </li>)}
    </ul>}
  </section>;
}

function GroupeCard({ groupe, open: initial }: { groupe: EstimationGroupe; open: boolean }) {
  // Détail rendu seulement à l'ouverture (5 000 lignes : seuls les sous-totaux sont dessinés).
  const [open, setOpen] = useState(initial);
  return <details className={styles.piece} data-testid="est-groupe" data-cle={groupe.cle} data-print open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary><strong>{groupe.libelle}</strong>
      <span className={styles.value} data-testid="est-groupe-total">{formatMontant(groupe.total.montant)}</span>
      <span className={styles.muted}>{groupe.chemin.slice(0, -1).join(" › ")} · {groupe.ouvrages.length} ouvrage(s){groupe.total.sansPrix ? ` · ${groupe.total.sansPrix} ligne(s) sans prix` : ""}</span>
    </summary>
    {open && <ul className={`${styles.rows} ${styles.pieceBody}`}>{groupe.ouvrages.map((o) => <li key={o.cle} data-testid="est-groupe-ouvrage" data-cle={o.cle}>
      <span>{o.nom} <small className={styles.muted}>· {formatQuantiteOuvrage(o.quantite, o.unite)}{o.prixUnitaire !== null ? ` × ${formatPrixUnitaire(o.prixUnitaire)}` : ""}{o.forfait ? ` + forfait ${formatMontant(o.forfait)}` : ""}</small></span>
      <span className={styles.value}>{o.total.chiffrees === 0 ? "sans prix" : formatMontant(o.total.montant)}</span>
    </li>)}</ul>}
  </details>;
}

// ── Prix d'un plan ────────────────────────────────────────────────────────────

const PlanPrix = memo(function PlanPrix({ source, ctx }: { source: EstimationSource; ctx: Ctx }) {
  const etage = ctx.structure.etages.find((e) => e.id === source.etageId);
  const editable = ctx.canEdit && !source.figeLe;
  const [busy, setBusy] = useState(false);
  const lignesParOuvrage = useMemo(() => {
    const map = new Map<string, EstimationLigne[]>();
    for (const ligne of source.estimation.lignes) map.set(ligne.ouvrageId, [...(map.get(ligne.ouvrageId) ?? []), ligne]);
    return map;
  }, [source.estimation.lignes]);
  const prix = useMemo(() => new Map(source.estimation.prix.map((p) => [p.ouvrageId, p])), [source.estimation.prix]);
  // Signature de contenu par ouvrage : après un recalcul, seules les cartes dont le contenu a changé sont redessinées.
  const signatures = useMemo(() => {
    const anomalies = new Map<string, unknown[]>();
    for (const a of source.estimation.anomalies) anomalies.set(a.ouvrageId, [...(anomalies.get(a.ouvrageId) ?? []), a]);
    return new Map(source.quantitatif.ouvrages.map((o) => [o.id, JSON.stringify([o, prix.get(o.id) ?? null, lignesParOuvrage.get(o.id) ?? [], anomalies.get(o.id) ?? []])]));
  }, [source.quantitatif.ouvrages, source.estimation.anomalies, prix, lignesParOuvrage]);
  const run = async (action: () => Promise<unknown>, message: string | (() => string)) => {
    setBusy(true);
    try { await action(); await ctx.refreshPlan(source.planId); ctx.setFeedback(typeof message === "string" ? message : message()); }
    catch (error) { ctx.setFeedback(error instanceof Error ? error.message : "Action impossible."); } finally { setBusy(false); }
  };
  const t = source.estimation.totaux;
  return <section className={styles.section} aria-label={`Prix · ${etage?.nom ?? "étage"}`} data-testid="est-plan" data-plan={source.planId}>
    <h2 className={styles.levelTitle}>
      <span>Prix · {etage?.nom ?? "Étage"}</span>
      <span className={styles.badge} data-tone={source.figeLe ? "fige" : undefined} data-testid="est-plan-badge">
        Plan {source.numero} · {PLAN_ETAT_LABELS[source.etat]}{source.libelle ? ` · ${source.libelle}` : ""}{source.figeLe ? " · estimation figée" : " · calculée"}
      </span>
      <span className={styles.value} data-testid="est-plan-total">{formatMontant(scaled(t.montant, 2))}</span>
      <Link className={styles.noPrint} href={planHref({ releveId: ctx.releveId, etageId: source.etageId, planId: source.planId })}>Voir le plan</Link>
    </h2>
    {source.figeLe && <p className={styles.muted}>Plan figé : prix, montants et corrections sont figés avec lui. Dérivez un plan pour recalculer (les prix y sont copiés).</p>}
    {source.quantitatif.ouvrages.length === 0 && <p className={styles.muted}>Aucun ouvrage sur ce plan : ajoutez-les dans les quantitatifs.</p>}
    {editable && source.quantitatif.ouvrages.length > 0 && <div className={`${styles.inlineActions} ${styles.noPrint}`}>
      <button type="button" className={releveStyles.secondary} data-testid="est-appliquer-bibliotheque" disabled={busy}
        onClick={() => { let n = 0; void run(async () => { n = await ctx.repository.appliquerBibliotheque(source.planId, false); }, () => `${n} prix repris de la bibliothèque (ouvrages sans prix seulement).`); }}>
        Appliquer les prix de la bibliothèque</button>
    </div>}
    <div className={q.list}>
      {source.quantitatif.ouvrages.map((ouvrage) => <OuvragePrixCard key={ouvrage.id} ouvrage={ouvrage} prix={prix.get(ouvrage.id) ?? null} lignes={lignesParOuvrage.get(ouvrage.id) ?? []}
        source={source} ctx={ctx} editable={editable} run={run} signature={signatures.get(ouvrage.id) ?? ""} />)}
    </div>
  </section>;
});

type OuvragePrixProps = {
  ouvrage: OuvrageRecord; prix: PrixOuvrage | null; lignes: EstimationLigne[]; source: EstimationSource; ctx: Ctx; editable: boolean;
  run(action: () => Promise<unknown>, message: string): Promise<void>; signature: string;
};
const OuvragePrixCard = memo(function OuvragePrixCard({ ouvrage, prix, lignes, source, ctx, editable, run }: OuvragePrixProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  let qte = BigInt(0); let montant = BigInt(0);
  for (const l of lignes) {
    if (l.nature === "quantite" && l.quantite !== null) qte += toMilli(l.quantite);
    if (l.montantRetenu !== null) montant += scaled(l.montantRetenu, 2);
  }
  const pu = prix ? prixUnitaireComposite(prix.donnees) : null;
  const anomalies = source.estimation.anomalies.filter((a) => a.ouvrageId === ouvrage.id && a.gravite !== "info");
  return <details className={styles.piece} data-testid="est-ouvrage" data-ouvrage={ouvrage.id} data-code={ouvrage.code ?? undefined} data-print open={open}
    onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary>
      <strong data-testid="est-ouvrage-nom">{ouvrage.nom}</strong>
      <span className={styles.muted} data-testid="est-ouvrage-quantite">{formatQuantiteOuvrage(qte, ouvrage.unite)}{pu !== null ? ` × ${formatPrixUnitaire(Number(pu) / 10000)}` : ""}</span>
      <span className={styles.value} data-testid="est-ouvrage-total">{prix ? formatMontant(montant) : "sans prix"}</span>
      {!prix && <span className={styles.badge} data-testid="est-sans-prix">quantitatif seul</span>}
      {prix && prix.origine !== "saisie" && <span className={styles.badge}>{prix.origine === "bibliotheque" ? "bibliothèque" : "copié"}</span>}
      {anomalies.length > 0 && <span className={styles.badge} data-tone="alerte">{anomalies.length} à vérifier</span>}
    </summary>
    {open && <div className={styles.pieceBody}>
      <p className={styles.muted} data-testid="est-prix-texte">{prix ? prixTexte(prix.donnees, ouvrage.unite) : "Aucun prix : l'ouvrage reste exploitable en quantitatif, hors total estimé."}
        {prix?.donnees.commentaire ? ` · ${prix.donnees.commentaire}` : ""}</p>
      <ul className={styles.rows} data-testid="est-lignes">{lignes.map((ligne) => <LigneRow key={`${ligne.pieceId}:${ligne.etatProjet}:${ligne.nature}`} ligne={ligne} source={source} ouvrage={ouvrage} ctx={ctx} editable={editable} run={run} />)}</ul>
      {lignes.length === 0 && <p className={styles.muted}>Aucune ligne : le quantitatif de cet ouvrage est vide.</p>}
      {anomalies.map((a, i) => <p key={i} className={a.gravite === "erreur" ? styles.stale : styles.muted}>{ESTIMATION_ANOMALIE_LABELS[a.code]} — {a.message}</p>)}
      {editable && !editing && <div className={`${styles.inlineActions} ${styles.noPrint}`}>
        <button type="button" className={releveStyles.primary} data-testid="est-prix-modifier" onClick={() => setEditing(true)}>{prix ? "Modifier le prix" : "Saisir un prix"}</button>
        {prix && <button type="button" className={releveStyles.danger} data-testid="est-prix-retirer" disabled={busy} onClick={() => {
          if (!window.confirm(`Retirer le prix de « ${ouvrage.nom} » ? L'ouvrage reste dans le quantitatif.`)) return;
          setBusy(true);
          void run(() => ctx.repository.deletePrix(source.planId, ouvrage.id), "Prix retiré : ouvrage exploitable en quantitatif seul.").finally(() => setBusy(false));
        }}>Retirer le prix</button>}
      </div>}
      {editable && editing && <PrixForm initial={prix?.donnees ?? null} unite={ouvrage.unite} onCancel={() => setEditing(false)}
        onSave={(donnees) => run(() => ctx.repository.savePrix(source.planId, ouvrage.id, donnees), `Prix de « ${ouvrage.nom} » enregistré : montants recalculés par le serveur.`).then(() => setEditing(false))} />}
    </div>}
  </details>;
}, (a, b) => a.signature === b.signature && a.editable === b.editable && a.ctx === b.ctx && a.source.planId === b.source.planId && a.source.figeLe === b.source.figeLe);

function LigneRow({ ligne, ouvrage, source, ctx, editable, run }: {
  ligne: EstimationLigne; ouvrage: OuvrageRecord; source: EstimationSource; ctx: Ctx; editable: boolean; run(action: () => Promise<unknown>, message: string): Promise<void>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const piece = ligne.nature === "forfait" ? "Forfait de l'ouvrage" : ligne.pieceId ? ctx.structure.pieces.find((p) => p.id === ligne.pieceId)?.nom ?? "Pièce" : "Étage";
  const money = (v: number | null) => (v === null ? null : scaled(v, 2));
  return <li data-testid="est-ligne" data-piece={ligne.pieceId ?? "etage"} data-etat={ligne.etatProjet} data-nature={ligne.nature}>
    <span>{piece} · {ETAT_PROJET_LABELS[ligne.etatProjet]}
      <small className={styles.muted}>{ligne.nature === "quantite" ? ` · ${formatQuantiteOuvrage(ligne.quantite === null ? null : toMilli(ligne.quantite), ligne.unite)}${ligne.prixUnitaire !== null ? ` × ${formatPrixUnitaire(ligne.prixUnitaire)}` : ""}` : ""}
        {ligne.heures !== null ? ` · ${formatHeures(toMilli(ligne.heures))}` : ""}</small></span>
    <span className={styles.value} data-testid="est-ligne-montant">{ligne.prixDefini || ligne.ajustement ? formatMontant(money(ligne.montantRetenu)) : "sans prix"}
      {ligne.ajustement && <small className={ligne.ajustement.perime ? styles.stale : styles.muted}> · automatique {formatMontant(money(ligne.montantCalcule))}{ligne.ajustement.perime ? " (a changé depuis la correction)" : ""}</small>}
    </span>
    {editable && <span className={`${styles.inlineActions} ${styles.noPrint}`}>
      {(ligne.prixDefini || ligne.quantite !== null) && <button type="button" className={releveStyles.secondary} data-testid="est-corriger" onClick={() => setCorrecting(true)}>Corriger</button>}
      {ligne.ajustement && <button type="button" className={releveStyles.secondary} data-testid="est-retirer-correction"
        onClick={() => void run(() => ctx.repository.retirerCorrection(ligne.ajustement!.id, null), "Correction retirée : retour au montant automatique.")}>Montant automatique</button>}
    </span>}
    {ligne.ajustement && <small className={styles.muted} data-testid="est-correction">Retenu {formatMontant(money(ligne.ajustement.valeurRetenue))} au lieu de {formatMontant(money(ligne.ajustement.valeurCalculee))} — « {ligne.ajustement.raison} »{ligne.ajustement.date ? ` · ${new Date(ligne.ajustement.date).toLocaleString("fr-FR")}` : ""}</small>}
    {correcting && <CorrectionForm automatique={ligne.montantCalcule} onCancel={() => setCorrecting(false)} onSave={(valeur, raison) =>
      run(() => ctx.repository.corriger(source.planId, { ouvrageId: ouvrage.id, pieceId: ligne.pieceId, etatProjet: ligne.etatProjet, nature: ligne.nature }, valeur, raison),
        `${ouvrage.nom} corrigé : le montant automatique reste affiché à côté.`).then(() => setCorrecting(false))} />}
  </li>;
}

/** « 12,5 » → 12.5 ; au plus `decimales` décimales. */
function parseDecimal(text: string, decimales: number): number | null {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  const s = decimalString(value);
  const d = s.includes(".") ? s.length - s.indexOf(".") - 1 : 0;
  return Number.isFinite(value) && d <= decimales ? value : null;
}
const numText = (value: number | null | undefined) => (value === null || value === undefined ? "" : decimalString(value).replace(".", ","));

function CorrectionForm({ automatique, onCancel, onSave }: { automatique: number | null; onCancel(): void; onSave(valeur: number, raison: string): Promise<void> }) {
  const [valeur, setValeur] = useState(""); const [raison, setRaison] = useState(""); const [error, setError] = useState("");
  return <form className={`${styles.form} ${styles.noPrint}`} data-testid="est-correction-form" onSubmit={(event) => {
    event.preventDefault();
    const parsed = parseDecimal(valeur, 2);
    if (parsed === null || parsed < 0) { setError("Montant retenu positif attendu (deux décimales au plus)."); return; }
    if (raison.trim().length < 3) { setError("La raison de la correction est obligatoire."); return; }
    setError("");
    void onSave(parsed, raison.trim());
  }}>
    <p className={styles.muted}>Montant automatique : {automatique === null ? "non calculable" : formatMontant(scaled(automatique, 2))}. Il n&apos;est jamais écrasé : le montant retenu, la raison, l&apos;auteur et la date sont tracés.</p>
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Montant retenu HT (€)</span><input data-testid="est-correction-valeur" inputMode="decimal" value={valeur} onChange={(event) => setValeur(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Raison (obligatoire)</span><input data-testid="est-correction-raison" value={raison} maxLength={500} onChange={(event) => setRaison(event.target.value)} /></label>
      <button type="submit" className={releveStyles.primary} data-testid="est-correction-valider">Enregistrer</button>
      <button type="button" className={releveStyles.secondary} onClick={onCancel}>Annuler</button>
    </div>
    {error && <small className={releveStyles.fieldError} role="alert">{error}</small>}
  </form>;
}

// ── Formulaire de prix (composantes structurées) ──────────────────────────────

type CompDraft = { type: PrixType; libelle: string; a: string; b: string };
const draftOf = (c: PrixComposante): CompDraft => ({
  type: c.type, libelle: c.libelle ?? "",
  a: numText(c.type === "main_d_oeuvre" ? c.heuresParUnite : c.type === "forfait" ? c.montant : c.prixUnitaire),
  b: c.type === "main_d_oeuvre" ? numText(c.tauxHoraire) : "",
});

function PrixForm({ initial, unite, onCancel, onSave }: { initial: PrixDonnees | null; unite: OuvrageUnite; onCancel(): void; onSave(donnees: PrixDonnees): Promise<void> }) {
  const u = OUVRAGE_UNITE_LABELS[unite];
  const [comps, setComps] = useState<CompDraft[]>(initial ? initial.composantes.map(draftOf) : [{ type: "materiau", libelle: "", a: "", b: "" }]);
  const [coef, setCoef] = useState(numText(initial?.coefficient ?? 1));
  const [commentaire, setCommentaire] = useState(initial?.commentaire ?? "");
  const [busy, setBusy] = useState(false);

  const build = (): { donnees: PrixDonnees | null; error: string | null } => {
    const composantes: PrixComposante[] = [];
    for (const c of comps) {
      const libelle = c.libelle.trim() ? { libelle: c.libelle.trim() } : {};
      if (c.type === "main_d_oeuvre") {
        const h = parseDecimal(c.a, 4); const t = parseDecimal(c.b, 2);
        if (h === null) return { donnees: null, error: PRIX_ISSUE_MESSAGES.heures };
        if (t === null) return { donnees: null, error: PRIX_ISSUE_MESSAGES.taux };
        composantes.push({ type: "main_d_oeuvre", ...libelle, heuresParUnite: h, tauxHoraire: t });
      } else if (c.type === "forfait") {
        const m = parseDecimal(c.a, 2);
        if (m === null) return { donnees: null, error: PRIX_ISSUE_MESSAGES.forfait };
        composantes.push({ type: "forfait", ...libelle, montant: m });
      } else {
        const p = parseDecimal(c.a, 4);
        if (p === null) return { donnees: null, error: PRIX_ISSUE_MESSAGES.prix_unitaire };
        composantes.push({ type: c.type, ...libelle, prixUnitaire: p });
      }
    }
    const k = parseDecimal(coef, 4);
    if (k === null) return { donnees: null, error: PRIX_ISSUE_MESSAGES.coefficient };
    const donnees: PrixDonnees = { composantes, ...(k !== 1 ? { coefficient: k } : {}), ...(commentaire.trim() ? { commentaire: commentaire.trim() } : {}) };
    const issue = prixAnomalie(donnees);
    return issue ? { donnees: null, error: PRIX_ISSUE_MESSAGES[issue] } : { donnees, error: null };
  };
  const draft = build();
  const pu = draft.donnees ? prixUnitaireComposite(draft.donnees) : null;
  const set = (index: number, patch: Partial<CompDraft>) => setComps(comps.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return <form className={`${styles.form} ${styles.noPrint}`} data-testid="est-prix-form" onSubmit={(event) => {
    event.preventDefault();
    if (!draft.donnees) return;
    setBusy(true);
    void onSave(draft.donnees).finally(() => setBusy(false));
  }}>
    <strong>Prix estimatif HT (par {u})</strong>
    <p className={styles.muted}>Composantes structurées ; la perte est déjà dans la quantité (Lot 9), elle n&apos;est jamais réappliquée. Ni TVA, ni marge, ni remise : Gestion Pro.</p>
    {comps.map((c, index) => <div key={index} className={styles.grid} data-testid="est-f-composante">
      <label className={releveStyles.field}><span>Type</span>
        <select data-testid="est-f-type" value={c.type} onChange={(event) => set(index, { type: event.target.value as PrixType, a: "", b: "" })}>
          {PRIX_TYPES.map((t) => <option key={t} value={t}>{PRIX_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      <label className={releveStyles.field}><span>{c.type === "main_d_oeuvre" ? `Heures par ${u}` : c.type === "forfait" ? "Montant forfaitaire (€ HT)" : `Prix unitaire (€ HT / ${u})`}</span>
        <input data-testid="est-f-a" inputMode="decimal" value={c.a} onChange={(event) => set(index, { a: event.target.value })} /></label>
      {c.type === "main_d_oeuvre" && <label className={releveStyles.field}><span>Taux horaire (€ HT / h)</span>
        <input data-testid="est-f-b" inputMode="decimal" value={c.b} onChange={(event) => set(index, { b: event.target.value })} /></label>}
      <label className={releveStyles.field}><span>Libellé (facultatif)</span><input data-testid="est-f-libelle" value={c.libelle} maxLength={120} onChange={(event) => set(index, { libelle: event.target.value })} /></label>
      {comps.length > 1 && <button type="button" className={releveStyles.secondary} onClick={() => setComps(comps.filter((_, i) => i !== index))}>Retirer</button>}
    </div>)}
    {comps.length < 12 && <div className={styles.inlineActions}>
      <button type="button" className={releveStyles.secondary} data-testid="est-f-ajouter" onClick={() => setComps([...comps, { type: "main_d_oeuvre", libelle: "", a: "", b: "" }])}>+ Composante</button>
    </div>}
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Coefficient (1 = aucun)</span><input data-testid="est-f-coefficient" inputMode="decimal" value={coef} onChange={(event) => setCoef(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Commentaire</span><input data-testid="est-f-commentaire" value={commentaire} maxLength={500} onChange={(event) => setCommentaire(event.target.value)} /></label>
    </div>
    <p className={draft.error ? styles.stale : styles.muted} data-testid="est-f-apercu">
      {draft.error ?? `PU estimatif : ${pu === null ? "forfait seul" : formatPrixUnitaire(Number(pu) / 10000)} / ${u} HT`}</p>
    <div className={styles.inlineActions}>
      <button type="submit" className={releveStyles.primary} data-testid="est-f-enregistrer" disabled={busy || !draft.donnees}>Enregistrer</button>
      <button type="button" className={releveStyles.secondary} onClick={onCancel}>Annuler</button>
    </div>
  </form>;
}

// ── Bibliothèque : prix facultatifs ───────────────────────────────────────────

function BibliothequePrixPanel({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<BibliothequeOuvrage[] | null>(null);
  const [prix, setPrix] = useState<Map<string, BibliothequePrix>>(new Map());
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [list, px] = await Promise.all([ctx.quantitatifs.bibliotheque(ctx.releveId), ctx.repository.bibliothequePrix(ctx.releveId)]);
    setEntries(list); setPrix(new Map(px.map((p) => [p.bibliothequeId, p])));
  }, [ctx]);
  const act = (action: () => Promise<unknown>, message: string) => action().then(load).then(() => ctx.setFeedback(message), (error: unknown) => ctx.setFeedback(error instanceof Error ? error.message : "Action impossible."));
  return <details className={`${styles.piece} ${styles.noPrint}`} data-testid="est-bibliotheque" onToggle={(event) => {
    const isOpen = (event.currentTarget as HTMLDetailsElement).open; setOpen(isOpen);
    if (isOpen && entries === null) void load().catch((error: unknown) => ctx.setFeedback(error instanceof Error ? error.message : "Bibliothèque non accessible."));
  }}>
    <summary><strong>Bibliothèque : prix facultatifs</strong><span className={styles.muted}>repris à l&apos;ajout d&apos;un ouvrage depuis la bibliothèque, ou par code</span></summary>
    {open && <div className={styles.pieceBody}>
      {entries === null && <p className={styles.muted}>Chargement…</p>}
      {entries?.length === 0 && <p className={styles.muted}>Bibliothèque vide : enregistrez des ouvrages depuis les quantitatifs.</p>}
      {entries && entries.length > 0 && <ul className={styles.rows}>{entries.map((entry) => {
        const p = prix.get(entry.id);
        return <li key={entry.id} data-testid="est-bibliotheque-entree" data-code={entry.donnees.code ?? undefined}>
          <span>{entry.donnees.nom}{entry.donnees.code ? ` (${entry.donnees.code})` : ""}
            <small className={styles.muted} data-testid="est-bibliotheque-prix"> · {p ? prixTexte(p.donnees, entry.donnees.unite) : "sans prix"}</small></span>
          <span className={styles.inlineActions}>
            <button type="button" className={releveStyles.secondary} data-testid="est-bibliotheque-modifier" onClick={() => setEditing(editing === entry.id ? null : entry.id)}>{p ? "Modifier le prix" : "Ajouter un prix"}</button>
            {p && <button type="button" className={releveStyles.danger} onClick={() => void act(() => ctx.repository.deleteBibliothequePrix(ctx.releveId, entry.id), "Prix de bibliothèque retiré.")}>Retirer</button>}
          </span>
          {editing === entry.id && <PrixForm initial={p?.donnees ?? null} unite={entry.donnees.unite} onCancel={() => setEditing(null)}
            onSave={(donnees) => act(() => ctx.repository.saveBibliothequePrix(ctx.releveId, entry.id, donnees), `Prix de « ${entry.donnees.nom} » enregistré dans la bibliothèque.`).then(() => setEditing(null))} />}
        </li>;
      })}</ul>}
    </div>}
  </details>;
}

// ── Multi-scénario (préparation) : solution A / solution B ────────────────────

type PlanOption = { planId: string; numero: number; etat: PlanEtat; libelle: string | null; figeLe: string | null };

function Comparaison({ ctx, sources }: { ctx: Ctx; sources: EstimationSource[] }) {
  const etages = ctx.structure.etages.filter((e) => !e.deletedAt);
  const [etageId, setEtageId] = useState<string>(sources[0]?.etageId ?? etages[0]?.id ?? "");
  const [plans, setPlans] = useState<PlanOption[] | null>(null);
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [result, setResult] = useState<EstimationComparaison | null>(null);
  const [open, setOpen] = useState(false);
  const charger = useCallback(async (id: string) => {
    setResult(null);
    const list = await ctx.repository.plansEtage(id);
    setPlans(list); setA(list.at(-2)?.planId ?? ""); setB(list.at(-1)?.planId ?? "");
  }, [ctx]);
  const comparer = async () => {
    const lire = async (planId: string) => {
      const plan = plans?.find((p) => p.planId === planId);
      const { quantitatif, estimation } = await ctx.repository.planEstimation(planId);
      return estimationDetails(ctx.structure, [{ etageId, planId, numero: plan?.numero ?? 0, etat: plan?.etat ?? "initial", figeLe: plan?.figeLe ?? null, libelle: plan?.libelle ?? null, quantitatif, estimation }]);
    };
    const [da, db] = await Promise.all([lire(a), lire(b)]);
    setResult(comparerEstimations(da, db));
  };
  const label = (p: PlanOption) => `Plan ${p.numero} · ${PLAN_ETAT_LABELS[p.etat]}${p.libelle ? ` · ${p.libelle}` : ""}${p.figeLe ? " (figé)" : ""}`;
  const row = (r: { cle: string; libelle: string; a: bigint; b: bigint; ecart: bigint }, testId: string) => <li key={r.cle} data-testid={testId} data-cle={r.cle}>
    <span>{r.libelle}<small className={styles.muted}> · A {formatMontant(r.a)} · B {formatMontant(r.b)}</small></span>
    <span className={styles.value} data-testid={`${testId}-ecart`}>{r.ecart > BigInt(0) ? "+" : ""}{formatMontant(r.ecart)}</span>
  </li>;
  return <details className={`${styles.piece} ${styles.noPrint}`} data-testid="est-comparaison" onToggle={(event) => {
    const isOpen = (event.currentTarget as HTMLDetailsElement).open; setOpen(isOpen);
    if (isOpen && plans === null && etageId) void charger(etageId).catch((error: unknown) => ctx.setFeedback(error instanceof Error ? error.message : "Plans non accessibles."));
  }}>
    <summary><strong>Comparer deux solutions</strong><span className={styles.muted}>deux plans d&apos;un même étage (ex. projeté A figé, projeté B dérivé)</span></summary>
    {open && <div className={styles.pieceBody}>
      <div className={styles.grid}>
        <label className={releveStyles.field}><span>Étage</span>
          <select data-testid="est-cmp-etage" value={etageId} onChange={(event) => { setEtageId(event.target.value); void charger(event.target.value); }}>
            {etages.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </label>
        <label className={releveStyles.field}><span>Solution A</span>
          <select data-testid="est-cmp-a" value={a} onChange={(event) => setA(event.target.value)}>{(plans ?? []).map((p) => <option key={p.planId} value={p.planId}>{label(p)}</option>)}</select>
        </label>
        <label className={releveStyles.field}><span>Solution B</span>
          <select data-testid="est-cmp-b" value={b} onChange={(event) => setB(event.target.value)}>{(plans ?? []).map((p) => <option key={p.planId} value={p.planId}>{label(p)}</option>)}</select>
        </label>
        <button type="button" className={releveStyles.primary} data-testid="est-cmp-lancer" disabled={!a || !b || a === b}
          onClick={() => void comparer().catch((error: unknown) => ctx.setFeedback(error instanceof Error ? error.message : "Comparaison impossible."))}>Comparer</button>
      </div>
      {result && <>
        <p className={styles.levelTitle} data-testid="est-cmp-total"><strong>Total HT</strong>
          <span className={styles.value}>A {formatMontant(result.total.a)} · B {formatMontant(result.total.b)} · écart {result.total.ecart > BigInt(0) ? "+" : ""}{formatMontant(result.total.ecart)}</span></p>
        <h3>Par lot</h3><ul className={styles.rows}>{result.parLot.map((r) => row(r, "est-cmp-lot"))}</ul>
        <h3>Par état projeté</h3><ul className={styles.rows}>{result.parEtat.filter((r) => r.a !== BigInt(0) || r.b !== BigInt(0)).map((r) => row(r, "est-cmp-etat"))}</ul>
        <p className={styles.muted}>Heures estimées : A {formatHeures(result.heures.a)} · B {formatHeures(result.heures.b)} · montants en centimes exacts ({centimesText(result.total.ecart)} €).</p>
      </>}
    </div>}
  </details>;
}
