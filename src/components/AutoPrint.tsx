"use client";

import { useEffect } from "react";

// Ouvre automatiquement la boîte d'impression du navigateur au chargement de la page
// (l'utilisateur choisit alors « Enregistrer au format PDF »).
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
