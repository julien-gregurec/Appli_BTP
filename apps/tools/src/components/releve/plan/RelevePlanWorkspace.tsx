"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allowedActions, breadcrumbFor, defaultPlan, ReleveMediaService, PLAN_ETAT_LABELS,
  type LoadedPlan, type Plan, type PhotoLibrary, type ReleveActorContext, type ReleveId, type ReleveService, type ReleveStructure,
} from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { ficheHref, metreHref, pieceHref, planHref, readPlanSelection, RELEVES_PATH, structureHref, type PlanSelection } from "@/lib/releve/navigation";
import { SupabasePlanRepository } from "@/lib/releve/plan/supabase-plan-repository";
import { SupabaseReleveMediaRepository } from "@/lib/releve/supabase-media-repository";
import { SupabaseReleveRepository } from "@/lib/releve/supabase-repository";
import { Brand } from "../../HomeDashboard";
import releveStyles from "../releve.module.css";
import { ReleveLocked } from "../ReleveLocked";
import { useReleveService } from "../use-releve-service";
import { PlanEditor } from "./PlanEditor";
import styles from "./plan.module.css";

/**
 * Plan 2D (Lot 5) : plan de l'ÉTAGE, cadré sur l'étage, une zone ou une pièce.
 * `?id=&etage=` obligatoires, `&zone=` ou `&piece=` pour la portée, `&plan=` pour un plan précis.
 */
export function RelevePlanWorkspace() {
  const state = useReleveService();
  const [target, setTarget] = useState<PlanSelection | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setTarget(readPlanSelection(window.location.search));
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, []);
  return <main className={`projects-page ${styles.page}`}>
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${releveStyles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${releveStyles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && target === null && <p className={`shell ${releveStyles.feedback}`} role="alert">Plan introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && target && <PlanLoader key={`${target.releveId}:${target.etageId}:${target.planId ?? ""}`} service={state.service} actor={state.actor} selection={target}
      onNavigate={(next) => { window.history.pushState(null, "", planHref(next)); setTarget(readPlanSelection(window.location.search)); }} />}
  </main>;
}

type Loaded = { structure: ReleveStructure; plans: Plan[]; current: LoadedPlan | null; library: PhotoLibrary | null };

