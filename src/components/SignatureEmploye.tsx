"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { enregistrerSignatureEmployeAction, supprimerSignatureEmployeAction } from "@/app/actions/employes";

/**
 * Capture d'une signature dessinée (souris ou tactile) pour un employé.
 * Le tracé est exporté en PNG puis envoyé au serveur, qui le range dans le
 * bucket privé de l'entreprise. Réutilisable ailleurs en changeant l'action.
 */
export function SignatureEmploye({ employeId, aDejaSignature }: { employeId: string; aDejaSignature: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dessine = useRef(false);
  const vide = useRef(true);
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "err"; texte: string } | null>(null);
  const [remplacer, setRemplacer] = useState(!aDejaSignature);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    // Résolution physique nette (écrans haute densité).
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0d1b2a";
  }, [remplacer]);

  const position = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const debut = (e: React.PointerEvent) => {
    e.preventDefault();
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    dessine.current = true; vide.current = false;
    const { x, y } = position(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const trace = (e: React.PointerEvent) => {
    if (!dessine.current) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = position(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const fin = () => { dessine.current = false; };

  const effacer = () => {
    const c = canvas.current, ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    vide.current = true; setMessage(null);
  };

  const enregistrer = () => {
    if (vide.current) { setMessage({ type: "err", texte: "Dessinez la signature avant d'enregistrer." }); return; }
    const dataUrl = canvas.current!.toDataURL("image/png");
    demarrer(async () => {
      const r = await enregistrerSignatureEmployeAction(employeId, dataUrl);
      if (!r.ok) { setMessage({ type: "err", texte: r.erreur }); return; }
      setMessage({ type: "ok", texte: "Signature enregistrée." });
      setRemplacer(false);
    });
  };

  const supprimer = () => demarrer(async () => {
    await supprimerSignatureEmployeAction(employeId);
    setRemplacer(true); setMessage(null);
  });

  return (
    <div className="space-y-3">
      {aDejaSignature && !remplacer ? (
        <div className="space-y-2">
          <img src={`/api/employes/${employeId}/signature`} alt="Signature de l'employé"
            className="h-24 rounded border border-neutral-200 bg-white p-1 dark:border-neutral-800" />
          <div className="flex gap-2">
            <button onClick={() => setRemplacer(true)} className="rounded border px-3 py-1.5 text-sm">Remplacer</button>
            <button onClick={supprimer} disabled={enCours} className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700">Supprimer</button>
          </div>
        </div>
      ) : (
        <>
          <canvas ref={canvas}
            onPointerDown={debut} onPointerMove={trace} onPointerUp={fin} onPointerLeave={fin}
            className="h-36 w-full max-w-md touch-none rounded-md border border-dashed border-neutral-400 bg-white dark:bg-white"
            style={{ touchAction: "none" }} />
          <div className="flex flex-wrap gap-2">
            <button onClick={enregistrer} disabled={enCours} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {enCours ? "Enregistrement…" : "Enregistrer la signature"}
            </button>
            <button onClick={effacer} className="rounded-md border px-4 py-2 text-sm">Effacer</button>
            {aDejaSignature && <button onClick={() => setRemplacer(false)} className="rounded-md px-4 py-2 text-sm text-neutral-500">Annuler</button>}
          </div>
        </>
      )}
      {message && <p className={`text-sm ${message.type === "ok" ? "text-green-700" : "text-red-700"}`}>{message.texte}</p>}
    </div>
  );
}
