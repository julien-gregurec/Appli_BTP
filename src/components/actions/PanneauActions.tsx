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
 */
export type ActionsServeur = Record<string, (formData: FormData) => void | Promise<void>>;

const ORDRE: GroupeAction[] = ["creer", "modifier", "transformer", "document", "navigation", "danger"];

export function PanneauActions({ titre, actions, formActions = {}, contexte }: {
  titre: string;
  actions: ActionContextuelle[];
  formActions?: ActionsServeur;
  /** Bref rappel de l'objet (numéro, statut). */
  contexte?: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const feuille = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ouvert) feuille.current?.showModal(); else feuille.current?.close(); }, [ouvert]);
  const disponibles = actions.filter((a) => a.disponible).length;

  const contenu = (
    <nav aria-label={`Actions — ${titre}`} className="space-y-3">
      {ORDRE.map((groupe) => {
        const items = actions.filter((a) => a.groupe === groupe);
        if (!items.length) return null;
        return (
          <div key={groupe}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{LIBELLES_GROUPES[groupe]}</div>
            <ul className="space-y-0.5">
              {items.map((a) => <li key={a.cle}><Action a={a} formAction={formActions[a.cle]} /></li>)}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside data-panneau-actions className="hidden lg:fixed lg:right-4 lg:top-24 lg:z-30 lg:block lg:max-h-[calc(100dvh-7rem)] lg:w-60 lg:overflow-auto lg:rounded-md lg:border lg:border-neutral-200 lg:bg-white lg:p-3 lg:shadow-sm dark:lg:border-neutral-800 dark:lg:bg-neutral-950">
        <div className="mb-2 border-b border-neutral-100 pb-2 dark:border-neutral-800">
          <div className="text-sm font-semibold">{titre}</div>
          {contexte && <div className="text-xs text-neutral-500">{contexte}</div>}
        </div>
        {contenu}
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-neutral-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden dark:border-neutral-800 dark:bg-neutral-950/95" data-panneau-actions-mobile>
        <button type="button" onClick={() => setOuvert(true)} className="min-h-11 flex-1 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-neutral-900" aria-haspopup="dialog">
          Actions ({disponibles})
        </button>
      </div>
      <dialog ref={feuille} onClose={() => setOuvert(false)} aria-label={`Actions — ${titre}`} className="w-screen max-w-none rounded-t-xl p-0 backdrop:bg-black/40 sm:mx-auto sm:w-[min(92vw,28rem)] sm:rounded-md dark:bg-neutral-950 dark:text-neutral-100" style={{ marginBottom: 0, marginTop: "auto" }}>
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="text-sm font-semibold">{titre}</div>
          <button type="button" onClick={() => setOuvert(false)} className="ml-auto min-h-11 min-w-11 rounded-md text-xl" aria-label="Fermer">×</button>
        </div>
        <div className="max-h-[70dvh] overflow-auto p-3">{contenu}</div>
      </dialog>
    </>
  );
}

function Action({ a, formAction }: { a: ActionContextuelle; formAction?: (formData: FormData) => void | Promise<void> }) {
  const classes = `flex min-h-10 w-full items-center gap-2 rounded px-2 text-left text-sm ${a.danger ? "text-red-700" : ""} ${a.disponible ? "hover:bg-neutral-100 dark:hover:bg-neutral-800" : "cursor-not-allowed text-neutral-400 dark:text-neutral-600"}`;
  const raccourci = a.raccourci ? <span className="ml-auto text-[10px] text-neutral-400">{a.raccourci}</span> : null;
  if (!a.disponible) {
    return (
      <span role="button" aria-disabled="true" tabIndex={0} title={a.motif} className={classes}>
        <span>{a.libelle}</span>{raccourci}
        <span className="sr-only"> — {a.motif}</span>
      </span>
    );
  }
  if (a.href) {
    return a.externe
      ? <a href={a.href} target={a.href.startsWith("tel:") || a.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener" title={a.raccourci} className={classes}>{a.libelle}{raccourci}</a>
      : <Link href={a.href} title={a.raccourci} className={classes}>{a.libelle}{raccourci}</Link>;
  }
  if (formAction) {
    return (
      <form action={formAction} onSubmit={(e) => { if (a.confirmation && !window.confirm(a.confirmation)) e.preventDefault(); }}>
        <button type="submit" title={a.raccourci} className={classes}>{a.libelle}{raccourci}</button>
      </form>
    );
  }
  return <span role="button" aria-disabled="true" tabIndex={0} title="Action non branchée sur cette page." className={classes}>{a.libelle}</span>;
}
