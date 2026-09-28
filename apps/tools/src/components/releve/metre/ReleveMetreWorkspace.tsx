"use client";

/**
 * Métré (Lot 8) : synthèse chantier → bâtiment → étage → zone → pièce du métré CALCULÉ PAR LE
 * SERVEUR à partir des plans (jamais une surface envoyée par le client), revêtements par pièce,
 * ajustements audités (valeur calculée / valeur retenue / raison / auteur / date), option « petites
 * ouvertures » par plan, travaux du projeté, exports (CSV, contrat Gestion Pro, impression PDF).
 *
 * Tablette d'abord : une carte repliable par pièce (le détail n'est rendu qu'à l'ouverture — 500
 * pièces restent fluides), aucune table à défilement horizontal.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, breadcrumbFor, buildMetreGpPayload, buildMetreTree, ETAT_PROJET_LABELS, ETATS_PROJET, formatLineaire, formatLongueur, formatSurface, formatVolume,
  grandeurKind, METRE_GRANDEUR_LABELS, METRE_SYNTHESE_ETAT_LABELS, METRE_SYNTHESE_ETATS, metreToCsv, newUuid, parseLineaireMl, parseLongueur, parsePourcent,
  parseSurfaceM2, parseVolumeM3, PLAN_ETAT_LABELS, piecesSansMetre, REVETEMENT_APPLICATION_LABELS, REVETEMENT_FAMILLE_LABELS, REVETEMENT_FAMILLES,
  REVETEMENT_SUPPORT_LABELS, REVETEMENT_SUPPORTS, revetementAnomalie, REVETEMENT_ISSUE_MESSAGES, revetementTotaux,
  type EtatProjet, type LongueurUnite, type MetreEtageSource, type MetreGrandeur, type MetreNode, type MetrePiece, type MetreRevetement, type MetreSyntheseEtat,
  type PieceGrandeur, type PlanRevetement, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure, type RevetementApplication,
  type RevetementSupport,
} from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { ficheHref, metreHref, pieceHref, planHref, quantitatifsHref, readMetreSelection, RELEVES_PATH, type MetreSelection } from "@/lib/releve/navigation";
import { SupabaseMetreRepository } from "@/lib/releve/plan/supabase-metre-repository";
import { OUVERTURE_TYPE_LABELS } from "../plan/PlanLayers";
import { Brand } from "../../HomeDashboard";
import releveStyles from "../releve.module.css";
import { ReleveLocked } from "../ReleveLocked";
import { useReleveService } from "../use-releve-service";
import styles from "./metre.module.css";

export function ReleveMetreWorkspace() {
  const state = useReleveService();
  const [target, setTarget] = useState<MetreSelection | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setTarget(readMetreSelection(window.location.search));
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, []);
  return <main className={`projects-page ${styles.page}`}>
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${releveStyles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${releveStyles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && target === null && <p className={`shell ${releveStyles.feedback}`} role="alert">Relevé introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && target && <MetreLoader key={`${target.releveId}:${target.etat}`} service={state.service} actor={state.actor} selection={target}
      onEtat={(etat) => { window.history.pushState(null, "", metreHref({ releveId: target.releveId, etat })); setTarget(readMetreSelection(window.location.search)); }} />}
  </main>;
}

function MetreLoader({ service, actor, selection, onEtat }: { service: ReleveService; actor: ReleveActorContext; selection: MetreSelection; onEtat(etat: MetreSyntheseEtat): void }) {
  const client = getElsatiaClient();
  const repository = useMemo(() => new SupabaseMetreRepository(client), [client]);
  const releveId = selection.releveId as ReleveId;
  const [structure, setStructure] = useState<ReleveStructure | null>(null);
  const [sources, setSources] = useState<MetreEtageSource[] | null>(null);
  const [feedback, setFeedback] = useState("");
  const [unite, setUnite] = useState<LongueurUnite>("m");
  const [timing, setTiming] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    Promise.all([service.get(releveId), repository.synthese(releveId, selection.etat)])
      .then(([loaded, synthese]) => { if (!cancelled) { setStructure(loaded); setSources(synthese); setTiming(Math.round(performance.now() - started)); } })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Métré non accessible."); });
    return () => { cancelled = true; };
  }, [service, repository, releveId, selection.etat]);

  /** Après une modification : seul le plan concerné est relu (calcul serveur). */
  const refreshPlan = useCallback(async (planId: string) => {
    const metre = await repository.planMetre(planId);
    setSources((current) => current?.map((source) => (source.planId === planId ? { ...source, metre } : source)) ?? current);
  }, [repository]);

  const tree = useMemo(() => (structure && sources ? buildMetreTree(structure, sources, { id: structure.releve.id, nom: structure.releve.nom }) : null), [structure, sources]);
  if (!structure || !sources || !tree) return <p className={`shell ${releveStyles.feedback}`} role="status">{feedback || "Calcul du métré…"}</p>;

  const canEdit = allowedActions(actor, structure.releve).includes("edit");
  const crumbs = breadcrumbFor(structure, null);
  const sansMetre = piecesSansMetre(structure, sources);
  const totals = revetementTotaux(tree.revetements);
  const travaux = aggregateTravaux(sources);

  function download(content: string, type: string, name: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name.replace(/\s+/g, "-");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const baseName = `metre-${structure.releve.nom}-${selection.etat}`;

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={releveStyles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        {crumbs.map((crumb) => <li key={`${crumb.level}:${crumb.id}`}><Link href={ficheHref(releveId)}>{crumb.label}</Link></li>)}
        <li aria-current="page">Métré</li>
      </ol></nav>
      <p className="eyebrow">MÉTRÉ · {METRE_SYNTHESE_ETAT_LABELS[selection.etat].toUpperCase()}</p>
      <h1 className="projects-title">Métré · {structure.releve.nom}</h1>
      <div className={`${releveStyles.tabs} ${styles.noPrint}`} role="tablist" aria-label="État documenté">
        {METRE_SYNTHESE_ETATS.map((etat) => <button key={etat} type="button" role="tab" className={releveStyles.tab} aria-selected={etat === selection.etat}
          data-testid={`metre-etat-${etat}`} onClick={() => onEtat(etat)}>{METRE_SYNTHESE_ETAT_LABELS[etat]}</button>)}
      </div>
      <p className={releveStyles.feedback} role="status" aria-live="polite" data-testid="metre-message">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.body}`} data-testid="metre-vue" data-calcul-ms={timing ?? undefined}>
      <div className={`${styles.bar} ${styles.noPrint}`}>
        <label className={releveStyles.field}><span>Longueurs en</span>
          <select data-testid="metre-unite" value={unite} onChange={(event) => setUnite(event.target.value as LongueurUnite)}>
            <option value="m">mètres (m)</option><option value="cm">centimètres (cm)</option><option value="mm">millimètres (mm)</option>
          </select>
        </label>
        <button type="button" className={releveStyles.secondary} data-testid="metre-export-csv" onClick={() => download(metreToCsv(tree), "text/csv;charset=utf-8", `${baseName}.csv`)}>Exporter CSV</button>
        <button type="button" className={releveStyles.secondary} data-testid="metre-export-gp" onClick={() => download(JSON.stringify(buildMetreGpPayload(tree, sources, selection.etat), null, 2), "application/json", `${baseName}.gp.json`)}
          title="Contrat de données vers Gestion Pro (préparé, non transmis ; aucun devis généré)">Transfert GP (JSON)</button>
        <button type="button" className={releveStyles.secondary} data-testid="metre-imprimer" onClick={() => {
          for (const node of document.querySelectorAll<HTMLDetailsElement>("details[data-piece]")) node.open = true;
          window.setTimeout(() => window.print(), 50);
        }}>Imprimer / PDF</button>
        <Link className={releveStyles.secondary} href={quantitatifsHref({ releveId, etat: selection.etat })} data-testid="metre-lien-quantitatifs">Quantitatifs (ouvrages)</Link>
      </div>

      {sources.length === 0 && <section className={styles.section}><h2>Aucun plan</h2>
        <p className={styles.muted}>Aucun étage n&apos;a de plan « {METRE_SYNTHESE_ETAT_LABELS[selection.etat]} ». Le métré se calcule à partir des pièces associées aux contours du plan.</p></section>}

      <dl className={styles.tiles} data-testid="metre-totaux">
        <Tile label="Sol" value={formatSurface(tree.totaux.surfaceSolMm2)} testId="metre-total-sol" />
        <Tile label="Murs nets" value={formatSurface(tree.totaux.surfaceMursMm2)} testId="metre-total-murs" />
        <Tile label="Plafonds" value={formatSurface(tree.totaux.surfacePlafondMm2)} testId="metre-total-plafond" />
        <Tile label="Périmètre utile" value={formatLineaire(tree.totaux.perimetreUtileMm)} testId="metre-total-perimetre" />
        <Tile label="Volume" value={formatVolume(tree.totaux.volumeMm3)} testId="metre-total-volume" />
        <Tile label="Pièces · ouvertures" value={`${tree.totaux.pieces} · ${tree.totaux.ouvertures}`} testId="metre-total-pieces" />
      </dl>
      {(tree.totaux.sansHauteur > 0 || sansMetre.length > 0) && <p className={styles.muted} data-testid="metre-avertissements">
        {tree.totaux.sansHauteur > 0 && `${tree.totaux.sansHauteur} pièce(s) sans hauteur connue : volume et surfaces murales non calculables (aucune hauteur n'est inventée). `}
        {sansMetre.length > 0 && `${sansMetre.length} pièce(s) sans contour sur le plan : pas de métré.`}
      </p>}

      <section className={styles.section} aria-label="Revêtements par famille" data-testid="metre-familles">
        <h2>Revêtements & quantités par famille</h2>
        {totals.length === 0 ? <p className={styles.muted}>Aucun revêtement saisi. Ouvrez une pièce pour en ajouter.</p>
          : <ul className={styles.rows}>{totals.map((total) => <li key={`${total.support}|${total.famille}|${total.etatProjet}`} data-testid="metre-famille" data-support={total.support} data-famille={total.famille}>
            <span>{REVETEMENT_SUPPORT_LABELS[total.support]} · {REVETEMENT_FAMILLE_LABELS[total.famille] ?? total.famille}{total.etatProjet !== "existant" ? ` · ${ETAT_PROJET_LABELS[total.etatProjet]}` : ""}
              <small className={styles.muted}> ({total.lignes} ligne(s){total.nonCalculables ? `, ${total.nonCalculables} non calculable(s)` : ""})</small></span>
            <span className={styles.value} data-testid="metre-famille-quantite">{total.unite === "ml" ? formatLineaire(total.quantite) : formatSurface(total.quantite)}
              <small className={styles.muted}> · avec perte {total.unite === "ml" ? formatLineaire(total.quantiteAvecPerte) : formatSurface(total.quantiteAvecPerte)}</small></span>
          </li>)}</ul>}
      </section>

      {selection.etat === "projete" && <section className={styles.section} aria-label="Travaux du projeté" data-testid="metre-travaux">
        <h2>Existant · dépose · projeté</h2>
        <ul className={styles.rows}>{ETATS_PROJET.map((etat) => <li key={etat} data-etat={etat}>
          <span>{ETAT_PROJET_LABELS[etat]}</span>
          <span className={styles.value}>
            murs {travaux.murs[etat]?.nombre ?? 0} ({formatLineaire(travaux.murs[etat]?.longueurMm ?? 0)}{travaux.murs[etat]?.surfaceMm2 ? ` · ${formatSurface(travaux.murs[etat]!.surfaceMm2)}` : ""})
            · ouvertures {travaux.ouvertures[etat]?.nombre ?? 0} · objets {travaux.equipements[etat]?.nombre ?? 0}
          </span>
        </li>)}</ul>
        <p className={styles.muted}>Surfaces de murs du projeté : longueur × hauteur saisie du mur. Aucun devis n&apos;est généré.</p>
      </section>}

      <div className={styles.tree} data-testid="metre-arbre">
        {tree.children.map((node) => <TreeNode key={node.id} node={node} depth={1} ctx={{ releveId, structure, repository, canEdit, unite, openPieceId: selection.pieceId, setFeedback, refreshPlan, etat: selection.etat }} />)}
      </div>
    </div>
  </>;
}

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div className={styles.tile}><dt>{label}</dt><dd data-testid={testId}>{value}</dd></div>;
}

