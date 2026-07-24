"use client";

import { useEffect, useState } from "react";

const deux = (n: number) => String(n).padStart(2, "0");
const hms = (ms: number) => `${deux(Math.floor(ms / 3600000))}:${deux(Math.floor((ms % 3600000) / 60000))}:${deux(Math.floor((ms % 60000) / 1000))}`;

export function PointageChrono({ depuis }: { depuis: string | null }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!depuis) {
    const date = new Date(maintenant);
    return <div className="text-center"><p className="font-mono text-4xl font-semibold tabular-nums">{deux(date.getHours())}:{deux(date.getMinutes())}:{deux(date.getSeconds())}</p><p className="text-xs text-neutral-500">Heure actuelle</p></div>;
  }
  return <div className="text-center"><p className="font-mono text-4xl font-semibold tabular-nums">{hms(Math.max(0, maintenant - new Date(depuis).getTime()))}</p><p className="text-xs text-neutral-500">Temps écoulé depuis l’arrivée</p></div>;
}
