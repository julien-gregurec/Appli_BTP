"use client";

import { useState } from "react";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function LocaliserGPSButton({
  latitudeDefaut,
  longitudeDefaut,
  rayonDefaut = 300,
}: {
  latitudeDefaut?: number | null;
  longitudeDefaut?: number | null;
  rayonDefaut?: number;
}) {
  const [latitude, setLatitude] = useState<number | null>(latitudeDefaut ?? null);
  const [longitude, setLongitude] = useState<number | null>(longitudeDefaut ?? null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const localiser = () => {
    if (!navigator.geolocation) {
      setErreur("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setEnCours(false);
      },
      () => {
        setErreur("Position refusée ou indisponible. Autorisez la géolocalisation puis réessayez.");
        setEnCours(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button type="button" onClick={localiser} disabled={enCours} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700">
          {enCours ? "Localisation…" : "📍 Utiliser ma position actuelle"}
        </button>
        {latitude !== null && longitude !== null && <span className="text-xs text-neutral-500">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>}
      </div>
      {erreur && <p className="text-xs text-red-600">{erreur}</p>}
      <input type="hidden" name="latitude" value={latitude ?? ""} />
      <input type="hidden" name="longitude" value={longitude ?? ""} />
      <label className="block text-xs text-neutral-500">Rayon autorisé autour de ce point
        <input name="rayon_metres" type="number" min="10" max="5000" step="10" defaultValue={rayonDefaut} className={`${input} mt-1 max-w-xs`} />
      </label>
    </div>
  );
}