function aggregateTravaux(sources: readonly MetreEtageSource[]) {
  const out = { murs: {} as Partial<Record<EtatProjet, { nombre: number; longueurMm: number; surfaceMm2: number }>>, ouvertures: {} as Partial<Record<EtatProjet, { nombre: number }>>, equipements: {} as Partial<Record<EtatProjet, { nombre: number }>> };
  for (const source of sources) {
    for (const etat of ETATS_PROJET) {
      const m = source.metre.travaux.murs[etat];
      if (m) { const acc = (out.murs[etat] ??= { nombre: 0, longueurMm: 0, surfaceMm2: 0 }); acc.nombre += m.nombre; acc.longueurMm += Number(m.longueurMm); acc.surfaceMm2 += Number(m.surfaceMm2); }
      const o = source.metre.travaux.ouvertures[etat];
      if (o) (out.ouvertures[etat] ??= { nombre: 0 }).nombre += o.nombre;
      const e = source.metre.travaux.equipements[etat];
      if (e) (out.equipements[etat] ??= { nombre: 0 }).nombre += e.nombre;
    }
  }
  return out;
}

type Ctx = {
  releveId: ReleveId; structure: ReleveStructure; repository: SupabaseMetreRepository; canEdit: boolean; unite: LongueurUnite; openPieceId: string | null;
  etat: MetreSyntheseEtat; setFeedback(message: string): void; refreshPlan(planId: string): Promise<void>;
};

