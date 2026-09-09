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
  const dernieres = useRef(valeurs);
  dernieres.current = valeurs;

  // Relecture au montage uniquement : réagir aux changements de `valeurs` ferait réapparaître
  // un brouillon que l'utilisateur vient d'écarter.
  useEffect(() => {
    if (!actif || typeof window === "undefined") return;
    setRestaure(lireBrouillon<T>(window.localStorage, identite, formulaire));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage, à dessein (voir ci-dessus)
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
