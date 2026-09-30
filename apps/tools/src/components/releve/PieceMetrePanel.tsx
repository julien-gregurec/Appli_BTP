"use client";

/**
 * Relevé Lot 8 — fiche pièce : métré de la pièce sur le PLAN DE RÉFÉRENCE de l'étage (le plus
 * récent), calculé par le serveur (ou figé avec le plan). Lecture seule ; ajustements et
 * revêtements se gèrent dans la vue Métré.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatLineaire, formatLongueur, formatSurface, formatVolume, referencePlan, type MetrePiece, type Plan } from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { metreHref } from "@/lib/releve/navigation";
import { SupabaseMetreRepository } from "@/lib/releve/plan/supabase-metre-repository";
import { SupabasePlanRepository } from "@/lib/releve/plan/supabase-plan-repository";
import styles from "./releve.module.css";

export function PieceMetrePanel({ releveId, etageId, pieceId }: { releveId: string; etageId: string; pieceId: string }) {
  const client = getElsatiaClient();
  const plans = useMemo(() => new SupabasePlanRepository(client), [client]);
  const metres = useMemo(() => new SupabaseMetreRepository(client), [client]);
  const [state, setState] = useState<{ plan: Plan | null; piece: MetrePiece | null; revetements: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    plans.listPlans(etageId).then(async (list) => {
      const plan = referencePlan(list);
      if (!plan) return { plan: null, piece: null, revetements: 0 };
      const metre = await metres.planMetre(plan.id);
      return { plan, piece: metre.pieces.find((item) => item.pieceId === pieceId) ?? null, revetements: metre.revetements.filter((item) => item.pieceId === pieceId).length };
    }).then((next) => { if (!cancelled) setState(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Métré indisponible."); });
    return () => { cancelled = true; };
  }, [plans, metres, etageId, pieceId]);
  const p = state?.piece ?? null;
  return <section className={styles.column} aria-label="Métré de la pièce" data-testid="piece-metre">
    <h2>Métré de la pièce (plan)</h2>
    {error && <p className={styles.feedback} role="alert">{error}</p>}
    {!state && !error && <p className={styles.feedback}>Calcul…</p>}
    {state && !p && <p className={styles.feedback}>{state.plan ? "La pièce n'est pas associée à un contour du plan : associez-la (outil Pièce) pour obtenir son métré." : "Aucun plan pour cet étage."}</p>}
    {p && <dl className={styles.facts}>
      <div><dt>Sol</dt><dd data-testid="piece-metre-sol">{formatSurface(p.retenu.surface_sol)}</dd></div>
      <div><dt>Murs nets</dt><dd data-testid="piece-metre-murs">{p.retenu.surface_murs === null ? "non calculable" : formatSurface(p.retenu.surface_murs)}</dd></div>
      <div><dt>Plafond</dt><dd>{formatSurface(p.retenu.surface_plafond)}</dd></div>
      <div><dt>Périmètre utile</dt><dd>{formatLineaire(p.retenu.perimetre_utile)}</dd></div>
      <div><dt>Hauteur</dt><dd>{p.hauteurMm === null ? "inconnue" : `${formatLongueur(p.hauteurMm, "m")} (${p.hauteurSource === "piece" ? "pièce" : "étage"})`}</dd></div>
      <div><dt>Volume</dt><dd data-testid="piece-metre-volume">{p.retenu.volume === null ? "non calculable" : formatVolume(p.retenu.volume)}</dd></div>
      <div><dt>Ouvertures · revêtements</dt><dd>{p.ouvertures.length} · {state!.revetements}</dd></div>
    </dl>}
    <Link className={styles.secondary} href={metreHref({ releveId, pieceId })} data-testid="lien-metre-piece">Métré détaillé, revêtements, ajustements</Link>
  </section>;
}