const NODE_LABELS: Record<MetreNode["kind"], string> = { releve: "Relevé", chantier: "Chantier", batiment: "Bâtiment", etage: "Étage", zone: "Zone", piece: "Pièce" };

function TreeNode({ node, depth, ctx, plan }: { node: MetreNode; depth: number; ctx: Ctx; plan?: MetreNode["plan"] }) {
  if (node.kind === "piece" && node.piece) return <PieceCard node={node} piece={node.piece} ctx={ctx} plan={plan!} />;
  const currentPlan = node.plan ?? plan;
  const Heading = depth <= 1 ? "h2" : depth === 2 ? "h3" : "h4";
  return <section className={styles.level} aria-label={`${NODE_LABELS[node.kind]} ${node.nom}`} data-testid={`metre-${node.kind}`} data-id={node.id}>
    <Heading className={styles.levelTitle}>
      <span>{NODE_LABELS[node.kind]} · {node.nom}</span>
      <small data-testid="metre-noeud-totaux">{node.totaux.pieces} pièce(s) · sol {formatSurface(node.totaux.surfaceSolMm2)} · murs {formatSurface(node.totaux.surfaceMursMm2)} · {formatVolume(node.totaux.volumeMm3)}</small>
      {node.kind === "etage" && !node.plan && <span className={styles.badge}>aucun plan</span>}
      {node.kind === "etage" && node.plan && <>
        <span className={styles.badge} data-tone={node.plan.figeLe ? "fige" : undefined} data-testid="metre-plan-badge">
          Plan {node.plan.numero} · {PLAN_ETAT_LABELS[node.plan.etat]}{node.plan.figeLe ? " · métré figé" : " · calculé"}
        </span>
        <Link className={styles.noPrint} href={planHref({ releveId: ctx.releveId, etageId: node.id, planId: node.plan.planId })}>Voir le plan</Link>
      </>}
    </Heading>
    {node.kind === "etage" && node.plan && !node.plan.figeLe && ctx.canEdit && <SeuilControl ctx={ctx} planId={node.plan.planId} />}
    {node.children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} ctx={ctx} plan={currentPlan} />)}
  </section>;
}