function PlanLoader({ service, actor, selection, onNavigate }: {
  service: ReleveService; actor: ReleveActorContext; selection: PlanSelection; onNavigate(next: PlanSelection): void;
}) {
  const client = getElsatiaClient();
  const repository = useMemo(() => new SupabasePlanRepository(client), [client]);
  const media = useMemo(() => new ReleveMediaService(new SupabaseReleveMediaRepository(client), new SupabaseReleveRepository(client), actor), [client, actor]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const releveId = selection.releveId as ReleveId;

  const load = useCallback(async (planId: string | null) => {
    const [structure, plans] = await Promise.all([service.get(releveId), repository.listPlans(selection.etageId)]);
    const chosen = (planId ? plans.find((plan) => plan.id === planId) : null) ?? defaultPlan(plans);
    const current = chosen ? await repository.loadPlan(chosen.id) : null;
    return { structure, plans, current, library: null };
  }, [service, repository, releveId, selection.etageId]);

  // Photos (Lot 4) : chargées APRÈS le plan, sans le bloquer — la bibliothèque relit tous les
  // éléments du relevé, et un échec de signature ne doit jamais empêcher l'édition.
  const [library, setLibrary] = useState<PhotoLibrary | null>(null);
  useEffect(() => {
    let cancelled = false;
    media.library(releveId).then((next) => { if (!cancelled) setLibrary(next); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [media, releveId]);

  useEffect(() => {
    let cancelled = false;
    load(selection.planId)
      .then((next) => { if (!cancelled) setLoaded(next); })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Plan non accessible."); });
    return () => { cancelled = true; };
  }, [load, selection.planId]);

  const reload = useCallback(async (planId: string | null) => {
    try { setLoaded(await load(planId)); } catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [load]);

  if (!loaded) return <p className={`shell ${releveStyles.feedback}`} role="status">{feedback || "Chargement du plan…"}</p>;
  const { structure } = loaded;
  const etage = structure.etages.find((item) => item.id === selection.etageId && !item.deletedAt);
  if (!etage) return <p className={`shell ${releveStyles.feedback}`} role="alert">Étage introuvable ou retiré. <Link href={ficheHref(releveId)}>Fiche du relevé</Link></p>;
  const batiment = structure.batiments.find((item) => item.id === etage.batimentId)!;
  const canEdit = allowedActions(actor, structure.releve).includes("edit");
  const crumbs = breadcrumbFor(structure, { kind: "etage", id: etage.id });
  const zone = selection.zoneId ? structure.zones.find((item) => item.id === selection.zoneId && item.etageId === etage.id) ?? null : null;
  const piece = selection.pieceId ? structure.pieces.find((item) => item.id === selection.pieceId && item.etageId === etage.id) ?? null : null;
  const scopeLabel = piece ? `Pièce · ${piece.nom}` : zone ? `Zone · ${zone.nom}` : `Étage · ${etage.nom}`;
  const etageLink = structureHref({ releveId, chantierId: batiment.chantierId, batimentId: batiment.id, etageId: etage.id });

  async function createPlan(etat: Plan["etatDocumente"]) {
    setBusy(true); setFeedback("");
    try {
      const created = await repository.createPlan(etage!.id, etat);
      onNavigate({ ...selection, planId: created.id });
      await reload(created.id);
      setFeedback(`Plan « ${PLAN_ETAT_LABELS[etat]} » créé.`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Création impossible."); } finally { setBusy(false); }
  }

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={releveStyles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        {crumbs.map((crumb) => <li key={`${crumb.level}:${crumb.id}`}>
          {crumb.level === "projet" ? <Link href={ficheHref(releveId)}>{crumb.label}</Link>
            : crumb.level === "etage" ? <Link href={etageLink}>{crumb.label}</Link> : crumb.label}
        </li>)}
        <li aria-current="page">Plan</li>
      </ol></nav>
      <p className="eyebrow">PLAN 2D · {scopeLabel.toUpperCase()}</p>
      <h1 className="projects-title">Plan · {etage.nom}</h1>
      <nav className={styles.scopes} aria-label="Portée du plan">
        <Link href={planHref({ releveId, etageId: etage.id, planId: loaded.current?.plan.id })} aria-current={!zone && !piece ? "page" : undefined}>Étage</Link>
        {structure.zones.filter((item) => item.etageId === etage.id && !item.deletedAt).map((item) => <Link key={item.id} href={planHref({ releveId, etageId: etage.id, zoneId: item.id, planId: loaded.current?.plan.id })} aria-current={zone?.id === item.id ? "page" : undefined}>Zone · {item.nom}</Link>)}
        {piece && <Link href={pieceHref(releveId, piece.id)}>Fiche {piece.nom}</Link>}
        <Link href={metreHref({ releveId, etat: loaded.current?.plan.etatDocumente === "projete" ? "projete" : loaded.current?.plan.etatDocumente === "as_built" ? "as_built" : "existant", pieceId: piece?.id ?? null })} data-testid="lien-metre-plan">Métré</Link>
      </nav>
      <p className={releveStyles.feedback} role="status" aria-live="polite">{feedback}</p>
    </div></section>

    <div className="shell">
      {loaded.current
        ? <PlanEditor key={`${loaded.current.plan.id}:${loaded.current.plan.revision}`} repository={repository} media={media} structure={structure} etage={etage}
          plans={loaded.plans} loaded={loaded.current} library={library} canEdit={canEdit} scope={{ zoneId: zone?.id ?? null, pieceId: piece?.id ?? null }}
          onSwitchPlan={(planId) => { onNavigate({ ...selection, planId }); void reload(planId); }}
          onReloadPlan={() => reload(loaded.current!.plan.id)} />
        : <section className={styles.empty} aria-label="Aucun plan">
          <h2>Aucun plan pour cet étage</h2>
          <p>Le plan initial documente l&apos;existant relevé. Les murs déjà saisis sur l&apos;étage y seront repris.</p>
          {canEdit
            ? <button type="button" className={releveStyles.primary} disabled={busy} onClick={() => void createPlan("initial")}>Créer le plan initial</button>
            : <p className={releveStyles.feedback}>Consultation : aucun plan à afficher.</p>}
        </section>}
    </div>
  </>;
}
