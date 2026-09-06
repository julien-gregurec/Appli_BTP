/**
 * Mise a l'abri du travail local avant le rechargement d'une mise a jour PWA.
 *
 * AUCUN module de l'Atelier n'est importe ici, et aucun etat interne n'est touche : le lot
 * PWA-UPDATE-UX n'a pas le droit de modifier l'Atelier, et forcer un flush en atteignant un
 * controleur prive serait exactement ce que l'invariant interdit.
 *
 * On utilise le seul contrat PUBLIC deja en place : l'autosave de l'Atelier
 * (`src/lib/tracing/use-atelier-autosave.ts` et `browserLifecycleBinder`) ecoute `pagehide` sur
 * `window`, y ecrit d'abord le pointeur de brouillon (localStorage, synchrone) puis declenche
 * `flush()` vers IndexedDB. Emettre `pagehide` revient donc a emprunter le chemin deja teste par
 * lequel passent la fermeture d'onglet et la mise en arriere-plan de la PWA.
 *
 * Pourquoi l'emettre AVANT le rechargement plutot que de se contenter du `pagehide` naturel qu'il
 * provoquera : l'ecriture IndexedDB est asynchrone. Emise en amont, elle dispose d'un vrai delai
 * pour aboutir ; emise par la navigation, elle court contre la destruction du document. Le
 * `pagehide` naturel reste de toute facon le filet — et l'ecriture est idempotente : `flush()`
 * sans etat en attente retourne immediatement.
 *
 * Les autres abonnes a ces evenements dans l'application ne font que remesurer ou re-enregistrer
 * un etat deja connu ; aucun ne navigue ni ne detruit quoi que ce soit.
 */

/** Marge laissee a l'ecriture locale declenchee par `pagehide` avant que la page ne parte. */
export const FLUSH_GRACE_MS = 150;

export function flushLocalState(graceMs: number = FLUSH_GRACE_MS): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  try {
    window.dispatchEvent(new Event("pagehide"));
  } catch {
    /* Environnement sans `Event` constructible : le `pagehide` naturel du rechargement suffira. */
  }
  return new Promise((resolve) => { setTimeout(resolve, graceMs); });
}
