"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { effacerBrouillon, enregistrerBrouillon, lireBrouillon } from "@/lib/mobile/brouillon";
import type { IdentiteLocale } from "@/lib/mobile/identite-locale";

/** Délai d'inactivité avant écriture : assez court pour ne rien perdre, assez long pour
 *  ne pas écrire à chaque frappe. */
const REPOS_MS = 600;

/**
 * Conserve la saisie en cours d'un formulaire, et la restitue après une interruption.
 *
 * L'écriture est différée après une pause de frappe, et surtout FORCÉE quand la page passe
 * en arrière-plan (`visibilitychange`). Ce second déclencheur est le seul qui compte
 * vraiment : un système mobile qui évince un onglet ne prévient pas, et `beforeunload` n'est
 * pas fiable sur iOS. `visibilitychange` est le dernier moment garanti pour écrire.
 */
export function useBrouillon<T>(
  identite: IdentiteLocale | null,
  formulaire: string,
  valeurs: T,
  { actif = true }: { actif?: boolean } = {},
): { restaure: T | null; oublier: () => void } {
  const [restaure, setRestaure] = useState<T | null>(null);

  // Les valeurs les plus récentes, lues par les gestionnaires d'événement.
  //
  // La ref est mise à jour DANS un effet, jamais pendant le rendu. Écrire une ref pendant
  // le rendu casse le rendu concurrent : React peut préparer un rendu qu'il abandonne
  // ensuite, et la ref garderait alors des valeurs qui n'ont jamais été affichées.
  const dernieres = useRef(valeurs);
  useEffect(() => { dernieres.current = valeurs; }, [valeurs]);

  /**
   * Relecture du brouillon, au montage uniquement.
   *
   * Réagir aux changements de `valeurs` ferait réapparaître un brouillon que l'utilisateur
   * vient d'écarter.
   *
   * Deux règles sont levées ici, et chacune mérite sa justification plutôt qu'un silence :
   *
   * `set-state-in-effect` — la règle protège des rendus en cascade. Il s'agit ici d'une
   * lecture UNIQUE au montage, dans un stockage que le rendu ne peut pas consulter : le
   * serveur n'a pas de `localStorage`, donc la valeur ne peut ni être calculée au rendu
   * initial, ni figurer dans un initialiseur d'état sans provoquer un écart d'hydratation.
   * L'unique rendu supplémentaire est le prix de la correction.
   *
   * `exhaustive-deps` — les dépendances sont volontairement vides. Les ajouter relirait le
   * brouillon à chaque changement d'identité ou de formulaire, ce qui est précisément le
   * comportement qu'on ne veut pas.
   */
  useEffect(() => {
    if (!actif || typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique au montage, voir ci-dessus
    setRestaure(lireBrouillon<T>(window.localStorage, identite, formulaire));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage seulement, voir ci-dessus
  }, []);

  useEffect(() => {
    if (!actif || typeof window === "undefined") return;
    const minuterie = window.setTimeout(() => {
      enregistrerBrouillon(window.localStorage, identite, formulaire, dernieres.current);
    }, REPOS_MS);
    return () => window.clearTimeout(minuterie);
  }, [actif, identite, formulaire, valeurs]);

  useEffect(() => {
    if (!actif || typeof window === "undefined") return;
    const auMasquage = () => {
      if (document.visibilityState === "hidden") {
        enregistrerBrouillon(window.localStorage, identite, formulaire, dernieres.current);
      }
    };
    document.addEventListener("visibilitychange", auMasquage);
    return () => document.removeEventListener("visibilitychange", auMasquage);
  }, [actif, identite, formulaire]);

  const oublier = useCallback(() => {
    if (typeof window === "undefined") return;
    effacerBrouillon(window.localStorage, identite, formulaire);
    setRestaure(null);
  }, [identite, formulaire]);

  return { restaure, oublier };
}
