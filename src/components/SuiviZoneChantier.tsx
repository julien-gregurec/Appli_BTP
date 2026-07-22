"use client";

import { useEffect, useRef, useState } from "react";
import { verifierZonePointageAction } from "@/app/actions/pointages";

// Bandeau transparent : le salarié voit que sa position est vérifiée périodiquement
// pendant qu'il est pointé (jamais avant l'arrivée ni après le départ, jamais en tâche
// cachée). Ne fonctionne que tant que cette page reste ouverte — pas de suivi en tâche
// de fond une fois l'application fermée.
export function SuiviZoneChantier({ sessionId, frequenceMinutes }: { sessionId: string; frequenceMinutes: number }) {
  const [dernierStatut, setDernierStatut] = useState<"dans_zone" | "hors_zone" | null>(null);
  const enCoursRef = useRef(false);

  useEffect(() => {
    let annule = false;
    const verifier = () => {
      if (enCoursRef.current || !navigator.geolocation) return;
      enCoursRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          verifierZonePointageAction(sessionId, position.coords.latitude, position.coords.longitude, position.coords.accuracy ?? null)
            .then((resultat) => {
              if (annule) return;
              if (resultat.ok && resultat.dansZone !== null) setDernierStatut(resultat.dansZone ? "dans_zone" : "hors_zone");
            })
            .finally(() => { enCoursRef.current = false; });
        },
        () => { enCoursRef.current = false; },
        { enableHighAccuracy: true, timeout: 15000 },
      );
    };
    verifier();
    const intervalle = setInterval(verifier, frequenceMinutes * 60 * 1000);
    return () => { annule = true; clearInterval(intervalle); };
  }, [sessionId, frequenceMinutes]);

  return (
    <p className={`rounded-md border px-3 py-2 text-xs ${dernierStatut === "hors_zone" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
      📍 Suivi de zone actif — votre position est vérifiée toutes les {frequenceMinutes} minutes pendant que vous êtes pointé.
      {dernierStatut === "hors_zone" && " Vous semblez hors de la zone du chantier."}
    </p>
  );
}
