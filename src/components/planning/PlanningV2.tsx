"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { enregistrerEvenementAction, supprimerEvenementAction } from "@/app/actions/planning-v2";
import { PanneauActions } from "@/components/actions/PanneauActions";
import { actionsPlanning } from "@/lib/actions-contextuelles/registre";
import type { DonneesPlanningV2 } from "@/lib/planning/serveur";
import {
  ajouterJours, arrondirAuPas, blocsDeVue, changerLigne, couleurDe, deplacer, detecterConflits, dupliquer, heureFr, instant, joursDeVue, jourDe,
  lignesDeVue, minutesDepuisMinuit, redimensionner, salariesDe, STATUTS_EVENEMENT, TYPES_EVENEMENT, VUES,
  type Bloc, type Conflit, type Evenement, type Ligne, type TypeEvenement, type Vue,
} from "@/lib/planning/modele";

/**
 * Planning v2 (GP V1, lot F) — logique Batappli : densité, lecture immédiate, manipulation directe.
 *
 * Vues : jour (lignes = salariés, colonnes = heures), semaine / par salarié / équipe / chantier /
 * ressource (lignes = sujets, colonnes = 7 jours), mois (calendrier), compacte (liste dense).
 * Interactions : glisser un bloc (déplacer dans le temps et entre lignes), étirer sa fin, Alt+glisser
 * duplique, glisser sur une zone vide crée, clic sélectionne (barre latérale), double clic ouvre le
 * détail, ← → ↑ ↓ déplacent la sélection de 15 min / d'une ligne (Ctrl : d'un jour), Suppr retire,
 * Ctrl+D duplique. Conflits calculés en direct (miroir de la base) et affichés sur les blocs.
 */

const HEURE_DEBUT = 6, HEURE_FIN = 21;
const PX_HEURE_DEFAUT = 64;
const HAUTEUR_LIGNE = 56;
const LARGEUR_LIBELLE = 160;
const bouton = "min-h-9 rounded-md border border-neutral-300 px-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900";
const champ = "min-h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

type Glisser = { bloc: Bloc; mode: "deplacer" | "etirer" | "creer"; x0: number; y0: number; alt: boolean; ligneCle: string; jour: string; minutes0: number; deltaMin: number; deltaJours: number; ligneCible: string };

