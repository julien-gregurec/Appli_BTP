"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { euros, LIGNE_TYPES, UNITES } from "@/lib/devis";
import { rechercherArticlesDevisAction, type ArticleTrouve } from "@/app/actions/devis-v2";
import { colonneModifiable, type Colonne, type DroitsGrille } from "@/lib/devis/colonnes-grille";
import {
  cleElement, deplacerElementVers, dupliquerElement, insererLigne, modifierCoutsLigne, modifierLigneLibre,
  remisesTvaMixte, remplacerLigneParArticle, retirerElement, type EtatElements,
} from "@/lib/devis/editeur-etat";
import { margeLigne } from "@/lib/devis/marge-ligne";
import { MODES_PRESENTATION, type InstanceOuvrage, type ModePresentation } from "@/lib/devis/ouvrages";
import { sousTotauxSections, type ElementDevis, type LigneLibre } from "@/lib/devis/presentation";
import { indicateursPrix, TAUX_TVA_ADMIS } from "@/lib/devis/prix";
import { champModifiable, libelleTypeLigne, typeDe, TYPES_LIGNE_GRILLE, type TypeLigneGrille } from "@/lib/devis/types-ligne";
import { montantLigneHt } from "@/lib/devis/montants";

/**
 * Grille de saisie du devis (GP V1) : une ligne par élément, des cellules validées à la sortie
 * (Tab, Entrée, clic ailleurs), clavier complet, glisser-déposer, recherche d'article depuis la cellule
 * Désignation, colonnes selon droits. Virtualisée au-delà de ~150 lignes.
 *
 * Raccourcis : Tab / Maj+Tab cellules · Entrée valide et descend (crée une ligne en bas) · ↑ ↓ lignes ·
 * Ctrl+D dupliquer · Ctrl+↑ / Ctrl+↓ déplacer · Ctrl+Suppr retirer · Ctrl+C / Ctrl+V copier-coller une
 * ligne · Échap annule la cellule. Annuler / rétablir et Ctrl+K sont tenus par l'éditeur.
 */

export type ActionsGrille = {
  setEtat: (suivant: EtatElements) => void;
  genererCle: () => string;
  ouvrirOuvrage: (instance: InstanceOuvrage | null, apresCle: string | null) => void;
  prixGlobal: (instance: InstanceOuvrage) => void;
};

type Position = { index: number; colonne: string };

const cellule = "h-9 w-full border-0 bg-transparent px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:text-neutral-400";
const nombre = (s: string): number | null => {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const fr = (v: number | null | undefined, decimales = 2) => (v === null || v === undefined ? "" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: decimales }).format(v));

const VIRTUALISATION_AU_DELA = 150;

