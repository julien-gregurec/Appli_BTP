"use client";

import { useEffect } from "react";

/**
 * Marque `<body data-ui-dense="1">` tant que le composant appelant est monté (et `actif`).
 *
 * Sert une seule chose : sur mobile, les bulles flottantes (Aide, Assistant IA) s'effacent tant qu'une
 * zone d'édition dense est ouverte — éditeur de devis, éditeur de facture, planning, réglages à formulaire
 * dense (§ « Polish UX » de Julien, 2026-09-14) — pour ne jamais recouvrir un champ, une barre d'outils ou
 * une action principale. L'aide reste accessible autrement : menu (« Guide d'utilisation »), Ctrl+K puis
 * « Aide », ou en refermant la zone dense.
 *
 * Compteur partagé plutôt qu'un simple booléen : un dialogue dense peut s'ouvrir par-dessus un autre écran
 * dense (ex. la fiche « + Chantier » depuis l'éditeur de devis) — le premier à se démonter ne doit pas
 * réafficher les bulles tant que le second reste monté.
 */
let compteur = 0;

export function useZoneDense(actif = true) {
  useEffect(() => {
    if (!actif) return;
    compteur += 1;
    document.body.dataset.uiDense = "1";
    return () => {
      compteur = Math.max(0, compteur - 1);
      if (compteur === 0) delete document.body.dataset.uiDense;
    };
  }, [actif]);
}
