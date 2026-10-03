"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajouterIdeesAction, genererCalendrierAction, proposerSujetsAction } from "@/app/actions/social";
import { libelleApplication, LIBELLE_RESEAU, type Reseau } from "@/lib/social/types";

type Idee = { titre: string; angle: string; application: string; reseaux: Reseau[]; date: string | null };
const champ = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

// Assistant Social ELSATIA : propose des sujets et un calendrier. Les propositions
// ne deviennent que des « idées » après sélection humaine.
export function AssistantSocial() {
  const router = useRouter();
  const [consigne, setConsigne] = useState("");
  const [debut, setDebut] = useState(() => new Date().toISOString().slice(0, 10));
  const [semaines, setSemaines] = useState(4);
  const [parSemaine, setParSemaine] = useState(3);
  const [idees, setIdees] = useState<Idee[]>([]);
  const [choisies, setChoisies] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const recevoir = (liste: Idee[]) => {
    setIdees(liste);
    setChoisies(new Set(liste.map((_, i) => i)));
    setMessage(liste.length ? null : { ok: false, texte: "Aucune proposition." });
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium">Consigne (facultatif)</span>
        <textarea className={champ} value={consigne} onChange={(e) => setConsigne(e.target.value)} placeholder="Ex. : mettre en avant ELSATIA Réserves auprès des conducteurs de travaux" maxLength={1000} />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" disabled={enCours} onClick={() => demarrer(async () => { const r = await proposerSujetsAction(consigne); if (r.ok) recevoir(r.donnees!.map((s) => ({ ...s, date: null }))); else setMessage({ ok: false, texte: r.erreur }); })} className="rounded-md bg-[#c9a24a] px-3 py-2 text-sm font-semibold text-[#0d1b2a] disabled:opacity-50">
          ✦ Proposer des sujets
        </button>
        <span className="text-sm text-neutral-500">ou</span>
        <label className="text-sm">Début<input type="date" className={champ} value={debut} onChange={(e) => setDebut(e.target.value)} /></label>
        <label className="text-sm">Semaines<input type="number" min={1} max={8} className={`${champ} w-20`} value={semaines} onChange={(e) => setSemaines(Number(e.target.value))} /></label>
        <label className="text-sm">Par semaine<input type="number" min={1} max={7} className={`${champ} w-20`} value={parSemaine} onChange={(e) => setParSemaine(Number(e.target.value))} /></label>
        <button type="button" disabled={enCours} onClick={() => demarrer(async () => { const r = await genererCalendrierAction(debut, semaines, parSemaine, consigne); if (r.ok) recevoir(r.donnees!); else setMessage({ ok: false, texte: r.erreur }); })} className="rounded-md bg-[#c9a24a] px-3 py-2 text-sm font-semibold text-[#0d1b2a] disabled:opacity-50">
          ✦ Générer un calendrier éditorial
        </button>
      </div>
      {enCours && <p className="text-sm text-neutral-500">L’Assistant Social réfléchit…</p>}
      {idees.length > 0 && (
        <section className="space-y-2">
          <ul className="space-y-2">
            {idees.map((i, n) => (
              <li key={n} className="flex gap-2 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <input type="checkbox" aria-label={`Retenir « ${i.titre} »`} checked={choisies.has(n)} onChange={(e) => { const s = new Set(choisies); if (e.target.checked) s.add(n); else s.delete(n); setChoisies(s); }} />
                <div>
                  <p className="font-medium">{i.titre}</p>
                  <p className="text-neutral-600 dark:text-neutral-400">{i.angle}</p>
                  <p className="text-xs text-neutral-500">{libelleApplication(i.application)} · {i.reseaux.map((r) => LIBELLE_RESEAU[r]).join(", ")}{i.date ? ` · ${new Date(i.date).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" disabled={enCours || choisies.size === 0} onClick={() => demarrer(async () => { const r = await ajouterIdeesAction(idees.filter((_, n) => choisies.has(n))); setMessage(r.ok ? { ok: true, texte: r.message ?? "Ajouté." } : { ok: false, texte: r.erreur }); if (r.ok) { setIdees([]); router.refresh(); } })} className="rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#c9a24a] dark:text-[#0d1b2a]">
            Ajouter {choisies.size} idée(s) au calendrier
          </button>
        </section>
      )}
      {message && <p role="status" className={`text-sm ${message.ok ? "text-green-700" : "text-red-700"}`}>{message.texte}</p>}
    </div>
  );
}
