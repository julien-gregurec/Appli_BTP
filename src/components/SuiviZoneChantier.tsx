"use client";

import { useEffect, useRef, useState } from "react";
import { verifierZonePointageAction } from "@/app/actions/pointages";
import { PRODUCT_NAME } from "@/lib/brand";

export function SuiviZoneChantier({ sessionId, frequenceMinutes }: { sessionId: string; frequenceMinutes: number }) {
  const [dernierStatut, setDernierStatut] = useState<"dans_zone" | "hors_zone" | null>(null);
  const [suiviSuspendu, setSuiviSuspendu] = useState(false);
  const enCoursRef = useRef(false);

  useEffect(() => {
    let annule = false;
    let dernierEnvoi = Number(localStorage.getItem(`liria:gps:${sessionId}`) ?? 0);
    const frequenceMs = Math.max(1, frequenceMinutes) * 60 * 1000;
    let verrou: { release: () => Promise<void> } | null = null;

    const enregistrer = (position: GeolocationPosition, forcer = false) => {
      const maintenant = Date.now();
      if (enCoursRef.current || (!forcer && maintenant - dernierEnvoi < frequenceMs)) return;
      enCoursRef.current = true;
      verifierZonePointageAction(
        sessionId,
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy ?? null,
      )
        .then((resultat) => {
          if (annule) return;
          if (resultat.ok) {
            dernierEnvoi = maintenant;
            localStorage.setItem(`liria:gps:${sessionId}`, String(maintenant));
            if (resultat.dansZone !== null) {
              setDernierStatut(resultat.dansZone ? "dans_zone" : "hors_zone");
            }
          }
        })
        .finally(() => {
          enCoursRef.current = false;
        });
    };

    const releverMaintenant = (forcer = false) => {
      if (!navigator.geolocation) {
        setSuiviSuspendu(true);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setSuiviSuspendu(false);
          enregistrer(position, forcer);
        },
        () => setSuiviSuspendu(true),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
      );
    };

    const surveillanceId = navigator.geolocation?.watchPosition(
      (position) => {
        setSuiviSuspendu(false);
        enregistrer(position);
      },
      () => setSuiviSuspendu(true),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 60_000 },
    );

    const reprendre = () => {
      if (document.visibilityState === "visible") releverMaintenant();
    };

    const demanderVerrouEcran = async () => {
      const navigateur = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      try {
        verrou = await navigateur.wakeLock?.request("screen") ?? null;
      } catch {
        verrou = null;
      }
    };

    releverMaintenant(true);
    void demanderVerrouEcran();
    document.addEventListener("visibilitychange", reprendre);
    const intervalle = window.setInterval(() => releverMaintenant(), frequenceMs);

    return () => {
      annule = true;
      window.clearInterval(intervalle);
      document.removeEventListener("visibilitychange", reprendre);
      if (surveillanceId !== undefined) navigator.geolocation.clearWatch(surveillanceId);
      void verrou?.release();
    };
  }, [sessionId, frequenceMinutes]);

  return (
    <p className={`rounded-md border px-3 py-2 text-xs ${dernierStatut === "hors_zone" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
      📍 Suivi de zone actif — votre position est vérifiée toutes les {frequenceMinutes} minutes pendant que vous êtes pointé.
      {dernierStatut === "hors_zone" && " Vous semblez hors de la zone du chantier."}
      {suiviSuspendu && " Autorisez la localisation précise pour poursuivre le suivi."}
      {` Gardez ${PRODUCT_NAME} ouverte en arrière-plan : le téléphone peut suspendre le suivi si l’application est fermée ou forcée à quitter.`}
    </p>
  );
}
