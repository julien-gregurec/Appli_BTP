"use client";

import { useState } from "react";
import { enregistrerArriveeAction, enregistrerDepartAction } from "@/app/actions/pointages";

type Option = { id: string; nom: string };
type Session = { id: string; arrivee_at: string; tache: string | null; employe: Option | null; chantier: Option | null };
const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

function Preuve({ prefix = "" }: { prefix?: string }) {
  const [position, setPosition] = useState<{ lat: number; lng: number; precision: number } | null>(null);
  const [erreur, setErreur] = useState("");
  const [charge, setCharge] = useState(false);
  const localiser = () => {
    setCharge(true); setErreur("");
    if (!navigator.geolocation) { setErreur("Géolocalisation indisponible"); setCharge(false); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }); setCharge(false); },
      (e) => { setErreur(e.message || "Localisation impossible"); setCharge(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  return <div className="grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="latitude" value={position?.lat ?? ""} /><input type="hidden" name="longitude" value={position?.lng ?? ""} /><input type="hidden" name="precision_metres" value={position?.precision ?? ""} />
    <div className="rounded-md border border-dashed p-3"><button type="button" onClick={localiser} disabled={charge} className="rounded-md border px-3 py-2 text-sm">{charge ? "Localisation…" : position ? "Actualiser le GPS" : `GPS ${prefix}`}</button>{position && <p className="mt-2 text-xs text-green-700">Position prête · ± {Math.round(position.precision)} m</p>}{erreur && <p className="mt-2 text-xs text-red-600">{erreur}</p>}</div>
    <label className="rounded-md border border-dashed p-3 text-xs text-neutral-500">Photo {prefix} *<input name="photo" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" required className="mt-2 block w-full text-sm" /></label>
    <input type="hidden" name="preuve_ok" value={position ? "1" : ""} />
  </div>;
}

export function PointageArriveeDepart({ employes, chantiers, sessions }: { employes: Option[]; chantiers: Option[]; sessions: Session[] }) {
  return <section className="space-y-4 rounded-lg border-2 border-[#c9a24a]/60 bg-[#c9a24a]/5 p-5">
    <div><h2 className="text-lg font-semibold">Arrivée / départ chantier</h2><p className="text-sm text-neutral-600">Les heures sont calculées automatiquement entre les deux pointages, déduction faite de la pause.</p></div>
    <form action={enregistrerArriveeAction} className="space-y-3 rounded-md bg-white p-4 shadow-sm dark:bg-neutral-950">
      <h3 className="font-semibold text-green-800">Enregistrer une arrivée</h3>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-neutral-500">Employé<select name="employe_id" required className={input}>{employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></label><label className="text-xs text-neutral-500">Chantier<select name="chantier_id" required className={input}>{chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></label><label className="text-xs text-neutral-500">Tâche prévue<input name="tache" required placeholder="Pose de cloisons…" className={input} /></label><label className="text-xs text-neutral-500">Commentaire<input name="commentaire" className={input} /></label></div>
      <Preuve prefix="d’arrivée" /><button className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white">Je suis arrivé sur le chantier</button>
    </form>
    <div className="grid gap-3">{sessions.map((session) => <form key={session.id} action={enregistrerDepartAction.bind(null, session.id)} className="space-y-3 rounded-md border border-blue-200 bg-white p-4 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-blue-800">Départ à enregistrer — {session.employe?.nom}</h3><p className="text-sm text-neutral-500">{session.chantier?.nom} · arrivée {new Date(session.arrivee_at).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}{session.tache ? ` · ${session.tache}` : ""}</p></div><label className="text-xs text-neutral-500">Pause (minutes)<input name="pause_minutes" type="number" min="0" max="1440" step="5" defaultValue="45" className="ml-2 w-24 rounded border px-2 py-1" /></label></div>
      <Preuve prefix="de départ" /><button className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white">Je quitte le chantier</button>
    </form>)}{!sessions.length && <p className="rounded-md border border-dashed p-4 text-sm text-neutral-500">Aucune arrivée ouverte. Un bouton de départ apparaîtra ici après le pointage d’arrivée.</p>}</div>
  </section>;
}