/** Option « petites ouvertures » d'un plan : seuil saisi par l'utilisateur, aucun défaut. */
function SeuilControl({ ctx, planId }: { ctx: Ctx; planId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className={`${releveStyles.secondary} ${styles.noPrint}`} data-testid="metre-seuil-ouvrir" onClick={() => setOpen(true)}>Option petites ouvertures…</button>;
  async function apply(seuil: number | null) {
    setBusy(true);
    try {
      const metre = await ctx.repository.planMetre(planId);
      await ctx.repository.reglerSeuil(planId, metre.revision ?? 0, seuil);
      await ctx.refreshPlan(planId);
      ctx.setFeedback(seuil === null ? "Toutes les ouvertures sont déduites." : `Ouvertures de moins de ${formatSurface(seuil)} non déduites des murs.`);
      setOpen(false);
    } catch (error) { ctx.setFeedback(error instanceof Error ? error.message : "Réglage impossible."); } finally { setBusy(false); }
  }
  return <form className={`${styles.form} ${styles.noPrint}`} data-testid="metre-seuil" onSubmit={(event) => {
    event.preventDefault();
    const parsed = parseSurfaceM2(text);
    if (!parsed.ok) { ctx.setFeedback(parsed.message); return; }
    void apply(parsed.value);
  }}>
    <p className={styles.muted}>Ne pas déduire des surfaces murales les ouvertures plus petites qu&apos;un seuil que vous fixez (aucun seuil n&apos;est imposé). Vide = tout déduire.</p>
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Seuil (m²)</span><input data-testid="metre-seuil-valeur" inputMode="decimal" value={text} placeholder="ex. 0,50" onChange={(event) => setText(event.target.value)} /></label>
      <button type="submit" className={releveStyles.primary} disabled={busy}>Appliquer</button>
      <button type="button" className={releveStyles.secondary} disabled={busy} onClick={() => void apply(null)}>Tout déduire</button>
      <button type="button" className={releveStyles.secondary} onClick={() => setOpen(false)}>Fermer</button>
    </div>
  </form>;
}

const GRANDEURS: { grandeur: PieceGrandeur; label: string; calc(p: MetrePiece): number | null }[] = [
  { grandeur: "surface_sol", label: "Surface de sol (nette)", calc: (p) => p.surfaceSolNetteMm2 },
  { grandeur: "surface_plafond", label: "Surface de plafond", calc: (p) => p.surfacePlafondMm2 },
  { grandeur: "perimetre_brut", label: "Périmètre brut", calc: (p) => p.perimetreBrutMm },
  { grandeur: "perimetre_utile", label: "Périmètre utile (plinthes)", calc: (p) => p.perimetreUtileMm },
  { grandeur: "surface_murs", label: "Surface murale nette", calc: (p) => p.surfaceMursNetteMm2 },
  { grandeur: "volume", label: "Volume", calc: (p) => p.volumeMm3 },
];

function formatKind(value: number | null, kind: "surface" | "longueur" | "volume", unite: LongueurUnite, lineaire = false): string {
  if (value === null) return "non calculable";
  if (kind === "surface") return formatSurface(value);
  if (kind === "volume") return formatVolume(value);
  return lineaire && unite === "m" ? formatLineaire(value) : formatLongueur(value, unite);
}

function PieceCard({ node, piece, ctx, plan }: { node: MetreNode; piece: MetrePiece; ctx: Ctx; plan: NonNullable<MetreNode["plan"]> }) {
  const [open, setOpen] = useState(ctx.openPieceId === piece.pieceId);
  const editable = ctx.canEdit && !plan.figeLe;
  useEffect(() => {
    if (ctx.openPieceId === piece.pieceId) document.getElementById(`metre-piece-${piece.pieceId}`)?.scrollIntoView({ block: "start" });
  }, [ctx.openPieceId, piece.pieceId]);
  return <details className={styles.piece} id={`metre-piece-${piece.pieceId}`} data-piece={piece.pieceId} data-testid="metre-piece" open={open}
    onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary>
      <strong>{node.nom}</strong>
      <span className={styles.value} data-testid="metre-piece-resume">
        {formatSurface(piece.retenu.surface_sol)} · murs {formatKind(piece.retenu.surface_murs, "surface", ctx.unite)} · {formatKind(piece.retenu.volume, "volume", ctx.unite)}
      </span>
      {piece.ajustements.length > 0 && <span className={styles.badge} data-tone={piece.ajustements.some((aj) => aj.perime) ? "alerte" : undefined}>{piece.ajustements.length} ajustement(s)</span>}
    </summary>
    {open && <PieceDetail node={node} piece={piece} ctx={ctx} plan={plan} editable={editable} />}
  </details>;
}

function PieceDetail({ node, piece, ctx, plan, editable }: { node: MetreNode; piece: MetrePiece; ctx: Ctx; plan: NonNullable<MetreNode["plan"]>; editable: boolean }) {
  const [ajuste, setAjuste] = useState<{ grandeur: MetreGrandeur; revetementId: string | null; unite?: "m2" | "ml" } | null>(null);
  const aj = new Map(piece.ajustements.map((item) => [item.grandeur, item]));
  const act = async (run: () => Promise<unknown>, message: string) => {
    try { await run(); await ctx.refreshPlan(plan.planId); ctx.setFeedback(message); } catch (error) { ctx.setFeedback(error instanceof Error ? error.message : "Action impossible."); }
  };
  return <div className={styles.pieceBody}>
    <p className={styles.muted} data-testid="metre-hauteur">
      Hauteur : {piece.hauteurMm === null ? "inconnue — saisissez-la sur la fiche pièce (ou l'étage) : volume et murs non calculables" : `${formatLongueur(piece.hauteurMm, ctx.unite)} (${piece.hauteurSource === "piece" ? "pièce" : "étage"})`}
      {piece.hauteursPonctuelles.length > 0 && ` · hauteurs ponctuelles : ${piece.hauteursPonctuelles.map((h) => formatLongueur(h.valeurMm, ctx.unite)).join(", ")} (plafond incliné non pris en charge : le volume utilise la hauteur de la pièce)`}
      {" · "}<Link className={styles.noPrint} href={pieceHref(ctx.releveId, piece.pieceId)}>Fiche pièce</Link>
    </p>

    <section aria-label="Quantités de la pièce">
      <ul className={styles.rows} data-testid="metre-grandeurs">{GRANDEURS.map(({ grandeur, label, calc }) => {
        const kind = grandeurKind(grandeur);
        const item = aj.get(grandeur);
        return <li key={grandeur} data-grandeur={grandeur}>
          <span>{label}</span>
          <span className={styles.value} data-testid="metre-valeur">
            {formatKind(piece.retenu[grandeur], kind, ctx.unite, grandeur.startsWith("perimetre"))}
            {item && <small className={item.perime ? styles.stale : styles.muted}> · calculé {formatKind(calc(piece), kind, ctx.unite, grandeur.startsWith("perimetre"))}{item.perime ? " (a changé depuis l'ajustement)" : ""}</small>}
          </span>
          {editable && <span className={`${styles.inlineActions} ${styles.noPrint}`}>
            <button type="button" className={releveStyles.secondary} data-testid={`metre-ajuster-${grandeur}`} onClick={() => setAjuste({ grandeur, revetementId: null })}>Ajuster</button>
            {item && <button type="button" className={releveStyles.secondary} data-testid={`metre-retirer-${grandeur}`}
              onClick={() => void act(() => ctx.repository.retirerAjustement(item.id, null), `Ajustement retiré : ${METRE_GRANDEUR_LABELS[grandeur]} revient à la valeur calculée.`)}>Valeur calculée</button>}
          </span>}
          {item && <small className={styles.muted} data-testid="metre-ajustement">Retenu {formatKind(item.valeurRetenue, kind, ctx.unite, grandeur.startsWith("perimetre"))} au lieu de {formatKind(item.valeurCalculee, kind, ctx.unite, grandeur.startsWith("perimetre"))} — « {item.raison} » · {new Date(item.date).toLocaleString("fr-FR")}</small>}
        </li>;
      })}</ul>
      {ajuste && ajuste.revetementId === null && <AjustementForm ctx={ctx} planId={plan.planId} pieceId={piece.pieceId} cible={ajuste} onDone={() => setAjuste(null)} refresh={act} />}
    </section>

    <section aria-label="Murs de la pièce">
      <h3>Murs ({piece.faces.length} faces) · brut {formatKind(piece.surfaceMursBruteMm2, "surface", ctx.unite)} − déductions {formatSurface(piece.deductionsMm2)}</h3>
      <ul className={styles.rows} data-testid="metre-faces">{piece.faces.map((face) => <li key={face.index}>
        <span>Face {face.index + 1}{face.murId ? "" : " (mur non retrouvé)"}</span>
        <span className={styles.value}>{formatLongueur(face.longueurMm, ctx.unite)} · {formatKind(face.surfaceNetteMm2, "surface", ctx.unite)}{face.deductionsMm2 ? ` (− ${formatSurface(face.deductionsMm2)})` : ""}</span>
      </li>)}</ul>
    </section>

    <section aria-label="Ouvertures de la pièce">
      <h3>Ouvertures ({piece.ouvertures.length})</h3>
      <ul className={styles.rows} data-testid="metre-ouvertures">{piece.ouvertures.map((o) => <li key={o.id} data-type={o.typeOuverture} data-deduite={o.deduite}>
        <span>{OUVERTURE_TYPE_LABELS[o.typeOuverture]}{o.etatProjet !== "existant" ? ` · ${ETAT_PROJET_LABELS[o.etatProjet]}` : ""}</span>
        <span className={styles.value}>{formatLongueur(o.largeurMm, "cm")} × {formatLongueur(o.hauteurMm, "cm")} = {formatSurface(o.surfaceMm2)}{o.deduite ? "" : " (non déduite)"}{o.franchissable ? " · franchissable" : ""}</span>
      </li>)}</ul>
    </section>

    <RevetementsSection node={node} piece={piece} ctx={ctx} plan={plan} editable={editable} onAjuster={(revetement) => setAjuste({ grandeur: "quantite", revetementId: revetement.id, unite: revetement.unite })} act={act} />
    {ajuste && ajuste.revetementId !== null && <AjustementForm ctx={ctx} planId={plan.planId} pieceId={null} cible={ajuste} onDone={() => setAjuste(null)} refresh={act} />}
  </div>;
}

function AjustementForm({ ctx, planId, pieceId, cible, onDone, refresh }: {
  ctx: Ctx; planId: string; pieceId: string | null; cible: { grandeur: MetreGrandeur; revetementId: string | null; unite?: "m2" | "ml" };
  onDone(): void; refresh(run: () => Promise<unknown>, message: string): Promise<void>;
}) {
  const kind = grandeurKind(cible.grandeur, cible.unite);
  const [valeur, setValeur] = useState(""); const [raison, setRaison] = useState(""); const [error, setError] = useState("");
  const unitLabel = kind === "surface" ? "m²" : kind === "volume" ? "m³" : "ml";
  return <form className={styles.form} data-testid="metre-ajustement-form" onSubmit={(event) => {
    event.preventDefault();
    const parsed = kind === "surface" ? parseSurfaceM2(valeur) : kind === "volume" ? parseVolumeM3(valeur) : parseLineaireMl(valeur);
    if (!parsed.ok || parsed.value === null) { setError(parsed.ok ? "Valeur retenue attendue." : parsed.message); return; }
    if (raison.trim().length < 3) { setError("La raison de l'ajustement est obligatoire."); return; }
    setError("");
    void refresh(() => ctx.repository.ajuster(planId, { pieceId, revetementId: cible.revetementId, grandeur: cible.grandeur }, parsed.value!, raison.trim()),
      `${METRE_GRANDEUR_LABELS[cible.grandeur]} ajustée : la valeur calculée reste affichée à côté.`).then(onDone);
  }}>
    <strong>Ajuster : {METRE_GRANDEUR_LABELS[cible.grandeur]}</strong>
    <p className={styles.muted}>La valeur calculée n&apos;est jamais écrasée : la valeur retenue, la raison, l&apos;auteur et la date sont tracés.</p>
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Valeur retenue ({unitLabel})</span><input data-testid="metre-ajustement-valeur" inputMode="decimal" value={valeur} onChange={(event) => setValeur(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Raison (obligatoire)</span><input data-testid="metre-ajustement-raison" value={raison} maxLength={500} onChange={(event) => setRaison(event.target.value)} /></label>
      <button type="submit" className={releveStyles.primary} data-testid="metre-ajustement-valider">Enregistrer</button>
      <button type="button" className={releveStyles.secondary} onClick={onDone}>Annuler</button>
    </div>
    {error && <small className={releveStyles.fieldError} role="alert">{error}</small>}
  </form>;
}

function RevetementsSection({ node, piece, ctx, plan, editable, onAjuster, act }: {
  node: MetreNode; piece: MetrePiece; ctx: Ctx; plan: NonNullable<MetreNode["plan"]>; editable: boolean;
  onAjuster(revetement: MetreRevetement): void; act(run: () => Promise<unknown>, message: string): Promise<void>;
}) {
  const [editing, setEditing] = useState<PlanRevetement | "new" | null>(null);
  const [full, setFull] = useState<PlanRevetement[] | null>(null);
  const loadFull = async () => { const list = await ctx.repository.listRevetements(plan.planId); setFull(list); return list; };
  return <section aria-label="Revêtements de la pièce" data-testid="metre-revetements">
    <h3>Revêtements ({node.revetements.length})</h3>
    <ul className={styles.rows}>{node.revetements.map((rev) => <li key={rev.id} data-testid="metre-revetement" data-support={rev.categorie} data-famille={rev.revetement}>
      <span>{REVETEMENT_SUPPORT_LABELS[rev.categorie]} · {REVETEMENT_FAMILLE_LABELS[rev.revetement] ?? rev.revetement} · {rev.libelle}
        {rev.categorie === "mur" && rev.application.mode !== "tous" ? ` · ${REVETEMENT_APPLICATION_LABELS[rev.application.mode]}` : ""}
        {rev.etatProjet !== "existant" ? ` · ${ETAT_PROJET_LABELS[rev.etatProjet]}` : ""}</span>
      <span className={styles.value} data-testid="metre-revetement-quantite">
        {rev.quantite === null ? (rev.raison === "hauteur_inconnue" ? "non calculable (hauteur inconnue)" : "non calculable") : formatKind(rev.quantite, rev.unite === "ml" ? "longueur" : "surface", ctx.unite, true)}
        {rev.quantiteAvecPerte !== null && <small className={styles.muted}> · perte {String(rev.pertePourcent).replace(".", ",")} % → {formatKind(rev.quantiteAvecPerte, rev.unite === "ml" ? "longueur" : "surface", ctx.unite, true)}</small>}
        {rev.ajustement && <small className={rev.ajustement.perime ? styles.stale : styles.muted}> · ajusté (calculé {formatKind(rev.quantiteCalculee, rev.unite === "ml" ? "longueur" : "surface", ctx.unite, true)}) — « {rev.ajustement.raison} »</small>}
      </span>
      {editable && <span className={`${styles.inlineActions} ${styles.noPrint}`}>
        <button type="button" className={releveStyles.secondary} data-testid="metre-revetement-modifier" onClick={() => void loadFull().then((list) => setEditing(list.find((item) => item.id === rev.id) ?? null))}>Modifier</button>
        <button type="button" className={releveStyles.secondary} data-testid="metre-revetement-ajuster" onClick={() => onAjuster(rev)}>Ajuster</button>
        {rev.ajustement && <button type="button" className={releveStyles.secondary} onClick={() => void act(() => ctx.repository.retirerAjustement(rev.ajustement!.id, null), "Ajustement retiré.")}>Valeur calculée</button>}
        <button type="button" className={releveStyles.danger} data-testid="metre-revetement-supprimer" onClick={() => {
          if (!window.confirm(`Supprimer le revêtement « ${rev.libelle} » ?`)) return;
          void act(() => ctx.repository.deleteRevetement(plan.planId, rev.id), "Revêtement supprimé.");
        }}>Supprimer</button>
      </span>}
    </li>)}</ul>
    {editable && editing === null && <button type="button" className={`${releveStyles.secondary} ${styles.noPrint}`} data-testid="metre-revetement-ajouter" onClick={() => setEditing("new")}>+ Revêtement</button>}
    {editable && editing !== null && <RevetementForm key={editing === "new" ? "new" : editing.id} piece={piece} initial={editing === "new" ? null : editing} projete={ctx.etat === "projete"} unite={ctx.unite}
      onCancel={() => setEditing(null)}
      onSave={(revetement) => act(() => ctx.repository.saveRevetement(plan.planId, revetement), `Revêtement « ${revetement.libelle} » enregistré.`).then(() => { setEditing(null); if (full) void loadFull(); })} />}
  </section>;
}

function RevetementForm({ piece, initial, projete, unite, onCancel, onSave }: {
  piece: MetrePiece; initial: PlanRevetement | null; projete: boolean; unite: LongueurUnite; onCancel(): void; onSave(revetement: PlanRevetement): Promise<void>;
}) {
  const [support, setSupport] = useState<RevetementSupport>(initial?.support ?? "sol");
  const [famille, setFamille] = useState(initial?.famille ?? REVETEMENT_FAMILLES.sol[0]);
  const [libelle, setLibelle] = useState(initial?.libelle ?? "");
  const [perte, setPerte] = useState(initial ? String(initial.pertePourcent).replace(".", ",") : "0");
  const [mode, setMode] = useState<RevetementApplication["mode"]>(initial?.application.mode ?? "tous");
  const facesAvecMur = piece.faces.filter((face) => face.murId !== null);
  const [murIds, setMurIds] = useState<string[]>(initial?.application.mode === "murs" ? [...initial.application.murIds] : []);
  const zone0 = initial?.application.mode === "zone" ? initial.application : null;
  const [zoneMur, setZoneMur] = useState(zone0?.murId ?? facesAvecMur[0]?.murId ?? "");
  const faceOf = (murId: string) => facesAvecMur.find((face) => face.murId === murId);
  const cmText = (mm: number | null | undefined) => (mm === null || mm === undefined ? "" : String(Math.round(mm) / 10).replace(".", ","));
  const [debut, setDebut] = useState(cmText(zone0?.debutMm ?? faceOf(zoneMur)?.debutMm));
  const [fin, setFin] = useState(cmText(zone0?.finMm ?? faceOf(zoneMur)?.finMm));
  const [bas, setBas] = useState(cmText(zone0?.basMm ?? 0));
  const [haut, setHaut] = useState(cmText(zone0?.hautMm ?? null));
  const [sensPose, setSensPose] = useState(initial?.sensPose ?? "");
  const [format, setFormat] = useState(initial?.format ?? "");
  const [commentaire, setCommentaire] = useState(initial?.commentaire ?? "");
  const [etatProjet, setEtatProjet] = useState<EtatProjet>(initial?.etatProjet ?? "existant");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cm = (text: string) => { const parsed = parseLongueur(text, "cm"); return parsed.ok ? parsed.value : undefined; };
  const cmZero = (text: string) => (text.trim() === "0" ? 0 : cm(text));

  function build(): PlanRevetement | string {
    const parsedPerte = parsePourcent(perte);
    if (!parsedPerte.ok || parsedPerte.value === null) return parsedPerte.ok ? "Perte attendue." : parsedPerte.message;
    let application: RevetementApplication = { mode: "tous" };
    if (support === "mur" && mode === "murs") application = { mode: "murs", murIds };
    if (support === "mur" && mode === "zone") {
      const d = cmZero(debut); const f = cm(fin); const b = cmZero(bas); const h = cm(haut);
      if (d === undefined || d === null || f === undefined || f === null || b === undefined || b === null || h === undefined || h === null) return "Zone : début, fin, bas et haut en centimètres.";
      application = { mode: "zone", murId: zoneMur, debutMm: d, finMm: f, basMm: b, hautMm: h };
    }
    const revetement: PlanRevetement = {
      id: initial?.id ?? newUuid(), pieceId: piece.pieceId, support, famille, libelle: libelle.trim() || REVETEMENT_FAMILLE_LABELS[famille] || famille,
      pertePourcent: parsedPerte.value, application, sensPose: sensPose.trim() || null, format: format.trim() || null, commentaire: commentaire.trim() || null,
      ...(projete || initial?.etatProjet ? { etatProjet } : {}), ...(initial?.origineId ? { origineId: initial.origineId } : {}),
    };
    const code = revetementAnomalie(revetement);
    return code ? REVETEMENT_ISSUE_MESSAGES[code] : revetement;
  }

  return <form className={`${styles.form} ${styles.noPrint}`} data-testid="metre-revetement-form" onSubmit={(event) => {
    event.preventDefault();
    const result = build();
    if (typeof result === "string") { setError(result); return; }
    setError(""); setBusy(true);
    void onSave(result).finally(() => setBusy(false));
  }}>
    <strong>{initial ? "Modifier le revêtement" : "Nouveau revêtement"}</strong>
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Support</span>
        <select data-testid="metre-revetement-support" value={support} onChange={(event) => { const next = event.target.value as RevetementSupport; setSupport(next); setFamille(REVETEMENT_FAMILLES[next][0]); if (next !== "mur") setMode("tous"); }}>
          {REVETEMENT_SUPPORTS.map((item) => <option key={item} value={item}>{REVETEMENT_SUPPORT_LABELS[item]}</option>)}
        </select>
      </label>
      <label className={releveStyles.field}><span>Famille</span>
        <select data-testid="metre-revetement-famille" value={famille} onChange={(event) => setFamille(event.target.value)}>
          {REVETEMENT_FAMILLES[support].map((item) => <option key={item} value={item}>{REVETEMENT_FAMILLE_LABELS[item] ?? item}</option>)}
        </select>
      </label>
      <label className={releveStyles.field}><span>Libellé</span><input data-testid="metre-revetement-libelle" value={libelle} maxLength={200} placeholder={REVETEMENT_FAMILLE_LABELS[famille]} onChange={(event) => setLibelle(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Perte (%)</span><input data-testid="metre-revetement-perte" inputMode="decimal" value={perte} onChange={(event) => setPerte(event.target.value)} /></label>
      {support !== "plinthe" && <label className={releveStyles.field}><span>Format</span><input data-testid="metre-revetement-format" value={format} maxLength={100} placeholder="ex. 60×60" onChange={(event) => setFormat(event.target.value)} /></label>}
      {support === "sol" && <label className={releveStyles.field}><span>Sens de pose</span><input data-testid="metre-revetement-sens" value={sensPose} maxLength={100} placeholder="ex. droit, diagonale, à l'anglaise" onChange={(event) => setSensPose(event.target.value)} /></label>}
      {projete && <label className={releveStyles.field}><span>État projeté</span>
        <select data-testid="metre-revetement-etat" value={etatProjet} onChange={(event) => setEtatProjet(event.target.value as EtatProjet)}>
          {ETATS_PROJET.map((item) => <option key={item} value={item}>{ETAT_PROJET_LABELS[item]}</option>)}
        </select>
      </label>}
    </div>
    {support === "mur" && <fieldset className={styles.form}>
      <legend>Application</legend>
      <div className={styles.checks} role="radiogroup">
        {(["tous", "murs", "zone"] as const).map((item) => <label key={item}><input type="radio" name="application" data-testid={`metre-revetement-mode-${item}`} checked={mode === item} onChange={() => setMode(item)} /> {REVETEMENT_APPLICATION_LABELS[item]}</label>)}
      </div>
      {mode === "murs" && <div className={styles.checks}>
        {facesAvecMur.map((face) => <label key={face.index}><input type="checkbox" data-testid="metre-revetement-mur" checked={murIds.includes(face.murId!)}
          onChange={(event) => setMurIds((current) => (event.target.checked ? [...new Set([...current, face.murId!])] : current.filter((id) => id !== face.murId)))} />
          Face {face.index + 1} · {formatLongueur(face.longueurMm, unite)}</label>)}
      </div>}
      {mode === "zone" && <div className={styles.grid}>
        <label className={releveStyles.field}><span>Mur</span>
          <select data-testid="metre-revetement-zone-mur" value={zoneMur} onChange={(event) => { setZoneMur(event.target.value); const face = faceOf(event.target.value); setDebut(cmText(face?.debutMm)); setFin(cmText(face?.finMm)); }}>
            {facesAvecMur.map((face) => <option key={face.index} value={face.murId!}>Face {face.index + 1} · {formatLongueur(face.longueurMm, unite)}</option>)}
          </select>
        </label>
        <label className={releveStyles.field}><span>Début (cm, depuis A)</span><input data-testid="metre-revetement-zone-debut" inputMode="decimal" value={debut} onChange={(event) => setDebut(event.target.value)} /></label>
        <label className={releveStyles.field}><span>Fin (cm, depuis A)</span><input data-testid="metre-revetement-zone-fin" inputMode="decimal" value={fin} onChange={(event) => setFin(event.target.value)} /></label>
        <label className={releveStyles.field}><span>Bas (cm)</span><input data-testid="metre-revetement-zone-bas" inputMode="decimal" value={bas} onChange={(event) => setBas(event.target.value)} /></label>
        <label className={releveStyles.field}><span>Haut (cm)</span><input data-testid="metre-revetement-zone-haut" inputMode="decimal" value={haut} onChange={(event) => setHaut(event.target.value)} /></label>
      </div>}
    </fieldset>}
    <label className={releveStyles.field}><span>Commentaire</span><textarea data-testid="metre-revetement-commentaire" value={commentaire} maxLength={2000} onChange={(event) => setCommentaire(event.target.value)} /></label>
    <div className={styles.inlineActions}>
      <button type="submit" className={releveStyles.primary} data-testid="metre-revetement-enregistrer" disabled={busy}>Enregistrer</button>
      <button type="button" className={releveStyles.secondary} onClick={onCancel}>Annuler</button>
    </div>
    {error && <small className={releveStyles.fieldError} role="alert">{error}</small>}
  </form>;
}