export function GrilleDevis({ etat, colonnes, droits, seuilTauxMarquePct, actions, ligneCiblee }: {
  etat: EtatElements;
  colonnes: Colonne[];
  droits: DroitsGrille;
  seuilTauxMarquePct: number | null;
  actions: ActionsGrille;
  /** Clé à mettre en avant (clic dans l'aperçu). */
  ligneCiblee: string | null;
}) {
  const tries = useMemo(() => [...etat.elements].sort((a, b) => a.ordre - b.ordre), [etat.elements]);
  const cles = useMemo(() => tries.map(cleElement), [tries]);
  const sousTotaux = useMemo(() => sousTotauxSections(etat.elements), [etat.elements]);
  const tvaMixte = useMemo(() => new Set(remisesTvaMixte(etat)), [etat]);
  const [cible, setCible] = useState<Position | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const pressePapier = useRef<ElementDevis | null>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const editables = useMemo(() => colonnes.filter((c) => c.cle !== "poignee" && c.modifiable !== false).map((c) => c.cle as string), [colonnes]);

  const virtualise = tries.length > VIRTUALISATION_AU_DELA;
  const virtualiseur = useVirtualizer({
    count: tries.length,
    getScrollElement: () => conteneur.current,
    estimateSize: () => 40,
    overscan: 12,
    enabled: virtualise,
  });

  // Résolution du focus : la ligne peut ne pas être rendue (virtualisation) — on la fait venir, puis on cible.
  useEffect(() => {
    if (!cible) return;
    if (virtualise) virtualiseur.scrollToIndex(cible.index, { align: "auto" });
    const t = window.setTimeout(() => {
      const el = conteneur.current?.querySelector<HTMLElement>(`[data-cellule="${cible.index}:${cible.colonne}"]`);
      // Déjà au bon endroit (focus posé de façon synchrone par la navigation) : ne pas resélectionner, une
      // frappe en cours serait écrasée.
      if (el && document.activeElement !== el) { el.focus(); if (el instanceof HTMLInputElement) el.select(); }
    }, virtualise ? 30 : 0);
    return () => window.clearTimeout(t);
  }, [cible, virtualise, virtualiseur]);

  useEffect(() => {
    if (!ligneCiblee) return;
    const i = cles.indexOf(ligneCiblee);
    if (i >= 0) { setActive(ligneCiblee); setCible({ index: i, colonne: "designation" }); }
  }, [ligneCiblee, cles]);

  const capteurs = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const finGlisser = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    actions.setEtat(deplacerElementVers(etat, String(e.active.id), cles.indexOf(String(e.over.id))));
  };

  const nouvelleLigneApres = useCallback((cle: string | null, type: TypeLigneGrille = "libre") => {
    const nouvelle = actions.genererCle();
    actions.setEtat(insererLigne(etat, nouvelle, type, cle));
    const i = cle === null ? tries.length : cles.indexOf(cle) + 1;
    setActive(nouvelle);
    setCible({ index: i, colonne: "designation" });
  }, [actions, etat, tries.length, cles]);

  /** Clavier de la grille : navigation entre cellules et opérations de ligne. */
  const clavier = (e: KeyboardEvent<HTMLDivElement>, index: number, colonne: string) => {
    const element = tries[index];
    const cle = cleElement(element);
    const tag = (e.target as HTMLElement).tagName;
    const ctrl = e.ctrlKey || e.metaKey;
    const col = editables.indexOf(colonne);
    // Focus posé tout de suite quand la cellule est rendue (frappe rapide après Tab) ; l'effet ci-dessus
    // prend le relais quand la ligne doit d'abord être amenée à l'écran (virtualisation).
    const aller = (i: number, c: string) => {
      e.preventDefault();
      setActive(cleElement(tries[i]));
      setCible({ index: i, colonne: c });
      const el = conteneur.current?.querySelector<HTMLElement>(`[data-cellule="${i}:${c}"]`);
      if (el) { el.focus(); if (el instanceof HTMLInputElement) el.select(); }
    };

    if (e.key === "Tab") {
      if (e.shiftKey) {
        if (col > 0) return aller(index, editables[col - 1]);
        if (index > 0) return aller(index - 1, editables[editables.length - 1]);
        return;
      }
      if (col < editables.length - 1) return aller(index, editables[col + 1]);
      if (index < tries.length - 1) return aller(index + 1, editables[0]);
      e.preventDefault();
      return nouvelleLigneApres(cle);
    }
    if (e.key === "Enter" && !e.shiftKey && tag !== "TEXTAREA" && !(e.target as HTMLElement).dataset.recherche) {
      if (index < tries.length - 1) return aller(index + 1, colonne);
      e.preventDefault();
      return nouvelleLigneApres(cle);
    }
    if (ctrl && e.key === "ArrowUp") { e.preventDefault(); if (index > 0) { actions.setEtat(deplacerElementVers(etat, cle, index - 1)); setCible({ index: index - 1, colonne }); } return; }
    if (ctrl && e.key === "ArrowDown") { e.preventDefault(); if (index < tries.length - 1) { actions.setEtat(deplacerElementVers(etat, cle, index + 1)); setCible({ index: index + 1, colonne }); } return; }
    if (e.key === "ArrowUp" && tag !== "SELECT" && tag !== "TEXTAREA" && index > 0) return aller(index - 1, colonne);
    if (e.key === "ArrowDown" && tag !== "SELECT" && tag !== "TEXTAREA" && index < tries.length - 1) return aller(index + 1, colonne);
    if (ctrl && e.key.toLowerCase() === "d") { e.preventDefault(); const n = actions.genererCle(); actions.setEtat(dupliquerElement(etat, cle, n)); setCible({ index: index + 1, colonne }); return; }
    if (ctrl && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      actions.setEtat(retirerElement(etat, cle));
      if (tries.length > 1) setCible({ index: Math.min(index, tries.length - 2), colonne });
      return;
    }
    if (ctrl && e.key.toLowerCase() === "c" && tag !== "INPUT" && tag !== "TEXTAREA") { pressePapier.current = element; return; }
    if (ctrl && e.key.toLowerCase() === "v" && pressePapier.current && tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      const copie = pressePapier.current;
      const n = actions.genererCle();
      const colle = copie.type === "ligne"
        ? insererLigne({ ...etat, origines: { ...etat.origines, [n]: etat.origines[copie.ligne.cle] ?? { origine: "saisie" } } }, n, typeDe(copie.ligne), cle, { ...copie.ligne, cle: n })
        : deplacerElementVers(dupliquerElement(etat, copie.instance.cle, n), n, index + 1);
      actions.setEtat(colle);
      setCible({ index: index + 1, colonne });
      return;
    }
  };

  const rendreLigne = (element: ElementDevis, index: number, mesurer?: (el: HTMLElement | null) => void) => (
    <LigneSortable key={cleElement(element)} id={cleElement(element)} mesurer={mesurer} index={index} active={active === cleElement(element)}>
      {(poignee) => element.type === "ligne" ? (
        <LigneGrille
          index={index}
          ligne={element.ligne}
          origine={etat.origines[element.ligne.cle]}
          colonnes={colonnes}
          droits={droits}
          poignee={poignee}
          sousTotal={sousTotaux.get(element.ligne.cle) ?? null}
          tvaMixte={tvaMixte.has(element.ligne.cle)}
          onFocus={() => setActive(element.ligne.cle)}
          onKeyDown={(e, colonne) => clavier(e, index, colonne)}
          onChange={(patch) => actions.setEtat(modifierLigneLibre(etat, element.ligne.cle, patch))}
          onCouts={(c, prix) => { const e1 = modifierCoutsLigne(etat, element.ligne.cle, c); actions.setEtat(prix ? modifierLigneLibre(e1, element.ligne.cle, prix) : e1); }}
          onArticle={(a) => actions.setEtat(remplacerLigneParArticle(etat, element.ligne.cle, a))}
          onOuvrage={() => actions.ouvrirOuvrage(null, element.ligne.cle)}
          onRetirer={() => actions.setEtat(retirerElement(etat, element.ligne.cle))}
        />
      ) : (
        <LigneOuvrageGrille
          index={index}
          instance={element.instance}
          colonnes={colonnes}
          droits={droits}
          seuilTauxMarquePct={seuilTauxMarquePct}
          poignee={poignee}
          onFocus={() => setActive(element.instance.cle)}
          onKeyDown={(e, colonne) => clavier(e, index, colonne)}
          onChange={(instance) => actions.setEtat({ elements: etat.elements.map((x) => (x.type === "ouvrage" && x.instance.cle === instance.cle ? { ...x, instance } : x)), origines: etat.origines })}
          onModifier={() => actions.ouvrirOuvrage(element.instance, null)}
          onPrix={() => actions.prixGlobal(element.instance)}
          onRetirer={() => actions.setEtat(retirerElement(etat, element.instance.cle))}
        />
      )}
    </LigneSortable>
  );

  const largeur = colonnes.reduce((s, c) => s + c.largeurPx, 0);
  const grilleTemplate = colonnes.map((c) => `${c.largeurPx}px`).join(" ");

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
      <div ref={conteneur} className={`overflow-auto ${virtualise ? "max-h-[70dvh]" : ""}`} role="grid" aria-label="Lignes du devis" aria-rowcount={tries.length}>
        <div style={{ minWidth: largeur, ["--grille" as string]: grilleTemplate }}>
          <div role="row" className="sticky top-0 z-10 grid border-b border-neutral-200 bg-neutral-50 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900" style={{ gridTemplateColumns: grilleTemplate }}>
            {colonnes.map((c) => (
              <div key={c.cle} role="columnheader" title={c.libelle} className={`truncate px-2 py-2 ${c.alignement === "droite" ? "text-right" : c.alignement === "centre" ? "text-center" : ""}`}>{c.court}</div>
            ))}
          </div>
          <DndContext sensors={capteurs} collisionDetection={closestCenter} onDragEnd={finGlisser}>
            <SortableContext items={cles} strategy={verticalListSortingStrategy}>
              {tries.length === 0 && (
                <div className="p-4 text-sm text-neutral-500">
                  Aucune ligne. <button type="button" className="underline" onClick={() => nouvelleLigneApres(null)}>Ajouter une ligne</button> (ou Entrée dans la grille, Ctrl+K pour le catalogue).
                </div>
              )}
              {virtualise ? (
                <div style={{ height: virtualiseur.getTotalSize(), position: "relative" }}>
                  {virtualiseur.getVirtualItems().map((v) => (
                    <div key={cles[v.index]} data-index={v.index} ref={virtualiseur.measureElement} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}>
                      {rendreLigne(tries[v.index], v.index)}
                    </div>
                  ))}
                </div>
              ) : tries.map((el, i) => rendreLigne(el, i))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-800">
        <button type="button" className="min-h-9 rounded px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => nouvelleLigneApres(active)} title="Entrée sur la dernière ligne">+ Ligne</button>
        <span aria-hidden="true">·</span>
        <span>{tries.length} ligne{tries.length > 1 ? "s" : ""}{virtualise ? " · affichage virtualisé" : ""}</span>
      </div>
    </div>
  );
}

