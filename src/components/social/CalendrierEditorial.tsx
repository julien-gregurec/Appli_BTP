"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deplacerCalendrierAction } from "@/app/actions/social";
import { statutPublication } from "@/lib/social/types";
import { deplacementCalendrier } from "@/lib/social/workflow";

export type EvenementCalendrier = { id: string; titre: string; statut: string; date: string; reseaux: string[] };
type Vue = "jour" | "semaine" | "mois";

const JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const cleJour = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function debutSemaine(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

function joursAffiches(vue: Vue, ref: Date): Date[] {
  if (vue === "jour") return [new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())];
  if (vue === "semaine") return Array.from({ length: 7 }, (_, i) => new Date(debutSemaine(ref).getTime() + i * 86400_000));
  const premier = debutSemaine(new Date(ref.getFullYear(), ref.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => new Date(premier.getFullYear(), premier.getMonth(), premier.getDate() + i));
}

export function CalendrierEditorial({ evenements, vue, reference, peutPlanifier, peutDeplacerValide }: { evenements: EvenementCalendrier[]; vue: Vue; reference: string; peutPlanifier: boolean; peutDeplacerValide: boolean }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const ref = new Date(`${reference}T12:00:00`);
  const jours = joursAffiches(vue, ref);
  const parJour = new Map<string, EvenementCalendrier[]>();
  for (const e of evenements) {
    const k = cleJour(new Date(e.date));
    parJour.set(k, [...(parJour.get(k) ?? []), e]);
  }

  const decaler = (sens: number) => {
    const d = new Date(ref);
    if (vue === "jour") d.setDate(d.getDate() + sens);
    else if (vue === "semaine") d.setDate(d.getDate() + 7 * sens);
    else d.setMonth(d.getMonth() + sens);
    return `/plateforme/social/calendrier?vue=${vue}&date=${cleJour(d)}`;
  };

  const deplacable = (statut: string) => {
    const regle = deplacementCalendrier(statut as Parameters<typeof deplacementCalendrier>[0]);
    return peutPlanifier && (regle === "libre" || (regle === "validateur" && peutDeplacerValide));
  };

  function deposer(id: string, jour: Date) {
    const e = evenements.find((x) => x.id === id);
    if (!e) return;
    const ancienne = new Date(e.date);
    // On conserve l'heure d'origine, on change le jour.
    const nouvelle = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(), ancienne.getHours(), ancienne.getMinutes());
    if (cleJour(nouvelle) === cleJour(ancienne)) return;
    if (e.statut === "programme" && !window.confirm(`Reprogrammer « ${e.titre} » au ${nouvelle.toLocaleString("fr-FR")} ?`)) return;
    setErreur(null);
    demarrer(async () => {
      const r = await deplacerCalendrierAction(id, nouvelle.toISOString());
      if (!r.ok) setErreur(r.erreur);
      router.refresh();
    });
  }

  const titrePeriode =
    vue === "mois"
      ? ref.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
      : vue === "semaine"
        ? `Semaine du ${jours[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
        : ref.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={decaler(-1)} className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700" aria-label="Période précédente">←</Link>
          <h2 className="min-w-48 text-center font-semibold capitalize">{titrePeriode}</h2>
          <Link href={decaler(1)} className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700" aria-label="Période suivante">→</Link>
          <Link href={`/plateforme/social/calendrier?vue=${vue}&date=${cleJour(new Date())}`} className="text-sm underline">Aujourd’hui</Link>
        </div>
        <div className="flex gap-1" role="group" aria-label="Vue">
          {(["jour", "semaine", "mois"] as const).map((v) => (
            <Link key={v} href={`/plateforme/social/calendrier?vue=${v}&date=${reference}`} aria-current={vue === v ? "page" : undefined} className={`rounded-md px-3 py-1 text-sm capitalize ${vue === v ? "bg-[#0d1b2a] text-white dark:bg-[#c9a24a] dark:text-[#0d1b2a]" : "border border-neutral-300 dark:border-neutral-700"}`}>
              {v}
            </Link>
          ))}
        </div>
      </div>
      {erreur && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{erreur}</p>}
      {enCours && <p className="text-xs text-neutral-500">Enregistrement…</p>}
      <div className={`grid gap-px overflow-hidden rounded-md border border-neutral-200 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800 ${vue === "jour" ? "grid-cols-1" : "grid-cols-7"}`}>
        {vue !== "jour" && JOURS.map((j) => <div key={j} className="bg-neutral-50 px-2 py-1 text-xs font-semibold uppercase text-neutral-500 dark:bg-neutral-900">{j}</div>)}
        {jours.map((jour) => {
          const k = cleJour(jour);
          const horsMois = vue === "mois" && jour.getMonth() !== ref.getMonth();
          return (
            <div
              key={k}
              onDragOver={(e) => peutPlanifier && e.preventDefault()}
              onDrop={(e) => deposer(e.dataTransfer.getData("text/plain"), jour)}
              className={`min-h-24 space-y-1 bg-white p-1 dark:bg-neutral-950 ${horsMois ? "opacity-50" : ""} ${vue !== "mois" ? "min-h-64" : ""}`}
            >
              <p className={`text-xs tabular-nums ${k === cleJour(new Date()) ? "font-bold text-[#c9a24a]" : "text-neutral-500"}`}>{jour.getDate()}</p>
              {(parJour.get(k) ?? []).sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
                const s = statutPublication(e.statut);
                const peutGlisser = deplacable(e.statut);
                return (
                  <Link
                    key={e.id}
                    href={`/plateforme/social/publication?id=${e.id}`}
                    draggable={peutGlisser}
                    onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.id)}
                    title={`${s.libelle} — ${e.titre}${peutGlisser ? " (glisser pour déplacer)" : ""}`}
                    className="block truncate rounded px-1.5 py-0.5 text-xs text-white"
                    style={{ backgroundColor: s.couleur, cursor: peutGlisser ? "grab" : "pointer" }}
                  >
                    {new Date(e.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} {e.titre}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
