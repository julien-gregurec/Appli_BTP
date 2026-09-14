"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lien as Link } from "@/components/Lien";
import { LIBELLES_GROUPES, type ActionContextuelle, type GroupeAction } from "@/lib/actions-contextuelles/registre";

/**
 * Barre latérale contextuelle (GP V1, lot E) : tout ce que l'utilisateur peut faire sur l'objet
 * ouvert, en une colonne à droite sur ordinateur, en barre basse + feuille sur tablette et téléphone.
 * Une action indisponible reste visible, grisée, `aria-disabled`, avec son motif en infobulle et
 * lisible au lecteur d'écran — jamais `disabled`, qui rendrait l'infobulle inaccessible au clavier.
 * Les actions serveur sont fournies par la page (`formActions`) ; le registre reste pur.
 *
 * `pliable` (GP V1, « barre d'actions contextuelle », 2026-09-14) : variante repliable en icônes
 * seules, préférence mémorisée dans ce navigateur — réservée à l'éditeur de devis et au planning
 * (voir `EditeurDevisV2`, `PlanningV2`). Les 8 fiches existantes (client, devis, fournisseur…)
 * n'activent pas cette option et gardent EXACTEMENT le rendu d'avant, sans aucun changement.
 */
export type ActionsServeur = Record<string, (formData: FormData) => void | Promise<void>>;

const ORDRE: GroupeAction[] = ["creer", "modifier", "transformer", "document", "navigation", "danger"];