// ── Ligne triable (glisser-déposer) ────────────────────────────────────────────

function LigneSortable({ id, index, active, mesurer, children }: { id: string; index: number; active: boolean; mesurer?: (el: HTMLElement | null) => void; children: (poignee: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const poignee = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      data-cellule={`${index}:poignee`}
      className="flex h-9 w-full cursor-grab items-center justify-center text-neutral-400 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 active:cursor-grabbing"
      aria-label={`Déplacer la ligne ${index + 1}`}
      title="Glisser pour déplacer · Espace puis flèches au clavier"
    >
      ⋮⋮
    </button>
  );
  return (
    <div
      ref={(el) => { setNodeRef(el); mesurer?.(el); }}
      role="row"
      aria-rowindex={index + 1}
      aria-selected={active}
      data-index={index}
      style={{ transform: CSS.Transform.toString(transform), transition, gridTemplateColumns: "var(--grille)" }}
      className={`grid border-b border-neutral-100 dark:border-neutral-800 ${isDragging ? "z-20 bg-blue-50 shadow-lg dark:bg-neutral-800" : active ? "bg-blue-50/60 dark:bg-neutral-900" : "hover:bg-neutral-50/70 dark:hover:bg-neutral-900/50"}`}
    >
      {children(poignee)}
    </div>
  );
}

// ── Cellules ───────────────────────────────────────────────────────────────────

/** Champ texte ou nombre validé à la sortie (blur, Entrée, Tab) ; Échap restaure. */
function Cellule({ valeur, onCommit, index, colonne, disabled, alignement, onKeyDown, onFocus, format, aria }: {
  valeur: string;
  onCommit: (v: string) => void;
  index: number;
  colonne: string;
  disabled?: boolean;
  alignement?: "gauche" | "droite" | "centre";
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, colonne: string) => void;
  onFocus: () => void;
  format?: "nombre";
  aria: string;
}) {
  const [brouillon, setBrouillon] = useState(valeur);
  const [edition, setEdition] = useState(false);
  // Rien tapé depuis l'entrée dans la cellule : un brouillon intact ne doit jamais écraser une valeur qui
  // vient de changer (coefficient appliqué, annulation…). Le brouillon suit la valeur reçue, pendant le rendu.
  const [saisi, setSaisi] = useState(false);
  const [recue, setRecue] = useState(valeur);
  if (valeur !== recue) { setRecue(valeur); if (!edition || !saisi) setBrouillon(valeur); }
  const commettre = () => { setEdition(false); setSaisi(false); if (saisi && brouillon !== valeur) onCommit(brouillon); };
  return (
    <div role="gridcell" className="min-w-0" onKeyDown={(e) => { if (e.key === "Escape") { setBrouillon(valeur); setEdition(false); return; } if (e.key === "Enter" || e.key === "Tab") commettre(); onKeyDown(e, colonne); }}>
      <input
        data-cellule={`${index}:${colonne}`}
        aria-label={aria}
        value={brouillon}
        disabled={disabled}
        inputMode={format === "nombre" ? "decimal" : undefined}
        onFocus={() => { setEdition(true); setSaisi(false); onFocus(); }}
        onChange={(e) => { setSaisi(true); setBrouillon(e.target.value); }}
        onBlur={commettre}
        className={`${cellule} ${alignement === "droite" ? "text-right" : ""}`}
      />
    </div>
  );
}

