"use client";

import { useEffect, useRef, useState } from "react";
import type { Mutation } from "@/lib/offline/contrat";
import { cycleSuivant, delaiReprise, repriseUtile } from "@/lib/offline/reprise";

/**
 * Boucle de reprise de la file, côté navigateur.
 *
 * Elle remplace le `setInterval(…, 5000)` de la coquille V5 et comble l'absence totale de
 * reprise périodique dans la coquille applicative. Trois propriétés, dans l'ordre où elles
 * comptent sur un chantier :
 *
 *   1. ELLE S'ARRÊTE. Quand plus rien ne peut avancer — file vide, tout synchronisé, ou
 *      seulement des conflits et des abandons définitifs — aucune minuterie n'est armée.
 *      C'est le point le plus important : une sonde réseau toutes les cinq secondes sur un
 *      téléphone posé dans une poche empêche la radio de se rendormir.
 *   2. ELLE S'ESPACE. Chaque tentative sans progression double l'intervalle, jusqu'à un
 *      plafond de cinq minutes, avec un bruit qui évite que toute une équipe ne reparte en
 *      phase en remontant du sous-sol.
 *   3. ELLE SE RÉVEILLE. Un retour à l'écran remet le compteur à zéro et relance
 *      rapidement : c'est le moment où l'utilisateur regarde, et où le réseau vient
 *      souvent de revenir.
 *
 * Une minuterie chaînée (`setTimeout`) et non un intervalle : avec `setInterval`, une
 * tentative plus longue que la période s'empile sur la suivante.
 */
export function useRepriseAutomatique(
  actif: boolean,
  mutations: Mutation[],
  tenter: () => Promise<boolean>,
): void {
  const cycle = useRef(0);
  // La tentative est gardée dans une référence pour que la boucle en cours utilise
  // toujours la version courante de la fonction, sans que son identité (recréée à chaque
  // rendu) ne relance la minuterie — ce qui remettrait la temporisation à zéro en boucle.
  const tenterRef = useRef(tenter);
  useEffect(() => { tenterRef.current = tenter; }, [tenter]);

  const utile = actif && repriseUtile(mutations);
  // Un retour à l'écran est un événement, pas un état : il remonte le compteur de reprise
  // et redémarre l'effet, donc une tentative rapprochée.
  const [reveil, setReveil] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const surVisibilite = () => {
      if (document.visibilityState === "visible") {
        cycle.current = 0;
        setReveil((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => document.removeEventListener("visibilitychange", surVisibilite);
  }, []);

  useEffect(() => {
    if (!utile) {
      // Plus rien à tenter : le prochain travail repartira du délai le plus court.
      cycle.current = 0;
      return;
    }
    let vivant = true;
    let minuterie: ReturnType<typeof setTimeout> | undefined;

    const planifier = () => {
      minuterie = setTimeout(async () => {
        if (!vivant) return;
        // Onglet masqué : on n'émet rien et on prend un cran de recul. Réveiller la radio
        // pour une page que personne ne regarde est le pire usage de la batterie.
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          cycle.current = cycleSuivant(cycle.current, false);
          if (vivant) planifier();
          return;
        }
        let progression = false;
        try {
          progression = await tenterRef.current();
        } catch {
          progression = false;
        }
        if (!vivant) return;
        cycle.current = cycleSuivant(cycle.current, progression);
        planifier();
      }, delaiReprise(cycle.current));
    };

    planifier();
    return () => {
      vivant = false;
      if (minuterie !== undefined) clearTimeout(minuterie);
    };
  }, [utile, reveil]);
}
