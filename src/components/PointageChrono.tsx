"use client";

import { useEffect, useState } from "react";

const deux = (n: number) => String(n).padStart(2, "0");
const hms = (ms: number) => `${deux(Math.floor(ms / 3600000))}:${deux(Math.floor((ms % 3600000) / 60000))}:${deux(Math.floor((ms % 60000) / 1000))}`;

export function PointageChrono({ depuis }: { depuis: string | null }) {
  // `null` tant que le composant n'est pas monté côté client : Date.now() lu pendant le
  // rendu serveur et celui lu au tout premier rendu client tombent rarement à la même
  // seconde (temps réseau/parsing entre les deux), ce qui provoquait une erreur d'hydratation.
  // On affiche un placeholder identique serveur/client, corrigé dès le montage.
  const [maintenant, setMaintenant] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!depuis) {
    const date = new Date(maintenant ?? 0);
    return <div className="text-center"><p className="font-mono text-4xl font-semibold tabular-nums">{maintenant === null ? "--:--:--" : `${deux(date.getHours())}:${deux(date.getMinutes())}:${deux(date.getSeconds())}`}</p><p className="text-xs text-neutral-500">Heure actuelle</p></div>;
  }
  const ecoule = maintenant === null ? null : Math.max(0, maintenant - new Date(depuis).getTime());
  return <div className="text-center"><p className="font-mono text-4xl font-semibold tabular-nums">{ecoule === null ? "--:--:--" : hms(ecoule)}</p><p className="text-xs text-neutral-500">Temps écoulé depuis l’arrivée</p></div>;
}