const jourFr = (j: string, long = false) => new Intl.DateTimeFormat("fr-FR", long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${j}T12:00:00`));

export function PlanningV2({ donnees, jour, vue }: { donnees: DonneesPlanningV2; jour: string; vue: Vue }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [evenements, setEvenements] = useState(donnees.evenements);
  const [selection, setSelection] = useState<string | null>(null);
  const [edition, setEdition] = useState<Evenement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pxHeure, setPxHeure] = useState(PX_HEURE_DEFAUT);
  const [filtreType, setFiltreType] = useState<string>("");
  const [filtreChantier, setFiltreChantier] = useState<string>("");
  const [recherche, setRecherche] = useState("");
  // Le glisser vit dans une référence (lue par les gestionnaires, quel que soit le rendu en cours) et
  // dans un état (pour dessiner le bloc fantôme).
  const [glisser, setGlisser] = useState<Glisser | null>(null);
  const glisserRef = useRef<Glisser | null>(null);
  const majGlisser = (g: Glisser | null) => { glisserRef.current = g; setGlisser(g); };
  const grille = useRef<HTMLDivElement>(null);
  const [largeurDispo, setLargeurDispo] = useState(1000);
  useEffect(() => {
    const el = grille.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setLargeurDispo(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, [vue]);
  // Les données du serveur font foi après chaque navigation ; l'état local sert au glisser-déposer optimiste.
  const [recues, setRecues] = useState(donnees.evenements);
  if (donnees.evenements !== recues) { setRecues(donnees.evenements); setEvenements(donnees.evenements); }

  const jours = useMemo(() => joursDeVue(vue, jour), [vue, jour]);
  const genreLignes: Vue = vue === "jour" || vue === "semaine" ? "salarie" : vue;
  const lignes = useMemo(() => lignesDeVue(genreLignes, jours, donnees), [genreLignes, jours, donnees]);
  const visibles = useMemo(() => evenements.filter((e) =>
    (!filtreType || e.type === filtreType) && (!filtreChantier || e.chantierId === filtreChantier)
    && (!recherche.trim() || `${e.titre} ${e.adresse ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(recherche.trim().toLowerCase())),
  ), [evenements, filtreType, filtreChantier, recherche]);
  const blocs = useMemo(() => blocsDeVue(visibles, genreLignes === "mois" || genreLignes === "compacte" ? "compacte" : genreLignes, jours, donnees.equipes, { empiler: vue !== "jour" }), [visibles, genreLignes, jours, donnees.equipes, vue]);
  const conflits = useMemo<Conflit[]>(() => {
    const locaux = detecterConflits(evenements, { equipes: donnees.equipes, disponibilites: donnees.disponibilites });
    const ids = new Set(evenements.map((e) => e.id));
    return [...locaux, ...donnees.conflits.filter((c) => ids.has(c.evenementId) && !locaux.some((l) => l.evenementId === c.evenementId && l.type === c.type && l.sujetId === c.sujetId))];
  }, [evenements, donnees]);
  const conflitsDe = (id: string) => conflits.filter((c) => c.evenementId === id);
  const selectionne = evenements.find((e) => e.id === selection) ?? null;
  const nomSalarie = (id: string) => donnees.salaries.find((s) => s.id === id)?.nom ?? "?";

  const naviguer = (j: string, v: Vue = vue) => router.push(`/planning?jour=${j}&vue=${v}`);
  const pas = vue === "mois" ? 28 : vue === "jour" ? 1 : 7;

  const sauver = useCallback((e: Evenement, o: { optimiste?: boolean } = {}) => {
    setErreur(null);
    if (o.optimiste) setEvenements((liste) => (liste.some((x) => x.id === e.id) ? liste.map((x) => (x.id === e.id ? e : x)) : [...liste, e]));
    demarrer(async () => {
      const r = await enregistrerEvenementAction(e);
      if ("error" in r) { setErreur(r.error); setEvenements(donnees.evenements); return; }
      setEdition(null);
      setSelection(r.id);
      router.refresh();
    });
  }, [donnees.evenements, router]);

  const supprimer = useCallback((id: string) => {
    if (id.startsWith("nouveau:")) { setEvenements((l) => l.filter((x) => x.id !== id)); setSelection(null); return; }
    demarrer(async () => {
      const r = await supprimerEvenementAction(id);
      if ("error" in r) { setErreur(r.error); return; }
      setSelection(null);
      router.refresh();
    });
  }, [router]);

  const nouvelEvenement = (o: Partial<Evenement> = {}): Evenement => ({
    id: `nouveau:${crypto.randomUUID()}`, titre: "", type: "chantier", statut: "planifie", debut: instant(jour, 8 * 60), fin: instant(jour, 12 * 60),
    journeeEntiere: false, couleur: null, chantierId: null, clientId: null, adresse: null, notes: null, affectations: [], ...o,
  });

  // Clavier sur la sélection.
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (!selectionne || edition) return;
      const cible = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") { setSelection(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); if (window.confirm("Supprimer cet évènement du planning ?")) supprimer(selectionne.id); return; }
      if (ctrl && e.key.toLowerCase() === "d") { e.preventDefault(); const d = dupliquer(selectionne, `nouveau:${crypto.randomUUID()}`, 0); setEvenements((l) => [...l, d]); setEdition(d); return; }
      if (!donnees.droits.gerer) return;
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (delta) { e.preventDefault(); sauver(deplacer(selectionne, delta * (ctrl ? 1440 : 15)), { optimiste: true }); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cles = lignes.map((l) => l.cle);
        const actuelle = cles.find((c) => blocs.some((b) => b.evenement.id === selectionne.id && b.ligne === c));
        if (!actuelle) return;
        const i = cles.indexOf(actuelle) + (e.key === "ArrowUp" ? -1 : 1);
        if (i < 0 || i >= cles.length) return;
        sauver(changerLigne(selectionne, actuelle, cles[i]), { optimiste: true });
      }
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [selectionne, edition, donnees.droits.gerer, lignes, blocs, sauver, supprimer]);

  // ── Glisser-déposer (pointeur natif) ─────────────────────────────────────────
  const largeurColonne = () => (vue === "jour" ? pxHeure : Math.max(120, (largeurDispo - LARGEUR_LIBELLE) / jours.length));
  const minutesParPx = () => (vue === "jour" ? 60 / pxHeure : 1440 / largeurColonne());

  const debutGlisser = (e: ReactPointerEvent, bloc: Bloc, mode: Glisser["mode"]) => {
    if (!donnees.droits.gerer || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointeur synthétique */ }
    setSelection(bloc.evenement.id);
    majGlisser({ bloc, mode, x0: e.clientX, y0: e.clientY, alt: e.altKey, ligneCle: bloc.ligne, jour: bloc.jour, minutes0: 0, deltaMin: 0, deltaJours: 0, ligneCible: bloc.ligne });
  };
  const mouvement = (e: ReactPointerEvent) => {
    const g = glisserRef.current;
    if (!g) return;
    const dx = e.clientX - g.x0;
    const deltaMin = vue === "jour" ? arrondirAuPas(dx * minutesParPx()) : 0;
    const deltaJours = vue === "jour" ? 0 : Math.round(dx / largeurColonne());
    const sous = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const ligneCible = sous?.closest<HTMLElement>("[data-ligne]")?.dataset.ligne ?? g.ligneCible;
    majGlisser({ ...g, deltaMin, deltaJours, ligneCible });
  };
  const finGlisser = () => {
    const g = glisserRef.current;
    if (!g) return;
    majGlisser(null);
    const bouge = g.deltaMin !== 0 || g.deltaJours !== 0 || g.ligneCible !== g.ligneCle;
    if (g.mode === "creer") {
      const debutMin = Math.max(0, Math.min(1439, arrondirAuPas(g.minutes0)));
      const finMin = Math.min(1440, Math.max(debutMin + 60, debutMin + Math.abs(g.deltaMin)));
      const ev = nouvelEvenement({ debut: instant(g.jour, debutMin), fin: finMin >= 1440 ? instant(ajouterJours(g.jour, 1), 0) : instant(g.jour, finMin) });
      const avecLigne = changerLigne(ev, g.ligneCle.slice(0, 2), g.ligneCle);
      setEvenements((l) => [...l, avecLigne]); setEdition(avecLigne);
      return;
    }
    if (!bouge) return;
    let ev = g.bloc.evenement;
    if (g.mode === "etirer") { ev = redimensionner(ev, g.bloc.finMin + g.deltaMin); sauver(ev, { optimiste: true }); return; }
    ev = deplacer(ev, g.deltaMin + g.deltaJours * 1440);
    if (g.ligneCible !== g.ligneCle) ev = changerLigne(ev, g.ligneCle, g.ligneCible);
    if (g.alt) { const d = dupliquer(ev, `nouveau:${crypto.randomUUID()}`); setEvenements((l) => [...l, d]); sauver(d); return; }
    sauver(ev, { optimiste: true });
  };
  const creerDepuisZone = (e: ReactPointerEvent, ligneCle: string, jourCible: string) => {
    if (!donnees.droits.gerer || e.button !== 0 || (e.target as HTMLElement).closest("[data-bloc]")) return;
    // L'axe du temps commence après la colonne des libellés, au bord gauche de la rangée.
    const rangee = ((e.currentTarget as HTMLElement).closest("[data-ligne]") as HTMLElement | null)?.getBoundingClientRect();
    const minutes = vue === "jour" && rangee ? HEURE_DEBUT * 60 + (e.clientX - rangee.left - LARGEUR_LIBELLE) * minutesParPx() : 8 * 60;
    const fictif: Bloc = { evenement: nouvelEvenement(), ligne: ligneCle, jour: jourCible, debutMin: minutes, finMin: minutes + 60, colonne: 0, colonnes: 1 };
    majGlisser({ bloc: fictif, mode: "creer", x0: e.clientX, y0: e.clientY, alt: false, ligneCle, jour: jourCible, minutes0: minutes, deltaMin: 0, deltaJours: 0, ligneCible: ligneCle });
  };

  const styleBloc = (b: Bloc): React.CSSProperties => {
    const enGlisser = glisser && glisser.mode !== "creer" && glisser.bloc.evenement.id === b.evenement.id && glisser.bloc.ligne === b.ligne;
    const decalage = enGlisser && glisser.mode === "deplacer" ? glisser.deltaMin : 0;
    const etire = enGlisser && glisser.mode === "etirer" ? glisser.deltaMin : 0;
    if (vue === "jour") {
      const debut = Math.max(HEURE_DEBUT * 60, b.debutMin + decalage);
      const fin = Math.min(HEURE_FIN * 60, b.finMin + decalage + etire);
      const h = Math.max(HAUTEUR_LIGNE, 8 + 24 * b.colonnes);
      return { left: LARGEUR_LIBELLE + ((debut - HEURE_DEBUT * 60) / 60) * pxHeure, width: Math.max(pxHeure / 4, ((fin - debut) / 60) * pxHeure), top: 4 + b.colonne * (h - 8) / b.colonnes, height: (h - 8) / b.colonnes - 2 };
    }
    const i = jours.indexOf(b.jour) + (enGlisser && glisser.mode === "deplacer" ? glisser.deltaJours : 0);
    const l = largeurColonne();
    const h = Math.max(HAUTEUR_LIGNE, 8 + 30 * b.colonnes);
    return { left: LARGEUR_LIBELLE + i * l + 2, width: l - 4, top: 4 + b.colonne * (h - 8) / b.colonnes, height: (h - 8) / b.colonnes - 2 };
  };

  const heures = Array.from({ length: HEURE_FIN - HEURE_DEBUT }, (_, i) => HEURE_DEBUT + i);
  const largeurGrille = vue === "jour" ? LARGEUR_LIBELLE + heures.length * pxHeure : undefined;

  return (
    <div className="space-y-3 lg:pr-72">
      <PanneauActions
        titre="Planning"
        contexte={selectionne ? `${selectionne.titre} · ${jourFr(jourDe(selectionne.debut))}` : "Aucun évènement sélectionné"}
        actions={actionsPlanning(selectionne ? { id: selectionne.id, chantierId: selectionne.chantierId, clientId: selectionne.clientId, statut: selectionne.statut } : null, donnees.permissions)}
        handlers={{
          creer: () => { const ev = nouvelEvenement(); setEvenements((l) => [...l, ev]); setEdition(ev); },
          modifier: () => selectionne && setEdition(selectionne),
          deplacer: () => selectionne && setEdition(selectionne),
          horaire: () => selectionne && setEdition(selectionne),
          affecter: () => selectionne && setEdition(selectionne),
          dupliquer: () => { if (!selectionne) return; const d = dupliquer(selectionne, `nouveau:${crypto.randomUUID()}`); setEvenements((l) => [...l, d]); setEdition(d); },
          supprimer: () => selectionne && supprimer(selectionne.id),
          historique: () => selectionne && router.push(`/planning/historique?evenement=${selectionne.id}`),
        }}
      />

      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Navigation du planning">
        <button type="button" className={bouton} onClick={() => naviguer(ajouterJours(jour, -pas))} aria-label="Précédent">‹</button>
        <button type="button" className={bouton} onClick={() => naviguer(jourDe(new Date()))}>Aujourd’hui</button>
        <button type="button" className={bouton} onClick={() => naviguer(ajouterJours(jour, pas))} aria-label="Suivant">›</button>
        <input type="date" value={jour} onChange={(e) => e.target.value && naviguer(e.target.value)} className={champ} aria-label="Date" />
        <strong className="text-sm">{vue === "mois" ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${jour}T12:00:00`)) : vue === "jour" ? jourFr(jour, true) : `Semaine du ${jourFr(jours[0])} au ${jourFr(jours[jours.length - 1])}`}</strong>
        <div className="ml-auto flex flex-wrap gap-1" role="tablist" aria-label="Vue">
          {VUES.map((v) => <button key={v.cle} type="button" role="tab" aria-selected={vue === v.cle} onClick={() => naviguer(jour, v.cle)} className={`${bouton} ${vue === v.cle ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}>{v.libelle}</button>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un évènement…" className={champ} aria-label="Rechercher" />
        <select value={filtreType} onChange={(e) => setFiltreType(e.target.value)} className={champ} aria-label="Type"><option value="">Tous les types</option>{TYPES_EVENEMENT.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select>
        <select value={filtreChantier} onChange={(e) => setFiltreChantier(e.target.value)} className={champ} aria-label="Chantier"><option value="">Tous les chantiers</option>{donnees.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
        {vue === "jour" && <label className="flex items-center gap-1">Zoom<input type="range" min={32} max={160} value={pxHeure} onChange={(e) => setPxHeure(Number(e.target.value))} aria-label="Zoom temporel" /></label>}
        <a href={`/imprimer/planning?jour=${jour}&vue=${vue}`} target="_blank" rel="noopener" className={bouton}>Imprimer</a>
        <a href={`/api/documents/planning/pdf?jour=${jour}&vue=${vue}`} target="_blank" rel="noopener" className={bouton}>PDF</a>
        <span className="text-xs text-neutral-500" aria-live="polite">{enCours ? "Enregistrement…" : conflits.length ? `${conflits.length} conflit${conflits.length > 1 ? "s" : ""}` : ""}</span>
      </div>
      {erreur && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

      {vue === "mois" ? (
        <div className="grid grid-cols-7 gap-px rounded-md border border-neutral-200 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800" role="grid" aria-label="Mois">
          {jours.map((j) => (
            <div key={j} data-ligne="tous" className={`min-h-24 bg-white p-1 dark:bg-neutral-950 ${j.slice(0, 7) !== jour.slice(0, 7) ? "opacity-50" : ""}`} onDoubleClick={() => { const ev = nouvelEvenement({ debut: instant(j, 480), fin: instant(j, 720) }); setEvenements((l) => [...l, ev]); setEdition(ev); }}>
              <div className="text-[11px] text-neutral-500">{j.slice(8)}</div>
              {blocs.filter((b) => b.jour === j).slice(0, 6).map((b) => (
                <button key={`${b.evenement.id}-${j}`} type="button" data-bloc className={`mb-0.5 block w-full truncate rounded px-1 text-left text-[11px] text-white ${selection === b.evenement.id ? "ring-2 ring-blue-500" : ""}`} style={{ background: couleurDe(b.evenement) }} onClick={() => setSelection(b.evenement.id)} onDoubleClick={() => setEdition(b.evenement)} title={`${heureFr(b.evenement.debut)}–${heureFr(b.evenement.fin)} ${b.evenement.titre}`}>
                  {b.evenement.journeeEntiere ? "" : `${heureFr(b.evenement.debut)} `}{b.evenement.titre}{conflitsDe(b.evenement.id).length ? " ⚠" : ""}
                </button>
              ))}
              {blocs.filter((b) => b.jour === j).length > 6 && <div className="text-[10px] text-neutral-500">+{blocs.filter((b) => b.jour === j).length - 6}</div>}
            </div>
          ))}
        </div>
      ) : vue === "compacte" ? (
        <table className="w-full text-xs">
          <thead className="bg-neutral-50 text-left uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-2 py-1">Jour</th><th className="px-2 py-1">Heures</th><th className="px-2 py-1">Évènement</th><th className="px-2 py-1">Type</th><th className="px-2 py-1">Chantier</th><th className="px-2 py-1">Salariés</th><th className="px-2 py-1">Statut</th><th className="px-2 py-1">Conflits</th></tr></thead>
          <tbody>
            {blocs.sort((a, b) => a.jour.localeCompare(b.jour) || a.debutMin - b.debutMin).map((b) => (
              <tr key={`${b.evenement.id}-${b.jour}`} className={`cursor-pointer border-t border-neutral-100 dark:border-neutral-800 ${selection === b.evenement.id ? "bg-blue-50 dark:bg-neutral-900" : ""}`} onClick={() => setSelection(b.evenement.id)} onDoubleClick={() => setEdition(b.evenement)}>
                <td className="px-2 py-1 whitespace-nowrap">{jourFr(b.jour)}</td>
                <td className="px-2 py-1 whitespace-nowrap tabular-nums">{b.evenement.journeeEntiere ? "Journée" : `${heureFr(b.evenement.debut)}–${heureFr(b.evenement.fin)}`}</td>
                <td className="px-2 py-1"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: couleurDe(b.evenement) }} />{b.evenement.titre}</td>
                <td className="px-2 py-1">{TYPES_EVENEMENT.find((t) => t.cle === b.evenement.type)?.libelle}</td>
                <td className="px-2 py-1">{donnees.chantiers.find((c) => c.id === b.evenement.chantierId)?.nom ?? ""}</td>
                <td className="px-2 py-1">{salariesDe(b.evenement, donnees.equipes).map(nomSalarie).join(", ")}</td>
                <td className="px-2 py-1">{b.evenement.statut}</td>
                <td className="px-2 py-1 text-amber-800">{conflitsDe(b.evenement.id).map((c) => c.detail).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={grille} className="overflow-auto rounded-md border border-neutral-200 dark:border-neutral-800" role="grid" aria-label={`Planning — ${VUES.find((v) => v.cle === vue)?.libelle}`} onPointerMove={mouvement} onPointerUp={finGlisser} onPointerCancel={() => majGlisser(null)}>
          <div style={{ minWidth: largeurGrille }}>
            <div role="row" className="sticky top-0 z-10 flex border-b border-neutral-200 bg-neutral-50 text-[11px] uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              <div role="columnheader" style={{ width: LARGEUR_LIBELLE }} className="shrink-0 px-2 py-1">{genreLignes === "salarie" ? "Salarié" : genreLignes === "equipe" ? "Équipe" : genreLignes === "chantier" ? "Chantier" : "Ressource"}</div>
              {vue === "jour"
                ? heures.map((h) => <div key={h} role="columnheader" style={{ width: pxHeure }} className="shrink-0 border-l border-neutral-100 px-1 py-1 tabular-nums dark:border-neutral-800">{String(h).padStart(2, "0")}:00</div>)
                : jours.map((j) => <div key={j} role="columnheader" style={{ width: largeurColonne() }} className={`shrink-0 border-l border-neutral-100 px-1 py-1 dark:border-neutral-800 ${j === jourDe(new Date()) ? "text-blue-700" : ""}`}>{jourFr(j)}</div>)}
            </div>
            {lignes.map((l) => (
              <LigneGrille key={l.cle} ligne={l} vue={vue} jours={jours} heures={heures} pxHeure={pxHeure} largeurColonne={largeurColonne()} blocs={blocs.filter((b) => b.ligne === l.cle)} selection={selection} conflitsDe={conflitsDe} styleBloc={styleBloc}
                cible={glisser?.ligneCible === l.cle && glisser.ligneCible !== glisser.ligneCle}
                onCreer={creerDepuisZone} onGlisser={debutGlisser} onSelection={setSelection} onOuvrir={(ev) => setEdition(ev)} salaries={donnees.salaries} />
            ))}
          </div>
        </div>
      )}

      {conflits.length > 0 && (
        <section aria-label="Conflits" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <strong>{conflits.length} conflit{conflits.length > 1 ? "s" : ""} à vérifier</strong>
          <ul className="mt-1 list-disc pl-5">
            {conflits.slice(0, 12).map((c, i) => <li key={i}><button type="button" className="underline" onClick={() => setSelection(c.evenementId)}>{evenements.find((e) => e.id === c.evenementId)?.titre ?? "Évènement"}</button> — {c.type === "salarie_double" || c.type === "conge" || c.type === "surcharge" || c.type === "hors_disponibilite" ? `${nomSalarie(c.sujetId)} : ` : ""}{c.detail}</li>)}
          </ul>
        </section>
      )}

      {edition && (
        <EditeurEvenement evenement={edition} donnees={donnees} enCours={enCours} onFermer={() => { if (edition.id.startsWith("nouveau:")) setEvenements((l) => l.filter((x) => x.id !== edition.id)); setEdition(null); }} onSauver={(ev) => sauver(ev)} onSupprimer={() => { supprimer(edition.id); setEdition(null); }} />
      )}
    </div>
  );
}

function LigneGrille({ ligne, vue, jours, heures, pxHeure, largeurColonne, blocs, selection, conflitsDe, styleBloc, cible, onCreer, onGlisser, onSelection, onOuvrir, salaries }: {
  ligne: Ligne; vue: Vue; jours: string[]; heures: number[]; pxHeure: number; largeurColonne: number; blocs: Bloc[]; selection: string | null; conflitsDe: (id: string) => Conflit[];
  styleBloc: (b: Bloc) => React.CSSProperties; cible: boolean;
  onCreer: (e: ReactPointerEvent, ligne: string, jour: string) => void; onGlisser: (e: ReactPointerEvent, b: Bloc, mode: "deplacer" | "etirer") => void; onSelection: (id: string) => void; onOuvrir: (e: Evenement) => void;
  salaries: Array<{ id: string; nom: string }>;
}) {
  const empiles = Math.max(1, ...blocs.map((b) => b.colonnes));
  const hauteur = vue === "jour" ? Math.max(HAUTEUR_LIGNE, 8 + 24 * empiles) : Math.max(HAUTEUR_LIGNE, 8 + 30 * empiles);
  return (
    <div role="row" data-ligne={ligne.cle} className={`relative flex border-b border-neutral-100 dark:border-neutral-800 ${cible ? "bg-blue-50/60 dark:bg-neutral-900" : ""}`} style={{ height: hauteur }}>
      <div role="rowheader" style={{ width: LARGEUR_LIBELLE }} className="sticky left-0 z-[5] shrink-0 truncate border-r border-neutral-100 bg-white px-2 py-1 text-sm font-medium dark:border-neutral-800 dark:bg-neutral-950" title={ligne.libelle}>{ligne.libelle}</div>
      {vue === "jour"
        ? heures.map((h) => <div key={h} role="gridcell" style={{ width: pxHeure }} className="shrink-0 border-l border-neutral-100 dark:border-neutral-800" onPointerDown={(e) => onCreer(e, ligne.cle, jours[0])} />)
        : jours.map((j) => <div key={j} role="gridcell" style={{ width: largeurColonne }} className={`shrink-0 border-l border-neutral-100 dark:border-neutral-800 ${j === jourDe(new Date()) ? "bg-blue-50/30" : ""}`} onPointerDown={(e) => onCreer(e, ligne.cle, j)} />)}
      {blocs.map((b) => {
        const conflits = conflitsDe(b.evenement.id);
        const s = styleBloc(b);
        return (
          <div
            key={`${b.evenement.id}-${b.jour}`}
            data-bloc
            role="button"
            tabIndex={0}
            aria-label={`${b.evenement.titre}, ${heureFr(b.evenement.debut)} à ${heureFr(b.evenement.fin)}${conflits.length ? `, ${conflits.length} conflit` : ""}`}
            title={`${b.evenement.titre}\n${heureFr(b.evenement.debut)}–${heureFr(b.evenement.fin)}${b.evenement.adresse ? `\n${b.evenement.adresse}` : ""}${conflits.length ? `\n⚠ ${conflits.map((c) => c.detail).join(" · ")}` : ""}`}
            onPointerDown={(e) => onGlisser(e, b, "deplacer")}
            onClick={() => onSelection(b.evenement.id)}
            onDoubleClick={() => onOuvrir(b.evenement)}
            onKeyDown={(e) => { if (e.key === "Enter") onOuvrir(b.evenement); }}
            className={`absolute cursor-grab select-none overflow-hidden rounded px-1.5 py-0.5 text-[11px] leading-tight text-white shadow-sm active:cursor-grabbing ${selection === b.evenement.id ? "ring-2 ring-blue-500 ring-offset-1" : ""} ${b.evenement.statut === "termine" ? "opacity-60" : ""}`}
            style={{ ...s, background: couleurDe(b.evenement), borderLeft: conflits.length ? "3px solid #b45309" : undefined }}
          >
            <div className="truncate font-semibold">{b.evenement.journeeEntiere ? "" : `${heureFr(b.evenement.debut)}–${heureFr(b.evenement.fin)} `}{b.evenement.titre}{conflits.length ? " ⚠" : ""}</div>
            {(s.height as number) > 26 && <div className="truncate opacity-90">{[b.evenement.adresse, salariesDe(b.evenement, []).map((id) => salaries.find((x) => x.id === id)?.nom).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>}
            {vue === "jour" && <div role="separator" aria-label="Étirer" onPointerDown={(e) => onGlisser(e, b, "etirer")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" />}
          </div>
        );
      })}
    </div>
  );
}

function EditeurEvenement({ evenement, donnees, enCours, onFermer, onSauver, onSupprimer }: {
  evenement: Evenement; donnees: DonneesPlanningV2; enCours: boolean; onFermer: () => void; onSauver: (e: Evenement) => void; onSupprimer: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [ev, setEv] = useState(evenement);
  useEffect(() => { ref.current?.showModal(); }, []);
  const jour = jourDe(ev.debut);
  const majHeure = (champNom: "debut" | "fin", hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); if (Number.isFinite(h)) setEv({ ...ev, [champNom]: instant(champNom === "fin" && h * 60 + m <= minutesDepuisMinuit(ev.debut) ? ajouterJours(jour, 1) : jour, h * 60 + (m || 0)) }); };
  const majJour = (j: string) => { if (!j) return; const d = minutesDepuisMinuit(ev.debut), f = minutesDepuisMinuit(ev.fin); const memeJour = jourDe(ev.fin) === jour; setEv({ ...ev, debut: instant(j, d), fin: memeJour ? instant(j, f) : instant(ajouterJours(j, 1), f) }); };
  const a = (cle: "employeId" | "equipeId" | "ressourceId", id: string) => ev.affectations.some((x) => x[cle] === id);
  const basculer = (cle: "employeId" | "equipeId" | "ressourceId", id: string) => setEv({ ...ev, affectations: a(cle, id) ? ev.affectations.filter((x) => x[cle] !== id) : [...ev.affectations, { [cle]: id }] });
  const peutAffecter = donnees.droits.affecter;
  return (
    <dialog ref={ref} onClose={onFermer} aria-label="Évènement du planning" className="w-[min(96vw,44rem)] rounded-md border border-neutral-200 p-0 backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
      <form onSubmit={(e) => { e.preventDefault(); onSauver(ev); }} className="flex max-h-[90dvh] flex-col">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-base font-semibold">{evenement.id.startsWith("nouveau:") ? "Nouvel évènement" : "Évènement"}</h2>
          <button type="button" onClick={() => ref.current?.close()} className="ml-auto min-h-11 min-w-11 rounded-md text-xl" aria-label="Fermer">×</button>
        </header>
        <div className="grid flex-1 gap-3 overflow-auto p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Titre<input required value={ev.titre} onChange={(e) => setEv({ ...ev, titre: e.target.value })} className={champ} /></label>
          <label className="flex flex-col gap-1 text-sm">Type<select value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value as TypeEvenement })} className={champ}>{TYPES_EVENEMENT.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm">Statut<select value={ev.statut} onChange={(e) => setEv({ ...ev, statut: e.target.value as Evenement["statut"] })} className={champ}>{STATUTS_EVENEMENT.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm">Jour<input type="date" value={jour} onChange={(e) => majJour(e.target.value)} className={champ} /></label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={ev.journeeEntiere} onChange={(e) => setEv({ ...ev, journeeEntiere: e.target.checked })} />Journée entière</label>
          {!ev.journeeEntiere && <>
            <label className="flex flex-col gap-1 text-sm">Début<input type="time" step={900} value={heureFr(ev.debut)} onChange={(e) => majHeure("debut", e.target.value)} className={champ} /></label>
            <label className="flex flex-col gap-1 text-sm">Fin<input type="time" step={900} value={heureFr(ev.fin)} onChange={(e) => majHeure("fin", e.target.value)} className={champ} /></label>
          </>}
          <label className="flex flex-col gap-1 text-sm">Chantier<select value={ev.chantierId ?? ""} onChange={(e) => { const c = donnees.chantiers.find((x) => x.id === e.target.value); setEv({ ...ev, chantierId: c?.id ?? null, clientId: c?.clientId ?? ev.clientId, adresse: ev.adresse ?? c?.adresse ?? null }); }} className={champ}><option value="">—</option>{donnees.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm">Client<select value={ev.clientId ?? ""} onChange={(e) => setEv({ ...ev, clientId: e.target.value || null })} className={champ}><option value="">—</option>{donnees.clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Adresse<input value={ev.adresse ?? ""} onChange={(e) => setEv({ ...ev, adresse: e.target.value || null })} className={champ} /></label>
          <label className="flex flex-col gap-1 text-sm">Couleur<input type="color" value={ev.couleur ?? couleurDe(ev)} onChange={(e) => setEv({ ...ev, couleur: e.target.value })} className="h-9 w-16" /></label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Notes<textarea rows={2} value={ev.notes ?? ""} onChange={(e) => setEv({ ...ev, notes: e.target.value || null })} className={`${champ} py-1`} /></label>
          <fieldset className="sm:col-span-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800" disabled={!peutAffecter}>
            <legend className="px-1 text-sm font-medium">Affectations {!peutAffecter && <span className="font-normal text-neutral-500">— lecture seule (droit « affecter_ressources »)</span>}</legend>
            <div className="grid gap-2 sm:grid-cols-3 text-sm">
              <div><div className="text-xs text-neutral-500">Salariés</div>{donnees.salaries.filter((s) => s.actif).map((s) => <label key={s.id} className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={a("employeId", s.id)} onChange={() => basculer("employeId", s.id)} />{s.nom}</label>)}</div>
              <div><div className="text-xs text-neutral-500">Équipes</div>{donnees.equipes.map((q) => <label key={q.id} className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={a("equipeId", q.id)} onChange={() => basculer("equipeId", q.id)} />{q.nom} <span className="text-xs text-neutral-500">({q.membres.length})</span></label>)}{donnees.equipes.length === 0 && <p className="text-xs text-neutral-500">Aucune équipe.</p>}</div>
              <div><div className="text-xs text-neutral-500">Ressources</div>{donnees.ressources.filter((r) => r.actif).map((r) => <label key={r.id} className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={a("ressourceId", r.id)} onChange={() => basculer("ressourceId", r.id)} />{r.nom} <span className="text-xs text-neutral-500">({r.type})</span></label>)}{donnees.ressources.length === 0 && <p className="text-xs text-neutral-500">Aucune ressource (véhicule, nacelle, machine).</p>}</div>
            </div>
          </fieldset>
        </div>
        <footer className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
          {!evenement.id.startsWith("nouveau:") && donnees.droits.gerer && <button type="button" onClick={() => { if (window.confirm("Supprimer cet évènement ?")) onSupprimer(); }} className={`${bouton} text-red-700`}>Supprimer</button>}
          <button type="button" onClick={() => ref.current?.close()} className={`${bouton} ml-auto`}>Annuler</button>
          <button type="submit" disabled={!donnees.droits.gerer || enCours} className="min-h-9 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900">Enregistrer</button>
        </footer>
      </form>
    </dialog>
  );
}
