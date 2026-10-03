"use client";

import { useEffect } from "react";

// Empêche la double soumission d'un formulaire pendant qu'une action serveur est
// en cours. La recette métier a créé deux clients sur deux clics espacés d'une
// seconde avec un réseau lent : aucun des formulaires de l'application ne
// désactive son bouton pendant l'envoi. Les actions serveur passent par fetch
// avec l'en-tête « Next-Action » : tant qu'une requête lancée par un formulaire
// n'a pas répondu, une nouvelle soumission de ce même formulaire est ignorée.
// Les soumissions successives (borne stock, validations en série) restent libres
// dès que la réponse précédente est arrivée.
export function GardeDoubleSoumission() {
  useEffect(() => {
    const enCours = new WeakSet<HTMLFormElement>();
    let dernierFormulaire: HTMLFormElement | null = null;
    const fetchOriginal = window.fetch;
    const estActionServeur = (init?: RequestInit) => {
      const entetes = init?.headers;
      if (!entetes) return false;
      if (entetes instanceof Headers) return entetes.has("next-action");
      if (Array.isArray(entetes)) return entetes.some(([cle]) => cle.toLowerCase() === "next-action");
      return Object.keys(entetes).some((cle) => cle.toLowerCase() === "next-action");
    };
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const formulaire = estActionServeur(args[1]) ? dernierFormulaire : null;
      if (formulaire) enCours.add(formulaire);
      try {
        return await fetchOriginal(...args);
      } finally {
        if (formulaire) enCours.delete(formulaire);
      }
    };
    const surSoumission = (event: SubmitEvent) => {
      const formulaire = event.target instanceof HTMLFormElement ? event.target : null;
      if (!formulaire || formulaire.method.toLowerCase() === "get") return;
      if (enCours.has(formulaire)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      dernierFormulaire = formulaire;
    };
    document.addEventListener("submit", surSoumission, true);
    return () => {
      document.removeEventListener("submit", surSoumission, true);
      window.fetch = fetchOriginal;
    };
  }, []);
  return null;
}