function CelluleChoix({ valeur, options, onChange, index, colonne, disabled, onKeyDown, onFocus, aria }: {
  valeur: string; options: Array<{ v: string; l: string }>; onChange: (v: string) => void; index: number; colonne: string; disabled?: boolean;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, colonne: string) => void; onFocus: () => void; aria: string;
}) {
  return (
    <div role="gridcell" className="min-w-0" onKeyDown={(e) => onKeyDown(e, colonne)}>
      <select data-cellule={`${index}:${colonne}`} aria-label={aria} value={valeur} disabled={disabled} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} className={cellule}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function CelluleLecture({ children, alignement, titre }: { children?: ReactNode; alignement?: "gauche" | "droite" | "centre"; titre?: string }) {
  return <div role="gridcell" title={titre} className={`flex h-9 min-w-0 items-center truncate px-2 text-sm tabular-nums text-neutral-700 dark:text-neutral-300 ${alignement === "droite" ? "justify-end" : ""}`}>{children}</div>;
}

// ── Recherche d'article depuis la cellule Désignation ──────────────────────────

function CelluleDesignation({ ligne, origine, index, colonne, onCommit, onArticle, onOuvrage, onKeyDown, onFocus, disabled }: {
  ligne: LigneLibre; origine: EtatElements["origines"][string] | undefined; index: number; colonne: string;
  onCommit: (v: string) => void; onArticle: (a: ArticleTrouve) => void; onOuvrage: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, colonne: string) => void; onFocus: () => void; disabled?: boolean;
}) {
  const [brouillon, setBrouillon] = useState(ligne.designation);
  const [edition, setEdition] = useState(false);
  const [resultats, setResultats] = useState<ArticleTrouve[]>([]);
  const [surligne, setSurligne] = useState(-1);
  const sequence = useRef(0);
  const rechercheActive = typeDe(ligne) === "libre" && !origine?.sourceId;
  const [saisi, setSaisi] = useState(false);
  const [recue, setRecue] = useState(ligne.designation);
  if (ligne.designation !== recue) { setRecue(ligne.designation); if (!edition || !saisi) setBrouillon(ligne.designation); }
  const texteRecherche = edition && rechercheActive ? brouillon.trim() : "";
  const listeId = `recherche-${ligne.cle}`;

  // Recherche différée depuis la cellule ; une réponse dépassée par une frappe plus récente est ignorée.
  useEffect(() => {
    if (texteRecherche.length < 2) return;
    const n = ++sequence.current;
    const t = window.setTimeout(async () => {
      const r = await rechercherArticlesDevisAction(texteRecherche);
      if (n !== sequence.current) return;
      setResultats("articles" in r ? r.articles.slice(0, 8) : []);
      setSurligne(-1);
    }, 200);
    return () => window.clearTimeout(t);
  }, [texteRecherche]);

  const commettre = () => { setEdition(false); setResultats([]); setSaisi(false); if (saisi && brouillon !== ligne.designation) onCommit(brouillon); };
  const choisir = (a: ArticleTrouve) => { setEdition(false); setResultats([]); setSaisi(false); onArticle(a); };
  const ouverte = texteRecherche.length >= 2 && resultats.length > 0;

  return (
    <div
      role="gridcell"
      className="relative min-w-0"
      onKeyDown={(e) => {
        if (ouverte) {
          if (e.key === "ArrowDown") { e.preventDefault(); setSurligne((s) => Math.min(resultats.length - 1, s + 1)); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); setSurligne((s) => Math.max(-1, s - 1)); return; }
          if (e.key === "Enter" && surligne >= 0) { e.preventDefault(); choisir(resultats[surligne]); return; }
          if (e.key === "Escape") { e.preventDefault(); setResultats([]); return; }
        }
        if (e.key === "Escape") { setBrouillon(ligne.designation); setEdition(false); return; }
        if (e.key === "Enter" || e.key === "Tab") commettre();
        onKeyDown(e, colonne);
      }}
    >
      <input
        data-cellule={`${index}:${colonne}`}
        data-recherche={ouverte ? "1" : undefined}
        aria-label="Désignation"
        role="combobox"
        aria-expanded={ouverte}
        aria-controls={listeId}
        aria-autocomplete="list"
        value={brouillon}
        disabled={disabled}
        placeholder={rechercheActive ? "Désignation ou référence…" : ""}
        onFocus={() => { setEdition(true); setSaisi(false); onFocus(); }}
        onChange={(e) => { setSaisi(true); setBrouillon(e.target.value); }}
        onBlur={() => window.setTimeout(commettre, 120)}
        className={`${cellule} ${typeDe(ligne) === "titre" ? "font-semibold" : typeDe(ligne) === "sous_titre" ? "font-medium" : typeDe(ligne) === "commentaire" ? "italic" : ""}`}
      />
      {ouverte && (
        <ul id={listeId} role="listbox" className="absolute left-0 top-full z-30 max-h-72 w-[28rem] max-w-[80vw] overflow-auto rounded-md border border-neutral-200 bg-white text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {resultats.map((a, i) => (
            <li key={a.id} role="option" aria-selected={i === surligne} onMouseDown={(e) => { e.preventDefault(); choisir(a); }} onMouseEnter={() => setSurligne(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === surligne ? "bg-blue-50 dark:bg-neutral-800" : ""}`}>
              <span className="font-mono text-xs">{a.referenceInterne ?? "—"}</span> <span className="font-medium">{a.designation}</span>
              <span className="float-right tabular-nums">{euros(a.prixVenteHt)}/{a.unite}</span>
              {a.famille && <div className="text-xs text-neutral-500">{a.famille}</div>}
            </li>
          ))}
          <li role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); onOuvrage(); }} className="cursor-pointer border-t px-3 py-1.5 text-neutral-600 dark:border-neutral-700">
            Insérer un ouvrage composé…
          </li>
        </ul>
      )}
    </div>
  );
}

// ── Ligne libre ────────────────────────────────────────────────────────────────

const LigneGrille = memo(function LigneGrille({ index, ligne, origine, colonnes, droits, poignee, sousTotal, tvaMixte, onFocus, onKeyDown, onChange, onCouts, onArticle, onOuvrage, onRetirer }: {
  index: number; ligne: LigneLibre; origine: EtatElements["origines"][string] | undefined; colonnes: Colonne[]; droits: DroitsGrille; poignee: ReactNode;
  sousTotal: number | null; tvaMixte: boolean; onFocus: () => void; onKeyDown: (e: KeyboardEvent<HTMLDivElement>, colonne: string) => void;
  onChange: (patch: Partial<Omit<LigneLibre, "cle">>) => void;
  /** Coûts, et éventuel prix de vente dérivé, appliqués en UNE modification. */
  onCouts: (c: { prixAchatHt?: number | null; coutMainOeuvreHt?: number | null; coefficient?: number | null }, prix?: Partial<Omit<LigneLibre, "cle">>) => void;
  onArticle: (a: ArticleTrouve) => void; onOuvrage: () => void; onRetirer: () => void;
}) {
  const type = typeDe(ligne);
  const marge = margeLigne(ligne, origine);
  const totalHt = type === "sous_total" ? sousTotal : (type === "article" || type === "libre" || type === "remise") ? montantLigneHt(ligne) : null;
  const peut = (c: Colonne, champ: Parameters<typeof champModifiable>[1]) => colonneModifiable(c, droits) && champModifiable(type, champ);
  const commun = { index, onKeyDown, onFocus };

  return (
    <>
      {colonnes.map((c) => {
        switch (c.cle) {
          case "poignee": return <div key={c.cle} role="gridcell">{poignee}</div>;
          case "type": return <CelluleChoix key={c.cle} {...commun} colonne="type" aria="Type de ligne" valeur={type} onChange={(v) => onChange({ typeLigne: v as TypeLigneGrille })} options={TYPES_LIGNE_GRILLE.map((t) => ({ v: t.cle, l: t.court }))} />;
          case "reference": return <CelluleLecture key={c.cle} titre={origine?.referenceInterne ?? undefined}><span className="font-mono text-xs">{origine?.referenceInterne ?? ""}</span></CelluleLecture>;
          case "designation":
            if (!champModifiable(type, "designation")) return <CelluleLecture key={c.cle}><span className="text-xs uppercase tracking-wide text-neutral-400">{libelleTypeLigne(type)}</span></CelluleLecture>;
            return <CelluleDesignation key={c.cle} {...commun} colonne="designation" ligne={ligne} origine={origine} onCommit={(v) => onChange({ designation: v })} onArticle={onArticle} onOuvrage={onOuvrage} />;
          case "description": return <Cellule key={c.cle} {...commun} colonne="description" aria="Description" valeur={ligne.description ?? ""} disabled={!champModifiable(type, "description")} onCommit={(v) => onChange({ description: v || null })} />;
          case "reference_fabricant": return <CelluleLecture key={c.cle}><span className="font-mono text-xs">{origine?.referenceFabricant ?? ""}</span></CelluleLecture>;
          case "code_fournisseur": return <CelluleLecture key={c.cle}><span className="font-mono text-xs">{origine?.codeFournisseur ?? ""}</span></CelluleLecture>;
          case "famille": return <CelluleLecture key={c.cle} titre={origine?.famille ?? undefined}>{origine?.famille ?? ""}</CelluleLecture>;
          case "fournisseur": return <CelluleLecture key={c.cle}>{origine?.fournisseur ?? ""}</CelluleLecture>;
          case "quantite": return <Cellule key={c.cle} {...commun} colonne="quantite" aria="Quantité" format="nombre" alignement="droite" valeur={champModifiable(type, "quantite") ? fr(ligne.quantite, 3) : ""} disabled={!peut(c, "quantite")} onCommit={(v) => { const n = nombre(v); if (n !== null) onChange({ quantite: n }); }} />;
          case "unite": return <Cellule key={c.cle} {...commun} colonne="unite" aria="Unité" valeur={champModifiable(type, "unite") ? ligne.unite : ""} disabled={!peut(c, "unite")} onCommit={(v) => onChange({ unite: v || "u" })} />;
          case "prix_achat": return <Cellule key={c.cle} {...commun} colonne="prix_achat" aria="Prix d’achat HT" format="nombre" alignement="droite" valeur={type === "article" || type === "libre" ? fr(origine?.prixAchatHt ?? null, 4) : ""} disabled={!colonneModifiable(c, droits) || !(type === "article" || type === "libre")} onCommit={(v) => onCouts({ prixAchatHt: nombre(v) })} />;
          case "cout_mo": return <Cellule key={c.cle} {...commun} colonne="cout_mo" aria="Coût main-d’œuvre HT" format="nombre" alignement="droite" valeur={type === "article" || type === "libre" ? fr(origine?.coutMainOeuvreHt ?? null, 4) : ""} disabled={!colonneModifiable(c, droits) || !(type === "article" || type === "libre")} onCommit={(v) => onCouts({ coutMainOeuvreHt: nombre(v) })} />;
          case "coefficient": return <Cellule key={c.cle} {...commun} colonne="coefficient" aria="Coefficient" format="nombre" alignement="droite" valeur={type === "article" || type === "libre" ? fr(origine?.coefficient ?? null, 4) : ""} disabled={!colonneModifiable(c, droits) || !(type === "article" || type === "libre")} onCommit={(v) => { const k = nombre(v); const achat = origine?.prixAchatHt; onCouts({ coefficient: k }, k !== null && achat !== null && achat !== undefined ? { prixUnitaireHt: Math.round((achat + (origine?.coutMainOeuvreHt ?? 0)) * k * 100) / 100 } : undefined); }} />;
          case "marge": return <CelluleLecture key={c.cle} alignement="droite"><span className={marge.margeHt !== null && marge.margeHt < 0 ? "text-red-700" : ""}>{marge.margeHt === null ? "" : euros(marge.margeHt)}</span></CelluleLecture>;
          case "marge_pct": return <CelluleLecture key={c.cle} alignement="droite">{marge.tauxMarquePct === null ? "" : `${fr(marge.tauxMarquePct, 1)} %`}</CelluleLecture>;
          case "prix_vente":
            if (type === "remise") {
              return (
                <div key={c.cle} role="gridcell" className="flex min-w-0 items-center" title={tvaMixte ? "Section à plusieurs taux de TVA : indiquez le taux de la remise" : undefined}>
                  <input data-cellule={`${index}:prix_vente`} aria-label="Remise (% de la section ou montant)" inputMode="decimal" disabled={!peut(c, "prixUnitaireHt")}
                    defaultValue={ligne.remiseSectionPct !== null && ligne.remiseSectionPct !== undefined ? `${fr(ligne.remiseSectionPct, 2)} %` : fr(ligne.prixUnitaireHt, 2)}
                    key={`${ligne.remiseSectionPct}|${ligne.prixUnitaireHt}`}
                    onFocus={onFocus}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") (e.target as HTMLInputElement).blur(); onKeyDown(e as unknown as KeyboardEvent<HTMLDivElement>, "prix_vente"); }}
                    onBlur={(e) => { const t = e.target.value.trim(); if (t.endsWith("%")) { const p = nombre(t.slice(0, -1)); if (p !== null) onChange({ remiseSectionPct: Math.max(0, Math.min(100, p)) }); } else { const m = nombre(t); if (m !== null) onChange({ remiseSectionPct: null, prixUnitaireHt: -Math.abs(m) }); } }}
                    className={`${cellule} text-right ${tvaMixte ? "ring-1 ring-amber-500" : ""}`} />
                </div>
              );
            }
            return <Cellule key={c.cle} {...commun} colonne="prix_vente" aria="Prix de vente unitaire HT" format="nombre" alignement="droite" valeur={champModifiable(type, "prixUnitaireHt") ? fr(ligne.prixUnitaireHt, 4) : ""} disabled={!peut(c, "prixUnitaireHt")} onCommit={(v) => { const n = nombre(v); if (n !== null) onChange({ prixUnitaireHt: n }); }} />;
          case "remise": return <Cellule key={c.cle} {...commun} colonne="remise" aria="Remise de ligne (%)" format="nombre" alignement="droite" valeur={champModifiable(type, "remiseLignePct") ? fr(ligne.remiseLignePct, 2) : ""} disabled={!peut(c, "remiseLignePct")} onCommit={(v) => { const n = nombre(v); if (n !== null) onChange({ remiseLignePct: Math.max(0, Math.min(100, n)) }); }} />;
          case "tva": return champModifiable(type, "tauxTva")
            ? <CelluleChoix key={c.cle} {...commun} colonne="tva" aria="TVA" valeur={String(ligne.tauxTva)} onChange={(v) => onChange({ tauxTva: Number(v) })} options={[...new Set([...TAUX_TVA_ADMIS, ligne.tauxTva])].map((t) => ({ v: String(t), l: `${t} %` }))} />
            : <CelluleLecture key={c.cle} />;
          case "total_ht": return <CelluleLecture key={c.cle} alignement="droite"><span className={type === "sous_total" ? "font-semibold" : ""}>{totalHt === null ? "" : euros(totalHt)}</span></CelluleLecture>;
          case "commentaire_interne": return <Cellule key={c.cle} {...commun} colonne="commentaire_interne" aria="Commentaire interne" valeur={ligne.commentaireInterne ?? ""} disabled={!champModifiable(type, "commentaireInterne")} onCommit={(v) => onChange({ commentaireInterne: v || null })} />;
          default: return <CelluleLecture key={c.cle} />;
        }
      })}
      <span className="sr-only"><button type="button" onClick={onRetirer}>Retirer la ligne {index + 1}</button></span>
    </>
  );
});

// ── Ligne ouvrage ──────────────────────────────────────────────────────────────

const LigneOuvrageGrille = memo(function LigneOuvrageGrille({ index, instance, colonnes, droits, seuilTauxMarquePct, poignee, onFocus, onKeyDown, onChange, onModifier, onPrix, onRetirer }: {
  index: number; instance: InstanceOuvrage; colonnes: Colonne[]; droits: DroitsGrille; seuilTauxMarquePct: number | null; poignee: ReactNode;
  onFocus: () => void; onKeyDown: (e: KeyboardEvent<HTMLDivElement>, colonne: string) => void; onChange: (i: InstanceOuvrage) => void; onModifier: () => void; onPrix: () => void; onRetirer: () => void;
}) {
  void seuilTauxMarquePct;
  const ind = indicateursPrix(instance);
  const [deplie, setDeplie] = useState(false);
  const commun = { index, onKeyDown, onFocus };
  const largeur = colonnes.map((c) => `${c.largeurPx}px`).join(" ");
  return (
    <>
      {colonnes.map((c) => {
        switch (c.cle) {
          case "poignee": return <div key={c.cle} role="gridcell">{poignee}</div>;
          case "type": return <CelluleLecture key={c.cle}><button type="button" className="text-xs underline" onClick={() => setDeplie((d) => !d)} aria-expanded={deplie}>Ouvrage {deplie ? "▾" : "▸"}</button></CelluleLecture>;
          case "reference": return <CelluleLecture key={c.cle}><span className="font-mono text-xs">{instance.referenceInterne ?? ""} v{instance.version}</span></CelluleLecture>;
          case "designation": return <Cellule key={c.cle} {...commun} colonne="designation" aria="Libellé pour le client" valeur={instance.libelleClient} onCommit={(v) => onChange({ ...instance, libelleClient: v })} />;
          case "quantite": return <CelluleLecture key={c.cle} alignement="droite">{fr(instance.quantitePrincipale, 3)}</CelluleLecture>;
          case "unite": return <CelluleLecture key={c.cle}>{instance.unitePrincipale}</CelluleLecture>;
          case "prix_achat": return <CelluleLecture key={c.cle} alignement="droite">{ind.coutAchatHt === null ? "incomplet" : euros(ind.coutAchatHt)}</CelluleLecture>;
          case "marge": return <CelluleLecture key={c.cle} alignement="droite">{ind.margeHt === null ? "" : euros(ind.margeHt)}</CelluleLecture>;
          case "marge_pct": return <CelluleLecture key={c.cle} alignement="droite">{ind.tauxMarquePct === null ? "" : `${fr(ind.tauxMarquePct, 1)} %`}</CelluleLecture>;
          case "prix_vente": return <CelluleLecture key={c.cle} alignement="droite"><button type="button" className="underline" onClick={onPrix} title="Prix global de l’ouvrage">{euros(instance.quantitePrincipale ? ind.prixVenteRetenuHt / instance.quantitePrincipale : ind.prixVenteRetenuHt)}</button></CelluleLecture>;
          case "tva": return <CelluleChoix key={c.cle} {...commun} colonne="tva" aria="Présentation client" valeur={instance.mode} onChange={(v) => onChange({ ...instance, mode: v as ModePresentation })} options={MODES_PRESENTATION.map((m) => ({ v: m.cle, l: m.libelle }))} />;
          case "total_ht": return <CelluleLecture key={c.cle} alignement="droite"><span className="font-medium">{euros(ind.prixVenteRetenuHt)}</span></CelluleLecture>;
          case "commentaire_interne": return <CelluleLecture key={c.cle}><button type="button" className="text-xs underline" onClick={onModifier}>Modifier l’ouvrage</button></CelluleLecture>;
          default: return <CelluleLecture key={c.cle} />;
        }
      })}
      {deplie && (
        <div role="row" className="col-span-full bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-900" style={{ gridColumn: `1 / span ${colonnes.length}`, ["--grille" as string]: largeur }}>
          <ul className="space-y-0.5">
            {instance.lignes.map((l) => (
              <li key={l.cle} className="flex justify-between gap-2">
                <span>{l.designation}{!l.visibleClient ? " (interne)" : ""}</span>
                <span className="tabular-nums">{fr(l.quantite, 3)} {l.unite} × {euros(l.prixVenteHt)}{droits.voirCouts && l.prixAchatHt !== null ? ` · achat ${euros(l.prixAchatHt)}` : ""}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-3">
            <button type="button" className="underline" onClick={onModifier}>Modifier l’ouvrage</button>
            <button type="button" className="underline" onClick={onPrix}>Prix global…</button>
            <button type="button" className="text-red-700 underline" onClick={onRetirer}>Retirer</button>
          </div>
        </div>
      )}
    </>
  );
});

export const LIBELLES_LIGNE_TYPE = LIGNE_TYPES;
export const UNITES_GRILLE = UNITES;