export function PanneauActions({ titre, actions, formActions = {}, handlers = {}, contexte, pliable = false, cleStockageRepli, onRepliChange, testId }: {
  titre: string;
  actions: ActionContextuelle[];
  formActions?: ActionsServeur;
  /** Gestionnaires côté navigateur (écrans interactifs : planning). */
  handlers?: Record<string, () => void>;
  /** Bref rappel de l'objet (numéro, statut). */
  contexte?: ReactNode;
  /** Active le repli en icônes seules (bouton ‹ / ›), en plus du panneau classique. */
  pliable?: boolean;
  /** Clé de préférence (ce navigateur) pour la barre repliable — obligatoire si `pliable`. */
  cleStockageRepli?: string;
  /** Informe la page conteneuse de l'état plié/déplié, pour réserver la place voulue (`lg:pr-*`). */
  onRepliChange?: (repliee: boolean) => void;
  testId?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const feuille = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ouvert) feuille.current?.showModal(); else feuille.current?.close(); }, [ouvert]);
  const disponibles = actions.filter((a) => a.disponible).length;

  const [repliee, setRepliee] = useState(false);
  useEffect(() => {
    if (!pliable || !cleStockageRepli) return;
    const t = window.setTimeout(() => {
      try { const r = window.localStorage.getItem(cleStockageRepli) === "1"; if (r) { setRepliee(true); onRepliChange?.(true); } } catch { /* stockage indisponible */ }
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pliable, cleStockageRepli]);
  const basculerRepli = () => {
    setRepliee((r) => {
      const suivant = !r;
      if (cleStockageRepli) { try { window.localStorage.setItem(cleStockageRepli, suivant ? "1" : "0"); } catch { /* idem */ } }
      onRepliChange?.(suivant);
      return suivant;
    });
  };
  const compact = pliable && repliee;

  const contenu = (
    <nav aria-label={`Actions — ${titre}`} className="space-y-3">
      {ORDRE.map((groupe) => {
        const items = actions.filter((a) => a.groupe === groupe);
        if (!items.length) return null;
        return (
          <div key={groupe} role="group" aria-label={LIBELLES_GROUPES[groupe]}>
            {!compact && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{LIBELLES_GROUPES[groupe]}</div>}
            <ul className="space-y-0.5">
              {items.map((a) => <li key={a.cle}><Action a={a} formAction={formActions[a.cle]} handler={handlers[a.cle]} compact={compact} testId={testId} /></li>)}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside data-panneau-actions data-testid={testId} data-repliee={pliable ? (repliee ? "1" : "0") : undefined} className={`hidden lg:fixed lg:right-4 lg:top-24 lg:z-30 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-auto lg:rounded-md lg:border lg:border-neutral-200 lg:bg-white lg:p-3 lg:shadow-sm dark:lg:border-neutral-800 dark:lg:bg-neutral-950 ${compact ? "lg:w-14" : "lg:w-60"}`}>
        <div className={`mb-2 flex items-center gap-1 border-b border-neutral-100 pb-2 dark:border-neutral-800 ${compact ? "flex-col" : ""}`}>
          {!compact && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{titre}</div>
              {contexte && <div className="truncate text-xs text-neutral-500">{contexte}</div>}
            </div>
          )}
          {pliable && (
            <button
              type="button"
              onClick={basculerRepli}
              aria-expanded={!repliee}
              aria-controls={testId ? `${testId}-contenu` : undefined}
              title={repliee ? "Développer la barre d'actions" : "Réduire la barre d'actions"}
              aria-label={repliee ? "Développer la barre d'actions" : "Réduire la barre d'actions"}
              data-testid={testId ? `${testId}-bascule` : undefined}
              className={`min-h-9 min-w-9 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900 ${compact ? "" : "ml-auto shrink-0"}`}
            >
              {repliee ? "‹" : "›"}
            </button>
          )}
        </div>
        <div id={testId ? `${testId}-contenu` : undefined}>{contenu}</div>
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-neutral-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden dark:border-neutral-800 dark:bg-neutral-950/95" data-panneau-actions-mobile>
        <button type="button" onClick={() => setOuvert(true)} data-testid={testId ? `${testId}-mobile-bouton` : undefined} className="min-h-11 flex-1 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-neutral-900" aria-haspopup="dialog">
          Actions ({disponibles})
        </button>
      </div>
      <dialog ref={feuille} onClose={() => setOuvert(false)} aria-label={`Actions — ${titre}`} data-testid={testId ? `${testId}-mobile-feuille` : undefined} className="w-screen max-w-none rounded-t-xl p-0 backdrop:bg-black/40 sm:mx-auto sm:w-[min(92vw,28rem)] sm:rounded-md dark:bg-neutral-950 dark:text-neutral-100" style={{ marginBottom: 0, marginTop: "auto" }}>
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="text-sm font-semibold">{titre}</div>
          <button type="button" onClick={() => setOuvert(false)} className="ml-auto min-h-11 min-w-11 rounded-md text-xl" aria-label="Fermer">×</button>
        </div>
        {/* La feuille mobile montre toujours les libellés complets : jamais de repli en icônes seules
            là où l'espace n'est justement pas compté en pixels de barre latérale. */}
        <div className="max-h-[70dvh] overflow-auto p-3">
          <nav aria-label={`Actions — ${titre}`} className="space-y-3">
            {ORDRE.map((groupe) => {
              const items = actions.filter((a) => a.groupe === groupe);
              if (!items.length) return null;
              return (
                <div key={groupe}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{LIBELLES_GROUPES[groupe]}</div>
                  <ul className="space-y-0.5">
                    {items.map((a) => <li key={a.cle}><Action a={a} formAction={formActions[a.cle]} handler={handlers[a.cle]} compact={false} /></li>)}
                  </ul>
                </div>
              );
            })}
          </nav>
        </div>
      </dialog>
    </>
  );
}

function Action({ a, formAction, handler, compact, testId }: { a: ActionContextuelle; formAction?: (formData: FormData) => void | Promise<void>; handler?: () => void; compact: boolean; testId?: string }) {
  const classes = `flex min-h-10 w-full items-center gap-2 rounded px-2 text-sm ${compact ? "justify-center" : "text-left"} ${a.danger ? "text-red-700" : ""} ${a.disponible ? "hover:bg-neutral-100 dark:hover:bg-neutral-800" : "cursor-not-allowed text-neutral-400 dark:text-neutral-600"}`;
  const icone = a.icone && <span aria-hidden="true" className="shrink-0">{a.icone}</span>;
  const raccourci = !compact && a.raccourci ? <span className="ml-auto text-[10px] text-neutral-400">{a.raccourci}</span> : null;
  // Repliée, la barre ne montre que l'icône : le libellé complet reste porté par `aria-label` et `title`
  // (lecteur d'écran et infobulle), jamais seulement par le glyphe décoratif.
  const contenuVisible = compact ? null : <span className="min-w-0 flex-1 truncate">{a.libelle}</span>;
  const titre = compact ? (a.raccourci ? `${a.libelle} (${a.raccourci})` : a.libelle) : a.raccourci;
  const dataTestId = testId ? `${testId}-action-${a.cle}` : undefined;
  if (!a.disponible) {
    return (
      <span role="button" aria-disabled="true" aria-label={a.libelle} tabIndex={0} title={compact ? `${a.libelle} — ${a.motif}` : a.motif} data-testid={dataTestId} className={classes}>
        {icone}{contenuVisible}{raccourci}
        <span className="sr-only"> — {a.motif}</span>
      </span>
    );
  }
  if (a.href) {
    return a.externe
      ? <a href={a.href} target={a.href.startsWith("tel:") || a.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener" aria-label={compact ? a.libelle : undefined} title={titre} data-testid={dataTestId} className={classes}>{icone}{contenuVisible}{raccourci}</a>
      : <Link href={a.href} aria-label={compact ? a.libelle : undefined} title={titre} data-testid={dataTestId} className={classes}>{icone}{contenuVisible}{raccourci}</Link>;
  }
  if (handler) {
    return <button type="button" aria-label={compact ? a.libelle : undefined} title={titre} data-testid={dataTestId} className={classes} onClick={() => { if (!a.confirmation || window.confirm(a.confirmation)) handler(); }}>{icone}{contenuVisible}{raccourci}</button>;
  }
  if (formAction) {
    return (
      <form action={formAction} onSubmit={(e) => { if (a.confirmation && !window.confirm(a.confirmation)) e.preventDefault(); }}>
        <button type="submit" aria-label={compact ? a.libelle : undefined} title={titre} data-testid={dataTestId} className={classes}>{icone}{contenuVisible}{raccourci}</button>
      </form>
    );
  }
  return <span role="button" aria-disabled="true" aria-label={a.libelle} tabIndex={0} title="Action non branchée sur cette page." data-testid={dataTestId} className={classes}>{icone}{contenuVisible}</span>;
}
